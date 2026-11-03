import { daysUntil } from '../../shared/subsense.mjs';
import { addDays } from './tracking.ts';
import type { Subscription } from './tracking.ts';

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function fold(line: string) {
  const lines: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (bytes + length > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += char; bytes += length;
  }
  return [...lines, current].join('\r\n');
}
export function renewalCalendar(subscriptions: Subscription[], profileId: string, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SubSense//Renewals//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  let count = 0;
  for (const s of subscriptions.filter((s) => s.status === 'active')) {
    const dates = [
      { kind: 'charge', date: s.renewsOn, label: `${s.name}: ${s.trialEndsOn ? 'trial ends / first charge' : 'renewal'}` },
      ...(s.cancellationDeadline ? [{ kind: 'deadline', date: s.cancellationDeadline, label: `${s.name}: cancellation deadline` }] : []),
    ];
    for (const event of dates) {
      if (daysUntil(event.date, now) < 0) continue;
      const description = `Expected charge: USD ${(s.costCents / 100).toFixed(2)} / ${s.cadence === 'annual' ? 'year' : 'month'}. Confirm dates and changes with the provider. This calendar event does not cancel or pay for anything.${s.manageUrl ? ` Manage: ${s.manageUrl}` : ''}`;
      lines.push('BEGIN:VEVENT', `UID:${profileId}-${s.id}-${event.kind}-${event.date}@subsense`,
        `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
        `DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(event.date, 1).replace(/-/g, '')}`,
        `SUMMARY:${escape(event.label)}`, `DESCRIPTION:${escape(description)}`, 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', `TRIGGER:${s.reminderDays === 0 ? 'PT0S' : `-P${s.reminderDays ?? 3}D`}`, 'ACTION:DISPLAY', `DESCRIPTION:${escape(event.label)}`, 'END:VALARM', 'END:VEVENT');
      count++;
    }
  }
  if (!count) throw new Error('There are no upcoming dates to export. Update past renewal dates first.');
  lines.push('END:VCALENDAR');
  return { contents: lines.map(fold).join('\r\n') + '\r\n', count };
}
