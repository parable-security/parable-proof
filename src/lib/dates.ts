// Review dates are calendar dates in one business timezone, so the date shown
// on the form matches the date stored (the DB's current_date is UTC).
const BUSINESS_TIME_ZONE = "America/New_York";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Today as YYYY-MM-DD in the business timezone. Reads the clock: call only
// at request time (after requireUser(), which calls connection()).
export function todayInBusinessTz(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

// "2026-10-26" -> "October 26, 2026". Parsed by hand so no timezone shift.
export function formatReviewDate(isoDate: string): string {
  const { year, month, day } = parseIsoDate(isoDate);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

// A stored instant in the business timezone, e.g. "Oct 26, 2026, 2:30 PM EDT".
export function formatTimestamp(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}

// "2026-10-26" -> "October 2026 AI Policy Check"
export function defaultReviewName(isoDate: string): string {
  const { year, month } = parseIsoDate(isoDate);
  return `${MONTHS[month - 1]} ${year} AI Policy Check`;
}
