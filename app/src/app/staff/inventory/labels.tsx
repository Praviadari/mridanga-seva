// C19 labels (docs/DECISIONS.md #158): the Guru or a coordinator picks items and prints their QR
// labels on an A4 sheet of 18 (Avery L7161 type, 3 x 6), starting at any free position of a
// half-used sheet. A calibration print (outlines, centre marks, 100 mm ruler) on plain paper
// checks the alignment first; a small nudge in mm corrects a printer that prints off-centre and is
// kept in this browser. Printing works in the web version only (no print module on the phones in
// this build): the phone app opens this page in the browser. `ids` (comma-separated item ids)
// preselects items, e.g. from an item's screen.
// Data: data/inventory.ts; layout: lib/label-sheet.ts; QR link: lib/asset-link.ts; migration 0035.

import * as Linking from 'expo-linking';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LabelPrint, printLabels } from '@/components/label-print';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { fetchInventory, fetchMyCentreId, markLabelsPrinted, type InventoryItem } from '@/data/inventory';
import { assetLink, webAppOrigin } from '@/lib/asset-link';
import { NUDGE_MAX, PER_SHEET, sheetHtml, sheetsNeeded, type LabelContent } from '@/lib/label-sheet';
import { radius, spacing, useTheme } from '@/theme/use-theme';

type Which = 'unprinted' | 'all';

/** This browser's printer correction, kept between visits (may be unavailable: private window). */
const NUDGE_KEY = 'ms-label-nudge';

function readNudge(): { x: string; y: string } {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(NUDGE_KEY) ?? 'null') as { x?: number; y?: number } | null;
    return { x: String(saved?.x ?? 0), y: String(saved?.y ?? 0) };
  } catch {
    return { x: '0', y: '0' };
  }
}

function saveNudge(x: number, y: number): void {
  try {
    globalThis.localStorage?.setItem(NUDGE_KEY, JSON.stringify({ x, y }));
  } catch {
    // Not kept; the page still prints with the values typed.
  }
}

/** A typed shift in mm, or null when it is not a number within ±NUDGE_MAX. */
function parseNudge(text: string): number | null {
  const value = Number(text.trim().replace(',', '.') || '0');
  return Number.isFinite(value) && Math.abs(value) <= NUDGE_MAX ? value : null;
}

/** The labels page. */
export default function LabelsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ ids?: string }>();
  const { profile } = useAuth();
  const isWeb = Platform.OS === 'web';

  const [items, setItems] = useState<InventoryItem[] | null | undefined>(undefined);
  const [centre, setCentre] = useState<number | null>(null);
  const [which, setWhich] = useState<Which>(params.ids ? 'all' : 'unprinted');
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set((params.ids ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)),
  );
  const [startAt, setStartAt] = useState(1);
  const [calibration, setCalibration] = useState(false);
  const [nudge, setNudge] = useState(readNudge);
  const [width, setWidth] = useState(0);
  const [printed, setPrinted] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [all, mine] = await Promise.all([fetchInventory(), profile ? fetchMyCentreId(profile.id) : Promise.resolve(null)]);
    setItems(all);
    if (all) setCentre((current) => current ?? mine ?? all[0]?.centreId ?? null);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      if (isWeb) void load();
    }, [load, isWeb]),
  );

  const nudgeX = parseNudge(nudge.x);
  const nudgeY = parseNudge(nudge.y);
  useEffect(() => {
    if (nudgeX !== null && nudgeY !== null) saveNudge(nudgeX, nudgeY);
  }, [nudgeX, nudgeY]);

  const centres = useMemo(() => {
    const names = new Map<number, string>();
    for (const item of items ?? []) names.set(item.centreId, item.centreName);
    return [...names].map(([id, name]) => ({ value: id, label: name }));
  }, [items]);
  const inUse = (items ?? []).filter((item) => item.retiredAt === null && (centre === null || item.centreId === centre));
  const shown = inUse.filter((item) => which === 'all' || item.labelledAt === null || selected.has(item.id));
  const chosen = inUse.filter((item) => selected.has(item.id));

  const origin = webAppOrigin();
  const labels: LabelContent[] = chosen.map((item) => ({
    link: assetLink(item.assetToken, origin),
    code: item.code,
    kindLine: [item.category ?? t(`inventory.kinds.${item.kind}`), item.centreName].filter(Boolean).join(' · '),
    name: item.label,
  }));
  // The React Compiler (app.json experiments) keeps this from being rebuilt when nothing changed.
  const html = isWeb
    ? sheetHtml(
        labels,
        {
          brand: t('labels.brand'),
          finder: t('labels.finder'),
          calibrationTitle: t('labels.calibrationTitle'),
          calibrationHelp: t('labels.calibrationHelp'),
          ruler: t('labels.ruler'),
        },
        { startAt, calibration, nudgeX: nudgeX ?? 0, nudgeY: nudgeY ?? 0 },
      )
    : '';

  if (!isWeb) {
    const path = `/staff/inventory/labels${selected.size ? `?ids=${[...selected].join(',')}` : ''}`;
    return (
      <Screen underHeader>
        <Stack.Screen options={{ title: t('labels.title') }} />
        <Notice tone="info" title={t('labels.webOnlyTitle')}>
          {t('labels.webOnly')}
        </Notice>
        <Button icon="open" label={t('labels.openInBrowser')} onPress={() => void Linking.openURL(origin + path)} />
        <AppText variant="small" tone="muted">
          {origin}
        </AppText>
      </Screen>
    );
  }

  function toggle(id: number, on: boolean) {
    setPrinted(false);
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function markPrinted() {
    const n = await markLabelsPrinted(chosen.map((item) => item.id));
    if (n === null) setMessage({ tone: 'error', text: t('common.networkError') });
    else {
      setMessage({ tone: 'success', text: t('labels.markedPrinted', { count: n }) });
      setSelected(new Set());
      setPrinted(false);
      await load();
    }
  }

  const sheets = sheetsNeeded(labels.length, startAt);
  const nudgeError = nudgeX === null || nudgeY === null;

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('labels.title') }} />
      <Notice tone="info">{t('labels.intro')}</Notice>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {items === undefined ? <LoadingCards /> : null}
      {items === null ? (
        <>
          <Notice tone="error" title={t('inventory.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {items ? (
        <Section icon="instruments" title={t('labels.whichTitle')} description={t('labels.chosen', { count: chosen.length })}>
          {centres.length > 1 ? (
            <ChoiceGroup<number> chips label={t('labels.centre')} choices={centres} value={centre ?? centres[0].value} onChange={setCentre} />
          ) : null}
          <ChoiceGroup<Which>
            chips
            label={t('inventory.show')}
            choices={[
              { value: 'unprinted', label: t('labels.unprinted') },
              { value: 'all', label: t('labels.allItems') },
            ]}
            value={which}
            onChange={setWhich}
          />
          <View style={styles.row}>
            <Button
              variant="secondary"
              label={t('labels.selectShown', { count: shown.length })}
              disabled={shown.length === 0}
              onPress={() => {
                setPrinted(false);
                setSelected((current) => new Set([...current, ...shown.map((item) => item.id)]));
              }}
            />
            <Button variant="link" label={t('labels.clear')} disabled={selected.size === 0} onPress={() => setSelected(new Set())} />
          </View>
          {shown.length === 0 ? <AppText tone="muted">{t('labels.noneToPrint')}</AppText> : null}
          {shown.map((item) => (
            <Checkbox
              key={item.id}
              label={[item.code, item.label, item.labelledAt ? t('labels.printedBefore') : null].filter(Boolean).join(' · ')}
              checked={selected.has(item.id)}
              onChange={(on) => toggle(item.id, on)}
            />
          ))}
        </Section>
      ) : null}

      <Section icon="print" title={t('labels.sheetTitle')} description={t('labels.startHint')}>
        <AppText variant="label">{t('labels.startAt', { n: startAt })}</AppText>
        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t('labels.startAt', { n: startAt })}>
          {Array.from({ length: PER_SHEET }, (_, i) => i + 1).map((n) => (
            <StartCell key={n} n={n} state={n < startAt ? 'used' : n === startAt ? 'start' : 'free'} onPress={() => setStartAt(n)} />
          ))}
        </View>
        <Checkbox label={t('labels.calibration')} checked={calibration} onChange={setCalibration} />
        <View style={styles.row}>
          <View style={styles.nudge}>
            <TextField
              label={t('labels.nudgeX')}
              value={nudge.x}
              onChangeText={(x) => setNudge((current) => ({ ...current, x }))}
              keyboardType="numbers-and-punctuation"
              error={nudgeX === null ? t('labels.nudgeInvalid', { max: NUDGE_MAX }) : undefined}
            />
          </View>
          <View style={styles.nudge}>
            <TextField
              label={t('labels.nudgeY')}
              value={nudge.y}
              onChangeText={(y) => setNudge((current) => ({ ...current, y }))}
              keyboardType="numbers-and-punctuation"
              error={nudgeY === null ? t('labels.nudgeInvalid', { max: NUDGE_MAX }) : undefined}
            />
          </View>
        </View>
        <AppText variant="small" tone="muted">
          {t('labels.nudgeHint')}
        </AppText>
        <AppText variant="label">
          {labels.length > 0 ? t('labels.summary', { count: labels.length, sheets }) : calibration ? t('labels.calibrationOnly') : t('labels.nothingChosen')}
        </AppText>
        <View style={styles.row}>
          <Button
            icon="print"
            label={calibration && labels.length === 0 ? t('labels.printCalibration') : t('labels.print')}
            disabled={nudgeError || (labels.length === 0 && !calibration)}
            onPress={() => {
              printLabels();
              if (labels.length > 0 && !calibration) setPrinted(true);
            }}
          />
          {printed ? <Button variant="secondary" icon="check" label={t('labels.markPrinted', { count: labels.length })} onPress={() => void markPrinted()} /> : null}
        </View>
        <AppText variant="small" tone="muted">
          {t('labels.printSettings')}
        </AppText>
      </Section>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <LabelPrint html={html} previewWidth={width} label={t('labels.previewLabel')} />
      </View>
    </Screen>
  );
}

/** One position on the sheet: used (before the start), the start, or free. */
function StartCell({ n, state, onPress }: { n: number; state: 'used' | 'start' | 'free'; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={state === 'start'}
      accessibilityLabel={t('labels.position', { n })}
      onPress={onPress}
      style={[
        styles.cell,
        {
          borderColor: state === 'start' ? colors.primary : colors.controlBorder,
          backgroundColor: state === 'used' ? colors.border : state === 'start' ? colors.primary : colors.surface,
        },
      ]}>
      <AppText variant="label" style={state === 'start' ? { color: colors.onPrimary } : undefined} tone={state === 'used' ? 'muted' : undefined}>
        {n}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * 64 + 2 * spacing.sm,
    gap: spacing.sm,
  },
  cell: {
    width: 64,
    height: 44,
    borderWidth: 1,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudge: {
    width: 160,
  },
});
