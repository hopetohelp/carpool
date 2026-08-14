import type { RideDirection, BookingStatus, PaymentStatus, RideStatus } from "./types";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export const dayName = (d: number) => DAYS[d] ?? "";
export const dayShort = (d: number) => DAYS_SHORT[d] ?? "";

/** תאריך בפורמט ישראלי: 14/08 */
export function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "היום", "מחר", או "יום שלישי, 19/08" */
export function friendlyDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === 2) return "מחרתיים";
  if (diff === -1) return "אתמול";
  if (diff > 2 && diff < 7) return `יום ${dayName(d.getDay())}`;
  return `יום ${dayName(d.getDay())}, ${shortDate(isoDate)}`;
}

/** 07:30:00 -> 07:30 */
export const shortTime = (t: string) => t.slice(0, 5);

export function money(amount: number, currency = "₪"): string {
  const n = Number(amount ?? 0);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${s} ${currency}`;
}

export const directionLabel = (d: RideDirection) =>
  d === "to_work" ? "לעבודה" : "מהעבודה";

export const directionIcon = (d: RideDirection) => (d === "to_work" ? "→" : "←");

export const rideStatusLabel: Record<RideStatus, string> = {
  draft: "טיוטה",
  open: "פתוחה",
  full: "מלאה",
  locked: "נעולה",
  departed: "יצאה",
  finished: "הסתיימה",
  closed: "בהיסטוריה",
  cancelled: "בוטלה",
};

export const bookingStatusLabel: Record<BookingStatus, string> = {
  requested: "ממתין לאישור הנהג",
  approved: "מאושר",
  rejected: "נדחה",
  waitlisted: "ברשימת המתנה",
  cancelled: "בוטל",
  no_show: "לא הופיע",
  rode: "נסע",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  marked: "ממתין לאישור",
  confirmed: "אושר",
  disputed: "במחלוקת",
};

export const paymentMethodLabel: Record<string, string> = {
  bit: "ביט",
  paybox: "פייבוקס",
  cash: "מזומן",
  transfer: "העברה בנקאית",
  other: "אחר",
};

/** כמה זמן נשאר עד היציאה, בשפה אנושית */
export function untilDeparture(departsAt: string): string {
  const diff = new Date(departsAt).getTime() - Date.now();
  if (diff < 0) return "יצאה";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `בעוד ${mins} דקות`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `בעוד ${hours} שעות`;
  const days = Math.round(hours / 24);
  return `בעוד ${days} ימים`;
}

/** תאריך של יום בשבוע הנוכחי/הבא, לפורמט ISO */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** ראשון של השבוע שבו נמצא התאריך */
export function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() - c.getDay());
  return c;
}
