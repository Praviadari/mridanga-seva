// G3 Excel import, the Guru only: choose an .xlsx or .csv file → match its columns to the app's
// fields (guessed from the headings) → preview with each row's problems (missing name, bad date,
// under 18, duplicate phone, email, roll number or student) → import only the good rows. The
// database gives each saved student a roll number, as for C2, and refuses a bad row on its own.
// Data: src/data/student-import.ts; rules: import_students in migration 0014 (DECISIONS #46).

import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
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
  guessColumns,
  IMPORT_FIELDS,
  importRows,
  importToday,
  pickSheet,
  REQUIRED_FIELDS,
  type ColumnMap,
  type ExistingStudents,
  type ImportField,
  type ImportResult,
  type PreviewRow,
} from '@/data/student-import';
import { levelName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { goBackOr } from '@/lib/go-back';
import type { SheetRows } from '@/lib/sheet-reader';
import { spacing, useTheme } from '@/theme/use-theme';

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
    const outcome = await importRows(good);
    setBusy(false);
    setAsking(false);
    setResults(outcome.results);
    if (outcome.errorKey) setErrorKey(outcome.errorKey);
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
      {errorKey ? <Notice tone="error">{t(errorKey as never)}</Notice> : null}

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
                <Notice tone="info" title={t('importStudents.askTitle', { count: good.length })}>
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
          <Notice tone={refused.length === 0 ? 'success' : 'info'}>
            {t('importStudents.doneLine', { saved: saved.length, refused: refused.length })}
          </Notice>
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
        </Section>
      ) : null}
    </Screen>
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
