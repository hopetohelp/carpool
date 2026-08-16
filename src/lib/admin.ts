import { supabase, FUNCTIONS_URL, ANON_KEY, IS_DEMO } from "./supabase";

// ============================================================================
// מנהל מערכת — הגישה לנתונים
//
// מנהל המערכת אינו חבר באף ארגון, ולכן אין לו הרשאת קריאה על אף טבלה. כל
// מה שכאן עובר דרך פונקציות במסד הנתונים שבודקות בעצמן מי קורא להן. הקובץ
// הזה הוא רק העטיפה שלהן: אם מישהו יקרא לפונקציות האלה בלי ההרשאה, המסד
// יחזיר שגיאה — לא הקוד כאן.
// ============================================================================

/** במצב הדגמה אין מסד נתונים ואין מנהל מערכת. שום קריאה כאן לא אמורה לצאת. */
function assertLive() {
  if (IS_DEMO) throw new Error("מסך מנהל המערכת לא זמין במצב הדגמה");
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  assertLive();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || "אין לך הרשאה לפעולה הזו.");
  return data as T;
}

// ---------------------------------------------------------------- טיפוסים

export type AdminOrg = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  suspended_at: string | null;
  members_total: number;
  members_active: number;
  members_pending: number;
  logins: number;
  rides: number;
  rides_closed: number;
  last_ride_at: string | null;
};

export type AdminUser = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_login: string | null;
  login_count: number;
  suspended_at: string | null;
  is_admin: boolean;
  org_id: string | null;
  org_name: string | null;
  member_status: "pending" | "active" | "blocked" | null;
  member_role: "member" | "manager" | null;
  rides_driven: number;
  rides_taken: number;
};

export type AdminOrgDetail = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  suspended_at: string | null;
  opened_by: string | null;
  members_total: number;
  members_active: number;
  members_pending: number;
  members_blocked: number;
  drivers: number;
  logins: number;
  rides: number;
  rides_closed: number;
  rides_cancelled: number;
  bookings: number;
  charged: number;
  stops: number;
  last_ride_at: string | null;
};

// ---------------------------------------------------------------- קריאה

export const listOrgs = () => rpc<AdminOrg[]>("admin_list_orgs");

export const listUsers = (orgId?: string) =>
  rpc<AdminUser[]>("admin_list_users", { p_org: orgId ?? null });

export const orgDetail = (orgId: string) =>
  rpc<AdminOrgDetail>("admin_org_detail", { p_org: orgId });

// ---------------------------------------------------------------- פעולות

export const setOrgSuspended = (orgId: string, suspended: boolean) =>
  rpc<void>("admin_set_org_suspended", { p_org: orgId, p_suspended: suspended });

export const deleteOrg = (orgId: string) =>
  rpc<{ name: string; members: number; rides: number }>("admin_delete_org", { p_org: orgId });

export const setUserSuspended = (userId: string, suspended: boolean, reason?: string) =>
  rpc<void>("admin_set_user_suspended", {
    p_user: userId, p_suspended: suspended, p_reason: reason ?? null,
  });

/**
 * מחיקת משתמש בשני שלבים, כי הם קורים בשני מקומות שונים:
 *   1. המסד מוחק את כל מה שהמשתמש עשה בכלי, ומסמן את החשבון כמושהה.
 *   2. פונקציית שרת מוחקת את חשבון הכניסה עצמו — רק לה יש הרשאה לכך.
 * אם השלב השני נכשל, החשבון נשאר קיים אבל מושהה וריק, ולא נוצר מצב ביניים
 * שבו אפשר להיכנס איתו ולהתחיל מחדש.
 */
export async function deleteUser(userId: string) {
  const info = await rpc<{
    name: string | null;
    memberships: number;
    orgs_without_manager: string[];
  }>("admin_delete_user", { p_user: userId });

  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_URL}/auth-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ action: "admin_delete_auth_user", user_id: userId }),
  }).catch(() => null);

  if (!res || !res.ok) {
    throw new Error(
      "הנתונים נמחקו והחשבון הושהה, אבל מחיקת חשבון הכניסה עצמו נכשלה. " +
      "אפשר לנסות שוב, או למחוק אותו ידנית בשירות האימות.",
    );
  }
  return info;
}

// ------------------------------------------------------- מצב החשבון שלי

export type AccountStatus = "ok" | "user_suspended" | "org_suspended" | "anon";

/** מילה אחת שמסבירה למשתמש למה הכלי לא נפתח לו. לא מגלה דבר על אף אחד אחר. */
export async function accountStatus(): Promise<AccountStatus> {
  if (IS_DEMO) return "ok";
  const { data, error } = await supabase.rpc("account_status");
  if (error) return "ok";   // תקלה בבדיקה לא תנעל אף אחד בחוץ
  return (data as AccountStatus) ?? "ok";
}

/** מונה כניסות. נכשל בשקט: זה נתון סטטיסטי, ואסור שיעצור כניסה לכלי. */
export async function recordLogin(): Promise<void> {
  if (IS_DEMO) return;
  try {
    await supabase.rpc("record_login");
  } catch {
    /* לא מעניין את המשתמש */
  }
}
