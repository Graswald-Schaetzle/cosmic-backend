# ============================================================
# Cosmic 3D Pipeline Worker
# GPU container for video → COLMAP → Gaussian Splat pipeline
# ============================================================
# Build: docker build -t cosmic-3d-worker -f worker/docker/Dockerfile worker/
# Run:   docker run --gpus all -e JOB_ID=1 -e GCS_BUCKET=... cosmic-3d-worker
# ============================================================

# Use official COLMAP image with CUDA support as base
# This avoids building COLMAP from source in CI (complex, fragile)
FROM colmap/colmap:3.9.1 AS colmap-base

FROM nvidia/cuda:12.1.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Copy COLMAP binary from official image
COPY --from=colmap-base /usr/local/bin/colmap /usr/local/bin/colmap
COPY --from=colmap-base /usr/local/lib/ /usr/local/lib/

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3.10 \
    python3-pip \
    python3.10-venv \
    wget \
    curl \
    unzip \
    libboost-filesystem1.74.0 \
    libboost-program-options1.74.0 \
    libboost-graph1.74.0 \
    libcgal-dev \
    libfreeimage3 \
    libgoogle-glog0v5 \
    libgflags2.2 \
    libglew2.2 \
    libqt5core5a \
    libqt5opengl5 \
    && rm -rf /var/lib/apt/lists/*

# Set python3.10 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install PyTorch with CUDA 12.1 support
RUN pip install --no-cache-dir \
    torch==2.1.2+cu121 \
    torchvision==0.16.2+cu121 \
    --index-url https://download.pytorch.org/whl/cu121

# Install Nerfstudio
RUN pip install --no-cache-dir nerfstudio==1.1.0

# Install pipeline dependencies
RUN pip install --no-cache-dir \
    google-cloud-storage==2.14.0 \
    supabase==2.3.0 \
    opencv-python-headless>=4.9.0 \
    requests==2.31.0

# Create working directory
RUN mkdir -p /workspace
WORKDIR /workspace

# Copy pipeline scripts
COPY pipeline/ /app/pipeline/
COPY scripts/ /app/scripts/

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# RunPod serverless handler
RUN pip install --no-cache-dir runpod==1.7.0
COPY runpod_handler.py /app/runpod_handler.py

CMD ["python", "/app/runpod_handler.py"]
