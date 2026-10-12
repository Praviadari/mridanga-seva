# Gate 1 of the face spike: asks GOOGLE to decode one Play Integrity token (the only way for an app that
# is not on Google Play). Run it in Google Cloud Shell (shell.cloud.google.com, browser, nothing to install),
# in the Cloud project whose NUMBER the spike app used. See docs/phase3/SPIKE_RESULT.md §8 "Gate 1 steps".
#
#   python3 gate1-decode.py key.json shared.json > decoded.json
#
# key.json   = a key of the service account made for this test (delete the key afterwards)
# shared.json = what the spike app shared ("Share the raw result" under Gate 1: Play Integrity)
# Prints Google's answer as JSON; nothing else is sent anywhere.

import json
import sys
import urllib.request

import google.auth.transport.requests
from google.oauth2 import service_account

PACKAGE = 'org.mridangaseva.app.spike'

key_path, shared_path = sys.argv[1], sys.argv[2]
creds = service_account.Credentials.from_service_account_file(
    key_path, scopes=['https://www.googleapis.com/auth/playintegrity'])
creds.refresh(google.auth.transport.requests.Request())
token = json.load(open(shared_path))['token']
req = urllib.request.Request(
    f'https://playintegrity.googleapis.com/v1/{PACKAGE}:decodeIntegrityToken',
    data=json.dumps({'integrity_token': token}).encode(),
    headers={'Authorization': f'Bearer {creds.token}', 'Content-Type': 'application/json'},
    method='POST')
try:
    with urllib.request.urlopen(req) as r:
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print(json.dumps({'error': e.code, 'body': e.read().decode()}))
    sys.exit(1)
