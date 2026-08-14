import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// רכיבים קטנים שחוזרים בכל המסכים.
// כל אחד מהם מיישם את כללי השפה העיצובית שב-index.css: פינה אחת לכל תפקיד,
// מבטא אחד, ומשוב פיזי קצר בלחיצה.

export function Chip({
  tone = "muted", children, className,
}: {
  tone?: "ok" | "warn" | "danger" | "muted";
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("chip", `chip-${tone}`, className)}>{children}</span>;
}

export function Card({
  children, className, edge, onClick, index,
}: {
  children: ReactNode;
  className?: string;
  edge?: "ok" | "warn" | "danger" | "muted";
  onClick?: () => void;
  /** מיקום ברשימה — קובע את סדר הכניסה לתצוגה */
  index?: number;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
      className={cn(
        "card-surface p-4 w-full text-right",
        index !== undefined && "enter",
        edge && `edge-${edge}`,
        onClick && "card-tap hover:bg-secondary/40 transition-colors",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Section({
  title, action, children, className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-7", className)}>
      {(title || action) && (
        <div className="flex items-baseline justify-between mb-2">
          {title && <h2 className="section-title mb-0">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="card-surface px-6 py-8 text-center">
      {icon && (
        <div className="mx-auto mb-3 h-11 w-11 grid place-items-center rounded-full
                        bg-secondary text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function Field({
  label, hint, error, children,
}: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {/* שגיאה מתחת לשדה, לא בהודעה צפה — כדי שברור לאיזה שדה היא שייכת */}
      {error
        ? <span className="block text-xs text-[hsl(var(--danger))] mt-1.5 font-medium">{error}</span>
        : hint
          ? <span className="block text-xs text-muted-foreground mt-1.5">{hint}</span>
          : null}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
}>(function TextInput({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        "w-full rounded-[var(--radius)] border bg-card px-3.5 py-2.5",
        "placeholder:text-muted-foreground/70",
        "transition-shadow duration-150",
        invalid ? "border-[hsl(var(--danger))]" : "border-input",
        className,
      )}
    />
  );
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};

export function Button({
  variant = "primary", size = "md", loading, icon, block, className, children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold",
        "transition-[transform,background-color,border-color] duration-150",
        "active:translate-y-[1px] disabled:opacity-55 disabled:pointer-events-none",
        size === "lg" ? "px-5 py-3 text-[15px]" : "px-4 py-2.5 text-sm",
        block && "w-full",
        variant === "primary" &&
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary)/0.92)]",
        variant === "secondary" &&
          "border border-border bg-card hover:bg-secondary",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-secondary hover:text-foreground",
        variant === "danger" &&
          "bg-[hsl(var(--danger))] text-white hover:bg-[hsl(var(--danger)/0.92)]",
        className,
      )}
    >
      {loading ? <CircleNotch size={17} weight="bold" className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Money({ amount, tone }: { amount: number; tone?: "ok" | "warn" | "danger" }) {
  const color =
    tone === "ok" ? "text-[hsl(var(--ok))]"
    : tone === "warn" ? "text-[hsl(var(--warn))]"
    : tone === "danger" ? "text-[hsl(var(--danger))]"
    : "";
  const n = Number(amount ?? 0);
  return (
    <span className={cn("num font-semibold", color)}>
      {Number.isInteger(n) ? n : n.toFixed(2)} ₪
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <CircleNotch size={26} weight="bold" className="animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
