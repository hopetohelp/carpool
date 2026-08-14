import { ArrowsClockwise, HourglassMedium, Prohibit } from "@phosphor-icons/react";
import { useApp } from "@/store";
import { Button } from "@/components/app/ui";

// ============================================================================
// ממתין לאישור המנהל
//
// המצב שבין ההצטרפות לאישור. בלי מסך כזה המשתמש היה רואה כלי ריק בלי הסבר
// ולא היה מבין אם משהו נשבר או שהוא פשוט צריך לחכות.
// ============================================================================

export default function AwaitingApproval() {
  const { me, org, refresh, signOut } = useApp();
  const blocked = me?.status === "blocked";

  return (
    <div className="card-surface p-6 text-center shadow-[var(--shadow-2)] enter">
      <div className={`mx-auto mb-4 h-12 w-12 grid place-items-center rounded-full ${
        blocked
          ? "bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]"
          : "bg-[hsl(var(--warn-soft))] text-[hsl(var(--warn))]"
      }`}>
        {blocked
          ? <Prohibit size={24} weight="fill" />
          : <HourglassMedium size={24} weight="fill" />}
      </div>

      <h1 className="text-xl font-bold">
        {blocked ? "הגישה שלך נחסמה" : "ההצטרפות נשלחה"}
      </h1>

      <p className="text-muted-foreground mt-2 leading-relaxed">
        {blocked ? (
          <>מנהל הארגון חסם את הגישה שלך. כדאי לפנות אליו ישירות.</>
        ) : (
          <>
            הצטרפת ל<span className="font-semibold text-foreground">{org?.name}</span>.
            <br />
            מנהל הארגון צריך לאשר אותך, ואז הנסיעות יופיעו כאן.
          </>
        )}
      </p>

      {!blocked && (
        <Button
          variant="secondary" size="lg" className="mt-6"
          icon={<ArrowsClockwise size={17} weight="bold" />}
          onClick={() => void refresh()}
        >
          בדיקה אם אושרתי
        </Button>
      )}

      <div className="mt-5 pt-4 border-t border-border">
        <button onClick={() => void signOut()}
          className="text-sm text-muted-foreground hover:underline">
          יציאה
        </button>
      </div>
    </div>
  );
}
