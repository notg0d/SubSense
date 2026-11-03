import { useState } from 'react';
import { daysUntil, dollarsToCents, monthlyCents, summarize } from '../../shared/subsense.mjs';
import type { Subscription, Workspace } from './workspace';
import { dateLabel, money } from './workspace';
import { billForecast, savingsSummary } from './tracking';
import { Badge, Button, Empty, Field, SectionHeading, ServiceAvatar, fieldClass } from './ui';

export function BillTimeline({ subscriptions, compact = false }: { subscriptions: Subscription[]; compact?: boolean }) {
  const bills = billForecast(subscriptions);
  const overdue = subscriptions.filter((s) => s.status === 'active' && daysUntil(s.renewsOn) < 0).length;
  return <section className="ss-panel p-3xl">
    <SectionHeading title="Due in the next 30 days" description="Expected charges based on the dates you entered" />
    <p className="mt-lg text-heading-sm font-medium tabular-nums">{money(bills.reduce((total, bill) => total + bill.amount, 0))}</p>
    <p className="mt-sm text-xs text-tertiary">Yearly plans appear at their full charge. Future trial charges are included.</p>
    {overdue > 0 && <p className="mt-lg text-xs text-utility-warning-700">{overdue} past {overdue === 1 ? 'date needs' : 'dates need'} updating before we can forecast those bills.</p>}
    <ol className="mt-xl divide-y divide-secondary">{(compact ? bills.slice(0, 4) : bills).map((bill) => <li key={`${bill.service.id}-${bill.date}`} className="flex items-center gap-lg py-lg"><time className="w-14 shrink-0 text-xs text-tertiary" dateTime={bill.date}>{dateLabel(bill.date)}</time><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{bill.service.name}</p><p className="text-xs text-tertiary">{bill.firstCharge ? 'First charge after trial' : bill.service.cadence === 'annual' ? 'Yearly renewal' : 'Monthly renewal'}</p></div><span className="text-sm tabular-nums">{money(bill.amount)}</span></li>)}</ol>
    {!bills.length && <p className="mt-xl text-sm text-tertiary">No upcoming charges in this window.</p>}
    {compact && bills.length > 4 && <p className="mt-lg text-xs text-tertiary">And {bills.length - 4} more · See the full timeline in Renewals.</p>}
  </section>;
}

export function SavingsPanel({ workspace }: { workspace: Workspace }) {
  const savings = savingsSummary(workspace.subscriptions, workspace.decisions);
  return <section className="ss-panel p-3xl space-y-xl">
    <SectionHeading title="Your cost reductions" description="Progress you confirmed, and opportunities to review" />
    <div className="grid gap-xl sm:grid-cols-2">
      <div><p className="text-xs text-tertiary">Confirmed recurring reduction</p><p className="mt-md text-heading-xs font-medium tabular-nums">{money(savings.confirmed)}<span className="text-xs text-tertiary"> / month</span></p><p className="mt-sm text-xs text-tertiary">Compared with prices before your confirmed changes. Not cash saved to date.</p></div>
      <div><p className="text-xs text-tertiary">Potential future costs avoided</p><p className="mt-md text-heading-xs font-medium tabular-nums">{money(savings.potential)}<span className="text-xs text-tertiary"> / month</span></p><p className="mt-sm text-xs text-tertiary">If you stop every service currently suggested for cancellation. Not yet confirmed.</p></div>
    </div>
    {workspace.subscriptions.some((s) => s.reduction) && <details className="ss-disclosure"><summary>See confirmed changes</summary><div className="ss-disclosure-body">{workspace.subscriptions.filter((s) => s.reduction).map((s) => <p key={s.id} className="text-sm text-secondary">{s.name} · confirmed {dateLabel(s.reduction!.confirmedOn)} · {money(Math.max(0, s.reduction!.baselineMonthlyCents - (s.status === 'active' ? monthlyCents(s) : 0)))} / month lower now</p>)}</div></details>}
  </section>;
}

export default function PlanningView({ workspace, locked, onEdit }: { workspace: Workspace; locked: boolean; onEdit: (service: Subscription, proposal: Subscription) => void }) {
  const active = workspace.subscriptions.filter((s) => s.status === 'active');
  const [choices, setChoices] = useState<Record<string, { mode: string; price: string }>>({});
  const current = summarize(workspace.subscriptions, workspace.budgetCents);
  let planned = current.monthly;
  const proposals = new Map<string, Subscription>();
  const invalid = new Set<string>();
  for (const s of active) {
    const choice = choices[s.id];
    if (!choice || choice.mode === 'keep') continue;
    try {
      const costCents = choice.mode === 'pause' ? s.costCents : dollarsToCents(choice.price);
      if (choice.mode === 'downgrade' && costCents >= s.costCents) throw new Error();
      const proposal: Subscription = { ...s, costCents, status: choice.mode === 'pause' ? 'paused' : 'active' };
      proposals.set(s.id, proposal);
      planned += (proposal.status === 'active' ? monthlyCents(proposal) : 0) - monthlyCents(s);
    } catch { invalid.add(s.id); }
  }
  return <div className="space-y-2xl">
    <SavingsPanel workspace={workspace} />
    <section className="ss-panel p-3xl space-y-xl">
      <SectionHeading title="What if you changed a few things?" description="Try pauses and cheaper plans. This preview lasts until you leave the page." action={<Button disabled={!Object.keys(choices).length} onClick={() => setChoices({})}>Reset preview</Button>} />
      <div className="grid gap-xl border-y border-secondary py-xl sm:grid-cols-3" aria-live="polite">{[
        ['Current / month', money(current.monthly)], ['Preview / month', invalid.size ? 'Enter valid prices' : money(planned)], ['Potential reduction / month', invalid.size ? '—' : money(current.monthly - planned)],
      ].map(([label, value]) => <div key={label}><p className="text-xs text-tertiary">{label}</p><p className="mt-sm text-lg font-semibold tabular-nums">{value}</p></div>)}</div>
      {!invalid.size && <Badge tone={planned > workspace.budgetCents ? 'warning' : 'success'}>{money(Math.abs(workspace.budgetCents - planned))} {planned > workspace.budgetCents ? 'over budget' : 'left in your budget'} in this preview</Badge>}
      <p className="text-xs text-tertiary">When a provider confirms your change, choose “Review & record” to update that subscription. Previewing alone changes nothing.</p>
      {active.length ? <div className="divide-y divide-secondary">{active.map((s) => {
        const choice = choices[s.id] ?? { mode: 'keep', price: '' };
        const change = (next: Partial<typeof choice>) => setChoices((old) => ({ ...old, [s.id]: { ...choice, ...next } }));
        return <div key={s.id} className="space-y-lg py-xl">
          <div className="flex items-center gap-lg"><ServiceAvatar name={s.name} /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{s.name}</h3><p className="mt-xs text-xs text-tertiary">{money(s.costCents)} / {s.cadence === 'annual' ? 'year' : 'month'}{s.trialEndsOn ? ' after trial' : ''}</p></div></div>
          <div className="flex flex-col gap-lg sm:flex-row sm:items-end"><div className="flex-1"><Field label={`Plan for ${s.name}`}><select className={fieldClass} value={choice.mode} onChange={(e) => change({ mode: e.target.value })}><option value="keep">Keep as is</option><option value="pause">Pause</option><option value="downgrade">Cheaper plan</option></select></Field></div>
            {choice.mode === 'downgrade' && <div className="flex-1"><Field label={`New ${s.cadence === 'annual' ? 'yearly' : 'monthly'} price for ${s.name} (USD)`}><input inputMode="decimal" className={fieldClass} value={choice.price} aria-invalid={invalid.has(s.id)} onChange={(e) => change({ price: e.target.value })} /></Field></div>}
            {choice.mode !== 'keep' && <Button disabled={locked || invalid.has(s.id)} onClick={() => onEdit(s, proposals.get(s.id)!)}>Review & record</Button>}
          </div>
          {invalid.has(s.id) && <p className="text-xs text-error-primary">Enter a valid price lower than {money(s.costCents)} for the same billing cycle.</p>}
        </div>;
      })}</div> : <Empty title="Nothing to plan yet">Add an active subscription to compare changes.</Empty>}
    </section>
  </div>;
}
