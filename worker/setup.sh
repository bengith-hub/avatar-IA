#!/usr/bin/env bash
# setup.sh — One-shot installation script for Avatar IA Worker on Vast.ai VM
# Usage: ssh into VM, then: bash setup.sh
# Tested on Ubuntu 22.04 + NVIDIA GPU (RTX 4090 / A100)

set -euo pipefail

echo "========================================="
echo "  Avatar IA Worker — VM Setup"
echo "========================================="

# --- System packages ---
echo "[1/8] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    git python3.11 python3.11-venv python3-pip \
    ffmpeg wget curl unzip \
    libgl1-mesa-glx libglib2.0-0

# Ensure python3.11 is the default
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 2>/dev/null || true

# --- Data directories ---
echo "[2/8] Creating data directories..."
DATA_DIR="/root/avatar-data"
mkdir -p "$DATA_DIR"/{models/hunyuan,models/fish-audio,photos,voice,outputs}

# --- Clone project ---
echo "[3/8] Cloning project repository..."
PROJECT_DIR="/root/avatar-IA"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull origin main
else
    git clone https://github.com/bengith-hub/avatar-IA.git "$PROJECT_DIR"
fi

# --- Python environment ---
echo "[4/8] Setting up Python virtual environment..."
cd "$PROJECT_DIR/worker"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# --- Install FishAudio S1 (TTS / Voice Clone) ---
echo "[5/8] Installing FishAudio S1..."
FISH_DIR="$DATA_DIR/models/fish-audio"
if [ ! -d "$FISH_DIR/fish-speech" ]; then
    cd "$FISH_DIR"
    git clone https://github.com/fishaudio/fish-speech.git
    cd fish-speech
    pip install -e .
    echo "FishAudio S1 installed. Model weights will be downloaded on first run."
else
    echo "FishAudio S1 already installed, skipping."
fi

# --- Install HunyuanVideo-Avatar ---
echo "[6/8] Installing HunyuanVideo-Avatar..."
HUNYUAN_DIR="$DATA_DIR/models/hunyuan"
if [ ! -d "$HUNYUAN_DIR/HunyuanVideo-Avatar" ]; then
    cd "$HUNYUAN_DIR"
    git clone https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar.git
    cd HunyuanVideo-Avatar
    pip install -e .
    echo "HunyuanVideo-Avatar installed. Model weights will be downloaded on first run."
else
    echo "HunyuanVideo-Avatar already installed, skipping."
fi

# --- Environment file ---
echo "[7/8] Setting up environment..."
ENV_FILE="$PROJECT_DIR/worker/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'ENVEOF'
WORKER_TOKEN=CHANGE_ME_TO_A_SECURE_TOKEN
HUNYUAN_MODEL_PATH=/root/avatar-data/models/hunyuan
FISH_MODEL_PATH=/root/avatar-data/models/fish-audio
PHOTOS_PATH=/root/avatar-data/photos
VOICE_PATH=/root/avatar-data/voice
OUTPUT_PATH=/root/avatar-data/outputs
ENVEOF
    echo "Created .env file at $ENV_FILE — EDIT THE TOKEN!"
else
    echo ".env already exists, skipping."
fi

# --- Systemd service ---
echo "[8/8] Setting up systemd service..."
cat > /etc/systemd/system/avatar-worker.service << EOF
[Unit]
Description=Avatar IA Worker (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR/worker
Environment=PATH=$PROJECT_DIR/worker/venv/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=$PROJECT_DIR/worker/.env
ExecStart=$PROJECT_DIR/worker/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable avatar-worker

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Edit the worker token:  nano $ENV_FILE"
echo "  2. Add your reference photos to: $DATA_DIR/photos/"
echo "  3. Add your voice sample to:     $DATA_DIR/voice/"
echo "  4. Start the worker:             systemctl start avatar-worker"
echo "  5. Check logs:                   journalctl -u avatar-worker -f"
echo "  6. Test health:                  curl http://localhost:8000/health"
echo ""
