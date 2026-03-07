# CLAUDE.md

## Projet

Avatar IA personnel pour Benjamin (Amarillo Search). Site web privé qui génère des vidéos avatar réalistes (corps entier, voix clonée multilingue) et les envoie dans Canva Pro pour la finition.

Repo : https://github.com/bengith-hub/avatar-IA
URL prod : https://avatar-ia-self.vercel.app

## Architecture

Deux apps distinctes dans un monorepo :

```
avatar-IA/
├── frontend/    → Next.js 16 (App Router) déployé sur Vercel
├── worker/      → FastAPI (Python 3.10+) déployé sur VM GPU Vast.ai
├── docs/        → Documentation projet
│   ├── DEPLOY.md   → Guide de déploiement complet
│   └── STACK.md    → Vue d'ensemble de la stack technique
├── SPEC.md      → Spécification produit complète
└── CLAUDE.md    → Ce fichier
```

### Communication Frontend ↔ Worker

```
[Navigateur] → [Vercel API Routes /api/gpu/*] → [VM Vast.ai IP:port (auto-detect)] → [:8000 interne]
```

- Le frontend ne contacte JAMAIS la VM directement
- Toutes les requêtes passent par les API routes Next.js (protection des clés API)
- **L'URL du worker est résolue dynamiquement** via l'API Vast.ai (`GET /instances/{id}`) à chaque requête
- L'instance Vast.ai est de type **Docker** : le port 8000 interne est mappé automatiquement vers un port externe (ex: 28042)
- L'IP et le port externe changent à chaque redémarrage de l'instance → d'où l'auto-detect
- `GPU_WORKER_URL` dans Vercel est **optionnel** (fallback/override manuel uniquement)

### Frontend (frontend/)

- **Framework** : Next.js 16.1.6 avec App Router, TypeScript strict
- **Déploiement** : Vercel (plan gratuit, région cdg1 / Paris)
- **Auth** : NextAuth.js v5 (beta.30) avec CredentialsProvider (un seul utilisateur : Benjamin)
- **Middleware** : `proxy.ts` — middleware NextAuth qui protège toutes les routes sauf `/login`, `/api/auth`, assets statiques
- **Styling** : Tailwind CSS v4
- **Composants UI** : shadcn/ui, lucide-react (icônes), class-variance-authority
- **État** : React hooks (useState, useEffect). Pas de state manager externe.
- **Stockage** : Cloudflare R2 via @aws-sdk/client-s3

### Worker (worker/)

- **Framework** : FastAPI, Python 3.10 (système sur VM Vast.ai, pas de venv)
- **Runtime** : VM GPU Vast.ai (Ubuntu 22.04, RTX 3090/4090 24GB ou A100)
- **IA** : HunyuanVideo-Avatar (animation, subprocess via CSV) + FishAudio OpenAudio S1-mini (TTS/voice clone)
- **Post-prod** : ffmpeg (installé sur la VM)
- **Sécurité** : auth par Bearer token dans le header `Authorization`
- **Réseau** : instance Docker Vast.ai. Port 8000 exposé via cloudflared tunnel (URL dynamique). `GPU_WORKER_URL` en env Vercel pointe vers l'URL tunnel

## APIs externes intégrées

| Service | Utilisé côté | Clé env | Rôle |
|---------|-------------|---------|------|
| Vast.ai | frontend (API routes) | `VAST_API_KEY` | Start/stop VM, billing |
| Pexels | frontend (API routes) | `PEXELS_API_KEY` | Recherche décors (photos+vidéos) |
| Anthropic | frontend (API routes) | `ANTHROPIC_API_KEY` | Génération de scripts IA |
| Astria | frontend (API routes) | `ASTRIA_API_KEY`, `ASTRIA_TUNE_ID` | Génération photos avatar IA |
| Canva Connect | frontend (API routes) | `CANVA_*` | Upload clip → ouvrir dans Canva |
| Cloudflare R2 | frontend (API routes) | `R2_*` | Stockage vidéos + avatars (S3-compatible) |
| Worker GPU | frontend (API routes) | `GPU_WORKER_TOKEN`, `VAST_INSTANCE_ID` | Proxy vers la VM (URL auto-détectée via Vast.ai API) |

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
- Utilitaire `cn()` dans `lib/cn.ts` pour combiner classes Tailwind (clsx + tailwind-merge)

### Python (worker)

- Python 3.10+ (système sur VM Vast.ai, pas de venv), type hints partout
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
│   ├── login/
│   │   └── page.tsx            ← Page de connexion
│   ├── generate/
│   │   └── page.tsx            ← Générateur de scènes
│   ├── gallery/
│   │   └── page.tsx            ← Galerie des vidéos générées
│   ├── avatars/
│   │   └── page.tsx            ← Gestion photos ref + voix
│   ├── settings/
│   │   └── page.tsx            ← Page paramètres (statut services, env vars)
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── health/route.ts         ← GET → health check frontend
│       ├── vast/
│       │   ├── start/route.ts      ← POST → démarre VM
│       │   ├── stop/route.ts       ← POST → arrête VM
│       │   ├── status/route.ts     ← GET → statut + billing
│       │   └── auto-stop/route.ts  ← Cron Vercel (03h00 UTC) → arrêt auto VM
│       ├── gpu/
│       │   ├── generate/route.ts   ← POST → lance génération
│       │   ├── status/route.ts     ← GET → statut job
│       │   ├── jobs/route.ts       ← GET → liste jobs
│       │   ├── download/route.ts   ← GET → télécharge MP4
│       │   ├── health/route.ts     ← GET → health check worker GPU
│       │   ├── avatars/route.ts    ← GET/POST → gestion avatars sur worker
│       │   └── voice/
│       │       ├── route.ts        ← GET/POST/DELETE → gestion voix sur worker
│       │       └── stream/route.ts ← GET → streaming audio voix
│       ├── pexels/
│       │   └── search/route.ts     ← GET → recherche décors
│       ├── ai/
│       │   └── script/route.ts     ← POST → génère script
│       ├── astria/
│       │   ├── generate/route.ts   ← POST → lance génération photo Astria
│       │   ├── status/route.ts     ← GET → statut prompt Astria
│       │   └── callback/route.ts   ← POST → callback webhook Astria
│       ├── canva/
│       │   └── upload/route.ts     ← POST → upload vers Canva
│       └── r2/
│           ├── [...key]/route.ts   ← GET → proxy lecture objets R2
│           ├── upload/route.ts     ← POST → upload fichier vers R2
│           └── stream/route.ts     ← GET → streaming vidéo depuis R2
├── components/
│   ├── gpu-status-card.tsx     ← Carte statut GPU (dashboard)
│   ├── scene-generator.tsx     ← Formulaire de génération
│   ├── avatar-selector.tsx     ← Sélecteur d'avatar (photo ref)
│   ├── background-picker.tsx   ← Recherche/sélection décors Pexels
│   ├── script-assistant.tsx    ← Assistant IA pour écrire les scripts
│   ├── canva-launcher.tsx      ← Bouton export vers Canva
│   ├── video-player.tsx        ← Lecteur vidéo MP4
│   ├── export-options.tsx      ← Options d'export (R2, Canva, download)
│   ├── active-job-banner.tsx   ← Bannière de job en cours (header)
│   ├── sidebar.tsx             ← Navigation latérale
│   └── providers.tsx           ← Provider SessionProvider (NextAuth)
├── lib/
│   ├── auth.ts                 ← Config NextAuth v5 (CredentialsProvider, SHA-256)
│   ├── env.ts                  ← Validation variables d'env (required/optional)
│   ├── vast-api.ts             ← Client Vast.ai REST
│   ├── gpu-api.ts              ← Client Worker API (auto-detect URL via Vast.ai API)
│   ├── pexels-api.ts           ← Client Pexels
│   ├── anthropic-api.ts        ← Client Anthropic (scripts)
│   ├── astria-api.ts           ← Client Astria (génération photos avatar)
│   ├── canva-api.ts            ← Client Canva Connect
│   ├── r2.ts                   ← Client Cloudflare R2 (vidéos)
│   ├── r2-avatars.ts           ← Client R2 pour gestion avatars (photos)
│   └── cn.ts                   ← Utilitaire classes CSS (clsx + tailwind-merge)
├── proxy.ts                    ← Middleware NextAuth (protection routes)
├── vercel.json                 ← Config Vercel (crons, timeouts, région)
└── .env.local.example          ← Template variables d'environnement
```

## Vercel Configuration

Le fichier `vercel.json` configure :
- **Région** : `cdg1` (Paris, pour la latence depuis la France)
- **Cron job** : `/api/vast/auto-stop` exécuté tous les jours à 03h00 UTC (arrêt auto VM)
- **Timeouts étendus** : download/generate GPU (30s), upload Canva/R2 (60s), script AI (30s)

## Structure worker détaillée

```
worker/
├── main.py                 ← FastAPI app, endpoints, middleware auth
├── pipeline.py             ← Orchestration : TTS → Avatar → ffmpeg
├── tts.py                  ← Interface FishAudio S1 (texte → wav)
├── avatar.py               ← Interface HunyuanVideo-Avatar (photo+wav → mp4)
├── postprocess.py          ← ffmpeg : normalisation, format, compositing
├── models.py               ← Pydantic models (requests/responses)
├── config.py               ← Settings depuis env vars (pydantic-settings)
├── jobs.py                 ← Gestion jobs in-memory (file, statuts, résultats)
├── requirements.txt        ← Dépendances pip (hors torch/IA, installées par setup.sh)
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
- Les endpoints `*-json` avec base64 sont conservés (héritage ngrok, mais fonctionnent aussi en direct — à simplifier plus tard si souhaité)

## Commandes de développement

### Frontend

```bash
cd frontend
npm install              # installer dépendances
npm run dev              # dev server (localhost:3000)
npm run build            # build production
npm run lint             # linter (eslint)
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
# Auth
NEXTAUTH_SECRET=            # ou AUTH_SECRET (NextAuth v5 supporte les deux)
NEXTAUTH_URL=http://localhost:3000
AUTH_USERNAME=benjamin
AUTH_PASSWORD_HASH=         # SHA-256 du mot de passe

# Vast.ai
VAST_API_KEY=
VAST_INSTANCE_ID=           # Actuellement : 32479135 (A100 SXM4 40GB, Suède)

# GPU Worker
GPU_WORKER_URL=             # OPTIONNEL — override manuel (sinon auto-détecté via Vast.ai API)
GPU_WORKER_TOKEN=

# Services
PEXELS_API_KEY=
ANTHROPIC_API_KEY=

# Astria (optionnel)
ASTRIA_API_KEY=
ASTRIA_TUNE_ID=

# Canva (optionnel — Phase 2)
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=
CANVA_ACCESS_TOKEN=

# Cloudflare R2 (optionnel — Phase 2)
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=avatar-videos
```

### worker/.env

```
WORKER_TOKEN=                                   # Token d'auth (généré par setup.sh)
HUNYUAN_MODEL_PATH=/root/avatar-data/models/hunyuan
HUNYUAN_INSTALL_PATH=/root/HunyuanVideo-Avatar
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
6. **Auth obligatoire** sur toutes les pages et API routes (sauf la page de login). Le middleware `proxy.ts` gère ça automatiquement.
7. **Le worker doit démarrer même si les modèles IA ne sont pas chargés** — `/health` indique l'état de chargement. Les modèles se chargent au premier appel ou au démarrage.
8. **Gestion d'erreurs explicite partout.** Pas de fail silencieux. Le frontend affiche les erreurs clairement.
9. **Arrêt automatique VM** : un cron Vercel (`/api/vast/auto-stop`) s'exécute chaque nuit à 03h00 UTC pour éviter les coûts inutiles.
10. **Auto-detect URL Worker** : `gpu-api.ts` résout l'URL du worker via l'API Vast.ai (IP:port dynamique). `GPU_WORKER_URL` n'est qu'un override optionnel.

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
  - Args clés : `--cpu-offload --use-fp8 --infer-min --sample-n-frames 129 --image-size 704 --infer-steps 30`
  - Peak VRAM : ~17GB avec cpu-offload + FP8 (RTX 3090 24GB = suffisant)
  - Temps génération : ~75 min (30 steps) ou ~2h30 (50 steps) par vidéo de 5.2s
  - `--use-deepcache 1` : le flag existe dans config mais n'est PAS implémenté dans le code d'inférence
  - TeaCache/Wan2GP : non intégré (Wan2GP est une app Gradio, pas un CLI drop-in)
- **FishAudio OpenAudio S1-mini** : TTS Python, prend texte + audio ref → génère wav
  - Repo : https://github.com/fishaudio/fish-speech
  - Modèle : `openaudio-s1-mini` (téléchargé via HuggingFace dans `/root/avatar-data/models/fish-audio/openaudio-s1-mini/`)
  - Clone vocal zero-shot : 10-30s d'échantillon
  - 13+ langues : FR, EN, DE, ES, JP, KO, AR, ZH, RU, NL, IT, PL, PT

## Patchs de compatibilité connus

- **torchaudio >= 2.1** : `list_audio_backends()` a été supprimé. fish-speech l'appelle en interne à l'import. Monkey-patch appliqué dans `worker/main.py` ET `worker/tts.py` (top-level, avant tout import fish-speech) :
  ```python
  import torchaudio
  if not hasattr(torchaudio, "list_audio_backends"):
      torchaudio.list_audio_backends = lambda: ["soundfile"]
  ```
- **diffusers / transformers** : les versions récentes de `transformers` (>= 5.x) suppriment `FLAX_WEIGHTS_NAME` que `diffusers` importe. Pinner à `diffusers==0.33.0` + `transformers==4.40.1` (versions testées et fonctionnelles). Note : transformers 4.47.1 a des problèmes de config modèle avec HunyuanVideo-Avatar, utiliser 4.40.1.
- **flash-attn** : requis par HunyuanVideo-Avatar (`flash_attn.flash_attn_interface`). Options d'installation (dans l'ordre) :
  1. **Wheels précompilés** (rapide) : `pip install flash-attn` — fonctionne si un wheel correspond à votre combo Python/CUDA/torch
  2. **Compilation** (5-15 min) : nécessite `CUDA_HOME` + `nvcc`. Utiliser un template Vast.ai "devel" avec CUDA toolkit, ou installer manuellement : `apt install cuda-toolkit-12-1 && export CUDA_HOME=/usr/local/cuda-12.1`
  3. **Avec ninja** (accélère la compilation) : `pip install ninja && pip install flash-attn --no-build-isolation`
  - Si les wheels précompilés échouent avec "inconsistent version", c'est un bug pip connu → passer à la compilation
- **torchvision** : requis par HunyuanVideo-Avatar (`hymm_sp/data_kits/audio_dataset.py` l'importe). Installé avec PyTorch : `pip install torch torchvision torchaudio`.
- **torchcodec** : requis par torchaudio au runtime. Installer avec `pip install torchcodec`.
- **pydantic-settings / config.py** : `BaseSettings` lit toutes les variables du `.env`. Si une variable existe dans `.env` mais pas dans la classe `Settings`, pydantic lève `extra_forbidden`. **Toute nouvelle variable ajoutée au `.env` doit être déclarée dans `worker/config.py`** avec une valeur par défaut (ex: `ngrok_authtoken: str = ""`).
- **ngrok (OBSOLÈTE)** : plus nécessaire depuis le passage aux instances Docker Vast.ai avec port mapping direct. Conservé ici pour référence si retour à une instance KVM :
  - ngrok CLI lit son authtoken depuis `~/.config/ngrok/ngrok.yml`, PAS depuis les variables d'environnement
  - `ngrok config add-authtoken TOKEN` doit être exécuté une fois
  - Le Cloud Endpoint utilisait l'URL fixe `tarsha-irruptive-sabra.ngrok-free.dev`
- **NextAuth v5** : utilise `AUTH_SECRET` comme nom de variable principal, mais `NEXTAUTH_SECRET` fonctionne aussi (voir `lib/env.ts`).

## Architecture VM (Vast.ai)

### Instance actuelle

| Info | Valeur |
|------|--------|
| **Instance ID** | `32454128` |
| **Type** | Docker (port mapping automatique) |
| **IP publique** | `182.64.125.233` (dynamique — change au restart) |
| **SSH** | `ssh -p 28136 root@182.64.125.233` |
| **Worker** | `http://182.64.125.233:28042` → port 8000 interne |
| **IP type** | Dynamic |

> **IMPORTANT** : L'IP et les ports externes changent à chaque redémarrage. C'est pourquoi le frontend auto-détecte l'URL via l'API Vast.ai.

### Exigences minimales VM (CRITIQUE)

| Ressource | Minimum | Recommandé | Notes |
|-----------|---------|------------|-------|
| **GPU** | RTX 3090 (24GB) | RTX 4090 / A100 | VRAM 24GB+ avec `--cpu-offload --use-fp8` |
| **RAM** | 25GB (avec swap) | **32GB+** | 25GB → OOM kills fréquents, swap obligatoire |
| **Disque** | 150GB | **200GB+** | Poids modèle 76GB + libs 20GB + OS 10GB + swap 4-8GB |
| **Image** | devel (avec nvcc) | `pytorch:*-cuda12.1-devel` | **PAS "runtime"** — nvcc requis pour compiler flash-attn |
| **Type instance** | **Docker** | Docker | Port mapping auto, pas besoin de ngrok |
| **Python** | 3.10 | 3.10 | Système (pas de venv) |

**IMPORTANT** : 126GB de disque est **TROP JUSTE** — on a eu des problèmes de disque plein (99%) qui cassent ngrok et empêchent les générations. Toujours prendre 200GB+.

**Swap obligatoire si RAM < 32GB** : HunyuanVideo avec `--cpu-offload` peut utiliser 20-30GB de RAM. Sans swap, le process est tué par l'OOM killer.

### Utilisation disque typique

```
~76GB   /root/HunyuanVideo-Avatar/     (poids modèle dans weights/)
~5GB    /root/avatar-data/             (modèles fish-audio ~2GB + photos/voice/outputs)
~9GB    /usr/local/lib/python3.10/dist-packages/  (torch, flash-attn, etc.)
~8GB    /usr/lib/                      (CUDA toolkit, libs système)
~5GB    /var/cache/                    (cache apt — NETTOYER avec apt-get clean)
~4GB    /swapfile                      (swap si RAM < 32GB)
= ~107GB total → besoin de 150GB+ avec marge
```

### flash-attn : temps de compilation

- **10-30 minutes** de compilation (2 process `cicc` à 100% CPU, ~7GB RAM chacun)
- Pendant la compilation, `top` montre 2x `cicc` à 100% CPU — c'est **normal**
- Il peut y avoir **plusieurs passes** de compilation successives
- Ne pas interrompre, ne pas paniquer si ça dure

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
            ├── hunyuan-video-t2v-720p/
            │   ├── transformers/mp_rank_00_model_states_fp8.pt
            │   └── vae/pytorch_model.pt
            ├── whisper-tiny/
            └── det_align/
```

- **HunyuanVideo-Avatar** est exécuté en subprocess (pas importé en Python) via `avatar.py`
- Mode `--cpu-offload --use-fp8 --infer-min` pour tenir dans 24GB VRAM (RTX 3090/4090)
- **Pas de venv** sur la VM — tout installé en global (système Python 3.10)
- Les services systemd utilisent `/usr/local/bin/uvicorn` (pas de venv/bin/)
- Variable d'environnement `MODEL_BASE` passée au subprocess (pointe vers `weights/`)

## Dépendances pip critiques (VM)

Versions testées et fonctionnelles :

```
torch==2.5.1+cu121 (avec CUDA)
torchvision==0.20.1+cu121 (requis par HunyuanVideo-Avatar)
torchaudio==2.5.1+cu121
torchcodec>=0.10
diffusers==0.33.0
transformers==4.40.1 (CRITIQUE — 4.47.1 casse les configs modèle)
flash-attn==2.8.3 (compilé avec nvcc, ou wheel précompilé)
accelerate==1.1.1 (requis par diffusers pour model loading/offloading)
imageio==2.34.0 (requis pour video frame I/O)
opencv-python-headless==4.10.0.84 (requis pour image processing cv2)
ninja (accélère la compilation flash-attn)
fish-speech==0.1.0 (pip install -e . depuis le clone)
soundfile==0.13.1
huggingface_hub (pour téléchargement des poids modèle)
```

### requirements.txt du worker (dépendances directes)

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
pydantic-settings==2.7.1
python-multipart==0.0.20
python-dotenv==1.0.1
httpx==0.28.1
aiofiles==24.1.0
```

Les dépendances IA (torch, transformers, fish-speech, flash-attn...) sont installées séparément par `setup.sh`.

## Procédure setup nouvelle VM

### Choix de la VM sur Vast.ai

Filtres recommandés :
- **GPU** : RTX 3090/4090 ou A100
- **RAM** : 32GB+
- **Disk** : 200GB+
- **Image** : chercher "devel" ou "cuda" dans le template (nvcc inclus)

### Installation (1h-2h total)

1. Choisir template Vast.ai **avec CUDA toolkit** (image "devel") — vérifier avec `nvcc --version`
2. SSH dans la VM
3. `git clone https://github.com/bengith-hub/avatar-IA.git && cd avatar-IA/worker && bash setup.sh`
4. Le script fait tout automatiquement :
   - Installe les paquets système (ffmpeg, git-lfs, etc.)
   - Détecte CUDA et installe le toolkit si absent
   - Crée un swap file (4-8GB selon RAM)
   - Installe PyTorch + torchvision + torchaudio (avec bon wheel CUDA)
   - Installe les dépendances worker (FastAPI, pydantic, etc.)
   - Compile flash-attn (10-30 min — ne pas interrompre !)
   - Clone et installe fish-speech + télécharge poids S1-mini (~2GB)
   - Clone HunyuanVideo-Avatar + télécharge poids (~76GB, 30-60 min)
   - Crée `.env` avec un token aléatoire
   - Configure les services systemd (worker + ngrok)
   - Nettoie les caches pip/apt pour économiser le disque
   - Affiche un résumé de toutes les versions installées
5. Configurer `.env` : `nano /root/avatar-IA/worker/.env`
   - Copier le `WORKER_TOKEN` généré (affiché dans la sortie du script)
6. Ajouter photos + voix dans `/root/avatar-data/`
7. `systemctl start avatar-worker`
8. Tester : `curl http://localhost:8000/health`
9. Mettre à jour `GPU_WORKER_TOKEN` et `VAST_INSTANCE_ID` dans Vercel (l'URL est auto-détectée)

### Si flash-attn échoue (pas de nvcc)

```bash
# Installer CUDA toolkit manuellement
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring_1.1-1_all.deb
apt-get update && apt-get install -y cuda-toolkit-12-1
apt-get clean  # IMPORTANT: libérer l'espace disque
export CUDA_HOME=/usr/local/cuda-12.1
export PATH=$CUDA_HOME/bin:$PATH

# Puis installer flash-attn
pip install ninja
pip install flash-attn --no-build-isolation
pip cache purge  # libérer le cache pip
```

### Problèmes connus et solutions

| Problème | Cause | Solution |
|----------|-------|----------|
| OOM kill du worker | RAM insuffisante + cpu-offload | Ajouter swap : `fallocate -l 8G /swapfile && mkswap /swapfile && swapon /swapfile` |
| Disque plein (99%) | Cache apt/pip + poids modèle | `apt-get clean && pip cache purge` — prochaine fois prendre 200GB+ |
| Erreur ngrok "page d'erreur" | (OBSOLÈTE — ngrok supprimé) | Utiliser instance Docker avec port mapping direct |
| `ModuleNotFoundError: torchvision` | Pas installé | `pip install torchvision` |
| `ModuleNotFoundError: torchcodec` | Pas installé | `pip install torchcodec` |
| flash-attn compilation 30min+ | Normal avec nvcc | Attendre — 2x `cicc` à 100% CPU est normal |
| `list_audio_backends` error | torchaudio >= 2.1 | Monkey-patch dans main.py/tts.py (déjà fait) |
| `FLAX_WEIGHTS_NAME` error | transformers trop récent | `pip install diffusers==0.32.2 transformers==4.47.1` |
| pydantic `extra_forbidden` au démarrage worker | `.env` contient des vars pas dans `config.py` Settings | Ajouter les champs manquants dans `worker/config.py` |

### Commandes de monitoring utiles

```bash
watch -n 2 nvidia-smi              # GPU (VRAM, utilisation)
journalctl -u avatar-worker -f     # Logs worker en temps réel
# journalctl -u avatar-ngrok -f   # (OBSOLÈTE — ngrok supprimé)
htop                               # CPU/RAM
df -h /                            # Espace disque
free -h                            # RAM + swap
curl http://localhost:8000/health   # Test worker
```

## Dépendances frontend (package.json)

```
next@16.1.6
react@19.2.3 / react-dom@19.2.3
next-auth@5.0.0-beta.30
@aws-sdk/client-s3@^3.1001.0
class-variance-authority@^0.7.1
clsx@^2.1.1 / tailwind-merge@^3.5.0
lucide-react@^0.577.0
tailwindcss@^4 / @tailwindcss/postcss@^4
typescript@^5
```

## Décisions d'architecture clés

1. **Instance Docker Vast.ai + auto-detect** : le frontend résout l'URL du worker via l'API Vast.ai à chaque requête. Plus besoin de ngrok ni de mettre à jour manuellement `GPU_WORKER_URL` (ancien système : ngrok Cloud Endpoint avec URL fixe — supprimé car trop fragile et source de bugs)
2. **JSON base64 au lieu de multipart** : héritage de ngrok (qui retournait une page HTML sur les POST multipart). Les endpoints `/upload-json` avec base64 sont conservés — fonctionnent aussi en accès direct. Simplification possible plus tard vers multipart classique
3. **Proxy R2** (`/api/r2/[...key]`) : les URLs publiques R2 donnent des erreurs SSL → route proxy qui stream les fichiers avec Content-Type correct et cache 1h
4. **Voice sample sync via base64** : l'échantillon vocal est uploadé sur R2, puis envoyé en base64 dans le body de `/generate` pour que le worker le sauvegarde localement
5. **localStorage pour persistence** : état du formulaire Generate, photos Astria, jobs actifs — tout persiste dans localStorage (initialisé dans useEffect pour éviter l'erreur React hydration #418)
6. **Auto-stop VM** : cron Vercel daily à 3h UTC (limitation Hobby plan, pas de cron minute) → arrête la VM si idle >30min ou worker injoignable
7. **Astria pour photos** : tune ID `4233645`, trigger token `ohwx man` auto-injecté dans les prompts (`astria-api.ts`)
8. **Self-hosted TTS/Avatar** : choix délibéré de garder fish-speech + HunyuanVideo au lieu d'ElevenLabs, pour garder la propriété intellectuelle
9. **Vercel Hobby plan** : 100 déploiements/jour max, 1 cron/jour max — batchtrer les changements avant de push

## Bugs historiques résolus (session initiale)

### NextAuth / Auth

| Problème | Cause | Solution |
|----------|-------|----------|
| 400 sur `/api/auth/session` | `AUTH_URL` pointait vers le dashboard Vercel | Supprimer `AUTH_URL`, utiliser `trustHost: true` |
| 400 persistant | Code cherchait `NEXTAUTH_SECRET`, Vercel avait `AUTH_SECRET` | Fallback `process.env.AUTH_SECRET \|\| process.env.NEXTAUTH_SECRET` |
| `middleware.ts` deprecation | Next.js 16 renomme en `proxy.ts` | Renommer fichier + export `proxy` au lieu de `middleware` |
| Edge Runtime crash SHA-256 | `crypto.createHash` = Node.js only | Migré vers `crypto.subtle.digest` (Web Crypto API) |

### Vast.ai API

| Problème | Cause | Solution |
|----------|-------|----------|
| Statut "unknown" | Réponse wrappée dans `{ instances: {...} }` | Unwrapper la réponse |
| Statut "unknown" (2) | Base URL `console.vast.ai` obsolète | Utiliser `cloud.vast.ai` |
| Balance $0.00 | Champ `balance` toujours à 0 | Utiliser `credit \|\| balance` |

### Frontend React

| Problème | Cause | Solution |
|----------|-------|----------|
| Hydration error #418 | `localStorage.getItem()` pendant SSR | Initialiser avec defaults, restaurer dans `useEffect` |
| État perdu au changement de page | State React réinitialisé | Persistence localStorage + polling job actif |
| 500 `<!doctype` | `auth()` hors try/catch + import S3 crash serverless | Wrapper dans try/catch + import dynamique S3 |
| "tunnel" faux positif | `isOfflineError()` matchait tout "tunnel" | Restreint à "ngrok" et "Tunnel" (majuscule) |

## Statut actuel (mars 2026)

### Ce qui fonctionne ✅
- Auth (login/logout)
- Dashboard GPU (start/stop VM, billing, statut)
- Génération photos Astria (avec persistence localStorage)
- Upload avatars et voice samples (R2 + VM sync)
- Interface de génération (script assistant, formulaire, persistence état)
- Job tracking cross-pages (bannière globale `active-job-banner.tsx`)
- Auto-stop VM (cron daily)
- Auto-detect URL Worker via Vast.ai API (remplace ngrok)
- **Pipeline TTS** : FishAudio OpenAudio S1-mini → WAV (testé, ~38s pour une phrase courte)
- **Pipeline HunyuanVideo-Avatar** : photo + WAV → MP4 (testé, 129 frames/704px/30 steps, ~17GB VRAM peak)
- **VRAM management** : TTS unload avant HunyuanVideo (libère ~18GB), puis cpu-offload pour inférence
- **Background composite** : graceful fallback si le téléchargement du décor échoue (pas de crash)

### Ce qui reste à faire
- **Test end-to-end complet via frontend** : TTS → HunyuanVideo → composite → MP4 servi au browser
- **Qualité vidéo** : valider le rendu des vidéos 129 frames / 704px (5.2s à 25fps)
- **Export Canva** : intégration OAuth en place mais pas testée end-to-end
- **Optimisation vitesse** : ~75 min par vidéo de 5.2s est lent. Options futures :
  - TeaCache intégration directe dans le denoiser (potentiel 2x speedup)
  - GPU 48GB+ (A6000 $0.37/h) pour enlever cpu-offload → ~10x plus rapide
  - Réduire infer-steps à 20 (qualité moindre mais 2x plus rapide)

### HunyuanVideo-Avatar : benchmarks

#### RTX 3090 (24GB) — Instance 32454128

Tests effectués le 6 mars 2026 :

| Config | Frames | Résolution | Steps | VRAM peak | Temps | Résultat |
|--------|--------|-----------|-------|-----------|-------|----------|
| Minimal | 33 | 384px | 25 | ~11 GB | ~5 min | OK — 220KB, 1.3s, basse qualité |
| **Full quality** | **129** | **704px** | **50** | **~17 GB** | **~2h30** | **OK — stable, pas d'OOM** |
| Production | 129 | 704px | 30 | ~17 GB | **~75 min** | Compromis retenu |

Paramètres : `--cpu-offload --use-fp8 --infer-min --use-deepcache 1`

#### A100 SXM4 40GB — Instance 32479135

Tests effectués le 7 mars 2026 (Suède, $0.54/h) :

| Config | Frames | Résolution | Steps | VRAM peak | Temps | Résultat |
|--------|--------|-----------|-------|-----------|-------|----------|
| Sans offload | 129 | 704px | 50 | **>40 GB** | N/A | **OOM** — 40GB insuffisant sans offload |
| **Avec offload** | **129** | **704px** | **50** | **~18 GB** | **~56 min** | **OK — 3× plus rapide que RTX 3090** |

Paramètres : `--cpu-offload --use-fp8 --use-deepcache 1` (PAS `--infer-min` sur A100)

#### Détection automatique VRAM (3 tiers dans avatar.py)

| VRAM | Mode | Steps | Flags | GPU cibles |
|------|------|-------|-------|------------|
| >= 70GB | Full GPU | 50 | `--use-fp8` | A100 80GB, H100 |
| 40-70GB | CPU offload | 50 | `--cpu-offload --use-fp8` | A100 40GB |
| < 40GB | CPU offload + min | 30 | `--cpu-offload --use-fp8 --infer-min` | RTX 3090/4090 |

#### TTS (fish-speech openaudio-s1-mini) sur A100 40GB

- Chargement modèle : ~25s
- Génération speech (phrase courte) : ~6.5s (11.21 tokens/sec)
- VRAM utilisée : ~5 GB

Notes générales :
- `--cpu-offload` : les poids du modèle (~30GB) restent en RAM CPU, transférés au GPU pendant le calcul
- `--use-fp8` : poids transformer en FP8 (réduit VRAM de ~3GB)
- `--infer-min` : mode inférence minimal (réduit les buffers) — réservé aux GPUs < 40GB
- `--use-deepcache 1` : flag présent dans le code mais **PAS implémenté** dans le loop de débruitage (n'a aucun effet)
- La RAM système doit être >= 32GB pour le cpu-offload (35GB utilisés en pic)
- **openaudio-s1-mini est gated sur HuggingFace** → télécharger via ModelScope : `modelscope download --model fishaudio/openaudio-s1-mini`

### Historique ngrok (référence si besoin de rollback)

L'ancien système utilisait ngrok Cloud Endpoint pour exposer le port 8000 de la VM (type KVM, pas de port mapping natif) :
- URL fixe : `tarsha-irruptive-sabra.ngrok-free.dev`
- Service systemd : `avatar-ngrok`
- Config : `NGROK_AUTHTOKEN` + `NGROK_DOMAIN` dans `.env`
- Problèmes rencontrés : interstitiel HTML sur POST multipart, ERR_NGROK_4018 (authtoken), ERR_NGROK_8012 (bad gateway), disque plein cassait ngrok
- Raison de l'abandon : trop fragile, source de bugs récurrents, instance Docker avec port direct = plus simple

## Bugs résolus (session mars 2026)

### Pipeline / Worker

| Problème | Cause | Solution |
|----------|-------|----------|
| Background download crash (403 Forbidden) | Pexels URL retourne 403 sans User-Agent | Wrappé dans try/except + User-Agent header + skip gracieux |
| Vidéo 220KB (1.3s seulement) | Settings minimaux 33 frames/384px | Upgrade à 129/704/30 (full quality, stable sur RTX 3090) |
| `transformers` config error | Version 4.47.1 incompatible | Downgrade à 4.40.1 (version matching model config) |
| Missing `imageio` module | Pas installé par défaut | Ajouté dans setup.sh |
| Missing `cv2` module | opencv pas installé | Ajouté `opencv-python-headless` dans setup.sh |
| Missing `accelerate` module | Pas installé | Ajouté dans setup.sh |
| TTS VRAM conflict avec HunyuanVideo | Les deux modèles ensemble dépassent 24GB | `tts_engine.unload_model()` entre Step 1 et Step 2 |
| SSH "Connection refused" sur ssh8.vast.ai | Hostname résolu incorrectement | Utiliser IP directe : `ssh -p 28136 root@182.64.125.233` |

## Préférences utilisateur

- Benjamin est débutant terminal — privilégier les actions web/navigateur, minimiser SSH
- iPad-first : boutons 48-56px, fonts 18px+
- Préfère les choix multiples (AskUserQuestion) aux questions ouvertes
- Langue : français
- Veut tout documenter pour ne pas perdre la mémoire entre sessions
- Frustré par les cycles debug terminal → tout faire via l'interface web si possible
