import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Chip, Empty, Field, Money as Amount, Section } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import type { Ride, RideDirection, RideTemplate } from "@/lib/types";
import { dayName, friendlyDate, isoDate, shortTime, money } from "@/lib/format";
import { rideMessage, whatsappLink } from "@/lib/share";

// ============================================================================
// המרחב של הנהג — כאן הוא מעדכן מתי הוא נוסע.
// נסיעה חד-פעמית או נסיעה קבועה שמתפרסמת לבד לחודש קדימה.
// ============================================================================

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** עריכת נסיעה קבועה, כולל יישור הנסיעות שכבר פורסמו ממנה */
function TemplateEditForm({ t, onDone }: { t: RideTemplate; onDone: () => void }) {
  const { stops, run } = useApp();
  const [days, setDays] = useState<number[]>(t.days_of_week);
  const [time, setTime] = useState(t.depart_time.slice(0, 5));
  const [seats, setSeats] = useState(String(t.seats_total));
  const [price, setPrice] = useState(String(t.price));
  const [stopId, setStopId] = useState(t.origin_stop_id ?? "");
  const [dest, setDest] = useState(t.dest_text ?? "");
  const [auto, setAuto] = useState(t.auto_approve);
  const [applyFuture, setApplyFuture] = useState(true);

  return (
    <div>
      <Field label="ימים בשבוע">
        <div className="flex gap-1 flex-wrap">
          {WEEKDAYS.map((d) => (
            <button key={d} type="button"
              onClick={() => setDays((prev) =>
                prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
              className={`px-2.5 py-1.5 rounded-md border text-sm ${
                days.includes(d)
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                  : "border-input"
              }`}>
              {dayName(d).slice(0, 3)}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="שעת יציאה">
          <Input type="time" value={time} dir="ltr" onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="מקומות">
          <Input type="number" min="1" max="8" value={seats} dir="ltr"
            onChange={(e) => setSeats(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="מחיר לנוסע">
          <Input type="number" min="0" step="0.5" value={price} dir="ltr"
            onChange={(e) => setPrice(e.target.value)} />
        </Field>
        {stops.length > 0 && (
          <Field label="נקודת יציאה">
            <select value={stopId} onChange={(e) => setStopId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3">
              <option value="">בלי נקודה קבועה</option>
              {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      <Field label="יעד" hint="לא חובה">
        <Input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="המשרד" />
      </Field>

      <label className="flex items-start gap-2 mb-3 text-sm cursor-pointer">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)}
          className="h-4 w-4 mt-0.5 accent-[hsl(var(--primary))]" />
        <span>אישור אוטומטי לכל מי שנרשם</span>
      </label>

      {/* השאלה שקובעת אם השינוי משאיר שבוע מעורבב או לוח נקי */}
      <label className="flex items-start gap-2 mb-4 text-sm cursor-pointer">
        <input type="checkbox" checked={applyFuture}
          onChange={(e) => setApplyFuture(e.target.checked)}
          className="h-4 w-4 mt-0.5 accent-[hsl(var(--primary))]" />
        <span>
          לעדכן גם נסיעות שכבר פורסמו
          <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
            בלי זה הנסיעות של השבועות הקרובים יישארו בשעה הישנה, והלוח יערבב
            שתי שעות של אותה נסיעה. הנוסעים הרשומים יקבלו התראה על השינוי.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button size="sm" disabled={days.length === 0}
          onClick={() => void run(
            () => api.updateTemplate(t.id, {
              days, time, seats: Number(seats) || t.seats_total,
              price: Number(price) || 0,
              stopId: stopId || null, dest: dest.trim() || null, autoApprove: auto,
            }, applyFuture),
            "הנסיעה הקבועה עודכנה",
          ).then(onDone)}>
          שמירה
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>ביטול</Button>
      </div>
    </div>
  );
}

export default function DriverSpace() {
  const {
    me, org, rides, bookings, balances, stops, templates, members, memberById, run, ask,
  } = useApp();
  const [trusted, setTrusted] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"once" | "recurring" | null>(null);
  const [justPublished, setJustPublished] = useState<Ride | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  const [date, setDate] = useState(isoDate(new Date(Date.now() + 86400000)));
  const [time, setTime] = useState("07:30");
  const [direction, setDirection] = useState<RideDirection>("to_work");
  const [seats, setSeats] = useState("3");
  const [price, setPrice] = useState("");
  const [stopId, setStopId] = useState("");
  const [originText, setOriginText] = useState("");
  const [dest, setDest] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [notes, setNotes] = useState("");

  const loadTrusted = useCallback(async () => {
    if (!me) return;
    try {
      const rows = await api.listTrusted(me.id);
      setTrusted(new Set((rows as { passenger_id: string }[]).map((r) => r.passenger_id)));
    } catch {
      /* רשימה ריקה עדיפה על מסך שבור */
    }
  }, [me]);
  useEffect(() => { void loadTrusted(); }, [loadTrusted]);

  if (!me || !org) return null;

  const otherMembers = members.filter((m) => m.id !== me.id && m.status === "active");
  const defaultPrice = org.settings?.default_price ?? 15;
  const myRides = rides
    .filter((r) => r.driver_id === me.id && r.status !== "cancelled")
    .sort((a, b) => a.departs_at.localeCompare(b.departs_at));
  const upcomingAll = myRides.filter(
    (r) => new Date(r.departs_at).getTime() > Date.now() - 3 * 3600_000 && r.status !== "closed",
  );
  // נסיעות קבועות מפורסמות לחודש קדימה. הצגה של כולן היא רשימה אינסופית
  // ולא שימושית — מציגים את השבוע הקרוב, ומציינים כמה עוד פורסמו.
  const weekAhead = Date.now() + 7 * 86400_000;
  const upcoming = upcomingAll.filter((r) => new Date(r.departs_at).getTime() <= weekAhead);
  const laterCount = upcomingAll.length - upcoming.length;
  const myTemplates = templates.filter((t) => t.driver_id === me.id);

  const myRideIds = new Set(myRides.map((r) => r.id));
  const pendingRequests = bookings.filter(
    (b) => b.status === "requested" && myRideIds.has(b.ride_id),
  );

  const owedToMe = balances.filter((b) => b.payee_id === me.id);
  const totalOwed = owedToMe.reduce((s, b) => s + Number(b.owed), 0);
  const totalPending = owedToMe.reduce((s, b) => s + Number(b.pending), 0);
  const totalEarned = owedToMe.reduce((s, b) => s + Number(b.paid), 0);

  const closedRides = myRides.filter((r) => r.status === "closed");
  const avgOccupancy = closedRides.length
    ? closedRides.reduce((s, r) => s + r.seats_taken / r.seats_total, 0) / closedRides.length
    : 0;

  function resetForm() {
    setMode(null);
    setPrice("");
    setDest("");
    setNotes("");
  }

  async function publishOnce() {
    const ride = await run(
      () => api.createRide({
        org_id: org!.id, driver_id: me!.id, ride_date: date, depart_time: time,
        direction, seats_total: Number(seats) || 3,
        price: price === "" ? defaultPrice : Number(price),
        origin_stop_id: stopId || null,
        origin_text: stopId ? null : (originText.trim() || null),
        dest_text: dest || null,
        auto_approve: autoApprove, notes: notes || null,
      }),
      "הנסיעה פורסמה",
    );
    // הרגע שבו הנהג הכי רוצה לשתף הוא מיד אחרי הפרסום. עד עכשיו כפתור
    // השיתוף היה קבור בתוך מסך הנסיעה, ולכן כמעט אף אחד לא הגיע אליו.
    if (ride) setJustPublished(ride);
    resetForm();
  }

  async function publishRecurring() {
    await run(
      () => api.createTemplate({
        org_id: org!.id, driver_id: me!.id, days_of_week: days, depart_time: time,
        direction, seats_total: Number(seats) || 3,
        price: price === "" ? defaultPrice : Number(price),
        origin_stop_id: stopId || null,
        origin_text: stopId ? null : (originText.trim() || null),
        dest_text: dest || null,
        auto_approve: autoApprove,
      }),
      "הנסיעה הקבועה נשמרה. הנסיעות יתפרסמו לחודש קדימה תוך כמה דקות.",
    );
    resetForm();
  }

  return (
    <>
      {/* ---------- דשבורד הנהג ---------- */}
      <Section title="הדשבורד שלך">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Card edge="ok">
            <p className="text-xs text-muted-foreground mb-1">התקבל ואושר</p>
            <Amount amount={totalEarned} tone="ok" />
          </Card>
          <Card edge={totalOwed > 0 ? "warn" : "muted"}>
            <p className="text-xs text-muted-foreground mb-1">חייבים לך</p>
            <Amount amount={totalOwed} tone={totalOwed > 0 ? "warn" : undefined} />
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Card edge={totalPending > 0 ? "warn" : "muted"} onClick={() => go("/money")}>
            <p className="text-xs text-muted-foreground mb-1">ממתין לאישורך</p>
            <Amount amount={totalPending} tone={totalPending > 0 ? "warn" : undefined} />
          </Card>
          <Card edge="muted">
            <p className="text-xs text-muted-foreground mb-1">תפוסה ממוצעת</p>
            <span className="num font-semibold">{Math.round(avgOccupancy * 100)}%</span>
          </Card>
        </div>
      </Section>

      {/* ---------- בקשות ממתינות ---------- */}
      {pendingRequests.length > 0 && (
        <Section title={`בקשות הצטרפות (${pendingRequests.length})`}>
          {pendingRequests.map((b) => {
            const r = rides.find((x) => x.id === b.ride_id);
            return (
              <Card key={b.id} edge="warn" className="mb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{memberById(b.passenger_id)?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r && `${friendlyDate(r.ride_date)} · ${shortTime(r.depart_time)}`}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm"
                      onClick={() => void run(() => api.decideBooking(b.id, true), "אושר")}>
                      אישור
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => void run(() => api.decideBooking(b.id, false), "נדחה")}>
                      דחייה
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </Section>
      )}

      {/* ---------- מיד אחרי הפרסום: להזמין אנשים ---------- */}
      {justPublished && (
        <Section title="הנסיעה באוויר">
          <Card edge="ok">
            <p className="font-medium">
              {friendlyDate(justPublished.ride_date)} ·{" "}
              <span className="num">{shortTime(justPublished.depart_time)}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-3 leading-relaxed">
              כל חברי הצוות קיבלו התראה. שיתוף בקבוצה מגיע גם למי שלא פותח את הכלי.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" asChild>
                <a target="_blank" rel="noreferrer"
                  href={whatsappLink(rideMessage(
                    justPublished, me, stops.find((s) => s.id === justPublished.origin_stop_id),
                  ))}>
                  שיתוף בוואטסאפ
                </a>
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => go(`/ride/${justPublished.id}`)}>
                פתיחת הנסיעה
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setJustPublished(null)}>
                סגירה
              </Button>
            </div>
          </Card>
        </Section>
      )}

      {/* ---------- פרסום נסיעה ---------- */}
      <Section title="פרסום נסיעה">
        {mode === null ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-auto py-3" onClick={() => setMode("once")}>
              נסיעה חד-פעמית
            </Button>
            <Button variant="outline" className="h-auto py-3" onClick={() => setMode("recurring")}>
              נסיעה קבועה
            </Button>
          </div>
        ) : (
          <Card>
            {mode === "recurring" ? (
              <Field label="ימים בשבוע" hint="הנסיעות יתפרסמו אוטומטית לחודש קדימה">
                <div className="flex gap-1 flex-wrap">
                  {WEEKDAYS.map((d) => (
                    <button key={d} type="button"
                      onClick={() => setDays((prev) =>
                        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                      className={`px-2.5 py-1.5 rounded-md border text-sm ${
                        days.includes(d)
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                          : "border-input"
                      }`}>
                      {dayName(d).slice(0, 3)}
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
              <Field label="תאריך">
                <Input type="date" value={date} min={isoDate(new Date())}
                  onChange={(e) => setDate(e.target.value)} dir="ltr" />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="שעת יציאה">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" />
              </Field>
              <Field label="כיוון">
                <select value={direction}
                  onChange={(e) => setDirection(e.target.value as RideDirection)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3">
                  <option value="to_work">לעבודה</option>
                  <option value="from_work">מהעבודה</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="מקומות פנויים">
                <Input type="number" min="1" max="8" value={seats} dir="ltr"
                  onChange={(e) => setSeats(e.target.value)} />
              </Field>
              <Field label="מחיר לנוסע" hint={`ברירת מחדל: ${money(defaultPrice)}`}>
                <Input type="number" min="0" step="0.5" dir="ltr" value={price}
                  placeholder={String(defaultPrice)}
                  onChange={(e) => setPrice(e.target.value)} />
              </Field>
            </div>

            {stops.length > 0 && (
              <Field label="נקודת יציאה">
                <select value={stopId} onChange={(e) => setStopId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3">
                  <option value="">אחר — אקליד בעצמי</option>
                  {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}

            {/* בלי זה נסיעה בארגון שעדיין אין בו נקודות איסוף נשמרה בלי שום
                מקום יציאה: אין מה להציג בכרטיס, אין כפתור ניווט, וההודעה
                בוואטסאפ יוצאת בלי נקודת המפגש */}
            {!stopId && (
              <Field label="מאיפה יוצאים"
                hint={stops.length > 0
                  ? "טקסט חופשי, למשל צומת או כתובת"
                  : "אין עדיין נקודות איסוף קבועות בארגון — אפשר פשוט לכתוב"}>
                <Input value={originText} onChange={(e) => setOriginText(e.target.value)}
                  placeholder="הכניסה לשכונה" />
              </Field>
            )}

            <Field label="יעד" hint="לא חובה">
              <Input value={dest} onChange={(e) => setDest(e.target.value)}
                placeholder="המשרד" />
            </Field>

            {mode === "once" && (
              <Field label="הערה לנוסעים" hint="לא חובה">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="יוצא בדיוק בזמן" />
              </Field>
            )}

            <label className="flex items-start gap-2 mb-4 text-sm cursor-pointer">
              <input type="checkbox" checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="h-4 w-4 mt-0.5 accent-[hsl(var(--primary))]" />
              <span>
                אישור אוטומטי
                <span className="block text-xs text-muted-foreground">
                  כל מי שנרשם נכנס מיד, בלי שתצטרך לאשר כל בקשה בנפרד.
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <Button onClick={() => void (mode === "once" ? publishOnce() : publishRecurring())}>
                {mode === "once" ? "פרסום" : "שמירת נסיעה קבועה"}
              </Button>
              <Button variant="outline" onClick={resetForm}>ביטול</Button>
            </div>
          </Card>
        )}
      </Section>

      {/* ---------- נסיעות קבועות קיימות ---------- */}
      {myTemplates.length > 0 && (
        <Section title="הנסיעות הקבועות שלך">
          {myTemplates.map((t) => (
            <Card key={t.id} className="mb-2">
              {editingTemplate === t.id ? (
                <TemplateEditForm t={t} onDone={() => setEditingTemplate(null)} />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {t.days_of_week.map((d) => dayName(d).slice(0, 3)).join(", ")} ·{" "}
                      <span className="num">{shortTime(t.depart_time)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.direction === "to_work" ? "לעבודה" : "מהעבודה"} ·{" "}
                      {t.seats_total} מקומות · {money(t.price)}
                      {t.auto_approve && " · אישור אוטומטי"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setEditingTemplate(t.id)}>
                      עריכה
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-7 text-xs text-[hsl(var(--danger))]"
                      onClick={() => void (async () => {
                        const r = await ask({
                          title: "הפסקת הנסיעה הקבועה",
                          body: `לא יתפרסמו יותר נסיעות חדשות מהתבנית הזו.
                                 נסיעות שכבר פורסמו יישארו בלוח — אפשר לבטל כל אחת בנפרד.`,
                          confirmLabel: "הפסקה",
                          danger: true,
                        });
                        if (r.ok) {
                          void run(() => api.deactivateTemplate(t.id), "הנסיעה הקבועה הופסקה");
                        }
                      })()}>
                      הפסקה
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </Section>
      )}

      {/* ---------- נוסעים מאושרים מראש ---------- */}
      {/* מובטח באפיון מזמן, והמסד תמך בזה כל הזמן: request_booking כבר בודק
          את הרשימה ומאשר אוטומטית. מה שחסר היה מסך שמאפשר לנהג לנהל אותה. */}
      <Section title="נוסעים מאושרים מראש">
        <Card>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            מי שברשימה נכנס מיד לכל נסיעה שלך, בלי שתצטרך לאשר. זה במקום
            «אישור אוטומטי» שפותח את הנסיעה לכולם.
          </p>
          {otherMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין עדיין חברים אחרים בארגון.</p>
          ) : (
            <div className="divide-y divide-border -mx-1">
              {otherMembers.map((m) => {
                const on = trusted.has(m.id);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2 px-1">
                    <span className="text-sm font-medium">{m.name}</span>
                    <Button size="sm" variant={on ? "secondary" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => void run(
                        () => on
                          ? api.removeTrusted(me.id, m.id)
                          : api.addTrusted(org.id, me.id, m.id),
                        on ? `${m.name} הוסר מהרשימה` : `${m.name} יאושר אוטומטית`,
                      ).then(loadTrusted)}>
                      {on ? "הסרה" : "אישור מראש"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Section>

      {/* ---------- הנסיעות הקרובות שלי ---------- */}
      <Section title="הנסיעות שלך בשבוע הקרוב">
        {upcoming.length === 0 ? (
          <Empty title="לא פרסמת נסיעות בשבוע הקרוב" />
        ) : (
          upcoming.map((r) => {
            const req = bookings.filter((b) => b.ride_id === r.id && b.status === "requested").length;
            return (
              <Card key={r.id} edge={req > 0 ? "warn" : "ok"} className="mb-2"
                onClick={() => go(`/ride/${r.id}`)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {friendlyDate(r.ride_date)} · <span className="num">{shortTime(r.depart_time)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="num">{r.seats_taken}</span>/<span className="num">{r.seats_total}</span> מקומות
                      {r.price > 0 && ` · ${money(r.price)} לנוסע`}
                    </p>
                  </div>
                  {req > 0 && <Chip tone="warn">{req} ממתינות</Chip>}
                </div>
              </Card>
            );
          })
        )}
        {laterCount > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            ועוד <span className="num">{laterCount}</span> נסיעות שכבר פורסמו לשבועות הבאים.
            אפשר לראות אותן בלוח הנסיעות.
          </p>
        )}
      </Section>
    </>
  );
}
