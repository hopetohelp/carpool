import { MagnifyingGlass } from "@phosphor-icons/react";
import { useState } from "react";
import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Chip, Money, Section, Empty } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import {
  friendlyDate, shortTime, directionLabel, bookingStatusLabel,
  rideStatusLabel, untilDeparture,
} from "@/lib/format";
import {
  downloadIcs, googleCalendarLink, navigationLink, rideMessage, whatsappLink,
} from "@/lib/share";

export default function RideDetail({ rideId }: { rideId: string }) {
  const {
    me, org, rides, memberById, contactOf, stopById, stops, bookingsOf, myBookingFor, run,
  } = useApp();
  const [pickupStop, setPickupStop] = useState<string>("");
  const [closing, setClosing] = useState(false);
  const [attended, setAttended] = useState<Set<string>>(new Set());

  const ride = rides.find((r) => r.id === rideId);
  if (!me || !org) return null;
  if (!ride) {
    return (
      <Empty
        icon={<MagnifyingGlass size={22} />}
        title="הנסיעה לא נמצאה"
        hint="ייתכן שהיא בוטלה או שעברה להיסטוריה רחוקה."
      />
    );
  }

  const driver = memberById(ride.driver_id);
  const driverContact = contactOf(ride.driver_id);
  const stop = stopById(ride.origin_stop_id);
  const bookings = bookingsOf(ride.id);
  const mine = myBookingFor(ride.id);
  const iAmDriver = ride.driver_id === me.id;
  const free = Math.max(0, ride.seats_total - ride.seats_taken);
  const joinable = ["open", "full"].includes(ride.status) && !iAmDriver && !mine;

  const requests = bookings.filter((b) => b.status === "requested");
  const approved = bookings.filter((b) => ["approved", "rode"].includes(b.status));
  const waitlist = bookings.filter((b) => b.status === "waitlisted");

  const navLink = navigationLink(stop ?? ride.origin_text);

  function toggleAttended(id: string) {
    setAttended((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <button onClick={() => history.back()}
        className="text-sm text-muted-foreground mb-3 hover:underline">
        › חזרה
      </button>

      {/* ---------- ראש הנסיעה ---------- */}
      <Card edge={ride.status === "cancelled" ? "danger" : iAmDriver || mine ? "ok" : "muted"}
        className="mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="text-xl font-bold">
              {friendlyDate(ride.ride_date)},{" "}
              <span className="num">{shortTime(ride.depart_time)}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {directionLabel(ride.direction)}
              {iAmDriver ? " · אתה הנהג" : ` · ${driver?.name}`}
            </p>
          </div>
          <div className="text-left shrink-0">
            {ride.price > 0 && <Money amount={ride.price} />}
            <p className="text-[11px] text-muted-foreground">לנוסע</p>
          </div>
        </div>

        <dl className="text-sm space-y-1 mb-3">
          {(stop?.name || ride.origin_text) && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0">יציאה מ</dt>
              <dd>{stop?.name ?? ride.origin_text}{stop?.address && ` (${stop.address})`}</dd>
            </div>
          )}
          {ride.dest_text && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0">יעד</dt>
              <dd>{ride.dest_text}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">מקומות</dt>
            <dd><span className="num">{ride.seats_taken}</span> מתוך <span className="num">{ride.seats_total}</span>
              {free > 0 && ` · ${free} פנויים`}</dd>
          </div>
          {ride.notes && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0">הערה</dt>
              <dd>{ride.notes}</dd>
            </div>
          )}
        </dl>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip tone={ride.status === "cancelled" ? "danger" : "muted"}>
            {rideStatusLabel[ride.status]}
          </Chip>
          {ride.status !== "closed" && ride.status !== "cancelled" && (
            <Chip tone="muted">{untilDeparture(ride.departs_at)}</Chip>
          )}
          {ride.auto_approve && <Chip tone="ok">אישור אוטומטי</Chip>}
        </div>
      </Card>

      {/* ---------- פעולת הנוסע ---------- */}
      {joinable && (
        <Section title="הצטרפות לנסיעה">
          <Card>
            {stops.length > 0 && (
              <label className="block mb-3">
                <span className="block text-sm font-medium mb-1">נקודת איסוף</span>
                <select value={pickupStop} onChange={(e) => setPickupStop(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3">
                  <option value="">לא משנה לי</option>
                  {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            <Button className="w-full"
              onClick={() => void run(
                () => api.requestBooking(ride.id, 1, pickupStop || null),
                ride.auto_approve ? "הצטרפת לנסיעה" : "הבקשה נשלחה לנהג",
              )}>
              {free > 0
                ? (ride.auto_approve ? "הצטרפות לנסיעה" : "בקשת הצטרפות")
                : "הצטרפות לרשימת המתנה"}
            </Button>
            {free <= 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                הנסיעה מלאה. אם מישהו יבטל, תיכנס אוטומטית ותקבל התראה.
              </p>
            )}
          </Card>
        </Section>
      )}

      {mine && ["requested", "approved", "waitlisted"].includes(mine.status) && (
        <Section title="ההרשמה שלך">
          <Card edge={mine.status === "approved" ? "ok" : "warn"}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <Chip tone={mine.status === "approved" ? "ok" : "warn"}>
                {bookingStatusLabel[mine.status]}
              </Chip>
              {mine.pickup_stop_id && (
                <span className="text-sm text-muted-foreground">
                  איסוף: {stopById(mine.pickup_stop_id)?.name}
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {mine.status === "approved" && (
                <>
                  <Button size="sm" variant="outline"
                    onClick={() => downloadIcs(ride, driver, stop)}>הוספה ליומן</Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={googleCalendarLink(ride, driver, stop)} target="_blank" rel="noreferrer">
                      יומן גוגל
                    </a>
                  </Button>
                  {navLink && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={navLink} target="_blank" rel="noreferrer">ניווט לאיסוף</a>
                    </Button>
                  )}
                  {driverContact?.phone && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={whatsappLink(`היי ${driver?.name}, לגבי הנסיעה ב${friendlyDate(ride.ride_date)}…`, driverContact.phone)}
                        target="_blank" rel="noreferrer">וואטסאפ לנהג</a>
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="outline"
                className="text-[hsl(var(--danger))] border-[hsl(var(--danger))]"
                onClick={() => {
                  const hours = org.settings?.cancel_deadline_hours ?? 3;
                  const late =
                    new Date(ride.departs_at).getTime() - hours * 3600_000 < Date.now();
                  const msg = late
                    ? `ביטול פחות מ-${hours} שעות לפני הנסיעה. לפי מדיניות הארגון החיוב יישאר בתוקף. לבטל בכל זאת?`
                    : "לבטל את ההרשמה לנסיעה?";
                  if (confirm(msg)) void run(() => api.cancelBooking(mine.id), "ההרשמה בוטלה");
                }}>
                ביטול ההרשמה
              </Button>
            </div>
          </Card>
        </Section>
      )}

      {/* ---------- ניהול הנהג ---------- */}
      {iAmDriver && requests.length > 0 && (
        <Section title={`בקשות הצטרפות (${requests.length})`}>
          {requests.map((b) => {
            const p = memberById(b.passenger_id);
            return (
              <Card key={b.id} edge="warn" className="mb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.pickup_stop_id ? `איסוף: ${stopById(b.pickup_stop_id)?.name}` : "בלי נקודת איסוף"}
                      {b.note && ` · ${b.note}`}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm"
                      onClick={() => void run(() => api.decideBooking(b.id, true), "הבקשה אושרה")}>
                      אישור
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => {
                        const reason = prompt("סיבה לדחייה (לא חובה, תישלח לנוסע):") ?? undefined;
                        void run(() => api.decideBooking(b.id, false, reason), "הבקשה נדחתה");
                      }}>
                      דחייה
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </Section>
      )}

      {/* ---------- רשימת הנוסעים ---------- */}
      <Section title={`נוסעים (${approved.length})`}>
        {approved.length === 0 ? (
          <Empty title="אין עדיין נוסעים רשומים"
            hint={iAmDriver ? "שווה לשתף את הנסיעה בצ׳אט של הצוות." : undefined} />
        ) : (
          approved.map((b) => {
            const p = memberById(b.passenger_id);
            const c = contactOf(b.passenger_id);
            return (
              <Card key={b.id} className="mb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {b.passenger_id === me.id ? "אתה" : p?.name}
                      {b.source === "subscription" && (
                        <span className="text-xs text-muted-foreground"> · מנוי קבוע</span>
                      )}
                    </p>
                    {b.pickup_stop_id && (
                      <p className="text-xs text-muted-foreground">
                        איסוף: {stopById(b.pickup_stop_id)?.name}
                      </p>
                    )}
                  </div>
                  {c?.phone && b.passenger_id !== me.id && (
                    <a href={whatsappLink("היי, לגבי הנסיעה…", c.phone)}
                      target="_blank" rel="noreferrer"
                      className="text-sm underline text-muted-foreground shrink-0">
                      וואטסאפ
                    </a>
                  )}
                </div>
              </Card>
            );
          })
        )}
        {waitlist.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {waitlist.length} ברשימת המתנה, ייכנסו אוטומטית אם יתפנה מקום.
          </p>
        )}
      </Section>

      {/* ---------- פעולות הנהג ---------- */}
      {iAmDriver && ride.status !== "closed" && ride.status !== "cancelled" && (
        <Section title="ניהול הנסיעה">
          <Card>
            <div className="flex gap-2 flex-wrap mb-3">
              <Button size="sm" variant="outline" asChild>
                <a href={whatsappLink(rideMessage(ride, driver, stop))}
                  target="_blank" rel="noreferrer">שיתוף בוואטסאפ</a>
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => downloadIcs(ride, driver, stop)}>הוספה ליומן</Button>
            </div>

            {!closing ? (
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={() => {
                  setAttended(new Set(approved.map((b) => b.passenger_id)));
                  setClosing(true);
                }}>
                  סגירת הנסיעה ויצירת חיובים
                </Button>
                <Button size="sm" variant="outline"
                  className="text-[hsl(var(--danger))] border-[hsl(var(--danger))]"
                  onClick={() => {
                    const reason = prompt("סיבת הביטול (תישלח לכל הנוסעים):") ?? undefined;
                    if (reason !== undefined && confirm("לבטל את הנסיעה כולה?")) {
                      void run(() => api.cancelRide(ride.id, reason), "הנסיעה בוטלה");
                    }
                  }}>
                  ביטול הנסיעה
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium mb-2">מי באמת נסע?</p>
                <p className="text-xs text-muted-foreground mb-3">
                  מי שמסומן ייווצר לו חיוב של {ride.price} ₪. מי שלא, לא יחויב.
                </p>
                {approved.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={attended.has(b.passenger_id)}
                      onChange={() => toggleAttended(b.passenger_id)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    <span>{memberById(b.passenger_id)?.name}</span>
                  </label>
                ))}
                <div className="flex gap-2 mt-3">
                  <Button size="sm"
                    onClick={() => void run(
                      () => api.closeRide(ride.id, Array.from(attended)),
                      "הנסיעה נסגרה והחיובים נוצרו",
                    ).then(() => { setClosing(false); go("/mine"); })}>
                    אישור וסגירה
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setClosing(false)}>
                    ביטול
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Section>
      )}
    </>
  );
}
