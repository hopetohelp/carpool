import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Chip } from "./ui";
import {
  friendlyDate, shortTime, directionLabel, directionIcon,
  money, bookingStatusLabel,
} from "@/lib/format";
import type { Ride } from "@/lib/types";

/** כרטיס נסיעה — הצגה אחידה בבית, בלוח ובהיסטוריה. */
export function RideCard({ ride, showDate = true }: { ride: Ride; showDate?: boolean }) {
  const { memberById, stopById, myBookingFor, me } = useApp();
  const driver = memberById(ride.driver_id);
  const stop = stopById(ride.origin_stop_id);
  const mine = myBookingFor(ride.id);
  const iAmDriver = ride.driver_id === me?.id;
  const free = Math.max(0, ride.seats_total - ride.seats_taken);

  const edge =
    ride.status === "cancelled" ? "danger"
    : mine?.status === "approved" || iAmDriver ? "ok"
    : mine?.status === "requested" || mine?.status === "waitlisted" ? "warn"
    : "muted";

  return (
    <Card edge={edge} onClick={() => go(`/ride/${ride.id}`)} className="mb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">
              {showDate && `${friendlyDate(ride.ride_date)} · `}
              <span className="num">{shortTime(ride.depart_time)}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              {directionIcon(ride.direction)} {directionLabel(ride.direction)}
            </span>
          </div>

          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {iAmDriver ? "אתה נוהג" : driver?.name}
            {(stop?.name || ride.origin_text) && ` · מ${stop?.name ?? ride.origin_text}`}
          </p>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {ride.status === "cancelled" ? (
              <Chip tone="danger">בוטלה</Chip>
            ) : mine ? (
              <Chip tone={
                mine.status === "approved" || mine.status === "rode" ? "ok"
                : mine.status === "requested" || mine.status === "waitlisted" ? "warn"
                : "muted"
              }>
                {bookingStatusLabel[mine.status]}
              </Chip>
            ) : iAmDriver ? (
              <Chip tone="ok">אתה הנהג</Chip>
            ) : free === 0 ? (
              <Chip tone="muted">מלאה</Chip>
            ) : (
              <Chip tone="muted">{free} מקומות פנויים</Chip>
            )}

            {ride.status === "locked" && <Chip tone="muted">נסגרה להצטרפות</Chip>}
            {ride.status === "closed" && <Chip tone="muted">בהיסטוריה</Chip>}
          </div>
        </div>

        {ride.price > 0 && (
          <div className="text-left shrink-0">
            <div className="num font-semibold">{money(ride.price)}</div>
            <div className="text-[11px] text-muted-foreground">לנוסע</div>
          </div>
        )}
      </div>
    </Card>
  );
}
