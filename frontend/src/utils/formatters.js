export function currency(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(number);
}

export function currencyPrecise(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export function signedCurrencyPrecise(value) {
  const number = Number(value || 0);
  if (number === 0) return currencyPrecise(0);
  return `${number > 0 ? '+' : '-'}${currencyPrecise(Math.abs(number))}`;
}

export function shortMonth(value) {
  if (!value) return 'Not projected';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
}

export function isoMonth(value) {
  if (!value) return '';
  return String(value).slice(0, 7);
}

export function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export function labelize(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
