import { daysUntil, monthlyCents, recommend, validDate, validateSubscription } from '../../shared/subsense.mjs';
import type { Subscription as BaseSubscription, Category, Decision } from '../../shared/subsense.mjs';

// Browser-only planning fields. Provider payloads continue using the shared allowlist.
export interface Subscription extends BaseSubscription {
  trialEndsOn?: string;
  cancellationDeadline?: string;
  reminderDays?: number;
  manageUrl?: string;
  reviewAfter?: string;
  followUp?: { decisionId: string; action: 'cancel' | 'downgrade'; dueOn: string };
  reduction?: { baselineMonthlyCents: number; confirmedOn: string };
}
export const reminderOptions = [0, 1, 3, 7, 14];
export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export function addDays(date: string, count: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + count);
  return result.toISOString().slice(0, 10);
}
export function managementUrl(value: string) {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 1000) throw new Error();
    return url.href;
  } catch { throw new Error('Use a full HTTPS subscription-management link.'); }
}
export function validateTrackedSubscription(value: unknown): Subscription {
  const base = validateSubscription(value);
  const raw = value as Subscription;
  const result: Subscription = { ...base };
  for (const key of ['trialEndsOn', 'cancellationDeadline', 'reviewAfter'] as const) {
    if (raw[key] !== undefined && raw[key] !== '') {
      if (!validDate(raw[key])) throw new Error('Enter a valid trial, cancellation or reminder date.');
      result[key] = raw[key];
    }
  }
  if (result.trialEndsOn && result.trialEndsOn !== result.renewsOn) throw new Error('The trial end must match the first paid charge date.');
  if (result.cancellationDeadline && result.cancellationDeadline > result.renewsOn) throw new Error('The cancellation deadline must be on or before the next charge.');
  if (raw.reminderDays !== undefined) {
    if (!reminderOptions.includes(raw.reminderDays)) throw new Error('Choose a supported reminder interval.');
    result.reminderDays = raw.reminderDays;
  }
  if (raw.manageUrl !== undefined) result.manageUrl = managementUrl(raw.manageUrl);
  if (raw.followUp) {
    const f = raw.followUp;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(f.decisionId) || !['cancel', 'downgrade'].includes(f.action) || !validDate(f.dueOn)) throw new Error('Invalid subscription follow-up.');
    result.followUp = { decisionId: f.decisionId, action: f.action, dueOn: f.dueOn };
  }
  if (raw.reduction) {
    const r = raw.reduction;
    if (!Number.isSafeInteger(r.baselineMonthlyCents) || r.baselineMonthlyCents < 0 || r.baselineMonthlyCents > 999999999 || !validDate(r.confirmedOn)) throw new Error('Invalid savings record.');
    result.reduction = { baselineMonthlyCents: r.baselineMonthlyCents, confirmedOn: r.confirmedOn };
  }
  return result;
}
export const committedMonthly = (s: Subscription) => s.status === 'active' ? monthlyCents(s) : 0;
export const isReduction = (before: Subscription, after: Subscription) => committedMonthly(after) < committedMonthly(before);
export function recordSubscriptionChange(before: Subscription | undefined, after: Subscription, confirmed: boolean, now = new Date()): Subscription {
  const next = validateTrackedSubscription(after);
  // Keep historical baselines internal; an edit cannot invent confirmed savings.
  next.reduction = before?.reduction;
  if (before && isReduction(before, next)) {
    if (!confirmed) throw new Error('Confirm the change with your provider before recording a lower cost.');
    if (!before.trialEndsOn) next.reduction = {
      baselineMonthlyCents: Math.max(before.reduction?.baselineMonthlyCents ?? 0, committedMonthly(before)),
      confirmedOn: today(now),
    };
  }
  if (before && (before.status !== next.status || before.costCents !== next.costCents || before.cadence !== next.cadence)) next.followUp = undefined;
  if (next.status !== 'active') { next.followUp = undefined; next.reviewAfter = undefined; }
  return next;
}
export function savingsSummary(subscriptions: Subscription[], decisions: Decision[], now = new Date()) {
  return {
    confirmed: subscriptions.reduce((sum, s) => sum + (s.reduction ? Math.max(0, s.reduction.baselineMonthlyCents - committedMonthly(s)) : 0), 0),
    potential: subscriptions.filter((s) => s.status === 'active' && recommend(s, decisions, { now }).action === 'cancel').reduce((sum, s) => sum + monthlyCents(s), 0),
  };
}
export function plannedFollowUp(service: Subscription, decision: Decision, now = new Date()): Subscription {
  return {
    ...service,
    reviewAfter: undefined,
    followUp: !decision.demo && service.status === 'active' && (decision.action === 'cancel' || decision.action === 'downgrade') ? {
      decisionId: decision.id, action: decision.action,
      dueOn: [addDays(today(now), 1), service.cancellationDeadline ?? service.renewsOn].sort()[0],
    } : undefined,
  };
}
export function billForecast(subscriptions: Subscription[], now = new Date(), horizon = 30) {
  const bills: { service: Subscription; date: string; amount: number; firstCharge: boolean }[] = [];
  for (const service of subscriptions) {
    if (service.status !== 'active' || daysUntil(service.renewsOn, now) < 0) continue;
    const [year, month, day] = service.renewsOn.split('-').map(Number);
    for (let index = 0; index < 13; index++) {
      const start = new Date(Date.UTC(year + (service.cadence === 'annual' ? index : 0), month - 1 + (service.cadence === 'monthly' ? index : 0), 1));
      const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
      start.setUTCDate(Math.min(day, lastDay));
      const date = start.toISOString().slice(0, 10);
      if (daysUntil(date, now) >= horizon) break;
      bills.push({ service, date, amount: service.costCents, firstCharge: Boolean(service.trialEndsOn && index === 0) });
    }
  }
  return bills.sort((a, b) => a.date.localeCompare(b.date) || a.service.name.localeCompare(b.service.name));
}
export const SERVICE_PRESETS: { name: string; category: Category; manageUrl: string }[] = [
  { name: 'Netflix', category: 'Entertainment', manageUrl: 'https://www.netflix.com/youraccount' },
  { name: 'Spotify', category: 'Entertainment', manageUrl: 'https://www.spotify.com/account/' },
  { name: 'YouTube Premium', category: 'Entertainment', manageUrl: 'https://www.youtube.com/paid_memberships' },
  { name: 'Notion', category: 'Productivity', manageUrl: 'https://www.notion.so/' },
  { name: 'Figma', category: 'Design', manageUrl: 'https://www.figma.com/' },
  { name: 'Adobe Creative Cloud', category: 'Design', manageUrl: 'https://account.adobe.com/plans' },
  { name: 'Canva', category: 'Design', manageUrl: 'https://www.canva.com/settings/' },
  { name: 'ChatGPT', category: 'AI & development', manageUrl: 'https://chatgpt.com/' },
  { name: 'GitHub Copilot', category: 'AI & development', manageUrl: 'https://github.com/settings/billing' },
  { name: 'Dropbox', category: 'Storage', manageUrl: 'https://www.dropbox.com/account/plan' },
  { name: 'iCloud+', category: 'Storage', manageUrl: 'https://account.apple.com/' },
  { name: 'Google One', category: 'Storage', manageUrl: 'https://one.google.com/settings' },
];
