import type { Ride, Member, Stop } from "./types";
import { friendlyDate, shortTime, directionLabel, money } from "./format";

// ============================================================================
// שיתוף החוצה: וואטסאפ ויומן.
// שני הערוצים האלה עובדים בלי שרת ובלי הרשמה לשום שירות — הדפדפן פשוט
// מכין הודעה או קובץ יומן ומעביר אותם לאפליקציה שכבר מותקנת בטלפון.
// ============================================================================

/** מנקה מספר ישראלי לפורמט בינלאומי, כפי שוואטסאפ מצפה */
export function toIntlPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function whatsappLink(text: string, phone?: string | null): string {
  const encoded = encodeURIComponent(text);
  return phone
    ? `https://wa.me/${toIntlPhone(phone)}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function rideMessage(ride: Ride, driver?: Member, stop?: Stop | null): string {
  const lines = [
    `🚗 נסיעה ${directionLabel(ride.direction)}`,
    `${friendlyDate(ride.ride_date)} בשעה ${shortTime(ride.depart_time)}`,
  ];
  if (driver) lines.push(`נהג: ${driver.name}`);
  const from = stop?.name ?? ride.origin_text;
  if (from) lines.push(`יציאה מ: ${from}`);
  if (ride.dest_text) lines.push(`יעד: ${ride.dest_text}`);
  lines.push(`מקומות פנויים: ${Math.max(0, ride.seats_total - ride.seats_taken)}`);
  if (ride.price > 0) lines.push(`מחיר: ${money(ride.price)}`);
  if (ride.notes) lines.push(`הערה: ${ride.notes}`);
  return lines.join("\n");
}

export function debtReminderMessage(
  passengerName: string, amount: number, ridesCount: number, payNote?: string | null,
): string {
  const lines = [
    `היי ${passengerName},`,
    `תזכורת ידידותית על ${ridesCount} נסיעות — סה"כ ${money(amount)}.`,
  ];
  if (payNote) lines.push(`אפשר להעביר ל: ${payNote}`);
  lines.push("אחרי ההעברה כדאי לסמן בכלי שהעברת, ואני אאשר. תודה!");
  return lines.join("\n");
}

export function paymentThanksMessage(amount: number): string {
  return `קיבלתי ${money(amount)}, תודה! סימנתי שאושר בכלי.`;
}

// ---------- יומן ----------

function icsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** קובץ יומן לנסיעה אחת, עם תזכורת 30 דקות לפני */
export function rideToIcs(ride: Ride, driver?: Member, stop?: Stop | null): string {
  const start = new Date(ride.departs_at);
  const end = new Date(start.getTime() + 45 * 60000);
  const from = stop?.name ?? ride.origin_text ?? "";
  const title = `נסיעה ${directionLabel(ride.direction)}${driver ? ` עם ${driver.name}` : ""}`;
  const desc = [
    from && `יציאה מ: ${from}`,
    ride.dest_text && `יעד: ${ride.dest_text}`,
    ride.price > 0 && `מחיר: ${money(ride.price)}`,
    ride.notes,
  ].filter(Boolean).join("\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//carpool//HE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ride.id}@carpool`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeIcs(title)}`,
    desc && `DESCRIPTION:${escapeIcs(desc)}`,
    from && `LOCATION:${escapeIcs(from)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

export function downloadIcs(ride: Ride, driver?: Member, stop?: Stop | null) {
  const blob = new Blob([rideToIcs(ride, driver, stop)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `נסיעה-${ride.ride_date}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** קישור להוספה ליומן גוגל — עובד גם כשהורדת קובץ חסומה */
export function googleCalendarLink(ride: Ride, driver?: Member, stop?: Stop | null): string {
  const start = new Date(ride.departs_at);
  const end = new Date(start.getTime() + 45 * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `נסיעה ${directionLabel(ride.direction)}${driver ? ` עם ${driver.name}` : ""}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: ride.notes ?? "",
    location: stop?.name ?? ride.origin_text ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** ניווט לנקודת האיסוף באפליקציה שכבר מותקנת */
export function navigationLink(stopOrText: Stop | string | null | undefined): string | null {
  const q = typeof stopOrText === "string"
    ? stopOrText
    : stopOrText?.address || stopOrText?.name;
  if (!q) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}
