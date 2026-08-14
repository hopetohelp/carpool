import { CalendarBlank } from "@phosphor-icons/react";
import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Chip, Empty, Money, Section } from "@/components/app/ui";
import { RideCard } from "@/components/app/RideCard";
import { Button } from "@/components/ui/button";
import { friendlyDate, shortTime, untilDeparture, directionLabel } from "@/lib/format";
import { downloadIcs, whatsappLink, rideMessage } from "@/lib/share";

// ============================================================================
// "מה הלאה" — המסך שנפתח ראשון בבוקר.
// עיקרון: הדבר הכי דחוף למעלה, ופעולה אחת ברורה לכל דבר.
// ============================================================================

export default function Home() {
  const {
    me, rides, bookings, balances, memberById, stopById, isManager,
  } = useApp();
  if (!me) return null;

  const now = Date.now();
  const upcoming = rides
    .filter((r) => new Date(r.departs_at).getTime() > now - 3 * 3600_000)
    .filter((r) => r.status !== "cancelled" && r.status !== "closed")
    .sort((a, b) => a.departs_at.localeCompare(b.departs_at));

  // הנסיעה הבאה שלי: או שאני נוהג בה, או שאני מאושר בה
  const myApproved = new Set(
    bookings
      .filter((b) => b.passenger_id === me.id && ["approved", "rode"].includes(b.status))
      .map((b) => b.ride_id),
  );
  const nextRide = upcoming.find((r) => r.driver_id === me.id || myApproved.has(r.id));

  // בקשות שממתינות לאישור שלי כנהג
  const pendingRequests = bookings.filter(
    (b) =>
      b.status === "requested" &&
      upcoming.some((r) => r.id === b.ride_id && r.driver_id === me.id),
  );

  // תשלומים שממתינים לאישור שלי כמי שאמור לקבל
  const iOwe = balances.filter((b) => b.payer_id === me.id && b.owed > 0);
  const owedToMe = balances.filter((b) => b.payee_id === me.id && b.owed > 0);
  const totalIOwe = iOwe.reduce((s, b) => s + Number(b.owed), 0);
  const totalOwedToMe = owedToMe.reduce((s, b) => s + Number(b.owed), 0);
  const pendingForMe = balances
    .filter((b) => b.payee_id === me.id && b.pending > 0)
    .reduce((s, b) => s + Number(b.pending), 0);

  // נסיעות פתוחות שאפשר להצטרף אליהן בימים הקרובים
  const joinable = upcoming
    .filter((r) => r.driver_id !== me.id)
    .filter((r) => !bookings.some((b) =>
      b.ride_id === r.id && b.passenger_id === me.id &&
      !["cancelled", "rejected"].includes(b.status)))
    .filter((r) => r.seats_total - r.seats_taken > 0)
    .filter((r) => ["open", "full"].includes(r.status))
    .slice(0, 3);

  const driver = nextRide ? memberById(nextRide.driver_id) : undefined;
  const stop = nextRide ? stopById(nextRide.origin_stop_id) : undefined;

  return (
    <>
      {/* ---------- הנסיעה הבאה ---------- */}
      <Section title="הנסיעה הקרובה שלך">
        {nextRide ? (
          <Card edge="ok">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-lg font-bold">
                  {friendlyDate(nextRide.ride_date)},{" "}
                  <span className="num">{shortTime(nextRide.depart_time)}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {nextRide.driver_id === me.id ? "אתה נוהג" : `עם ${driver?.name}`}
                  {" · "}{directionLabel(nextRide.direction)}
                  {(stop?.name || nextRide.origin_text) &&
                    ` · מ${stop?.name ?? nextRide.origin_text}`}
                </p>
              </div>
              <Chip tone="ok">{untilDeparture(nextRide.departs_at)}</Chip>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => go(`/ride/${nextRide.id}`)}>
                פרטי הנסיעה
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => downloadIcs(nextRide, driver, stop)}>
                הוספה ליומן
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={whatsappLink(rideMessage(nextRide, driver, stop))}
                  target="_blank" rel="noreferrer">שיתוף בוואטסאפ</a>
              </Button>
            </div>
          </Card>
        ) : (
          <Empty
            icon={<CalendarBlank size={22} />}
            title="אין לך נסיעה קרובה"
            hint={me.is_driver
              ? "אפשר להצטרף לנסיעה מהלוח, או לפרסם נסיעה משלך מהמרחב שלך."
              : "אפשר להצטרף לנסיעה מלוח הנסיעות."}
          />
        )}
      </Section>

      {/* ---------- מה מחכה לך ---------- */}
      {(pendingRequests.length > 0 || pendingForMe > 0) && (
        <Section title="ממתין לטיפול שלך">
          {pendingRequests.length > 0 && (
            <Card edge="warn" onClick={() => go("/drive")} className="mb-2">
              <p className="font-medium">
                {pendingRequests.length === 1
                  ? "בקשת הצטרפות אחת ממתינה לאישורך"
                  : `${pendingRequests.length} בקשות הצטרפות ממתינות לאישורך`}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                נוסעים שממתינים לתשובה. כדאי לענות לפני שיחפשו נסיעה אחרת.
              </p>
            </Card>
          )}
          {pendingForMe > 0 && (
            <Card edge="warn" onClick={() => go("/money")}>
              <p className="font-medium">
                תשלומים בסך <Money amount={pendingForMe} tone="warn" /> ממתינים לאישורך
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                נוסעים סימנו שהעבירו לך כסף. צריך לאשר שקיבלת.
              </p>
            </Card>
          )}
        </Section>
      )}

      {/* ---------- כסף בשורה אחת ---------- */}
      <Section title="מצב כספי">
        <div className="grid grid-cols-2 gap-2">
          <Card edge={totalIOwe > 0 ? "danger" : "ok"} onClick={() => go("/money")}>
            <p className="text-xs text-muted-foreground mb-1">אתה חייב</p>
            <Money amount={totalIOwe} tone={totalIOwe > 0 ? "danger" : "ok"} />
          </Card>
          <Card edge={totalOwedToMe > 0 ? "warn" : "muted"} onClick={() => go("/money")}>
            <p className="text-xs text-muted-foreground mb-1">חייבים לך</p>
            <Money amount={totalOwedToMe} tone={totalOwedToMe > 0 ? "warn" : undefined} />
          </Card>
        </div>
      </Section>

      {/* ---------- הצטרפות מהירה ---------- */}
      {joinable.length > 0 && (
        <Section
          title="נסיעות פתוחות בקרוב"
          action={
            <button onClick={() => go("/board")} className="text-xs underline text-muted-foreground">
              כל הלוח
            </button>
          }
        >
          {joinable.map((r) => <RideCard key={r.id} ride={r} />)}
        </Section>
      )}

      {/* ---------- קיצורים ---------- */}
      <Section title="פעולות">
        <div className="grid grid-cols-2 gap-2">
          {me.is_driver && (
            <Button variant="outline" className="h-auto py-3" onClick={() => go("/drive")}>
              פרסום נסיעה
            </Button>
          )}
          <Button variant="outline" className="h-auto py-3" onClick={() => go("/mine")}>
            הנסיעות שלי
          </Button>
          <Button variant="outline" className="h-auto py-3" onClick={() => go("/board")}>
            לוח שבועי
          </Button>
          {isManager && (
            <Button variant="outline" className="h-auto py-3" onClick={() => go("/manage")}>
              ניהול הארגון
            </Button>
          )}
        </div>
      </Section>
    </>
  );
}
