const { Storage } = require('@google-cloud/storage');
const { BatchServiceClient } = require('@google-cloud/batch').v1;

const GCS_BUCKET = process.env.GCS_3D_PIPELINE_BUCKET || 'cosmic-3d-pipeline';
const GCP_PROJECT = process.env.GCP_PROJECT_ID;
const GCP_REGION = process.env.GCP_REGION || 'europe-west4';
const WORKER_IMAGE = process.env.WORKER_DOCKER_IMAGE;
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL;

let storage;
let batchClient;

function getStorage() {
  if (!storage) storage = new Storage();
  return storage;
}

function getBatchClient() {
  if (!batchClient) batchClient = new BatchServiceClient();
  return batchClient;
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
  if (!GCP_PROJECT || !WORKER_IMAGE) {
    throw new Error(
      'GCP_PROJECT_ID and WORKER_DOCKER_IMAGE must be set to submit batch jobs',
    );
  }

  const client = getBatchClient();

  const batchJobId = `recon-${jobId}-${Date.now()}`;

  const job = {
    taskGroups: [
      {
        taskCount: 1,
        taskSpec: {
          runnables: [
            {
              container: {
                imageUri: WORKER_IMAGE,
                commands: [],
              },
              environment: {
                variables: {
                  JOB_ID: String(jobId),
                  GCS_BUCKET: GCS_BUCKET,
                  INPUT_PATH: inputPath,
                  SUPABASE_URL: supabaseUrl,
                  SUPABASE_KEY: supabaseKey,
                  CALLBACK_URL: `${CALLBACK_BASE_URL}/reconstruction-jobs/${jobId}/callback`,
                },
              },
            },
          ],
          computeResource: {
            cpuMilli: 8000, // 8 vCPUs
            memoryMib: 30000, // 30 GB RAM
          },
          maxRunDuration: { seconds: 7200 }, // 2 hour timeout
        },
      },
    ],
    allocationPolicy: {
      instances: [
        {
          policy: {
            machineType: 'n1-standard-8',
            accelerators: [
              {
                type: 'nvidia-tesla-t4',
                count: 1,
              },
            ],
          },
          installGpuDrivers: true,
        },
      ],
      location: {
        allowedLocations: [`regions/${GCP_REGION}`],
      },
    },
    logsPolicy: {
      destination: 'CLOUD_LOGGING',
    },
  };

  const [response] = await client.createJob({
    parent: `projects/${GCP_PROJECT}/locations/${GCP_REGION}`,
    jobId: batchJobId,
    job,
  });

  return {
    batchJobName: response.name,
    batchJobId,
  };
}

module.exports = {
  generateSignedUploadUrl,
  generateSignedDownloadUrl,
  submitBatchJob,
  GCS_BUCKET,
};
