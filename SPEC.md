# SPEC.md — Spécification complète du projet Avatar IA

> Document de référence produit. Décrit le quoi et le pourquoi.
> Le CLAUDE.md à la racine décrit le comment (instructions de développement).
> Dernière mise à jour : 4 mars 2026

---

## 1. Identité du projet

**Porteur** : Benjamin, fondateur d'Amarillo Search (recrutement IT, Toulouse)
**Machine locale** : MacBook Air M4 (pas de GPU NVIDIA)
**Philosophie** : Zéro abonnement SaaS supplémentaire. Propriété totale. Coûts GPU ponctuels.
**Comptes existants** : Canva Pro, Vast.ai, GitHub

---

## 2. Vision produit

### L'ambition

Un équivalent personnel de HeyGen — un site web privé pour produire des vidéos avatar réalistes, avec Canva Pro comme éditeur de finition intégré.

### Ce que l'avatar doit faire

- Corps entier en mouvement (pas un simple talking head)
- Scènes réalistes : bureau, ville, salon professionnel, restaurant
- Scènes créatives : décors fantaisistes, studio futuriste, espace
- Mouvements complexes : corps entier avec mouvements dynamiques
- Voix clonée multilingue : texte → voix de Benjamin en FR, EN, ES, DE, etc.
- Format : clips courts 15-60 secondes (LinkedIn, Reels, présentations)
- Qualité maximale prioritaire (10 min de calcul par clip = acceptable)

### Utilisateur unique

Benjamin uniquement. Interface protégée par login. Pas de multi-utilisateur prévu.

---

## 3. Workflow utilisateur

```
┌─ INTERFACE WEB (avatar-ia.vercel.app) ──────────────────────┐
│                                                              │
│  1. Dashboard → "Démarrer GPU" (1 clic)                     │
│  2. Nouvelle vidéo :                                         │
│     → Écrire le texte OU "Générer script" (IA)              │
│     → Choisir langue (FR/EN/ES/...)                          │
│     → Choisir avatar (Benjamin buste/pied/assis)             │
│     → Choisir décor (recherche Pexels + upload custom)       │
│     → "Générer" → attente ~5-10 min → preview clip brut     │
│  3. "Ouvrir dans Canva" (1 clic)                             │
│     → Le clip est uploadé automatiquement dans Canva         │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌─ CANVA PRO (éditeur) ───────────────────────────────────────┐
│                                                              │
│  4. Assembler plusieurs clips sur la timeline Canva          │
│  5. Ajouter : intro, outro, transitions, texte, musique     │
│  6. Appliquer le Brand Kit Amarillo Search (logo, couleurs)  │
│  7. Exporter MP4 (16:9 ou 9:16)                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Principe : l'interface fait la magie IA (ce que Canva ne sait pas faire), Canva fait la finition (ce qu'il fait mieux que tout ce qu'on pourrait construire). Zéro terminal. Zéro Vast.ai. Tout dans le navigateur.

---

## 4. Fonctionnalités

### 4.1 Dashboard GPU

- Statut VM en temps réel (éteinte / démarrage / active)
- Boutons Start / Stop
- Coût de la session en cours + coût du mois
- Auto-stop après X minutes d'inactivité (configurable)
- Alertes budget mensuel

### 4.2 Génération de scènes

- Texte libre : Benjamin tape ce que l'avatar doit dire
- Assistant script IA : un prompt → Claude génère un script structuré
- Choix de langue : FR, EN, ES, DE, etc. (clone vocal multilingue)
- Choix d'avatar : sélection parmi les photos de référence
- Choix de décor :
  - Bibliothèque intégrée avec recherche (API Pexels : photos + vidéos gratuites)
  - Upload d'image/vidéo custom
  - Fonds prédéfinis (flou studio, couleur unie, dégradé)
  - Canva Pro (bibliothèque complète dans l'éditeur de finition)
- Choix d'émotion : neutre, enthousiaste, sérieux, amical
- Preview de la scène générée avant validation

### 4.3 Intégration Canva

- Upload automatique du clip brut vers Canva via Connect API
- Bouton "Ouvrir dans Canva" → l'éditeur Canva s'ouvre avec le clip
- Brand Kit Amarillo Search appliqué automatiquement
- Optionnel (phase future) : récupérer l'export final dans la galerie

### 4.4 Galerie

- Historique de toutes les vidéos générées
- Preview, re-téléchargement, suppression
- Filtres par date, durée, langue

### 4.5 Gestion des avatars

- Upload de nouvelles photos de référence
- Organisation par pose/cadrage
- Échantillon vocal : upload + re-enregistrement

---

## 5. Architecture technique

```
┌──────────────────────────────────────────────────────────────┐
│                    NAVIGATEUR (Mac)                            │
│               https://avatar-ia.vercel.app                    │
│   ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐           │
│   │Dashbrd │ │ Générer  │ │Galerie │ │ Avatars  │           │
│   │  GPU   │ │  Scène   │ │ Vidéos │ │ & Voix   │           │
│   └────────┘ └──────────┘ └────────┘ └──────────┘           │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌──────────────────────────────────────────────────────────────┐
│               VERCEL (hébergement gratuit)                    │
│                                                               │
│   Next.js App                                                 │
│   ├── Auth (NextAuth, login privé)                            │
│   ├── /api/vast/*    → Vast.ai API (start/stop/billing)      │
│   ├── /api/gpu/*     → Worker API sur VM                      │
│   ├── /api/pexels/*  → Pexels API (décors)                   │
│   ├── /api/ai/*      → Anthropic API (scripts)               │
│   ├── /api/canva/*   → Canva Connect API (upload + ouvrir)   │
│   └── Cloudflare R2  → Stockage vidéos générées              │
└────────────┬──────────┬──────────┬───────────────────────────┘
             │          │          │
     ┌───────▼──┐  ┌────▼──────┐  ┌───────▼────────┐
     │ Vast.ai  │  │ VM GPU    │  │  Canva Pro     │
     │ API      │  │ Ubuntu    │  │  Connect API   │
     │start/stop│  │ + NVIDIA  │  │                │
     └──────────┘  │           │  │ • Upload clip  │
                   │ Worker    │  │ • Create design│
                   │ FastAPI   │  │ • Brand Kit    │
                   │           │  │ • Export MP4   │
                   │ Pipeline: │  └────────────────┘
                   │ FishAudio │
                   │ → Hunyuan │
                   │ → ffmpeg  │
                   └───────────┘
```

### Frontend — Next.js sur Vercel (gratuit)

| Composant | Choix | Pourquoi |
|-----------|-------|----------|
| Framework | Next.js 14+ (App Router, TypeScript) | SSR, API routes, Vercel natif |
| Hébergement | Vercel gratuit | HTTPS auto, CI/CD GitHub |
| Auth | NextAuth.js credentials | Login privé Benjamin |
| Styling | Tailwind CSS + shadcn/ui | Rapide, propre, composants prêts |
| Recherche décors | API Pexels (gratuite) | Photos + vidéos HD par mots-clés |
| Script IA | API Anthropic (Claude) | Génération de scripts structurés |
| Intégration Canva | Canva Connect API | Upload clip → ouvrir dans éditeur |
| Stockage vidéos | Cloudflare R2 (gratuit ≤10GB) | S3-compatible |

### Worker — FastAPI sur VM GPU

Serveur Python sur la VM Vast.ai, expose une API REST sécurisée par token.

| Endpoint | Rôle |
|----------|------|
| GET /health | Statut VM + GPU |
| POST /generate | Lance génération (texte, langue, avatar, décor, émotion) |
| GET /status/{job_id} | Statut job |
| GET /jobs | Liste jobs récents |
| GET /download/{job_id} | Télécharge MP4 |
| GET /avatars | Liste photos référence |
| POST /avatars | Upload nouvelle photo |

### Pilotage Vast.ai

| Action | API |
|--------|-----|
| Démarrer VM | PUT /api/v0/instances/{id}/ {"state":"running"} |
| Arrêter VM | PUT /api/v0/instances/{id}/ {"state":"stopped"} |
| Statut | GET /api/v0/instances/{id}/ |
| Billing | GET /api/v0/users/current/ |

---

## 6. Stack IA

### HunyuanVideo-Avatar — Animation avatar

Photo + audio → vidéo corps entier animée, lip-sync, émotions.
Portrait / buste / corps entier. Fond dynamique. Contrôle émotionnel.
GPU : 10GB min (TeaCache), 24GB+ recommandé. Open-source (Tencent, mai 2025).
Repo : https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar

### FishAudio S1 — Clone vocal multilingue

Texte → voix de Benjamin. Clone zero-shot (10-30s ref). 13+ langues.
Marqueurs d'émotion, contrôle du ton. GPU : 4GB min.
Repo : https://github.com/fishaudio/fish-speech

### ffmpeg — Post-production

H.264 yuv420p, audio 16kHz mono. Formats 16:9 et 9:16. Sous-titres optionnels.
Compositing décor si nécessaire (segmentation + fond).

### Décors

| Source | Usage |
|--------|-------|
| HunyuanVideo natif | Fond dynamique si la photo de ref inclut un contexte |
| Pexels API | Recherche dans l'UI, composité via ffmpeg |
| Upload custom | Image/vidéo uploadée par Benjamin |
| Fonds simples | Flou, couleur unie (ffmpeg) |
| Canva Pro | Bibliothèque complète dans l'éditeur de finition |

---

## 7. Plan d'implémentation

### Phase 1 — MVP (semaines 1-3)

Objectif : premier clip fonctionnel via l'interface web.

1. Initialiser repo GitHub (Next.js + worker)
2. Frontend : Dashboard GPU (start/stop/statut/coûts)
3. Frontend : page Générer (texte, langue, avatar, décor basique)
4. Worker API (FastAPI) : endpoints generate, status, download
5. Installer HunyuanVideo-Avatar sur VM Vast.ai (RTX 4090 / A100)
6. Installer FishAudio S1-mini
7. Pipeline : texte → TTS → avatar → ffmpeg → MP4
8. Connecter Vercel ↔ Vast.ai ↔ Worker
9. Déployer sur Vercel + premier test end-to-end
10. Assets Benjamin : 3-5 photos ref + échantillon vocal 30s

Livrable : taper du texte → récupérer un MP4 de Benjamin parlant.

### Phase 2 — Canva + décors + qualité (semaines 4-6)

1. Intégration Canva Connect API : upload clip + "Ouvrir dans Canva"
2. Intégration Pexels : recherche décors dans l'UI
3. 5-10 photos de référence variées
4. Choix d'émotion dans l'UI
5. Formats de sortie (16:9, 9:16)
6. Optimisation temps de génération (TeaCache)

Livrable : générer → ouvrir dans Canva → habiller → exporter.

### Phase 3 — Script IA + polish (semaines 7-9)

1. Assistant script IA (API Anthropic)
2. Galerie avec historique + re-téléchargement
3. Auto-stop VM après inactivité
4. Monitoring coûts + alertes budget
5. Sous-titres automatiques

### Phase 4 — Avancé (semaines 10+)

1. Segmentation avancée + compositing décors complexes
2. Wan2.2 pour décors fantaisistes (text-to-video)
3. Export Canva → retour dans la galerie
4. Backup assets sur R2

---

## 8. Comparatif vs HeyGen

| Fonctionnalité HeyGen | Notre solution | Écart |
|------------------------|---------------|-------|
| Avatar IV (photo → vidéo animée) | HunyuanVideo-Avatar | Comparable |
| Voice cloning multilingue | FishAudio S1 | Comparable |
| Video Agent (prompt → vidéo) | Script IA (Claude) + génération | Similaire, 2 étapes |
| Éditeur timeline | Canva Pro | Canva est meilleur |
| Bibliothèque templates/assets | Canva Pro + Pexels | Canva est meilleur |
| Brand Kit | Canva Pro | Identique |
| 175 langues | 13+ langues | HeyGen a plus |
| Rendu ~3 min | Rendu ~5-10 min | HeyGen plus rapide |
| Prix | 5-15€/mois vs 24-59$/mois | Nous gagnons |
| Propriété données | 100% Benjamin | Nous gagnons |
| Limites de minutes | Aucune | Nous gagnons |

---

## 9. Coûts estimés

| Poste | Coût | Notes |
|-------|------|-------|
| Vercel | Gratuit | Plan Hobby |
| Cloudflare R2 | Gratuit | ≤10GB/mois |
| Pexels API | Gratuit | — |
| Anthropic API | ~0.01-0.05€/script | Par usage |
| Canva Pro | Déjà payé | Existant |
| GPU Vast.ai | ~0.40-1.00€/h | Uniquement quand allumé |
| Domaine (optionnel) | ~10€/an | — |

Coût marginal mensuel (10-20 vidéos) : ~5-15€
vs HeyGen Creator : 24-59$/mois + limites

---

## 10. Liens

| Ressource | URL |
|-----------|-----|
| Repo projet | https://github.com/bengith-hub/avatar-IA |
| HunyuanVideo-Avatar | https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar |
| FishAudio S1 | https://github.com/fishaudio/fish-speech |
| Vast.ai API | https://docs.vast.ai/api |
| Pexels API | https://www.pexels.com/api/documentation/ |
| Canva Connect API | https://www.canva.dev/docs/connect/ |
| Anthropic API | https://docs.anthropic.com |
| Next.js | https://nextjs.org |
| Vercel | https://vercel.com |
| Cloudflare R2 | https://www.cloudflare.com/r2 |
