import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CATEGORIES,
  dollarsToCents,
  monthlyCents,
  validDate,
  validateDecision,
} from '../../shared/subsense.mjs';
import type {
  Action,
  Decision,
  Recommendation,
  Subscription,
  Value,
} from './workspace';
import { money } from './workspace';
import { addDays, isReduction, recordSubscriptionChange, reminderOptions, SERVICE_PRESETS, today } from './tracking';
import { Badge, Button, Field, Modal, Notice, fieldClass } from './ui';

export const actionLabels: Record<Action, string> = {
  keep: 'Keep',
  downgrade: 'Try a cheaper plan',
  cancel: 'Consider cancelling',
  review: 'Take another look',
};
export const actionTone = (action: Action) =>
  action === 'keep'
    ? ('success' as const)
    : action === 'cancel'
      ? ('error' as const)
      : ('warning' as const);
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-sm text-sm font-medium text-secondary">
        {label}
      </legend>
      <div className="flex flex-wrap gap-md">
        {options.map((o) => (
          <label
            key={o.value}
            className={`ss-choice flex flex-1 items-center justify-center gap-sm rounded-xl border px-lg py-md text-sm font-medium transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-secondary-hover'} ${value === o.value ? 'border-brand bg-utility-brand-50 text-brand-primary' : 'border-primary bg-primary text-secondary'}`}
          >
            <input
              className="subsense-choice size-4 shrink-0 focus-visible:ring-2 focus-visible:ring-focus-ring"
              type="radio"
              disabled={disabled}
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SubscriptionForm({
  service,
  proposal,
  onSave,
  onClose,
}: {
  service?: Subscription;
  proposal?: Subscription;
  onSave: (s: Subscription) => boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Subscription>(
    () =>
      proposal ?? service ?? {
        id: crypto.randomUUID(),
        name: '',
        category: 'Productivity',
        costCents: 0,
        cadence: 'monthly',
        renewsOn: today(),
        usage: 'occasional',
        importance: 'useful',
        status: 'active',
        workRelated: false,
        notes: '',
      },
  );
  const [price, setPrice] = useState(
    proposal || service ? ((proposal ?? service)!.costCents / 100).toFixed(2) : '',
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const serviceList = useId();
  let reducesCost = false;
  try { reducesCost = Boolean(service && isReduction(service, { ...draft, costCents: dollarsToCents(price) })); } catch { /* Price errors are shown on submit. */ }
  const change = <K extends keyof Subscription>(
    key: K,
    value: Subscription[K],
  ) => { setConfirmed(false); setDraft((d) => ({ ...d, [key]: value })); };
  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (
        draft.status === 'cancelled' &&
        service?.status !== 'cancelled' &&
        !confirmed
      )
        throw new Error(
          'Confirm cancellation with your provider before changing the status.',
        );
      const result = recordSubscriptionChange(service, {
        ...draft,
        costCents: dollarsToCents(price),
      }, confirmed);
      if (onSave(result)) onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal
      title={service ? `Edit ${service.name}` : 'Add a subscription'}
      subtitle="Just the basics. You can change these any time."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-2xl">
        <Field label="Service name">
          <input
            autoComplete="off"
            list={serviceList}
            className={fieldClass}
            required
            maxLength={80}
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              const preset = SERVICE_PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase());
              setDraft((d) => ({ ...d, name, ...(preset ? { category: preset.category, manageUrl: preset.manageUrl } : {}) }));
            }}
            placeholder="e.g. Adobe Creative Cloud"
          />
        </Field>
        <datalist id={serviceList}>{SERVICE_PRESETS.map((p) => <option key={p.name} value={p.name} />)}</datalist>
        {!service && <p className="text-xs text-tertiary">Choose a familiar service or type your own. Enter the price and dates from your account.</p>}
        <div className="grid gap-xl sm:grid-cols-2">
          <Field label="Category">
            <select
              className={fieldClass}
              value={draft.category}
              onChange={(e) =>
                change('category', e.target.value as Subscription['category'])
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={draft.trialEndsOn ? 'Price after trial (USD)' : 'Price (USD)'}>
            <input
              className={fieldClass}
              inputMode="decimal"
              required
              value={price}
              onChange={(e) => { setPrice(e.target.value); setConfirmed(false); }}
              placeholder="19.99"
            />
          </Field>
        </div>
        <Choices
          label="How often do you pay?"
          value={draft.cadence}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'annual', label: 'Yearly' },
          ]}
          onChange={(v) => change('cadence', v)}
        />
        <label className="flex items-center gap-md text-sm text-secondary"><input type="checkbox" className="subsense-choice size-4 focus-visible:ring-2 focus-visible:ring-focus-ring" checked={Boolean(draft.trialEndsOn)} onChange={(e) => change('trialEndsOn', e.target.checked ? draft.renewsOn : undefined)} />This is a free trial</label>
        <Field
          label={draft.trialEndsOn ? 'Trial ends / first paid charge' : 'Next renewal date'}
          hint="Check your account with the service for the next billing date."
        >
          <input
            type="date"
            className={fieldClass}
            required
            value={draft.renewsOn}
            onChange={(e) => setDraft((d) => ({ ...d, renewsOn: e.target.value, trialEndsOn: d.trialEndsOn ? e.target.value : undefined }))}
          />
        </Field>
        {draft.trialEndsOn && <p className="text-xs text-tertiary">The budget includes the future paid price. Confirm the first charge date with your provider.</p>}
        <details className="ss-disclosure" open={draft.trialEndsOn ? true : undefined}><summary>Reminders & account link</summary><div className="ss-disclosure-body">
          <Field label="Cancellation deadline (optional)" hint="The last date to cancel before this charge. Some services require advance notice."><input type="date" className={fieldClass} max={draft.renewsOn} value={draft.cancellationDeadline ?? ''} onChange={(e) => change('cancellationDeadline', e.target.value || undefined)} /></Field>
          <Field label="Calendar reminder" hint="Download the event from Renewals, then import it into your calendar. Your calendar controls notification delivery."><select className={fieldClass} value={draft.reminderDays ?? 3} onChange={(e) => change('reminderDays', Number(e.target.value))}>{reminderOptions.map((days) => <option key={days} value={days}>{days === 0 ? 'On the day' : `${days} ${days === 1 ? 'day' : 'days'} before`}</option>)}</select></Field>
          <Field label="Subscription-management link (optional)"><input type="url" className={fieldClass} maxLength={1000} placeholder="https://example.com/account" value={draft.manageUrl ?? ''} onChange={(e) => change('manageUrl', e.target.value)} /></Field>
        </div></details>
        <details className="ss-disclosure" open={service ? true : undefined}>
        <summary>Help me decide what to keep <span className="text-xs font-regular text-tertiary">(optional)</span></summary>
        <div className="ss-disclosure-body">
        <Choices
          label="How often do you use it?"
          value={draft.usage}
          options={[
            { value: 'frequent', label: 'Often' },
            { value: 'occasional', label: 'Sometimes' },
            { value: 'rare', label: 'Rarely' },
            { value: 'unused', label: 'Never' },
          ]}
          onChange={(v) => change('usage', v)}
        />
        <Choices
          label="How important is it to you?"
          value={draft.importance}
          options={[
            { value: 'essential', label: 'Can’t do without it' },
            { value: 'useful', label: 'Useful' },
            { value: 'optional', label: 'Optional' },
          ]}
          onChange={(v) => change('importance', v)}
        />
        <label className="flex items-center gap-sm text-sm text-secondary">
          <input
            type="checkbox"
            className="subsense-choice size-4 focus-visible:ring-2 focus-visible:ring-focus-ring"
            checked={draft.workRelated}
            onChange={(e) => change('workRelated', e.target.checked)}
          />
          Supports my work or clients
        </label>
        <Field label="Notes (optional)">
          <textarea
            className={fieldClass}
            rows={3}
            maxLength={800}
            value={draft.notes}
            onChange={(e) => change('notes', e.target.value)}
            placeholder="What would you miss if you stopped paying?"
          />
        </Field>
        </div>
        </details>
        {service && (
          <Choices
            label="Subscription status"
            value={draft.status}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            onChange={(v) => change('status', v)}
          />
        )}
        {(reducesCost || (draft.status === 'cancelled' && service?.status !== 'cancelled')) && (
          <label className="flex items-start gap-sm text-sm text-secondary">
            <input
              type="checkbox"
              required
              className="subsense-choice mt-xxs size-4 shrink-0"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {draft.status === 'cancelled' ? 'I have cancelled with the provider.' : 'I have confirmed this pause or lower price with the provider.'} SubSense records the change; it does not make it for me.
          </label>
        )}
        {error && <Notice error>{error}</Notice>}
        <div className="sticky bottom-0 flex justify-end gap-lg border-t border-secondary bg-primary py-xl">
          <Button onClick={onClose}>Back</Button>
          <Button variant="primary" type="submit">
            {service ? 'Save changes' : 'Add subscription'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ReviewForm({
  service,
  recommendation,
  sample,
  onSave,
  onClose,
  onUsage,
  onSnooze,
}: {
  service: Subscription;
  recommendation: Recommendation;
  sample: boolean;
  onSave: (d: Decision) => boolean;
  onClose: () => void;
  onUsage?: (usage: Subscription['usage']) => void;
  onSnooze?: (date: string) => boolean;
}) {
  const [action, setAction] = useState<Action>(recommendation.action);
  const [value, setValue] = useState<Value>('unsure');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [snooze, setSnooze] = useState(addDays(today(), 3));
  const previous = recommendation.evidence[0];
  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const decision = validateDecision({
        app: 'subsense',
        version: 1,
        id: crypto.randomUUID(),
        serviceId: service.id,
        serviceName: service.name,
        category: service.category,
        costCents: service.costCents,
        cadence: service.cadence,
        at: new Date().toISOString(),
        demo: sample,
        action,
        value,
        reason,
      });
      if (onSave({ ...decision, storage: 'local' })) onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal
      title={`Review ${service.name}`}
       subtitle={`${money(service.costCents)} / ${service.cadence === 'annual' ? 'year' : 'month'} · Is it still worth it to you?`}
      onClose={onClose}
    >
      <form className="space-y-xl" onSubmit={submit}>
        <div className="border-b border-secondary pb-xl">
          <p className="mb-lg text-xs font-medium uppercase tracking-wider text-tertiary">
            Our suggestion
          </p>
          <Badge tone={actionTone(recommendation.action)}>
            {actionLabels[recommendation.action]}
          </Badge>
          <ul className="mt-lg space-y-sm text-sm text-secondary">
            {recommendation.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {recommendation.action === 'cancel' && <p className="mt-lg text-sm font-medium">Cancelling could avoid {money(monthlyCents(service))} / month in future costs.</p>}
          {recommendation.action === 'downgrade' && <p className="mt-lg text-sm text-secondary">Compare a cheaper plan in the budget planner to see the possible reduction.</p>}
          {onUsage && <div className="mt-xl"><Choices label="Is your usage still accurate?" value={service.usage} onChange={onUsage} options={[{ value: 'frequent', label: 'Often' }, { value: 'occasional', label: 'Sometimes' }, { value: 'rare', label: 'Rarely' }, { value: 'unused', label: 'Never' }]} /></div>}
        </div>
        {previous && <div className="space-y-lg border-b border-secondary pb-xl"><p className="text-sm font-medium">Last time, you said:</p><blockquote className="break-words text-sm text-secondary">“{previous.reason}”</blockquote><p className="text-xs text-tertiary">Is that still true? Your choice below will be saved as a new decision.</p><div className="flex flex-wrap items-center gap-md"><Button onClick={() => { setAction(previous.action); setValue(previous.value); setReason(previous.reason); }}>Still true</Button><Button onClick={() => { setAction('review'); setValue('unsure'); setReason(''); }}>Things changed</Button></div></div>}
        {onSnooze && <details className="ss-disclosure"><summary>Remind me later</summary><div className="ss-disclosure-body"><Field label="Review again on" hint="Choose a future date. Appears in SubSense when you return. For notifications while the app is closed, use the calendar export."><input type="date" className={fieldClass} value={snooze} onChange={(e) => setSnooze(e.target.value)} /></Field><Button onClick={() => { if (!validDate(snooze) || snooze <= today()) setError('Choose a future review date.'); else if (onSnooze(snooze)) onClose(); }}>Snooze review</Button></div></details>}
        <Choices
          label="Your decision"
          value={action}
          onChange={setAction}
          options={[
            { value: 'keep', label: 'Keep' },
            { value: 'downgrade', label: 'Cheaper plan' },
            { value: 'cancel', label: 'Plan to cancel' },
            { value: 'review', label: 'Decide later' },
          ]}
        />
        <Choices
          label="How does it feel for the price?"
          value={value}
          onChange={setValue}
          options={[
            { value: 'essential', label: 'Essential' },
            { value: 'useful', label: 'Useful' },
            { value: 'not-worth-it', label: 'Not worth it' },
            { value: 'unsure', label: 'Unsure' },
          ]}
        />
        <Field
          label="Why?"
          hint="We’ll remember your reason for the next six months."
        >
          <textarea
            className={fieldClass}
            required
            maxLength={800}
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Rarely used, but required for monthly client handoffs."
          />
        </Field>
        <p className="text-xs text-tertiary">
          Saved {sample ? 'as an example' : 'on this device'}. This is a note of your choice, not a cancellation or plan change. Make any changes with the service itself.
        </p>
        {error && <Notice error>{error}</Notice>}
        <div className="sticky bottom-0 flex justify-end gap-lg border-t border-secondary bg-primary py-xl">
          <Button onClick={onClose}>Back</Button>
          <Button type="submit" variant="primary">
            Save decision
          </Button>
        </div>
      </form>
    </Modal>
  );
}
