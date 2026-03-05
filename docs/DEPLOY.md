# Déploiement Avatar IA

## 1. Frontend — Vercel

### Prérequis
- Compte GitHub (bengith-hub)
- Compte Vercel (gratuit)

### Étapes

1. Connecter le repo à Vercel :
   - Aller sur [vercel.com](https://vercel.com)
   - "Add New Project" → importer `bengith-hub/avatar-IA`
   - Root Directory : `frontend`
   - Framework : Next.js (détecté automatiquement)

2. Configurer les variables d'environnement dans Vercel :
   ```
   NEXTAUTH_SECRET=<générer avec: openssl rand -base64 32>
   NEXTAUTH_URL=https://avatar-ia.vercel.app
   AUTH_USERNAME=benjamin
   AUTH_PASSWORD_HASH=<sha256 de votre mot de passe>

   VAST_API_KEY=<votre clé Vast.ai>
   VAST_INSTANCE_ID=<ID de votre instance>

   GPU_WORKER_URL=https://votre-domaine.ngrok-free.app
   GPU_WORKER_TOKEN=<token sécurisé (généré par setup.sh)>

   PEXELS_API_KEY=<votre clé Pexels>
   ANTHROPIC_API_KEY=<votre clé Anthropic>

   CANVA_CLIENT_ID=<optionnel, phase 2>
   CANVA_CLIENT_SECRET=<optionnel>
   CANVA_ACCESS_TOKEN=<optionnel>

   R2_ACCOUNT_ID=<optionnel, phase 2>
   R2_ACCESS_KEY=<optionnel>
   R2_SECRET_KEY=<optionnel>
   R2_BUCKET=avatar-videos
   ```

3. Générer le hash du mot de passe :
   ```bash
   echo -n "votre_mot_de_passe" | shasum -a 256
   ```

4. Déployer : push sur `main` → Vercel déploie automatiquement

---

## 2. Worker — VM GPU Vast.ai

### Louer une VM

1. Aller sur [vast.ai](https://vast.ai)
2. Choisir une instance :
   - GPU : RTX 4090 (24GB) ou A100 (40/80GB)
   - OS : Ubuntu 22.04
   - Disk : 50GB minimum
   - Coût : ~$0.40-1.00/h
3. Noter l'ID de l'instance (pour `VAST_INSTANCE_ID`)

### Installer le worker

```bash
# Se connecter via SSH (infos dans le dashboard Vast.ai)
ssh -p <port> root@<ip>

# Cloner et installer
git clone https://github.com/bengith-hub/avatar-IA.git
cd avatar-IA/worker
bash setup.sh

# Configurer le token
nano .env
# → Mettre un WORKER_TOKEN sécurisé (le même que dans Vercel)

# Démarrer
systemctl start avatar-worker

# Vérifier
curl http://localhost:8000/health
```

### Configurer le tunnel ngrok (URL publique stable)

La VM Vast.ai (KVM) n'expose pas les ports directement. On utilise **ngrok** avec
un **domaine statique gratuit** — l'URL ne change jamais, même après redémarrage.

1. Créer un compte gratuit sur [ngrok.com](https://ngrok.com)
2. Dashboard ngrok → **Your Authtoken** → copier le token
3. Dashboard ngrok → **Domains** → **New Domain** (gratuit, 1 par compte)
   - Vous obtiendrez une URL comme `votre-nom.ngrok-free.app`
4. Sur la VM, éditer `.env` :
   ```bash
   nano /root/avatar-IA/worker/.env
   ```
   Remplir :
   ```
   NGROK_AUTHTOKEN=votre_token_ici
   NGROK_DOMAIN=votre-nom.ngrok-free.app
   ```
5. Configurer ngrok et démarrer le tunnel :
   ```bash
   ngrok config add-authtoken VOTRE_TOKEN
   systemctl start avatar-ngrok
   ```
6. Vérifier :
   ```bash
   curl https://votre-nom.ngrok-free.app/health
   ```
7. Dans **Vercel**, mettre `GPU_WORKER_URL=https://votre-nom.ngrok-free.app`
   - **Cette URL ne change jamais** — à configurer une seule fois.

---

## 3. Assets Benjamin

### Photos de référence

Déposer 3-5 photos dans `/root/avatar-data/photos/` sur la VM :
- `benjamin-buste.png` — photo buste, fond neutre
- `benjamin-pied.png` — photo pied, corps entier
- `benjamin-assis.png` — photo assis

Recommandations :
- Résolution : 1024x1024 minimum
- Fond : neutre (uni ou flou)
- Éclairage : naturel, visage bien éclairé
- Regard : face caméra

### Échantillon vocal

Déposer un fichier audio dans `/root/avatar-data/voice/` :
- `benjamin_ref.wav` — 10-30 secondes de parole naturelle
- Format : WAV 16kHz mono (ou tout format audio courant)
- Contenu : parler naturellement, phrases variées
- Environnement : calme, pas de musique de fond

---

## 4. Obtenir les clés API

### Vast.ai
- Dashboard → Account → API Key

### Pexels
- [pexels.com/api](https://www.pexels.com/api/) → "Get Started" → gratuit

### Anthropic (Claude)
- [console.anthropic.com](https://console.anthropic.com) → API Keys

### Canva Connect (optionnel, phase 2)
- [canva.dev](https://www.canva.dev) → créer une app → obtenir les credentials

### Cloudflare R2 (optionnel, phase 2)
- [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → créer un bucket

---

## 5. Test end-to-end

1. Ouvrir `https://avatar-ia.vercel.app`
2. Se connecter avec les credentials configurés
3. Dashboard → "Démarrer" la VM
4. Attendre que le statut passe à "Active"
5. Aller dans "Générer"
6. Taper un texte, choisir langue/avatar/émotion
7. Cliquer "Générer la vidéo"
8. Attendre la progression (~5-10 min)
9. Prévisualiser et télécharger le MP4

---

## 6. Commandes utiles

```bash
# Logs du worker
journalctl -u avatar-worker -f

# Logs du tunnel ngrok
journalctl -u avatar-ngrok -f

# Redémarrer le worker + tunnel
systemctl restart avatar-worker
systemctl restart avatar-ngrok

# Mettre à jour le code
cd /root/avatar-IA && git pull && systemctl restart avatar-worker

# Tester le worker localement
curl http://localhost:8000/health

# Tester via le tunnel ngrok
curl https://votre-domaine.ngrok-free.app/health
```
