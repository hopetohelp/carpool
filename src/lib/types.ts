// טיפוסי הנתונים של הכלי — תואמים לטבלאות במסד הנתונים.

export type MemberRole = "member" | "manager";
export type MemberStatus = "pending" | "active" | "blocked";
export type RideDirection = "to_work" | "from_work";
export type RideStatus =
  | "draft" | "open" | "full" | "locked"
  | "departed" | "finished" | "closed" | "cancelled";
export type BookingStatus =
  | "requested" | "approved" | "rejected"
  | "waitlisted" | "cancelled" | "no_show" | "rode";
export type BookingSource = "app" | "manual" | "subscription";
export type PaymentStatus = "marked" | "confirmed" | "disputed";
export type PaymentMethod = "bit" | "paybox" | "cash" | "transfer" | "other";

export interface OrgSettings {
  currency: string;
  timezone: string;
  default_price: number;
  max_price_per_km: number;
  cost_per_km: number;
  co2_kg_per_km: number;
  cancel_deadline_hours: number;
  cancel_charge_pct: number;
  payment_due_days: number;
  auto_confirm_days: number;
  lock_ride_hours_before: number;
  publish_weeks_ahead: number;
  /** אישור מיידי של מצטרפים חדשים, בלי המתנה למנהל. כבוי כברירת מחדל. */
  auto_approve_members?: boolean;
}

export interface Org {
  id: string;
  name: string;
  join_code: string;
  settings: OrgSettings;
  /** הושהה בידי מנהל מערכת: הנתונים נשמרים, הגישה נעצרת עד שההשהיה תוסר */
  suspended_at?: string | null;
}

export interface Member {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  is_driver: boolean;
  home_area: string | null;
  notify_email: boolean;
  notify_push: boolean;
}

export interface MemberContact {
  member_id: string;
  phone: string | null;
  email: string | null;
  pay_note: string | null;
}

export interface Stop {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  sort: number;
  active: boolean;
}

export interface Ride {
  id: string;
  org_id: string;
  driver_id: string;
  template_id: string | null;
  ride_date: string;
  depart_time: string;
  departs_at: string;
  direction: RideDirection;
  origin_stop_id: string | null;
  origin_text: string | null;
  dest_text: string | null;
  seats_total: number;
  seats_taken: number;
  price: number;
  auto_approve: boolean;
  status: RideStatus;
  notes: string | null;
}

export interface Booking {
  id: string;
  org_id: string;
  ride_id: string;
  passenger_id: string;
  seats: number;
  pickup_stop_id: string | null;
  status: BookingStatus;
  source: BookingSource;
  note: string | null;
  created_at: string;
}

export interface RideTemplate {
  id: string;
  org_id: string;
  driver_id: string;
  days_of_week: number[];
  depart_time: string;
  direction: RideDirection;
  origin_stop_id: string | null;
  origin_text: string | null;
  dest_text: string | null;
  seats_total: number;
  price: number;
  auto_approve: boolean;
  active: boolean;
}

export interface Charge {
  id: string;
  ride_id: string | null;
  booking_id: string | null;
  payer_id: string;
  payee_id: string;
  amount: number;
  kind: string;
  note: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  status: PaymentStatus;
  note: string | null;
  dispute_reason: string | null;
  marked_at: string;
  confirmed_at: string | null;
  auto_confirmed: boolean;
}

export interface Balance {
  org_id: string;
  payer_id: string;
  payee_id: string;
  charged: number;
  paid: number;
  pending: number;
  owed: number;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Settlement {
  id: string;
  period_start: string;
  period_end: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  rides_count: number;
  status: string;
}

/** נסיעה עם הנתונים הנלווים שהמסך צריך, כדי לא לשלוף שוב ושוב */
export interface RideView extends Ride {
  driver?: Member;
  bookings?: (Booking & { passenger?: Member })[];
  myBooking?: Booking | null;
}
