# CLAUDE.md

## Projet

Avatar IA personnel pour Benjamin (Amarillo Search). Site web privé qui génère des vidéos avatar réalistes (corps entier, voix clonée multilingue) et les envoie dans Canva Pro pour la finition.

Repo : https://github.com/bengith-hub/avatar-IA

## Architecture

Deux apps distinctes dans un monorepo :

```
avatar-IA/
├── frontend/    → Next.js 14+ (App Router) déployé sur Vercel
├── worker/      → FastAPI (Python 3.11+) déployé sur VM GPU Vast.ai
├── assets/      → Photos référence + échantillon vocal (git-ignored, stockés sur VM)
├── docs/        → Documentation projet (SPEC.md = spécification complète)
└── CLAUDE.md    → Ce fichier
```

### Frontend (frontend/)

- **Framework** : Next.js 14+ avec App Router, TypeScript strict
- **Déploiement** : Vercel (plan gratuit)
- **Auth** : NextAuth.js avec CredentialsProvider (un seul utilisateur : Benjamin)
- **Styling** : Tailwind CSS
- **Composants UI** : shadcn/ui
- **État** : React hooks (useState, useEffect, useSWR pour le polling). Pas de state manager externe.

### Worker (worker/)

- **Framework** : FastAPI, Python 3.11+
- **Runtime** : VM GPU Vast.ai (Ubuntu 22.04, RTX 4090 ou A100)
- **IA** : HunyuanVideo-Avatar (animation) + FishAudio S1-mini (TTS/voice clone)
- **Post-prod** : ffmpeg (installé sur la VM)
- **Sécurité** : auth par Bearer token dans le header `Authorization`

## APIs externes intégrées

| Service | Utilisé côté | Clé env | Rôle |
|---------|-------------|---------|------|
| Vast.ai | frontend (API routes) | `VAST_API_KEY` | Start/stop VM, billing |
| Pexels | frontend (API routes) | `PEXELS_API_KEY` | Recherche décors (photos+vidéos) |
| Anthropic | frontend (API routes) | `ANTHROPIC_API_KEY` | Génération de scripts IA |
| Canva Connect | frontend (API routes) | `CANVA_*` | Upload clip → ouvrir dans Canva |
| Cloudflare R2 | frontend (API routes) | `R2_*` | Stockage vidéos (S3-compatible) |
| Worker GPU | frontend (API routes) | `GPU_WORKER_URL`, `GPU_WORKER_TOKEN` | Proxy vers la VM |

## Conventions de code

### TypeScript (frontend)

- TypeScript strict (`"strict": true` dans tsconfig)
- Imports absolus avec `@/` alias → `@/components/`, `@/lib/`, etc.
- Composants React : fonctions fléchées avec export default
- Nommage fichiers : `kebab-case.tsx` pour les pages, `PascalCase.tsx` pour les composants
- API routes dans `app/api/` — chaque route dans son propre dossier avec `route.ts`
- Pas de `"use client"` sauf nécessité (préférer les Server Components)
- Gestion d'erreurs : try/catch dans les API routes, retourner des `NextResponse.json()` avec status codes appropriés
- Pas de console.log en production — utiliser un logger si nécessaire

### Python (worker)

- Python 3.11+, type hints partout
- Formateur : black (ligne max 100)
- Linter : ruff
- Async FastAPI avec `async def` pour les endpoints
- Pydantic v2 pour la validation des requêtes/réponses
- Jobs asynchrones : les endpoints `/generate` retournent immédiatement un `job_id`, le traitement se fait en background (asyncio.create_task ou file de jobs)
- Logging : module `logging` standard, pas de print()
- Gestion d'erreurs : HTTPException avec codes/messages explicites

### Général

- Commits en anglais, messages conventionnels : `feat:`, `fix:`, `refactor:`, `docs:`
- Pas de secrets dans le code — tout en variables d'environnement
- `.env.local` pour le dev frontend (git-ignored)
- `.env` pour le worker (git-ignored, stocké sur la VM)

## Structure frontend détaillée

```
frontend/
├── app/
│   ├── layout.tsx              ← Root layout + providers (auth, theme)
│   ├── page.tsx                ← Dashboard GPU (start/stop, coûts, statut)
│   ├── generate/
│   │   └── page.tsx            ← Générateur de scènes
│   ├── gallery/
│   │   └── page.tsx            ← Galerie des vidéos générées
│   ├── avatars/
│   │   └── page.tsx            ← Gestion photos ref + voix
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── vast/
│       │   ├── start/route.ts      ← POST → démarre VM
│       │   ├── stop/route.ts       ← POST → arrête VM
│       │   └── status/route.ts     ← GET → statut + billing
│       ├── gpu/
│       │   ├── generate/route.ts   ← POST → lance génération
│       │   ├── status/route.ts     ← GET → statut job
│       │   ├── jobs/route.ts       ← GET → liste jobs
│       │   └── download/route.ts   ← GET → télécharge MP4
│       ├── pexels/
│       │   └── search/route.ts     ← GET → recherche décors
│       ├── ai/
│       │   └── script/route.ts     ← POST → génère script
│       └── canva/
│           └── upload/route.ts     ← POST → upload vers Canva
├── components/
│   ├── gpu-status-card.tsx
│   ├── scene-generator.tsx
│   ├── avatar-selector.tsx
│   ├── background-picker.tsx
│   ├── script-assistant.tsx
│   ├── canva-launcher.tsx
│   ├── video-player.tsx
│   └── export-options.tsx
└── lib/
    ├── vast-api.ts             ← Client Vast.ai REST
    ├── gpu-api.ts              ← Client Worker API
    ├── pexels-api.ts           ← Client Pexels
    ├── canva-api.ts            ← Client Canva Connect
    ├── anthropic-api.ts        ← Client Anthropic (scripts)
    ├── r2.ts                   ← Client Cloudflare R2
    └── auth.ts                 ← Config NextAuth
```

## Structure worker détaillée

```
worker/
├── main.py                 ← FastAPI app, endpoints, middleware auth
├── pipeline.py             ← Orchestration : TTS → Avatar → ffmpeg
├── tts.py                  ← Interface FishAudio S1 (texte → wav)
├── avatar.py               ← Interface HunyuanVideo-Avatar (photo+wav → mp4)
├── postprocess.py          ← ffmpeg : normalisation, format, compositing
├── models.py               ← Pydantic models (requests/responses)
├── config.py               ← Settings depuis env vars
├── jobs.py                 ← Gestion jobs (file, statuts, résultats)
├── requirements.txt
└── setup.sh                ← Script d'installation VM (one-shot)
```

## Worker API endpoints

```
GET  /health                    → { status, gpu_name, gpu_memory, uptime }
POST /generate                  → { job_id }
     body: { text, language, avatar_id, background_url?, emotion?, format? }
GET  /status/{job_id}           → { job_id, status, progress?, result_url?, error? }
GET  /jobs                      → [ { job_id, status, created_at, ... } ]
GET  /download/{job_id}         → MP4 file
GET  /avatars                   → [ { id, name, path, type } ]
POST /avatars                   → { id, name, path }
     body: multipart (file)
```

Tous les endpoints (sauf /health) requièrent `Authorization: Bearer <WORKER_TOKEN>`.

## Commandes de développement

### Frontend

```bash
cd frontend
npm install              # installer dépendances
npm run dev              # dev server (localhost:3000)
npm run build            # build production
npm run lint             # linter
npx tsc --noEmit         # type check
```

### Worker

```bash
cd worker
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload    # dev
black .                  # formater
ruff check .             # linter
```

### Déploiement

- **Frontend** : push sur `main` → Vercel déploie automatiquement
- **Worker** : SSH sur la VM → `git pull` → `systemctl restart avatar-worker`
  (ou script `setup.sh` pour première installation)

## Variables d'environnement

### frontend/.env.local

```
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
AUTH_USERNAME=benjamin
AUTH_PASSWORD_HASH=
VAST_API_KEY=
VAST_INSTANCE_ID=
GPU_WORKER_URL=
GPU_WORKER_TOKEN=
PEXELS_API_KEY=
ANTHROPIC_API_KEY=
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=
CANVA_ACCESS_TOKEN=
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=avatar-videos
```

### worker/.env

```
WORKER_TOKEN=
HUNYUAN_MODEL_PATH=/root/avatar-data/models/hunyuan
FISH_MODEL_PATH=/root/avatar-data/models/fish-audio
PHOTOS_PATH=/root/avatar-data/photos
VOICE_PATH=/root/avatar-data/voice
OUTPUT_PATH=/root/avatar-data/outputs
```

## Règles importantes

1. **Jamais de secrets dans le code.** Tout passe par les variables d'environnement.
2. **Le frontend ne contacte JAMAIS la VM directement.** Toujours via les API routes `/api/gpu/*` qui ajoutent le token d'auth.
3. **Le frontend ne contacte JAMAIS les APIs externes directement depuis le client.** Toujours via les API routes (pour protéger les clés API).
4. **Les jobs de génération sont asynchrones.** `/generate` retourne immédiatement un `job_id`. Le frontend poll `/status/{job_id}` toutes les 5 secondes.
5. **Les vidéos générées sont stockées sur R2** après génération, pas servies directement depuis la VM.
6. **Auth obligatoire** sur toutes les pages et API routes (sauf la page de login).
7. **Le worker doit démarrer même si les modèles IA ne sont pas chargés** — `/health` indique l'état de chargement. Les modèles se chargent au premier appel ou au démarrage.
8. **Gestion d'erreurs explicite partout.** Pas de fail silencieux. Le frontend affiche les erreurs clairement.

## Priorité d'implémentation (Phase 1 — MVP)

Ordre strict de construction :

1. `frontend/` : scaffold Next.js + auth + layout avec navigation
2. `frontend/app/api/vast/` : routes start/stop/status
3. `frontend/app/page.tsx` : Dashboard GPU fonctionnel
4. `worker/main.py` + `worker/models.py` + `worker/config.py` : FastAPI scaffold + auth middleware
5. `worker/tts.py` : intégration FishAudio S1
6. `worker/avatar.py` : intégration HunyuanVideo-Avatar
7. `worker/pipeline.py` : chaîne complète texte → MP4
8. `frontend/app/api/gpu/` : routes proxy vers worker
9. `frontend/app/generate/page.tsx` : interface de génération
10. `frontend/app/gallery/page.tsx` : galerie basique
11. Test end-to-end : texte → clip MP4 téléchargeable

## Contexte technique supplémentaire

- **Vast.ai API** : REST, auth par Bearer token, docs : https://docs.vast.ai/api
  - Start : `PUT /api/v0/instances/{id}/` body `{"state":"running"}`
  - Stop : `PUT /api/v0/instances/{id}/` body `{"state":"stopped"}`
  - Base URL : `https://console.vast.ai`
- **Pexels API** : REST, auth par header `Authorization: <KEY>`, 200 req/h
  - Vidéos : `GET https://api.pexels.com/videos/search?query=xxx`
  - Photos : `GET https://api.pexels.com/v1/search?query=xxx`
- **Canva Connect API** : REST + OAuth, docs : https://www.canva.dev/docs/connect/
  - Upload asset : POST avec fichier vidéo
  - Créer design : POST avec asset importé
- **HunyuanVideo-Avatar** : inference Python, prend image + audio → génère vidéo
  - Repo : https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar
  - Min VRAM : 10GB (avec TeaCache), recommandé 24GB+
- **FishAudio S1** : TTS Python, prend texte + audio ref → génère wav
  - Repo : https://github.com/fishaudio/fish-speech
  - Clone vocal zero-shot : 10-30s d'échantillon
  - 13+ langues : FR, EN, DE, ES, JP, KO, AR, ZH, RU, NL, IT, PL, PT
