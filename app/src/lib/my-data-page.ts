// "A summary of my data" (docs/DECISIONS.md #550): the sections My data and rights shows, and the same sections as a
// printable page for the web app (src/lib/data-export.web.ts prints it; "Save as PDF" in the print dialog keeps a
// copy). Built from my_data_summary() (src/data/data-rights.ts). The page holds no scripts and every value is
// escaped, so a name with < or & prints as typed.

import type { TFunction } from 'i18next';

import type { MyDataSummary } from '@/data/data-rights';
import type { StudentStatus } from '@/data/student-overview';
import { idTypeName, levelName, relationName, statusName } from '@/i18n/labels';

/** One labelled value. */
export type SummaryRow = { label: string; value: string };
/** One block of the summary. */
export type SummarySection = { key: string; title: string; rows: SummaryRow[] };
/** How dates are written (src/lib/dates.ts in the app; fixed in the tests). */
export type DateFormat = { date: (isoDate: string) => string; dateTime: (timestamp: string) => string };

/** The services that handle data for the class, as in the privacy notice's "Services that handle data for us". */
export const PROCESSORS = ['supabase', 'expo', 'firebase', 'brevo', 'cloudflare', 'zoho', 'youtube'] as const;

const shown = (value: unknown): string => (value === null || value === undefined || value === '' ? '—' : String(value));

/** The summary's sections, in the order the screen and the page show them. Empty sections are left out. */
export function summarySections(t: TFunction, s: MyDataSummary, fmt: DateFormat): SummarySection[] {
  const day = (v: string | null | undefined) => (v ? fmt.date(v.slice(0, 10)) : '—');
  const moment = (v: string | null | undefined) => (v ? fmt.dateTime(v) : '—');
  const sections: SummarySection[] = [];

  sections.push({
    key: 'login',
    title: t('dataRights.summary.login'),
    rows: [
      { label: t('dataRights.fields.name'), value: shown(s.login.full_name) },
      { label: t('dataRights.fields.email'), value: shown(s.login.email) },
      { label: t('dataRights.fields.phone'), value: shown(s.login.phone) },
      { label: t('dataRights.fields.role'), value: t(`dataRights.roles.${s.login.role === 'guru' || s.login.role === 'coordinator' ? s.login.role : 'student'}`) },
      { label: t('dataRights.fields.language'), value: shown(s.login.language) },
      { label: t('dataRights.fields.since'), value: day(s.login.created_at) },
    ],
  });

  const r = s.record;
  if (r) {
    sections.push({
      key: 'record',
      title: t('dataRights.summary.record'),
      rows: [
        { label: t('dataRights.fields.rollNo'), value: r.roll_no },
        { label: t('dataRights.fields.name'), value: shown(r.full_name) },
        { label: t('dataRights.fields.dob'), value: day(r.dob) },
        { label: t('dataRights.fields.phone'), value: shown(r.phone) },
        { label: t('dataRights.fields.email'), value: shown(r.email) },
        { label: t('dataRights.fields.area'), value: shown(r.area) },
        { label: t('dataRights.fields.pincode'), value: shown(r.pincode) },
        { label: t('dataRights.fields.level'), value: typeof r.level_id === 'number' ? levelName(t, r.level_id, s.level_name ?? undefined) : shown(s.level_name) },
        { label: t('dataRights.fields.status'), value: statusName(t, r.status as StudentStatus) },
        { label: t('dataRights.fields.centre'), value: shown(s.centre_name) },
        { label: t('dataRights.fields.mentor'), value: shown(s.mentor_name) },
        { label: t('dataRights.fields.joined'), value: day(r.joined_on) },
        ...(r.withdrawn_at ? [{ label: t('dataRights.fields.withdrawn'), value: day(r.withdrawn_at) }] : []),
      ],
    });
  }

  if (s.about) {
    const a = s.about;
    const list = (v: unknown) => (Array.isArray(v) && v.length ? v.join(', ') : '—');
    sections.push({
      key: 'about',
      title: t('dataRights.summary.about'),
      rows: [
        { label: t('dataRights.fields.dob'), value: day(a.dob as string | null) },
        { label: t('dataRights.fields.dikshaName'), value: shown(a.diksha_name) },
        { label: t('dataRights.fields.emergency'), value: [a.emergency_relation, a.emergency_name, a.emergency_phone].filter(Boolean).join(', ') || '—' },
        { label: t('dataRights.fields.heardVia'), value: shown(a.heard_other ?? a.heard_via) },
        { label: t('dataRights.fields.occupation'), value: shown(a.occupation_other ?? a.occupation) },
        { label: t('dataRights.fields.service'), value: list(a.service_areas) },
        { label: t('dataRights.fields.learn'), value: list(a.learn_interests) },
      ],
    });
  }

  if (s.guardians?.length) {
    sections.push({
      key: 'guardians',
      title: t('dataRights.summary.guardians'),
      rows: s.guardians.map((g) => ({
        label: g.relation ? relationName(t, g.relation) : t('dataRights.fields.guardian'),
        value: [g.name, g.phone, g.email].filter(Boolean).join(', '),
      })),
    });
  }

  if (s.consents?.length) {
    sections.push({
      key: 'consents',
      title: t('dataRights.summary.consents'),
      rows: s.consents.map((c) => ({
        label: t(`dataRights.consentScope.${c.scope}`),
        value: [
          t('dataRights.consentGiven', { date: day(c.given_at), how: t(`dataRights.consentMethod.${c.method}`) }),
          c.id_type_checked ? t('dataRights.consentId', { kind: idTypeName(t, c.id_type_checked) }) : null,
          c.notice_version ? t('dataRights.consentNotice', { version: c.notice_version }) : null,
          c.revoked_at ? t('dataRights.consentRevoked', { date: day(c.revoked_at) }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    });
  }

  const activity: SummaryRow[] = [];
  if (s.visits) {
    activity.push({
      label: t('dataRights.fields.visits'),
      value: s.visits.count ? t('dataRights.visitsLine', { count: s.visits.count, first: day(s.visits.first), last: day(s.visits.last) }) : '0',
    });
  }
  if (s.practice) activity.push({ label: t('dataRights.fields.practice'), value: t('dataRights.practiceLine', { count: s.practice.count, minutes: s.practice.minutes }) });
  if (s.syllabus_ticks !== undefined) activity.push({ label: t('dataRights.fields.ticks'), value: String(s.syllabus_ticks) });
  if (s.level_history) activity.push({ label: t('dataRights.fields.levelChanges'), value: String(s.level_history.length) });
  if (s.follow_up_calls) {
    activity.push({
      label: t('dataRights.fields.calls'),
      value: s.follow_up_calls.count ? t('dataRights.callsLine', { count: s.follow_up_calls.count, last: day(s.follow_up_calls.last) }) : '0',
    });
  }
  if (s.assessments !== undefined) activity.push({ label: t('dataRights.fields.assessments'), value: String(s.assessments) });
  if (s.events !== undefined) activity.push({ label: t('dataRights.fields.events'), value: String(s.events) });
  if (s.loans) activity.push({ label: t('dataRights.fields.loans'), value: String(s.loans.length) });
  activity.push(
    { label: t('dataRights.fields.devices'), value: String(s.devices) },
    { label: t('dataRights.fields.notices'), value: String(s.notices) },
    { label: t('dataRights.fields.replies'), value: String(s.replies) },
    { label: t('dataRights.fields.eventAnswers'), value: String(s.event_answers) },
    { label: t('dataRights.fields.pollVotes'), value: String(s.poll_votes) },
    { label: t('dataRights.fields.ishtagoshti'), value: s.ishtagoshti ? t('dataRights.yes') : t('dataRights.no') },
  );
  sections.push({ key: 'activity', title: t('dataRights.summary.activity'), rows: activity });

  sections.push({
    key: 'processors',
    title: t('dataRights.summary.processors'),
    rows: PROCESSORS.map((p) => ({ label: t(`dataRights.processors.${p}.name`), value: t(`dataRights.processors.${p}.what`) })),
  });

  if (s.requests.length) {
    sections.push({
      key: 'requests',
      title: t('dataRights.summary.requests'),
      rows: s.requests.map((q) => ({
        label: `${q.ref} · ${t(`dataRights.kinds.${q.kind}`)}`,
        value: `${t(`dataRights.statuses.${q.status}`)} · ${moment(q.created_at)}`,
      })),
    });
  }
  return sections;
}

/** Escapes text for HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The id of the print copy under <body>. */
export const PRINT_ID = 'ms-data-print';

/** Print CSS: only the copy is printed, on A4, black on white. */
export const PRINT_CSS = `
@media screen{#${PRINT_ID}{display:none}}
@media print{
  @page{size:A4 portrait;margin:15mm}
  html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:#fff!important}
  body>*:not(#${PRINT_ID}){display:none!important}
  #${PRINT_ID}{display:block!important;color:#000;font:11pt/1.4 system-ui,'Noto Sans','Noto Sans Telugu','Noto Sans Devanagari',sans-serif}
  #${PRINT_ID} h1{font-size:16pt;margin:0 0 4pt}
  #${PRINT_ID} h2{font-size:12pt;margin:12pt 0 4pt;break-after:avoid}
  #${PRINT_ID} table{border-collapse:collapse;width:100%}
  #${PRINT_ID} th,#${PRINT_ID} td{border:0.5pt solid #999;padding:3pt 5pt;text-align:left;vertical-align:top}
  #${PRINT_ID} th{width:35%;font-weight:600}
  #${PRINT_ID} tr{break-inside:avoid}
  #${PRINT_ID} p{margin:4pt 0}
}
`;

/** The printable page: a heading, the generated time, each section as a table, and the footer lines. */
export function myDataPageHtml(heading: string, lines: string[], sections: SummarySection[], footer: string[]): string {
  const p = (text: string) => `<p>${escapeHtml(text)}</p>`;
  const table = (s: SummarySection) =>
    `<h2>${escapeHtml(s.title)}</h2><table>${s.rows
      .map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
      .join('')}</table>`;
  return `<h1>${escapeHtml(heading)}</h1>${lines.map(p).join('')}${sections.map(table).join('')}${footer.map(p).join('')}`;
}
