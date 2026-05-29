# Guidelines du projet SIRENE

## Stack
React 19 + Vite 5 (frontend) / Vercel Serverless Functions ES modules (backend)  
Claude Haiku `claude-haiku-4-5-20251001` / Supabase / API SIRENE INSEE  
Domaine : sirene.tkoidra.com

---

## 1. Architecture & Isolation IA

### Prompts
Tous les prompts LLM doivent être centralisés dans `prompts/sirenePrompts.js`, **hors logique métier**.  
Aujourd'hui ils sont hardcodés dans `api/naf.js` (résolution NAF) et `api/search.js` (résolution géo) — toute modification de prompt passe par ce fichier unique.

### Clients isolés (cible)
- `src/lib/llmClient.js` — wrappeur Haiku (fetch vers `api.anthropic.com/v1/messages`). La logique de retry/timeout ne doit pas être dupliquée entre `api/naf.js` et `api/search.js`.
- `src/lib/inseeClient.js` — client SIRENE (`recherche-entreprises.api.gouv.fr/search`). La pagination est dupliquée entre `api/search.js` (`fetchSirene`) et `api/export.js` (`fetchAllPages`) — à unifier ici.

### Température LLM
`temperature: 0` **imposé** sur tous les appels d'extraction et de parsing (résolution NAF, résolution géo).  
Aucun appel Haiku ne doit omettre ce paramètre.

### Variables d'environnement
Aucune valeur en dur. Variables utilisées dans le projet :

| Variable | Utilisée dans | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/naf.js`, `api/search.js` | Clé API Anthropic |
| `SUPABASE_URL` | `api/rate-limit.js`, `api/export.js`, `api/export-quota.js` | URL projet Supabase |
| `SUPABASE_SERVICE_KEY` | `api/rate-limit.js`, `api/export.js`, `api/export-quota.js` | Clé service Supabase (bypass RLS) |
| `VITE_SUPABASE_ANON_KEY` | `api/log.js` | Clé anon Supabase (browser-safe) |

Le fichier `.env.example` doit refléter exactement cette liste à chaque ajout de variable.

---

## 2. Robustesse & Gestion des erreurs

### Try/catch
Tous les appels externes sont dans un `try/catch`. Conventions actuelles :
- `api/search.js` : handler global + `withTimeout()` sur SIRENE
- `api/naf.js` : try/catch sur l'appel Haiku
- `api/export.js` : try/catch sur la pagination SIRENE

### Timeout
**10s max** sur chaque requête externe. Actuellement :
- SIRENE : 4s via `withTimeout()` dans `api/search.js` — à aligner sur 10s
- Claude : **aucun timeout** dans `api/naf.js` ni `api/search.js` — à corriger en priorité

Utiliser le pattern `withTimeout(signal => fetch(url, { signal }), 10000, 'LABEL')` déjà présent dans `api/search.js`.

### Retry
Retry avec backoff exponentiel sur `429`, `502`, `503`, `504`.  
Actuellement implémenté sur SIRENE dans `fetchSirene()` (`api/search.js`) pour le 429 uniquement.  
Manque : retry sur Claude, retry sur les codes 502/503/504.

### Enrichissement non-bloquant
Tout appel LLM de résolution (géo, NAF) doit dégrader gracieusement :  
`catch → return { q: inputBrut }` (fallback texte libre), jamais de crash propagé.  
Ce pattern est déjà en place dans `resolveGeo()` de `api/search.js`.

### Validation des réponses LLM
Chaque `JSON.parse(raw)` sur une réponse Haiku doit être suivi d'une validation de structure.  
Cible : schémas Zod dans `src/types/sireneSchemas.js`.  
En attendant : vérifier au minimum la présence des champs attendus avant de les utiliser.

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

- `tests/fixtures/sirene_evals.json` — 10 cas de référence couvrant : résolution NAF, résolution géo, filtres statut, pagination
- `tests/runEvals.js` — script de régression exécutable par `node tests/runEvals.js`
- Les tests **ne consomment pas de quota API** : les appels Claude et SIRENE sont mockés par défaut
- Toute modification dans `prompts/sirenePrompts.js`, `api/naf.js` ou `api/search.js` doit passer les evals avant commit

---

## 5. Documentation

- `README.md` à jour à chaque évolution : prérequis, `npm install`, variables d'env, `npm run dev`, flux de données
- Commentaires dans le code = uniquement le **"Pourquoi"** : contrainte INSEE, workaround API, invariant non-évident
- Ne pas commenter le "Comment" — les noms de fonctions et variables suffisent (`resolveGeo`, `fetchAllPages`, `checkRateLimit`)

---

## 6. Conventions de code

- ES modules natifs (`import`/`export`) — pas de `require()` sauf pour JSON via `createRequire` (limitation Node ESM)
- Handlers Vercel : toujours commencer par les headers CORS + `OPTIONS` guard
- IP extraction : `req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress`
- Codes NAF transmis **avec point** (`43.22A`) — ne jamais les stripper avant de les envoyer à l'API SIRENE

---

## 7. Backlog

- **V2** : Export CSV payant (Stripe) — la table `exports_log` est déjà en place pour la facturation
