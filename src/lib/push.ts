import { supabase } from "./supabase";

// ============================================================================
// התראות דחיפה — התראה שקופצת על מסך הנעילה גם כשהכלי סגור.
//
// מגבלה שחשוב להכיר: באייפון זה עובד רק אם מוסיפים את הכלי למסך הבית.
// זו מגבלה של אפל, לא של הכלי. באנדרואיד ובמחשב זה עובד גם בלי.
// ============================================================================

// המפתח הציבורי מיועד להיות גלוי — הוא רק מאפשר לדפדפן לוודא שההתראה
// באמת הגיעה מהשרת שלנו. המפתח הפרטי שמור בשרת בלבד.
// מגיע ממשתנה סביבה ולא מהקוד, כמו שאר ההגדרות.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** האם הכלי מותקן כאפליקציה (התנאי של אפל להתראות) */
export const isInstalled = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** מצב ההתראות הנוכחי, כדי להציג למשתמש הסבר מדויק ולא כפתור סתמי */
export async function pushState(): Promise<
  "unsupported" | "needs-install" | "denied" | "off" | "on"
> {
  if (!pushSupported()) return isIOS() && !isInstalled() ? "needs-install" : "unsupported";
  if (isIOS() && !isInstalled()) return "needs-install";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export async function enablePush(memberId: string): Promise<string | null> {
  if (!VAPID_PUBLIC_KEY) {
    return "התראות דחיפה עוד לא הוגדרו בשרת. שאר ערוצי העדכון עובדים כרגיל.";
  }
  if (isIOS() && !isInstalled()) {
    return "באייפון צריך קודם להוסיף את הכלי למסך הבית: כפתור השיתוף ← הוספה למסך הבית.";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "לא אישרת התראות בדפדפן.";

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!reg) return "לא הצלחנו להפעיל את שירות הרקע בדפדפן הזה.";

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
  });

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys) return "המנוי להתראות לא נוצר כמו שצריך.";

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      member_id: memberId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  return error ? "לא הצלחנו לשמור את המנוי. כדאי לנסות שוב." : null;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
