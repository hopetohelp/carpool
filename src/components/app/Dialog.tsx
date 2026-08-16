import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, TextInput } from "./ui";

// ============================================================================
// חלון אישור פנימי
//
// מחליף את confirm ו-prompt של הדפדפן. הם עבדו, אבל שברו את השפה העיצובית
// בדיוק ברגעים הרגישים ביותר — ביטול נסיעה, מחיקה, דחיית בקשה. אי אפשר
// לעצב אותם, אי אפשר לנסח בהם כפתור, ובטלפון הם נראים כמו תקלה של האתר.
//
// הממשק נשאר קצר כמו confirm, כדי שלא יהיה פיתוי לחזור אליו:
//   const r = await ask({ title: "לבטל?" });
//   if (r.ok) …
// ============================================================================

export type AskInput = {
  label: string;
  hint?: string;
  placeholder?: string;
  /** בלי ערך אי אפשר לאשר */
  required?: boolean;
};

export type AskOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** כשמוגדר, נפתח שדה טקסט והערך חוזר ב-value */
  input?: AskInput;
};

export type AskResult = { ok: boolean; value: string };

export function Dialog({
  options, onClose,
}: {
  options: AskOptions | null;
  onClose: (result: AskResult) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!options) return;
    setValue("");
    // מיקוד ראשון: שדה הטקסט אם יש, אחרת כפתור האישור — כדי שמקלדת
    // ומקריא מסך יגיעו ישר לפעולה ולא יתחילו לגלול את המסך שמאחור
    const t = setTimeout(() => (inputRef.current ?? confirmRef.current)?.focus(), 30);
    return () => clearTimeout(t);
  }, [options]);

  useEffect(() => {
    if (!options) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose({ ok: false, value: "" });
    };
    window.addEventListener("keydown", onKey);
    // נועלים גלילה ברקע, אחרת המסך שמאחורי החלון זז מתחת לאצבע
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [options, onClose]);

  if (!options) return null;

  const blocked = !!options.input?.required && value.trim() === "";
  const submit = () => { if (!blocked) onClose({ ok: true, value: value.trim() }); };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center
                 bg-[hsl(220_20%_8%/0.5)] backdrop-blur-[2px] px-3 pb-3 sm:pb-0"
      onClick={() => onClose({ ok: false, value: "" })}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="dlg-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter" && options.input) submit(); }}
        className="w-full max-w-md bg-card border border-border rounded-[var(--r-sheet)]
                   p-5 shadow-[var(--shadow-3)] enter"
      >
        <h2 id="dlg-title" className="text-lg font-bold mb-1.5">{options.title}</h2>
        {options.body && (
          <div className="text-sm text-muted-foreground leading-relaxed mb-4">
            {options.body}
          </div>
        )}

        {options.input && (
          <label className="block mb-4">
            <span className="block text-sm font-medium mb-1.5">{options.input.label}</span>
            <TextInput
              ref={inputRef}
              value={value}
              placeholder={options.input.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
            {options.input.hint && (
              <span className="block text-xs text-muted-foreground mt-1.5">
                {options.input.hint}
              </span>
            )}
          </label>
        )}

        <div className="flex gap-2">
          <Button
            ref={confirmRef}
            variant={options.danger ? "danger" : "primary"}
            disabled={blocked}
            onClick={submit}
          >
            {options.confirmLabel ?? "אישור"}
          </Button>
          <Button variant="ghost" onClick={() => onClose({ ok: false, value: "" })}>
            {options.cancelLabel ?? "ביטול"}
          </Button>
        </div>
      </div>
    </div>
  );
}
