import { useEffect } from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowUUpLeft, Bell, CheckCircle, ClockCountdown, Confetti, HandWaving, Alarm,
  Prohibit, Receipt, WarningCircle, XCircle, PaperPlaneTilt, PencilSimple, FileText,
} from "@phosphor-icons/react";
import { useApp } from "@/store";
import { go } from "@/App";
import { Card, Empty, Section } from "@/components/app/ui";
import * as api from "@/lib/api";

// אייקון לכל סוג התראה. משפחה אחת לכל הכלי, בלי אימוג׳י.
const ICONS: Record<string, Icon> = {
  booking_request: HandWaving,
  booking_new: HandWaving,
  booking_approved: CheckCircle,
  booking_rejected: Prohibit,
  booking_waitlist: ClockCountdown,
  booking_cancelled: ArrowUUpLeft,
  waitlist_promoted: Confetti,
  ride_cancelled: XCircle,
  ride_tomorrow: Alarm,
  ride_tomorrow_driver: Alarm,
  charge_created: Receipt,
  payment_marked: PaperPlaneTilt,
  payment_confirmed: CheckCircle,
  payment_disputed: WarningCircle,
  payment_auto_confirmed: CheckCircle,
  late_cancel: WarningCircle,
  manual_ride: PencilSimple,
  debt_reminder: Bell,
  settlement: FileText,
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}

export default function Notifications() {
  const { me, notifications, refresh } = useApp();

  // פתיחת המסך מסמנת הכל כנקרא — אין טעם להכריח לחיצה נוספת
  useEffect(() => {
    if (!me) return;
    const unread = notifications.some((n) => !n.read_at);
    if (!unread) return;
    void api.markAllNotificationsRead(me.id).then(() => refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  if (!me) return null;

  return (
    <>
      <button onClick={() => history.back()}
        className="text-sm text-muted-foreground mb-3 hover:underline">› חזרה</button>

      <Section title="התראות">
        {notifications.length === 0 ? (
          <Empty icon={<Bell size={22} />} title="אין התראות"
            hint="כאן יופיעו בקשות הצטרפות, אישורים, חיובים ותזכורות." />
        ) : (
          notifications.map((n, i) => {
            const Ico = ICONS[n.kind] ?? Bell;
            return (
            <Card key={n.id} className="mb-2" index={i}
              edge={n.read_at ? "muted" : "ok"}
              onClick={n.link ? () => go(n.link!) : undefined}>
              <div className="flex gap-3">
                <span className={`shrink-0 mt-0.5 ${
                  n.read_at ? "text-muted-foreground" : "text-[hsl(var(--primary))]"}`}>
                  <Ico size={21} weight={n.read_at ? "regular" : "fill"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`font-medium ${n.read_at ? "" : "text-[hsl(var(--primary))]"}`}>
                      {n.title}
                    </p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                  )}
                </div>
              </div>
            </Card>
            );
          })
        )}
      </Section>
    </>
  );
}
