/**
 * GCP Infrastructure Setup via REST APIs
 * Sets up everything needed for the 3D pipeline:
 * - Enable APIs
 * - Create GCS bucket
 * - Create Artifact Registry
 * - Configure CORS + lifecycle
 */

const { createSign } = require("crypto");
const { execSync } = require("child_process");
const fs = require("fs");

const SA_KEY = JSON.parse(
  fs.readFileSync("/home/user/cosmic-backend/infra/gcp-service-account-key.json", "utf8")
);
const PROJECT_ID = SA_KEY.project_id;
const REGION = "europe-west4";
const BUCKET_NAME = "cosmic-3d-pipeline";
const AR_REPO = "cosmic-workers";

// ── Auth ─────────────────────────────────────────────────────────────────────

function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: SA_KEY.client_email,
    sub: SA_KEY.client_email,
    aud: SA_KEY.token_uri,
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(SA_KEY.private_key, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const result = execSync(
    `curl -s -X POST https://oauth2.googleapis.com/token -H "Content-Type: application/x-www-form-urlencoded" -d '${body}'`,
    { timeout: 30000 }
  );
  return JSON.parse(result.toString()).access_token;
}

function gcpApi(method, url, body = null) {
  const token = getAccessToken();
  let cmd = `curl -s -w "\\n%{http_code}" -X ${method} "${url}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`;
  if (body) {
    const jsonStr = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += ` -d '${jsonStr}'`;
  }
  const result = execSync(cmd, { timeout: 60000 }).toString();
  const lines = result.trim().split("\n");
  const httpCode = parseInt(lines.pop());
  const responseBody = lines.join("\n");
  let parsed = {};
  try {
    parsed = JSON.parse(responseBody);
  } catch (e) {
    parsed = { raw: responseBody };
  }
  return { status: httpCode, body: parsed };
}

// ── Setup Steps ──────────────────────────────────────────────────────────────

function enableApi(apiName) {
  process.stdout.write(`  Enabling ${apiName}... `);
  const resp = gcpApi(
    "POST",
    `https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services/${apiName}:enable`,
    {}
  );
  if (resp.status === 200 || resp.status === 409) {
    console.log("✓");
    return true;
  }
  console.log(`⚠ ${resp.status}: ${JSON.stringify(resp.body?.error?.message || resp.body)}`);
  return false;
}

function createBucket() {
  process.stdout.write(`  Creating bucket gs://${BUCKET_NAME}... `);

  // Check if exists
  const check = gcpApi("GET", `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}`);
  if (check.status === 200) {
    console.log("already exists ✓");
    return true;
  }

  const resp = gcpApi(
    "POST",
    `https://storage.googleapis.com/storage/v1/b?project=${PROJECT_ID}`,
    {
      name: BUCKET_NAME,
      location: REGION,
      iamConfiguration: {
        uniformBucketLevelAccess: { enabled: true },
      },
    }
  );
  if (resp.status === 200) {
    console.log("✓");
    return true;
  }
  console.log(`⚠ ${resp.status}: ${JSON.stringify(resp.body?.error?.message || resp.body)}`);
  return false;
}

function setBucketLifecycle() {
  process.stdout.write("  Setting lifecycle rules... ");
  const resp = gcpApi(
    "PATCH",
    `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}`,
    {
      lifecycle: {
        rule: [
          {
            action: { type: "Delete" },
            condition: { age: 90, matchesPrefix: ["outputs/"] },
          },
          {
            action: { type: "Delete" },
            condition: { age: 7, matchesPrefix: ["inputs/"] },
          },
        ],
      },
    }
  );
  if (resp.status === 200) {
    console.log("✓");
    return true;
  }
  console.log(`⚠ ${resp.status}`);
  return false;
}

function setBucketCors() {
  process.stdout.write("  Setting CORS... ");
  const resp = gcpApi(
    "PATCH",
    `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}`,
    {
      cors: [
        {
          origin: ["*"],
          method: ["GET", "PUT", "POST", "HEAD"],
          responseHeader: ["Content-Type", "x-goog-resumable", "Access-Control-Allow-Origin"],
          maxAgeSeconds: 3600,
        },
      ],
    }
  );
  if (resp.status === 200) {
    console.log("✓");
    return true;
  }
  console.log(`⚠ ${resp.status}`);
  return false;
}

function createArtifactRegistry() {
  process.stdout.write(`  Creating Artifact Registry ${AR_REPO}... `);

  // Check if exists
  const check = gcpApi(
    "GET",
    `https://artifactregistry.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/repositories/${AR_REPO}`
  );
  if (check.status === 200) {
    console.log("already exists ✓");
    return true;
  }

  const resp = gcpApi(
    "POST",
    `https://artifactregistry.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/repositories?repositoryId=${AR_REPO}`,
    {
      format: "DOCKER",
      description: "Cosmic 3D pipeline worker containers",
    }
  );
  if (resp.status === 200) {
    console.log("✓ (creating...)");
    return true;
  }
  console.log(`⚠ ${resp.status}: ${JSON.stringify(resp.body?.error?.message || resp.body)}`);
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("======================================================");
  console.log("Cosmic 3D Pipeline - GCP Setup");
  console.log("======================================================");
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`Region:   ${REGION}`);
  console.log(`Bucket:   ${BUCKET_NAME}`);
  console.log(`Registry: ${AR_REPO}`);
  console.log("======================================================\n");

  console.log("→ Step 1: Enable APIs");
  enableApi("batch.googleapis.com");
  enableApi("storage.googleapis.com");
  enableApi("artifactregistry.googleapis.com");
  enableApi("logging.googleapis.com");
  enableApi("compute.googleapis.com");

  console.log("\n→ Step 2: Create GCS Bucket");
  createBucket();
  setBucketLifecycle();
  setBucketCors();

  console.log("\n→ Step 3: Create Artifact Registry");
  createArtifactRegistry();

  const AR_HOST = `${REGION}-docker.pkg.dev`;
  const WORKER_IMAGE = `${AR_HOST}/${PROJECT_ID}/${AR_REPO}/3d-worker`;

  console.log("\n======================================================");
  console.log("✅ Setup complete!");
  console.log("======================================================\n");
  console.log("Environment variables for .env:");
  console.log(`  GCP_PROJECT_ID=${PROJECT_ID}`);
  console.log(`  GCP_REGION=${REGION}`);
  console.log(`  GCS_3D_PIPELINE_BUCKET=${BUCKET_NAME}`);
  console.log(`  WORKER_DOCKER_IMAGE=${WORKER_IMAGE}:latest`);
  console.log("");
}

main();
