# Stack Technique — Avatar IA

## Vue d'ensemble

Application web privée de génération de vidéos avatar IA (corps entier, voix clonée multilingue).
Monorepo avec deux apps : un frontend Next.js et un worker GPU Python.

---

## Architecture

```
avatar-IA/
├── frontend/    → Next.js (Vercel)
├── worker/      → FastAPI (VM GPU Vast.ai)
├── assets/      → Photos ref + voix (sur VM, git-ignored)
└── docs/        → Documentation
```

---

## Frontend

| Élément | Technologie |
|---------|-------------|
| Framework | Next.js 14+ (App Router) |
| Langage | TypeScript (strict) |
| Styling | Tailwind CSS |
| Composants UI | shadcn/ui |
| Auth | NextAuth.js (CredentialsProvider, 1 utilisateur) |
| État | React hooks (useState, useEffect, useSWR) |
| Hébergement | Vercel (plan gratuit) |

---

## Worker GPU

| Élément | Technologie |
|---------|-------------|
| Framework | FastAPI (Python 3.11+) |
| Runtime | VM GPU Vast.ai (Ubuntu 22.04) |
| GPU | RTX 4090 ou A100 |
| Animation vidéo | HunyuanVideo-Avatar (Tencent) |
| Synthèse vocale | FishAudio S1-mini (TTS, clone vocal zero-shot) |
| Post-production | ffmpeg |
| Validation | Pydantic v2 |
| Linter / Formatter | ruff / black |

---

## APIs & Services externes

| Service | Rôle | Côté |
|---------|------|------|
| **Vast.ai** | Location VM GPU (start/stop, billing) | Frontend (API routes) |
| **Pexels** | Recherche décors (photos + vidéos) | Frontend (API routes) |
| **Anthropic Claude** | Génération de scripts IA | Frontend (API routes) |
| **Astria** | Génération photos avatar IA (fine-tuné) | Frontend (API routes) |
| **Canva Connect** | Upload vidéo → édition dans Canva Pro | Frontend (API routes) |
| **Cloudflare R2** | Stockage vidéos & assets (S3-compatible) | Frontend (API routes) |
| **FishAudio S1** | TTS multilingue + clone vocal (13+ langues) | Worker GPU |
| **HunyuanVideo-Avatar** | Photo + audio → vidéo avatar réaliste | Worker GPU |

---

## Langues supportées (TTS)

Français, Anglais, Allemand, Espagnol, Japonais, Coréen, Arabe, Chinois, Russe, Néerlandais, Italien, Polonais, Portugais

---

## Infrastructure

```
Navigateur
    ↓ HTTPS
Vercel (Next.js frontend)
    ↓ API Routes (protègent les clés)
    ├── Vast.ai API (gestion VM)
    ├── Pexels API (décors)
    ├── Anthropic API (scripts)
    ├── Astria API (photos avatar)
    ├── Canva Connect API (export)
    ├── Cloudflare R2 (stockage)
    └── Worker GPU (via ngrok/tunnel)
            ├── FishAudio S1 (TTS)
            ├── HunyuanVideo-Avatar (vidéo)
            └── ffmpeg (post-prod)
```

---

## Pipeline de génération

```
Texte (script) → TTS (voix clonée) → Avatar (vidéo) → ffmpeg (post-prod) → R2 (stockage) → Canva (finition)
```

1. L'utilisateur saisit un texte + choisit avatar + décor
2. FishAudio clone la voix et génère l'audio (WAV)
3. HunyuanVideo-Avatar anime l'avatar avec l'audio
4. ffmpeg normalise et compose la vidéo finale (MP4)
5. La vidéo est stockée sur Cloudflare R2
6. Export possible vers Canva Pro pour la finition

---

## Déploiement

- **Frontend** : push sur `main` → déploiement automatique Vercel
- **Worker** : SSH sur VM → `git pull` → `systemctl restart avatar-worker`
