#!/usr/bin/env bash
# setup.sh — One-shot installation script for Avatar IA Worker on Vast.ai VM
# Usage: ssh into VM, then: bash setup.sh
# Tested on Ubuntu 22.04 + NVIDIA GPU (RTX 3090/4090 24GB, A100)
#
# IMPORTANT: Choose a Vast.ai template with CUDA toolkit included (e.g. "pytorch/pytorch:*-devel")
# or one that already has nvcc. This is required for compiling flash-attn.
# Verify with: nvcc --version

set -euo pipefail

echo "========================================="
echo "  Avatar IA Worker — VM Setup"
echo "========================================="

# --- System packages ---
echo "[1/12] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    git git-lfs \
    ffmpeg wget curl unzip \
    libgl1-mesa-glx libglib2.0-0 \
    libsndfile1 sox

# Init git-lfs (needed for model weight downloads)
git lfs install

# --- Detect CUDA ---
echo "[2/12] Detecting CUDA installation..."
if [ -z "${CUDA_HOME:-}" ]; then
    # Try common locations (newest first)
    for cuda_dir in /usr/local/cuda /usr/local/cuda-12.8 /usr/local/cuda-12.6 \
                    /usr/local/cuda-12.4 /usr/local/cuda-12.2 /usr/local/cuda-12.1 \
                    /usr/local/cuda-12.0 /usr/local/cuda-11.8; do
        if [ -d "$cuda_dir" ] && [ -f "$cuda_dir/bin/nvcc" ]; then
            export CUDA_HOME="$cuda_dir"
            break
        fi
    done
fi

# Also check if nvcc is in PATH but CUDA_HOME not set
if [ -z "${CUDA_HOME:-}" ] && command -v nvcc &> /dev/null; then
    NVCC_PATH=$(which nvcc)
    CUDA_BIN_DIR=$(dirname "$NVCC_PATH")
    export CUDA_HOME=$(dirname "$CUDA_BIN_DIR")
    echo "Found nvcc in PATH, set CUDA_HOME=$CUDA_HOME"
fi

if [ -z "${CUDA_HOME:-}" ]; then
    echo "WARNING: CUDA_HOME not found and nvcc not in PATH."
    echo "Attempting to install cuda-toolkit-12-1..."
    # Auto-install CUDA toolkit if not present
    if [ ! -f /etc/apt/trusted.gpg.d/cuda-keyring.gpg ] && [ ! -f /usr/share/keyrings/cuda-archive-keyring.gpg ]; then
        wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
        dpkg -i cuda-keyring_1.1-1_all.deb
        rm -f cuda-keyring_1.1-1_all.deb
    fi
    apt-get update -qq
    apt-get install -y -qq cuda-toolkit-12-1 || {
        echo "ERROR: Could not install cuda-toolkit-12-1."
        echo "flash-attn compilation will fail. Install CUDA toolkit manually."
    }
    if [ -d "/usr/local/cuda-12.1" ]; then
        export CUDA_HOME="/usr/local/cuda-12.1"
    fi
fi

if [ -n "${CUDA_HOME:-}" ]; then
    echo "CUDA_HOME=$CUDA_HOME"
    echo "nvcc version: $(${CUDA_HOME}/bin/nvcc --version 2>/dev/null | tail -1 || echo 'unknown')"
    export PATH="$CUDA_HOME/bin:$PATH"
    export LD_LIBRARY_PATH="${CUDA_HOME}/lib64:${LD_LIBRARY_PATH:-}"
else
    echo "WARNING: CUDA_HOME still not set. flash-attn will not compile."
    echo "You can set it manually: export CUDA_HOME=/path/to/cuda"
fi

# --- Data directories ---
echo "[3/12] Creating data directories..."
DATA_DIR="/root/avatar-data"
mkdir -p "$DATA_DIR"/{models/hunyuan,models/fish-audio,photos,voice,outputs}

# --- Clone project ---
echo "[4/12] Cloning project repository..."
PROJECT_DIR="/root/avatar-IA"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull origin main
else
    git clone https://github.com/bengith-hub/avatar-IA.git "$PROJECT_DIR"
fi

# --- Python dependencies (system-wide, no venv) ---
echo "[5/12] Installing Python dependencies..."
cd "$PROJECT_DIR/worker"
pip install --upgrade pip setuptools wheel

# Install PyTorch with CUDA support
# Detect CUDA version for correct PyTorch wheel
CUDA_VERSION=""
if [ -n "${CUDA_HOME:-}" ]; then
    CUDA_VERSION=$(${CUDA_HOME}/bin/nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//' || echo "")
fi

if [[ "$CUDA_VERSION" == 12.8* ]] || [[ "$CUDA_VERSION" == 12.6* ]] || [[ "$CUDA_VERSION" == 12.4* ]]; then
    echo "Detected CUDA $CUDA_VERSION — installing PyTorch with cu124..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
elif [[ "$CUDA_VERSION" == 12.1* ]] || [[ "$CUDA_VERSION" == 12.2* ]]; then
    echo "Detected CUDA $CUDA_VERSION — installing PyTorch with cu121..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
else
    echo "CUDA version: ${CUDA_VERSION:-unknown} — defaulting to cu121..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
fi

# Install worker dependencies
pip install -r requirements.txt

# Additional runtime dependencies
pip install torchcodec soundfile

# Pin diffusers/transformers versions (newer versions have breaking import changes)
# transformers >= 5.x removes FLAX_WEIGHTS_NAME that diffusers imports
pip install diffusers==0.32.2 transformers==4.47.1

# Install ninja (speeds up flash-attn compilation significantly)
pip install ninja

# --- Install flash-attn (required by HunyuanVideo-Avatar) ---
echo "[6/12] Installing flash-attn (this takes 5-15 minutes to compile)..."
if [ -n "${CUDA_HOME:-}" ]; then
    # Try prebuilt wheel first (fast, seconds)
    pip install flash-attn 2>/dev/null || {
        echo "Prebuilt wheel not available, compiling from source..."
        pip install flash-attn --no-build-isolation || {
            echo "WARNING: flash-attn compilation failed."
            echo "ERROR: flash-attn could not be installed. HunyuanVideo-Avatar will not work."
            echo ""
            echo "Troubleshooting:"
            echo "  1. Verify nvcc: nvcc --version"
            echo "  2. Verify CUDA_HOME: echo \$CUDA_HOME"
            echo "  3. Try manually: CUDA_HOME=$CUDA_HOME pip install flash-attn --no-build-isolation"
            echo "  4. If nvcc missing: apt install cuda-toolkit-12-1 && export CUDA_HOME=/usr/local/cuda-12.1"
        }
    }
else
    echo "SKIPPED: flash-attn requires CUDA_HOME with nvcc. Install manually later."
    echo "  1. apt install cuda-toolkit-12-1"
    echo "  2. export CUDA_HOME=/usr/local/cuda-12.1"
    echo "  3. pip install flash-attn --no-build-isolation"
fi

# --- Install huggingface_hub (for model downloads) ---
echo "[7/12] Installing huggingface_hub..."
pip install huggingface_hub

# --- Install FishAudio fish-speech (TTS / Voice Clone) ---
echo "[8/12] Installing FishAudio fish-speech..."
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
echo "[9/12] Installing HunyuanVideo-Avatar..."
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
echo "[10/12] Downloading HunyuanVideo-Avatar weights (this may take a while — ~76GB)..."
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
echo "[11/12] Setting up environment..."
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
    echo "  >>> SAVE THIS TOKEN — you'll need it for the frontend config (GPU_WORKER_TOKEN in Vercel) <<<"
else
    echo ".env already exists, skipping."
fi

# --- Systemd services ---
echo "[12/12] Setting up systemd services..."

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
echo "Troubleshooting:"
echo "  - flash-attn failed? Check: nvcc --version && echo \$CUDA_HOME"
echo "  - No nvcc? Run: apt install cuda-toolkit-12-1 && export CUDA_HOME=/usr/local/cuda-12.1"
echo "  - Then: pip install flash-attn --no-build-isolation"
echo "  - Worker won't start? Check: journalctl -u avatar-worker -n 50"
echo "  - Verify GPU: nvidia-smi"
echo ""
echo "IMPORTANT: Use a Vast.ai template with CUDA toolkit (devel image)"
echo "for flash-attn compilation. Check with: nvcc --version"
echo ""
