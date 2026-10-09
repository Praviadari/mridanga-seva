// C20, one duty shift, for the Guru (Phase 2 slice 8, docs/DECISIONS.md #65). `id` = 'new': a
// shift on a date (DD-MM-YYYY) at a centre, from and to (24-hour, inside the centre's open hours),
// what the duty is (optional), the coordinators on it, and "Repeat every week" for up to 12 weeks.
// Otherwise: change it or delete it (asks first). A changed date or start time is reminded again.
// The database checks everything again (save_duty_shift, migration 0023).

import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { DATE_KEYBOARD, TextField } from '@/components/text-field';
import { fetchCentres, type Centre } from '@/data/centres';
import { deleteShift, DUTY_MAX, fetchDutyPeople, fetchShift, MAX_WEEKS, saveShift } from '@/data/duty';
import { formatTypedDate, parseDayMonthYear, parseTimeOfDay, todayLocal } from '@/lib/dates';
import { goBackOr } from '@/lib/go-back';
import { spacing } from '@/theme/use-theme';

type Person = { id: string; name: string; role: 'guru' | 'coordinator' };
type Loaded = { centres: Centre[]; people: Person[] };

/** The shift form. */
function ShiftScreenContent() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';

  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [centreId, setCentreId] = useState(1);
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [duty, setDuty] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [weeks, setWeeks] = useState(1);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [centres, staff, shift] = await Promise.all([
        fetchCentres(),
        fetchDutyPeople(),
        isNew ? Promise.resolve(null) : fetchShift(Number(params.id)),
      ]);
      if (cancelled) return;
      if (!centres || !staff || (!isNew && shift === null)) {
        setLoaded(null);
        return;
      }
      if (shift === 'not_found') {
        setLoaded('not_found');
        return;
      }
      const active = centres.filter((c) => c.active || c.id === shift?.centreId);
      setLoaded({ centres: active, people: staff });
      if (shift) {
        setCentreId(shift.centreId);
        setDate(formatTypedDate(shift.onDate));
        setFrom(shift.startsAt);
        setTo(shift.endsAt);
        setDuty(shift.duty ?? '');
        setPeople(shift.people.map((p) => p.id));
      } else if (active[0]) {
        setCentreId(active[0].id);
        setFrom(active[0].opensAt.slice(0, 5));
        setTo(active[0].closesAt.slice(0, 5));
        setDate(formatTypedDate(todayLocal()));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isNew, params.id]);

  const header = <Stack.Screen options={{ title: isNew ? t('duty.add') : t('duty.editTitle') }} />;

  if (!isGuru || loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {!isGuru ? <Notice tone="info">{t('duty.guruOnly')}</Notice> : null}
        {isGuru && loaded === undefined ? <LoadingCards /> : null}
        {isGuru && loaded === 'not_found' ? <EmptyState icon="time" title={t('duty.notFound')} /> : null}
        {isGuru && loaded === null ? (
          <Notice tone="error" title={t('duty.loadFailed')}>
            {t('common.networkError')}
          </Notice>
        ) : null}
      </Screen>
    );
  }

  const centre = loaded.centres.find((c) => c.id === centreId);

  async function save() {
    const onDate = parseDayMonthYear(date);
    const startsAt = parseTimeOfDay(from);
    const endsAt = parseTimeOfDay(to);
    if (!onDate) return setMessage(t('duty.errors.date_invalid'));
    if (!startsAt || !endsAt) return setMessage(t('duty.errors.time_format'));
    setBusy(true);
    setMessage(null);
    const outcome = await saveShift(isNew ? null : Number(params.id), { centreId, onDate, startsAt, endsAt, duty, people, weeks });
    setBusy(false);
    if (outcome.errorKey) setMessage(t(outcome.errorKey));
    else goBackOr('/staff/duty');
  }

  async function remove() {
    setBusy(true);
    const outcome = await deleteShift(Number(params.id));
    setBusy(false);
    if (outcome.errorKey) setMessage(t(outcome.errorKey));
    else goBackOr('/staff/duty');
  }

  return (
    <Screen underHeader>
      {header}
      {message ? <Notice tone="error">{message}</Notice> : null}
      <Section icon="time" title={t('duty.whenTitle')}>
        {loaded.centres.length > 1 ? (
          <ChoiceGroup<number>
            label={t('duty.centreLabel')}
            choices={loaded.centres.map((c) => ({ value: c.id, label: c.name }))}
            value={centreId}
            onChange={setCentreId}
          />
        ) : null}
        <TextField label={t('duty.dateLabel')} hint={t('duty.dateHint')} value={date} onChangeText={setDate} keyboardType={DATE_KEYBOARD} />
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label={t('duty.fromLabel')} value={from} onChangeText={setFrom} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.half}>
            <TextField label={t('duty.toLabel')} value={to} onChangeText={setTo} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        {centre ? (
          <AppText variant="small" tone="muted">
            {t('duty.hoursHint', { name: centre.name, from: centre.opensAt.slice(0, 5), to: centre.closesAt.slice(0, 5) })}
          </AppText>
        ) : null}
        <TextField
          label={t('duty.dutyLabel')}
          hint={t('duty.dutyHint')}
          value={duty}
          onChangeText={setDuty}
          maxLength={DUTY_MAX}
        />
        {isNew ? (
          <>
            <ChoiceGroup<number>
              chips
              label={t('duty.weeksLabel')}
              choices={Array.from({ length: MAX_WEEKS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
              value={weeks}
              onChange={setWeeks}
            />
            <AppText variant="small" tone="muted">
              {t('duty.weeksHint')}
            </AppText>
          </>
        ) : null}
      </Section>
      <Section icon="groups" title={t('duty.peopleTitle')} description={t('duty.peopleHint')}>
        {loaded.people.map((p) => (
          <Checkbox
            key={p.id}
            label={p.role === 'guru' ? `${p.name} (${t('roles.guru')})` : p.name}
            checked={people.includes(p.id)}
            onChange={(on) => setPeople((current) => (on ? [...current, p.id] : current.filter((id) => id !== p.id)))}
          />
        ))}
      </Section>
      <Button icon="check" label={isNew ? t('duty.addSave') : t('duty.save')} loading={busy} disabled={busy || people.length === 0} onPress={() => void save()} />
      {!isNew ? (
        asking ? (
          <>
            <Notice tone="error" title={t('duty.deleteAsk')}>
              {t('duty.deleteAskBody')}
            </Notice>
            <View style={styles.row}>
              <Button icon="delete" label={t('duty.deleteYes')} loading={busy} disabled={busy} onPress={() => void remove()} />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(false)} />
            </View>
          </>
        ) : (
          <Button variant="link" icon="delete" label={t('duty.delete')} onPress={() => setAsking(true)} />
        )
      ) : null}
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
  half: {
    flexGrow: 1,
    flexBasis: 140,
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function ShiftScreen() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <ShiftScreenContent />
    </RouteIdGuard>
  );
}
