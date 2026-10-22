// G3 Excel import, the Guru only: choose an .xlsx or .csv file → match its columns to the app's
// fields (guessed from the headings) → preview with each row's problems (missing name, bad date,
// under 18, duplicate phone, email, roll number or student) → import only the good rows. The
// database gives each saved student a roll number, as for C2, and refuses a bad row on its own.
// Data: src/data/student-import.ts; rules: import_students in migration 0014 (DECISIONS #46).
// Since #326 (audit R3-04, R3-07, R2-13): rows a dropped connection did not send are counted with "Import
// the rest"; an import can be undone (its records nothing hangs on are deleted), right after it or from
// the list of the last 30 days' imports.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { GuruOnly } from '@/components/guru-only';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import {
  checkRows,
  fetchExistingStudents,
  fetchRecentImports,
  guessColumns,
  IMPORT_FIELDS,
  importRows,
  importToday,
  pickSheet,
  REQUIRED_FIELDS,
  undoImport,
  type KeptRecord,
  type RecentImport,
  type ColumnMap,
  type ExistingStudents,
  type ImportField,
  type ImportResult,
  type PreviewRow,
} from '@/data/student-import';
import { levelName } from '@/i18n/labels';
import { formatDate, formatDateTime } from '@/lib/dates';
import { goBackOr } from '@/lib/go-back';
import type { SheetRows } from '@/lib/sheet-reader';
import { spacing, useTheme } from '@/theme/use-theme';
import { useRequestId } from '@/lib/use-request-id';
import type { MessageKey } from '@/data/errors';

/** How many rows of each kind the preview lists; the counts always cover every row. */
const PREVIEW_ROWS = 50;

type Sheet = { fileName: string; rows: SheetRows; existing: ExistingStudents };

/** The import, step by step on one page. */
export default function ImportScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [columns, setColumns] = useState<ColumnMap>({});
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [showing, setShowing] = useState<'problems' | 'good'>('problems');
  const [asking, setAsking] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  // Good rows a dropped connection did not send (R3-07): counted, and Import the rest checks them again.
  const [notSent, setNotSent] = useState(0);
  // One id per chosen file, sent with every row, so the import can be undone (#326).
  const { requestId: importId, renew: newImport } = useRequestId();
  const [recent, setRecent] = useState<RecentImport[] | null | undefined>(undefined);

  const loadRecent = useCallback(async () => {
    setRecent(await fetchRecentImports());
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadRecent();
    }, [loadRecent]),
  );

  const preview = useMemo<PreviewRow[]>(
    () => (sheet ? checkRows(sheet.rows, columns, sheet.existing, importToday()) : []),
    [sheet, columns],
  );
  const good = preview.filter((r) => r.problems.length === 0);
  const bad = preview.filter((r) => r.problems.length > 0);
  const missingRequired = REQUIRED_FIELDS.filter((f) => columns[f] === undefined);

  if (profile?.role !== 'guru') return <GuruOnly title={t('importStudents.title')} />;

  async function choose() {
    setBusy(true);
    setErrorKey(null);
    setResults(null);
    setNotSent(0);
    newImport();
    const picked = await pickSheet();
    if (picked && 'errorKey' in picked) {
      setBusy(false);
      setErrorKey(picked.errorKey);
      return;
    }
    if (!picked) {
      setBusy(false);
      return;
    }
    const existing = await fetchExistingStudents();
    setBusy(false);
    if (!existing) {
      setErrorKey('common.networkError');
      return;
    }
    setSheet({ fileName: picked.fileName, rows: picked.rows, existing });
    setColumns(guessColumns(picked.rows[0] ?? []));
    setShowing('problems');
  }

  async function runImport() {
    setBusy(true);
    setErrorKey(null);
    const outcome = await importRows(good, importId());
    setBusy(false);
    setAsking(false);
    setResults(outcome.results);
    setNotSent(good.length - outcome.results.length);
    if (outcome.errorKey) setErrorKey(outcome.errorKey);
    void loadRecent();
  }

  /** R3-07: the rows not sent are checked again against what is saved now (the same import id). */
  async function importRest() {
    if (!sheet) return;
    setBusy(true);
    setErrorKey(null);
    const existing = await fetchExistingStudents();
    setBusy(false);
    if (!existing) {
      setErrorKey('common.networkError');
      return;
    }
    setSheet({ ...sheet, existing });
    setResults(null);
    setNotSent(0);
    setShowing('good');
  }

  const headings = sheet?.rows[0] ?? [];
  const columnLabel = (index: number) => headings[index]?.trim() || t('importStudents.columnN', { letter: columnLetter(index) });
  const lineText = (row: PreviewRow) =>
    [
      t('importStudents.line', { line: row.line }),
      row.values.fullName || '—',
      row.values.dob ? formatDate(row.values.dob) : null,
      row.values.phone || null,
      row.values.levelId ? levelName(t, row.values.levelId) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const saved = results?.filter((r) => r.rollNo) ?? [];
  const refused = results?.filter((r) => r.problem) ?? [];

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('importStudents.title') }} />
      <Notice tone="info" title={t('importStudents.howTitle')}>
        {t('importStudents.how')}
      </Notice>
      {errorKey && !results ? <Notice tone="error">{t(errorKey as never)}</Notice> : null}

      {!sheet && recent && recent.length > 0 ? (
        <Section icon="file" title={t('importStudents.recentTitle')} description={t('importStudents.recentHint')}>
          {recent.map((r) => (
            <View key={r.importId} style={[styles.previewRow, { borderColor: colors.border }]}>
              <AppText variant="small">{t('importStudents.recentLine', { date: formatDateTime(r.at), count: r.count })}</AppText>
              <UndoImport importId={r.importId} count={r.count} onDone={() => void loadRecent()} />
            </View>
          ))}
        </Section>
      ) : null}

      <Button
        variant={sheet ? 'secondary' : 'primary'}
        icon="file"
        label={sheet ? t('importStudents.chooseAgain') : t('importStudents.choose')}
        loading={busy && !asking}
        onPress={() => void choose()}
      />

      {sheet && !results ? (
        <>
          <AppText variant="label">{t('importStudents.fileLine', { name: sheet.fileName, count: Math.max(sheet.rows.length - 1, 0) })}</AppText>

          <Section icon="filter" title={t('importStudents.columnsTitle')} description={t('importStudents.columnsHint')}>
            {IMPORT_FIELDS.map((field) => (
              <ChoiceGroup<number>
                key={field}
                chips
                label={`${t(`importStudents.fields.${field}`)}${REQUIRED_FIELDS.includes(field) ? ' *' : ''}`}
                choices={[
                  { value: -1, label: t('importStudents.notInFile') },
                  ...headings.map((_, index) => ({ value: index, label: columnLabel(index) })),
                ]}
                value={columns[field] ?? -1}
                onChange={(index) => setColumns(withColumn(columns, field, index))}
              />
            ))}
            {missingRequired.length > 0 ? (
              <Notice tone="error">
                {t('importStudents.needColumns', { fields: missingRequired.map((f) => t(`importStudents.fields.${f}`)).join(', ') })}
              </Notice>
            ) : null}
          </Section>

          {missingRequired.length === 0 ? (
            <Section icon="check" title={t('importStudents.previewTitle')}>
              <View style={styles.counts}>
                <AppText variant="label" tone="success">
                  {t('importStudents.goodCount', { count: good.length })}
                </AppText>
                <AppText variant="label" tone={bad.length > 0 ? 'danger' : 'muted'}>
                  {t('importStudents.badCount', { count: bad.length })}
                </AppText>
              </View>
              <ChoiceGroup
                accessibilityLabel={t('choiceNames.rows')}
                choices={[
                  { value: 'problems', label: t('importStudents.showProblems', { count: bad.length }) },
                  { value: 'good', label: t('importStudents.showGood', { count: good.length }) },
                ]}
                value={showing}
                onChange={setShowing}
              />
              {(showing === 'problems' ? bad : good).slice(0, PREVIEW_ROWS).map((row) => (
                <View key={row.line} style={[styles.previewRow, { borderColor: colors.border }]}>
                  <AppText variant="small">{lineText(row)}</AppText>
                  {row.problems.map((p) => (
                    <AppText key={p} variant="small" tone="danger">
                      {t(`importErrors.${p}`)}
                    </AppText>
                  ))}
                </View>
              ))}
              {(showing === 'problems' ? bad : good).length > PREVIEW_ROWS ? (
                <AppText variant="small" tone="muted">
                  {t('importStudents.andMore', { count: (showing === 'problems' ? bad : good).length - PREVIEW_ROWS })}
                </AppText>
              ) : null}
              {bad.length > 0 ? <AppText tone="muted">{t('importStudents.fixHint')}</AppText> : null}
            </Section>
          ) : null}

          {missingRequired.length === 0 && good.length > 0 ? (
            asking ? (
              <>
                <Notice tone="info" title={t('importStudents.askTitle', { count: good.length })} announced>
                  {t('importStudents.askBody')}
                </Notice>
                <Button icon="send" label={t('importStudents.importButton', { count: good.length })} loading={busy} onPress={() => void runImport()} />
                <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(false)} />
              </>
            ) : (
              <Button icon="send" label={t('importStudents.importButton', { count: good.length })} onPress={() => setAsking(true)} />
            )
          ) : null}
        </>
      ) : null}

      {results ? (
        <Section icon="check" title={t('importStudents.doneTitle')}>
          <Notice tone={errorKey || notSent > 0 ? 'error' : refused.length === 0 ? 'success' : 'info'}>
            {t('importStudents.doneLine', { saved: saved.length, refused: refused.length })}
          </Notice>
          {errorKey ? <Notice tone="error">{t(errorKey as never)}</Notice> : null}
          {notSent > 0 ? (
            <>
              <AppText tone="danger">{t('importStudents.notSent', { count: notSent })}</AppText>
              <Button icon="refresh" label={t('importStudents.importRest')} loading={busy} disabled={busy} onPress={() => void importRest()} />
            </>
          ) : null}
          {refused.map((r) => (
            <AppText key={`r${r.line}`} variant="small" tone="danger">
              {t('importStudents.line', { line: r.line })} · {t(`importErrors.${r.problem ?? 'row_failed'}`)}
            </AppText>
          ))}
          {saved.slice(0, PREVIEW_ROWS).map((r) => (
            <AppText key={`s${r.line}`} variant="small">
              {t('importStudents.savedLine', { line: r.line, roll: r.rollNo })}
            </AppText>
          ))}
          {saved.length > PREVIEW_ROWS ? (
            <AppText variant="small" tone="muted">
              {t('importStudents.andMore', { count: saved.length - PREVIEW_ROWS })}
            </AppText>
          ) : null}
          <Button icon="students" label={t('importStudents.openDatabase')} onPress={() => goBackOr('/staff/database')} />
          {saved.length > 0 ? <UndoImport importId={importId()} count={saved.length} onDone={() => void loadRecent()} /> : null}
        </Section>
      ) : null}
    </Screen>
  );
}

/** Undo of one import (#326): asks first, then says how many records went and which stayed, and why. */
function UndoImport({ importId, count, onDone }: { importId: string; count: number; onDone: () => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ deleted: number; kept: KeptRecord[] } | { errorKey: MessageKey } | null>(null);

  async function undo() {
    setBusy(true);
    const result = await undoImport(importId);
    setBusy(false);
    setAsking(false);
    setOutcome(result);
    if (!('errorKey' in result)) onDone();
  }

  if (outcome && !('errorKey' in outcome)) {
    return (
      <>
        <Notice tone="success">{t('importStudents.undoDone', { count: outcome.deleted })}</Notice>
        {outcome.kept.length > 0 ? <AppText tone="muted">{t('importStudents.undoKept', { count: outcome.kept.length })}</AppText> : null}
        {outcome.kept.map((k) => (
          <AppText key={k.rollNo} variant="small">
            {t('importStudents.keptLine', { roll: k.rollNo, name: k.fullName, reason: t(`studentTools.errors.${k.reason as 'student_linked'}`) })}
          </AppText>
        ))}
      </>
    );
  }
  return (
    <>
      {outcome && 'errorKey' in outcome ? <Notice tone="error">{t(outcome.errorKey)}</Notice> : null}
      {asking ? (
        <>
          <Notice tone="error" title={t('importStudents.undoAsk', { count })}>
            {t('importStudents.undoBody')}
          </Notice>
          <View style={styles.counts}>
            <Button icon="delete" label={t('importStudents.undoYes')} loading={busy} disabled={busy} onPress={() => void undo()} />
            <Button variant="link" label={t('syllabusEditor.cancel')} disabled={busy} onPress={() => setAsking(false)} />
          </View>
        </>
      ) : (
        <Button variant="link" icon="restore" label={t('importStudents.undoButton')} onPress={() => setAsking(true)} />
      )}
    </>
  );
}

/** The column map with `field` set to column `index` (-1 = none); a column fills one field only. */
function withColumn(columns: ColumnMap, field: ImportField, index: number): ColumnMap {
  const next: ColumnMap = {};
  for (const f of IMPORT_FIELDS) {
    if (f !== field && columns[f] !== undefined && columns[f] !== index) next[f] = columns[f];
  }
  if (index >= 0) next[field] = index;
  return next;
}

/** Spreadsheet letters of a column: 0 → A, 26 → AA. */
function columnLetter(index: number): string {
  let letters = '';
  let n = index + 1;
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const styles = StyleSheet.create({
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  previewRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: 2,
  },
});
