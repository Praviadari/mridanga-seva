// C9 Syllabus tick-off, for coordinators and the Guru: one student's syllabus, level by level in
// teaching order. Tap the box when the student shows the item in class; the database dates it
// today and records who ticked it. A remark is optional and can be added or changed later.
// Unticking asks once more on the screen (a pop-up does not work in the web version); the audit
// log keeps the old tick (docs/DECISIONS.md #22). Opened from the student profile (C8).
// Data: src/data/syllabus.ts.

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SyllabusItemCard } from '@/components/syllabus-item-card';
import { TextField } from '@/components/text-field';
import { fetchStaff } from '@/data/student-overview';
import {
  fetchStudentSyllabus,
  REMARK_MAX_LENGTH,
  saveRemark,
  tickItem,
  untickItem,
  type StudentSyllabus,
  type SyllabusEntry,
  type TickOutcome,
} from '@/data/syllabus';
import { levelName } from '@/i18n/labels';
import { formatDayMonthYear } from '@/lib/dates';

/** What the screen loaded: the syllabus and the staff names for "ticked by". */
type Loaded = { syllabus: StudentSyllabus; staffNames: Map<string, string> };

/** The one card that has its extra controls open: the remark box, or the "untick?" question. */
type Open = { itemId: number; mode: 'remark' | 'untick' };

/** A message shown inside one card after a change, already a translation key. */
type CardMessage = { itemId: number; tone: 'error' | 'success' | 'info'; key: NonNullable<TickOutcome['errorKey']> };

/** The level choice, the count of ticked items, and one card per item of that level. */
export default function SyllabusTickOffScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  // undefined = loading, null = could not load, 'not_found' = no such student.
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  // The level being shown; null until loaded, then the student's own level.
  const [levelId, setLevelId] = useState<number | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [busyItem, setBusyItem] = useState<number | null>(null);
  const [message, setMessage] = useState<CardMessage | null>(null);

  const load = useCallback(async () => {
    // Staff names only make "ticked by" readable; the screen still works if they fail to load.
    const [syllabus, staff] = await Promise.all([fetchStudentSyllabus(id), fetchStaff()]);
    if (syllabus === 'not_found' || syllabus === null) {
      setLoaded(syllabus);
      return;
    }
    setLoaded({ syllabus, staffNames: new Map((staff ?? []).map((s) => [s.id, s.fullName])) });
    setLevelId((current) => current ?? syllabus.student.levelId);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('syllabus.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
        {loaded === 'not_found' ? <Notice tone="error">{t('profile.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('syllabus.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { syllabus, staffNames } = loaded;
  const { student } = syllabus;
  const shownLevel = levelId ?? student.levelId;
  const items = syllabus.items.filter((item) => item.levelId === shownLevel);
  const doneCount = items.filter((item) => item.doneOn).length;
  // Levels that have items, plus the student's own level even while its syllabus is still empty.
  const levelIds = [...new Set([...syllabus.items.map((item) => item.levelId), student.levelId])].sort((a, b) => a - b);

  /** Runs one change, shows its message in the card, and loads the list again. */
  async function change(itemId: number, run: () => Promise<TickOutcome>, successKey?: CardMessage['key']) {
    setBusyItem(itemId);
    setMessage(null);
    const outcome = await run();
    if (outcome.errorKey) setMessage({ itemId, tone: 'error', key: outcome.errorKey });
    else if (outcome.notice) setMessage({ itemId, tone: 'info', key: outcome.notice });
    else if (successKey) setMessage({ itemId, tone: 'success', key: successKey });
    // Keep the remark box open after a failed save, so the typed text is not lost.
    if (!outcome.errorKey) setOpen(null);
    await load();
    setBusyItem(null);
  }

  function onToggle(item: SyllabusEntry) {
    setMessage(null);
    // Ticking is one tap, so a coordinator can tick quickly during class. Unticking asks first.
    if (!item.doneOn) void change(item.id, () => tickItem(student.id, item.id, ''));
    else setOpen({ itemId: item.id, mode: 'untick' });
  }

  function openRemark(item: SyllabusEntry) {
    setMessage(null);
    setRemarkText(item.remark ?? '');
    setOpen({ itemId: item.id, mode: 'remark' });
  }

  const tickedBy = (item: SyllabusEntry) =>
    (item.tickedBy && staffNames.get(item.tickedBy)) || t('profile.unknownPerson');

  return (
    <Screen underHeader>
      {header}
      <AppText variant="subtitle">{student.fullName}</AppText>
      <AppText tone="muted">
        {`${student.rollNo} · ${t('syllabus.studentLevel', { level: levelName(t, student.levelId) })}`}
      </AppText>
      <AppText>{t('syllabus.intro')}</AppText>

      {levelIds.length > 1 ? (
        <ChoiceGroup
          label={t('syllabus.level')}
          choices={levelIds.map((level) => ({
            value: level,
            label:
              level === student.levelId
                ? t('syllabus.currentLevel', { level: levelName(t, level) })
                : levelName(t, level),
          }))}
          value={shownLevel}
          onChange={(level) => {
            setLevelId(level);
            setOpen(null);
            setMessage(null);
          }}
        />
      ) : null}

      <AppText variant="label">
        {`${levelName(t, shownLevel)}: ${t('profile.syllabusDone', { done: doneCount, total: items.length })}`}
      </AppText>
      {items.length === 0 ? <AppText tone="muted">{t('profile.noSyllabus')}</AppText> : null}

      {items.map((item) => {
        const isOpen = open?.itemId === item.id ? open.mode : null;
        const cardMessage = message?.itemId === item.id ? message : null;
        return (
          <SyllabusItemCard
            key={item.id}
            position={item.sort}
            title={item.title}
            description={item.description}
            done={!!item.doneOn}
            doneLine={
              item.doneOn
                ? t('syllabus.tickedOn', { date: formatDayMonthYear(item.doneOn), name: tickedBy(item) })
                : undefined
            }
            remark={item.remark}
            busy={busyItem === item.id}
            onToggle={() => onToggle(item)}>
            {cardMessage ? <Notice tone={cardMessage.tone}>{t(cardMessage.key)}</Notice> : null}

            {isOpen === 'untick' ? (
              <>
                <Notice tone="info" title={t('syllabus.untickTitle', { item: item.title })}>
                  {t('syllabus.untickBody')}
                </Notice>
                <Button
                  variant="secondary"
                  label={t('syllabus.untickYes')}
                  loading={busyItem === item.id}
                  onPress={() => void change(item.id, () => untickItem(student.id, item.id))}
                />
                <Button variant="link" label={t('syllabus.cancel')} onPress={() => setOpen(null)} />
              </>
            ) : null}

            {isOpen === 'remark' ? (
              <>
                <TextField
                  label={t('syllabus.remark')}
                  hint={t('syllabus.remarkHint', { max: REMARK_MAX_LENGTH })}
                  value={remarkText}
                  onChangeText={setRemarkText}
                  maxLength={REMARK_MAX_LENGTH}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                <Button
                  label={t('syllabus.saveRemark')}
                  loading={busyItem === item.id}
                  onPress={() =>
                    void change(item.id, () => saveRemark(student.id, item.id, remarkText), 'syllabus.remarkSaved')
                  }
                />
                <Button variant="link" label={t('syllabus.cancel')} onPress={() => setOpen(null)} />
              </>
            ) : null}

            {item.doneOn && isOpen === null ? (
              <Button
                variant="link"
                label={item.remark ? t('syllabus.editRemark') : t('syllabus.addRemark')}
                onPress={() => openRemark(item)}
              />
            ) : null}
          </SyllabusItemCard>
        );
      })}
    </Screen>
  );
}
