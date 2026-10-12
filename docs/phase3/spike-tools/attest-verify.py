# Face spike, Gate 1 alternative (docs/phase3/SPIKE_RESULT.md §8): verifies an Android hardware KEY
# ATTESTATION chain that the spike app shared ("Gate 1: key attestation for this check-in"). This is the
# check our own server could do in P3-6 with no Google account: chain up to Google's attestation root,
# not revoked, the server's challenge inside, key in secure hardware, bootloader locked + verified boot,
# and WHICH app (package + signing certificate) asked.
#
#   python -I attest-verify.py shared.json <google-roots-dir> [--cert <signing cert sha256 hex>]
#
# google-roots-dir: the PEM root certificates from
# https://developer.android.com/privacy-and-security/security-key-attestation (saved as *.pem).
# Needs: cryptography. Fetches Google's revocation list (https://android.googleapis.com/attestation/status).

import base64
import glob
import json
import os
import sys
import urllib.request

from cryptography import x509
from cryptography.hazmat.primitives import serialization

PACKAGE = 'org.mridangaseva.app.spike'
KEY_DESCRIPTION_OID = '1.3.6.1.4.1.11129.2.1.17'
LEVELS = {0: 'Software', 1: 'TrustedEnvironment', 2: 'StrongBox'}
BOOT = {0: 'Verified', 1: 'SelfSigned', 2: 'Unverified', 3: 'Failed'}


def tlv(data, i=0):
    """One DER element at i: (tag_class, constructed, tag_number, value_bytes, next_index)."""
    b = data[i]; i += 1
    cls, cons, num = b >> 6, bool(b & 0x20), b & 0x1F
    if num == 0x1F:
        num = 0
        while True:
            c = data[i]; i += 1
            num = (num << 7) | (c & 0x7F)
            if not c & 0x80:
                break
    n = data[i]; i += 1
    if n & 0x80:
        k = n & 0x7F
        n = int.from_bytes(data[i:i + k], 'big'); i += k
    return cls, cons, num, data[i:i + n], i + n


def children(value):
    out, i = [], 0
    while i < len(value):
        cls, cons, num, v, i = tlv(value, i)
        out.append((cls, cons, num, v))
    return out


def as_int(v):
    return int.from_bytes(v, 'big', signed=True)


def load_cert(s):
    s = s.strip()
    if s.startswith('-----BEGIN'):
        return x509.load_pem_x509_certificate(s.encode())
    return x509.load_der_x509_certificate(base64.b64decode(s))


def spki(cert_or_key):
    k = cert_or_key.public_key() if hasattr(cert_or_key, 'public_key') else cert_or_key
    return k.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


def main():
    shared = json.load(open(sys.argv[1]))
    roots_dir = sys.argv[2]
    pinned = None
    if '--cert' in sys.argv:
        pinned = bytes.fromhex(sys.argv[sys.argv.index('--cert') + 1].replace(':', ''))
    chain = [load_cert(c) for c in shared['chain']]
    results = []

    def rule(name, ok, detail=''):
        results.append((bool(ok), name, detail))

    # 1. Signatures leaf → root, and the root is one of Google's.
    sig_ok = True
    for child, parent in zip(chain, chain[1:]):
        try:
            child.verify_directly_issued_by(parent)
        except Exception as e:  # noqa: BLE001
            sig_ok = False
            rule('chain signatures', False, f'{child.subject.rfc4514_string()}: {e}')
    rule('each certificate signed by the next', sig_ok, f'{len(chain)} certificates')
    roots = [x509.load_pem_x509_certificate(open(f, 'rb').read()) for f in glob.glob(os.path.join(roots_dir, '*.pem'))]
    rule("root key is Google's attestation root", spki(chain[-1]) in {spki(r) for r in roots}, chain[-1].subject.rfc4514_string())

    # 2. Revocation list.
    try:
        with urllib.request.urlopen('https://android.googleapis.com/attestation/status', timeout=15) as r:
            status = json.load(r).get('entries', {})
        revoked = [f'{c.serial_number:x}' for c in chain if f'{c.serial_number:x}' in status]
        rule('no certificate revoked', not revoked, ','.join(revoked) or 'none listed')
    except Exception as e:  # noqa: BLE001
        rule('no certificate revoked', False, f'could not fetch the list: {e}')

    # 3. The attestation extension of the leaf.
    leaf = chain[0]
    ext = next((e for e in leaf.extensions if e.oid.dotted_string == KEY_DESCRIPTION_OID), None)
    if ext is None:
        rule('leaf has the key attestation extension', False)
    else:
        kd = children(tlv(ext.value.value)[3])
        att_version, att_level = as_int(kd[0][3]), as_int(kd[1][3])
        km_level = as_int(kd[3][3])
        challenge = kd[4][3]
        expected = shared['challenge'].encode()
        rule('challenge = the server challenge', challenge in (expected, bytes.fromhex(shared['challenge']) if len(shared['challenge']) % 2 == 0 else b''), challenge.hex())
        rule('attestation in secure hardware', att_level in (1, 2), f'attestation {LEVELS.get(att_level)}, keymint {LEVELS.get(km_level)}, version {att_version}')
        sw, hw = children(kd[6][3]), children(kd[7][3])
        tagged = {num: v for (_c, _k, num, v) in sw + hw}
        rot = tagged.get(704)
        if rot:
            r = children(tlv(rot)[3])
            locked = r[1][3] != b'\x00'
            boot = as_int(r[2][3])
            rule('bootloader locked', locked, str(locked))
            rule('verified boot state Verified', boot == 0, BOOT.get(boot, str(boot)))
        else:
            rule('root of trust present', False)
        app_id = tagged.get(709)
        if app_id:
            inner = children(tlv(tlv(app_id)[3])[3])  # [709] → OCTET STRING → SEQUENCE
            pkgs = [children(p[3]) for p in children(inner[0][3])]
            names = [p[0][3].decode(errors='replace') for p in pkgs]
            digests = [d[3] for d in children(inner[1][3])]
            rule('asking app is the spike', PACKAGE in names, ','.join(names))
            if pinned:
                rule('signing certificate = the pinned one', pinned in digests, ','.join(d.hex() for d in digests))
            else:
                rule('signing certificate reported', bool(digests), ','.join(d.hex() for d in digests))
        else:
            rule('attestationApplicationId present', False)

    for ok, name, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}  [{detail}]")
    all_ok = all(ok for ok, _, _ in results)
    print('KEY ATTESTATION CHECK: PASS' if all_ok else 'KEY ATTESTATION CHECK: FAIL')
    sys.exit(0 if all_ok else 1)


if __name__ == '__main__':
    main()
