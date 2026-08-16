import { ArrowsClockwise, PauseCircle } from "@phosphor-icons/react";
import { useApp } from "@/store";
import { Button } from "@/components/app/ui";

// ============================================================================
// חשבון או ארגון שהושהו
//
// בלי המסך הזה מי שהושהה היה רואה כלי ריק בלי שום הסבר, או נזרק למסך
// ההצטרפות ושם נתקע ב"החשבון הזה כבר משויך לארגון" — מבוי סתום בלי דרך
// יציאה. השהיה היא מצב זמני והפיך, ולכן צריך להיות ברור שזה מה שקרה.
// ============================================================================

export default function Suspended({ kind }: { kind: "user" | "org" }) {
  const { org, refresh, signOut } = useApp();

  return (
    <div className="card-surface p-6 text-center shadow-[var(--shadow-2)] enter">
      <div className="mx-auto mb-4 h-12 w-12 grid place-items-center rounded-full
                      bg-[hsl(var(--warn-soft))] text-[hsl(var(--warn))]">
        <PauseCircle size={24} weight="fill" />
      </div>

      <h1 className="text-xl font-bold">
        {kind === "user" ? "החשבון שלך מושהה" : "הארגון מושהה"}
      </h1>

      <p className="text-muted-foreground mt-2 leading-relaxed">
        {kind === "user" ? (
          <>
            הגישה לכלי הופסקה זמנית בידי מי שמתפעל את המערכת.
            <br />
            הנתונים שלך נשמרו במלואם ויחזרו ברגע שההשהיה תוסר.
          </>
        ) : (
          <>
            הפעילות של <span className="font-semibold text-foreground">{org?.name}</span>{" "}
            הופסקה זמנית בידי מי שמתפעל את המערכת.
            <br />
            כל הנסיעות והחשבונות נשמרו ויחזרו ברגע שההשהיה תוסר. כדאי לפנות
            למנהל הארגון.
          </>
        )}
      </p>

      <Button
        variant="secondary" size="lg" className="mt-6"
        icon={<ArrowsClockwise size={17} weight="bold" />}
        onClick={() => void refresh()}
      >
        בדיקה מחדש
      </Button>

      <div className="mt-5 pt-4 border-t border-border">
        <button onClick={() => void signOut()}
          className="text-sm text-muted-foreground hover:underline">
          יציאה
        </button>
      </div>
    </div>
  );
}
