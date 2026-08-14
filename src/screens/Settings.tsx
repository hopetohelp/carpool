import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { Card, Chip, Field, Section } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { disablePush, enablePush, isIOS, pushState } from "@/lib/push";

type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
  localStorage.setItem("carpool-theme", theme);
}

export default function Settings() {
  const { me, org, contactOf, run, signOut } = useApp();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [payNote, setPayNote] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("carpool-theme") as Theme) ?? "system",
  );
  const [push, setPush] = useState<Awaited<ReturnType<typeof pushState>> | null>(null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const contact = me ? contactOf(me.id) : undefined;

  useEffect(() => {
    setPhone(contact?.phone ?? "");
    setPayNote(contact?.pay_note ?? "");
  }, [contact?.phone, contact?.pay_note]);

  useEffect(() => { setName(me?.name ?? ""); }, [me?.name]);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setAccountEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => { void pushState().then(setPush); }, []);
  useEffect(() => { applyTheme(theme); }, [theme]);

  if (!me || !org) return null;

  return (
    <>
      <button onClick={() => history.back()}
        className="text-sm text-muted-foreground mb-3 hover:underline">› חזרה</button>

      {/* ---------- הפרטים שלי ---------- */}
      <Section title="הפרטים שלך">
        <Card>
          <div className="mb-4">
            <div className="flex gap-1.5">
              {me.role === "manager" && <Chip tone="ok">מנהל</Chip>}
              {me.is_driver && <Chip tone="muted">נהג</Chip>}
            </div>
            {accountEmail && (
              <p className="text-xs text-muted-foreground mt-2.5">
                מחובר עם <span className="num font-medium">{accountEmail}</span>
              </p>
            )}
          </div>

          {/* השם כבר לא משמש לכניסה, ולכן אפשר לתקן אותו */}
          <Field label="שם" hint="כפי שהעמיתים שלך רואים אותך.">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="טלפון"
            hint="נחשף רק לנהג ולנוסעים שנוסעים איתך בפועל, ולמנהל. לא לכל הארגון.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)}
              type="tel" dir="ltr" className="text-left" placeholder="050-1234567" />
          </Field>

          {me.is_driver && (
            <Field label="פרטים לתשלום"
              hint="מה שיופיע לנוסעים בתזכורת התשלום. למשל: ביט 050-1234567">
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)}
                placeholder="ביט לטלפון 050-1234567" />
            </Field>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button size="sm"
              onClick={() => void run(
                async () => {
                  if (name.trim() && name.trim() !== me.name) {
                    await api.updateMember(me.id, { name: name.trim() });
                  }
                  await api.upsertMyContact(me.id, org.id, {
                    phone: phone || null, pay_note: payNote || null,
                  });
                },
                "הפרטים נשמרו",
              )}>
              שמירה
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => void run(
                () => api.updateMember(me.id, { is_driver: !me.is_driver }),
                me.is_driver ? "סומנת כנוסע בלבד" : "סומנת גם כנהג",
              )}>
              {me.is_driver ? "אני לא נוהג יותר" : "אני גם נוהג"}
            </Button>
          </div>
        </Card>
      </Section>

      {/* ---------- התראות ---------- */}
      <Section title="עדכונים">
        <Card>
          <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
            <span>
              <span className="font-medium">מייל</span>
              <span className="block text-xs text-muted-foreground">
                עדכון במייל על בקשות, אישורים ותזכורות
              </span>
            </span>
            <input type="checkbox" checked={me.notify_email}
              onChange={(e) => void run(
                () => api.updateMember(me.id, { notify_email: e.target.checked }),
              )}
              className="h-5 w-5 accent-[hsl(var(--primary))] shrink-0" />
          </label>

          <div className="border-t border-border pt-3 mt-1">
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="font-medium">התראות לטלפון</span>
                <span className="block text-xs text-muted-foreground">
                  {push === "on" ? "פעיל במכשיר הזה"
                    : push === "needs-install" ? "צריך להוסיף את הכלי למסך הבית"
                    : push === "denied" ? "חסום בהגדרות הדפדפן"
                    : push === "unsupported" ? "לא נתמך בדפדפן הזה"
                    : "כבוי במכשיר הזה"}
                </span>
              </span>
              {(push === "off" || push === "on") && (
                <Button size="sm" variant={push === "on" ? "outline" : "default"}
                  onClick={async () => {
                    if (push === "on") {
                      await disablePush();
                      setPushMsg(null);
                    } else {
                      setPushMsg(await enablePush(me.id));
                    }
                    setPush(await pushState());
                  }}>
                  {push === "on" ? "כיבוי" : "הפעלה"}
                </Button>
              )}
            </div>

            {push === "needs-install" && isIOS() && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                באייפון: כפתור השיתוף בתחתית הדפדפן ← "הוספה למסך הבית".
                אחרי זה פותחים את הכלי מהאייקון החדש וההתראות יעבדו.
                זו מגבלה של אפל ולא של הכלי.
              </p>
            )}
            {pushMsg && (
              <p className="text-xs mt-2 text-[hsl(var(--warn))]">{pushMsg}</p>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            עדכונים בתוך הכלי ובוואטסאפ עובדים תמיד ולא דורשים שום הגדרה.
          </p>
        </Card>
      </Section>

      {/* ---------- תצוגה ---------- */}
      <Section title="תצוגה">
        <Card>
          <div className="flex gap-1 p-1 bg-secondary rounded-lg">
            {([["system", "לפי המכשיר"], ["light", "בהיר"], ["dark", "כהה"]] as [Theme, string][])
              .map(([t, label]) => (
                <button key={t} onClick={() => setTheme(t)}
                  className={`flex-1 py-1.5 text-sm rounded-md ${
                    theme === t ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"
                  }`}>
                  {label}
                </button>
              ))}
          </div>
        </Card>
      </Section>

      {/* ---------- הארגון ---------- */}
      <Section title="הארגון">
        <Card>
          <p className="font-medium">{org.name}</p>
          <p className="text-sm text-muted-foreground mt-1">
            קוד הצטרפות: <span className="font-mono num">{org.join_code}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            הנתונים שלך נגישים רק לחברי הארגון הזה. חיובים ותשלומים נראים רק לך,
            לצד השני של העסקה, ולמנהל.
          </p>
        </Card>
      </Section>

      <Section title="">
        <Button variant="outline" className="w-full text-[hsl(var(--danger))]"
          onClick={() => { if (confirm("לצאת מהכלי?")) void signOut(); }}>
          יציאה
        </Button>
      </Section>
    </>
  );
}
