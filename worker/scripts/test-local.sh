#!/bin/bash
# =============================================================================
# Lokaler Pipeline-Test (ohne GCP, ohne echte GPU)
# =============================================================================
# Testet die Pipeline-Logik mit einem lokalen Video und simulierten GCS-Uploads.
# Nützlich für schnelle Iteration ohne Cloud-Ressourcen.
#
# Voraussetzungen:
#   - Docker mit NVIDIA GPU (für echten Test)
#   - ODER: ffmpeg, COLMAP, nerfstudio lokal installiert
#
# Usage:
#   bash worker/scripts/test-local.sh /pfad/zum/video.mp4
# =============================================================================

set -euo pipefail

VIDEO_FILE="${1:-}"
WORKSPACE="$(pwd)/worker/test-output"
JOB_ID="local-$(date +%s)"

if [ -z "$VIDEO_FILE" ]; then
  echo "Usage: bash worker/scripts/test-local.sh /pfad/zum/video.mp4"
  echo ""
  echo "Beispiel-Video herunterladen (kleiner Testraum):"
  echo "  wget -O /tmp/test-room.mp4 https://github.com/nerfstudio-project/nerfstudio/raw/main/tests/data/lego_test.mp4"
  exit 1
fi

if [ ! -f "$VIDEO_FILE" ]; then
  echo "ERROR: Video nicht gefunden: $VIDEO_FILE"
  exit 1
fi

echo "======================================================"
echo "Cosmic 3D Pipeline - Lokaler Test"
echo "======================================================"
echo "Video:     $VIDEO_FILE"
echo "Job ID:    $JOB_ID"
echo "Workspace: $WORKSPACE/$JOB_ID"
echo "======================================================"

mkdir -p "$WORKSPACE/$JOB_ID"/{input,frames,colmap_output,export}
cp "$VIDEO_FILE" "$WORKSPACE/$JOB_ID/input/input.mp4"

# ── Step 1: Frame Extraction ──────────────────────────────────────────────────
echo ""
echo "Step 1: Frame-Extraktion (ffmpeg)..."
START=$(date +%s)

ffmpeg -i "$WORKSPACE/$JOB_ID/input/input.mp4" \
  -vf "fps=2,scale=1920:-1" \
  -q:v 2 \
  "$WORKSPACE/$JOB_ID/frames/frame_%05d.jpg" \
  -y 2>/dev/null

FRAME_COUNT=$(ls "$WORKSPACE/$JOB_ID/frames/"*.jpg 2>/dev/null | wc -l)
ELAPSED=$(( $(date +%s) - START ))
echo "✓ $FRAME_COUNT Frames extrahiert in ${ELAPSED}s"

if [ "$FRAME_COUNT" -lt 10 ]; then
  echo "ERROR: Zu wenige Frames ($FRAME_COUNT). Mindestens 10 benötigt."
  exit 1
fi

# ── Step 2: COLMAP ────────────────────────────────────────────────────────────
echo ""
echo "Step 2: COLMAP Structure from Motion..."
echo "(Kann 5-30 Minuten dauern je nach Anzahl Frames)"
START=$(date +%s)

if command -v ns-process-data &>/dev/null; then
  ns-process-data images \
    --data "$WORKSPACE/$JOB_ID/frames" \
    --output-dir "$WORKSPACE/$JOB_ID/colmap_output" \
    2>&1 | tail -5
else
  echo "⚠️  ns-process-data nicht gefunden. Überspringe COLMAP (kein Nerfstudio installiert)"
  echo "   Installieren: pip install nerfstudio"
  # Create dummy output for testing pipeline flow
  mkdir -p "$WORKSPACE/$JOB_ID/colmap_output/sparse/0"
  touch "$WORKSPACE/$JOB_ID/colmap_output/sparse/0/points3D.bin"
fi

ELAPSED=$(( $(date +%s) - START ))
echo "✓ COLMAP fertig in ${ELAPSED}s"

# ── Step 3: Splatfacto Training ───────────────────────────────────────────────
echo ""
echo "Step 3: Splatfacto Training..."
echo "(Kann 20-40 Minuten auf T4 dauern)"
START=$(date +%s)

if command -v ns-train &>/dev/null; then
  ns-train splatfacto \
    --data "$WORKSPACE/$JOB_ID/colmap_output" \
    --output-dir "$WORKSPACE/$JOB_ID/training" \
    --max-num-iterations 5000 \
    --viewer.quit-on-train-completion True \
    --logging.local-writer.enable False \
    2>&1 | tail -10
else
  echo "⚠️  ns-train nicht gefunden. Überspringe Training."
fi

ELAPSED=$(( $(date +%s) - START ))
echo "✓ Training fertig in ${ELAPSED}s"

# ── Step 4: Export ────────────────────────────────────────────────────────────
echo ""
echo "Step 4: Export..."

CONFIG_FILE=$(find "$WORKSPACE/$JOB_ID/training" -name "config.yml" 2>/dev/null | head -1)
if [ -n "$CONFIG_FILE" ] && command -v ns-export &>/dev/null; then
  ns-export gaussian-splat \
    --load-config "$CONFIG_FILE" \
    --output-dir "$WORKSPACE/$JOB_ID/export"
  PLY_FILE=$(find "$WORKSPACE/$JOB_ID/export" -name "*.ply" | head -1)
  echo "✓ Exportiert: $PLY_FILE"
else
  echo "⚠️  Kein Config gefunden oder ns-export nicht verfügbar."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "✅ Lokaler Test abgeschlossen"
echo "======================================================"
echo ""
echo "Output-Verzeichnis: $WORKSPACE/$JOB_ID/"
ls -la "$WORKSPACE/$JOB_ID/" 2>/dev/null
echo ""
echo "PLY-Datei validieren:"
echo "  Lade die .ply Datei hoch auf: https://antimatter15.com/splat/"
echo "  oder: https://huggingface.co/spaces/dylanebert/gsplat"
