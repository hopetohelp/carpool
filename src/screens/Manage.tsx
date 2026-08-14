import { useState } from "react";
import { useApp } from "@/store";
import { Card, Chip, Empty, Field, Money as Amount, Section } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import { isoDate, money, shortDate } from "@/lib/format";
import { whatsappLink } from "@/lib/share";

// ============================================================================
// ניהול הארגון — תמונה כוללת, חברים, מדיניות, נקודות איסוף וסגירת חודש.
// ============================================================================

type Tab = "dashboard" | "members" | "policy" | "stops";

export default function Manage() {
  const {
    me, org, members, rides, bookings, balances, stops, run,
  } = useApp();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stopName, setStopName] = useState("");
  const [stopAddr, setStopAddr] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});

  if (!me || !org) return null;

  const s = (org.settings ?? {}) as unknown as Record<string, number>;
  const autoApprove =
    (org.settings as unknown as Record<string, unknown>)?.auto_approve_members === true;
  const setting = (k: string, fallback: number) =>
    settings[k] !== undefined ? settings[k] : String(s[k] ?? fallback);

  const closed = rides.filter((r) => r.status === "closed");
  const totalSeats = closed.reduce((a, r) => a + r.seats_total, 0);
  const takenSeats = closed.reduce((a, r) => a + r.seats_taken, 0);
  const occupancy = totalSeats ? takenSeats / totalSeats : 0;

  // הערכת חיסכון: כל נוסע שנסע עם מישהו אחר חסך נסיעה נפרדת.
  // מרחק ממוצע לנסיעה הוא הערכה שהמנהל יכול לשנות במדיניות.
  const avgKm = 18;
  const costPerKm = Number(s.cost_per_km ?? 1.9);
  const co2PerKm = Number(s.co2_kg_per_km ?? 0.19);
  const savedRides = takenSeats;
  const savedKm = savedRides * avgKm;
  const savedMoney = savedKm * costPerKm;
  const savedCo2 = savedKm * co2PerKm;

  const openDebt = balances.reduce((a, b) => a + Number(b.owed), 0);
  const pendingApprovals = balances.reduce((a, b) => a + Number(b.pending), 0);
  const staleRequests = bookings.filter((b) => b.status === "requested").length;

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const lastMonthStart = new Date(firstOfMonth);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const lastMonthEnd = new Date(firstOfMonth.getTime() - 86400000);

  return (
    <>
      <div className="flex gap-1 mb-5 p-1 bg-secondary rounded-lg overflow-x-auto">
        {([
          ["dashboard", "תמונה כוללת"],
          ["members", "חברים"],
          ["policy", "מדיניות"],
          ["stops", "נקודות איסוף"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              tab === t ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ================= תמונה כוללת ================= */}
      {tab === "dashboard" && (
        <>
          <Section title="פעילות">
            <div className="grid grid-cols-2 gap-2">
              <Card edge="ok">
                <p className="text-xs text-muted-foreground mb-1">נסיעות שבוצעו</p>
                <span className="num font-semibold text-lg">{closed.length}</span>
              </Card>
              <Card edge={occupancy > 0.6 ? "ok" : "warn"}>
                <p className="text-xs text-muted-foreground mb-1">תפוסה ממוצעת</p>
                <span className="num font-semibold text-lg">{Math.round(occupancy * 100)}%</span>
              </Card>
              <Card edge="muted">
                <p className="text-xs text-muted-foreground mb-1">חברים פעילים</p>
                <span className="num font-semibold text-lg">
                  {members.filter((m) => m.status === "active").length}
                </span>
              </Card>
              <Card edge="muted">
                <p className="text-xs text-muted-foreground mb-1">נהגים</p>
                <span className="num font-semibold text-lg">
                  {members.filter((m) => m.is_driver).length}
                </span>
              </Card>
            </div>
          </Section>

          <Section title="חיסכון מוערך">
            <Card>
              <p className="text-xs text-muted-foreground mb-3">
                לפי <span className="num">{savedRides}</span> נסיעות נוסע שנחסכו, בהנחת{" "}
                <span className="num">{avgKm}</span> ק"מ לנסיעה ו-{money(costPerKm)} לק"מ.
                המספרים הם הערכה, לא מדידה.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="num font-semibold">{Math.round(savedKm).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">ק"מ</div>
                </div>
                <div>
                  <div className="num font-semibold">{Math.round(savedMoney).toLocaleString()} ₪</div>
                  <div className="text-xs text-muted-foreground">עלות רכב</div>
                </div>
                <div>
                  <div className="num font-semibold">{Math.round(savedCo2).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">ק"ג CO₂</div>
                </div>
              </div>
            </Card>
          </Section>

          <Section title="כספים בארגון">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Card edge={openDebt > 0 ? "warn" : "ok"}>
                <p className="text-xs text-muted-foreground mb-1">חוב פתוח כולל</p>
                <Amount amount={openDebt} tone={openDebt > 0 ? "warn" : "ok"} />
              </Card>
              <Card edge={pendingApprovals > 0 ? "warn" : "muted"}>
                <p className="text-xs text-muted-foreground mb-1">ממתין לאישור נהגים</p>
                <Amount amount={pendingApprovals} />
              </Card>
            </div>
            {staleRequests > 0 && (
              <Card edge="warn">
                <p className="text-sm">
                  <span className="num">{staleRequests}</span> בקשות הצטרפות ממתינות לתשובת נהג.
                </p>
              </Card>
            )}
          </Section>

          <Section title="סגירת חודש">
            <Card>
              <p className="text-sm text-muted-foreground mb-3">
                מרכז את כל החיובים של החודש לדף חשבון אחד לכל זוג, ושולח התראה לכל מי שחייב.
                במקום עשרות העברות קטנות, סכום אחד.
              </p>
              <Button size="sm"
                onClick={() => {
                  const start = isoDate(lastMonthStart);
                  const end = isoDate(lastMonthEnd);
                  if (confirm(`לסגור את התקופה ${shortDate(start)}–${shortDate(end)}?`)) {
                    void run(() => api.closeMonth(start, end), "החודש נסגר ודפי החשבון נשלחו");
                  }
                }}>
                סגירת החודש הקודם
              </Button>
            </Card>
          </Section>
        </>
      )}

      {/* ================= חברים ================= */}
      {tab === "members" && (
        <>
          <Section title="קוד ההצטרפות לארגון">
            <Card>
              <p className="text-2xl font-mono font-bold tracking-widest mb-2 num">
                {org.join_code}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                כל מי שיש לו את הקוד הזה יכול להצטרף לארגון. כדאי לשלוח אותו רק לעמיתים.
              </p>
              <Button size="sm" variant="outline" asChild>
                <a target="_blank" rel="noreferrer"
                  href={whatsappLink(
                    `הצטרפו לכלי הנסיעות השיתופיות שלנו.\nקוד הארגון: ${org.join_code}\n${window.location.origin}`,
                  )}>
                  שליחת הזמנה בוואטסאפ
                </a>
              </Button>
            </Card>
          </Section>

          <Section title={`חברים (${members.length})`}>
            {members.map((m) => {
              const debt = balances
                .filter((b) => b.payer_id === m.id)
                .reduce((a, b) => a + Number(b.owed), 0);
              return (
                <Card key={m.id} className="mb-2"
                  edge={m.status === "blocked" ? "danger" : debt > 0 ? "warn" : "muted"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {m.name}{m.id === me.id && " (אתה)"}
                      </p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {m.role === "manager" && <Chip tone="ok">מנהל</Chip>}
                        {m.is_driver && <Chip tone="muted">נהג</Chip>}
                        {m.status === "blocked" && <Chip tone="danger">חסום</Chip>}
                        {debt > 0 && <Chip tone="warn">חוב {money(debt)}</Chip>}
                      </div>
                    </div>
                    {m.id !== me.id && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => void run(
                            () => api.updateMember(m.id, {
                              role: m.role === "manager" ? "member" : "manager",
                            }),
                            m.role === "manager" ? "התפקיד הוסר" : "מונה למנהל",
                          )}>
                          {m.role === "manager" ? "הסרת ניהול" : "מינוי למנהל"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => void run(
                            () => api.updateMember(m.id, {
                              status: m.status === "blocked" ? "active" : "blocked",
                            }),
                            m.status === "blocked" ? "החסימה הוסרה" : "החבר נחסם",
                          )}>
                          {m.status === "blocked" ? "ביטול חסימה" : "חסימה"}
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </Section>
        </>
      )}

      {/* ================= מדיניות ================= */}
      {tab === "policy" && (
        <Section title="כללי הארגון">
          {/* מתג נשמר מיד בלחיצה, בלי כפתור שמירה: זו החלטה בודדת ולא טופס */}
          <Card className="mb-3">
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <span>
                <span className="font-medium">אישור מיידי של מצטרפים</span>
                <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                  כשהמתג דלוק, כל מי שמזין את קוד הצוות נכנס מיד בלי לחכות לך.
                  כשהוא כבוי, כל מצטרף ממתין לאישורך ברשימת החברים.
                </span>
              </span>
              <input
                type="checkbox"
                className="mt-1 h-[18px] w-[18px] shrink-0 accent-[hsl(var(--primary))]"
                checked={autoApprove}
                onChange={(e) => {
                  const next = e.target.checked;
                  void run(
                    () => api.updateOrgSettings(org.id, { ...(s as object), auto_approve_members: next }),
                    next ? "מצטרפים חדשים יאושרו מיד" : "מצטרפים חדשים ימתינו לאישורך",
                  );
                }}
              />
            </label>
          </Card>

          <Card>
            <Field label="מחיר ברירת מחדל לנסיעה"
              hint="הנהג יכול לשנות בכל נסיעה. זה רק המספר שמופיע מראש.">
              <Input type="number" min="0" step="0.5" dir="ltr"
                value={setting("default_price", 15)}
                onChange={(e) => setSettings({ ...settings, default_price: e.target.value })} />
            </Field>
            <Field label="שעות לפני הנסיעה שבהן ביטול עדיין מחייב"
              hint="ביטול מאוחר יותר: הנוסע עדיין מחויב. זה מה שמונע ביטולים ברגע האחרון.">
              <Input type="number" min="0" max="48" dir="ltr"
                value={setting("cancel_deadline_hours", 3)}
                onChange={(e) => setSettings({ ...settings, cancel_deadline_hours: e.target.value })} />
            </Field>
            <Field label="אחוז חיוב בביטול מאוחר" hint="100 = חיוב מלא, 50 = חצי, 0 = בלי חיוב">
              <Input type="number" min="0" max="100" dir="ltr"
                value={setting("cancel_charge_pct", 100)}
                onChange={(e) => setSettings({ ...settings, cancel_charge_pct: e.target.value })} />
            </Field>
            <Field label="ימים עד אישור אוטומטי של תשלום"
              hint="אם הנהג לא אישר תוך כך, התשלום יאושר לבד. מונע חובות תקועים לנצח. 0 = כבוי.">
              <Input type="number" min="0" max="60" dir="ltr"
                value={setting("auto_confirm_days", 7)}
                onChange={(e) => setSettings({ ...settings, auto_confirm_days: e.target.value })} />
            </Field>
            <Field label="שעות לפני הנסיעה שבהן היא נסגרת להצטרפות"
              hint="אחרי זה הנהג יודע סופית מי נוסע.">
              <Input type="number" min="0" max="24" dir="ltr"
                value={setting("lock_ride_hours_before", 2)}
                onChange={(e) => setSettings({ ...settings, lock_ride_hours_before: e.target.value })} />
            </Field>
            <Field label="לכמה שבועות קדימה מתפרסמות נסיעות קבועות">
              <Input type="number" min="1" max="12" dir="ltr"
                value={setting("publish_weeks_ahead", 4)}
                onChange={(e) => setSettings({ ...settings, publish_weeks_ahead: e.target.value })} />
            </Field>

            <Button
              disabled={Object.keys(settings).length === 0}
              onClick={() => {
                const merged: Record<string, unknown> = { ...(s as object) };
                for (const [k, v] of Object.entries(settings)) merged[k] = Number(v);
                void run(() => api.updateOrgSettings(org.id, merged), "המדיניות עודכנה")
                  .then(() => setSettings({}));
              }}>
              שמירת המדיניות
            </Button>
          </Card>
        </Section>
      )}

      {/* ================= נקודות איסוף ================= */}
      {tab === "stops" && (
        <>
          <Section title="הוספת נקודה">
            <Card>
              <Field label="שם הנקודה" hint="איך העמיתים מכירים אותה">
                <Input value={stopName} onChange={(e) => setStopName(e.target.value)}
                  placeholder="כיכר המושבה" />
              </Field>
              <Field label="כתובת" hint="לא חובה. משמשת לכפתור הניווט">
                <Input value={stopAddr} onChange={(e) => setStopAddr(e.target.value)}
                  placeholder="הרצל 1, פתח תקווה" />
              </Field>
              <Button disabled={!stopName.trim()}
                onClick={() => void run(
                  () => api.createStop(org.id, stopName.trim(), stopAddr.trim() || undefined),
                  "הנקודה נוספה",
                ).then(() => { setStopName(""); setStopAddr(""); })}>
                הוספה
              </Button>
            </Card>
          </Section>

          <Section title={`נקודות קיימות (${stops.length})`}>
            {stops.length === 0 ? (
              <Empty title="אין עדיין נקודות איסוף"
                hint="נקודות קבועות חוסכות לנהגים ולנוסעים תיאום בכל נסיעה." />
            ) : (
              <div className="card-surface divide-y divide-border">
                {stops.map((st) => (
                  <div key={st.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{st.name}</p>
                      {st.address && (
                        <p className="text-xs text-muted-foreground truncate">{st.address}</p>
                      )}
                    </div>
                    <button
                      className="text-xs text-[hsl(var(--danger))] hover:underline shrink-0"
                      onClick={() => {
                        if (confirm(`למחוק את "${st.name}"?`)) {
                          void run(() => api.deleteStop(st.id), "הנקודה נמחקה");
                        }
                      }}>
                      מחיקה
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}
