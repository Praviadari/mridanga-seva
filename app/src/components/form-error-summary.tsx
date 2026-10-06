// A red note beside a long form's submit button when the form was refused for its own fields:
// the messages sit under each field, often scrolled out of view, so without it the button seems
// to do nothing (DECISIONS #105). Screen readers hear it too (Notice announces errors).

import { useTranslation } from 'react-i18next';

import { Notice } from './notice';

/** Props for FormErrorSummary. */
export type FormErrorSummaryProps = {
  /** The form's error object: one entry per field, empty or undefined when the field is fine. */
  errors: object;
};

/** Shows "Check the fields marked in red above." while any field has an error; nothing otherwise. */
export function FormErrorSummary({ errors }: FormErrorSummaryProps) {
  const { t } = useTranslation();
  const count = Object.values(errors).filter(Boolean).length;
  if (count === 0) return null;
  return <Notice tone="error">{t('common.fixFieldsAbove', { count })}</Notice>;
}
