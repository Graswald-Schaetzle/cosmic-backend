#!/bin/bash
# =============================================================================
# Cosmic 3D Pipeline - GCP Setup Script
# =============================================================================
# Run this once to set up all GCP infrastructure needed for the pipeline.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated: gcloud auth login
#   - Correct project set: gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   bash infra/gcp-setup.sh
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION="${GCP_REGION:-europe-west4}"
BUCKET_NAME="${GCS_3D_PIPELINE_BUCKET:-cosmic-3d-pipeline}"
SA_NAME="cosmic-3d-pipeline-worker"
AR_REPO="cosmic-workers"

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "======================================================"
echo "Cosmic 3D Pipeline - GCP Setup"
echo "======================================================"
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Bucket:   $BUCKET_NAME"
echo "======================================================"
echo ""
read -p "Proceed? [y/N] " -n 1 -r
echo
[[ $REPLY =~ ^[Yy]$ ]] || exit 0

# ── Enable APIs ───────────────────────────────────────────────────────────────
echo ""
echo "→ Enabling required APIs..."
gcloud services enable \
  batch.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project="$PROJECT_ID"

echo "✓ APIs enabled"

# ── Cloud Storage Bucket ──────────────────────────────────────────────────────
echo ""
echo "→ Creating Cloud Storage bucket: $BUCKET_NAME..."
if gsutil ls "gs://$BUCKET_NAME" &>/dev/null; then
  echo "  Bucket already exists, skipping."
else
  gcloud storage buckets create "gs://$BUCKET_NAME" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --project="$PROJECT_ID"
  echo "✓ Bucket created"
fi

# Configure lifecycle: delete outputs older than 90 days
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {
        "age": 90,
        "matchesPrefix": ["outputs/"]
      }
    },
    {
      "action": {"type": "Delete"},
      "condition": {
        "age": 7,
        "matchesPrefix": ["inputs/"]
      }
    }
  ]
}
EOF
gsutil lifecycle set /tmp/lifecycle.json "gs://$BUCKET_NAME"
echo "✓ Lifecycle rules set (inputs: 7 days, outputs: 90 days)"

# Configure CORS for signed URL uploads from browser
cat > /tmp/cors.json << 'EOF'
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "POST", "HEAD"],
    "responseHeader": [
      "Content-Type",
      "x-goog-resumable",
      "Access-Control-Allow-Origin"
    ],
    "maxAgeSeconds": 3600
  }
]
EOF
gsutil cors set /tmp/cors.json "gs://$BUCKET_NAME"
echo "✓ CORS configured"

# ── Artifact Registry ─────────────────────────────────────────────────────────
echo ""
echo "→ Creating Artifact Registry repository: $AR_REPO..."
if gcloud artifacts repositories describe "$AR_REPO" \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "  Repository already exists, skipping."
else
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Cosmic 3D pipeline worker containers" \
    --project="$PROJECT_ID"
  echo "✓ Artifact Registry repository created"
fi

AR_HOST="${REGION}-docker.pkg.dev"
WORKER_IMAGE="$AR_HOST/$PROJECT_ID/$AR_REPO/3d-worker"
echo "  Image URL: $WORKER_IMAGE:latest"

# ── Service Account ───────────────────────────────────────────────────────────
echo ""
echo "→ Creating service account: $SA_NAME..."
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "  Service account already exists, skipping."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Cosmic 3D Pipeline Worker" \
    --project="$PROJECT_ID"
  echo "✓ Service account created"
fi

# Grant required roles
echo "→ Granting IAM roles..."
for ROLE in \
  "roles/batch.jobsEditor" \
  "roles/storage.objectAdmin" \
  "roles/logging.logWriter" \
  "roles/artifactregistry.reader"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None \
    --quiet
  echo "  ✓ $ROLE"
done

# Create and download key
KEY_FILE="infra/gcp-service-account-key.json"
echo "→ Creating service account key: $KEY_FILE..."
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"
echo "✓ Key saved to $KEY_FILE"
echo "  ⚠️  Add this file to .gitignore! Never commit it."

# Add to gitignore if not already there
if ! grep -q "gcp-service-account-key.json" .gitignore 2>/dev/null; then
  echo "infra/gcp-service-account-key.json" >> .gitignore
  echo "✓ Added to .gitignore"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "✅ Setup complete!"
echo "======================================================"
echo ""
echo "Add these to your .env file:"
echo ""
echo "  GCP_PROJECT_ID=$PROJECT_ID"
echo "  GCP_REGION=$REGION"
echo "  GCS_3D_PIPELINE_BUCKET=$BUCKET_NAME"
echo "  WORKER_DOCKER_IMAGE=$WORKER_IMAGE:latest"
echo "  GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/$KEY_FILE"
echo ""
echo "Next steps:"
echo "  1. Build and push the worker image:"
echo "     bash infra/push-worker.sh"
echo "  2. Run the Supabase migration:"
echo "     supabase db push"
echo "  3. Start the backend and test the API"
echo ""
