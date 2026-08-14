import { SteeringWheel } from "@phosphor-icons/react";
import { useState } from "react";
import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Empty, Field, Money, Section } from "@/components/app/ui";
import { RideCard } from "@/components/app/RideCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import { friendlyDate, isoDate, money } from "@/lib/format";

// ============================================================================
// הנסיעות שלי — עתידיות, היסטוריה, והוספה ידנית של נסיעה שלא נרשמה מראש.
// ============================================================================

export default function MyRides() {
  const { me, rides, bookings, members, charges, run } = useApp();
  const [showManual, setShowManual] = useState(false);
  const [mDriver, setMDriver] = useState("");
  const [mDate, setMDate] = useState(isoDate(new Date()));
  const [mPrice, setMPrice] = useState("15");

  if (!me) return null;

  const myBookingRideIds = new Set(
    bookings
      .filter((b) => b.passenger_id === me.id && !["cancelled", "rejected"].includes(b.status))
      .map((b) => b.ride_id),
  );
  const relevant = rides.filter(
    (r) => r.driver_id === me.id || myBookingRideIds.has(r.id),
  );
  const now = Date.now();
  // מנוי קבוע רושם אותך אוטומטית לחודש קדימה, ולכן הרשימה עלולה להיות ארוכה
  // מאוד. מציגים את השבוע הקרוב, והשאר נמצא בלוח הנסיעות.
  const weekAhead = now + 7 * 86400_000;
  const upcomingAll = relevant
    .filter((r) => new Date(r.departs_at).getTime() > now - 3 * 3600_000)
    .filter((r) => !["closed", "cancelled"].includes(r.status))
    .sort((a, b) => a.departs_at.localeCompare(b.departs_at));
  const upcoming = upcomingAll.filter((r) => new Date(r.departs_at).getTime() <= weekAhead);
  const laterCount = upcomingAll.length - upcoming.length;
  const history = relevant
    .filter((r) => ["closed", "cancelled"].includes(r.status) ||
      new Date(r.departs_at).getTime() <= now - 3 * 3600_000)
    .sort((a, b) => b.departs_at.localeCompare(a.departs_at));

  const otherDrivers = members.filter((m) => m.id !== me.id);
  const chargeFor = (rideId: string) =>
    charges.find((c) => c.ride_id === rideId && c.payer_id === me.id);

  return (
    <>
      <Section
        title="השבוע הקרוב"
        action={
          me.is_driver ? (
            <button onClick={() => go("/drive")} className="text-xs underline text-muted-foreground">
              המרחב שלי
            </button>
          ) : undefined
        }
      >
        {upcoming.length === 0 ? (
          <Empty icon={<SteeringWheel size={22} />} title="אין לך נסיעות בשבוע הקרוב"
            hint="אפשר להצטרף לנסיעה מלוח הנסיעות." />
        ) : (
          upcoming.map((r) => <RideCard key={r.id} ride={r} />)
        )}
        {laterCount > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            ועוד <span className="num">{laterCount}</span> נסיעות שאתה רשום אליהן בהמשך.
            הן נמצאות בלוח הנסיעות.
          </p>
        )}
      </Section>

      {/* ---------- הוספה ידנית ---------- */}
      <Section title="נסעת בלי להירשם מראש?">
        {!showManual ? (
          <Button variant="outline" className="w-full" onClick={() => setShowManual(true)}>
            הוספת נסיעה ידנית
          </Button>
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground mb-3">
              הנסיעה תיכנס להיסטוריה שלך וייווצר חיוב. הנהג יקבל על כך התראה.
            </p>
            <Field label="עם מי נסעת">
              <select value={mDriver} onChange={(e) => setMDriver(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3">
                <option value="">בחר נהג…</option>
                {otherDrivers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="תאריך">
              <Input type="date" value={mDate} max={isoDate(new Date())}
                onChange={(e) => setMDate(e.target.value)} dir="ltr" />
            </Field>
            <Field label="מחיר" hint="הסכום שסוכם עם הנהג לנסיעה הזו">
              <Input type="number" inputMode="decimal" min="0" step="0.5" dir="ltr"
                value={mPrice} onChange={(e) => setMPrice(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button disabled={!mDriver}
                onClick={() => void run(
                  () => api.logManualRide(mDriver, mDate, Number(mPrice) || 0),
                  "הנסיעה נוספה להיסטוריה",
                ).then(() => setShowManual(false))}>
                הוספה
              </Button>
              <Button variant="outline" onClick={() => setShowManual(false)}>ביטול</Button>
            </div>
          </Card>
        )}
      </Section>

      {/* ---------- היסטוריה ---------- */}
      <Section title="היסטוריה">
        {history.length === 0 ? (
          <Empty title="עוד אין היסטוריה"
            hint="נסיעה נכנסת להיסטוריה אוטומטית אחרי שהיא מתבצעת." />
        ) : (
          <div className="card-surface divide-y divide-border">
            {history.slice(0, 40).map((r) => {
              const ch = chargeFor(r.id);
              const iDrove = r.driver_id === me.id;
              return (
                <button key={r.id} onClick={() => go(`/ride/${r.id}`)}
                  className="w-full text-right p-3 hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {friendlyDate(r.ride_date)}
                        {r.status === "cancelled" && (
                          <span className="text-[hsl(var(--danger))]"> · בוטלה</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {iDrove ? `נהגת · ${r.seats_taken} נוסעים` : "נסעת"}
                      </p>
                    </div>
                    {ch ? (
                      <span className="text-sm shrink-0"><Money amount={ch.amount} /></span>
                    ) : iDrove && r.price > 0 ? (
                      <span className="text-sm shrink-0 text-muted-foreground num">
                        {money(r.price * r.seats_taken)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
