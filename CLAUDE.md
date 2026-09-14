# Guidelines du projet SIRENE

## Stack
React 19 + Vite 5 (frontend) / Vercel Serverless Functions ES modules (backend)  
Claude Haiku `claude-haiku-4-5-20251001` / Supabase / API SIRENE INSEE  
Domaine : sirene.tkoidra.com

---

## 1. Architecture & Isolation IA

### Prompts
Tous les prompts LLM sont centralisés dans `prompts/sirenePrompts.js`, hors logique métier.  
Toute modification de prompt passe par ce fichier unique.

### Clients isolés
- `src/lib/llmClient.js` — `callHaiku()` + `withTimeout()`. Retry exponentiel intégré. `withTimeout` est exporté pour usage dans `inseeClient.js`.
- `src/lib/inseeClient.js` — `searchSirene()` (page unique) + `fetchAllSirene()` (pagination export). Retry exponentiel intégré sur les deux fonctions.

### Validation des réponses LLM
Chaque sortie JSON de Haiku est validée via Zod avant utilisation :
- `nafLlmResponseSchema` — valide `{ codes: [{ code, label }] }`, pattern `/^\d{2}\.\d{2}[A-Z]$/`, 1–6 codes
- `geoLlmResponseSchema` — union des 5 formes SIRENE valides (`departement`, `code_postal`, `region`, `commune`, `q`)

Schémas dans `src/types/sireneSchemas.js`.

### Température LLM
`temperature: 0` imposé sur tous les appels d'extraction et de parsing.  
Aucun appel Haiku ne doit omettre ce paramètre.

### Variables d'environnement
Aucune valeur en dur. Variables utilisées dans le projet :

| Variable | Utilisée dans | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/naf.js`, `api/search.js` | Clé API Anthropic |
| `SUPABASE_URL` | `api/rate-limit.js`, `api/export.js`, `api/export-quota.js` | URL projet Supabase |
| `SUPABASE_SERVICE_KEY` | `api/rate-limit.js`, `api/export.js`, `api/export-quota.js` | Clé service Supabase (bypass RLS) |
| `VITE_SUPABASE_URL` | `api/log.js` | URL REST Supabase (doit finir par `/rest/v1/`) |
| `VITE_SUPABASE_ANON_KEY` | `api/log.js` | Clé anon Supabase (browser-safe) |

Le fichier `.env.example` reflète exactement cette liste.  
Note Vercel : `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` sont des variables Sensitive — elles ne peuvent pas être ajoutées en environnement Development via le dashboard Vercel. Couvertes par `.env.local` en local.

---

## 2. Robustesse & Gestion des erreurs

### Try/catch
Tous les appels externes sont dans un `try/catch`. Le catch dispatche sur les types d'erreur typés :
- `err.isTimeout` → 504
- `err.isSireneError` → 429 / 400 / 502 selon `err.status`
- `err.isApiError` → 502
- autres → 500

### Timeout
10s sur chaque requête externe via `withTimeout(signal => fetch(url, { signal }), 10000, 'LABEL')`.  
Implémenté dans `callHaiku()` et dans chaque appel SIRENE (`searchSirene`, `fetchAllSirene` page par page).

### Retry
Backoff exponentiel (1s, 2s) sur `429`, `502`, `503`, `504`, 2 tentatives max.  
Implémenté dans `callHaiku()`, `searchSirene()`, et par page dans `fetchAllSirene()`.

### Enrichissement non-bloquant
Les appels LLM de résolution (géo, NAF) dégradent gracieusement :  
`catch → return { q: inputBrut }` dans `resolveGeo()`, jamais de crash propagé.

---

## 3. Rate limiting & Quotas

Implémenté dans `api/rate-limit.js` via table Supabase `searches` (colonnes : `ip`, `endpoint`, `created_at`).

| Endpoint | Limite | Fenêtre |
|---|---|---|
| `POST /api/naf` | 30 req/IP | 60 min |
| `POST /api/search` | 50 req/IP | 60 min |
| `POST /api/export` | 2 exports/IP | Jour calendaire UTC |

Les exports sont tracés dans la table `exports_log` (colonnes : `ip`, `format`, `results_count`, `created_at`).  
Si Supabase est indisponible, `checkRateLimit()` retourne `{ allowed: true }` — fail open intentionnel.

---

## 4. Tests & Golden Dataset

- `tests/fixtures/sirene_evals.json` — 28 cas couvrant : schémas NAF, schémas géo, handler `/api/naf`, handler `/api/search`, retry 502/503/504
- `tests/runEvals.js` — runner sans dépendance externe, exécutable par `node tests/runEvals.js` (alias `npm test`)
- Les tests ne consomment pas de quota API : `global.fetch` est mocké, Supabase absent → fail-open
- Toute modification dans `prompts/sirenePrompts.js`, `api/naf.js`, `api/search.js`, `src/lib/llmClient.js` ou `src/lib/inseeClient.js` doit passer les evals avant déploiement

---

## 5. Documentation

- `README.md` à jour à chaque évolution : prérequis, `npm install`, variables d'env, `npm run dev`, flux de données
- Commentaires dans le code = uniquement le **"Pourquoi"** : contrainte INSEE, workaround API, invariant non-évident
- Ne pas commenter le "Comment" — les noms de fonctions et variables suffisent

---

## 6. Conventions de code

- ES modules natifs (`import`/`export`) — pas de `require()` sauf pour JSON via `createRequire` (limitation Node ESM)
- Handlers Vercel : toujours commencer par les headers CORS + `OPTIONS` guard
- IP extraction : `req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress`
- Codes NAF transmis **avec point** (`43.22A`) — ne jamais les stripper avant de les envoyer à l'API SIRENE

---

## 7. Backlog

- **V2** : Export payant via Stripe — la table `exports_log` est déjà en place pour la facturation
