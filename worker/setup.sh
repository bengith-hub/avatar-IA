#!/usr/bin/env bash
# setup.sh — One-shot installation script for Avatar IA Worker on Vast.ai VM
# Usage: ssh into VM, then: bash setup.sh
# Tested on Ubuntu 22.04 + NVIDIA GPU (RTX 3090 24GB)
#
# IMPORTANT: Choose a Vast.ai template with CUDA toolkit included (e.g. "pytorch/pytorch:*-devel")
# or one that already has nvcc. This is required for compiling flash-attn.

set -euo pipefail

echo "========================================="
echo "  Avatar IA Worker — VM Setup"
echo "========================================="

# --- System packages ---
echo "[1/11] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    git git-lfs \
    ffmpeg wget curl unzip \
    libgl1-mesa-glx libglib2.0-0 \
    libsndfile1 sox

# Init git-lfs (needed for model weight downloads)
git lfs install

# --- Detect CUDA ---
echo "[2/11] Detecting CUDA installation..."
if [ -z "${CUDA_HOME:-}" ]; then
    # Try common locations
    for cuda_dir in /usr/local/cuda /usr/local/cuda-12.8 /usr/local/cuda-12.1 /usr/local/cuda-12.0; do
        if [ -d "$cuda_dir" ] && [ -f "$cuda_dir/bin/nvcc" ]; then
            export CUDA_HOME="$cuda_dir"
            break
        fi
    done
fi

if [ -z "${CUDA_HOME:-}" ]; then
    echo "WARNING: CUDA_HOME not found. flash-attn compilation will fail."
    echo "Make sure you use a Vast.ai template with CUDA toolkit (devel image)."
    echo "You can set it manually: export CUDA_HOME=/path/to/cuda"
else
    echo "CUDA_HOME=$CUDA_HOME"
    export PATH="$CUDA_HOME/bin:$PATH"
    export LD_LIBRARY_PATH="${CUDA_HOME}/lib64:${LD_LIBRARY_PATH:-}"
fi

# --- Data directories ---
echo "[3/11] Creating data directories..."
DATA_DIR="/root/avatar-data"
mkdir -p "$DATA_DIR"/{models/hunyuan,models/fish-audio,photos,voice,outputs}

# --- Clone project ---
echo "[4/11] Cloning project repository..."
PROJECT_DIR="/root/avatar-IA"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull origin main
else
    git clone https://github.com/bengith-hub/avatar-IA.git "$PROJECT_DIR"
fi

# --- Python dependencies (system-wide, no venv) ---
echo "[5/11] Installing Python dependencies..."
cd "$PROJECT_DIR/worker"
pip install --upgrade pip setuptools wheel

# Install PyTorch with CUDA support (use cu121 for broad compat, cu128 if available)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install worker dependencies
pip install -r requirements.txt

# Additional runtime dependencies discovered during testing
pip install torchcodec soundfile

# Pin diffusers/transformers versions (newer versions have breaking import changes)
pip install diffusers==0.32.2 transformers==4.47.1

# --- Install flash-attn (required by HunyuanVideo-Avatar) ---
echo "[6/11] Installing flash-attn (this takes 5-15 minutes to compile)..."
if [ -n "${CUDA_HOME:-}" ]; then
    pip install flash-attn --no-build-isolation || {
        echo "WARNING: flash-attn compilation failed. Trying with ninja..."
        pip install ninja
        pip install flash-attn --no-build-isolation || {
            echo "ERROR: flash-attn could not be installed. HunyuanVideo-Avatar will not work."
            echo "Try: apt install cuda-toolkit-12-1 && export CUDA_HOME=/usr/local/cuda-12.1"
        }
    }
else
    echo "SKIPPED: flash-attn requires CUDA_HOME with nvcc. Install manually later."
fi

# --- Install FishAudio fish-speech (TTS / Voice Clone) ---
echo "[7/11] Installing FishAudio fish-speech..."
FISH_DIR="$DATA_DIR/models/fish-audio"
if [ ! -d "$FISH_DIR/fish-speech" ]; then
    cd "$FISH_DIR"
    git clone https://github.com/fishaudio/fish-speech.git
    cd fish-speech
    pip install -e .
else
    echo "FishAudio fish-speech already installed, updating..."
    cd "$FISH_DIR/fish-speech"
    git pull origin main
    pip install -e .
fi

# Download OpenAudio S1-mini model weights
echo "Downloading OpenAudio S1-mini model weights..."
pip install huggingface_hub
python3 -c "
from huggingface_hub import snapshot_download
try:
    snapshot_download(
        repo_id='fishaudio/openaudio-s1-mini',
        local_dir='$FISH_DIR/openaudio-s1-mini',
    )
    print('OpenAudio S1-mini weights downloaded.')
except Exception as e:
    print(f'Warning: Could not download S1-mini weights: {e}')
"

# --- Install HunyuanVideo-Avatar ---
echo "[8/11] Installing HunyuanVideo-Avatar..."
HUNYUAN_INSTALL="/root/HunyuanVideo-Avatar"
if [ ! -d "$HUNYUAN_INSTALL" ]; then
    git clone https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar.git "$HUNYUAN_INSTALL"
    cd "$HUNYUAN_INSTALL"
    pip install -e . 2>/dev/null || echo "HunyuanVideo-Avatar pip install skipped (deps handled above)"
else
    echo "HunyuanVideo-Avatar already installed, updating..."
    cd "$HUNYUAN_INSTALL"
    git pull origin main
fi

# --- Download HunyuanVideo-Avatar model weights ---
echo "[9/11] Downloading HunyuanVideo-Avatar weights (this may take a while — ~76GB)..."
cd "$HUNYUAN_INSTALL"
python3 -c "
from huggingface_hub import snapshot_download
try:
    snapshot_download(
        repo_id='tencent/HunyuanVideo-Avatar',
        local_dir='weights',
    )
    print('HunyuanVideo-Avatar weights downloaded successfully.')
except Exception as e:
    print(f'Warning: Could not auto-download weights: {e}')
    print('Download manually: huggingface-cli download tencent/HunyuanVideo-Avatar --local-dir weights/')
"

# --- Environment file ---
echo "[10/11] Setting up environment..."
ENV_FILE="$PROJECT_DIR/worker/.env"
if [ ! -f "$ENV_FILE" ]; then
    RANDOM_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    cat > "$ENV_FILE" << ENVEOF
WORKER_TOKEN=$RANDOM_TOKEN
HUNYUAN_MODEL_PATH=/root/avatar-data/models/hunyuan
HUNYUAN_INSTALL_PATH=/root/HunyuanVideo-Avatar
FISH_MODEL_PATH=/root/avatar-data/models/fish-audio
PHOTOS_PATH=/root/avatar-data/photos
VOICE_PATH=/root/avatar-data/voice
OUTPUT_PATH=/root/avatar-data/outputs
NGROK_AUTHTOKEN=
NGROK_DOMAIN=
ENVEOF
    echo "Created .env file at $ENV_FILE"
    echo "  WORKER_TOKEN=$RANDOM_TOKEN"
    echo "  >>> SAVE THIS TOKEN — you'll need it for the frontend config <<<"
else
    echo ".env already exists, skipping."
fi

# --- Systemd services ---
echo "[11/11] Setting up systemd services..."

# Worker service (no venv — using system Python)
cat > /etc/systemd/system/avatar-worker.service << EOF
[Unit]
Description=Avatar IA Worker (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR/worker
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=$PROJECT_DIR/worker/.env
ExecStart=/usr/local/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Install ngrok
if ! command -v ngrok &> /dev/null; then
    curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
        | tee /etc/apt/trusted.gpg.d/ngrok.asc > /dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
        | tee /etc/apt/sources.list.d/ngrok.list
    apt-get update -qq
    apt-get install -y -qq ngrok
fi

# ngrok tunnel service
cat > /etc/systemd/system/avatar-ngrok.service << EOF
[Unit]
Description=Avatar IA ngrok tunnel
After=avatar-worker.service
Requires=avatar-worker.service

[Service]
Type=simple
User=root
EnvironmentFile=$PROJECT_DIR/worker/.env
ExecStart=/usr/local/bin/ngrok http 8000 --domain=\${NGROK_DOMAIN} --log=stdout
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable avatar-worker
systemctl enable avatar-ngrok

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Add reference photos to: $DATA_DIR/photos/"
echo "     (Full body photo of Benjamin, .png or .jpg, good lighting)"
echo "  2. Add voice sample to:     $DATA_DIR/voice/"
echo "     (10-30s .wav of Benjamin speaking clearly)"
echo "  3. Note your WORKER_TOKEN from above — add it to Vercel env vars"
echo ""
echo "  4. Configure ngrok (one-time setup):"
echo "     a. Create free account at https://ngrok.com"
echo "     b. Dashboard > Your Authtoken > copy token"
echo "     c. Dashboard > Domains > 'New Domain' (free, 1 per account)"
echo "     d. Edit .env:  nano $ENV_FILE"
echo "        NGROK_AUTHTOKEN=your_token_here"
echo "        NGROK_DOMAIN=your-domain.ngrok-free.app"
echo "     e. Run: ngrok config add-authtoken YOUR_TOKEN"
echo ""
echo "  5. Start services:"
echo "     systemctl start avatar-worker"
echo "     systemctl start avatar-ngrok"
echo ""
echo "  6. Check logs:"
echo "     journalctl -u avatar-worker -f"
echo "     journalctl -u avatar-ngrok -f"
echo ""
echo "  7. Test health:"
echo "     curl http://localhost:8000/health"
echo "     curl https://YOUR-DOMAIN.ngrok-free.app/health"
echo ""
echo "  8. In Vercel, set GPU_WORKER_URL=https://YOUR-DOMAIN.ngrok-free.app"
echo "     (this URL never changes — set it once)"
echo ""
echo "IMPORTANT: Use a Vast.ai template with CUDA toolkit (devel image)"
echo "for flash-attn compilation. Check with: nvcc --version"
echo ""
