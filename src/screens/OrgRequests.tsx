import { useCallback, useEffect, useState } from "react";
import { Check, Prohibit, ShieldCheck } from "@phosphor-icons/react";
import { Button, Card, Empty, Field, Section, TextInput } from "@/components/app/ui";
import { decideOrgRequest, listPendingOrgRequests } from "@/lib/auth";
import type { OrgRequest } from "@/lib/auth";
import { shortDate } from "@/lib/format";

// ============================================================================
// בקשות לפתיחת ארגון — מסך של מנהל מערכת
//
// מנהל מערכת הוא תפקיד מעל הארגונים: הוא לא חבר בהם ולא רואה את הנסיעות
// שלהם. כל מה שהוא עושה כאן הוא לאשר או לדחות פתיחת ארגון חדש.
// ============================================================================

export default function OrgRequests() {
  const [items, setItems] = useState<OrgRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listPendingOrgRequests());
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, approve: boolean) {
    setBusyId(id); setErr(null);
    try {
      await decideOrgRequest(id, approve, approve ? undefined : reason);
      setRejecting(null); setReason("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Section title="בקשות לפתיחת ארגון">
        {err && (
          <div role="alert"
            className="mb-3 rounded-[var(--radius)] px-3.5 py-3 text-sm
                       bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]">
            {err}
          </div>
        )}

        {items === null ? null : items.length === 0 ? (
          <Empty icon={<ShieldCheck size={22} />} title="אין בקשות ממתינות"
            hint="כשמישהו יבקש לפתוח ארגון חדש, הבקשה תופיע כאן." />
        ) : (
          items.map((r, i) => (
            <Card key={r.id} className="mb-3" index={i} edge="warn">
              <p className="font-bold text-lg">{r.org_name}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {r.requester_name}
                {r.phone && <> · <span className="num">{r.phone}</span></>}
                {" · "}{shortDate(r.created_at)}
              </p>
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">קוד הצוות: </span>
                <span className="num font-bold tracking-[0.16em]">{r.join_code}</span>
              </p>

              {rejecting === r.id ? (
                <div className="mt-4">
                  <Field label="סיבת הדחייה" hint="תוצג למבקש. לא חובה.">
                    <TextInput value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                  </Field>
                  <div className="flex gap-2">
                    <Button variant="danger" loading={busyId === r.id}
                      onClick={() => void decide(r.id, false)}>
                      דחייה
                    </Button>
                    <Button variant="ghost"
                      onClick={() => { setRejecting(null); setReason(""); }}>
                      ביטול
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-4">
                  <Button icon={<Check size={16} weight="bold" />} loading={busyId === r.id}
                    onClick={() => void decide(r.id, true)}>
                    אישור ופתיחת הארגון
                  </Button>
                  <Button variant="secondary" icon={<Prohibit size={16} weight="bold" />}
                    onClick={() => setRejecting(r.id)}>
                    דחייה
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </Section>
    </>
  );
}
