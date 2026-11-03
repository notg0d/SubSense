import test from 'node:test';
import assert from 'node:assert/strict';
import { billForecast, plannedFollowUp, recordSubscriptionChange, savingsSummary, validateTrackedSubscription } from '../src/subsense/tracking.ts';
import { renewalCalendar } from '../src/subsense/calendar.ts';
import { parseSubscriptionCsv } from '../src/subsense/subscription-csv.ts';
import { backupDue, freshWorkspace, trackWorkspaceChange, validateWorkspace } from '../src/subsense/workspace.ts';
import { validateSubscription } from '../shared/subsense.mjs';

const now = new Date(2027, 0, 31, 12);
const service = (extra = {}) => ({ id: 'service-1', name: 'Design app', costCents: 12000, cadence: 'annual', renewsOn: '2027-01-31', category: 'Design', usage: 'unused', importance: 'optional', status: 'active', workRelated: false, notes: '', ...extra });

test('tracking fields survive backup migration while provider allowlists exclude them', () => {
  const s = service({ trialEndsOn: '2027-01-31', cancellationDeadline: '2027-01-29', manageUrl: 'https://example.com/account', reminderDays: 7, reviewAfter: '2027-02-01' });
  const w = { ...freshWorkspace(), subscriptions: [s] };
  assert.deepEqual(validateWorkspace(w, true).subscriptions, [s]);
  assert.deepEqual(validateTrackedSubscription(service()), service());
  assert.equal(validateSubscription(s).trialEndsOn, undefined);
  assert.equal(validateSubscription(s).manageUrl, undefined);
  for (const invalid of [{ trialEndsOn: '2027-02-01' }, { cancellationDeadline: '2027-02-01' }, { reviewAfter: '2027-02-30' }, { reminderDays: 99 }, { manageUrl: 'javascript:alert(1)' }, { manageUrl: 'https://user:secret@example.com' }, { reduction: { baselineMonthlyCents: -1, confirmedOn: '2027-01-31' } }]) {
    assert.throws(() => validateTrackedSubscription(service(invalid)));
  }
});

test('bill timeline uses full charges, excludes stale dates and preserves month-end anchors', () => {
  const subscriptions = [service(), service({ id: 'monthly', cadence: 'monthly', costCents: 500 }), service({ id: 'old', renewsOn: '2027-01-30' }), service({ id: 'paused', status: 'paused' }), service({ id: 'trial', trialEndsOn: '2027-02-05', renewsOn: '2027-02-05', costCents: 999 })];
  const bills = billForecast(subscriptions, now);
  assert.equal(bills.reduce((sum, b) => sum + b.amount, 0), 13999);
  assert.deepEqual(bills.filter((b) => b.service.id === 'monthly').map((b) => b.date), ['2027-01-31', '2027-02-28']);
  assert.equal(bills.find((b) => b.service.id === 'trial').firstCharge, true);
  assert.equal(bills.some((b) => ['old', 'paused'].includes(b.service.id)), false);
  assert.deepEqual(billForecast([subscriptions[1]], now, 90).map((b) => b.date), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(billForecast([service({ renewsOn: '2028-02-29' })], new Date(2028, 1, 29), 366).map((b) => b.date), ['2028-02-29', '2029-02-28']);
});

test('confirmed reductions require provider confirmation and never double count repeated edits', () => {
  const original = service({ costCents: 24000 });
  assert.throws(() => recordSubscriptionChange(original, service(), false, now), /Confirm/);
  const cheaper = recordSubscriptionChange(original, service(), true, now);
  assert.equal(savingsSummary([cheaper], [], now).confirmed, 1000);
  const unchanged = recordSubscriptionChange(cheaper, { ...cheaper, notes: 'Changed note' }, false, now);
  assert.equal(savingsSummary([unchanged], [], now).confirmed, 1000);
  const cancelled = recordSubscriptionChange(unchanged, { ...unchanged, status: 'cancelled' }, true, now);
  assert.equal(savingsSummary([cancelled], [], now).confirmed, 2000);
  const resumed = recordSubscriptionChange(cancelled, { ...cancelled, status: 'active', costCents: 30000 }, false, now);
  assert.equal(savingsSummary([resumed], [], now).confirmed, 0);
  assert.equal(savingsSummary([cancelled], [], now).potential, 0);
  assert.equal(savingsSummary([original], [], now).potential, 2000);
});

test('trial cancellation avoids a future cost without inventing confirmed savings', () => {
  const trial = service({ trialEndsOn: '2027-01-31' });
  const cancelled = recordSubscriptionChange(trial, { ...trial, status: 'cancelled' }, true, now);
  assert.equal(cancelled.reduction, undefined);
  assert.equal(savingsSummary([cancelled], [], now).confirmed, 0);
});

test('decision follow-ups do not change subscription status and clear when the user changes their mind', () => {
  const d = { id: 'decision-1', action: 'cancel', demo: false };
  const original = service({ renewsOn: '2027-02-05', cancellationDeadline: '2027-01-31' });
  const pending = plannedFollowUp(original, d, now);
  assert.equal(pending.followUp.dueOn, '2027-01-31');
  assert.equal(pending.status, 'active');
  assert.equal(plannedFollowUp(pending, { ...d, action: 'keep' }, now).followUp, undefined);
  assert.equal(plannedFollowUp(original, { ...d, demo: true }, now).followUp, undefined);
  assert.equal(recordSubscriptionChange(pending, { ...pending, status: 'cancelled' }, true, now).followUp, undefined);
});

test('calendar export has stable events, correct dates and alarms, escaped text and UTF-8 line folding', () => {
  const s = service({ name: '🎨'.repeat(25) + '\r\nBEGIN:VEVENT,a;b\\c', cancellationDeadline: '2027-01-31', reminderDays: 7, trialEndsOn: '2027-01-31' });
  const { contents, count } = renewalCalendar([s, service({ id: 'paused', status: 'paused' }), service({ id: 'old', renewsOn: '2027-01-01' })], 'profile', now);
  assert.equal(count, 2);
  assert.equal(contents.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length, 2);
  assert.match(contents, /DTSTART;VALUE=DATE:20270131\r\nDTEND;VALUE=DATE:20270201/);
  assert.match(contents, /TRIGGER:-P7D/);
  assert.match(contents.replace(/\r\n /g, ''), /\\nBEGIN:VEVENT\\,a\\;b\\\\c/);
  assert.ok(contents.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
  assert.equal(renewalCalendar([s], 'profile', now).contents, contents);
  assert.match(renewalCalendar([service({ reminderDays: 0 })], 'profile', now).contents, /TRIGGER:PT0S/);
  assert.throws(() => renewalCalendar([service({ status: 'cancelled' })], 'profile', now), /no upcoming/);
});

test('CSV preview handles quoted fields and duplicates without silently dropping invalid rows', () => {
  const csv = '\uFEFFname,price,cadence,renewsOn,notes\r\n"Design, app",9.99,monthly,2027-02-05,"Line 1\nLine ""2"""\r\nDesign app,120,annual,2027-03-01,\r\n';
  const result = parseSubscriptionCsv(csv, [service()]);
  assert.equal(result.subscriptions.length, 2);
  assert.equal(result.subscriptions[0].costCents, 999);
  assert.equal(result.subscriptions[0].notes, 'Line 1\nLine "2"');
  assert.deepEqual(result.duplicates, ['Design app']);
  assert.equal(new Set(result.subscriptions.map((s) => s.id)).size, 2);
  for (const input of ['name,price,cadence,renewsOn\nx,1e2,monthly,2027-02-01', 'name,price,cadence,renewsOn\nx,2,monthly,2027-02-30', 'name,price,cadence,renewsOn\n"oops,2,monthly,2027-02-01', 'name,name,price,cadence,renewsOn\nx,x,2,monthly,2027-02-01']) assert.throws(() => parseSubscriptionCsv(input));
  assert.throws(() => parseSubscriptionCsv(csv, Array.from({ length: 199 }, () => service())), /200/);
});

test('backup reminders track substantive changes, respect snoozes and reset local history on restore', () => {
  const base = { ...freshWorkspace(), subscriptions: [service()], backup: { changes: 4 } };
  assert.equal(backupDue(base, now), false);
  const changed = trackWorkspaceChange(base, { ...base, budgetCents: 20000 });
  assert.equal(backupDue(changed, now), true);
  const appearance = trackWorkspaceChange(base, { ...base, theme: base.theme === 'dark' ? 'light' : 'dark' });
  assert.equal(appearance.backup.changes, 4);
  const downloaded = trackWorkspaceChange(changed, { ...changed, backup: { changes: 0, lastDownloadedAt: now.toISOString() } });
  assert.equal(backupDue(downloaded, now), false);
  assert.equal(backupDue({ ...changed, backup: { changes: 9, snoozedUntil: '2027-02-01' } }, now), false);
  assert.equal(backupDue({ ...changed, backup: { changes: 1, lastDownloadedAt: '2026-12-01T12:00:00.000Z' } }, now), true);
  assert.equal(validateWorkspace(downloaded, true).backup, undefined);
});
