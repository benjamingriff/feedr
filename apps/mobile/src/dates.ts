// Dates are 'YYYY-MM-DD' strings in the phone's local time, the same form the API uses.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const today = () => iso(new Date());

// Noon, so adding days never lands on the wrong date across a clock change.
const asDate = (day: string) => new Date(`${day}T12:00:00`);

export function addDays(day: string, offset: number) {
  const d = asDate(day);
  d.setDate(d.getDate() + offset);
  return iso(d);
}

/** The Monday of the week a day falls in. */
export function monday(day: string) {
  return addDays(day, -((asDate(day).getDay() + 6) % 7));
}

/** "Monday" */
export const dayName = (day: string) => DAYS[asDate(day).getDay()]!;

/** "17 Nov" */
export function dayMonth(day: string) {
  const d = asDate(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Tue 18 Nov" */
export const shortDate = (day: string) => `${dayName(day).slice(0, 3)} ${dayMonth(day)}`;

/** "17–23 Nov", or "29 Sep–5 Oct" when the week spans two months. */
export function weekRange(start: string) {
  const end = addDays(start, 6);
  const sameMonth = asDate(start).getMonth() === asDate(end).getMonth();
  return `${sameMonth ? asDate(start).getDate() : dayMonth(start)}–${dayMonth(end)}`;
}

/** An API timestamp as "12 Nov". */
export const stampDate = (timestamp: string) => dayMonth(iso(new Date(timestamp)));
