import { supabase } from "./supabase";
import type {
  Org, Member, MemberContact, Stop, Ride, Booking, RideTemplate,
  Charge, Payment, Balance, AppNotification, Settlement,
  PaymentMethod, RideDirection,
} from "./types";

// ============================================================================
// שכבת הגישה לנתונים.
//
// כלל: כל פעולה שמשנה סטטוס עוברת דרך פונקציה במסד הנתונים (rpc) ולא דרך
// עדכון ישיר, כדי שהכללים — מקומות פנויים, מדיניות ביטול, יצירת חיובים
// והתראות — ייאכפו במקום אחד ולא ייעקפו מהדפדפן.
// ============================================================================

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(translateError(error.message));
  return data as T;
}

/** הודעות שגיאה של מסד הנתונים בעברית ידידותית */
function translateError(msg: string): string {
  if (msg.includes("duplicate key")) return "כבר קיים רישום כזה.";
  if (msg.includes("violates row-level security")) return "אין לך הרשאה לפעולה הזו.";
  if (msg.includes("permission denied")) return "אין לך הרשאה לפעולה הזו.";
  return msg;
}

// ---------- זהות ----------

export async function loadMe(): Promise<{ member: Member; org: Org } | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const member = unwrap(
    await supabase.from("members").select("*").eq("user_id", auth.user.id).maybeSingle(),
  ) as Member | null;
  if (!member) return null;

  const org = unwrap(
    await supabase.from("orgs").select("*").eq("id", member.org_id).single(),
  ) as Org;
  return { member, org };
}

// ---------- חברים ----------

export const listMembers = async (): Promise<Member[]> =>
  unwrap(await supabase.from("members").select("*").order("name"));

export const listContacts = async (): Promise<MemberContact[]> =>
  unwrap(await supabase.from("member_contacts").select("*"));

export const upsertMyContact = async (memberId: string, orgId: string, c: Partial<MemberContact>) =>
  unwrap(
    await supabase.from("member_contacts")
      .upsert({ member_id: memberId, org_id: orgId, ...c })
      .select().single(),
  );

export const updateMember = async (id: string, patch: Partial<Member>) =>
  unwrap(await supabase.from("members").update(patch).eq("id", id).select().single());

// ---------- נקודות איסוף ----------

export const listStops = async (): Promise<Stop[]> =>
  unwrap(await supabase.from("stops").select("*").eq("active", true).order("sort"));

export const createStop = async (orgId: string, name: string, address?: string) =>
  unwrap(
    await supabase.from("stops")
      .insert({ org_id: orgId, name, address: address ?? null })
      .select().single(),
  );

export const deleteStop = async (id: string) =>
  unwrap(await supabase.from("stops").delete().eq("id", id).select());

// ---------- נסיעות ----------

export async function listRides(fromDate: string, toDate: string): Promise<Ride[]> {
  return unwrap(
    await supabase.from("rides").select("*")
      .gte("ride_date", fromDate).lte("ride_date", toDate)
      .neq("status", "cancelled")
      .order("ride_date").order("depart_time"),
  );
}

export const getRide = async (id: string): Promise<Ride> =>
  unwrap(await supabase.from("rides").select("*").eq("id", id).single());

export const listBookingsForRides = async (rideIds: string[]): Promise<Booking[]> =>
  rideIds.length
    ? unwrap(await supabase.from("bookings").select("*").in("ride_id", rideIds))
    : [];

export const myBookings = async (memberId: string): Promise<Booking[]> =>
  unwrap(
    await supabase.from("bookings").select("*")
      .eq("passenger_id", memberId).order("created_at", { ascending: false }),
  );

export async function createRide(input: {
  org_id: string; driver_id: string; ride_date: string; depart_time: string;
  direction: RideDirection; seats_total: number; price: number;
  origin_stop_id?: string | null; origin_text?: string | null;
  dest_text?: string | null; auto_approve?: boolean; notes?: string | null;
}): Promise<Ride> {
  return unwrap(
    await supabase.from("rides")
      // departs_at מחושב מחדש בשרת לפי אזור הזמן של הארגון
      .insert({ ...input, departs_at: new Date().toISOString() })
      .select().single(),
  );
}

export const updateRide = async (id: string, patch: Partial<Ride>) =>
  unwrap(await supabase.from("rides").update(patch).eq("id", id).select().single());

// ---------- פעולות (דרך פונקציות במסד הנתונים) ----------

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> =>
  unwrap(await supabase.rpc(fn, args)) as T;

export const requestBooking = (rideId: string, seats = 1, stopId?: string | null, note?: string) =>
  rpc<Booking>("request_booking", {
    p_ride: rideId, p_seats: seats, p_stop: stopId ?? null, p_note: note ?? null,
  });

export const decideBooking = (bookingId: string, approve: boolean, reason?: string) =>
  rpc<Booking>("decide_booking", {
    p_booking: bookingId, p_approve: approve, p_reason: reason ?? null,
  });

export const cancelBooking = (bookingId: string) =>
  rpc<Booking>("cancel_booking", { p_booking: bookingId });

export const closeRide = (rideId: string, attended?: string[] | null) =>
  rpc<Ride>("close_ride", { p_ride: rideId, p_attended: attended ?? null });

export const cancelRide = (rideId: string, reason?: string) =>
  rpc<Ride>("cancel_ride", { p_ride: rideId, p_reason: reason ?? null });

export const logManualRide = (
  driverId: string, date: string, price: number,
  direction: RideDirection = "to_work",
) =>
  rpc<string>("log_manual_ride", {
    p_driver: driverId, p_date: date, p_price: price, p_direction: direction,
  });

export const markPayment = (
  payeeId: string, amount: number, method: PaymentMethod = "bit",
  reference?: string, note?: string,
) =>
  rpc<Payment>("mark_payment", {
    p_payee: payeeId, p_amount: amount, p_method: method,
    p_reference: reference ?? null, p_note: note ?? null,
  });

export const confirmPayment = (paymentId: string) =>
  rpc<Payment>("confirm_payment", { p_payment: paymentId });

export const disputePayment = (paymentId: string, reason: string) =>
  rpc<Payment>("dispute_payment", { p_payment: paymentId, p_reason: reason });

export const closeMonth = (start: string, end: string) =>
  rpc<number>("close_month", { p_start: start, p_end: end });

// ---------- כספים ----------

export const listBalances = async (): Promise<Balance[]> =>
  unwrap(await supabase.from("balances").select("*"));

export const listCharges = async (): Promise<Charge[]> =>
  unwrap(
    await supabase.from("charges").select("*").order("created_at", { ascending: false }).limit(200),
  );

export const listPayments = async (): Promise<Payment[]> =>
  unwrap(
    await supabase.from("payments").select("*").order("marked_at", { ascending: false }).limit(200),
  );

export const listSettlements = async (): Promise<Settlement[]> =>
  unwrap(await supabase.from("settlements").select("*").order("period_start", { ascending: false }));

// ---------- נסיעות קבועות ומנויים ----------

export const listTemplates = async (): Promise<RideTemplate[]> =>
  unwrap(await supabase.from("ride_templates").select("*").eq("active", true));

export async function createTemplate(input: Omit<RideTemplate, "id" | "active">) {
  return unwrap(await supabase.from("ride_templates").insert(input).select().single());
}

export const deactivateTemplate = async (id: string) =>
  unwrap(await supabase.from("ride_templates").update({ active: false }).eq("id", id).select());

export const subscribeToTemplate = async (
  orgId: string, templateId: string, memberId: string, stopId?: string | null,
) =>
  unwrap(
    await supabase.from("subscriptions")
      .upsert({
        org_id: orgId, template_id: templateId, passenger_id: memberId,
        pickup_stop_id: stopId ?? null, active: true,
      }, { onConflict: "template_id,passenger_id" })
      .select().single(),
  );

export const unsubscribeFromTemplate = async (templateId: string, memberId: string) =>
  unwrap(
    await supabase.from("subscriptions").update({ active: false })
      .eq("template_id", templateId).eq("passenger_id", memberId).select(),
  );

export const listMySubscriptions = async (memberId: string) =>
  unwrap(
    await supabase.from("subscriptions").select("*")
      .eq("passenger_id", memberId).eq("active", true),
  );

// ---------- נוסעים מאושרים מראש ----------

export const listTrusted = async (driverId: string) =>
  unwrap(await supabase.from("trusted_passengers").select("*").eq("driver_id", driverId));

export const addTrusted = async (orgId: string, driverId: string, passengerId: string) =>
  unwrap(
    await supabase.from("trusted_passengers")
      .insert({ org_id: orgId, driver_id: driverId, passenger_id: passengerId })
      .select().single(),
  );

export const removeTrusted = async (driverId: string, passengerId: string) =>
  unwrap(
    await supabase.from("trusted_passengers").delete()
      .eq("driver_id", driverId).eq("passenger_id", passengerId).select(),
  );

// ---------- התראות ----------

export const listNotifications = async (): Promise<AppNotification[]> =>
  unwrap(
    await supabase.from("notifications").select("*")
      .order("created_at", { ascending: false }).limit(50),
  );

export const markNotificationRead = async (id: string) =>
  unwrap(
    await supabase.from("notifications")
      .update({ read_at: new Date().toISOString() }).eq("id", id).select(),
  );

export async function markAllNotificationsRead(memberId: string) {
  return unwrap(
    await supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("member_id", memberId).is("read_at", null).select(),
  );
}

/** מנוי בזמן אמת להתראות חדשות של החבר הנוכחי */
export function onNewNotification(memberId: string, cb: (n: AppNotification) => void) {
  const channel = supabase
    .channel(`notif-${memberId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `member_id=eq.${memberId}` },
      (payload) => cb(payload.new as AppNotification),
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/** מנוי בזמן אמת לשינויים בנסיעות ובהרשמות, כדי שלוח הנסיעות יתעדכן לבד */
export function onRideActivity(orgId: string, cb: () => void) {
  const channel = supabase
    .channel(`rides-${orgId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, cb)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

// ---------- מדיניות הארגון ----------

export const updateOrgSettings = async (orgId: string, settings: Record<string, unknown>) =>
  unwrap(await supabase.from("orgs").update({ settings }).eq("id", orgId).select().single());

// ---------- עדכון נסיעה קבועה ----------

/**
 * משנה תבנית של נסיעה קבועה, ובברירת מחדל מיישר גם את הנסיעות העתידיות
 * שכבר פורסמו ממנה. בלי היישור נשאר לוח שמערבב שתי שעות של אותה נסיעה.
 */
export const updateTemplate = (
  templateId: string,
  patch: {
    days?: number[]; time?: string; seats?: number; price?: number;
    stopId?: string | null; dest?: string | null; autoApprove?: boolean;
  },
  applyToFuture = true,
) =>
  rpc<number>("update_template", {
    p_template: templateId,
    p_days: patch.days ?? null,
    p_time: patch.time ?? null,
    p_seats: patch.seats ?? null,
    p_price: patch.price ?? null,
    p_stop: patch.stopId ?? null,
    p_dest: patch.dest ?? null,
    p_auto: patch.autoApprove ?? null,
    p_apply_future: applyToFuture,
  });

// ---------- נסיעה שהופכת לקבועה, ורישום קבוע מתוכה ----------

/** הנהג הופך נסיעה קיימת לנסיעה קבועה. בלי ימים — אותו יום בשבוע. */
export const rideToTemplate = (rideId: string, days?: number[]) =>
  rpc<string>("ride_to_template", { p_ride: rideId, p_days: days ?? null });

/** הנוסע נרשם קבוע לנסיעה שהוא כבר בה, עם נקודת האיסוף שכבר בחר */
export const subscribeToRide = (rideId: string) =>
  rpc<string>("subscribe_to_ride", { p_ride: rideId });

export const unsubscribeFromRide = (rideId: string) =>
  rpc<void>("unsubscribe_from_ride", { p_ride: rideId });
