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
- **Runtime** : VM GPU Vast.ai (Ubuntu 22.04, RTX 3090 24GB)
- **IA** : HunyuanVideo-Avatar (animation, subprocess via CSV) + FishAudio OpenAudio S1-mini (TTS/voice clone)
- **Post-prod** : ffmpeg (installé sur la VM)
- **Sécurité** : auth par Bearer token dans le header `Authorization`
- **Tunnel** : ngrok (domaine statique) pour exposer le worker au frontend Vercel

## APIs externes intégrées

| Service | Utilisé côté | Clé env | Rôle |
|---------|-------------|---------|------|
| Vast.ai | frontend (API routes) | `VAST_API_KEY` | Start/stop VM, billing |
| Pexels | frontend (API routes) | `PEXELS_API_KEY` | Recherche décors (photos+vidéos) |
| Anthropic | frontend (API routes) | `ANTHROPIC_API_KEY` | Génération de scripts IA |
| Astria | frontend (API routes) | `ASTRIA_API_KEY`, `ASTRIA_TUNE_ID` | Génération photos avatar IA |
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
│       ├── astria/
│       │   ├── generate/route.ts   ← POST → lance génération photo Astria
│       │   ├── status/route.ts     ← GET → statut prompt Astria
│       │   └── callback/route.ts   ← POST → callback webhook Astria
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
    ├── astria-api.ts           ← Client Astria (génération photos avatar)
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
GET  /health                        → { status, gpu_name, gpu_memory, uptime, models_loaded, active_jobs }
POST /generate                      → { job_id }
     body: { text, language, avatar_id, background_url?, emotion?, format?,
             avatar_photo_base64?, avatar_photo_filename?,
             voice_sample_base64?, voice_sample_filename? }
GET  /status/{job_id}               → { job_id, status, progress?, result_url?, error? }
GET  /jobs                          → [ { job_id, status, created_at, ... } ]
GET  /download/{job_id}             → MP4 file
GET  /avatars                       → [ { id, name, path } ]
POST /avatars                       → { id, name, path }  (multipart file)
POST /avatars/upload-json           → { id, name, path }  (base64 JSON, évite problèmes ngrok)
GET  /voice-samples                 → [ { name, url, size, source } ]
POST /voice-samples                 → { name, url, size }  (multipart file)
POST /voice-samples/upload-json     → { name, url, size }  (base64 JSON)
GET  /voice-samples/{filename}      → fichier audio
DELETE /voice-samples               → { success }  body: { name }
```

Tous les endpoints (sauf /health) requièrent `Authorization: Bearer <WORKER_TOKEN>`.

### Notes sur /generate

- `avatar_photo_base64` + `avatar_photo_filename` : permet d'envoyer la photo avatar inline (le worker la sauvegarde dans `photos/`)
- `voice_sample_base64` + `voice_sample_filename` : idem pour l'échantillon vocal
- Les endpoints `*-json` avec base64 contournent les problèmes de multipart via ngrok

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
ASTRIA_API_KEY=
ASTRIA_TUNE_ID=
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
HUNYUAN_INSTALL_PATH=/root/HunyuanVideo-Avatar
FISH_MODEL_PATH=/root/avatar-data/models/fish-audio
PHOTOS_PATH=/root/avatar-data/photos
VOICE_PATH=/root/avatar-data/voice
OUTPUT_PATH=/root/avatar-data/outputs
NGROK_AUTHTOKEN=
NGROK_DOMAIN=
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
- **Astria API** : REST, auth par Bearer token, docs : https://docs.astria.ai/
  - Base URL : `https://api.astria.ai`
  - Générer photos : `POST /tunes/{tune_id}/prompts` avec `prompt[text]`, `prompt[num_images]`, `prompt[face_correct]`, `prompt[face_swap]`
  - Statut : `GET /tunes/{tune_id}/prompts/{prompt_id}`
  - Le tune_id correspond au modèle fine-tuné sur le visage de Benjamin
  - Les photos générées servent de référence pour HunyuanVideo-Avatar
- **HunyuanVideo-Avatar** : inference Python, prend image + audio → génère vidéo
  - Repo : https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar
  - Installé dans `/root/HunyuanVideo-Avatar/` sur la VM
  - Exécuté en subprocess via `hymm_sp/sample_gpu_poor.py` avec CSV en entrée
  - Args clés : `--cpu-offload --use-fp8 --infer-min --sample-n-frames 129 --image-size 704`
  - Min VRAM : 10GB (avec TeaCache), recommandé 24GB+ (RTX 3090 = 24GB, suffisant avec cpu-offload)
- **FishAudio OpenAudio S1-mini** : TTS Python, prend texte + audio ref → génère wav
  - Repo : https://github.com/fishaudio/fish-speech
  - Modèle : `openaudio-s1-mini` (téléchargé via HuggingFace dans `/root/avatar-data/models/fish-audio/openaudio-s1-mini/`)
  - Clone vocal zero-shot : 10-30s d'échantillon
  - 13+ langues : FR, EN, DE, ES, JP, KO, AR, ZH, RU, NL, IT, PL, PT

## Patchs de compatibilité connus

- **torchaudio >= 2.1** : `list_audio_backends()` a été supprimé. fish-speech l'appelle en interne à l'import. Monkey-patch appliqué dans `worker/main.py` (top-level, avant tout import fish-speech) :
  ```python
  import torchaudio
  if not hasattr(torchaudio, "list_audio_backends"):
      torchaudio.list_audio_backends = lambda: ["soundfile"]
  ```
- **diffusers / transformers** : les versions récentes de `transformers` (>= 5.x) suppriment `FLAX_WEIGHTS_NAME` que `diffusers` importe. Pinner à `diffusers==0.32.2` + `transformers==4.47.1`.
- **flash-attn** : requis par HunyuanVideo-Avatar (`flash_attn.flash_attn_interface`). Nécessite `CUDA_HOME` + `nvcc` pour compiler. Utiliser un template Vast.ai "devel" avec CUDA toolkit.
- **torchcodec** : requis par torchaudio au runtime. Installer avec `pip install torchcodec`.

## Architecture VM (Vast.ai)

**IMPORTANT** : Choisir un template Vast.ai avec CUDA toolkit (image "devel", pas "runtime") pour pouvoir compiler flash-attn.

```
/root/
├── avatar-IA/               ← clone du repo (worker/ utilisé)
├── avatar-data/
│   ├── models/
│   │   ├── fish-audio/
│   │   │   ├── fish-speech/         ← clone du repo (pip install -e .)
│   │   │   └── openaudio-s1-mini/   ← model.pth + codec.pth (~2GB)
│   │   └── hunyuan/                 ← (non utilisé directement)
│   ├── photos/                      ← photos référence avatar
│   ├── voice/                       ← échantillon vocal (.wav)
│   └── outputs/                     ← vidéos générées par job
└── HunyuanVideo-Avatar/             ← clone du repo Tencent
    ├── hymm_sp/sample_gpu_poor.py   ← script d'inférence (subprocess)
    └── weights/                     ← poids modèle (~76GB, téléchargés via HuggingFace)
        └── ckpts/
            ├── hunyuan-video-t2v-720p/transformers/mp_rank_00_model_states_fp8.pt
            ├── whisper-tiny/
            └── det_align/
```

- **HunyuanVideo-Avatar** est exécuté en subprocess (pas importé en Python) via `avatar.py`
- Mode `--cpu-offload --use-fp8 --infer-min` pour tenir dans 24GB VRAM (RTX 3090)
- **Pas de venv** sur la VM — tout installé en global (système Python 3.10)
- Les services systemd utilisent `/usr/local/bin/uvicorn` (pas de venv/bin/)

## Dépendances pip critiques (VM)

Versions testées et fonctionnelles :

```
torch>=2.1 (avec CUDA, ex: cu121 ou cu128)
torchaudio>=2.1
torchcodec>=0.10
diffusers==0.32.2
transformers==4.47.1
flash-attn>=2.5 (compilé avec nvcc)
fish-speech (pip install -e . depuis le clone)
soundfile
```

## Procédure setup nouvelle VM

1. Choisir template Vast.ai **avec CUDA toolkit** (image "devel")
2. SSH dans la VM
3. `git clone https://github.com/bengith-hub/avatar-IA.git && cd avatar-IA/worker && bash setup.sh`
4. Configurer `.env` (token, ngrok)
5. Ajouter photos + voix dans `/root/avatar-data/`
6. `systemctl start avatar-worker && systemctl start avatar-ngrok`

Le script `setup.sh` gère tout : dépendances, clones, téléchargement poids, services systemd.
