// C8 Student profile, for coordinators and the Guru: one student's details, parent and consent
// (for a minor), follow-up calls and open call tasks, recent visits, syllabus progress in their
// level and level history. From here the coordinator can log a call (C11) or check the student
// in or out. Staff only: this screen shows the parent's details and call notes, which students
// never see (docs/DATABASE.md "Who can see what"). Data: src/data/student-profile.ts.
// Progress is read-only here; its button opens C9 Syllabus tick-off (staff/syllabus/[id]).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { PersonHeader } from '@/components/person-header';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { VisitResultNotice } from '@/components/visit-result-notice';
import { markVisit, type MarkOutcome } from '@/data/attendance';
import { fetchStaff } from '@/data/student-overview';
import { fetchStudentProfile, hasDataConsent, type StudentProfile } from '@/data/student-profile';
import { ID_TYPES, RELATIONS } from '@/data/students';
import {
  callReasonName,
  formatDuration,
  lastVisitText,
  levelName,
  outcomeName,
  statusName,
} from '@/i18n/labels';
import { ageOn, dateInIndia, formatDayMonthYear, timeInIndia, todayInIndia } from '@/lib/dates';

/** What the screen loaded: the profile and the staff names it mentions. */
type Loaded = { profile: StudentProfile; staffNames: Map<string, string> };

/** "Label: value" on one line, the label in bold. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <AppText>
      <AppText variant="label">{label}: </AppText>
      {value}
    </AppText>
  );
}

/** The whole profile, one section per topic, with the two actions at the top. */
export default function StudentProfileScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  // undefined = loading, null = could not load, 'not_found' = no such student.
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [marking, setMarking] = useState(false);
  const [markOutcome, setMarkOutcome] = useState<MarkOutcome | null>(null);

  const load = useCallback(async () => {
    const [profile, staff] = await Promise.all([fetchStudentProfile(id), fetchStaff()]);
    if (profile === 'not_found') setLoaded('not_found');
    else if (!profile || !staff) setLoaded(null);
    else setLoaded({ profile, staffNames: new Map(staff.map((s) => [s.id, s.fullName])) });
  }, [id]);

  // Reload when coming back from the call screen, so the new call shows at once.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('profile.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="error">{t('profile.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('profile.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { profile, staffNames } = loaded;
  const { student } = profile;
  const nameOf = (profileId: string | null) =>
    (profileId && staffNames.get(profileId)) || t('profile.unknownPerson');
  const today = todayInIndia();

  async function toggleAttendance() {
    setMarking(true);
    setMarkOutcome(await markVisit(student.id, student.hereNow ? 'out' : 'in'));
    await load();
    setMarking(false);
  }

  const relationName = (code: string | null) =>
    code && (RELATIONS as readonly string[]).includes(code)
      ? t(`relations.${code as (typeof RELATIONS)[number]}`)
      : (code ?? '');
  const idTypeName = (code: string | null) =>
    code && (ID_TYPES as readonly string[]).includes(code)
      ? t(`idTypes.${code as (typeof ID_TYPES)[number]}`)
      : (code ?? '');

  const doneCount = profile.progress.filter((item) => item.doneOn).length;
  const showGuardians = profile.minor || profile.guardians.length > 0;

  return (
    <Screen underHeader>
      {header}
      <PersonHeader
        name={student.fullName}
        details={[`${student.rollNo} · ${levelName(t, student.levelId)} · ${statusName(t, student.status)}`]}
      />
      {student.status === 'paused' && student.pausedUntil ? (
        <AppText>{t('profile.pausedUntil', { date: formatDayMonthYear(student.pausedUntil) })}</AppText>
      ) : null}
      <AppText tone={student.hereNow ? 'success' : 'default'}>{lastVisitText(t, student)}</AppText>

      <Button
        icon="calls"
        label={t('profile.logCall')}
        onPress={() => router.push({ pathname: '/staff/call/[id]', params: { id: student.id } })}
      />
      <Button
        variant="secondary"
        icon="attendance"
        label={student.hereNow ? t('attendance.checkOut') : t('attendance.checkIn')}
        loading={marking}
        onPress={() => void toggleAttendance()}
      />
      {markOutcome?.result ? <VisitResultNotice result={markOutcome.result} /> : null}
      {markOutcome?.errorKey ? <Notice tone="error">{t(markOutcome.errorKey)}</Notice> : null}

      <Section icon="person" title={t('profile.detailsSection')}>
        <Line label={t('profile.joined')} value={formatDayMonthYear(student.joinedOn)} />
        <Line
          label={t('register.dob')}
          value={
            student.dob
              ? `${formatDayMonthYear(student.dob)} · ${t('register.age', { age: ageOn(student.dob, today) })}`
              : t('profile.notGiven')
          }
        />
        <Line label={t('register.phone')} value={student.phone ?? t('profile.notGiven')} />
        <Line label={t('register.email')} value={student.email ?? t('profile.notGiven')} />
        <Line
          label={t('register.area')}
          value={[student.area, student.pincode].filter(Boolean).join(' · ') || t('profile.notGiven')}
        />
        <Line
          label={t('register.mentor')}
          value={student.mentorId ? nameOf(student.mentorId) : t('register.noMentor')}
        />
        <Line label={t('profile.appLogin')} value={student.hasLogin ? t('profile.yes') : t('profile.no')} />
      </Section>

      {showGuardians ? (
        <Section icon="guardian" title={t('register.guardianSection')} description={t('profile.guardianStaffOnly')}>
          {profile.minor && !hasDataConsent(profile.consents) ? (
            <Notice tone="error">{t('profile.consentMissing')}</Notice>
          ) : null}
          {profile.guardians.map((g) => (
            <AppText key={g.id}>
              <AppText variant="label">{g.fullName}</AppText>
              {[relationName(g.relation), g.phone, g.email].filter(Boolean).map((part) => ` · ${part}`).join('')}
            </AppText>
          ))}
          {profile.consents.map((c) => (
            <AppText key={c.id} tone={c.revokedAt ? 'muted' : 'default'}>
              {t('profile.consentLine', {
                scope: t(`consentScopes.${c.scope}`),
                method: t(`consentMethods.${c.method}`),
                date: formatDayMonthYear(dateInIndia(c.givenAt)),
              })}
              {c.idTypeChecked ? ` · ${t('profile.idSeen', { idType: idTypeName(c.idTypeChecked) })}` : ''}
              {c.revokedAt
                ? ` · ${t('profile.consentWithdrawn', { date: formatDayMonthYear(dateInIndia(c.revokedAt)) })}`
                : ''}
            </AppText>
          ))}
        </Section>
      ) : null}

      <Section icon="calls" title={t('profile.followUpSection')}>
        {profile.openTasks.map((task) => (
          <Notice key={task.id} tone={task.escalated ? 'error' : 'info'}>
            {[
              t('followUp.due', { date: formatDayMonthYear(task.dueOn) }),
              task.attempt > 1 ? t('followUp.attempt', { number: task.attempt }) : null,
              task.escalated ? t('followUp.escalated') : null,
              task.assigneeId
                ? t('followUp.assignee', { name: nameOf(task.assigneeId) })
                : t('followUp.unassigned'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Notice>
        ))}
        {profile.calls.length === 0 ? <AppText tone="muted">{t('profile.noCalls')}</AppText> : null}
        {profile.calls.map((call) => (
          <AppText key={call.id}>
            <AppText variant="label">
              {`${formatDayMonthYear(dateInIndia(call.calledAt))} ${timeInIndia(call.calledAt)} · ${outcomeName(t, call.outcome)}`}
            </AppText>
            {call.reason ? ` · ${callReasonName(t, call.reason)}` : ''}
            {call.nextDate
              ? ` · ${t(call.outcome === 'paused' ? 'profile.callUntil' : 'profile.callExpected', {
                  date: formatDayMonthYear(call.nextDate),
                })}`
              : ''}
            {`\n${call.comment}\n`}
            <AppText variant="small" tone="muted">
              {t('profile.calledBy', { name: nameOf(call.coordinatorId) })}
            </AppText>
          </AppText>
        ))}
      </Section>

      <Section
        icon="visits"
        title={t('profile.visitsSection')}
        description={t('profile.visitCounts', { recent: profile.visitsLast30Days, total: profile.totalVisits })}>
        {profile.recentVisits.length === 0 ? <AppText tone="muted">{t('profile.noVisits')}</AppText> : null}
        {profile.recentVisits.map((visit) => (
          <AppText key={visit.id}>
            {`${formatDayMonthYear(dateInIndia(visit.checkIn))} · ${timeInIndia(visit.checkIn)}`}
            {visit.checkOut
              ? `–${timeInIndia(visit.checkOut)} · ${formatDuration(t, (Date.parse(visit.checkOut) - Date.parse(visit.checkIn)) / 60_000)}`
              : ` · ${t('profile.stillHere')}`}
          </AppText>
        ))}
      </Section>

      <Section
        icon="syllabus"
        title={t('profile.syllabusSection', { level: levelName(t, student.levelId) })}
        description={t('profile.syllabusDone', { done: doneCount, total: profile.progress.length })}>
        {profile.progress.length === 0 ? <AppText tone="muted">{t('profile.noSyllabus')}</AppText> : null}
        {profile.progress.map((item) => (
          <AppText key={item.id} tone={item.doneOn ? 'default' : 'muted'}>
            {`${item.doneOn ? '✓' : '○'} ${item.sort}. ${item.title}`}
            {item.doneOn ? ` · ${formatDayMonthYear(item.doneOn)}` : ''}
            {item.remark ? ` · ${item.remark}` : ''}
          </AppText>
        ))}
        <Button
          variant="secondary"
          icon="check"
          label={t('profile.tickSyllabus')}
          onPress={() => router.push({ pathname: '/staff/syllabus/[id]', params: { id: student.id } })}
        />
      </Section>

      <Section icon="level" title={t('profile.levelSection')}>
        {profile.levelHistory.length === 0 ? <AppText tone="muted">{t('profile.noLevelChanges')}</AppText> : null}
        {profile.levelHistory.map((change) => (
          <AppText key={change.id}>
            {`${formatDayMonthYear(change.changedOn)} · `}
            {change.fromLevel
              ? t('profile.levelChange', { from: levelName(t, change.fromLevel), to: levelName(t, change.toLevel) })
              : levelName(t, change.toLevel)}
            {change.approvedBy ? ` · ${t('profile.approvedBy', { name: nameOf(change.approvedBy) })}` : ''}
          </AppText>
        ))}
      </Section>
    </Screen>
  );
}
