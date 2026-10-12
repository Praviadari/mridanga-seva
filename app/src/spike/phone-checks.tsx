// Face spike (P3-0, never merged): the other questions of the spike, one button each —
// phone fingerprint (expo-local-authentication: proves "an enrolled finger on this phone", never who it is),
// SQLCipher (expo-sqlite built with useSQLCipher) and Keystore-backed storage (expo-secure-store) for a local
// template, Google Play Integrity and Android key attestation (@expo/app-integrity) on a link-installed APK,
// model speed, memory. Every result is a line of text the tester can share; nothing leaves the phone otherwise.

import * as AppIntegrity from '@expo/app-integrity';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { deviceLine, readPeakMb, readRssMb } from './device-info';
import { loadModels } from './pipeline';

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fingerprintCheck(): Promise<string> {
  const hw = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  const names = types.map((t) => LocalAuthentication.AuthenticationType[t]).join('+') || 'none';
  const head = `hardware ${hw}, enrolled ${enrolled}, types ${names}, level ${LocalAuthentication.SecurityLevel[level]}`;
  if (!hw || !enrolled) return `${head} — cannot test the prompt`;
  const t0 = Date.now();
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Spike test: touch the fingerprint sensor',
    biometricsSecurityLevel: 'strong',
    disableDeviceFallback: true,
    cancelLabel: 'Cancel',
  });
  const ms = Date.now() - t0;
  return `${head}; prompt → ${r.success ? 'success' : `error ${r.error}`} after ${ms} ms (includes the person's own time)`;
}

async function sqlcipherCheck(): Promise<string> {
  let key = await SecureStore.getItemAsync('spike.cipher.key');
  if (!key) {
    key = hex(Crypto.getRandomBytes(32));
    await SecureStore.setItemAsync('spike.cipher.key', key);
  }
  const t0 = Date.now();
  const db = await SQLite.openDatabaseAsync('spike-cipher.db');
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  const ver = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
  await db.execAsync('CREATE TABLE IF NOT EXISTS tpl (code TEXT PRIMARY KEY, data BLOB)');
  const blob = Crypto.getRandomBytes(512); // the size of one 128-float template
  await db.runAsync('INSERT OR REPLACE INTO tpl (code, data) VALUES (?, ?)', 'TEST', blob);
  const back = await db.getFirstAsync<{ data: Uint8Array }>('SELECT data FROM tpl WHERE code = ?', 'TEST');
  await db.closeAsync();
  const same = back?.data && back.data.length === blob.length && back.data.every((b, i) => b === blob[i]);
  const ms = Date.now() - t0;
  // A wrong key must not open it.
  let wrongKey = 'opened (NOT encrypted!)';
  const db2 = await SQLite.openDatabaseAsync('spike-cipher.db');
  try {
    await db2.execAsync(`PRAGMA key = "x'${'00'.repeat(32)}'"`);
    await db2.getFirstAsync('SELECT count(*) FROM sqlite_master');
  } catch (e) {
    wrongKey = `refused (${String(e).slice(0, 60)})`;
  } finally {
    await db2.closeAsync();
  }
  return `cipher_version ${ver?.cipher_version ?? 'none (SQLCipher NOT active)'}; write+read ${same ? 'OK' : 'MISMATCH'} in ${ms} ms; wrong key ${wrongKey}`;
}

async function secureStoreCheck(withAuth: boolean): Promise<string> {
  const value = hex(Crypto.getRandomBytes(1024)); // ~2 KB like a template with samples
  const opts = withAuth ? { requireAuthentication: true, authenticationPrompt: 'Spike: unlock the test template' } : {};
  const key = withAuth ? 'spike.bio.test' : 'spike.plain.test';
  const t0 = Date.now();
  await SecureStore.setItemAsync(key, value, opts);
  const t1 = Date.now();
  const back = await SecureStore.getItemAsync(key, opts);
  const t2 = Date.now();
  await SecureStore.deleteItemAsync(key, opts);
  return `${withAuth ? 'with fingerprint lock' : 'plain Keystore'}: write ${t1 - t0} ms, read ${t2 - t1} ms, ${back === value ? 'OK' : 'MISMATCH'}`;
}

async function modelSpeed(): Promise<string> {
  const m = await loadModels();
  const runs = 20;
  const sIn = new Float32Array(112 * 112 * 3).fill(128);
  const fIn = new Float32Array(80 * 80 * 3).fill(128);
  await m.sface.run([sIn.buffer]);
  let t = Date.now();
  for (let i = 0; i < runs; i++) await m.sface.run([sIn.buffer]);
  const sMs = (Date.now() - t) / runs;
  t = Date.now();
  for (let i = 0; i < runs; i++) {
    await m.fasA.run([fIn.buffer]);
    await m.fasB.run([fIn.buffer]);
  }
  const fMs = (Date.now() - t) / runs;
  const shape = (x: typeof m.sface) => `${x.inputs[0]?.shape.join('x')} ${x.inputs[0]?.dataType}`;
  return `load ${m.loadMs} ms; SFace ${sMs.toFixed(1)} ms/run (${shape(m.sface)}); MiniFASNet pair ${fMs.toFixed(1)} ms/run (${shape(m.fasA)}); delegates [${m.sface.delegates.join(',') || 'cpu'}]`;
}

/**
 * Gate 1 (audit S4F-01): the request hash that binds one integrity verdict to one check-in. The "server"
 * (docs/phase3/spike-tools/gate1-server.mjs on the PC in the spike, an Edge Function in P3-6) issues a
 * single-use challenge, recomputes this hash and compares it with the decoded verdict's requestHash.
 */
export function selfScanRequestText(code: string, action: 'checkin' | 'checkout', challenge: string, location: 'inside' | 'outside') {
  return `mrdg-selfscan-v1|${code}|${action}|${challenge}|${location}`;
}

type Gate1Input = { projectNumber: string; challenge: string; code: string };

let preparedFor: string | null = null;

async function playIntegrity({ projectNumber, challenge, code }: Gate1Input): Promise<{ line: string; share?: string }> {
  if (!/^\d{6,20}$/.test(projectNumber)) return { line: 'Type the Google Cloud project number first (digits only).' };
  if (!/^[0-9a-f]{16,64}$/.test(challenge)) return { line: 'Type the server challenge from the PC (gate1-server.mjs issue) — hex, 16+ characters.' };
  const t0 = Date.now();
  let prepareMs = 0;
  if (preparedFor !== projectNumber) {
    await AppIntegrity.prepareIntegrityTokenProviderAsync(projectNumber);
    preparedFor = projectNumber;
    prepareMs = Date.now() - t0;
  }
  const text = selfScanRequestText(code, 'checkin', challenge, 'inside');
  const requestHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
  const t1 = Date.now();
  let token: string;
  try {
    token = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
  } catch (e) {
    // ERR_APP_INTEGRITY_PROVIDER_INVALID = the prepared provider expired: prepare again on the next tap.
    preparedFor = null;
    throw e;
  }
  const t2 = Date.now();
  return {
    line: `prepare ${prepareMs ? `${prepareMs} ms` : 'reused'}, token ${t2 - t1} ms (length ${token.length}); bound to "${text}" → requestHash ${requestHash.slice(0, 12)}… — share it to the PC now (the challenge expires 60 s after it was issued)`,
    share: JSON.stringify({ kind: 'play-integrity', code, challenge, requestText: text, requestHash, tokenAt: t2, token }),
  };
}

async function keyAttestation({ challenge, code }: Gate1Input): Promise<{ line: string; share?: string }> {
  const supported = await AppIntegrity.isHardwareAttestationSupportedAsync();
  if (!supported) return { line: 'hardware key attestation: NOT supported on this phone' };
  // The server challenge when one is typed (binds the attestation to this check-in too), else a random one.
  const usedChallenge = /^[0-9a-f]{16,64}$/.test(challenge) ? challenge : hex(Crypto.getRandomBytes(16));
  const alias = `spike-${Date.now()}`;
  const t0 = Date.now();
  await AppIntegrity.generateHardwareAttestedKeyAsync(alias, usedChallenge);
  const chain = await AppIntegrity.getAttestationCertificateChainAsync(alias);
  return {
    line: `hardware key attestation: supported; chain of ${chain.length} certificates in ${Date.now() - t0} ms (challenge ${usedChallenge === challenge ? 'from the server' : 'random'}) — share it to the PC`,
    share: JSON.stringify({ kind: 'key-attestation', code, challenge: usedChallenge, chain }),
  };
}

type Row = { label: string; run: () => Promise<string | { line: string; share?: string }> };

export function PhoneChecks() {
  const [lines, setLines] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [project, setProject] = useState('');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('V01');
  const gate1 = { projectNumber: project.trim(), challenge: challenge.trim().toLowerCase(), code: code.trim().toUpperCase() };

  const rows: Row[] = [
    { label: 'Phone and memory', run: async () => `${deviceLine()}; memory now ${readRssMb() ?? '?'} MB, peak ${readPeakMb() ?? '?'} MB` },
    { label: 'Model speed (20 runs)', run: modelSpeed },
    { label: 'Fingerprint prompt (UX only — not attendance)', run: fingerprintCheck },
    { label: 'Keystore storage', run: () => secureStoreCheck(false) },
    { label: 'Keystore + fingerprint lock', run: () => secureStoreCheck(true) },
    { label: 'SQLCipher database', run: sqlcipherCheck },
    { label: 'Gate 1: Play Integrity for this check-in', run: () => playIntegrity(gate1) },
    { label: 'Gate 1: key attestation for this check-in', run: () => keyAttestation(gate1) },
  ];

  async function run(r: Row) {
    setBusy(r.label);
    try {
      const out = await r.run();
      const line = typeof out === 'string' ? out : out.line;
      setLines((l) => ({ ...l, [r.label]: line }));
      if (typeof out !== 'string' && out.share) setShares((s) => ({ ...s, [r.label]: out.share! }));
    } catch (e) {
      setLines((l) => ({ ...l, [r.label]: `ERROR ${String(e)}` }));
    } finally {
      setBusy(null);
    }
  }

  const report = rows.filter((r) => lines[r.label]).map((r) => `${r.label}: ${lines[r.label]}`).join('\n');

  return (
    <View style={styles.wrap}>
      <Text style={styles.note}>Gate 1 (one check-in): Google Cloud project number, the challenge the PC just issued (valid 60 s), and the volunteer code.</Text>
      <TextInput value={project} onChangeText={setProject} keyboardType="number-pad" placeholder="Cloud project number, e.g. 123456789012" style={styles.input} />
      <TextInput value={challenge} onChangeText={setChallenge} autoCapitalize="none" autoCorrect={false} placeholder="Server challenge (16 hex characters)" style={styles.input} />
      <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Volunteer code" style={styles.input} />
      <Text style={styles.note}>The fingerprint prompt is measured only as a possible add-on to a rotating My QR; it proves who unlocked this phone, not who is checking in.</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Pressable style={styles.button} disabled={busy !== null} onPress={() => run(r)} accessibilityRole="button">
            <Text style={styles.buttonText}>{busy === r.label ? 'Running…' : r.label}</Text>
          </Pressable>
          {lines[r.label] ? <Text selectable style={styles.line}>{lines[r.label]}</Text> : null}
          {shares[r.label] ? (
            <Pressable onPress={() => Share.share({ message: shares[r.label] })} accessibilityRole="button">
              <Text style={styles.link}>Share the raw result</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {report ? (
        <Pressable style={styles.button} onPress={() => Share.share({ message: `Face spike phone checks\n${report}` })} accessibilityRole="button">
          <Text style={styles.buttonText}>Share all these lines</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { gap: 4 },
  note: { fontSize: 13, color: '#444' },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10, fontSize: 16 },
  button: { backgroundColor: '#5B21B6', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  line: { fontSize: 13, color: '#222' },
  link: { color: '#5B21B6', textDecorationLine: 'underline', fontSize: 13 },
});
