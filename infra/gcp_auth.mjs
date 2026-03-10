/**
 * GCP Service Account authentication via JWT.
 * Returns an OAuth2 access token for GCP REST APIs.
 *
 * Usage:
 *   node infra/gcp_auth.mjs                    # prints token
 *   node infra/gcp_auth.mjs --curl URL          # curl with auth header
 */

import { readFileSync } from "fs";
import { createSign } from "crypto";

const KEY_FILE = "/home/user/cosmic-backend/infra/gcp-service-account-key.json";

export async function getAccessToken() {
  const sa = JSON.parse(readFileSync(KEY_FILE, "utf8"));

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };

  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.access_token;
}

// CLI usage
if (process.argv[1]?.endsWith("gcp_auth.mjs")) {
  const token = await getAccessToken();
  if (process.argv[2] === "--curl") {
    // Execute curl with auth
    const url = process.argv[3];
    console.log(`Authorization: Bearer ${token}`);
  } else {
    console.log(token);
  }
}
