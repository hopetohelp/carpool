// ============================================================================
// שליחת ההתראות שממתינות בתור — מייל והתראות דחיפה.
//
// רצה כל דקה ממשימה מתוזמנת. כל התראה נשלחת פעם אחת בלבד: הסטטוס מתעדכן
// מ-pending ל-sent/skipped/failed, ולכן הרצה חוזרת לא מייצרת כפילויות.
//
// המפתחות (Resend, VAPID) נשמרים בטבלת app_config שאין לאף אחד גישה אליה
// מלבד השרת עצמו — לא בקוד ולא בדפדפן.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const BATCH = 60;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function loadConfig(): Promise<Record<string, string>> {
  const { data } = await db.from("app_config").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

function emailHtml(title: string, body: string, link: string, appUrl: string) {
  const href = `${appUrl}/#${link || "/"}`;
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:24px;background:#f4f1ea;font-family:'Segoe UI',Arial,sans-serif;color:#191c1e">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fffefb;border:1px solid #e2ded3;border-radius:10px">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:13px;color:#6b6b66">נסיעות שיתופיות</p>
<h1 style="margin:0 0 12px;font-size:19px;line-height:1.4">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3c4145">${escapeHtml(body)}</p>
<a href="${href}" style="display:inline-block;background:#1f6f5c;color:#fffefb;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px">פתיחת הכלי</a>
<p style="margin:20px 0 0;font-size:12px;color:#8a8a84">אפשר לכבות עדכוני מייל בהגדרות הכלי.</p>
</td></tr></table></body></html>`;
}

const escapeHtml = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  const cfg = await loadConfig();

  // הגנה: רק המשימה המתוזמנת רשאית להפעיל את הפונקציה
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!cfg.cron_secret || secret !== cfg.cron_secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const appUrl = cfg.app_url ?? "";
  const result = { email_sent: 0, email_skipped: 0, email_failed: 0,
                   push_sent: 0, push_skipped: 0, push_failed: 0 };

  const { data: pending } = await db
    .from("notifications")
    .select("id, member_id, kind, title, body, link, email_status, push_status")
    .or("email_status.eq.pending,push_status.eq.pending")
    .order("created_at")
    .limit(BATCH);

  if (!pending?.length) {
    return new Response(JSON.stringify({ ...result, nothing_to_do: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const memberIds = [...new Set(pending.map((n) => n.member_id))];
  const { data: members } = await db
    .from("members").select("id, name, notify_email, notify_push").in("id", memberIds);
  const { data: contacts } = await db
    .from("member_contacts").select("member_id, email").in("member_id", memberIds);
  const { data: subs } = await db
    .from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth")
    .in("member_id", memberIds);

  const memberById = new Map((members ?? []).map((m) => [m.id, m]));
  const emailOf = new Map((contacts ?? []).map((c) => [c.member_id, c.email]));
  const subsOf = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    if (!subsOf.has(s.member_id)) subsOf.set(s.member_id, []);
    subsOf.get(s.member_id)!.push(s);
  }

  const pushReady = Boolean(cfg.vapid_public && cfg.vapid_private);
  if (pushReady) {
    webpush.setVapidDetails(
      cfg.vapid_subject ?? "mailto:noreply@example.com",
      cfg.vapid_public, cfg.vapid_private,
    );
  }

  for (const n of pending) {
    const member = memberById.get(n.member_id);
    const patch: Record<string, string> = {};

    // ---------- מייל ----------
    if (n.email_status === "pending") {
      const to = emailOf.get(n.member_id);
      if (!cfg.resend_api_key || !cfg.mail_from || !member?.notify_email || !to) {
        patch.email_status = "skipped";
        result.email_skipped++;
      } else {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cfg.resend_api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: cfg.mail_from,
              to: [to],
              subject: n.title,
              text: `${n.body ?? ""}\n\n${appUrl}/#${n.link ?? "/"}`,
              html: emailHtml(n.title, n.body ?? "", n.link ?? "/", appUrl),
            }),
          });
          if (res.ok) { patch.email_status = "sent"; result.email_sent++; }
          else { patch.email_status = "failed"; result.email_failed++; }
        } catch {
          patch.email_status = "failed";
          result.email_failed++;
        }
      }
    }

    // ---------- התראת דחיפה ----------
    if (n.push_status === "pending") {
      const targets = subsOf.get(n.member_id) ?? [];
      if (!pushReady || !member?.notify_push || targets.length === 0) {
        patch.push_status = "skipped";
        result.push_skipped++;
      } else {
        let ok = false;
        for (const t of targets) {
          try {
            await webpush.sendNotification(
              { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
              JSON.stringify({
                title: n.title, body: n.body ?? "", link: n.link ?? "/", kind: n.kind,
              }),
              { TTL: 6 * 3600 },
            );
            ok = true;
          } catch (e) {
            // מנוי שפג תוקפו — הדפדפן ביטל אותו, אין טעם לשמור אותו
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await db.from("push_subscriptions").delete().eq("id", t.id);
            }
          }
        }
        patch.push_status = ok ? "sent" : "failed";
        if (ok) result.push_sent++; else result.push_failed++;
      }
    }

    if (Object.keys(patch).length) {
      await db.from("notifications").update(patch).eq("id", n.id);
    }
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
