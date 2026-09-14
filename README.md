# Recherche SIRENE

Recherche d'entreprises françaises par activité et zone géographique, avec export CSV / Excel / JSON.  
Données INSEE SIRENE — open data Etalab.

**Production** : https://sirene.tkoidra.com

---

## Prérequis

- Node.js ≥ 18
- [Vercel CLI](https://vercel.com/docs/cli) : `npm i -g vercel`
- Un projet [Supabase](https://supabase.com) avec les tables `searches` et `exports_log` (voir **Base de données**)
- Une clé API [Anthropic](https://console.anthropic.com/settings/keys)

---

## Setup local

```bash
git clone https://github.com/sebastiendonne-mig/sirene-app.git
cd sirene-app
npm install
cp .env.example .env.local   # puis remplir les valeurs
vercel link                   # lier au projet Vercel (première fois)
```

Lancer le dev (frontend Vite + API Vercel en parallèle) :

```bash
bash dev-api.sh        # démarre vercel dev --listen 3001 avec auto-restart
npm run dev            # dans un second terminal — démarre Vite sur :5173
```

Le frontend proxie automatiquement `/api/*` vers `localhost:3001` (configuré dans `vite.config.js`).

---

## Variables d'environnement

Copier `.env.example` en `.env.local` et renseigner :

| Variable | Où la trouver | Utilisée dans |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `api/naf.js`, `api/search.js` |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | `api/rate-limit.js`, `api/export.js`, `api/export-quota.js` |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` | `api/rate-limit.js`, `api/export.js`, `api/export-quota.js` |
| `VITE_SUPABASE_URL` | Même URL + `/rest/v1/` à la fin | `api/log.js` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon public` | `api/log.js` |

Sur Vercel, déclarer ces variables dans **Settings → Environment Variables** et redéployer.

---

## Base de données (Supabase)

Deux tables à créer via le SQL Editor :

```sql
-- Logs de recherche + rate limiting /api/naf et /api/search
CREATE TABLE searches (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip          text,
  endpoint    text,                  -- 'api/naf' | 'api/search' | null (anciens logs)
  query       text,
  params      jsonb,
  results_count integer,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX searches_rl_idx ON searches (ip, endpoint, created_at DESC);

-- Quota export (2 par jour par IP)
CREATE TABLE exports_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip            text NOT NULL,
  format        text NOT NULL,      -- 'csv' | 'excel' | 'json'
  results_count integer,
  created_at    timestamptz DEFAULT now()
);
```

---

## Flux de données

```
Utilisateur saisit une activité (ex. "plombier")
  │
  ▼
POST /api/naf  ──► Claude Haiku ──► codes NAF (ex. 43.22A, 43.22B)
  │
  ▼
Utilisateur sélectionne les codes NAF + une zone géo + un statut
  │
  ▼
POST /api/search
  ├── resolveGeo() : regex dept/CP → direct | sinon Claude Haiku → params SIRENE
  └── searchSirene() → API recherche-entreprises.api.gouv.fr → { results, total }
  │
  ▼
Affichage paginé (10/page, "Voir plus" renvoie params déjà résolus)
  │
  ▼
POST /api/export  (quota 2/jour/IP)
  └── fetchAllSirene() → toutes les pages (max 500) → CSV | Excel | JSON
```

---

## Architecture

```
api/                        Vercel Serverless Functions (ES modules)
  naf.js                    Activité → codes NAF via Claude
  search.js                 Recherche SIRENE paginée
  export.js                 Export complet CSV/Excel/JSON
  export-quota.js           Quota restant du jour
  rate-limit.js             Comptage requêtes IP/endpoint (Supabase)
  log.js                    Log anonyme des recherches
  naf-codes.json            730 codes NAF rév.2 (injectés dans le prompt)

src/lib/
  llmClient.js              callHaiku() + withTimeout() — client Haiku isolé
  inseeClient.js            searchSirene() + fetchAllSirene() — client INSEE

src/types/
  sireneSchemas.js          Schémas Zod (nafLlmResponseSchema, geoLlmResponseSchema)

prompts/
  sirenePrompts.js          Tous les prompts LLM centralisés

src/
  App.jsx                   Application React (wizard 5 étapes)
  App.css                   Styles

tests/
  runEvals.js               Runner d'évaluation (node tests/runEvals.js)
  fixtures/sirene_evals.json  Cas de test : schémas NAF/géo, handlers, retry 502-504
```

**Règles clés** (voir `CLAUDE.md` pour le détail) :
- `temperature: 0` sur tous les appels LLM
- Timeout 10s sur chaque requête externe
- Les prompts ne vivent que dans `prompts/sirenePrompts.js`
- Les codes NAF sont transmis avec leur point (`43.22A`, jamais `4322A`)

---

## Déploiement

```bash
npx vercel --prod
```

Vercel détecte automatiquement Vite. Les fonctions `api/*.js` sont déployées comme Serverless Functions avec un timeout de 60s (`api/export.js` en a besoin pour paginer jusqu'à 500 résultats).

---

## Limites de l'API

| Endpoint | Limite | Fenêtre |
|---|---|---|
| `POST /api/naf` | 30 req/IP | 60 min |
| `POST /api/search` | 50 req/IP | 60 min |
| `POST /api/export` | 2 exports/IP | Jour calendaire UTC |
