// ============================================================================
// חשבון: יצירה ושחזור סיסמה
//
// למה זה כאן ולא בשירות האימות עצמו:
// שירות האימות של Supabase שולח מיילים דרך שרת דואר משותף שמוגבל למספר
// קטן מאוד של הודעות בשעה — לא מספיק לצוות אמיתי. הפונקציה הזו יוצרת את
// החשבון ישירות (מאושר מראש, בלי מייל אימות) ושולחת את מייל שחזור הסיסמה
// דרך ספק הדואר שכבר משמש את שאר ההתראות בכלי.
//
// למה בטוח ליצור חשבון בלי אימות מייל: חשבון לבדו לא נותן גישה לשום דבר.
// כדי להיכנס לארגון צריך גם את קוד הצוות וגם אישור של מנהל.
//
// כל הכתובות והמפתחות מגיעים מטבלת ההגדרות בלבד, ואינם כתובים בקוד.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function config(): Promise<Record<string, string>> {
  const { data } = await admin.from("app_config").select("key,value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

/**
 * שולח מייל ומדווח ליומן אם זה הצליח.
 *
 * למה הדיווח חשוב: קודם השגיאות נבלעו בשקט, ולכן מפתח שפג תוקפו או כתובת
 * שולח לא מאומתת היו נראים בדיוק כמו הצלחה. עכשיו אפשר לראות ביומן מה קרה
 * בלי לחשוף שום פרט בתשובה למי שקרא לפונקציה.
 */
async function sendMail(cfg: Record<string, string>, to: string, subject: string, html: string) {
  // כתובת השולח ומפתח השליחה מגיעים מטבלת ההגדרות בלבד, לא מהקוד
  if (!cfg.resend_api_key || !cfg.mail_from) {
    console.log("mail skipped: missing sender config");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resend_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: cfg.mail_from, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.log(`mail failed: status ${res.status} — ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    console.log(`mail sent: status ${res.status}`);
    return true;
  } catch (e) {
    console.log(`mail error: ${String(e).slice(0, 200)}`);
    return false;
  }
}

const shell = (title: string, body: string, cta?: { href: string; label: string }) => `
<div dir="rtl" style="font-family:system-ui,'Segoe UI',Arial,sans-serif;background:#f2ede3;padding:28px">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e3dccc;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 14px;font-size:20px;color:#16211d">${title}</h1>
    <div style="font-size:15px;line-height:1.75;color:#3c4a44">${body}</div>
    ${
  cta
    ? `<a href="${cta.href}" style="display:inline-block;margin-top:22px;background:#1f6f57;color:#fffdf8;
         text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px">${cta.label}</a>`
    : ""
}
  </div>
</div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const cfg = await config();
  const appUrl = cfg.app_url ?? "";

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email);
  if ((action === "signup" || action === "reset") && !emailOk) {
    return json({ error: "כתובת המייל לא נראית תקינה" }, 400);
  }

  // ---------- התראה למנהל מערכת על בקשה חדשה לפתיחת ארגון ----------
  // הלקוח שולח רק מזהה בקשה. הנמענים והתוכן נקבעים כאן מול המסד, ולכן
  // אי אפשר להשתמש בפונקציה כדי לשלוח הודעה שרירותית לכתובת שרירותית.
  if (action === "org_request_notice") {
    const { data: reqRow } = await admin
      .from("org_requests")
      .select("org_name, requester_name, join_code, status")
      .eq("id", String(body.request_id ?? ""))
      .maybeSingle();

    if (!reqRow || reqRow.status !== "pending") return json({ ok: true });

    const { data: byEmail } = await admin.from("platform_admin_emails").select("email");
    const { data: byId } = await admin.from("platform_admins").select("user_id");

    const recipients = new Set<string>((byEmail ?? []).map((r) => r.email));
    for (const a of byId ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(a.user_id);
      if (u?.user?.email) recipients.add(u.user.email);
    }
    if (recipients.size === 0) return json({ ok: true });

    const esc = (v: string) =>
      v.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

    await Promise.all([...recipients].map((to) =>
      sendMail(
        cfg, to,
        "בקשה חדשה לפתיחת ארגון",
        shell(
          "בקשה חדשה לפתיחת ארגון",
          `<b>${esc(reqRow.requester_name)}</b> ביקש לפתוח את
           <b>${esc(reqRow.org_name)}</b>.
           <br><br>קוד הצוות שנשמר עבורו:
           <span style="font-weight:700;letter-spacing:.1em;direction:ltr;display:inline-block">${esc(reqRow.join_code)}</span>
           <br><br>הבקשה ממתינה לאישור או לדחייה במסך בקשות פתיחת הארגון.`,
          appUrl ? { href: `${appUrl}/#/admin`, label: "מעבר לבקשות" } : undefined,
        ),
      )
    ));
    return json({ ok: true });
  }

  // ---------- יצירת חשבון ----------
  if (action === "signup") {
    const password = String(body.password ?? "");
    if (password.length < 8) {
      return json({ error: "הסיסמה צריכה להיות באורך 8 תווים לפחות" }, 400);
    }

    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: String(body.name ?? "").trim() || null },
    });

    if (error) {
      const already = /already|exists|registered/i.test(error.message);
      return json({
        error: already
          ? "כבר קיים חשבון עם המייל הזה. אפשר להיכנס איתו, או לאפס סיסמה."
          : "לא הצלחנו ליצור את החשבון. כדאי לנסות שוב.",
      }, 400);
    }

    // מייל פתיחה — גם ברכה וגם התרעה למקרה שמישהו אחר נרשם עם הכתובת הזו
    await sendMail(
      cfg,
      email,
      "נפתח לך חשבון בנסיעות שיתופיות",
      shell(
        "החשבון נוצר",
        `נפתח חשבון בכלי הנסיעות השיתופיות עם כתובת המייל הזו.
         <br><br>השלב הבא הוא להזין את קוד הצוות שקיבלת ממי שהזמין אותך.
         <br><br>אם לא פתחת את החשבון הזה, אפשר להתעלם מההודעה. בלי קוד צוות
         הוא לא נותן גישה לשום מידע.`,
        { href: appUrl, label: "כניסה לכלי" },
      ),
    );
    return json({ ok: true });
  }

  // ---------- שחזור סיסמה ----------
  // נשלח קוד ספרות ולא קישור. קישור היה מחייב רישום כתובת מאושרת
  // בהגדרות שירות האימות; קוד עובד בלי שום תלות בהגדרה חיצונית.
  if (action === "reset") {
    // תמיד מחזירים הצלחה, גם אם אין חשבון כזה — אחרת אפשר לגלות מי רשום
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    const code = data?.properties?.email_otp;
    if (!error && code) {
      await sendMail(
        cfg,
        email,
        "קוד לאיפוס סיסמה",
        shell(
          "קוד לאיפוס סיסמה",
          `התקבלה בקשה לאפס את הסיסמה לחשבון הזה. זה הקוד:
           <div style="margin:20px 0;font-size:30px;font-weight:700;letter-spacing:.28em;
                       color:#16211d;direction:ltr;text-align:center">${code}</div>
           הקוד תקף לשעה אחת.
           <br><br>אם לא ביקשת לאפס, אפשר להתעלם מההודעה. הסיסמה הנוכחית תישאר בתוקף.`,
        ),
      );
    }
    return json({ ok: true });
  }

  return json({ error: "פעולה לא מוכרת" }, 400);
});
