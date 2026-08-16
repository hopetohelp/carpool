import { useCallback, useEffect, useState } from "react";
import {
  ArrowsClockwise, Buildings, MagnifyingGlass, Pause, Play, ShieldCheck, Trash, UsersThree,
} from "@phosphor-icons/react";
import { useApp } from "@/store";
import { Button, Card, Chip, Empty, Field, Section, Spinner, TextInput } from "@/components/app/ui";
import * as admin from "@/lib/admin";
import type { AdminOrg, AdminOrgDetail, AdminUser } from "@/lib/admin";
import { shortDate } from "@/lib/format";
import OrgRequests from "./OrgRequests";

// ============================================================================
// מסך מנהל המערכת
//
// מנהל מערכת הוא תפקיד מעל הארגונים: הוא לא חבר באף אחד מהם ולא רואה נסיעות
// או חובות של אף אדם. מה שהוא כן רואה: מי קיים, כמה משתמשים בו, ומתי.
//
// ההרשאה נאכפת במסד הנתונים, לא כאן. המסך הזה רק לא מוצג למי שאין לו אותה;
// מי שיגיע אליו בכל זאת יקבל רשימות ריקות ושגיאת הרשאה בכל פעולה.
// ============================================================================

type Tab = "requests" | "orgs" | "users";

const TABS: [Tab, string][] = [
  ["requests", "בקשות"],
  ["orgs", "ארגונים"],
  ["users", "משתמשים"],
];

export default function Admin() {
  const [tab, setTab] = useState<Tab>("requests");
  const [orgView, setOrgView] = useState<string | null>(null);

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-[hsl(var(--primary))]" />
          <h1 className="text-lg font-bold">ניהול המערכת</h1>
        </div>
        <button onClick={() => history.back()}
          className="text-sm text-muted-foreground hover:underline">› חזרה</button>
      </div>

      <div className="flex gap-1 mb-5 p-1 bg-secondary rounded-lg">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setOrgView(null); }}
            className={`flex-1 whitespace-nowrap px-3 py-1.5 text-sm rounded-md ${
              tab === t ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "requests" && <OrgRequests />}
      {tab === "orgs" && (
        orgView
          ? <OrgDetail orgId={orgView} onBack={() => setOrgView(null)} />
          : <OrgsTab onView={setOrgView} />
      )}
      {tab === "users" && <UsersTab />}
    </>
  );
}

// ---------------------------------------------------------------- עזרים

function useToast() {
  const { run } = useApp();
  return run;
}

/** שורת נתון קטנה: מספר ומתחתיו מה הוא */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="num font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div role="alert"
      className="mb-3 rounded-[var(--radius)] px-3.5 py-3 text-sm
                 bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]">
      {text}
    </div>
  );
}

/**
 * מחיקה היא בלתי הפיכה, ולכן היא דורשת הקלדת השם המדויק ולא רק לחיצה על
 * "אישור". חלון confirm רגיל נלחץ מהר מדי מכדי להגן על משהו כזה.
 */
function ConfirmDelete({
  title, hint, expected, busy, onCancel, onConfirm,
}: {
  title: string; hint: string; expected: string; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <div className="mt-4 rounded-[var(--radius)] border border-[hsl(var(--danger))] p-3.5
                    bg-[hsl(var(--danger-soft))]">
      <p className="font-semibold text-[hsl(var(--danger))]">{title}</p>
      <p className="text-sm mt-1 mb-3 leading-relaxed">{hint}</p>
      <Field label={`לאישור, הקלד/י: ${expected}`}>
        <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </Field>
      <div className="flex gap-2">
        <Button variant="danger" loading={busy}
          disabled={typed.trim() !== expected}
          icon={<Trash size={16} weight="bold" />}
          onClick={onConfirm}>
          מחיקה סופית
        </Button>
        <Button variant="ghost" onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ארגונים

function OrgsTab({ onView }: { onView: (id: string) => void }) {
  const [items, setItems] = useState<AdminOrg[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setErr(null);
      setItems(await admin.listOrgs());
    } catch (e) {
      setErr((e as Error).message);
      setItems([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, fn: () => Promise<unknown>, okMessage: string) {
    setBusy(id);
    await toast(fn, okMessage);
    setDeleting(null);
    await load();
    setBusy(null);
  }

  if (items === null) return <Spinner label="טוען ארגונים…" />;

  const term = q.trim().toLowerCase();
  const shown = term
    ? items.filter((o) =>
        o.name.toLowerCase().includes(term) || o.join_code.toLowerCase().includes(term))
    : items;

  return (
    <>
      {err && <ErrorNote text={err} />}

      <Section title={`ארגונים (${items.length})`}
        action={
          <button onClick={() => void load()}
            className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
            <ArrowsClockwise size={13} /> רענון
          </button>
        }>
        {items.length > 3 && (
          <div className="relative mb-3">
            <MagnifyingGlass size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי שם או קוד" className="pr-9" />
          </div>
        )}

        {shown.length === 0 ? (
          <Empty icon={<Buildings size={22} />} title="אין ארגונים להצגה"
            hint="ארגון נפתח אחרי אישור בקשה בלשונית הבקשות." />
        ) : shown.map((o, i) => (
          <Card key={o.id} className="mb-2" index={i}
            edge={o.suspended_at ? "danger" : o.rides > 0 ? "ok" : "muted"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">{o.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  נפתח <span className="num">{shortDate(o.created_at)}</span>
                  {" · קוד "}
                  <span className="num font-semibold tracking-[0.14em]">{o.join_code}</span>
                </p>
              </div>
              {o.suspended_at && <Chip tone="danger">מושהה</Chip>}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3 text-center">
              <Stat label="משתמשים" value={o.members_active} />
              <Stat label="ממתינים" value={o.members_pending} />
              <Stat label="כניסות" value={o.logins} />
              <Stat label="נסיעות" value={o.rides} />
            </div>

            <div className="flex gap-1.5 mt-3 flex-wrap">
              <Button size="md" variant="secondary" className="h-8 text-xs px-3"
                onClick={() => onView(o.id)}>
                צפייה
              </Button>
              <Button size="md" variant="ghost" className="h-8 text-xs px-3"
                loading={busy === o.id && !deleting}
                icon={o.suspended_at
                  ? <Play size={14} weight="bold" />
                  : <Pause size={14} weight="bold" />}
                onClick={() => void act(
                  o.id,
                  () => admin.setOrgSuspended(o.id, !o.suspended_at),
                  o.suspended_at ? "הארגון הופעל מחדש" : "הארגון הושהה",
                )}>
                {o.suspended_at ? "הפעלה מחדש" : "השהיה"}
              </Button>
              <Button size="md" variant="ghost" className="h-8 text-xs px-3
                         text-[hsl(var(--danger))] hover:text-[hsl(var(--danger))]"
                onClick={() => setDeleting(deleting === o.id ? null : o.id)}>
                מחיקה
              </Button>
            </div>

            {deleting === o.id && (
              <ConfirmDelete
                title={`מחיקת ${o.name}`}
                hint={`ימחקו גם ${o.members_total} חברים, ${o.rides} נסיעות, וכל ההרשמות,
                       החיובים והתשלומים של הארגון. אין דרך לשחזר.
                       להשהיה זמנית עדיף להשתמש בכפתור ההשהיה.`}
                expected={o.name}
                busy={busy === o.id}
                onCancel={() => setDeleting(null)}
                onConfirm={() => void act(
                  o.id, () => admin.deleteOrg(o.id), `${o.name} נמחק`,
                )}
              />
            )}
          </Card>
        ))}
      </Section>
    </>
  );
}

function OrgDetail({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<AdminOrgDetail | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [d, u] = await Promise.all([admin.orgDetail(orgId), admin.listUsers(orgId)]);
        setDetail(d);
        setUsers(u);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [orgId]);

  if (err) return <><BackLink onBack={onBack} /><ErrorNote text={err} /></>;
  if (!detail) return <Spinner label="טוען…" />;

  return (
    <>
      <BackLink onBack={onBack} />

      <Section title={detail.name}>
        <Card edge={detail.suspended_at ? "danger" : "muted"}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-sm text-muted-foreground">
              נפתח <span className="num">{shortDate(detail.created_at)}</span>
              {detail.opened_by && <> · בידי {detail.opened_by}</>}
              <br />
              קוד הצטרפות:{" "}
              <span className="num font-semibold tracking-[0.14em]">{detail.join_code}</span>
            </p>
            {detail.suspended_at && <Chip tone="danger">מושהה</Chip>}
          </div>

          <div className="grid grid-cols-4 gap-y-3 gap-x-2 text-center pt-3 border-t border-border">
            <Stat label="חברים" value={detail.members_total} />
            <Stat label="פעילים" value={detail.members_active} />
            <Stat label="ממתינים" value={detail.members_pending} />
            <Stat label="חסומים" value={detail.members_blocked} />
            <Stat label="נהגים" value={detail.drivers} />
            <Stat label="כניסות" value={detail.logins} />
            <Stat label="נסיעות" value={detail.rides} />
            <Stat label="הושלמו" value={detail.rides_closed} />
            <Stat label="בוטלו" value={detail.rides_cancelled} />
            <Stat label="הרשמות" value={detail.bookings} />
            <Stat label="נקודות איסוף" value={detail.stops} />
            <Stat label="סך חיובים" value={`${Math.round(Number(detail.charged))} ₪`} />
          </div>

          {detail.last_ride_at && (
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
              נסיעה אחרונה: <span className="num">{shortDate(detail.last_ride_at)}</span>
            </p>
          )}
        </Card>
      </Section>

      <Section title={`המשתמשים בארגון (${users.length})`}>
        {users.length === 0 ? (
          <Empty icon={<UsersThree size={22} />} title="אין עדיין משתמשים בארגון" />
        ) : (
          <div className="card-surface divide-y divide-border">
            {users.map((u) => (
              <div key={u.user_id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{u.display_name ?? "בלי שם"}</p>
                    <p className="text-xs text-muted-foreground truncate num">{u.email}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                    {u.member_role === "manager" && <Chip tone="ok">מנהל</Chip>}
                    {u.member_status === "pending" && <Chip tone="warn">ממתין</Chip>}
                    {u.member_status === "blocked" && <Chip tone="danger">חסום</Chip>}
                    {u.suspended_at && <Chip tone="danger">מושהה</Chip>}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  <span className="num">{u.login_count}</span> כניסות ·{" "}
                  <span className="num">{u.rides_driven}</span> נהיגות ·{" "}
                  <span className="num">{u.rides_taken}</span> נסיעות
                  {u.last_login && <> · אחרונה <span className="num">{shortDate(u.last_login)}</span></>}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack}
      className="text-sm text-muted-foreground mb-3 hover:underline">
      › חזרה לרשימת הארגונים
    </button>
  );
}

// ---------------------------------------------------------------- משתמשים

type UserFilter = "all" | "unattached" | "suspended";

function UsersTab() {
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [note, setNote] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setErr(null);
      setItems(await admin.listUsers());
    } catch (e) {
      setErr((e as Error).message);
      setItems([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, fn: () => Promise<unknown>, okMessage: string) {
    setBusy(id);
    await toast(fn, okMessage);
    setDeleting(null);
    await load();
    setBusy(null);
  }

  /**
   * מחיקת משתמש שהיה המנהל הפעיל היחיד משאירה ארגון בלי מנהל. לא חוסמים
   * את המחיקה, אבל זה חייב להיאמר במפורש — ארגון בלי מנהל לא יכול לאשר
   * מצטרפים ולא לסגור חודש.
   */
  async function removeUser(userId: string, label: string) {
    setBusy(userId);
    setNote(null);
    const res = await toast(() => admin.deleteUser(userId), `${label} נמחק`);
    if (res && res.orgs_without_manager.length > 0) {
      setNote(
        `${res.orgs_without_manager.join(", ")} נשאר בלי מנהל פעיל. ` +
        "צריך למנות מנהל חדש, אחרת אי אפשר לאשר מצטרפים ולסגור חודש.",
      );
    }
    setDeleting(null);
    await load();
    setBusy(null);
  }

  if (items === null) return <Spinner label="טוען משתמשים…" />;

  const term = q.trim().toLowerCase();
  const shown = items
    .filter((u) =>
      filter === "all" ? true
      : filter === "suspended" ? !!u.suspended_at
      : !u.org_id)
    .filter((u) =>
      !term ||
      (u.display_name ?? "").toLowerCase().includes(term) ||
      (u.email ?? "").toLowerCase().includes(term) ||
      (u.org_name ?? "").toLowerCase().includes(term));

  return (
    <>
      {err && <ErrorNote text={err} />}
      {note && (
        <div role="alert" onClick={() => setNote(null)}
          className="mb-3 rounded-[var(--radius)] px-3.5 py-3 text-sm cursor-pointer
                     bg-[hsl(var(--warn-soft))] text-[hsl(var(--warn))]">
          {note}
        </div>
      )}

      <Section title={`משתמשים (${items.length})`}
        action={
          <button onClick={() => void load()}
            className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
            <ArrowsClockwise size={13} /> רענון
          </button>
        }>
        <div className="relative mb-2">
          <MagnifyingGlass size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם, מייל או ארגון" className="pr-9" />
        </div>

        <div className="flex gap-1 mb-3 p-1 bg-secondary rounded-lg">
          {([
            ["all", "הכל"],
            ["unattached", "בלי ארגון"],
            ["suspended", "מושהים"],
          ] as [UserFilter, string][]).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 px-3 py-1 text-xs rounded-md ${
                filter === f ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <Empty icon={<UsersThree size={22} />} title="אין משתמשים שמתאימים לסינון" />
        ) : shown.map((u, i) => {
          const label = u.display_name ?? u.email ?? "בלי שם";
          return (
            <Card key={u.user_id} className="mb-2" index={i}
              edge={u.suspended_at ? "danger" : u.is_admin ? "ok" : "muted"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{u.display_name ?? "בלי שם"}</p>
                  <p className="text-xs text-muted-foreground truncate num">{u.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {u.org_name
                      ? <>{u.org_name}{u.member_role === "manager" && " · מנהל ארגון"}</>
                      : "לא משויך לארגון"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {u.is_admin && <Chip tone="ok">מנהל מערכת</Chip>}
                  {u.suspended_at && <Chip tone="danger">מושהה</Chip>}
                  {u.member_status === "pending" && <Chip tone="warn">ממתין לאישור</Chip>}
                  {u.member_status === "blocked" && <Chip tone="danger">חסום בארגון</Chip>}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <Stat label="נרשם" value={shortDate(u.created_at)} />
                <Stat label="כניסה אחרונה"
                  value={u.last_login ? shortDate(u.last_login) : "—"} />
                <Stat label="כניסות" value={u.login_count} />
                <Stat label="נסיעות" value={u.rides_driven + u.rides_taken} />
              </div>

              {/* מנהל מערכת אינו ניתן להשהיה או למחיקה מהממשק — מינוי והסרה
                  שלו נעשים במסד הנתונים בלבד, וכך אי אפשר להינעל בחוץ */}
              {!u.is_admin && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  <Button size="md" variant="ghost" className="h-8 text-xs px-3"
                    loading={busy === u.user_id && !deleting}
                    icon={u.suspended_at
                      ? <Play size={14} weight="bold" />
                      : <Pause size={14} weight="bold" />}
                    onClick={() => void act(
                      u.user_id,
                      () => admin.setUserSuspended(u.user_id, !u.suspended_at),
                      u.suspended_at ? "החשבון הופעל מחדש" : "החשבון הושהה",
                    )}>
                    {u.suspended_at ? "הפעלה מחדש" : "השהיה"}
                  </Button>
                  <Button size="md" variant="ghost" className="h-8 text-xs px-3
                             text-[hsl(var(--danger))] hover:text-[hsl(var(--danger))]"
                    onClick={() => setDeleting(deleting === u.user_id ? null : u.user_id)}>
                    מחיקה
                  </Button>
                </div>
              )}

              {deleting === u.user_id && (
                <ConfirmDelete
                  title={`מחיקת ${label}`}
                  hint="יימחקו החשבון וכל מה שנעשה בו: חברות בארגון, נסיעות, הרשמות,
                        חיובים ותשלומים. אין דרך לשחזר. להפסקה זמנית עדיף להשהות."
                  expected={label}
                  busy={busy === u.user_id}
                  onCancel={() => setDeleting(null)}
                  onConfirm={() => void removeUser(u.user_id, label)}
                />
              )}
            </Card>
          );
        })}

        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          מונה הכניסות התחיל לרוץ עם המסך הזה, ולכן חשבונות ותיקים יציגו פחות
          ממה שהיה בפועל. נספרת כניסה אחת לכל היותר בכל עשר דקות, כך שרענון
          של הדף אינו נספר פעמיים.
        </p>
      </Section>
    </>
  );
}
