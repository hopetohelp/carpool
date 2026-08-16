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

// ---------------------------------------------------------------- תאריך עברי

/**
 * מספר לאותיות עבריות: 1 → א׳, 15 → ט״ו, 30 → ל׳.
 *
 * חמש־עשרה ושש־עשרה נכתבות ט״ו וט״ז ולא י״ה וי״ו, כדי לא לכתוב צירופים
 * מהשם המפורש. זה לא קישוט — כך כותבים תאריך עברי, וכתיב אחר ייראה שגוי
 * למי שמכיר.
 */
export function hebrewNumber(n: number): string {
  if (n <= 0 || n > 400) return String(n);
  const parts: string[] = [];
  let left = n;
  const table: [number, string][] = [
    [400, "ת"], [300, "ש"], [200, "ר"], [100, "ק"],
    [90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"], [50, "נ"],
    [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"],
    [9, "ט"], [8, "ח"], [7, "ז"], [6, "ו"], [5, "ה"],
    [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"],
  ];
  if (left === 15) return 'ט"ו';
  if (left === 16) return 'ט"ז';
  for (const [value, letter] of table) {
    while (left >= value) { parts.push(letter); left -= value; }
  }
  if (parts.length === 1) return parts[0] + "׳";
  return parts.slice(0, -1).join("") + '"' + parts[parts.length - 1];
}

// לוח השנה העברי מגיע מהדפדפן עצמו, ולכן שנים מעוברות ואדר א׳/ב׳ נכונים
// בלי שנצטרך לתחזק טבלה. נשמר בין קריאות כי הוא נבנה מחדש בכל כרטיס.
const hebFormatter = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", {
  day: "numeric", month: "long",
});

/** תאריך עברי מקוצר: "ח׳ באלול" */
export function hebrewDate(iso: string): string {
  try {
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    const parts = hebFormatter.formatToParts(d);
    const day = Number(parts.find((p) => p.type === "day")?.value ?? 0);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    if (!day || !month) return "";
    return `${hebrewNumber(day)} ב${month}`;
  } catch {
    return "";   // דפדפן בלי לוח עברי — פשוט לא מציגים
  }
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
