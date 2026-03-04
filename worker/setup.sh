#!/usr/bin/env bash
# setup.sh — One-shot installation script for Avatar IA Worker on Vast.ai VM
# Usage: ssh into VM, then: bash setup.sh
# Tested on Ubuntu 22.04 + NVIDIA GPU (RTX 3090 / RTX 4090 / A100)

set -euo pipefail

echo "========================================="
echo "  Avatar IA Worker — VM Setup"
echo "========================================="

# --- System packages ---
echo "[1/9] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    git git-lfs python3.11 python3.11-venv python3-pip \
    ffmpeg wget curl unzip \
    libgl1-mesa-glx libglib2.0-0

# Ensure python3.11 is the default
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 2>/dev/null || true

# Init git-lfs (needed for model weight downloads)
git lfs install

# --- Data directories ---
echo "[2/9] Creating data directories..."
DATA_DIR="/root/avatar-data"
mkdir -p "$DATA_DIR"/{models/hunyuan,models/fish-audio,photos,voice,outputs}

# --- Clone project ---
echo "[3/9] Cloning project repository..."
PROJECT_DIR="/root/avatar-IA"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull origin main
else
    git clone https://github.com/bengith-hub/avatar-IA.git "$PROJECT_DIR"
fi

# --- Python environment ---
echo "[4/9] Setting up Python virtual environment..."
cd "$PROJECT_DIR/worker"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip setuptools wheel

# Install PyTorch with CUDA support first
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install worker dependencies
pip install -r requirements.txt

# --- Install FishAudio fish-speech (TTS / Voice Clone) ---
echo "[5/9] Installing FishAudio fish-speech..."
FISH_DIR="$DATA_DIR/models/fish-audio"
if [ ! -d "$FISH_DIR/fish-speech" ]; then
    cd "$FISH_DIR"
    git clone https://github.com/fishaudio/fish-speech.git
    cd fish-speech
    pip install -e .
    echo ""
    echo "  FishAudio fish-speech installed."
    echo "  Model weights will auto-download on first inference."
    echo ""
else
    echo "FishAudio fish-speech already installed, updating..."
    cd "$FISH_DIR/fish-speech"
    git pull origin main
    pip install -e .
fi

# --- Install HunyuanVideo-Avatar ---
echo "[6/9] Installing HunyuanVideo-Avatar..."
HUNYUAN_DIR="$DATA_DIR/models/hunyuan"
if [ ! -d "$HUNYUAN_DIR/HunyuanVideo-Avatar" ]; then
    cd "$HUNYUAN_DIR"
    git clone https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar.git
    cd HunyuanVideo-Avatar
    pip install -e .
    echo ""
    echo "  HunyuanVideo-Avatar installed."
    echo ""
else
    echo "HunyuanVideo-Avatar already installed, updating..."
    cd "$HUNYUAN_DIR/HunyuanVideo-Avatar"
    git pull origin main
    pip install -e .
fi

# --- Download HunyuanVideo-Avatar model weights ---
echo "[7/9] Downloading model weights (this may take a while)..."
cd "$HUNYUAN_DIR/HunyuanVideo-Avatar"

# Download weights using huggingface-cli if available
if command -v huggingface-cli &> /dev/null; then
    echo "Downloading HunyuanVideo-Avatar weights from HuggingFace..."
    huggingface-cli download tencent/HunyuanVideo-Avatar \
        --local-dir ckpts \
        --local-dir-use-symlinks False \
        2>/dev/null || echo "  Warning: HuggingFace download may need manual setup."
else
    pip install huggingface_hub
    python3 -c "
from huggingface_hub import snapshot_download
try:
    snapshot_download(
        repo_id='tencent/HunyuanVideo-Avatar',
        local_dir='ckpts',
        local_dir_use_symlinks=False,
    )
    print('Model weights downloaded successfully.')
except Exception as e:
    print(f'Warning: Could not auto-download weights: {e}')
    print('You may need to download manually. See README.')
"
fi

# --- Environment file ---
echo "[8/9] Setting up environment..."
ENV_FILE="$PROJECT_DIR/worker/.env"
if [ ! -f "$ENV_FILE" ]; then
    # Generate a random secure token
    RANDOM_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    cat > "$ENV_FILE" << ENVEOF
WORKER_TOKEN=$RANDOM_TOKEN
HUNYUAN_MODEL_PATH=/root/avatar-data/models/hunyuan
FISH_MODEL_PATH=/root/avatar-data/models/fish-audio
PHOTOS_PATH=/root/avatar-data/photos
VOICE_PATH=/root/avatar-data/voice
OUTPUT_PATH=/root/avatar-data/outputs
ENVEOF
    echo "Created .env file at $ENV_FILE"
    echo "  WORKER_TOKEN=$RANDOM_TOKEN"
    echo "  >>> SAVE THIS TOKEN — you'll need it for the frontend config <<<"
else
    echo ".env already exists, skipping."
fi

# --- Systemd service ---
echo "[9/9] Setting up systemd service..."
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
echo "  1. Add your reference photos to: $DATA_DIR/photos/"
echo "     (Full body photo of Benjamin, .png or .jpg, good lighting)"
echo "  2. Add your voice sample to:     $DATA_DIR/voice/"
echo "     (10-30s .wav of Benjamin speaking clearly)"
echo "  3. Note your WORKER_TOKEN from above — add it to Vercel env vars"
echo "  4. Start the worker:             systemctl start avatar-worker"
echo "  5. Check logs:                   journalctl -u avatar-worker -f"
echo "  6. Test health:                  curl http://localhost:8000/health"
echo ""
echo "VM public URL format: http://<VM_IP>:8000"
echo "Add this as GPU_WORKER_URL in your Vercel environment variables."
echo ""
