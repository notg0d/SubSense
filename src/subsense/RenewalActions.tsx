import { useState } from 'react';
import { daysUntil } from '../../shared/subsense.mjs';
import type { Subscription, Workspace } from './workspace';
import { dateLabel, downloadBackup } from './workspace';
import { renewalCalendar } from './calendar';
import { addDays, today } from './tracking';
import type { Commit } from './ConnectionsView';
import { Badge, Button, Notice, SectionHeading } from './ui';

export function CalendarButton({ subscriptions, profileId }: { subscriptions: Subscription[]; profileId: string }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return <div className="space-y-md"><Button onClick={() => {
    setError(''); setMessage('');
    try {
      const calendar = renewalCalendar(subscriptions, profileId);
      downloadBackup(calendar.contents, 'subsense-renewals.ics', 'text/calendar;charset=utf-8');
      setMessage(`${calendar.count} calendar events exported. Import the file and check its reminders in your calendar. These are one-time events; export again after updating dates. Remove obsolete events if dates change.`);
    } catch (e) { setError((e as Error).message); }
  }}>{subscriptions.length === 1 ? 'Add to calendar' : 'Export renewal calendar'}</Button>
    {message && <p role="status" className="text-xs text-tertiary">{message}</p>}{error && <Notice error>{error}</Notice>}
  </div>;
}
export function ManageLink({ service }: { service: Subscription }) {
  return service.manageUrl ? <a className="inline-flex min-h-10 items-center rounded-full border border-primary px-xl py-md text-sm font-medium text-secondary hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus-ring" href={service.manageUrl} target="_blank" rel="noopener noreferrer">Open {service.name} account ↗</a> : <p className="text-xs text-tertiary">Add an account link in Edit to open this service here.</p>;
}
export default function RenewalActions({ workspace, commit, locked, onEdit, onReview }: { workspace: Workspace; commit: Commit; locked: boolean; onEdit: (s: Subscription) => void; onReview: (s: Subscription) => void }) {
  const services = workspace.subscriptions.filter((s) => s.status === 'active' && (s.followUp || s.reviewAfter || s.trialEndsOn || (s.cancellationDeadline && daysUntil(s.cancellationDeadline) <= 7)));
  if (!services.length) return null;
  return <section className="ss-panel p-3xl space-y-xl">
    <SectionHeading title="Your next steps" description="Trials, deadlines and decisions to follow through on" />
    <div className="divide-y divide-secondary">{services.map((s) => {
      const dueOn = s.reviewAfter ?? s.followUp?.dueOn;
      const snoozed = Boolean(dueOn && daysUntil(dueOn) > 0);
      return <article key={s.id} className="space-y-lg py-xl">
        <div className="flex flex-wrap items-center justify-between gap-md"><h3 className="break-words text-sm font-semibold">{s.name}</h3>{s.trialEndsOn && <Badge tone="warning">{daysUntil(s.trialEndsOn) < 0 ? 'Trial date passed · confirm charge' : `Trial ends ${dateLabel(s.trialEndsOn)}`}</Badge>}</div>
        {s.cancellationDeadline && <p className="text-sm text-secondary">Cancellation deadline: {dateLabel(s.cancellationDeadline)}{daysUntil(s.cancellationDeadline) < 0 ? ' · Date passed; check with the provider' : ''}</p>}
        {s.followUp && <p className="text-sm font-medium">{s.followUp.action === 'cancel' ? 'Did you cancel with the provider?' : 'Did you switch to a cheaper plan?'}</p>}
        {dueOn && <p className="text-xs text-tertiary">{snoozed ? `Follow up when you return on ${dateLabel(dueOn)}.` : 'Ready for your follow-up.'}</p>}
        <div className="flex flex-wrap items-center gap-md"><ManageLink service={s} />
          {s.followUp ? <Button disabled={locked} onClick={() => onEdit(s)}>Record provider change</Button> : <Button disabled={locked} onClick={() => onReview(s)}>Review</Button>}
          {s.followUp && !snoozed && <Button disabled={locked} variant="quiet" onClick={() => commit((w) => ({ ...w, subscriptions: w.subscriptions.map((old) => old.id === s.id ? { ...old, reviewAfter: addDays(today(), 3) } : old) }))}>Not yet · ask in 3 days</Button>}
          {s.followUp && <Button disabled={locked} variant="quiet" onClick={() => onReview(s)}>Change my decision</Button>}
        </div>
      </article>;
    })}</div>
  </section>;
}
