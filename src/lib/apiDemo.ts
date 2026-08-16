import type {
  AppNotification, Balance, Booking, Charge, Member, MemberContact,
  Org, Payment, Ride, RideTemplate, Settlement, Stop,
} from "./types";
import { buildDemoState, DEMO_ME_ID, DEMO_ORG_ID } from "./demoData";
import type { DemoState } from "./demoData";

// ============================================================================
// מצב הדגמה — הכל בדפדפן
//
// אותן פונקציות כמו הגישה האמיתית לנתונים, אבל מעל מערך בזיכרון במקום מעל
// מסד נתונים. שום פנייה לרשת, שום שורה שנשמרת, ושום חשבון שנוצר.
//
// למה זה חשוב ולא רק נחמד: בהדגמה שרצה על מסד נתונים אמיתי, כל מי שנכנס
// לנסות נרשם כחבר בארגון — ומאותו רגע כל שאר המנסים רואים את שמו, ואם
// נסעו יחד גם את הטלפון שלו. כאן כל מבקר מקבל עותק נפרד שנמחק כשסוגרים
// את הכרטיסייה, ואף אחד לא רואה אף אחד.
//
// המצב נשמר ב-sessionStorage כדי שרענון דף לא יאפס את מה שניסית, אבל הוא
// לא עובר בין כרטיסיות ולא שורד סגירת דפדפן.
// ============================================================================

const KEY = "carpool-demo-state";

let state: DemoState = load();

function load(): DemoState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch { /* אחסון חסום או פגום — מתחילים מחדש */ }
  return buildDemoState();
}

function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* לא קריטי */ }
}

/** מאפס את ההדגמה למצב ההתחלתי */
export function resetDemo() {
  state = buildDemoState();
  save();
}

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ok = <T,>(v: T): Promise<T> => Promise.resolve(clone(v));

const memberName = (id: string) => state.members.find((m) => m.id === id)?.name ?? "חבר";

function notify(kind: string, title: string, body: string | null, link: string | null) {
  state.notifications.unshift({
    id: uid("n"), kind, title, body, link, read_at: null, created_at: now(),
  });
}

// ------------------------------------------------------------------ זהות

export async function loadMe(): Promise<{ member: Member; org: Org } | null> {
  const me = state.members.find((m) => m.id === DEMO_ME_ID)!;
  return ok({ member: me, org: state.org });
}

// ------------------------------------------------------------------ חברים

export const listMembers = async (): Promise<Member[]> => ok(state.members);
export const listContacts = async (): Promise<MemberContact[]> => ok(state.contacts);

export const upsertMyContact = async (
  memberId: string, _orgId: string, c: Partial<MemberContact>,
) => {
  const existing = state.contacts.find((x) => x.member_id === memberId);
  if (existing) Object.assign(existing, c);
  else state.contacts.push({ member_id: memberId, phone: null, email: null, pay_note: null, ...c });
  save();
  return ok(null);
};

export const updateMember = async (id: string, patch: Partial<Member>) => {
  const m = state.members.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
  save();
  return ok(m);
};

// ------------------------------------------------------------- נקודות איסוף

export const listStops = async (): Promise<Stop[]> =>
  ok(state.stops.filter((s) => s.active).sort((a, b) => a.sort - b.sort));

export const createStop = async (_orgId: string, name: string, address?: string) => {
  state.stops.push({
    id: uid("s"), org_id: DEMO_ORG_ID, name, address: address ?? null,
    sort: state.stops.length + 1, active: true,
  });
  save();
  return ok(null);
};

export const deleteStop = async (id: string) => {
  const s = state.stops.find((x) => x.id === id);
  if (s) s.active = false;
  save();
  return ok(null);
};

// ----------------------------------------------------------------- נסיעות

export async function listRides(fromDate: string, toDate: string): Promise<Ride[]> {
  return ok(
    state.rides
      .filter((r) => r.ride_date >= fromDate && r.ride_date <= toDate && r.status !== "cancelled")
      .sort((a, b) => a.departs_at.localeCompare(b.departs_at)),
  );
}

export const getRide = async (id: string): Promise<Ride> =>
  ok(state.rides.find((r) => r.id === id)!);

export const listBookingsForRides = async (rideIds: string[]): Promise<Booking[]> =>
  ok(state.bookings.filter((b) => rideIds.includes(b.ride_id)));

export const myBookings = async (memberId: string): Promise<Booking[]> =>
  ok(state.bookings.filter((b) => b.passenger_id === memberId));

export async function createRide(input: {
  org_id: string; driver_id: string; ride_date: string; depart_time: string;
  direction: Ride["direction"]; seats_total: number; price: number;
  origin_stop_id?: string | null; origin_text?: string | null;
  dest_text?: string | null; auto_approve?: boolean; notes?: string | null;
}) {
  const at = new Date(`${input.ride_date}T${input.depart_time}:00`);
  const r: Ride = {
    id: uid("r"), org_id: DEMO_ORG_ID, driver_id: input.driver_id, template_id: null,
    ride_date: input.ride_date, depart_time: input.depart_time, departs_at: at.toISOString(),
    direction: input.direction, origin_stop_id: input.origin_stop_id ?? null,
    origin_text: input.origin_text ?? null, dest_text: input.dest_text ?? null,
    seats_total: input.seats_total, seats_taken: 0, price: input.price,
    auto_approve: !!input.auto_approve, status: "open", notes: input.notes ?? null,
  };
  state.rides.push(r);
  save();
  return ok(r);
}

export const updateRide = async (id: string, patch: Partial<Ride>) => {
  const r = state.rides.find((x) => x.id === id);
  if (r) Object.assign(r, patch);
  save();
  return ok(r);
};

// ---------------------------------------------------------------- הרשמות

export const requestBooking = async (
  rideId: string, seats = 1, stopId?: string | null, note?: string,
) => {
  const ride = state.rides.find((r) => r.id === rideId);
  if (!ride) throw new Error("הנסיעה לא נמצאה");
  if (ride.status === "locked" || ride.status === "closed") {
    throw new Error("הנסיעה כבר נסגרה להצטרפות");
  }
  const full = ride.seats_taken + seats > ride.seats_total;
  const status: Booking["status"] = full ? "waitlisted" : ride.auto_approve ? "approved" : "requested";

  state.bookings.push({
    id: uid("b"), org_id: DEMO_ORG_ID, ride_id: rideId, passenger_id: DEMO_ME_ID,
    seats, pickup_stop_id: stopId ?? null, status, source: "app",
    note: note ?? null, created_at: now(),
  });
  if (status === "approved") {
    ride.seats_taken += seats;
    if (ride.seats_taken >= ride.seats_total) ride.status = "full";
    notify("booking_approved", "ההצטרפות אושרה", `לנסיעה של ${memberName(ride.driver_id)}`, `/ride/${rideId}`);
  } else if (status === "waitlisted") {
    notify("booking_waitlist", "נכנסת לרשימת המתנה", "אם מישהו יבטל, תיכנס אוטומטית", `/ride/${rideId}`);
  }
  save();
  return ok(null);
};

export const decideBooking = async (bookingId: string, approve: boolean, reason?: string) => {
  const b = state.bookings.find((x) => x.id === bookingId);
  if (!b) throw new Error("ההרשמה לא נמצאה");
  const ride = state.rides.find((r) => r.id === b.ride_id)!;

  if (approve) {
    if (ride.seats_taken + b.seats > ride.seats_total) throw new Error("אין מספיק מקומות פנויים");
    b.status = "approved";
    ride.seats_taken += b.seats;
    if (ride.seats_taken >= ride.seats_total) ride.status = "full";
    notify("booking_approved", `אישרת את ${memberName(b.passenger_id)}`, null, `/ride/${ride.id}`);
  } else {
    b.status = "rejected";
    b.note = reason ?? b.note;
    notify("booking_rejected", `דחית את ${memberName(b.passenger_id)}`, reason ?? null, `/ride/${ride.id}`);
  }
  save();
  return ok(null);
};

export const cancelBooking = async (bookingId: string) => {
  const b = state.bookings.find((x) => x.id === bookingId);
  if (!b) throw new Error("ההרשמה לא נמצאה");
  const ride = state.rides.find((r) => r.id === b.ride_id)!;
  const wasApproved = b.status === "approved";
  b.status = "cancelled";

  if (wasApproved) {
    ride.seats_taken = Math.max(0, ride.seats_taken - b.seats);
    if (ride.status === "full") ride.status = "open";

    // קידום הראשון ברשימת ההמתנה, בדיוק כמו במסד
    const next = state.bookings
      .filter((x) => x.ride_id === ride.id && x.status === "waitlisted")
      .sort((a, c) => a.created_at.localeCompare(c.created_at))[0];
    if (next && ride.seats_taken + next.seats <= ride.seats_total) {
      next.status = "approved";
      ride.seats_taken += next.seats;
      if (ride.seats_taken >= ride.seats_total) ride.status = "full";
      notify("waitlist_promoted", `${memberName(next.passenger_id)} נכנס מרשימת ההמתנה`, null, `/ride/${ride.id}`);
    }
  }
  save();
  return ok(null);
};

export const closeRide = async (rideId: string, attended?: string[] | null) => {
  const ride = state.rides.find((r) => r.id === rideId);
  if (!ride) throw new Error("הנסיעה לא נמצאה");
  const approved = state.bookings.filter((b) => b.ride_id === rideId && b.status === "approved");

  for (const b of approved) {
    const rode = !attended || attended.includes(b.passenger_id);
    b.status = rode ? "rode" : "no_show";
    if (rode && b.passenger_id !== ride.driver_id) {
      state.charges.push({
        id: uid("c"), ride_id: ride.id, booking_id: b.id,
        payer_id: b.passenger_id, payee_id: ride.driver_id,
        amount: ride.price, kind: "ride", note: null, created_at: now(),
      });
    }
  }
  ride.status = "closed";
  notify("charge_created", "הנסיעה נסגרה", `נוצרו חיובים לפי ${ride.price} ₪ לנוסע`, "/money");
  save();
  return ok(null);
};

export const cancelRide = async (rideId: string, reason?: string) => {
  const ride = state.rides.find((r) => r.id === rideId);
  if (!ride) throw new Error("הנסיעה לא נמצאה");
  ride.status = "cancelled";
  for (const b of state.bookings.filter((x) => x.ride_id === rideId)) {
    if (b.status === "approved" || b.status === "requested" || b.status === "waitlisted") {
      b.status = "cancelled";
    }
  }
  notify("ride_cancelled", "הנסיעה בוטלה", reason ?? null, null);
  save();
  return ok(null);
};

export const logManualRide = async (
  driverId: string, passengerId: string, _date: string, price: number, note?: string,
) => {
  state.charges.push({
    id: uid("c"), ride_id: null, booking_id: null,
    payer_id: passengerId, payee_id: driverId, amount: price,
    kind: "manual", note: note ?? null, created_at: now(),
  });
  notify("manual_ride", "נסיעה נרשמה ידנית", `${price} ₪ ל${memberName(driverId)}`, "/money");
  save();
  return ok(null);
};

// ----------------------------------------------------------------- כספים

export const markPayment = async (
  payeeId: string, amount: number, method: Payment["method"], reference?: string, note?: string,
) => {
  state.payments.push({
    id: uid("p"), payer_id: DEMO_ME_ID, payee_id: payeeId, amount,
    method, reference: reference ?? null, status: "marked", note: note ?? null,
    dispute_reason: null, marked_at: now(), confirmed_at: null, auto_confirmed: false,
  });
  notify("payment_marked", "סימנת תשלום", `${amount} ₪ ל${memberName(payeeId)}, ממתין לאישורו`, "/money");
  save();
  return ok(null);
};

export const confirmPayment = async (paymentId: string) => {
  const p = state.payments.find((x) => x.id === paymentId);
  if (!p) throw new Error("התשלום לא נמצא");
  p.status = "confirmed";
  p.confirmed_at = now();
  notify("payment_confirmed", "אישרת קבלת תשלום", `${p.amount} ₪ מ${memberName(p.payer_id)}`, "/money");
  save();
  return ok(null);
};

export const disputePayment = async (paymentId: string, reason: string) => {
  const p = state.payments.find((x) => x.id === paymentId);
  if (!p) throw new Error("התשלום לא נמצא");
  p.status = "disputed";
  p.dispute_reason = reason;
  notify("payment_disputed", "סימנת שלא קיבלת", reason, "/money");
  save();
  return ok(null);
};

export const closeMonth = async (start: string, end: string) => {
  const balances = computeBalances().filter((b) => b.owed > 0);
  for (const b of balances) {
    state.settlements.push({
      id: uid("st"), period_start: start, period_end: end,
      payer_id: b.payer_id, payee_id: b.payee_id, amount: b.owed,
      rides_count: state.charges.filter(
        (c) => c.payer_id === b.payer_id && c.payee_id === b.payee_id,
      ).length,
      status: "open",
    });
  }
  notify("settlement", "החודש נסגר", `נוצרו ${balances.length} דפי חשבון`, "/money");
  save();
  return ok(null);
};

function computeBalances(): Balance[] {
  const key = (a: string, b: string) => `${a}|${b}`;
  const map = new Map<string, Balance>();

  const touch = (payer: string, payee: string) => {
    const k = key(payer, payee);
    if (!map.has(k)) {
      map.set(k, {
        org_id: DEMO_ORG_ID, payer_id: payer, payee_id: payee,
        charged: 0, paid: 0, pending: 0, owed: 0,
      });
    }
    return map.get(k)!;
  };

  for (const c of state.charges) touch(c.payer_id, c.payee_id).charged += Number(c.amount);
  for (const p of state.payments) {
    const b = touch(p.payer_id, p.payee_id);
    if (p.status === "confirmed") b.paid += Number(p.amount);
    else if (p.status === "marked") b.pending += Number(p.amount);
  }
  for (const b of map.values()) b.owed = Math.max(0, b.charged - b.paid - b.pending);
  return [...map.values()].filter((b) => b.charged > 0 || b.paid > 0 || b.pending > 0);
}

export const listBalances = async (): Promise<Balance[]> => ok(computeBalances());
export const listCharges = async (): Promise<Charge[]> => ok(state.charges);
export const listPayments = async (): Promise<Payment[]> => ok(state.payments);
export const listSettlements = async (): Promise<Settlement[]> => ok(state.settlements);

// ------------------------------------------------------------ נסיעות קבועות

export const listTemplates = async (): Promise<RideTemplate[]> =>
  ok(state.templates.filter((t) => t.active));

export async function createTemplate(input: Omit<RideTemplate, "id" | "active">) {
  const t: RideTemplate = { ...input, id: uid("t"), active: true };
  state.templates.push(t);
  save();
  return ok(t);
}

export const deactivateTemplate = async (id: string) => {
  const t = state.templates.find((x) => x.id === id);
  if (t) t.active = false;
  save();
  return ok(null);
};

/** מקבילה להדגמה: משנה את התבנית, ומיישר איתה את הנסיעות העתידיות שממנה */
export const updateTemplate = async (
  templateId: string,
  patch: {
    days?: number[]; time?: string; seats?: number; price?: number;
    stopId?: string | null; dest?: string | null; autoApprove?: boolean;
  },
  applyToFuture = true,
) => {
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return ok(0);
  if (patch.days !== undefined) t.days_of_week = patch.days;
  if (patch.time !== undefined) t.depart_time = patch.time;
  if (patch.seats !== undefined) t.seats_total = patch.seats;
  if (patch.price !== undefined) t.price = patch.price;
  if (patch.stopId !== undefined) t.origin_stop_id = patch.stopId;
  if (patch.dest !== undefined) t.dest_text = patch.dest;
  if (patch.autoApprove !== undefined) t.auto_approve = patch.autoApprove;

  let updated = 0;
  if (applyToFuture) {
    for (const r of state.rides) {
      if (r.template_id !== templateId) continue;
      if (new Date(r.departs_at).getTime() <= Date.now()) continue;
      if (!["open", "full"].includes(r.status)) continue;
      const dow = new Date(r.ride_date).getDay();
      if (!t.days_of_week.includes(dow)) { r.status = "cancelled"; continue; }
      r.depart_time = t.depart_time;
      r.seats_total = Math.max(t.seats_total, r.seats_taken);
      r.price = t.price;
      r.origin_stop_id = t.origin_stop_id;
      r.dest_text = t.dest_text;
      r.auto_approve = t.auto_approve;
      updated++;
    }
  }
  save();
  return ok(updated);
};

export const subscribeToTemplate = async (
  _orgId: string, templateId: string, memberId: string, _stopId?: string | null,
) => {
  if (!state.subscriptions.some((s) => s.template_id === templateId && s.member_id === memberId)) {
    state.subscriptions.push({ template_id: templateId, member_id: memberId });
  }
  save();
  return ok(null);
};

export const unsubscribeFromTemplate = async (templateId: string, memberId: string) => {
  state.subscriptions = state.subscriptions.filter(
    (s) => !(s.template_id === templateId && s.member_id === memberId),
  );
  save();
  return ok(null);
};

export const listMySubscriptions = async (memberId: string) =>
  ok(state.subscriptions.filter((s) => s.member_id === memberId));

// --------------------------------------------------------- אישור אוטומטי

export const listTrusted = async (driverId: string) =>
  ok(state.trusted.filter((t) => t.driver_id === driverId));

export const addTrusted = async (_orgId: string, driverId: string, passengerId: string) => {
  if (!state.trusted.some((t) => t.driver_id === driverId && t.passenger_id === passengerId)) {
    state.trusted.push({ driver_id: driverId, passenger_id: passengerId });
  }
  save();
  return ok(null);
};

export const removeTrusted = async (driverId: string, passengerId: string) => {
  state.trusted = state.trusted.filter(
    (t) => !(t.driver_id === driverId && t.passenger_id === passengerId),
  );
  save();
  return ok(null);
};

// ----------------------------------------------------------------- התראות

export const listNotifications = async (): Promise<AppNotification[]> => ok(state.notifications);

export const markNotificationRead = async (id: string) => {
  const n = state.notifications.find((x) => x.id === id);
  if (n) n.read_at = now();
  save();
  return ok(null);
};

export async function markAllNotificationsRead(_memberId: string) {
  for (const n of state.notifications) if (!n.read_at) n.read_at = now();
  save();
  return ok(null);
}

/** בהדגמה אין שרת שידחוף עדכונים, ולכן אין למה להירשם */
export function onNewNotification(_memberId: string, _cb: (n: AppNotification) => void) {
  return () => {};
}
export function onRideActivity(_orgId: string, _cb: () => void) {
  return () => {};
}

// ----------------------------------------------------------------- ארגון

export const updateOrgSettings = async (_orgId: string, settings: Record<string, unknown>) => {
  state.org.settings = { ...state.org.settings, ...(settings as object) };
  save();
  return ok(state.org);
};
