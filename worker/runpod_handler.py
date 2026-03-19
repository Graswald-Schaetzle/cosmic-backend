import runpod
import subprocess
import os

def handler(job):
    job_input = job["input"]

    # Set env vars for the pipeline script
    env = os.environ.copy()
    env["JOB_ID"] = str(job_input["job_id"])
    env["GCS_BUCKET"] = job_input["gcs_bucket"]
    env["INPUT_PATH"] = job_input["input_path"]
    env["SUPABASE_URL"] = job_input["supabase_url"]
    env["SUPABASE_KEY"] = job_input["supabase_key"]
    env["CALLBACK_URL"] = job_input["callback_url"]

    result = subprocess.run(
        ["/app/scripts/entrypoint.sh"],
        env=env,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return {"error": result.stderr[-2000:]}

    return {"status": "completed", "stdout": result.stdout[-2000:]}

runpod.serverless.start({"handler": handler})
