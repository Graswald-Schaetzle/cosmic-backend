#!/bin/bash
# =============================================================================
# Build and push the 3D worker Docker image to GCP Artifact Registry
# =============================================================================
# Usage:
#   bash infra/push-worker.sh [--tag v1.0.0]
# =============================================================================

set -euo pipefail

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION="${GCP_REGION:-europe-west4}"
AR_REPO="${AR_REPO:-cosmic-workers}"
TAG="${1:-latest}"

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: No GCP project set."
  exit 1
fi

AR_HOST="${REGION}-docker.pkg.dev"
IMAGE="$AR_HOST/$PROJECT_ID/$AR_REPO/3d-worker:$TAG"

echo "Building worker image: $IMAGE"
echo ""

# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker "$AR_HOST" --quiet

# Build the image
docker build \
  -t "$IMAGE" \
  -t "$AR_HOST/$PROJECT_ID/$AR_REPO/3d-worker:latest" \
  -f worker/docker/Dockerfile \
  worker/

echo ""
echo "Pushing image..."
docker push "$IMAGE"
docker push "$AR_HOST/$PROJECT_ID/$AR_REPO/3d-worker:latest"

echo ""
echo "✅ Image pushed: $IMAGE"
echo ""
echo "Update your .env:"
echo "  WORKER_DOCKER_IMAGE=$IMAGE"
