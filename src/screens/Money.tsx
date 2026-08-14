import { CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { useApp } from "@/store";
import { Card, Chip, Empty, Field, Money as Amount, Section } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import type { PaymentMethod } from "@/lib/types";
import { paymentMethodLabel, paymentStatusLabel, shortDate } from "@/lib/format";
import { debtReminderMessage, whatsappLink } from "@/lib/share";

// ============================================================================
// כספים — שלושה חלקים: מה אני חייב, מה חייבים לי, והיסטוריה.
// שרשרת התשלום: חוב פתוח ← הנוסע מסמן "שילמתי" ← ממתין לאישור ← הנהג מאשר.
// ============================================================================

export default function Money() {
  const {
    me, balances, payments, charges, memberById, contactOf, run,
  } = useApp();
  const [payTo, setPayTo] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bit");
  const [reference, setReference] = useState("");

  if (!me) return null;

  const iOwe = balances.filter((b) => b.payer_id === me.id && (b.owed > 0 || b.pending > 0));
  const owedToMe = balances.filter((b) => b.payee_id === me.id && (b.owed > 0 || b.pending > 0));
  const awaitingMyApproval = payments.filter(
    (p) => p.payee_id === me.id && p.status === "marked",
  );
  const myPayments = payments.filter((p) => p.payer_id === me.id).slice(0, 20);

  const totalOwe = iOwe.reduce((s, b) => s + Number(b.owed), 0);
  const totalOwed = owedToMe.reduce((s, b) => s + Number(b.owed), 0);

  function openPay(payeeId: string, remaining: number) {
    setPayTo(payeeId);
    setAmount(String(remaining));
    setReference("");
  }

  return (
    <>
      {/* ---------- סיכום ---------- */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <Card edge={totalOwe > 0 ? "danger" : "ok"}>
          <p className="text-xs text-muted-foreground mb-1">אתה חייב</p>
          <Amount amount={totalOwe} tone={totalOwe > 0 ? "danger" : "ok"} />
        </Card>
        <Card edge={totalOwed > 0 ? "warn" : "muted"}>
          <p className="text-xs text-muted-foreground mb-1">חייבים לך</p>
          <Amount amount={totalOwed} tone={totalOwed > 0 ? "warn" : undefined} />
        </Card>
      </div>

      {/* ---------- ממתין לאישור שלי ---------- */}
      {awaitingMyApproval.length > 0 && (
        <Section title="ממתין לאישור שלך">
          {awaitingMyApproval.map((p) => (
            <Card key={p.id} edge="warn" className="mb-2">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-medium">{memberById(p.payer_id)?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    סימן תשלום ב{paymentMethodLabel[p.method]} · {shortDate(p.marked_at)}
                    {p.reference && ` · אסמכתא: ${p.reference}`}
                  </p>
                </div>
                <Amount amount={p.amount} tone="warn" />
              </div>
              <div className="flex gap-2">
                <Button size="sm"
                  onClick={() => void run(() => api.confirmPayment(p.id), "התשלום אושר")}>
                  קיבלתי
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => {
                    const reason = prompt("למה התשלום לא התקבל? (יישלח לנוסע)");
                    if (reason) void run(() => api.disputePayment(p.id, reason), "סומן במחלוקת");
                  }}>
                  לא קיבלתי
                </Button>
              </div>
            </Card>
          ))}
        </Section>
      )}

      {/* ---------- מה אני חייב ---------- */}
      <Section title="החובות שלך">
        {iOwe.length === 0 ? (
          <Empty icon={<CheckCircle size={22} />} title="אין לך חובות פתוחים" />
        ) : (
          iOwe.map((b) => {
            const payee = memberById(b.payee_id);
            const remaining = Number(b.owed) - Number(b.pending);
            const isOpen = payTo === b.payee_id;
            return (
              <Card key={b.payee_id} edge={remaining > 0 ? "danger" : "warn"} className="mb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{payee?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="num">{Number(b.charged)}</span> ₪ נצברו ·{" "}
                      <span className="num">{Number(b.paid)}</span> ₪ אושרו
                      {Number(b.pending) > 0 && (
                        <> · <span className="num">{Number(b.pending)}</span> ₪ ממתינים לאישור</>
                      )}
                    </p>
                  </div>
                  <div className="text-left">
                    <Amount amount={remaining} tone={remaining > 0 ? "danger" : "warn"} />
                    {Number(b.pending) > 0 && (
                      <div className="mt-1"><Chip tone="warn">ממתין לאישור</Chip></div>
                    )}
                  </div>
                </div>

                {remaining > 0 && !isOpen && (
                  <Button size="sm" className="mt-3"
                    onClick={() => openPay(b.payee_id, remaining)}>
                    סימון תשלום
                  </Button>
                )}

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <Field label="סכום ששילמת">
                      <Input type="number" inputMode="decimal" min="0" step="0.5" dir="ltr"
                        value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </Field>
                    <Field label="אמצעי">
                      <select value={method}
                        onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                        className="w-full h-10 rounded-md border border-input bg-background px-3">
                        {Object.entries(paymentMethodLabel).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="אסמכתא" hint="לא חובה. עוזר לנהג לזהות את ההעברה">
                      <Input value={reference} onChange={(e) => setReference(e.target.value)}
                        placeholder="4 ספרות אחרונות / הערה" />
                    </Field>
                    <p className="text-xs text-muted-foreground mb-3">
                      אחרי הסימון הסטטוס יהיה "ממתין לאישור" עד ש{payee?.name} יאשר/תאשר שקיבל/ה.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm"
                        onClick={() => void run(
                          () => api.markPayment(
                            b.payee_id, Number(amount) || 0, method, reference || undefined,
                          ),
                          "סומן כשולם. ממתין לאישור הנהג",
                        ).then(() => setPayTo(null))}>
                        סימון כשולם
                      </Button>
                      {contactOf(b.payee_id)?.phone && (
                        <Button size="sm" variant="outline" asChild>
                          <a target="_blank" rel="noreferrer"
                            href={whatsappLink(
                              `היי ${payee?.name}, העברתי ${amount} ₪ ב${paymentMethodLabel[method]}.`,
                              contactOf(b.payee_id)?.phone,
                            )}>
                            הודעה בוואטסאפ
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setPayTo(null)}>ביטול</Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </Section>

      {/* ---------- מה חייבים לי ---------- */}
      {owedToMe.length > 0 && (
        <Section title="חייבים לך">
          {owedToMe.map((b) => {
            const payer = memberById(b.payer_id);
            const phone = contactOf(b.payer_id)?.phone;
            const ridesCount = charges.filter(
              (c) => c.payer_id === b.payer_id && c.payee_id === me.id,
            ).length;
            const remaining = Number(b.owed) - Number(b.pending);
            return (
              <Card key={b.payer_id} edge={remaining > 0 ? "warn" : "ok"} className="mb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{payer?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="num">{ridesCount}</span> חיובים
                      {Number(b.pending) > 0 && " · יש תשלום שממתין לאישורך"}
                    </p>
                  </div>
                  <Amount amount={Number(b.owed)} tone={remaining > 0 ? "warn" : "ok"} />
                </div>
                {phone && remaining > 0 && (
                  <Button size="sm" variant="outline" className="mt-3" asChild>
                    <a target="_blank" rel="noreferrer"
                      href={whatsappLink(
                        debtReminderMessage(payer?.name ?? "", remaining, ridesCount,
                          contactOf(me.id)?.pay_note),
                        phone,
                      )}>
                      תזכורת בוואטסאפ
                    </a>
                  </Button>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      {/* ---------- היסטוריית תשלומים ---------- */}
      <Section title="התשלומים שלך">
        {myPayments.length === 0 ? (
          <Empty title="עוד לא סימנת תשלומים" />
        ) : (
          <div className="card-surface divide-y divide-border">
            {myPayments.map((p) => (
              <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{memberById(p.payee_id)?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {shortDate(p.marked_at)} · {paymentMethodLabel[p.method]}
                    {p.auto_confirmed && " · אושר אוטומטית"}
                  </p>
                  {p.status === "disputed" && p.dispute_reason && (
                    <p className="text-xs text-[hsl(var(--danger))] mt-0.5">
                      {p.dispute_reason}
                    </p>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <Amount amount={p.amount} />
                  <div className="mt-1">
                    <Chip tone={
                      p.status === "confirmed" ? "ok"
                      : p.status === "marked" ? "warn" : "danger"
                    }>
                      {paymentStatusLabel[p.status]}
                    </Chip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
