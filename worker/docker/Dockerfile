# ============================================================
# Cosmic 3D Pipeline Worker
# GPU container for video → COLMAP → Gaussian Splat pipeline
# ============================================================
# Build: docker build -t cosmic-3d-worker -f worker/docker/Dockerfile worker/
# Run:   docker run --gpus all -e JOB_ID=1 -e GCS_BUCKET=... cosmic-3d-worker
# ============================================================

FROM nvidia/cuda:12.1.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    cmake \
    build-essential \
    libboost-all-dev \
    libeigen3-dev \
    libflann-dev \
    libfreeimage-dev \
    libgoogle-glog-dev \
    libgflags-dev \
    libsqlite3-dev \
    libcgal-dev \
    libceres-dev \
    qtbase5-dev \
    libqt5opengl5-dev \
    libatlas-base-dev \
    libsuitesparse-dev \
    libglew-dev \
    ffmpeg \
    python3.10 \
    python3-pip \
    python3.10-venv \
    wget \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Set python3.10 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Build COLMAP from source
# Note: CUDA is disabled at build time (no CUDA on CI runners).
# CUDA support is available at runtime on GPU nodes via the nvidia/cuda base image.
RUN git clone --branch 3.9.1 --depth 1 https://github.com/colmap/colmap.git /tmp/colmap \
    && cd /tmp/colmap \
    && mkdir build && cd build \
    && cmake .. \
        -DCUDA_ENABLED=OFF \
        -DCMAKE_BUILD_TYPE=Release \
    && make -j$(nproc) \
    && make install \
    && rm -rf /tmp/colmap

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
