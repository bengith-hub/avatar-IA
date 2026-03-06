# CLAUDE.md

## Projet

Avatar IA personnel pour Benjamin (Amarillo Search). Site web privé qui génère des vidéos avatar réalistes (corps entier, voix clonée multilingue) et les envoie dans Canva Pro pour la finition.

Repo : https://github.com/bengith-hub/avatar-IA

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
- **Tunnel** : ngrok (domaine statique gratuit) pour exposer le worker au frontend Vercel

## APIs externes intégrées

| Service | Utilisé côté | Clé env | Rôle |
|---------|-------------|---------|------|
| Vast.ai | frontend (API routes) | `VAST_API_KEY` | Start/stop VM, billing |
| Pexels | frontend (API routes) | `PEXELS_API_KEY` | Recherche décors (photos+vidéos) |
| Anthropic | frontend (API routes) | `ANTHROPIC_API_KEY` | Génération de scripts IA |
| Astria | frontend (API routes) | `ASTRIA_API_KEY`, `ASTRIA_TUNE_ID` | Génération photos avatar IA |
| Canva Connect | frontend (API routes) | `CANVA_*` | Upload clip → ouvrir dans Canva |
| Cloudflare R2 | frontend (API routes) | `R2_*` | Stockage vidéos + avatars (S3-compatible) |
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
│   ├── gpu-api.ts              ← Client Worker API (avec détection erreurs ngrok)
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
- Les endpoints `*-json` avec base64 contournent les problèmes de multipart via ngrok

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
VAST_INSTANCE_ID=

# GPU Worker
GPU_WORKER_URL=             # URL ngrok (optionnel, auto-découverte via Vast.ai sinon)
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
6. **Auth obligatoire** sur toutes les pages et API routes (sauf la page de login). Le middleware `proxy.ts` gère ça automatiquement.
7. **Le worker doit démarrer même si les modèles IA ne sont pas chargés** — `/health` indique l'état de chargement. Les modèles se chargent au premier appel ou au démarrage.
8. **Gestion d'erreurs explicite partout.** Pas de fail silencieux. Le frontend affiche les erreurs clairement.
9. **Arrêt automatique VM** : un cron Vercel (`/api/vast/auto-stop`) s'exécute chaque nuit à 03h00 UTC pour éviter les coûts inutiles.
10. **gpu-api.ts détecte les erreurs ngrok** (page HTML d'interstitiel) et retourne des messages d'erreur clairs.

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

- **torchaudio >= 2.1** : `list_audio_backends()` a été supprimé. fish-speech l'appelle en interne à l'import. Monkey-patch appliqué dans `worker/main.py` ET `worker/tts.py` (top-level, avant tout import fish-speech) :
  ```python
  import torchaudio
  if not hasattr(torchaudio, "list_audio_backends"):
      torchaudio.list_audio_backends = lambda: ["soundfile"]
  ```
- **diffusers / transformers** : les versions récentes de `transformers` (>= 5.x) suppriment `FLAX_WEIGHTS_NAME` que `diffusers` importe. Pinner à `diffusers==0.32.2` + `transformers==4.47.1`.
- **flash-attn** : requis par HunyuanVideo-Avatar (`flash_attn.flash_attn_interface`). Options d'installation (dans l'ordre) :
  1. **Wheels précompilés** (rapide) : `pip install flash-attn` — fonctionne si un wheel correspond à votre combo Python/CUDA/torch
  2. **Compilation** (5-15 min) : nécessite `CUDA_HOME` + `nvcc`. Utiliser un template Vast.ai "devel" avec CUDA toolkit, ou installer manuellement : `apt install cuda-toolkit-12-1 && export CUDA_HOME=/usr/local/cuda-12.1`
  3. **Avec ninja** (accélère la compilation) : `pip install ninja && pip install flash-attn --no-build-isolation`
  - Si les wheels précompilés échouent avec "inconsistent version", c'est un bug pip connu → passer à la compilation
- **torchvision** : requis par HunyuanVideo-Avatar (`hymm_sp/data_kits/audio_dataset.py` l'importe). Installé avec PyTorch : `pip install torch torchvision torchaudio`.
- **torchcodec** : requis par torchaudio au runtime. Installer avec `pip install torchcodec`.
- **NextAuth v5** : utilise `AUTH_SECRET` comme nom de variable principal, mais `NEXTAUTH_SECRET` fonctionne aussi (voir `lib/env.ts`).

## Architecture VM (Vast.ai)

### Exigences minimales VM (CRITIQUE)

| Ressource | Minimum | Recommandé | Notes |
|-----------|---------|------------|-------|
| **GPU** | RTX 3090 (24GB) | RTX 4090 / A100 | VRAM 24GB+ avec `--cpu-offload --use-fp8` |
| **RAM** | 25GB (avec swap) | **32GB+** | 25GB → OOM kills fréquents, swap obligatoire |
| **Disque** | 150GB | **200GB+** | Poids modèle 76GB + libs 20GB + OS 10GB + swap 4-8GB |
| **Image** | devel (avec nvcc) | `pytorch:*-cuda12.1-devel` | **PAS "runtime"** — nvcc requis pour compiler flash-attn |
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
torch>=2.1 (avec CUDA, ex: cu121 ou cu128)
torchvision>=0.16 (requis par HunyuanVideo-Avatar)
torchaudio>=2.1
torchcodec>=0.10
diffusers==0.32.2
transformers==4.47.1
flash-attn>=2.5 (compilé avec nvcc, ou wheel précompilé)
ninja (accélère la compilation flash-attn)
fish-speech (pip install -e . depuis le clone)
soundfile
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
   - Ajouter `NGROK_AUTHTOKEN` et `NGROK_DOMAIN`
6. Ajouter photos + voix dans `/root/avatar-data/`
7. `ngrok config add-authtoken VOTRE_TOKEN`
8. `systemctl start avatar-worker && systemctl start avatar-ngrok`
9. Tester : `curl http://localhost:8000/health`
10. Mettre à jour `GPU_WORKER_URL` et `GPU_WORKER_TOKEN` dans Vercel

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
| Erreur ngrok "page d'erreur" | Disque plein OU URL changée | Vérifier `df -h /` puis `systemctl restart avatar-ngrok` |
| `ModuleNotFoundError: torchvision` | Pas installé | `pip install torchvision` |
| `ModuleNotFoundError: torchcodec` | Pas installé | `pip install torchcodec` |
| flash-attn compilation 30min+ | Normal avec nvcc | Attendre — 2x `cicc` à 100% CPU est normal |
| `list_audio_backends` error | torchaudio >= 2.1 | Monkey-patch dans main.py/tts.py (déjà fait) |
| `FLAX_WEIGHTS_NAME` error | transformers trop récent | `pip install diffusers==0.32.2 transformers==4.47.1` |

### Commandes de monitoring utiles

```bash
watch -n 2 nvidia-smi              # GPU (VRAM, utilisation)
journalctl -u avatar-worker -f     # Logs worker en temps réel
journalctl -u avatar-ngrok -f      # Logs ngrok
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
