// C21 My reports (a coordinator: their mentees) and G8 Reports (the Guru: everyone, or one
// coordinator's mentees), one screen for both roles. A range (this month, last month, the last 4
// weeks, the last 3 months, or two dates), then: students now by status, new joiners and Left in
// the range, visits per week and per month, follow-up calls done and due, syllabus progress per
// level, and every student's line. Tables on a laptop, cards on a phone. "Download CSV" in the
// browser; on the Android app "Save to a folder" or "Share" (src/lib/save-csv.ts). Data:
// src/data/reports.ts, counted by class_report (migration 0015) like the home screens.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup, type Choice } from '@/components/choice-group';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { TextField } from '@/components/text-field';
import {
  fetchReport,
  rangeOf,
  reportCsvRows,
  reportFileName,
  type ClassReport,
  type RangeChoice,
  type VisitPeriod,
} from '@/data/reports';
import { fetchStaff, type StaffMember } from '@/data/student-overview';
import { levelName, monthName, outcomeName, statusName } from '@/i18n/labels';
import { FLAG_REASONS, type FlagReason } from '@/i18n/location-flag';
import { toCsv } from '@/lib/csv';
import { formatDayMonthYear, parseDayMonthYear } from '@/lib/dates';
import { CSV_WAYS, downloadCsv, saveCsvToFolder, shareCsv, type CsvResult } from '@/lib/save-csv';
import { useWide } from '@/theme/use-theme';

/** Student lines drawn at first; "Show more" adds as many again. */
const PAGE = 50;

/** The reports. */
export default function ReportsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const wide = useWide();
  const isGuru = profile?.role === 'guru';
  const [choice, setChoice] = useState<RangeChoice>('thisMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [range, setRange] = useState(() => rangeOf('thisMonth'));
  const [mentor, setMentor] = useState<string>('all');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // undefined = loading.
  const [report, setReport] = useState<ClassReport | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [exportMessage, setExportMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const title = isGuru ? t('reports.titleGuru') : t('reports.titleCoordinator');

  const load = useCallback(async () => {
    setError(null);
    setReport(undefined);
    setExportMessage(null);
    const result = await fetchReport(range.from, range.to, isGuru && mentor !== 'all' ? mentor : null);
    if (result.errorKey) setError(t(result.errorKey));
    setReport(result.report);
    setLimit(PAGE);
  }, [range, mentor, isGuru, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!isGuru) return;
    void fetchStaff().then((list) => setStaff((list ?? []).filter((s) => s.active)));
  }, [isGuru]);

  const mentorChoices = useMemo(
    (): Choice<string>[] => [{ value: 'all', label: t('reports.everyone') }, ...staff.map((s) => ({ value: s.id, label: s.fullName }))],
    [staff, t],
  );

  function pick(next: RangeChoice) {
    setChoice(next);
    if (next !== 'custom') setRange(rangeOf(next));
  }

  function showCustom() {
    const from = parseDayMonthYear(customFrom);
    const to = parseDayMonthYear(customTo);
    if (!from || !to) {
      setError(t('reports.errors.dates'));
      return;
    }
    setRange({ from, to });
  }

  async function exportCsv(way: 'download' | 'folder' | 'share') {
    if (!report) return;
    const text = toCsv(reportCsvRows(report, t));
    const name = reportFileName(report);
    const result: CsvResult =
      way === 'folder' ? await saveCsvToFolder(name, text) : way === 'share' ? await shareCsv(name, text) : await downloadCsv(name, text);
    if (result === 'saved') setExportMessage({ tone: 'success', text: t(way === 'share' ? 'reports.shared' : 'reports.saved', { name }) });
    else if (result === 'failed') setExportMessage({ tone: 'error', text: t('reports.exportFailed') });
  }

  const periodRows = (periods: VisitPeriod[], label: (p: VisitPeriod) => string) =>
    wide ? (
      <DataTable
        columns={[
          { label: t('reports.period'), flex: 2 },
          { label: t('reports.visits'), flex: 1, align: 'right' },
          { label: t('reports.visitors'), flex: 1, align: 'right' },
          { label: t('reports.hours'), flex: 1, align: 'right' },
        ]}
        rows={periods.map((p) => ({ key: p.start, cells: [label(p), String(p.visits), String(p.visitors), String(p.hours)] }))}
      />
    ) : (
      periods.map((p) => (
        <ListRow
          key={p.start}
          leading="visits"
          title={label(p)}
          details={[t('reports.periodLine', { visits: p.visits, visitors: p.visitors, hours: p.hours })]}
        />
      ))
    );

  const everyone = report ? report.byStatus.reduce((total, s) => total + s.students, 0) : 0;
  const open = (id: string) => router.push({ pathname: '/staff/students/[id]', params: { id } });

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title }} />
      <AppText tone="muted">{isGuru ? t('reports.introGuru') : t('reports.introCoordinator')}</AppText>

      <Section icon="visits" title={t('reports.rangeTitle')}>
        <ChoiceGroup
          chips
          choices={[
            { value: 'thisMonth', label: t('reports.ranges.thisMonth') },
            { value: 'lastMonth', label: t('reports.ranges.lastMonth') },
            { value: 'last4Weeks', label: t('reports.ranges.last4Weeks') },
            { value: 'last3Months', label: t('reports.ranges.last3Months') },
            { value: 'custom', label: t('reports.ranges.custom') },
          ]}
          value={choice}
          onChange={pick}
        />
        {choice === 'custom' ? (
          <>
            <TextField label={t('reports.from')} hint={t('reports.dateHint')} value={customFrom} onChangeText={setCustomFrom} maxLength={10} />
            <TextField label={t('reports.to')} hint={t('reports.dateHint')} value={customTo} onChangeText={setCustomTo} maxLength={10} />
            <Button variant="secondary" icon="search" label={t('reports.show')} onPress={showCustom} />
          </>
        ) : null}
        {isGuru && staff.length > 0 ? (
          <ChoiceGroup chips label={t('reports.whose')} choices={mentorChoices} value={mentor} onChange={setMentor} />
        ) : null}
        <AppText variant="small" tone="muted" role="status">
          {t('reports.rangeLine', { from: formatDayMonthYear(range.from), to: formatDayMonthYear(range.to) })}
        </AppText>
      </Section>

      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {report === undefined && !error ? <LoadingCards kind="tiles" /> : null}

      {report ? (
        <>
          <StatGrid>
            <StatTile icon="students" value={String(report.inClass)} label={t('reports.inClass')} />
            <StatTile icon="newJoiner" value={String(report.newJoiners)} label={t('reports.newJoiners')} />
            <StatTile icon="visits" value={String(report.visits)} label={t('reports.visitsTile', { count: report.visitors })} />
            <StatTile icon="calls" value={String(report.callsDone)} label={t('reports.callsDone')} />
            <StatTile icon="alert" value={String(report.callsDue)} label={t('reports.callsDue')} />
            <StatTile icon="signOut" value={String(report.leftInRange)} label={t('reports.leftInRange')} />
          </StatGrid>

          <Section icon="status" title={t('reports.statusTitle')} description={t('reports.statusHint')}>
            {report.byStatus.map((s) => (
              <ProgressBar
                key={s.status}
                done={s.students}
                total={everyone}
                showComplete={false}
                label={statusName(t, s.status)}
                valueText={t('home.guru.share', { name: statusName(t, s.status), count: s.students, total: everyone })}
              />
            ))}
          </Section>

          <Section
            icon="visits"
            title={t('reports.weeksTitle')}
            description={report.weekStarts === 'rolling7' ? t('reports.weeksRolling') : t('reports.weeksMonday')}>
            {periodRows(report.byWeek, (p) => t('reports.weekOf', { date: formatDayMonthYear(p.start) }))}
          </Section>

          <Section icon="visits" title={t('reports.monthsTitle')}>
            {periodRows(report.byMonth, (p) => monthName(t, p.start.slice(0, 7)))}
          </Section>

          {/* Check-ins flagged by the location check (DECISIONS #70): the visits count all the same. */}
          <Section icon="alert" title={t('attendanceLocation.flaggedTile')} description={t('attendanceLocation.flaggedHint')}>
            <AppText variant="label">{String(report.visitsFlagged)}</AppText>
            {report.flaggedByReason
              .filter((r) => (FLAG_REASONS as readonly string[]).includes(r.reason))
              .map((r) => (
                <AppText key={r.reason} variant="small" tone="muted">
                  {t('attendanceLocation.reasonLine', { reason: t(`attendanceLocation.reason.${r.reason as FlagReason}`), count: r.visits })}
                </AppText>
              ))}
          </Section>

          <Section icon="calls" title={t('reports.callsTitle')} description={t('reports.callsHint')}>
            <AppText>{t('reports.callsLine', { due: report.callsDue, escalated: report.callsEscalated, planned: report.callsPlanned })}</AppText>
            {report.callsByOutcome.map((o) => (
              <AppText key={o.outcome} variant="small" tone="muted">
                {t('reports.outcomeLine', { outcome: outcomeName(t, o.outcome as Parameters<typeof outcomeName>[1]), count: o.calls })}
              </AppText>
            ))}
          </Section>

          <Section icon="level" title={t('reports.progressTitle')} description={t('reports.progressHint')}>
            {report.byLevel.map((l) => (
              <ProgressBar
                key={l.levelId}
                done={l.avgPercent}
                total={100}
                showComplete={false}
                label={t('reports.levelLabel', { level: levelName(t, l.levelId, l.name), count: l.students })}
                valueText={t('reports.levelLine', {
                  level: levelName(t, l.levelId, l.name),
                  count: l.students,
                  percent: l.avgPercent,
                  complete: l.complete,
                  ticks: l.ticksInRange,
                  items: l.items,
                })}
              />
            ))}
          </Section>

          <Section icon="download" title={t('reports.exportTitle')} description={t('reports.exportHint')}>
            {CSV_WAYS.includes('download') ? (
              <Button icon="download" label={t('reports.download')} onPress={() => void exportCsv('download')} />
            ) : null}
            {CSV_WAYS.includes('folder') ? (
              <Button icon="download" label={t('reports.saveToFolder')} onPress={() => void exportCsv('folder')} />
            ) : null}
            {CSV_WAYS.includes('share') ? (
              <Button variant="secondary" icon="share" label={t('reports.share')} onPress={() => void exportCsv('share')} />
            ) : null}
            {exportMessage ? <Notice tone={exportMessage.tone}>{exportMessage.text}</Notice> : null}
          </Section>

          <Section icon="students" title={t('reports.studentsTitle', { count: report.rows.length })}>
            {report.rows.length === 0 ? <EmptyState icon="students" title={t('reports.noStudents')} /> : null}
            {wide && report.rows.length > 0 ? (
              <DataTable
                columns={[
                  { label: t('database.columns.name'), flex: 2.2 },
                  { label: t('database.columns.level'), flex: 1.1 },
                  { label: t('database.columns.status'), flex: 1 },
                  ...(isGuru ? [{ label: t('database.columns.mentor'), flex: 1.4 }] : []),
                  { label: t('reports.csv.visits'), flex: 0.8, align: 'right' as const },
                  { label: t('reports.csv.hours'), flex: 0.8, align: 'right' as const },
                  { label: t('reports.csv.lastVisit'), flex: 1.2 },
                  { label: t('reports.csv.calls'), flex: 0.7, align: 'right' as const },
                  { label: t('reports.syllabusColumn'), flex: 0.9, align: 'right' as const },
                  { label: t('attendanceLocation.csvColumn'), flex: 0.9, align: 'right' as const },
                ]}
                rows={report.rows.slice(0, limit).map((s) => ({
                  key: s.id,
                  label: `${s.fullName}, ${s.rollNo}`,
                  onPress: () => open(s.id),
                  cells: [
                    s.fullName,
                    levelName(t, s.levelId),
                    statusName(t, s.status),
                    ...(isGuru ? [s.mentorName ?? t('database.none')] : []),
                    String(s.visits),
                    String(s.hours),
                    s.lastVisitOn ? formatDayMonthYear(s.lastVisitOn) : t('reports.never'),
                    String(s.calls),
                    `${s.syllabusDone}/${s.syllabusTotal}`,
                    String(s.flagged),
                  ],
                }))}
              />
            ) : (
              report.rows.slice(0, limit).map((s) => (
                <ListRow
                  key={s.id}
                  leading="initials"
                  title={s.fullName}
                  chips={{ levelId: s.levelId, status: s.status }}
                  details={[
                    t('reports.studentLine', { visits: s.visits, hours: s.hours, calls: s.calls }),
                    t('reports.studentLine2', {
                      last: s.lastVisitOn ? formatDayMonthYear(s.lastVisitOn) : t('reports.never'),
                      done: s.syllabusDone,
                      total: s.syllabusTotal,
                    }),
                    ...(isGuru ? [t('students.mentor', { name: s.mentorName ?? t('database.none') })] : []),
                  ]}
                  warning={s.flagged > 0 ? t('attendanceLocation.studentFlagged', { count: s.flagged }) : undefined}
                  onPress={() => open(s.id)}
                />
              ))
            )}
            {report.rows.length > limit ? (
              <Button variant="secondary" label={t('database.showMore', { count: report.rows.length - limit })} onPress={() => setLimit(limit + PAGE)} />
            ) : null}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
