import { supabase, FUNCTIONS_URL, ANON_KEY, SUPABASE_URL, IS_DEMO } from "./supabase";

// ============================================================================
// כניסה
//
// כניסה רגילה כמו בכל אתר: חשבון Google, או מייל וסיסמה. הזהות היא החשבון —
// לא השם ולא קוד הארגון. קוד הארגון נדרש פעם אחת בלבד, בהצטרפות, ולא בכל
// התחברות.
//
// שני דברים נעשים דרך פונקציית שרת ולא ישירות מול שירות האימות:
//   יצירת חשבון — כדי לא לחייב מייל אימות דרך שרת דואר מוגבל מאוד.
//   איפוס סיסמה — כדי לשלוח את הקוד דרך Resend, שכבר משמש את שאר ההתראות.
// ============================================================================

export type AuthError = { message: string };

async function callFunction(name: string, body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("אין חיבור לרשת. כדאי לבדוק את החיבור ולנסות שוב.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "משהו השתבש. כדאי לנסות שוב.");
  return data;
}

// ---------------------------------------------------------------- אימות בסיסי

export function validateEmail(email: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())) {
    return "כתובת המייל לא נראית תקינה";
  }
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "הסיסמה צריכה להיות באורך 8 תווים לפחות";
  if (/^\d+$/.test(pw)) return "סיסמה של ספרות בלבד קלה מדי לניחוש";
  return null;
}

// ------------------------------------------------------------ מייל וסיסמה

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    throw new Error(
      /invalid/i.test(error.message)
        ? "המייל או הסיסמה לא נכונים. אם שכחת את הסיסמה אפשר לאפס אותה."
        : "לא הצלחנו להיכנס. כדאי לנסות שוב.",
    );
  }
}

export async function signUp(email: string, password: string, name: string) {
  await callFunction("auth-account", {
    action: "signup",
    email: email.trim().toLowerCase(),
    password,
    name: name.trim(),
  });
  await signIn(email, password);
}

/** שולח קוד בן 8 ספרות למייל. לא מגלה אם החשבון קיים. */
export async function requestPasswordReset(email: string) {
  await callFunction("auth-account", { action: "reset", email: email.trim().toLowerCase() });
}

/** מאמת את הקוד מהמייל וקובע סיסמה חדשה. */
export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.replace(/\D/g, ""),
    type: "recovery",
  });
  if (verifyError) {
    throw new Error("הקוד לא נכון או שפג תוקפו. אפשר לבקש קוד חדש.");
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error("לא הצלחנו לעדכן את הסיסמה. כדאי לנסות שוב.");
}

// --------------------------------------------------------------------- Google

/**
 * בודק אם כניסה עם Google מופעלת בשירות האימות. כשהיא כבויה הכפתור
 * לא מוצג בכלל, במקום להוביל למסך שגיאה.
 */
let googleCache: boolean | null = null;
export async function isGoogleEnabled(): Promise<boolean> {
  if (IS_DEMO) return false;          // בהדגמה אין רשת בכלל
  if (googleCache !== null) return googleCache;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: ANON_KEY } });
    const data = await res.json();
    googleCache = !!data?.external?.google;
  } catch {
    googleCache = false;
  }
  return googleCache;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error("לא הצלחנו לפתוח את מסך הכניסה של Google.");
}

// ------------------------------------------------------------------- ארגון

export async function joinOrg(opts: {
  joinCode: string; name: string; phone?: string; isDriver?: boolean;
}) {
  const { error } = await supabase.rpc("join_org", {
    p_join_code: opts.joinCode.trim(),
    p_name: opts.name.trim(),
    p_phone: opts.phone?.trim() || null,
    p_is_driver: !!opts.isDriver,
  });
  if (error) throw new Error(error.message);
}

/**
 * מייצר קוד צוות קריא. בלי האותיות והספרות שמתבלבלות זו בזו בהקראה
 * ובכתב יד (O ו-0, I ו-1), כי הקוד מיועד להימסר בעל פה ובהודעה.
 */
export function generateJoinCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** קוד הצוות של ארגון ההדגמה, אם הוגדר — ממולא מראש כדי שאפשר יהיה לנסות מיד */
export const DEMO_JOIN_CODE: string = import.meta.env.VITE_DEMO_JOIN_CODE ?? "";

// ---------------------------------------------------- בקשה לפתיחת ארגון

export type OrgRequest = {
  id: string;
  org_name: string;
  join_code: string;
  requester_name: string;
  phone: string | null;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  created_at: string;
};

/** מגיש בקשה לפתיחת ארגון. הארגון ייווצר רק אחרי אישור מנהל מערכת. */
export async function requestOrg(opts: {
  orgName: string; joinCode: string; name: string; phone?: string;
}) {
  const { data, error } = await supabase.rpc("request_org", {
    p_org_name: opts.orgName.trim(),
    p_join_code: opts.joinCode.trim().toUpperCase(),
    p_name: opts.name.trim(),
    p_phone: opts.phone?.trim() || null,
  });
  if (error) throw new Error(error.message);

  // התראה למנהל המערכת. נכשלת בשקט: הבקשה כבר נשמרה, ואין סיבה להציג
  // למבקש שגיאה על משהו שקורה מאחורי הקלעים.
  void callFunction("auth-account", {
    action: "org_request_notice",
    request_id: data,
  }).catch(() => {});
}

/** הבקשה האחרונה של המשתמש הנוכחי, אם יש */
export async function myOrgRequest(): Promise<OrgRequest | null> {
  const { data } = await supabase
    .from("org_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as OrgRequest) ?? null;
}

export async function isPlatformAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
}

export async function listPendingOrgRequests(): Promise<OrgRequest[]> {
  const { data } = await supabase
    .from("org_requests").select("*")
    .eq("status", "pending").order("created_at");
  return (data ?? []) as OrgRequest[];
}

export async function decideOrgRequest(id: string, approve: boolean, reason?: string) {
  const { error } = await supabase.rpc("decide_org_request", {
    p_id: id, p_approve: approve, p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

// -------------------------------------------------------------- מונים ציבוריים

export type PublicStats = { orgs: number; members: number; rides: number; charged: number };

/**
 * ארבעה מספרים על כלל המערכת, זמינים גם בלי כניסה.
 * לא נותנים גישה לשום טבלה: הכל מגיע מפונקציה אחת שמחזירה סכומים בלבד.
 */
export async function publicStats(): Promise<PublicStats | null> {
  if (IS_DEMO) return null;
  try {
    const { data, error } = await supabase.rpc("public_stats");
    if (error || !data) return null;
    return data as PublicStats;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ שונות

/** השם שהחשבון מגיע איתו — למילוי מראש של שדה השם בהצטרפות. */
export async function suggestedName(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const m = data.user?.user_metadata ?? {};
  return String(m.full_name ?? m.name ?? "").trim();
}

export async function signOut() {
  await supabase.auth.signOut();
}
