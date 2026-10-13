// The Guru's tools on a student's profile (C8; audit R3-01..03, docs/DECISIONS.md #302), for week 1 after
// the registration weekend: choose or change the mentor ("Mentor needed" notices open this page), set the
// real level and joining date (Accept and the desk start everyone as Beginner, joined today), and take a
// wrong app login off the record. The Guru only; the database checks each change again
// (src/data/student-admin.ts). Taking a login off asks first, in place, as the other destructive actions do.
// Delete this record (#326, audit R3-04): a record entered by mistake (a second copy), with a reason and the
// name typed again; the database keeps any record with a login, a visit or anything recorded.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { deleteStudentRecord, setLevel, setMentor, unlinkLogin, type AdminResult } from '@/data/student-admin';
import type { StaffMember } from '@/data/student-overview';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { formatTypedDate, todayLocal } from '@/lib/dates';
import { levelPatch, mentorChoices, nameTypedRight } from '@/lib/guru-tools';
import { spacing } from '@/theme/use-theme';

/** The part of the student record the tools change. */
export type ToolsStudent = {
  id: string;
  fullName: string;
  levelId: number;
  /** 'YYYY-MM-DD'. */
  joinedOn: string;
  mentorId: string | null;
  hasLogin: boolean;
};

/** Which tool is open. */
type Open = 'mentor' | 'level' | 'unlink' | 'delete' | null;

/** Mentor, level and app login of one student, for the Guru. Nothing for anyone else. `onDeleted`: the record is gone. */
export function GuruStudentTools({
  student,
  staff,
  onChanged,
  onDeleted,
}: {
  student: ToolsStudent;
  staff: readonly StaffMember[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [open, setOpen] = useState<Open>(null);
  const [mentor, setMentorPick] = useState<string | null>(null);
  const [level, setLevelPick] = useState<number>(student.levelId);
  const [joined, setJoined] = useState('');
  const [dateError, setDateError] = useState<string | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  if (profile?.role !== 'guru') return null;

  const choices = mentorChoices(staff, student.mentorId);

  function show(tool: Open) {
    setMessage(null);
    setDateError(undefined);
    setOpen(tool);
    setMentorPick(null);
    setLevelPick(student.levelId);
    setJoined(formatTypedDate(student.joinedOn));
    setReason('');
    setTypedName('');
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    const result = await deleteStudentRecord(student.id, reason);
    setBusy(false);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    onDeleted();
  }

  async function run(change: () => Promise<AdminResult>, done: string) {
    setBusy(true);
    setMessage(null);
    const result = await change();
    setBusy(false);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    setOpen(null);
    setMessage({ tone: 'success', text: done });
    onChanged();
  }

  function saveLevel() {
    const patch = levelPatch({ levelId: student.levelId, joinedOn: student.joinedOn }, level, joined, todayLocal());
    if (patch === 'badDate') {
      setDateError(t('studentTools.joinedInvalid'));
      return;
    }
    setDateError(undefined);
    if (patch === null) {
      setOpen(null);
      return;
    }
    void run(() => setLevel(student.id, patch), t('studentTools.levelSaved'));
  }

  const mentorName = (id: string) => choices.find((s) => s.id === id)?.fullName ?? '';

  return (
    <Section icon="groups" title={t('studentTools.title')} description={t('studentTools.hint')}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {open === null ? (
        <View style={styles.row}>
          <Button
            variant="secondary"
            icon="groups"
            label={student.mentorId ? t('studentTools.changeMentor') : t('studentTools.chooseMentor')}
            onPress={() => show('mentor')}
          />
          <Button variant="secondary" icon="level" label={t('studentTools.setLevel')} onPress={() => show('level')} />
          {student.hasLogin ? (
            <Button variant="link" icon="signOut" label={t('studentTools.unlink')} onPress={() => show('unlink')} />
          ) : (
            <Button variant="link" icon="delete" label={t('studentTools.delete')} onPress={() => show('delete')} />
          )}
        </View>
      ) : null}

      {open === 'mentor' ? (
        choices.length === 0 ? (
          <>
            <Notice tone="info">{t('studentTools.noMentors')}</Notice>
            <Button variant="link" label={t('qrCards.cancel')} onPress={() => setOpen(null)} />
          </>
        ) : (
          <>
            <ChoiceGroup
              chips
              label={t('studentTools.mentorLabel')}
              choices={choices.map((s) => ({ value: s.id, label: s.role === 'guru' ? `${s.fullName} (${t('roles.guru')})` : s.fullName }))}
              value={mentor}
              onChange={setMentorPick}
            />
            <AppText variant="small" tone="muted">
              {t('studentTools.mentorHint')}
            </AppText>
            <View style={styles.row}>
              <Button
                icon="check"
                label={t('studentTools.saveMentor')}
                loading={busy}
                disabled={busy || mentor === null}
                onPress={() =>
                  mentor ? void run(() => setMentor(student.id, mentor), t('studentTools.mentorSaved', { name: mentorName(mentor) })) : undefined
                }
              />
              <Button variant="link" label={t('qrCards.cancel')} disabled={busy} onPress={() => setOpen(null)} />
            </View>
          </>
        )
      ) : null}

      {open === 'level' ? (
        <>
          <ChoiceGroup
            label={t('studentTools.levelLabel')}
            choices={LEVEL_IDS.map((id) => ({ value: id, label: levelName(t, id) }))}
            value={level}
            onChange={setLevelPick}
          />
          <TextField
            label={t('studentTools.joinedLabel')}
            hint={t('studentTools.joinedHint')}
            value={joined}
            onChangeText={setJoined}
            error={dateError}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <View style={styles.row}>
            <Button icon="check" label={t('studentTools.saveLevel')} loading={busy} disabled={busy} onPress={saveLevel} />
            <Button variant="link" label={t('qrCards.cancel')} disabled={busy} onPress={() => setOpen(null)} />
          </View>
        </>
      ) : null}

      {open === 'unlink' ? (
        <>
          <Notice tone="error" title={t('studentTools.unlinkAsk', { name: student.fullName })}>
            {t('studentTools.unlinkBody')}
          </Notice>
          <View style={styles.row}>
            <Button
              icon="signOut"
              label={t('studentTools.unlinkYes')}
              loading={busy}
              disabled={busy}
              onPress={() => void run(() => unlinkLogin(student.id), t('studentTools.unlinked'))}
            />
            <Button variant="link" label={t('qrCards.cancel')} disabled={busy} onPress={() => setOpen(null)} />
          </View>
        </>
      ) : null}

      {open === 'delete' ? (
        <>
          <Notice tone="error" title={t('studentTools.deleteAsk', { name: student.fullName })}>
            {t('studentTools.deleteBody')}
          </Notice>
          <TextField
            label={t('studentTools.deleteReason')}
            hint={t('studentTools.deleteReasonHint')}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
          />
          <TextField
            label={t('studentTools.deleteTypeName', { name: student.fullName })}
            value={typedName}
            onChangeText={setTypedName}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.row}>
            <Button
              icon="delete"
              label={t('studentTools.deleteYes')}
              loading={busy}
              disabled={busy || reason.trim().length < 3 || !nameTypedRight(typedName, student.fullName)}
              onPress={() => void remove()}
            />
            <Button variant="link" label={t('qrCards.cancel')} disabled={busy} onPress={() => setOpen(null)} />
          </View>
        </>
      ) : null}
    </Section>
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
