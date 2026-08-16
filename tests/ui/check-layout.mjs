// ============================================================================
// בדיקת פריסה — הריפוד מעל סרגל הניווט התחתון
//
// למה יש בדיקה לדבר קטן כזה: התקלה הזו כבר קרתה, והיא לא הרעישה. מחלקת
// הריפוד הוגדרה בשכבת base של Tailwind, ושם היא מפסידה לכל מחלקת ריפוד
// רגילה על אותו רכיב — כי שכבת ה-utilities נטענת אחריה. התוצאה הייתה
// שורת כפתורים אחרונה שמסתתרת מאחורי הסרגל בכל מסך בכלי, בלי שום שגיאה.
//
// שתי בדיקות, שתיהן בלי דפדפן ובלי תלויות:
//   1. במקור — אף רכיב לא משלב `pad-nav` עם מחלקת ריפוד תחתון משלו.
//   2. בתוצר הבנייה (אם קיים) — הכלל של `pad-nav` מופיע אחרי כללי הריפוד
//      של Tailwind, ולכן גובר עליהם.
// ============================================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const failures = [];
const passes = [];

const check = (name, ok, detail) => {
  (ok ? passes : failures).push(detail ? `${name} — ${detail}` : name);
  console.log(`${ok ? "✓" : "✗ נכשלה:"}  ${name}`);
};

// ---------------------------------------------------------------- 1. במקור

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name))
    : /\.(tsx|ts)$/.test(e.name) ? [join(dir, e.name)]
    : []);
}

const conflicts = [];
for (const file of sourceFiles(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  // כל מחרוזת מחלקות שמכילה pad-nav — בודקים שאין בה ריפוד תחתון נוסף
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const classes = m[1] ?? m[2] ?? "";
    if (!classes.includes("pad-nav")) continue;
    const clash = classes.match(/\b(py|pb)-[\w.[\]]+/);
    if (clash) conflicts.push(`${file.replace(ROOT, "")}: ${clash[0]}`);
  }
}
check(
  "אין רכיב שמשלב pad-nav עם ריפוד תחתון משלו",
  conflicts.length === 0,
  conflicts.join(" · "),
);

// -------------------------------------------------- 2. בתוצר הבנייה
const distDir = join(ROOT, "dist", "assets");
if (!existsSync(distDir)) {
  console.log("○  דילוג על בדיקת ה-CSS הבנוי: אין תיקיית dist. להרצה מלאה: npm run build");
} else {
  const cssFile = readdirSync(distDir).find((f) => f.endsWith(".css"));
  const css = readFileSync(join(distDir, cssFile), "utf8");

  const padNavAt = css.indexOf(".pad-nav{");
  check("המחלקה pad-nav קיימת בתוצר הבנייה", padNavAt >= 0);

  if (padNavAt >= 0) {
    check(
      "הריפוד מתחשב בשוליים הבטוחים של המכשיר",
      /\.pad-nav\{padding-bottom:calc\([^)]*env\(safe-area-inset-bottom\)/.test(css),
    );

    // כל כלל של Tailwind שקובע padding-bottom חייב להופיע לפני pad-nav
    const later = [...css.matchAll(/\.(p[by]-[\w\\.]+)\{[^}]*padding-bottom/g)]
      .filter((m) => m.index > padNavAt)
      .map((m) => m[1]);
    check(
      "כלל pad-nav גובר על מחלקות הריפוד של Tailwind",
      later.length === 0,
      later.length ? `מופיעות אחריו: ${later.join(", ")}` : "",
    );
  }
}

// ---------------------------------------------------------------- סיכום
console.log(`\n${passes.length} עברו, ${failures.length} נכשלו`);
if (failures.length) {
  console.error("\nנכשלו:\n" + failures.map((f) => `  · ${f}`).join("\n"));
  process.exit(1);
}
