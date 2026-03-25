"""
GCP Service Account authentication helper.
Returns an OAuth2 access token for use with GCP REST APIs.
"""

import json
import time
import jwt
import requests

KEY_FILE = "/home/user/cosmic-backend/infra/gcp-service-account-key.json"

def get_access_token(scopes=None):
    """Get OAuth2 access token from service account key."""
    if scopes is None:
        scopes = "https://www.googleapis.com/auth/cloud-platform"

    with open(KEY_FILE) as f:
        sa = json.load(f)

    now = int(time.time())
    payload = {
        "iss": sa["client_email"],
        "sub": sa["client_email"],
        "aud": sa["token_uri"],
        "iat": now,
        "exp": now + 3600,
        "scope": scopes,
    }

    signed_jwt = jwt.encode(payload, sa["private_key"], algorithm="RS256")

    resp = requests.post(sa["token_uri"], data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": signed_jwt,
    })
    resp.raise_for_status()
    return resp.json()["access_token"]


if __name__ == "__main__":
    token = get_access_token()
    print(token)
