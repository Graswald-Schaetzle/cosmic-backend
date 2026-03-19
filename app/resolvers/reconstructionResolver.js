const { Storage } = require('@google-cloud/storage');
const axios = require('axios');

const GCS_BUCKET = process.env.GCS_3D_PIPELINE_BUCKET || 'cosmic-3d-pipeline';
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;

let storage;

function getStorage() {
  if (!storage) storage = new Storage();
  return storage;
}

async function generateSignedUploadUrl(jobId, filename) {
  const gcs = getStorage();
  const bucket = gcs.bucket(GCS_BUCKET);
  const file = bucket.file(`inputs/${jobId}/${filename}`);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    contentType: 'application/octet-stream',
  });

  return { url, gcsPath: `inputs/${jobId}/${filename}` };
}

async function generateSignedDownloadUrl(gcsPath) {
  const gcs = getStorage();
  const bucket = gcs.bucket(GCS_BUCKET);
  const file = bucket.file(gcsPath);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  return url;
}

async function submitBatchJob(jobId, inputPath, supabaseUrl, supabaseKey) {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    throw new Error(
      'RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID must be set to submit RunPod jobs',
    );
  }

  if (!CALLBACK_BASE_URL) {
    throw new Error(
      'CALLBACK_BASE_URL must be set to a publicly reachable URL so the worker can post status updates',
    );
  }

  const response = await axios.post(
    `https://api.runpod.io/v2/${RUNPOD_ENDPOINT_ID}/run`,
    {
      input: {
        job_id: String(jobId),
        gcs_bucket: GCS_BUCKET,
        input_path: inputPath,
        supabase_url: supabaseUrl,
        supabase_key: supabaseKey,
        callback_url: `${CALLBACK_BASE_URL}/reconstruction-jobs/${jobId}/callback`,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return {
    runpodJobId: response.data.id,
    runpodJobName: `runpod-${jobId}-${response.data.id}`,
  };
}

module.exports = {
  generateSignedUploadUrl,
  generateSignedDownloadUrl,
  submitBatchJob,
  GCS_BUCKET,
};
