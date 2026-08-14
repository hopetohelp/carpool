import { useEffect, useState } from "react";
import { ArrowRight, Car, Eye, GoogleLogo } from "@phosphor-icons/react";
import { Button, Field, TextInput } from "@/components/app/ui";
import {
  confirmPasswordReset, isGoogleEnabled, publicStats, requestPasswordReset,
  signIn, signInWithGoogle, signUp, validateEmail, validatePassword,
} from "@/lib/auth";
import type { PublicStats } from "@/lib/auth";

// ============================================================================
// כניסה
//
// ארבעה מצבים על אותו מסך: כניסה · חשבון חדש · בקשת קוד · קביעת סיסמה.
// הכל כאן כדי שלא יהיה מסע בין דפים על פעולה שאמורה לקחת חמש שניות.
//
// אין כאן שום מושג שקשור לארגון. קוד הארגון נדרש פעם אחת בלבד, במסך
// שאחרי הכניסה, ולא בכל התחברות.
// ============================================================================

type Mode = "in" | "up" | "forgot" | "reset";

export default function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string | null>>({});
  const [google, setGoogle] = useState(false);

  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => { void isGoogleEnabled().then(setGoogle); }, []);
  useEffect(() => { void publicStats().then(setStats); }, []);

  const switchTo = (m: Mode) => {
    setMode(m); setErr(null); setFieldErr({}); setPassword(""); setCode("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setFieldErr({});

    const emailErr = validateEmail(email);
    if (emailErr) return setFieldErr({ email: emailErr });

    if (mode === "up") {
      if (name.trim().length < 2) return setFieldErr({ name: "צריך למלא שם" });
      const pwErr = validatePassword(password);
      if (pwErr) return setFieldErr({ password: pwErr });
    }
    if (mode === "reset") {
      if (code.replace(/\D/g, "").length < 6) {
        return setFieldErr({ code: "צריך להזין את הקוד מהמייל" });
      }
      const pwErr = validatePassword(password);
      if (pwErr) return setFieldErr({ password: pwErr });
    }

    setBusy(true);
    try {
      if (mode === "in") { await signIn(email, password); onDone(); }
      else if (mode === "up") { await signUp(email, password, name); onDone(); }
      else if (mode === "forgot") { await requestPasswordReset(email); switchTo("reset"); }
      else { await confirmPasswordReset(email, code, password); onDone(); }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "in" ? "כניסה"
    : mode === "up" ? "חשבון חדש"
    : mode === "forgot" ? "שכחתי סיסמה"
    : "סיסמה חדשה";

  const cta =
    mode === "in" ? "כניסה"
    : mode === "up" ? "יצירת חשבון"
    : mode === "forgot" ? "שליחת קוד למייל"
    : "שמירת הסיסמה";

  return (
    <main className="min-h-[100dvh] flex flex-col">
      <header className="px-6 pt-14 pb-8 text-center">
        <div className="mx-auto mb-5 h-14 w-14 rounded-[var(--r-card)] grid place-items-center
                        bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                        shadow-[var(--shadow-2)]">
          <Car size={28} weight="fill" />
        </div>
        <h1 className="text-2xl font-bold">נסיעות שיתופיות</h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          מי נוסע מחר, מי מצטרף, ומי חייב למי.
        </p>
      </header>

      <div className="screen flex-1 pb-10">
        <div className="card-surface p-5 shadow-[var(--shadow-2)]">
          <h2 className="text-lg font-bold mb-4">{title}</h2>

          {/* Google מוצג רק כשהוא באמת מופעל, כדי לא להוביל למסך שגיאה */}
          {google && (mode === "in" || mode === "up") && (
            <>
              <Button
                type="button" variant="secondary" size="lg" block
                icon={<GoogleLogo size={19} weight="bold" />}
                onClick={() => void signInWithGoogle().catch((e) => setErr(e.message))}
              >
                המשך עם Google
              </Button>
              <div className="flex items-center gap-3 my-5 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />או<span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={submit} noValidate>
            {mode === "up" && (
              <Field label="השם שלך" error={fieldErr.name}
                hint="כפי שהעמיתים שלך מכירים אותך. אפשר לשנות בהמשך.">
                <TextInput
                  value={name} onChange={(e) => setName(e.target.value)}
                  autoComplete="name" invalid={!!fieldErr.name}
                />
              </Field>
            )}

            <Field label="מייל" error={fieldErr.email}>
              <TextInput
                type="email" inputMode="email" dir="ltr"
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" invalid={!!fieldErr.email}
                readOnly={mode === "reset"}
                className={mode === "reset" ? "opacity-70" : undefined}
              />
            </Field>

            {mode === "reset" && (
              <Field label="הקוד מהמייל" error={fieldErr.code}
                hint="קוד בן 8 ספרות, תקף לשעה.">
                <TextInput
                  inputMode="numeric" dir="ltr" maxLength={10}
                  value={code} onChange={(e) => setCode(e.target.value)}
                  invalid={!!fieldErr.code}
                  className="tracking-[0.3em] text-center font-semibold"
                />
              </Field>
            )}

            {mode !== "forgot" && (
              <Field
                label={mode === "reset" ? "סיסמה חדשה" : "סיסמה"}
                error={fieldErr.password}
                hint={mode === "up" || mode === "reset" ? "לפחות 8 תווים." : undefined}
              >
                <TextInput
                  type="password" dir="ltr"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  invalid={!!fieldErr.password}
                />
              </Field>
            )}

            {mode === "forgot" && (
              <p className="text-sm text-muted-foreground -mt-1 mb-4 leading-relaxed">
                נשלח קוד לכתובת הזו. אם קיים חשבון עם המייל הזה, הקוד יגיע תוך כמה שניות.
              </p>
            )}

            {err && (
              <div role="alert"
                className="mb-4 rounded-[var(--radius)] px-3.5 py-3 text-sm leading-relaxed
                           bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]">
                {err}
              </div>
            )}

            <Button type="submit" size="lg" block loading={busy}>{cta}</Button>
          </form>

          <div className="mt-5 pt-4 border-t border-border text-sm">
            {mode === "in" && (
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => switchTo("up")}
                  className="font-semibold text-[hsl(var(--primary))] hover:underline">
                  יצירת חשבון חדש
                </button>
                <button type="button" onClick={() => switchTo("forgot")}
                  className="text-muted-foreground hover:underline">
                  שכחתי סיסמה
                </button>
              </div>
            )}
            {mode !== "in" && (
              <button type="button" onClick={() => switchTo("in")}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:underline">
                <ArrowRight size={15} weight="bold" />
                חזרה לכניסה
              </button>
            )}
          </div>
        </div>

        {/* ניסיון בלי הרשמה: הכל רץ בדפדפן, בלי חשבון ובלי לגעת בנתונים אמיתיים */}
        {mode === "in" && (
          <div className="mt-5 text-center">
            <Button
              type="button" variant="secondary" size="lg" block
              icon={<Eye size={18} weight="bold" />}
              onClick={() => { window.location.search = "?demo=1"; }}
            >
              הצצה בלי הרשמה
            </Button>
            <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
              נסיעות לדוגמה שרצות בדפדפן שלך בלבד. אפשר ללחוץ על הכל.
              <br />
              שום דבר לא נשמר ואף אחד אחר לא רואה את זה.
            </p>
          </div>
        )}

        {/* מונים על כלל המערכת. אין כאן שום פרט על אדם או ארגון מסוים. */}
        {stats && (
          <div className="mt-7 grid grid-cols-4 gap-2 text-center">
            {[
              ["ארגונים", stats.orgs, false],
              ["חברים", stats.members, false],
              ["נסיעות", stats.rides, false],
              ["סך חיובים ₪", stats.charged, true],
            ].map(([label, value, money]) => (
              <div key={label as string} className="card-surface py-3 px-1">
                <p className="stat text-lg leading-none">
                  {money && Number(value) >= 1000
                    ? `${Math.round(Number(value) / 1000)}k`
                    : Number(value).toLocaleString("he-IL")}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">{label as string}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
          הכלי לא מעביר כסף ואינו אמצעי תשלום.
          <br />
          הוא רושם מי נסע עם מי, ועוקב אחרי מה שסוכם.
        </p>
      </div>
    </main>
  );
}
