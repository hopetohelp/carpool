import { CalendarBlank } from "@phosphor-icons/react";
import { useState } from "react";
import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Chip, Empty, Section } from "@/components/app/ui";
import { RideCard } from "@/components/app/RideCard";
import { Button } from "@/components/ui/button";
import {
  addDays, dayShort, isoDate, shortDate, shortTime, startOfWeek, friendlyDate, hebrewDate,
} from "@/lib/format";

// ============================================================================
// לוח הנסיעות — שני מבטים על אותם נתונים:
// "שבועי" לסריקה מהירה של כל השבוע, ו"רשימה" לקריאה נוחה בטלפון.
// ============================================================================

export default function Board() {
  const { rides, me, memberById, myBookingFor } = useApp();
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"week" | "list">("week");

  if (!me) return null;

  const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekRides = rides.filter((r) => {
    const d = r.ride_date;
    return d >= isoDate(days[0]) && d <= isoDate(days[6]) && r.status !== "cancelled";
  });

  // הנהגים שיש להם נסיעה כלשהי השבוע — הם השורות בטבלה
  const driverIds = Array.from(new Set(weekRides.map((r) => r.driver_id)));

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex gap-1 p-1 bg-secondary rounded-lg">
          {([["week", "שבועי"], ["list", "רשימה"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-sm rounded-md ${
                view === v ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {/* בעברית החץ ימינה מוביל אחורה בזמן */}
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="שבוע קודם">›</Button>
          <span className="text-sm text-muted-foreground min-w-[92px] text-center num">
            {shortDate(isoDate(days[0]))}–{shortDate(isoDate(days[6]))}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="שבוע הבא">‹</Button>
        </div>
      </div>

      {weekRides.length === 0 ? (
        <Empty
          icon={<CalendarBlank size={22} />}
          title="אין נסיעות בשבוע הזה"
          hint={me.is_driver
            ? "אפשר לפרסם נסיעה מהמרחב שלך, או להגדיר נסיעה קבועה שתתפרסם לבד."
            : "כשנהג יפרסם נסיעה היא תופיע כאן."}
        />
      ) : view === "week" ? (
        <div className="scroll-x -mx-4 px-4 pb-2">
          <table className="w-full border-collapse text-sm min-w-[560px]">
            <thead>
              <tr>
                <th className="text-right p-2 font-medium text-muted-foreground sticky right-0 bg-background">
                  נהג
                </th>
                {days.map((d) => {
                  const isToday = isoDate(d) === isoDate(new Date());
                  return (
                    <th key={isoDate(d)}
                      className={`p-2 font-medium text-center ${
                        isToday ? "text-[hsl(var(--primary))]" : "text-muted-foreground"
                      }`}>
                      <div>{dayShort(d.getDay())}</div>
                      <div className="text-[11px] font-normal num">{shortDate(isoDate(d))}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {driverIds.map((driverId) => (
                <tr key={driverId} className="border-t border-border">
                  <td className="p-2 font-medium sticky right-0 bg-background whitespace-nowrap">
                    {driverId === me.id ? "אתה" : memberById(driverId)?.name}
                  </td>
                  {days.map((d) => {
                    const dayRides = weekRides.filter(
                      (r) => r.driver_id === driverId && r.ride_date === isoDate(d),
                    );
                    return (
                      <td key={isoDate(d)} className="p-1 align-top text-center">
                        {dayRides.map((r) => {
                          const free = r.seats_total - r.seats_taken;
                          const mine = myBookingFor(r.id);
                          const tone =
                            mine ? "bg-[hsl(var(--ok-soft))] text-[hsl(var(--ok))] font-semibold"
                            : free <= 0 ? "bg-muted text-muted-foreground"
                            : "bg-card hover:bg-secondary";
                          return (
                            <button key={r.id} onClick={() => go(`/ride/${r.id}`)}
                              className={`block w-full rounded-md border border-border px-1 py-1 mb-1 ${tone}`}
                              title={`${shortTime(r.depart_time)} · ${free} פנויים`}>
                              <div className="num text-xs">{shortTime(r.depart_time)}</div>
                              <div className="text-[10px]">
                                {free > 0 ? `${free} פנויים` : "מלאה"}
                              </div>
                            </button>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        days.map((d) => {
          const dayRides = weekRides
            .filter((r) => r.ride_date === isoDate(d))
            .sort((a, b) => a.depart_time.localeCompare(b.depart_time));
          if (!dayRides.length) return null;
          return (
            <Section key={isoDate(d)}
              title={`${friendlyDate(isoDate(d))} · ${hebrewDate(isoDate(d))}`}>
              {dayRides.map((r) => <RideCard key={r.id} ride={r} showDate={false} />)}
            </Section>
          );
        })
      )}

      {view === "week" && weekRides.length > 0 && (
        <Card className="mt-4 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-[hsl(var(--ok-soft))] border border-border" />
              נסיעה שאתה רשום אליה
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-muted border border-border" />
              מלאה
            </span>
            <Chip tone="muted">לחיצה על משבצת פותחת את הנסיעה</Chip>
          </div>
        </Card>
      )}
    </>
  );
}
