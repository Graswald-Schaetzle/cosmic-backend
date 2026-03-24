#!/bin/bash
set -euo pipefail

echo "=== Cosmic 3D Pipeline Worker ==="
echo "JOB_ID: ${JOB_ID:-not set}"
echo "GCS_BUCKET: ${GCS_BUCKET:-not set}"
echo "GPU Info:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "  No GPU detected"

# Validate required env vars
for var in JOB_ID GCS_BUCKET INPUT_PATH SUPABASE_URL SUPABASE_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: Required environment variable $var is not set"
    exit 1
  fi
done

# Run the pipeline
python3 /app/pipeline/pipeline.py \
  --job-id "$JOB_ID" \
  --gcs-bucket "$GCS_BUCKET" \
  --input-path "$INPUT_PATH" \
  --supabase-url "$SUPABASE_URL" \
  --supabase-key "$SUPABASE_KEY" \
  --callback-url "${CALLBACK_URL:-}" \
  --callback-secret "${CALLBACK_SECRET:-}" \
  --poses-available "${POSES_AVAILABLE:-false}" \
  --workspace /workspace

EXIT_CODE=$?

echo "=== Pipeline finished with exit code: $EXIT_CODE ==="
exit $EXIT_CODE
