import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Chip } from "./ui";
import { friendlyDate, hebrewDate, shortTime, money, bookingStatusLabel } from "@/lib/format";
import type { Ride } from "@/lib/types";

// ============================================================================
// כרטיס נסיעה — הצגה אחידה בבית, בלוח ובהיסטוריה.
//
// שני כללים שמכתיבים את הכרטיס:
//
// 1. כל נתון מופיע פעם אחת. הכיוון היה כתוב פעמיים (אייקון חץ + המילים
//    «לעבודה»), והשיוך שלי לנסיעה הופיע גם כפס צבע בצד וגם כתגית. עכשיו
//    לכל נתון יש מקום אחד בלבד.
// 2. הכיוון הוא צורה ולא מילה: חוד בצד שאליו נוסעים. הלוך שמאלה, חזור
//    ימינה. זה נקרא במבט בלי לקרוא, ומפנה את השורה לטקסט שבאמת משתנה.
// ============================================================================

export function RideCard({ ride, showDate = true }: { ride: Ride; showDate?: boolean }) {
  const { memberById, stopById, myBookingFor, me } = useApp();
  const driver = memberById(ride.driver_id);
  const stop = stopById(ride.origin_stop_id);
  const mine = myBookingFor(ride.id);
  const iAmDriver = ride.driver_id === me?.id;
  const free = Math.max(0, ride.seats_total - ride.seats_taken);
  const involved = iAmDriver || mine?.status === "approved" || mine?.status === "rode";
  const cancelled = ride.status === "cancelled";

  const from = stop?.name ?? ride.origin_text;

  // מצב אחד בלבד לכל כרטיס: או שאני בה, או שהיא בוטלה, או כמה מקומות פנויים.
  // קודם הוצגו גם תגית וגם פס צבע וגם טקסט — שלושה ביטויים לאותו נתון.
  const state =
    cancelled ? { text: "בוטלה", tone: "danger" as const }
    : iAmDriver ? { text: "אתה נוהג", tone: "ok" as const }
    : mine ? { text: bookingStatusLabel[mine.status], tone:
        mine.status === "approved" || mine.status === "rode" ? "ok" as const : "warn" as const }
    : free === 0 ? { text: "מלאה", tone: "muted" as const }
    : { text: `${free} פנויים`, tone: "muted" as const };

  return (
    <Card
      onClick={() => go(`/ride/${ride.id}`)}
      className={`mb-2 ps-6 pe-4 dir ${ride.direction === "to_work" ? "dir-out" : "dir-back"} ${
        cancelled ? "dir-off" : involved ? "dir-mine" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {showDate && <>{friendlyDate(ride.ride_date)} · </>}
            <span className="num">{shortTime(ride.depart_time)}</span>
          </p>

          {/* התאריך העברי נאמר פעם אחת, ורק כשהתאריך הלועזי מוצג */}
          {showDate && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{hebrewDate(ride.ride_date)}</p>
          )}

          <p className="text-sm text-muted-foreground mt-1 truncate">
            {iAmDriver ? "אתה" : driver?.name}{from && ` · מ${from}`}
          </p>
        </div>

        <div className="text-left shrink-0 flex flex-col items-end gap-1.5">
          {ride.price > 0 && <span className="num font-semibold">{money(ride.price)}</span>}
          <Chip tone={state.tone}>{state.text}</Chip>
        </div>
      </div>
    </Card>
  );
}
