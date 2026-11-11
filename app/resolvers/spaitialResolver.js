/**
 * Client for the SpAItial Echo-3 capture API and the pure helpers around it.
 * See docs/room-captures.md and https://docs.spaitial.ai/api/capture-worlds.
 *
 * The API key never leaves the backend. Parts of the API are not documented yet (the status
 * response of a finished job, the webhook payload and its signature), so this code only relies
 * on what is documented and treats everything else defensively.
 */
const axios = require('axios');
const crypto = require('crypto');

const SPAITIAL_API_BASE_URL =
  process.env.SPAITIAL_API_BASE_URL || 'https://api.spaitial.ai';
const MODEL = 'echo-3';
const OUTPUT_FORMAT = 'spz';
const MAX_FRAMES = 5000;

const COMPLETED_STATUSES = [
  'COMPLETED',
  'COMPLETE',
  'SUCCEEDED',
  'SUCCESS',
  'DONE',
  'READY',
];
const FAILED_STATUSES = ['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'];
const QUEUED_STATUSES = ['PENDING', 'QUEUED'];

function apiKey() {
  const key = process.env.SPAITIAL_API_KEY;
  if (!key) throw new Error('SPAITIAL_API_KEY is not set');
  return key;
}

function request(config) {
  return axios({
    baseURL: SPAITIAL_API_BASE_URL,
    timeout: 30000,
    ...config,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(config.headers || {}) },
  });
}

/** A readable message for an axios error from the SpAItial API. */
function describeApiError(error) {
  const status = error.response?.status;
  const body = error.response?.data;
  const code = body?.error?.code;
  const message = body?.error?.message || body?.message;
  if (status) {
    return `SpAItial API ${status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`;
  }
  return `SpAItial request failed: ${error.message}`;
}

/** Price, available credits and estimated duration for a capture with this many frames. */
async function getQuote(frameCount) {
  const { data } = await request({
    method: 'get',
    url: '/v1/captures/process-quote',
    params: { model: MODEL, frame_count: frameCount },
  });
  return data;
}

/** Submits a capture ZIP. Returns the API's 202 body ({ request_id, status, ... }). */
async function createWorld({ zipUrl, webhookUrl }) {
  const body = {
    model: MODEL,
    input: { type: 'capture_bundle', zip: { type: 'url', zip_url: zipUrl } },
    output_format: OUTPUT_FORMAT,
  };
  if (webhookUrl) body.webhook = { url: webhookUrl };
  const { data } = await request({
    method: 'post',
    url: '/v1/worlds',
    data: body,
  });
  if (!data?.request_id) throw new Error('SpAItial API returned no request_id');
  return data;
}

async function getStatus(requestId) {
  const { data } = await request({
    method: 'get',
    url: `/v1/worlds/requests/${encodeURIComponent(requestId)}/status`,
  });
  return data;
}

/**
 * Downloads the finished splat as a Buffer. The endpoint's response is not documented: it may be
 * the file itself (possibly after a redirect) or a JSON body that points at it.
 */
async function downloadSplat(requestId) {
  const response = await request({
    method: 'get',
    url: `/v1/worlds/requests/${encodeURIComponent(requestId)}/splat`,
    responseType: 'arraybuffer',
    timeout: 10 * 60 * 1000,
    maxContentLength: Infinity,
  });
  const buffer = Buffer.from(response.data);
  const contentType = String(response.headers['content-type'] || '');
  if (!contentType.includes('application/json')) return buffer;

  const url = splatUrlFromJson(JSON.parse(buffer.toString('utf8')));
  if (!url) throw new Error('SpAItial splat response contains no download URL');
  // A plain download URL; the API key must not be sent to another host.
  const file = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 10 * 60 * 1000,
    maxContentLength: Infinity,
  });
  return Buffer.from(file.data);
}

function splatUrlFromJson(body) {
  const candidates = [
    body?.url,
    body?.download_url,
    body?.splat_url,
    body?.splat?.url,
    body?.data?.url,
  ];
  return (
    candidates.find(
      (value) => typeof value === 'string' && /^https:\/\//.test(value),
    ) || null
  );
}

/**
 * Maps a SpAItial status to the status of a reconstruction job. Only PENDING and FAILED are
 * documented; any other unknown value counts as "still running".
 */
function mapProviderStatus(providerStatus) {
  const value = String(providerStatus || '').toUpperCase();
  if (COMPLETED_STATUSES.includes(value)) return 'completed';
  if (FAILED_STATUSES.includes(value)) return 'failed';
  if (QUEUED_STATUSES.includes(value) || value === '') return 'queued';
  return 'training_splat';
}

/** Error message for a failed job, built from the validation issues when there are any. */
function describeFailure(statusBody) {
  const issues = (statusBody?.validation?.issues || [])
    .filter((issue) => issue && (issue.severity === 'error' || !issue.severity))
    .map((issue) => [issue.code, issue.message].filter(Boolean).join(': '))
    .filter(Boolean);
  if (issues.length)
    return `Capture rejected: ${issues.join('; ')}`.slice(0, 2000);
  const message =
    statusBody?.error?.message || statusBody?.error || statusBody?.message;
  return typeof message === 'string' && message
    ? message.slice(0, 2000)
    : 'SpAItial reported the capture as failed';
}

/**
 * Token that authenticates a webhook call for one job. SpAItial does not document a webhook
 * signature, so the token is part of the webhook URL we hand to the API. It is derived from the
 * secret, which itself never leaves the backend.
 */
function webhookToken(jobId, secret = process.env.SPAITIAL_WEBHOOK_SECRET) {
  if (!secret) throw new Error('SPAITIAL_WEBHOOK_SECRET is not set');
  return crypto
    .createHmac('sha256', secret)
    .update(`room-capture:${jobId}`)
    .digest('hex');
}

function isValidWebhookToken(
  jobId,
  token,
  secret = process.env.SPAITIAL_WEBHOOK_SECRET,
) {
  if (!secret || typeof token !== 'string') return false;
  const expected = Buffer.from(webhookToken(jobId, secret));
  const given = Buffer.from(token);
  return (
    expected.length === given.length && crypto.timingSafeEqual(expected, given)
  );
}

function webhookUrl(jobId, baseUrl = process.env.CALLBACK_BASE_URL) {
  if (!baseUrl || !process.env.SPAITIAL_WEBHOOK_SECRET) return null;
  return `${baseUrl.replace(/\/+$/, '')}/room-captures/${jobId}/webhook?token=${webhookToken(jobId)}`;
}

/** Validates the frame count of a capture; returns an error message or null. */
function frameCountError(frameCount) {
  if (
    !Number.isInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > MAX_FRAMES
  ) {
    return `frame_count must be an integer between 1 and ${MAX_FRAMES}`;
  }
  return null;
}

module.exports = {
  MODEL,
  OUTPUT_FORMAT,
  MAX_FRAMES,
  getQuote,
  createWorld,
  getStatus,
  downloadSplat,
  splatUrlFromJson,
  mapProviderStatus,
  describeFailure,
  describeApiError,
  webhookToken,
  isValidWebhookToken,
  webhookUrl,
  frameCountError,
};
