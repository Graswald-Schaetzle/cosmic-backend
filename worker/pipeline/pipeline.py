"""
Cosmic 3D Pipeline Worker
Video/Images → Frame Extraction → COLMAP SfM → Gaussian Splatting → Export

This script runs the full reconstruction pipeline inside a GPU container.
It downloads input from GCS, processes it, and uploads results back to GCS.
Status updates are sent via callback URL and/or direct Supabase updates.
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("pipeline")

# Local mode: set GCS_BUCKET=local to use filesystem instead of GCS
LOCAL_MODE = os.environ.get("GCS_BUCKET", "").lower() == "local"
LOCAL_STORAGE_ROOT = os.environ.get("LOCAL_STORAGE_ROOT", "/data")


class PipelineError(Exception):
    """Raised when a pipeline step fails."""
    pass


class Pipeline:
    def __init__(self, args):
        self.job_id = args.job_id
        self.gcs_bucket = args.gcs_bucket
        self.input_path = args.input_path
        self.supabase_url = args.supabase_url
        self.supabase_key = args.supabase_key
        self.callback_url = args.callback_url
        self.callback_secret = args.callback_secret
        self.poses_available = getattr(args, 'poses_available', False)
        self.workspace = Path(args.workspace) / f"job_{self.job_id}"
        self.local_mode = LOCAL_MODE

        # Working directories
        self.input_dir = self.workspace / "input"
        self.frames_dir = self.workspace / "frames"
        self.colmap_dir = self.workspace / "colmap_output"
        self.nerfstudio_dir = self.workspace / "nerfstudio_data"  # ARKit path
        self.train_dir = self.workspace / "training"
        self.export_dir = self.workspace / "export"
        self.output_dir = self.workspace / "output"

        # GCS client (only in cloud mode)
        if not self.local_mode:
            from google.cloud import storage as gcs_storage
            self.gcs = gcs_storage.Client()
            self.bucket = self.gcs.bucket(self.gcs_bucket)
        else:
            self.gcs = None
            self.bucket = None
            logger.info(f"LOCAL MODE: Using filesystem storage at {LOCAL_STORAGE_ROOT}")

        # Metrics
        self.metrics = {
            "job_id": self.job_id,
            "steps": {},
        }

    def run(self):
        """Execute the full pipeline.

        Two paths:
        - ARKit path (poses_available=True): ZIP contains frames/ + transforms.json.
          COLMAP is skipped; ARKit VIO poses are used directly for Nerfstudio training.
        - Legacy path (poses_available=False): video or image ZIP without poses.
          COLMAP estimates camera poses via Structure from Motion.
        """
        try:
            self._setup_workspace()

            self._update_status("extracting_frames")
            frame_count = self._extract_frames()
            self.metrics["frame_count"] = frame_count

            if self.poses_available:
                logger.info("ARKit poses detected — skipping COLMAP.")
                self._prepare_arkit_dataset()
                self._update_status("training_splat", input_frame_count=frame_count)
                self._train_splatfacto(data_dir=self.nerfstudio_dir)
            else:
                self._update_status("running_colmap", input_frame_count=frame_count)
                colmap_point_count = self._run_colmap()
                self.metrics["colmap_point_count"] = colmap_point_count
                self._update_status("training_splat", colmap_point_count=colmap_point_count)
                self._train_splatfacto(data_dir=self.colmap_dir)

            self._update_status("exporting")
            output_paths = self._export_and_upload()

            self._update_status(
                "completed",
                output_ply_path=output_paths.get("ply"),
                output_splat_path=output_paths.get("splat"),
                colmap_sparse_path=output_paths.get("colmap"),
                point_count=self.metrics.get("point_count"),
            )

            logger.info("Pipeline completed successfully!")
            return 0

        except PipelineError as e:
            logger.error(f"Pipeline failed: {e}")
            self._update_status("failed", error_message=str(e))
            return 1
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            self._update_status("failed", error_message=f"Unexpected error: {e}")
            return 1
        finally:
            self._save_metrics()

    def _setup_workspace(self):
        """Create working directories."""
        for d in [
            self.input_dir,
            self.frames_dir,
            self.colmap_dir,
            self.nerfstudio_dir,
            self.train_dir,
            self.export_dir,
            self.output_dir,
        ]:
            d.mkdir(parents=True, exist_ok=True)

        logger.info(f"Workspace created at {self.workspace}")

    def _download_input(self):
        """Download input file from GCS or copy from local storage."""
        local_path = self.input_dir / os.path.basename(self.input_path)

        if self.local_mode:
            src = Path(LOCAL_STORAGE_ROOT) / self.input_path
            logger.info(f"LOCAL MODE: Copying input from {src}")
            if not src.exists():
                raise PipelineError(f"Input not found at {src}")
            shutil.copy2(str(src), str(local_path))
        else:
            logger.info(f"Downloading input from gs://{self.gcs_bucket}/{self.input_path}")
            blob = self.bucket.blob(self.input_path)
            if not blob.exists():
                raise PipelineError(f"Input not found: gs://{self.gcs_bucket}/{self.input_path}")
            blob.download_to_filename(str(local_path))

        logger.info(f"Input ready: {local_path} ({local_path.stat().st_size / 1024 / 1024:.1f} MB)")
        return local_path

    def _extract_frames(self):
        """Extract frames from video or unzip image archive."""
        start = time.time()
        input_file = self._download_input()

        if input_file.suffix.lower() in (".mp4", ".mov", ".avi"):
            return self._extract_video_frames(input_file, start)
        elif input_file.suffix.lower() == ".zip":
            return self._extract_zip_images(input_file, start)
        else:
            raise PipelineError(f"Unsupported input format: {input_file.suffix}")

    def _extract_video_frames(self, video_path, start_time):
        """Extract frames from video using ffmpeg at 2 FPS."""
        logger.info(f"Extracting frames from video at 2 FPS...")

        cmd = [
            "ffmpeg", "-i", str(video_path),
            "-vf", "fps=2,scale=1920:-1",
            "-q:v", "2",
            str(self.frames_dir / "frame_%05d.jpg"),
            "-y",
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise PipelineError(f"ffmpeg failed: {result.stderr[:500]}")

        frame_count = len(list(self.frames_dir.glob("*.jpg")))
        elapsed = time.time() - start_time

        if frame_count < 10:
            raise PipelineError(
                f"Only {frame_count} frames extracted. Need at least 10 frames. "
                "Video may be too short or corrupted."
            )

        logger.info(f"Extracted {frame_count} frames in {elapsed:.1f}s")
        self.metrics["steps"]["frame_extraction"] = {
            "frame_count": frame_count,
            "duration_s": round(elapsed, 1),
        }
        return frame_count

    def _extract_zip_images(self, zip_path, start_time):
        """Extract images (and optional transforms.json) from zip archive.

        For ARKit frame ZIPs the archive contains:
          frames/frame_00001.jpg ...
          transforms.json

        For plain image ZIPs the archive contains flat or nested JPEG/PNG files.
        The transforms.json (if present) is moved to nerfstudio_dir for use in training.
        """
        import zipfile

        logger.info("Extracting images from zip archive...")

        with zipfile.ZipFile(str(zip_path), "r") as z:
            z.extractall(str(self.frames_dir))

        # Move transforms.json to nerfstudio_dir if present (ARKit path)
        transforms_src = self.frames_dir / "transforms.json"
        if transforms_src.exists():
            shutil.move(str(transforms_src), str(self.nerfstudio_dir / "transforms.json"))
            logger.info("transforms.json found — ARKit poses will be used.")

        # Find all image files (may be in subdirectories)
        image_exts = {".jpg", ".jpeg", ".png", ".tiff", ".tif"}
        images = []
        for f in self.frames_dir.rglob("*"):
            if f.suffix.lower() in image_exts:
                images.append(f)

        if not self.poses_available:
            # Legacy path: flatten images to frames_dir root with sequential names
            for i, img in enumerate(sorted(images)):
                dest = self.frames_dir / f"frame_{i:05d}{img.suffix.lower()}"
                if img != dest:
                    shutil.move(str(img), str(dest))
        else:
            # ARKit path: keep frames/ subdirectory structure as-is
            # (transforms.json references relative paths like "frames/frame_00001.jpg")
            pass

        frame_count = len(images)
        elapsed = time.time() - start_time

        if frame_count < 10:
            raise PipelineError(
                f"Only {frame_count} images found. Need at least 10."
            )

        logger.info(f"Extracted {frame_count} images in {elapsed:.1f}s")
        self.metrics["steps"]["image_extraction"] = {
            "frame_count": frame_count,
            "duration_s": round(elapsed, 1),
        }
        return frame_count

    def _run_colmap(self):
        """Run COLMAP Structure from Motion via Nerfstudio's ns-process-data."""
        start = time.time()
        logger.info("Running COLMAP via ns-process-data...")

        cmd = [
            "ns-process-data", "images",
            "--data", str(self.frames_dir),
            "--output-dir", str(self.colmap_dir),
            "--no-gpu", "False",
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise PipelineError(
                f"COLMAP/ns-process-data failed: {result.stderr[:500]}"
            )

        # Check for sparse reconstruction output
        sparse_dir = self.colmap_dir / "sparse" / "0"
        if not sparse_dir.exists():
            sparse_dir = self.colmap_dir / "sparse"

        if not sparse_dir.exists():
            raise PipelineError(
                "COLMAP produced no sparse reconstruction. "
                "This usually means the images don't have enough overlap or are too blurry."
            )

        # Count 3D points from points3D.bin (approximate)
        points_file = sparse_dir / "points3D.bin"
        point_count = 0
        if points_file.exists():
            # Rough estimate: file size / ~60 bytes per point
            point_count = max(1, int(points_file.stat().st_size / 60))

        elapsed = time.time() - start
        logger.info(f"COLMAP completed: ~{point_count} points in {elapsed:.1f}s")
        self.metrics["steps"]["colmap"] = {
            "point_count": point_count,
            "duration_s": round(elapsed, 1),
        }
        return point_count

    def _prepare_arkit_dataset(self):
        """Validate the ARKit-provided Nerfstudio dataset (transforms.json + frames).

        The nerfstudio_dir must contain:
          transforms.json   — camera intrinsics + per-frame poses
          frames/           — JPEG images referenced in transforms.json
        """
        transforms_path = self.nerfstudio_dir / "transforms.json"
        if not transforms_path.exists():
            raise PipelineError(
                "transforms.json not found in ARKit frame package. "
                "Expected layout: transforms.json + frames/*.jpg in ZIP root."
            )

        with open(transforms_path) as f:
            data = json.load(f)

        frame_count = len(data.get("frames", []))
        if frame_count < 10:
            raise PipelineError(
                f"transforms.json contains only {frame_count} frames. Need at least 10."
            )

        # Symlink or copy the frames/ directory into nerfstudio_dir so relative paths resolve
        frames_src = self.frames_dir / "frames"
        frames_dst = self.nerfstudio_dir / "frames"
        if frames_src.exists() and not frames_dst.exists():
            frames_dst.symlink_to(frames_src.resolve())

        logger.info(
            f"ARKit dataset ready: {frame_count} frames with pre-computed poses. "
            "COLMAP skipped."
        )
        self.metrics["arkit_frame_count"] = frame_count

    def _train_splatfacto(self, data_dir=None):
        """Train Gaussian Splatting model using Nerfstudio Splatfacto.

        - For the ARKit path, data_dir points to nerfstudio_dir (contains transforms.json).
          Nerfstudio's nerfstudio dataparser reads transforms.json directly — no ns-process-data needed.
        - For the legacy COLMAP path, data_dir points to colmap_dir (COLMAP output).
        """
        if data_dir is None:
            data_dir = self.colmap_dir

        start = time.time()
        logger.info(f"Training Splatfacto model (30k iterations) with data: {data_dir} ...")

        cmd = [
            "ns-train", "splatfacto",
            "--data", str(data_dir),
            "--output-dir", str(self.train_dir),
            "--max-num-iterations", "30000",
            "--viewer.quit-on-train-completion", "True",
            "--logging.local-writer.enable", "False",
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
        if result.returncode != 0:
            raise PipelineError(f"Splatfacto training failed: {result.stderr[:500]}")

        elapsed = time.time() - start
        logger.info(f"Splatfacto training completed in {elapsed:.1f}s")
        self.metrics["steps"]["training"] = {
            "duration_s": round(elapsed, 1),
            "poses_available": self.poses_available,
        }

    def _export_and_upload(self):
        """Export trained model and upload results to GCS."""
        start = time.time()
        logger.info("Exporting model...")

        # Find the config file from training output
        config_files = list(self.train_dir.rglob("config.yml"))
        if not config_files:
            raise PipelineError("No config.yml found in training output")

        config_path = config_files[0]

        # Export Gaussian Splat as PLY
        cmd = [
            "ns-export", "gaussian-splat",
            "--load-config", str(config_path),
            "--output-dir", str(self.export_dir),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            raise PipelineError(f"Export failed: {result.stderr[:500]}")

        # Find exported files
        ply_files = list(self.export_dir.rglob("*.ply"))
        if not ply_files:
            raise PipelineError("No .ply file found in export output")

        ply_file = ply_files[0]

        # Copy to output directory with standard names
        output_ply = self.output_dir / "model.ply"
        shutil.copy2(str(ply_file), str(output_ply))

        # Upload to GCS
        output_paths = {}

        # Upload PLY
        ply_gcs_path = f"outputs/{self.job_id}/model.ply"
        self._upload_to_gcs(output_ply, ply_gcs_path)
        output_paths["ply"] = ply_gcs_path

        # Upload COLMAP sparse reconstruction
        colmap_gcs_prefix = f"outputs/{self.job_id}/colmap/"
        sparse_dir = self.colmap_dir / "sparse"
        if sparse_dir.exists():
            for f in sparse_dir.rglob("*"):
                if f.is_file():
                    gcs_path = colmap_gcs_prefix + str(f.relative_to(sparse_dir))
                    self._upload_to_gcs(f, gcs_path)
            output_paths["colmap"] = colmap_gcs_prefix

        # Try to convert PLY to SPLAT format for web viewing
        try:
            output_splat = self.output_dir / "model.splat"
            self._ply_to_splat(output_ply, output_splat)
            splat_gcs_path = f"outputs/{self.job_id}/model.splat"
            self._upload_to_gcs(output_splat, splat_gcs_path)
            output_paths["splat"] = splat_gcs_path
        except Exception as e:
            logger.warning(f"PLY to SPLAT conversion failed (non-fatal): {e}")

        # Upload metrics
        metrics_path = self.output_dir / "metrics.json"
        with open(metrics_path, "w") as f:
            json.dump(self.metrics, f, indent=2)
        self._upload_to_gcs(metrics_path, f"outputs/{self.job_id}/metrics.json")

        elapsed = time.time() - start
        logger.info(f"Export and upload completed in {elapsed:.1f}s")
        self.metrics["steps"]["export"] = {
            "duration_s": round(elapsed, 1),
            "output_paths": output_paths,
        }

        return output_paths

    def _ply_to_splat(self, ply_path, splat_path):
        """Convert PLY to SPLAT format for faster web loading.

        The SPLAT format stores each Gaussian as 32 bytes:
        - 3x float32 position (12 bytes)
        - 3x float32 scale (12 bytes)
        - 4x uint8 color RGBA (4 bytes)
        - 4x uint8 rotation quaternion (4 bytes)
        Total: 32 bytes per Gaussian
        """
        import struct
        import numpy as np

        logger.info("Converting PLY to SPLAT format...")

        # Read PLY file header
        with open(ply_path, "rb") as f:
            header = b""
            while True:
                line = f.readline()
                header += line
                if line.strip() == b"end_header":
                    break

            header_str = header.decode("ascii")
            vertex_count = 0
            for line in header_str.split("\n"):
                if line.startswith("element vertex"):
                    vertex_count = int(line.split()[-1])
                    break

            if vertex_count == 0:
                raise PipelineError("No vertices found in PLY file")

            self.metrics["point_count"] = vertex_count
            logger.info(f"PLY contains {vertex_count} Gaussians")

            # For now, just copy the PLY - full SPLAT conversion requires
            # parsing the specific property layout which varies by exporter.
            # The web viewer (gsplat.js) supports PLY directly.
            shutil.copy2(str(ply_path), str(splat_path))
            logger.info("Copied PLY as SPLAT placeholder (viewer supports PLY directly)")

    def _upload_to_gcs(self, local_path, gcs_path):
        """Upload a file to GCS or copy to local storage."""
        if self.local_mode:
            dest = Path(LOCAL_STORAGE_ROOT) / gcs_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(local_path), str(dest))
            logger.info(f"LOCAL MODE: Copied {local_path.name} -> {dest}")
        else:
            blob = self.bucket.blob(gcs_path)
            blob.upload_from_filename(str(local_path))
            logger.info(f"Uploaded {local_path.name} -> gs://{self.gcs_bucket}/{gcs_path}")

    def _update_status(self, status, **kwargs):
        """Update job status via callback URL."""
        logger.info(f"Status update: {status}")

        payload = {"status": status}
        payload.update(kwargs)

        if self.callback_url:
            try:
                headers = {"Content-Type": "application/json"}
                if self.callback_secret:
                    headers["X-Callback-Secret"] = self.callback_secret

                resp = requests.post(
                    self.callback_url,
                    json=payload,
                    headers=headers,
                    timeout=10,
                )
                if resp.status_code != 200:
                    logger.warning(
                        f"Callback returned {resp.status_code}: {resp.text[:200]}"
                    )
            except Exception as e:
                logger.warning(f"Callback failed (non-fatal): {e}")

    def _save_metrics(self):
        """Save metrics to local file."""
        try:
            metrics_path = self.workspace / "metrics.json"
            with open(metrics_path, "w") as f:
                json.dump(self.metrics, f, indent=2)
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Cosmic 3D Pipeline Worker")
    parser.add_argument("--job-id", required=True, help="Job ID")
    parser.add_argument("--gcs-bucket", required=True, help="GCS bucket name")
    parser.add_argument("--input-path", required=True, help="GCS path to input file")
    parser.add_argument("--supabase-url", required=True, help="Supabase URL")
    parser.add_argument("--supabase-key", required=True, help="Supabase service key")
    parser.add_argument("--callback-url", default="", help="Backend callback URL")
    parser.add_argument("--callback-secret", default="", help="Callback auth secret")
    parser.add_argument(
        "--poses-available",
        default="false",
        help="'true' if the input ZIP contains ARKit camera poses (transforms.json); skips COLMAP",
    )
    parser.add_argument("--workspace", default="/workspace", help="Working directory")

    args = parser.parse_args()

    # Convert --poses-available string to bool
    args.poses_available = args.poses_available.lower() in ("true", "1", "yes")

    pipeline = Pipeline(args)
    exit_code = pipeline.run()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
