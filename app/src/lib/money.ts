// Amounts of money as text. The database keeps whole minor units (paise for INR, cents for USD)
// with an ISO 4217 code per amount (fund_entries.currency, migration 0033; docs/I18N.md).
// Rupees keep the class's own way in every language: ₹ with Indian grouping (1,25,000.50), as
// since the fund was built. Other currencies use Intl for the app's language and the class's
// country, e.g. "$1,250.50" in the US.

import { intlLocale } from './dates';

/** Minor units of `minor` rupees as "₹1,25,000.50"; whole rupees without ".00". */
function rupees(minor: number): string {
  const digits = String(Math.floor(minor / 100));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  const fraction = minor % 100 ? `.${String(minor % 100).padStart(2, '0')}` : '';
  return `₹${grouped}${fraction}`;
}

/** An amount in another currency through Intl; "USD 1250.50" when the phone cannot format it. */
function otherCurrency(minor: number, currency: string): string {
  try {
    const format = new Intl.NumberFormat(intlLocale(), { style: 'currency', currency });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(minor / 10 ** digits);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/**
 * Whole minor units as money: formatMoney(125050) → "₹1,250.50", formatMoney(200000) → "₹2,000".
 * `signed` adds + or -; a negative amount always shows -.
 */
export function formatMoney(minor: number, currency = 'INR', signed = false): string {
  const abs = Math.abs(Math.round(minor));
  const sign = minor < 0 ? '-' : signed && minor > 0 ? '+' : '';
  return `${sign}${currency === 'INR' ? rupees(abs) : otherCurrency(abs, currency)}`;
}
