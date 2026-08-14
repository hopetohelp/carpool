import { useEffect, useState } from "react";
import {
  ArrowClockwise, ArrowRight, Buildings, Check, Copy, HourglassMedium,
  Prohibit, UsersThree,
} from "@phosphor-icons/react";
import { useApp } from "@/store";
import { Button, Field, TextInput } from "@/components/app/ui";
import {
  DEMO_JOIN_CODE, generateJoinCode, joinOrg, myOrgRequest, requestOrg, suggestedName,
} from "@/lib/auth";
import type { OrgRequest } from "@/lib/auth";

// ============================================================================
// חיבור לצוות
//
// מוצג בתוך האתר עצמו, לא כמסך חוסם לפני הכניסה: אחרי ההתחברות המשתמש כבר
// בפנים, ומכאן נשאר צעד אחד — שגם אותו אפשר לדחות.
//
// שני מסלולים:
//   הצטרפות — שדה אחד, קוד הצוות. השם נלקח מהחשבון.
//   פתיחת ארגון — הקוד נוצר לבד, והבקשה נשלחת לאישור מנהל מערכת.
// ============================================================================

const LATER_KEY = "carpool-join-later";

export default function JoinOrg({ onDone }: { onDone: () => void }) {
  const [later, setLater] = useState(() => localStorage.getItem(LATER_KEY) === "1");
  const [request, setRequest] = useState<OrgRequest | null | undefined>(undefined);

  // בקשה קיימת לפתיחת ארגון גוברת על כל השאר: זה המצב שהמשתמש נמצא בו
  useEffect(() => { void myOrgRequest().then(setRequest); }, []);

  const openForm = () => { localStorage.removeItem(LATER_KEY); setLater(false); };
  const postpone = () => { localStorage.setItem(LATER_KEY, "1"); setLater(true); };

  if (request === undefined) return null;

  if (request?.status === "pending") {
    return <RequestPending request={request} onRefresh={() => void myOrgRequest().then(setRequest)} />;
  }

  if (later) {
    return (
      <div className="card-surface p-6 text-center shadow-[var(--shadow-2)] enter">
        <div className="mx-auto mb-4 h-12 w-12 grid place-items-center rounded-full
                        bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
          <UsersThree size={24} weight="fill" />
        </div>
        <h1 className="text-xl font-bold">עדיין לא התחברת לצוות</h1>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          הנסיעות, ההצטרפויות והחשבונות יופיעו כאן ברגע שתזין את קוד הצוות.
        </p>
        <Button size="lg" className="mt-6" onClick={openForm}>הזנת קוד הצוות</Button>
      </div>
    );
  }

  return (
    <JoinForm
      onDone={onDone}
      onPostpone={postpone}
      rejected={request?.status === "rejected" ? request : null}
      onRequested={() => void myOrgRequest().then(setRequest)}
    />
  );
}

// ---------------------------------------------------------------- ממתין לאישור

function RequestPending({ request, onRefresh }: { request: OrgRequest; onRefresh: () => void }) {
  return (
    <div className="card-surface p-6 text-center shadow-[var(--shadow-2)] enter">
      <div className="mx-auto mb-4 h-12 w-12 grid place-items-center rounded-full
                      bg-[hsl(var(--warn-soft))] text-[hsl(var(--warn))]">
        <HourglassMedium size={24} weight="fill" />
      </div>
      <h1 className="text-xl font-bold">הבקשה נשלחה</h1>
      <p className="text-muted-foreground mt-2 leading-relaxed">
        ביקשת לפתוח את <span className="font-semibold text-foreground">{request.org_name}</span>.
        <br />
        מנהל המערכת צריך לאשר, ואז הארגון ייפתח ותהיה המנהל שלו.
      </p>

      <div className="mt-5 rounded-[var(--radius)] bg-secondary px-4 py-3 text-sm">
        <span className="text-muted-foreground">קוד הצוות שנשמר עבורך: </span>
        <span className="num font-bold tracking-[0.16em]">{request.join_code}</span>
      </div>

      <Button variant="secondary" size="lg" className="mt-5"
        icon={<ArrowClockwise size={17} weight="bold" />} onClick={onRefresh}>
        בדיקה אם אושר
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------- הטופס

function JoinForm({
  onDone, onPostpone, rejected, onRequested,
}: {
  onDone: () => void;
  onPostpone: () => void;
  rejected: OrgRequest | null;
  onRequested: () => void;
}) {
  const { accountEmail } = useApp();
  const [mode, setMode] = useState<"join" | "create">("join");
  const [joinCode, setJoinCode] = useState(DEMO_JOIN_CODE);
  const [newCode, setNewCode] = useState(() => generateJoinCode());
  const [copied, setCopied] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string | null>>({});

  // קישור הזמנה מהצורה ‎?join=CODE גובר על קוד ההדגמה
  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("join");
    if (invite) setJoinCode(invite.toUpperCase());
    void suggestedName().then((n) => setName((cur) => cur || n));
  }, []);

  const displayName = name.trim() || accountEmail.split("@")[0];

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(newCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("הדפדפן לא איפשר העתקה. אפשר לסמן את הקוד ולהעתיק ידנית.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setFieldErr({});

    if (displayName.length < 2) return setFieldErr({ name: "צריך למלא שם" });
    if (mode === "join" && !joinCode.trim()) {
      return setFieldErr({ joinCode: "צריך למלא את קוד הצוות" });
    }
    if (mode === "create" && orgName.trim().length < 2) {
      return setFieldErr({ orgName: "צריך למלא שם ארגון" });
    }

    setBusy(true);
    try {
      if (mode === "join") {
        await joinOrg({ joinCode, name: displayName, isDriver });
        onDone();
      } else {
        await requestOrg({ orgName, joinCode: newCode, name: displayName });
        onRequested();
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-surface p-5 shadow-[var(--shadow-2)] enter">
      <h1 className="text-xl font-bold">
        {mode === "join" ? "נשאר צעד אחד" : "פתיחת ארגון"}
      </h1>
      <p className="text-muted-foreground mt-1.5 mb-5 text-[15px] leading-relaxed">
        {mode === "join"
          ? "כדי לראות את הנסיעות של הצוות שלך צריך את קוד הצוות. מקבלים אותו ממי שהזמין אותך."
          : "הבקשה נשלחת לאישור מנהל מערכת. אחרי האישור הארגון נפתח ואתה המנהל שלו."}
      </p>

      {/* בקשה קודמת שנדחתה — כדי שלא ישלח שוב בלי לדעת למה נדחה */}
      {rejected && mode === "create" && (
        <div className="mb-5 rounded-[var(--radius)] px-3.5 py-3 text-sm leading-relaxed
                        bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Prohibit size={15} weight="bold" />הבקשה הקודמת נדחתה
          </span>
          {rejected.reason && <span className="block mt-1">{rejected.reason}</span>}
        </div>
      )}

      <form onSubmit={submit} noValidate>
        {mode === "create" ? (
          <>
            <Field label="שם הארגון" error={fieldErr.orgName} hint="למשל: מחלקת פיתוח">
              <TextInput value={orgName} onChange={(e) => setOrgName(e.target.value)}
                autoFocus invalid={!!fieldErr.orgName} />
            </Field>

            {/* הקוד נוצר לבד — אין סיבה להטיל על המשתמש להמציא קוד ייחודי */}
            <Field label="קוד הצוות שייווצר"
              hint="זה הקוד שתחלק לחברי הצוות. אפשר ליצור אחר.">
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-[var(--radius)] border border-input bg-secondary
                                px-3.5 py-2.5 num font-bold text-lg tracking-[0.22em] text-center">
                  {newCode}
                </div>
                <button type="button" onClick={copyCode} aria-label="העתקת הקוד"
                  className="h-[46px] w-[46px] grid place-items-center rounded-[var(--radius)]
                             border border-border bg-card hover:bg-secondary transition-colors
                             active:translate-y-[1px]">
                  {copied
                    ? <Check size={19} weight="bold" className="text-[hsl(var(--ok))]" />
                    : <Copy size={19} />}
                </button>
                <button type="button" onClick={() => setNewCode(generateJoinCode())}
                  aria-label="יצירת קוד אחר"
                  className="h-[46px] w-[46px] grid place-items-center rounded-[var(--radius)]
                             border border-border bg-card hover:bg-secondary transition-colors
                             active:translate-y-[1px]">
                  <ArrowClockwise size={19} />
                </button>
              </div>
            </Field>
          </>
        ) : (
          <Field label="קוד הצוות" error={fieldErr.joinCode}
            hint={DEMO_JOIN_CODE ? "הקוד שמופיע כאן פותח ארגון הדגמה לניסיון." : undefined}>
            <TextInput
              dir="ltr" value={joinCode} autoFocus
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              invalid={!!fieldErr.joinCode}
              className="tracking-[0.18em] font-bold text-lg uppercase"
            />
          </Field>
        )}

        {mode === "join" && (
          <label className="flex items-center gap-3 mb-5 cursor-pointer">
            <input type="checkbox" checked={isDriver}
              onChange={(e) => setIsDriver(e.target.checked)}
              className="h-[18px] w-[18px] accent-[hsl(var(--primary))]" />
            <span className="text-sm font-medium">אני גם נוהג ואפרסם נסיעות</span>
          </label>
        )}

        {err && (
          <div role="alert"
            className="mb-4 rounded-[var(--radius)] px-3.5 py-3 text-sm leading-relaxed
                       bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]">
            {err}
          </div>
        )}

        <Button type="submit" size="lg" block loading={busy}>
          {mode === "join" ? "חיבור לצוות" : "שליחת הבקשה"}
        </Button>

        {mode === "join" && (
          <button type="button" onClick={onPostpone}
            className="w-full mt-3 py-2 text-sm text-muted-foreground hover:text-foreground
                       hover:underline">
            אין לי את הקוד עכשיו, אמלא אחר כך
          </button>
        )}
      </form>

      <details className="mt-4 text-sm group">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
          תיראה לעמיתים בשם <span className="font-semibold text-foreground">{displayName}</span>
        </summary>
        <div className="mt-3">
          <Field label="שם" error={fieldErr.name}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
              invalid={!!fieldErr.name} />
          </Field>
        </div>
      </details>

      <div className="mt-4 pt-4 border-t border-border text-sm">
        <button
          type="button"
          onClick={() => { setMode(mode === "join" ? "create" : "join"); setErr(null); setFieldErr({}); }}
          className="inline-flex items-center gap-1.5 font-semibold text-[hsl(var(--primary))] hover:underline"
        >
          {mode === "join"
            ? <><Buildings size={15} weight="bold" />אין לך קוד? פתיחת ארגון חדש</>
            : <><ArrowRight size={15} weight="bold" />חזרה לחיבור עם קוד</>}
        </button>
      </div>
    </div>
  );
}
