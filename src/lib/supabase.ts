import { createClient } from "@supabase/supabase-js";

// ============================================================================
// חיבור למסד הנתונים
//
// הכתובת והמפתח מגיעים אך ורק ממשתני סביבה ואינם כתובים בקוד. שתי סיבות:
// הקוד נשאר נקי מזיהוי של סביבה מסוימת, ואפשר להצביע על מסד נתונים אחר
// (בדיקות, סביבה נפרדת) בלי לגעת בקוד.
//
// המפתח הציבורי מיועד להיות גלוי — הוא לא מעניק גישה לשום נתון בלי כניסה
// תקינה, כי ההגנה האמיתית יושבת בשכבת ההרשאות של מסד הנתונים עצמו.
// ============================================================================

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "חסרה הגדרת חיבור למסד הנתונים. צריך להגדיר VITE_SUPABASE_URL " +
      "ו-VITE_SUPABASE_ANON_KEY במשתני הסביבה של הבנייה.",
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "carpool-auth",
  },
});

export const SUPABASE_URL = url;
export const FUNCTIONS_URL = `${url}/functions/v1`;
export const ANON_KEY = key;

/** מצב הדגמה: נתוני דמו בזיכרון, בלי מסד נתונים ובלי רשת */
export const IS_DEMO =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("demo") ||
    (window as unknown as { __CARPOOL_DEMO__?: boolean }).__CARPOOL_DEMO__ === true);
