import type {
  AppNotification, Booking, Charge, Member, MemberContact, Org,
  Payment, Ride, RideTemplate, Settlement, Stop,
} from "./types";

// ============================================================================
// נתוני ההדגמה
//
// נבנים מחדש בכל פתיחה ביחס לתאריך של היום, כדי שההדגמה תמיד תיראה עדכנית.
// שום דבר כאן לא נשמר במסד הנתונים ולא נשלח לשום מקום.
// ============================================================================

const pad = (n: number) => String(n).padStart(2, "0");
const dateOnly = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function shift(days: number, time = "07:30") {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const [h, m] = time.split(":").map(Number);
  const at = new Date(d);
  at.setHours(h, m, 0, 0);
  return { date: dateOnly(d), time, iso: at.toISOString() };
}

/** המשתמש שמנסה את הכלי. מוגדר מנהל ונהג כדי שכל המסכים יהיו פתוחים לו. */
export const DEMO_ME_ID = "m-guest";
export const DEMO_ORG_ID = "org-demo";

export interface DemoState {
  org: Org;
  members: Member[];
  contacts: MemberContact[];
  stops: Stop[];
  rides: Ride[];
  bookings: Booking[];
  templates: RideTemplate[];
  charges: Charge[];
  payments: Payment[];
  settlements: Settlement[];
  notifications: AppNotification[];
  subscriptions: { template_id: string; member_id: string }[];
  trusted: { driver_id: string; passenger_id: string }[];
}

const member = (
  id: string, name: string, isDriver: boolean,
  role: Member["role"] = "member", status: Member["status"] = "active",
): Member => ({
  id, org_id: DEMO_ORG_ID, user_id: null, name, role, status,
  is_driver: isDriver, home_area: null, notify_email: true, notify_push: false,
});

export function buildDemoState(): DemoState {
  const d1 = shift(1, "07:30");
  const d1b = shift(1, "17:15");
  const d2 = shift(2, "07:30");
  const d3 = shift(3, "08:00");
  const past = shift(-2, "07:30");
  const past2 = shift(-5, "07:30");

  const members: Member[] = [
    member(DEMO_ME_ID, "אורח", true, "manager"),
    member("m-moshe", "משה פרידמן", true),
    member("m-shimon", "שמעון וייס", false),
    member("m-aharon", "אהרן רוזנברג", false),
    member("m-yaakov", "יעקב שטרן", true),
    member("m-naftali", "נפתלי גרוס", false, "member", "pending"),
  ];

  const contacts: MemberContact[] = [
    { member_id: DEMO_ME_ID, phone: "050-0000000", email: null, pay_note: "ביט לטלפון 050-0000000" },
    { member_id: "m-moshe", phone: "052-1112223", email: null, pay_note: "ביט 052-1112223" },
    { member_id: "m-shimon", phone: "053-4445556", email: null, pay_note: null },
    { member_id: "m-aharon", phone: "054-7778889", email: null, pay_note: null },
    { member_id: "m-yaakov", phone: "058-2223334", email: null, pay_note: "פייבוקס" },
  ];

  const stops: Stop[] = [
    { id: "s-1", org_id: DEMO_ORG_ID, name: "מרכז העיר", address: "רחוב הרצל 40", sort: 1, active: true },
    { id: "s-2", org_id: DEMO_ORG_ID, name: "צומת הכניסה", address: null, sort: 2, active: true },
    { id: "s-3", org_id: DEMO_ORG_ID, name: "שכונת הגפן", address: null, sort: 3, active: true },
  ];

  const ride = (
    id: string, driver: string, s: ReturnType<typeof shift>,
    dir: Ride["direction"], seatsTotal: number, taken: number,
    price: number, status: Ride["status"], stop: string | null, autoApprove = false,
  ): Ride => ({
    id, org_id: DEMO_ORG_ID, driver_id: driver, template_id: null,
    ride_date: s.date, depart_time: s.time, departs_at: s.iso,
    direction: dir, origin_stop_id: stop, origin_text: null,
    dest_text: dir === "to_work" ? "המשרד" : "הבית",
    seats_total: seatsTotal, seats_taken: taken, price,
    auto_approve: autoApprove, status, notes: null,
  });

  const rides: Ride[] = [
    ride("r-1", "m-moshe", d1, "to_work", 4, 2, 15, "open", "s-1"),
    ride("r-2", DEMO_ME_ID, d1b, "from_work", 3, 1, 15, "open", null),
    ride("r-3", "m-yaakov", d2, "to_work", 3, 3, 12, "full", "s-2", true),
    ride("r-4", "m-moshe", d3, "to_work", 4, 0, 15, "open", "s-1"),
    ride("r-5", "m-moshe", past, "to_work", 4, 2, 15, "closed", "s-1"),
    ride("r-6", "m-yaakov", past2, "to_work", 3, 1, 12, "closed", "s-2"),
  ];

  const booking = (
    id: string, rideId: string, passenger: string,
    status: Booking["status"], stop: string | null = null, daysAgo = 1,
  ): Booking => ({
    id, org_id: DEMO_ORG_ID, ride_id: rideId, passenger_id: passenger,
    seats: 1, pickup_stop_id: stop, status, source: "app", note: null,
    created_at: shift(-daysAgo).iso,
  });

  const bookings: Booking[] = [
    booking("b-1", "r-1", DEMO_ME_ID, "approved", "s-1"),
    booking("b-2", "r-1", "m-shimon", "approved", "s-1"),
    booking("b-3", "r-2", "m-aharon", "requested"),
    booking("b-4", "r-2", "m-shimon", "approved"),
    booking("b-5", "r-3", "m-aharon", "approved", "s-2"),
    booking("b-6", "r-3", "m-shimon", "approved", "s-2"),
    booking("b-7", "r-3", DEMO_ME_ID, "waitlisted", "s-2"),
    booking("b-8", "r-5", DEMO_ME_ID, "rode", "s-1", 2),
    booking("b-9", "r-5", "m-shimon", "rode", "s-1", 2),
    booking("b-10", "r-6", DEMO_ME_ID, "rode", "s-2", 5),
  ];

  const charges: Charge[] = [
    { id: "c-1", ride_id: "r-5", booking_id: "b-8", payer_id: DEMO_ME_ID, payee_id: "m-moshe",
      amount: 15, kind: "ride", note: null, created_at: shift(-2).iso },
    { id: "c-2", ride_id: "r-6", booking_id: "b-10", payer_id: DEMO_ME_ID, payee_id: "m-yaakov",
      amount: 12, kind: "ride", note: null, created_at: shift(-5).iso },
    { id: "c-3", ride_id: "r-5", booking_id: "b-9", payer_id: "m-shimon", payee_id: "m-moshe",
      amount: 15, kind: "ride", note: null, created_at: shift(-2).iso },
    { id: "c-4", ride_id: null, booking_id: null, payer_id: "m-aharon", payee_id: DEMO_ME_ID,
      amount: 30, kind: "manual", note: "שתי נסיעות שנרשמו ידנית", created_at: shift(-4).iso },
  ];

  const payments: Payment[] = [
    { id: "p-1", payer_id: DEMO_ME_ID, payee_id: "m-yaakov", amount: 12, method: "bit",
      reference: null, status: "confirmed", note: null, dispute_reason: null,
      marked_at: shift(-4).iso, confirmed_at: shift(-4).iso, auto_confirmed: false },
    { id: "p-2", payer_id: "m-aharon", payee_id: DEMO_ME_ID, amount: 30, method: "bit",
      reference: null, status: "marked", note: null, dispute_reason: null,
      marked_at: shift(-1).iso, confirmed_at: null, auto_confirmed: false },
  ];

  const templates: RideTemplate[] = [
    { id: "t-1", org_id: DEMO_ORG_ID, driver_id: "m-moshe", days_of_week: [0, 1, 2, 3, 4],
      depart_time: "07:30", direction: "to_work", origin_stop_id: "s-1", origin_text: null,
      dest_text: "המשרד", seats_total: 4, price: 15, auto_approve: false, active: true },
  ];

  const notifications: AppNotification[] = [
    { id: "n-1", kind: "booking_request", title: "אהרן רוזנברג מבקש להצטרף",
      body: "לנסיעה שלך מחר ב-17:15", link: "/ride/r-2", read_at: null, created_at: shift(0).iso },
    { id: "n-2", kind: "payment_marked", title: "אהרן רוזנברג סימן תשלום",
      body: "30 ₪ בביט, ממתין לאישור שלך", link: "/money", read_at: null, created_at: shift(-1).iso },
    { id: "n-3", kind: "booking_waitlist", title: "נכנסת לרשימת המתנה",
      body: "הנסיעה של יעקב שטרן מלאה", link: "/ride/r-3", read_at: shift(-1).iso, created_at: shift(-1).iso },
    { id: "n-4", kind: "charge_created", title: "נוצר חיוב חדש",
      body: "15 ₪ למשה פרידמן", link: "/money", read_at: shift(-2).iso, created_at: shift(-2).iso },
  ];

  return {
    org: {
      id: DEMO_ORG_ID, name: "צוות ההדגמה", join_code: "DEMO",
      settings: {
        currency: "₪", timezone: "Asia/Jerusalem", default_price: 15, max_price_per_km: 2.5,
        cost_per_km: 1.9, co2_kg_per_km: 0.19, cancel_deadline_hours: 3, cancel_charge_pct: 100,
        payment_due_days: 14, auto_confirm_days: 7, lock_ride_hours_before: 2,
        publish_weeks_ahead: 4, auto_approve_members: false,
      },
    },
    members, contacts, stops, rides, bookings, templates,
    charges, payments, settlements: [], notifications,
    subscriptions: [{ template_id: "t-1", member_id: DEMO_ME_ID }],
    trusted: [{ driver_id: DEMO_ME_ID, passenger_id: "m-shimon" }],
  };
}
