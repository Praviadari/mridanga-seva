// C24 Print QR cards (Phase 3 P3-1, docs/DECISIONS.md #249-#252): the Guru or a coordinator picks
// students — by centre, level, "without the app" or one by one — and prints an A4 sheet of ten
// wallet cards (QR, name, roll number, centre) to cut out. A student without a phone shows the card
// at the door and C5 scans it like My QR. A coordinator sees only their own centre's students; the
// Guru picks the centre. Printing works in the web version only, as for the asset labels (#158):
// the phone app opens this page in the browser. `ids` (comma-separated student ids) preselects
// students, e.g. from a profile. A lost card is replaced on the student's profile (the Guru).
// Data: src/data/qr-cards.ts; layout: src/lib/qr-card-sheet.ts; migration 0045.

import * as Linking from 'expo-linking';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

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
import { fetchMyCentreId } from '@/data/inventory';
import { fetchCardStudents, fetchQrTexts, type CardStudent } from '@/data/qr-cards';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { webAppOrigin } from '@/lib/asset-link';
import { CARD_CSS, cardSheetHtml, cardSheetsNeeded, type CardContent } from '@/lib/qr-card-sheet';
import { searchFold } from '@/lib/search-text';
import { spacing } from '@/theme/use-theme';

type Who = 'noLogin' | 'all';
type Level = 'all' | number;

/** The QR cards page. */
export default function QrCardsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ ids?: string }>();
  const { profile } = useAuth();
  const isWeb = Platform.OS === 'web';
  const isGuru = profile?.role === 'guru';

  const [students, setStudents] = useState<CardStudent[] | null | undefined>(undefined);
  const [myCentre, setMyCentre] = useState<number | null>(null);
  const [centre, setCentre] = useState<number | null>(null);
  const [who, setWho] = useState<Who>(params.ids ? 'all' : 'noLogin');
  const [level, setLevel] = useState<Level>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set((params.ids ?? '').split(',').filter(Boolean)));
  // The codes of the picked students (MS1:<qr_token>), read only for them; null = could not load.
  const [codes, setCodes] = useState<Map<string, string> | null>(new Map());
  const [width, setWidth] = useState(0);

  const load = useCallback(async () => {
    const [all, mine] = await Promise.all([fetchCardStudents(), profile ? fetchMyCentreId(profile.id) : Promise.resolve(null)]);
    setStudents(all);
    setMyCentre(mine);
    if (all) {
      const preselected = all.find((s) => s.id === (params.ids ?? '').split(',')[0]);
      setCentre((current) => current ?? preselected?.centreId ?? mine ?? all[0]?.centreId ?? null);
    }
  }, [profile, params.ids]);

  useFocusEffect(
    useCallback(() => {
      if (isWeb) void load();
    }, [load, isWeb]),
  );

  // A coordinator prints for their own centre only (#251); one without a centre set, and the
  // Guru, choose.
  const fixedCentre = !isGuru && myCentre !== null;
  const shownCentre = fixedCentre ? myCentre : centre;
  const centres = useMemo(() => {
    const names = new Map<number, string>();
    for (const s of students ?? []) names.set(s.centreId, s.centreName);
    return [...names].map(([id, name]) => ({ value: id, label: name }));
  }, [students]);

  const inCentre = (students ?? []).filter((s) => shownCentre === null || s.centreId === shownCentre);
  const folded = searchFold(search.trim());
  const shown = inCentre.filter(
    (s) =>
      selected.has(s.id) ||
      ((who === 'all' ? s.status !== 'left' : !s.hasLogin && s.status !== 'left') &&
        (level === 'all' || s.levelId === level) &&
        (!folded || searchFold(s.fullName).includes(folded) || searchFold(s.rollNo).includes(folded))),
  );
  const chosen = inCentre.filter((s) => selected.has(s.id));
  const chosenKey = chosen.map((s) => s.id).join(',');

  useEffect(() => {
    if (!isWeb) return;
    let live = true;
    void fetchQrTexts(chosenKey ? chosenKey.split(',') : []).then((result) => {
      if (live) setCodes(result);
    });
    return () => {
      live = false;
    };
  }, [chosenKey, isWeb]);

  const cards: CardContent[] = chosen
    .filter((s) => codes?.has(s.id))
    .map((s) => ({ qrText: codes?.get(s.id) ?? '', fullName: s.fullName, rollNo: s.rollNo, centreName: s.centreName }));
  const ready = codes !== null && cards.length === chosen.length;
  // The React Compiler (app.json experiments) keeps this from being rebuilt when nothing changed.
  const html = isWeb
    ? cardSheetHtml(cards, { brand: t('labels.brand'), cardTitle: t('qrCards.cardTitle'), logo: t('qrCards.logo'), footer: t('qrCards.footer') })
    : '';

  if (!isWeb) {
    const origin = webAppOrigin();
    const path = `/staff/qr-cards${selected.size ? `?ids=${[...selected].join(',')}` : ''}`;
    return (
      <Screen underHeader>
        <Stack.Screen options={{ title: t('qrCards.title') }} />
        <Notice tone="info" title={t('labels.webOnlyTitle')}>
          {t('qrCards.webOnly')}
        </Notice>
        <Button icon="open" label={t('labels.openInBrowser')} onPress={() => void Linking.openURL(origin + path)} />
        <AppText variant="small" tone="muted">
          {origin}
        </AppText>
      </Screen>
    );
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const sheets = cardSheetsNeeded(cards.length);

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('qrCards.title') }} />
      <Notice tone="info">{t('qrCards.intro')}</Notice>
      {students === undefined ? <LoadingCards /> : null}
      {students === null ? (
        <>
          <Notice tone="error" title={t('qrCards.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {students ? (
        <Section icon="students" title={t('qrCards.whichTitle')} description={t('qrCards.chosen', { count: chosen.length })}>
          {fixedCentre ? (
            <AppText tone="muted">{t('qrCards.ownCentre', { centre: centres.find((c) => c.value === myCentre)?.label ?? '' })}</AppText>
          ) : centres.length > 1 ? (
            <ChoiceGroup<number> chips label={t('labels.centre')} choices={centres} value={centre ?? centres[0].value} onChange={setCentre} />
          ) : null}
          <ChoiceGroup<Who>
            chips
            label={t('inventory.show')}
            choices={[
              { value: 'noLogin', label: t('qrCards.noLogin') },
              { value: 'all', label: t('qrCards.allStudents') },
            ]}
            value={who}
            onChange={setWho}
          />
          <ChoiceGroup<Level>
            chips
            label={t('students.filters.level')}
            choices={[{ value: 'all', label: t('students.filters.all') }, ...LEVEL_IDS.map((id) => ({ value: id, label: levelName(t, id) }))]}
            value={level}
            onChange={setLevel}
          />
          <TextField
            label={t('attendance.searchLabel')}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <View style={styles.row}>
            <Button
              variant="secondary"
              label={t('labels.selectShown', { count: shown.length })}
              disabled={shown.length === 0}
              onPress={() => setSelected((current) => new Set([...current, ...shown.map((s) => s.id)]))}
            />
            <Button variant="link" label={t('labels.clear')} disabled={selected.size === 0} onPress={() => setSelected(new Set())} />
          </View>
          {shown.length === 0 ? <AppText tone="muted">{t('qrCards.noneShown')}</AppText> : null}
          {shown.map((s) => (
            <Checkbox
              key={s.id}
              label={[s.fullName, s.rollNo, s.hasLogin ? t('qrCards.hasApp') : null].filter(Boolean).join(' · ')}
              checked={selected.has(s.id)}
              onChange={(on) => toggle(s.id, on)}
            />
          ))}
        </Section>
      ) : null}

      <Section icon="print" title={t('qrCards.sheetTitle')} description={t('qrCards.sheetHint')}>
        {codes === null ? <Notice tone="error">{t('qrCards.codesFailed')}</Notice> : null}
        <AppText variant="label">{cards.length > 0 ? t('qrCards.summary', { count: cards.length, sheets }) : t('qrCards.nothingChosen')}</AppText>
        <Button icon="print" label={t('qrCards.print')} disabled={cards.length === 0 || !ready} onPress={printLabels} />
        <AppText variant="small" tone="muted">
          {t('labels.printSettings')}
        </AppText>
        <AppText variant="small" tone="muted">
          {t('qrCards.keepSafe')}
        </AppText>
      </Section>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <LabelPrint html={html} css={CARD_CSS} previewWidth={width} label={t('qrCards.previewLabel')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
