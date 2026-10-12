// Face spike (Phase 3 P3-0, branch p3-spike, never merged): the whole test app. The APK built from this
// branch is "Mridanga Seva SPIKE" (org.mridangaseva.app.spike) and installs next to the real app. It has no
// server: templates and scores stay on the test phone (src/spike/store.ts). Only consenting adult
// volunteers, by code (V01…), never children. How to run it: docs/phase3/SPIKE_RESULT.md "Test day".

import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveCsvToFolder, shareCsv } from '@/lib/save-csv';

import { deviceLine, readPeakMb } from './device-info';
import { PhoneChecks } from './phone-checks';
import { summary } from './results';
import { DEFAULT_SETTINGS, ScanScreen, type AttackType, type ScanKind, type SpikeSettings } from './scan-screen';
import { deleteEverything, listCodes, loadResults, removeTemplate, resultsCsv, validCode, type ResultRow } from './store';

type Tab = 'home' | 'enrol' | 'check' | 'attack' | 'results' | 'phone' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: 'Start' },
  { key: 'enrol', label: 'Enrol' },
  { key: 'check', label: 'Check' },
  { key: 'attack', label: 'Attack' },
  { key: 'results', label: 'Results' },
  { key: 'phone', label: 'Phone' },
  { key: 'settings', label: 'Settings' },
];
const ATTACKS: AttackType[] = ['printed photo', 'screen photo', 'screen video', 'video call relay', 'mask or cut-out', 'other'];

function Button({ label, onPress, kind = 'main', disabled }: { label: string; onPress: () => void; kind?: 'main' | 'plain' | 'danger'; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.button, kind === 'plain' && styles.plain, kind === 'danger' && styles.danger, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, kind === 'plain' && styles.plainText]}>{label}</Text>
    </Pressable>
  );
}

function CodePicker({ codes, value, onChange }: { codes: string[]; value: string; onChange: (c: string) => void }) {
  if (codes.length === 0) return <Text style={styles.note}>Nobody enrolled yet — use Enrol first.</Text>;
  return (
    <View style={styles.chips}>
      {codes.map((c) => (
        <Pressable key={c} onPress={() => onChange(c)} style={[styles.chip, value === c && styles.chipOn]} accessibilityRole="button">
          <Text style={[styles.chipText, value === c && styles.chipTextOn]}>{c}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SpikeApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [codes, setCodes] = useState<string[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [settings, setSettings] = useState<SpikeSettings>(DEFAULT_SETTINGS);
  const [scan, setScan] = useState<{ kind: ScanKind; code: string; attack?: AttackType } | null>(null);
  const [lastMessage, setLastMessage] = useState('');
  const [enrolCode, setEnrolCode] = useState('V01');
  const [consentOk, setConsentOk] = useState(false);
  const [pick, setPick] = useState('');
  const [attack, setAttack] = useState<AttackType>('printed photo');

  const refresh = useCallback(async () => {
    setCodes(await listCodes());
    setRows(loadResults());
  }, []);
  useEffect(() => {
    let cancelled = false;
    listCodes().then((c) => {
      if (cancelled) return;
      setCodes(c);
      setRows(loadResults());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS !== 'android') {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.h1}>Face spike: Android only</Text>
      </SafeAreaView>
    );
  }

  if (scan) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.body}>
          <ScanScreen
            kind={scan.kind}
            code={scan.code}
            attack={scan.attack}
            settings={settings}
            onCancel={() => setScan(null)}
            onFinished={(msg) => {
              setLastMessage(msg);
              setScan(null);
              setConsentOk(false);
              void refresh();
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  function confirmDeleteAll() {
    Alert.alert('Delete all face data?', 'Removes every template, all scores and the test database from this phone. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: async () => {
          const gone = await deleteEverything();
          setLastMessage(`Deleted at ${new Date().toLocaleString()}: ${gone.join(', ') || 'nothing was stored'}. Now uninstall this app.`);
          void refresh();
        },
      },
    ]);
  }

  const setNum = (k: keyof SpikeSettings) => (text: string) => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v)) setSettings((s) => ({ ...s, [k]: v }));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.tabsInner} showsHorizontalScrollIndicator={false}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]} accessibilityRole="tab">
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {lastMessage ? <Text style={styles.message}>{lastMessage}</Text> : null}

        {tab === 'home' && (
          <>
            <Text style={styles.h1}>Mridanga Seva — face SPIKE</Text>
            <Text style={styles.warn}>Test app only. Adults who signed the consent form. No children. Codes only (V01…), never names.</Text>
            <Text style={styles.note}>Everything stays on this phone: no internet is used. {deviceLine()}</Text>
            <Text style={styles.h2}>Enrolled ({codes.length})</Text>
            {codes.map((c) => (
              <View key={c} style={styles.rowLine}>
                <Text style={styles.code}>{c}</Text>
                <Button
                  label="Remove"
                  kind="plain"
                  onPress={async () => {
                    await removeTemplate(c);
                    void refresh();
                  }}
                />
              </View>
            ))}
            <Button label="Delete all face data" kind="danger" onPress={confirmDeleteAll} />
          </>
        )}

        {tab === 'enrol' && (
          <>
            <Text style={styles.h1}>Enrol a volunteer</Text>
            <Text style={styles.note}>Volunteer code (V01 to V10):</Text>
            <TextInput value={enrolCode} onChangeText={(t) => setEnrolCode(t.toUpperCase().trim())} autoCapitalize="characters" style={styles.input} />
            <View style={styles.rowLine}>
              <Switch value={consentOk} onValueChange={setConsentOk} />
              <Text style={styles.label}>The organiser holds this adult&apos;s signed consent form for {enrolCode}.</Text>
            </View>
            {codes.includes(enrolCode) ? <Text style={styles.note}>{enrolCode} is enrolled already — enrolling again replaces it.</Text> : null}
            <Button
              label={`Start enrolment of ${enrolCode}`}
              disabled={!validCode(enrolCode) || !consentOk}
              onPress={() => setScan({ kind: 'enrol', code: enrolCode })}
            />
            <Text style={styles.note}>Good light on the face, phone at arm&apos;s length, no glasses glare. The blink/turn test runs first, then {settings.enrolFrames} pictures are taken.</Text>
          </>
        )}

        {tab === 'check' && (
          <>
            <Text style={styles.h1}>Check (the real person)</Text>
            <Text style={styles.note}>The volunteer scans their own face against their own code. Each check also scores against every other enrolled code (impostor scores).</Text>
            <CodePicker codes={codes} value={pick} onChange={setPick} />
            <Button label={pick ? `Check ${pick}` : 'Pick a code'} disabled={!pick} onPress={() => setScan({ kind: 'check', code: pick })} />
          </>
        )}

        {tab === 'attack' && (
          <>
            <Text style={styles.h1}>Attack test</Text>
            <Text style={styles.note}>Hold a printed photo or another phone showing the volunteer in front of the camera. The app logs whether the blink/turn test, the real-face score and the match would have let it in.</Text>
            <CodePicker codes={codes} value={pick} onChange={setPick} />
            <View style={styles.chips}>
              {ATTACKS.map((a) => (
                <Pressable key={a} onPress={() => setAttack(a)} style={[styles.chip, attack === a && styles.chipOn]} accessibilityRole="button">
                  <Text style={[styles.chipText, attack === a && styles.chipTextOn]}>{a}</Text>
                </Pressable>
              ))}
            </View>
            <Button label={pick ? `Attack ${pick} with a ${attack}` : 'Pick a code'} disabled={!pick} onPress={() => setScan({ kind: 'attack', code: pick, attack })} />
          </>
        )}

        {tab === 'results' && (
          <>
            <Text style={styles.h1}>Results</Text>
            {summary(rows, settings.liveThreshold).map((l, i) => (
              <Text key={i} selectable style={styles.mono}>
                {l}
              </Text>
            ))}
            <Text style={styles.note}>Peak memory since the app started: {readPeakMb() ?? '?'} MB</Text>
            <Button label="Save scores as CSV (folder)" onPress={async () => setLastMessage(`CSV: ${await saveCsvToFolder('face-spike-scores.csv', resultsCsv(rows))}`)} />
            <Button label="Share scores as CSV text" kind="plain" onPress={async () => setLastMessage(`CSV: ${await shareCsv('face-spike-scores.csv', resultsCsv(rows))}`)} />
            <Button label="Share this summary" kind="plain" onPress={async () => setLastMessage(`Summary: ${await shareCsv('face-spike-summary.txt', `${deviceLine()}\n${summary(rows, settings.liveThreshold).join('\n')}`)}`)} />
          </>
        )}

        {tab === 'phone' && (
          <>
            <Text style={styles.h1}>Phone checks</Text>
            <PhoneChecks />
          </>
        )}

        {tab === 'settings' && (
          <>
            <Text style={styles.h1}>Settings</Text>
            <Text style={styles.label}>Match threshold (cosine; OpenCV suggests 0.363)</Text>
            <TextInput defaultValue={String(settings.matchThreshold)} onChangeText={setNum('matchThreshold')} keyboardType="decimal-pad" style={styles.input} />
            <Text style={styles.label}>Real-face threshold (0..1)</Text>
            <TextInput defaultValue={String(settings.liveThreshold)} onChangeText={setNum('liveThreshold')} keyboardType="decimal-pad" style={styles.input} />
            <Text style={styles.label}>Pictures per enrolment</Text>
            <TextInput defaultValue={String(settings.enrolFrames)} onChangeText={setNum('enrolFrames')} keyboardType="number-pad" style={styles.input} />
            <View style={styles.rowLine}>
              <Switch value={settings.challenge} onValueChange={(v) => setSettings((s) => ({ ...s, challenge: v }))} />
              <Text style={styles.label}>Blink/turn test before the picture</Text>
            </View>
            <View style={styles.rowLine}>
              <Switch value={settings.fastPath} onValueChange={(v) => setSettings((s) => ({ ...s, fastPath: v }))} />
              <Text style={styles.label}>Fast path (reuse live landmarks after the first scan)</Text>
            </View>
            <View style={styles.rowLine}>
              <Switch value={settings.capture === 'photo'} onValueChange={(v) => setSettings((s) => ({ ...s, capture: v ? 'photo' : 'frame' }))} />
              <Text style={styles.label}>Take a still photo instead of a camera frame</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF7FF' },
  tabs: { flexGrow: 0, borderBottomWidth: 1, borderColor: '#DDD6FE' },
  tabsInner: { paddingHorizontal: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 12 },
  tabOn: { borderBottomWidth: 3, borderColor: '#5B21B6' },
  tabText: { fontSize: 15, color: '#444' },
  tabTextOn: { color: '#5B21B6', fontWeight: '700' },
  body: { padding: 16, gap: 12 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1F1147' },
  h2: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  warn: { fontSize: 15, fontWeight: '700', color: '#9A3412', backgroundColor: '#FFEDD5', padding: 10, borderRadius: 8 },
  note: { fontSize: 13, color: '#444' },
  label: { fontSize: 15, flexShrink: 1 },
  message: { fontSize: 14, backgroundColor: '#EDE9FE', padding: 10, borderRadius: 8 },
  mono: { fontSize: 12, fontFamily: 'monospace' },
  code: { fontSize: 16, fontWeight: '700', minWidth: 60 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fff' },
  button: { backgroundColor: '#5B21B6', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  plain: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#5B21B6' },
  danger: { backgroundColor: '#B91C1C' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  plainText: { color: '#5B21B6' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#5B21B6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: '#5B21B6' },
  chipText: { color: '#5B21B6' },
  chipTextOn: { color: '#fff' },
});
