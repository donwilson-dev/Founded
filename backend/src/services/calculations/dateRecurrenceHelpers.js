const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_PROJECTION_MONTHS = 25 * 12;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value !== 'string') {
    throw new TypeError('Expected a Date or YYYY-MM-DD date string.');
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TypeError(`Invalid ISO date: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new TypeError(`Invalid ISO date: ${value}`);
  }

  return parsed;
}

function formatDate(value) {
  const parsed = parseDate(value);
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

function firstOfMonth(value) {
  const parsed = parseDate(value);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}

function addMonths(value, months) {
  const parsed = parseDate(value);
  const monthCount = Number(months);
  const monthIndex = parsed.getUTCMonth() + monthCount;
  const year = parsed.getUTCFullYear() + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12;
  return new Date(Date.UTC(year, normalizedMonth, 1));
}

function lastOfMonth(value) {
  const nextMonth = addMonths(firstOfMonth(value), 1);
  return new Date(nextMonth.getTime() - MS_PER_DAY);
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function yearlyOccurrenceDate(anchorDate, year) {
  const anchor = parseDate(anchorDate);
  const monthIndex = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  const normalizedDay = Math.min(day, lastDayOfMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, normalizedDay));
}

function isYearlyEndDateAnchored(startDate, endDate) {
  if (!startDate || !endDate) return true;
  const end = parseDate(endDate);
  return formatDate(yearlyOccurrenceDate(startDate, end.getUTCFullYear())) === formatDate(end);
}

function inclusiveMonthCount(start, end) {
  const startMonth = firstOfMonth(start);
  const endMonth = firstOfMonth(end);
  return (
    (endMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12 +
    (endMonth.getUTCMonth() - startMonth.getUTCMonth()) +
    1
  );
}

function monthRange(startMonth, months = null, endMonth = null) {
  if (months && typeof months === 'object') {
    endMonth = months.endMonth ?? months.end_month ?? null;
    months = months.months ?? null;
  }

  const start = firstOfMonth(startMonth);

  if (endMonth) {
    let end = firstOfMonth(endMonth);
    const maxEnd = addMonths(start, MAX_PROJECTION_MONTHS - 1);
    if (end > maxEnd) {
      end = maxEnd;
    }

    const result = [];
    let current = start;
    while (current <= end) {
      result.push(current);
      current = addMonths(current, 1);
    }
    return result;
  }

  const count = Math.min(Number(months) || 60, MAX_PROJECTION_MONTHS);
  const result = [];
  for (let index = 0; index < count; index += 1) {
    result.push(addMonths(start, index));
  }
  return result;
}

function normalizedFrequency(value, defaultValue = 'monthly') {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return String(value);
}

function maxDate(left, right) {
  return left > right ? left : right;
}

function minDate(left, right) {
  return left < right ? left : right;
}

function daysBetween(start, end) {
  return Math.trunc((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function occurrenceDatesForMonth(frequency, startDate, endDate, month, options = {}) {
  const active = options.active ?? true;
  if (!active) {
    return [];
  }

  const normalized = normalizedFrequency(frequency);
  const start = parseDate(startDate);
  const end = endDate ? parseDate(endDate) : null;
  const monthStart = firstOfMonth(month);
  const monthEnd = lastOfMonth(monthStart);
  const rangeStart = maxDate(start, monthStart);
  const rangeEnd = minDate(end || monthEnd, monthEnd);

  if (rangeStart > rangeEnd) {
    return [];
  }

  if (normalized === 'one_time') {
    return monthStart <= start && start <= monthEnd && (!end || start <= end) ? [start] : [];
  }

  if (normalized === 'monthly') {
    return [rangeStart];
  }

  if (normalized === 'yearly') {
    const candidate = yearlyOccurrenceDate(start, monthStart.getUTCFullYear());
    return rangeStart <= candidate && candidate <= rangeEnd ? [candidate] : [];
  }

  if (normalized === 'weekly' || normalized === 'bi_weekly') {
    const intervalDays = normalized === 'weekly' ? 7 : 14;
    const daysAfterAnchor = Math.max(daysBetween(start, rangeStart), 0);
    const occurrenceOffset = Math.ceil(daysAfterAnchor / intervalDays) * intervalDays;
    const firstOccurrence = new Date(start.getTime() + occurrenceOffset * MS_PER_DAY);

    if (firstOccurrence > rangeEnd) {
      return [];
    }

    const occurrences = [];
    let current = firstOccurrence;
    while (current <= rangeEnd) {
      occurrences.push(current);
      current = new Date(current.getTime() + intervalDays * MS_PER_DAY);
    }
    return occurrences;
  }

  if (normalized === 'first_and_fifteenth') {
    const candidates = [
      monthStart,
      new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 15)),
    ];
    return candidates.filter((candidate) => rangeStart <= candidate && candidate <= rangeEnd);
  }

  return [rangeStart];
}

function occurrenceCountForMonth(frequency, startDate, endDate, month, options = {}) {
  return occurrenceDatesForMonth(frequency, startDate, endDate, month, options).length;
}

function isActiveForMonth(item, month) {
  return (
    occurrenceCountForMonth(
      item.frequency ?? 'monthly',
      item.start_date,
      item.end_date || item.payoff_target_date || null,
      month,
      { active: item.active ?? true },
    ) > 0
  );
}

module.exports = {
  MAX_PROJECTION_MONTHS,
  parseDate,
  formatDate,
  firstOfMonth,
  addMonths,
  lastOfMonth,
  yearlyOccurrenceDate,
  isYearlyEndDateAnchored,
  inclusiveMonthCount,
  monthRange,
  normalizedFrequency,
  occurrenceDatesForMonth,
  occurrenceCountForMonth,
  isActiveForMonth,
};
