#!/usr/bin/env bash
# setup.sh — One-shot installation script for Avatar IA Worker on Vast.ai VM
# Usage: ssh into VM, then: bash setup.sh
# Tested on Ubuntu 22.04 + NVIDIA GPU (RTX 3090/4090 24GB, A100)
#
# =====================================================================
#   VAST.AI VM REQUIREMENTS (CRITICAL — READ BEFORE CHOOSING A VM)
# =====================================================================
#
#   GPU:    RTX 3090/4090 (24GB VRAM) minimum, A100 recommended
#   RAM:    32GB+ (25GB causera des OOM kills avec --cpu-offload)
#   Disk:   200GB+ minimum (poids modèle ~76GB + libs ~20GB + OS ~10GB + swap)
#           *** 126GB est TROP JUSTE — on a eu des problèmes de disque plein ***
#   Image:  DEVEL template (avec CUDA toolkit / nvcc) — PAS "runtime"
#           Ex: pytorch/pytorch:2.1.0-cuda12.1-cudnn8-devel
#           Vérifier avec: nvcc --version
#   Python: 3.10 (système)
#
# Temps d'installation estimé:
#   - Dépendances système + pip: ~10 min
#   - flash-attn compilation: 10-30 min (2 CPU à 100%, ~7GB RAM chacun)
#   - Téléchargement poids HunyuanVideo: ~30-60 min (~76GB)
#   - Téléchargement poids OpenAudio S1-mini: ~5 min (~2GB)
#   - TOTAL: ~1h-2h
#
# =====================================================================

set -euo pipefail

echo "========================================="
echo "  Avatar IA Worker — VM Setup"
echo "========================================="
echo ""

# --- Pre-flight checks ---
echo "[0/12] Pre-flight checks..."

# Check disk space
DISK_AVAIL_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
echo "Disk available: ${DISK_AVAIL_GB}GB"
if [ "$DISK_AVAIL_GB" -lt 100 ]; then
    echo "WARNING: Only ${DISK_AVAIL_GB}GB available. Recommended: 150GB+ free."
    echo "HunyuanVideo weights alone need ~76GB. Consider a larger disk."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Choose a VM with more disk space."
        exit 1
    fi
fi

# Check RAM
RAM_TOTAL_MB=$(free -m | awk '/^Mem:/ {print $2}')
echo "RAM total: ${RAM_TOTAL_MB}MB"
if [ "$RAM_TOTAL_MB" -lt 28000 ]; then
    echo "WARNING: Only ${RAM_TOTAL_MB}MB RAM. Recommended: 32GB+."
    echo "With 25GB RAM, HunyuanVideo + cpu-offload WILL cause OOM kills."
    echo "A swap file will be created to mitigate this."
fi

# Check GPU
if command -v nvidia-smi &> /dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "unknown")
    GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1 || echo "unknown")
    echo "GPU: $GPU_NAME ($GPU_MEM)"
else
    echo "WARNING: nvidia-smi not found. No GPU detected."
fi

echo ""

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

# --- Clean apt cache immediately to save disk ---
echo "Cleaning apt cache to save disk space..."
apt-get clean
rm -rf /var/lib/apt/lists/*

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
    # Clean apt cache again after CUDA toolkit install (saves ~5GB)
    apt-get clean
    rm -rf /var/lib/apt/lists/*
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

# --- Swap file (prevents OOM kills during generation) ---
echo "[3/12] Setting up swap file..."
if [ ! -f /swapfile ]; then
    # Use 4GB swap — enough to prevent OOM, not too much disk
    # (flash-attn compilation uses ~14GB RAM with 2 cicc processes)
    # (HunyuanVideo --cpu-offload can use 20-30GB RAM)
    SWAP_SIZE="4G"
    if [ "$RAM_TOTAL_MB" -lt 28000 ]; then
        SWAP_SIZE="8G"
        echo "RAM < 28GB, using 8GB swap to compensate."
    fi
    fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1G count=${SWAP_SIZE%G}
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    # Persist across reboots
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    echo "Swap configured: $SWAP_SIZE"
else
    echo "Swap file already exists."
    swapon /swapfile 2>/dev/null || true
fi
free -h | grep -i swap

# --- Data directories ---
echo "[4/12] Creating data directories..."
DATA_DIR="/root/avatar-data"
mkdir -p "$DATA_DIR"/{models/hunyuan,models/fish-audio,photos,voice,outputs}

# --- Clone project ---
echo "[5/12] Cloning project repository..."
PROJECT_DIR="/root/avatar-IA"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull origin main
else
    git clone https://github.com/bengith-hub/avatar-IA.git "$PROJECT_DIR"
fi

# --- Python dependencies (system-wide, no venv) ---
echo "[6/12] Installing Python dependencies..."
cd "$PROJECT_DIR/worker"
pip install --upgrade pip setuptools wheel

# Install PyTorch with CUDA support
# Detect CUDA version for correct PyTorch wheel
CUDA_VERSION=""
if [ -n "${CUDA_HOME:-}" ]; then
    CUDA_VERSION=$(${CUDA_HOME}/bin/nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//' || echo "")
fi

echo "Detected CUDA version: ${CUDA_VERSION:-unknown}"

# PyTorch + torchvision + torchaudio (all three required)
# torchvision: required by HunyuanVideo-Avatar (hymm_sp/data_kits/audio_dataset.py imports it)
# torchaudio: required by fish-speech TTS
if [[ "$CUDA_VERSION" == 12.8* ]] || [[ "$CUDA_VERSION" == 12.6* ]] || [[ "$CUDA_VERSION" == 12.4* ]]; then
    echo "Installing PyTorch with cu124..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
elif [[ "$CUDA_VERSION" == 12.1* ]] || [[ "$CUDA_VERSION" == 12.2* ]]; then
    echo "Installing PyTorch with cu121..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
else
    echo "CUDA version unknown — defaulting to cu121..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
fi

# Install worker dependencies (FastAPI, uvicorn, pydantic, etc.)
pip install -r requirements.txt

# Additional runtime dependencies
# torchcodec: required by torchaudio at runtime
# soundfile: required for audio file I/O
pip install torchcodec soundfile

# Pin diffusers/transformers versions (CRITICAL — version mismatch breaks everything)
# transformers >= 5.x removes FLAX_WEIGHTS_NAME that diffusers imports
# transformers 4.47.x has model config issues — 4.40.1 is the tested working version
# diffusers 0.33.0 tested and working with HunyuanVideo-Avatar
pip install diffusers==0.33.0 transformers==4.40.1

# Additional runtime dependencies for HunyuanVideo-Avatar pipeline
# accelerate: required by diffusers for model loading/offloading
# imageio: required for video frame I/O in pipeline
# opencv-python-headless: required for image processing (cv2) — headless = no GUI deps
pip install accelerate imageio opencv-python-headless

# Install ninja (speeds up flash-attn compilation from 30min to 10-15min)
pip install ninja

# Install huggingface_hub (for model weight downloads)
pip install huggingface_hub

# --- Install flash-attn (required by HunyuanVideo-Avatar) ---
echo "[7/12] Installing flash-attn (this takes 10-30 minutes to compile)..."
echo "  NOTE: 2x 'cicc' processes will appear at 100% CPU each, using ~7GB RAM each."
echo "  This is NORMAL. Do not interrupt."
if [ -n "${CUDA_HOME:-}" ]; then
    # Try prebuilt wheel first (fast, seconds)
    pip install flash-attn 2>/dev/null || {
        echo "Prebuilt wheel not available, compiling from source..."
        echo "This will take 10-30 minutes. Go get a coffee."
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

# --- Clean pip cache after heavy installs (saves 1-5GB) ---
echo "Cleaning pip cache..."
pip cache purge

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

# Download OpenAudio S1-mini model weights (~2GB)
echo "Downloading OpenAudio S1-mini model weights (~2GB)..."
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
echo "[10/12] Downloading HunyuanVideo-Avatar weights (~76GB — this takes 30-60 min)..."
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

# --- Clean pip cache again after all installs ---
echo "Final pip cache cleanup..."
pip cache purge

# --- Verify disk space ---
echo ""
echo "Disk usage after install:"
df -h /
echo ""
du -sh /root/HunyuanVideo-Avatar/ 2>/dev/null || true
du -sh /root/avatar-data/ 2>/dev/null || true
du -sh /usr/local/lib/python3.10/dist-packages/ 2>/dev/null || true

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
ENVEOF
    echo "Created .env file at $ENV_FILE"
    echo "  WORKER_TOKEN=$RANDOM_TOKEN"
    echo "  >>> SAVE THIS TOKEN — you'll need it for the frontend config (GPU_WORKER_TOKEN in Vercel) <<<"
else
    echo ".env already exists, skipping."
fi

# --- Systemd services ---
echo "[12/12] Setting up systemd service..."

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

# NOTE: ngrok is NO LONGER NEEDED — using Docker instances with direct port mapping.
# The frontend auto-detects the worker URL via Vast.ai API (IP:port).
# ngrok install and service removed (was source of recurring bugs).

systemctl daemon-reload
systemctl enable avatar-worker

# --- Final verification ---
echo "Final verification..."
echo ""
echo "Installed versions:"
echo "  Python:       $(python3 --version 2>&1)"
echo "  torch:        $(python3 -c 'import torch; print(torch.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  torchvision:  $(python3 -c 'import torchvision; print(torchvision.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  torchaudio:   $(python3 -c 'import torchaudio; print(torchaudio.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  torchcodec:   $(python3 -c 'import torchcodec; print(torchcodec.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  flash-attn:   $(python3 -c 'import flash_attn; print(flash_attn.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  diffusers:    $(python3 -c 'import diffusers; print(diffusers.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  transformers: $(python3 -c 'import transformers; print(transformers.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  soundfile:    $(python3 -c 'import soundfile; print(soundfile.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  fastapi:      $(python3 -c 'import fastapi; print(fastapi.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  uvicorn:      $(uvicorn --version 2>&1 || echo 'NOT INSTALLED')"
echo "  accelerate:   $(python3 -c 'import accelerate; print(accelerate.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  imageio:      $(python3 -c 'import imageio; print(imageio.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  cv2:          $(python3 -c 'import cv2; print(cv2.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "  ffmpeg:       $(ffmpeg -version 2>&1 | head -1 || echo 'NOT INSTALLED')"
echo "  nvcc:         $(nvcc --version 2>&1 | tail -1 || echo 'NOT INSTALLED')"
if command -v nvidia-smi &> /dev/null; then
    echo "  GPU:          $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo 'unknown')"
fi
echo ""
echo "Disk:"
df -h /
echo ""
echo "RAM + Swap:"
free -h
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
echo "  4. Start worker:"
echo "     systemctl start avatar-worker"
echo ""
echo "  5. Check logs:"
echo "     journalctl -u avatar-worker -f"
echo ""
echo "  6. Test health:"
echo "     curl http://localhost:8000/health"
echo ""
echo "  7. In Vercel, set:"
echo "     GPU_WORKER_TOKEN=<your token from step 3>"
echo "     VAST_INSTANCE_ID=<your Vast.ai instance ID>"
echo "     (Worker URL auto-detected via Vast.ai API — no manual URL needed)"
echo ""
echo "Monitoring:"
echo "  watch -n 2 nvidia-smi              # GPU (VRAM, utilisation)"
echo "  journalctl -u avatar-worker -f     # Worker logs"
echo "  htop                               # CPU/RAM"
echo "  df -h /                            # Disk space"
echo "  free -h                            # RAM + Swap"
echo ""
echo "Troubleshooting:"
echo "  - OOM kill?     → Check: free -h (swap active?), consider VM with 32GB+ RAM"
echo "  - Disk full?    → Run: apt-get clean && pip cache purge && du -sh /root/* | sort -rh"
echo "  - flash-attn?   → Check: nvcc --version && echo \$CUDA_HOME"
echo "  - No nvcc?      → Run: apt install cuda-toolkit-12-1 && export CUDA_HOME=/usr/local/cuda-12.1"
echo "  - Worker crash?  → Check: journalctl -u avatar-worker -n 50"
echo "  - torchvision?  → pip install torchvision (required by HunyuanVideo-Avatar)"
echo "  - Verify GPU:    nvidia-smi"
echo "  - CUDA OOM?     → Already using --cpu-offload --use-fp8 --infer-min (peak ~17GB)"
echo ""
echo "IMPORTANT NOTES:"
echo "  - Use a Vast.ai template with CUDA toolkit (devel image) for flash-attn"
echo "  - Minimum disk: 200GB (76GB weights + 20GB libs + OS + swap + headroom)"
echo "  - Minimum RAM: 32GB recommended (25GB works with swap but risky)"
echo "  - flash-attn compilation: 10-30 min, 2 CPU cores at 100%, ~14GB RAM"
echo "  - apt-get clean after each apt install to save ~5GB disk"
echo ""
