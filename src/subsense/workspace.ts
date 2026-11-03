import {
  validateDecision,
  validDate,
  memoryReceipts,
} from '../../shared/subsense.mjs';
import type {
  Decision,
  Network,
} from '../../shared/subsense.mjs';
import { today, validateTrackedSubscription } from './tracking.ts';
import type { Subscription } from './tracking.ts';
export type { Subscription } from './tracking.ts';

export type {
  Decision,
  Action,
  Value,
  Category,
  Recommendation,
} from '../../shared/subsense.mjs';
export interface PaymentEvidence {
  network: Network;
  serviceId: string;
  digest: string;
  amountSui: string;
  recipient: string;
  timestamp: string;
  checkedAt: string;
  provider: string;
}
export interface Workspace {
  version: 1;
  profileId: string;
  sample: boolean;
  budgetCents: number;
  subscriptions: Subscription[];
  decisions: Decision[];
  payments: PaymentEvidence[];
  theme: 'light' | 'dark';
  backup?: { lastDownloadedAt?: string; changes: number; snoozedUntil?: string };
}
const KEY = 'subsense_workspace_v1';

export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100,
  );
export const dateLabel = (date: string) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
export function freshWorkspace(): Workspace {
  return {
    version: 1,
    profileId: crypto.randomUUID(),
    sample: false,
    budgetCents: 10000,
    subscriptions: [],
    decisions: [],
    payments: [],
    theme: 'dark',
  };
}
export function validateWorkspace(value: unknown, imported = false): Workspace {
  const v = value as Workspace;
  if (
    !v ||
    v.version !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.profileId,
    ) ||
    !Number.isSafeInteger(v.budgetCents) ||
    v.budgetCents <= 0 ||
    v.budgetCents > 999999999 ||
    typeof v.sample !== 'boolean' ||
    !Array.isArray(v.subscriptions) ||
    !Array.isArray(v.decisions) ||
    v.subscriptions.length > 200 ||
    v.decisions.length > 2000
  )
    throw new Error('This is not a valid SubSense workspace backup.');
  const subscriptions = v.subscriptions.map(validateTrackedSubscription);
  if (new Set(subscriptions.map((s) => s.id)).size !== subscriptions.length)
    throw new Error('Duplicate subscription IDs in backup.');
  const decisions = v.decisions.map((raw) => {
    const d = validateDecision(raw);
    if (imported) return { ...d, storage: 'local' as const };
    let storage = ['local', 'pending', 'testnet', 'mainnet', 'error'].includes(
      raw.storage ?? '',
    )
      ? raw.storage
      : 'local';
    if (
      ['mainnet', 'testnet'].includes(storage ?? '') &&
      (!raw.blobId || d.demo)
    )
      storage = 'local';
    if (storage === 'pending' && !raw.jobId) storage = 'local';
    const receipts = memoryReceipts({ ...raw, ...d });
    const network =
      raw.network ?? (storage === 'testnet' ? 'testnet' : 'mainnet');
    if (storage !== 'local' && !receipts.some((r) => r.network === network))
      storage = 'local';
    return {
      ...d,
      storage,
      ...(storage === 'local' ? {} : { network }),
      ...(receipts.length ? { receipts } : {}),
      jobId:
        typeof raw.jobId === 'string' ? raw.jobId.slice(0, 160) : undefined,
      blobId:
        typeof raw.blobId === 'string' ? raw.blobId.slice(0, 200) : undefined,
      syncError:
        typeof raw.syncError === 'string'
          ? raw.syncError.slice(0, 500)
          : undefined,
    };
  });
  if (new Set(decisions.map((d) => d.id)).size !== decisions.length)
    throw new Error('Duplicate decision IDs in backup.');
  const payments = imported
    ? []
    : (Array.isArray(v.payments) ? v.payments : [])
        .filter(
          (p) =>
            typeof p.digest === 'string' &&
            typeof p.serviceId === 'string' &&
            typeof p.amountSui === 'string' &&
            typeof p.recipient === 'string' &&
            typeof p.timestamp === 'string' &&
            (p.network === undefined ||
              p.network === 'mainnet' ||
              p.network === 'testnet') &&
            validDate(p.timestamp.slice(0, 10)),
        )
        .slice(0, 200)
        .map((p) => ({ ...p, network: p.network ?? ('mainnet' as const) }));
  let backup: Workspace['backup'];
  if (!imported && v.backup) {
    const b = v.backup;
    if (!Number.isSafeInteger(b.changes) || b.changes < 0 || b.changes > 1000000 ||
      (b.lastDownloadedAt !== undefined && (!Number.isFinite(Date.parse(b.lastDownloadedAt)) || new Date(b.lastDownloadedAt).toISOString() !== b.lastDownloadedAt)) ||
      (b.snoozedUntil !== undefined && !validDate(b.snoozedUntil))) throw new Error('Invalid backup status.');
    backup = { changes: b.changes, ...(b.lastDownloadedAt ? { lastDownloadedAt: b.lastDownloadedAt } : {}), ...(b.snoozedUntil ? { snoozedUntil: b.snoozedUntil } : {}) };
  }
  return {
    version: 1,
    profileId: v.profileId,
    sample: v.sample,
    budgetCents: v.budgetCents,
    subscriptions,
    decisions,
    payments,
    theme: v.theme === 'light' ? 'light' : 'dark',
    ...(backup ? { backup } : {}),
  };
}

const workspaceKey = (wallet?: string) => (wallet ? `${KEY}:${wallet}` : KEY);
export function readWorkspace(wallet?: string): {
  workspace: Workspace;
  warning?: string;
} {
  try {
    const saved = localStorage.getItem(workspaceKey(wallet));
    return {
      workspace: saved
        ? validateWorkspace(JSON.parse(saved))
        : freshWorkspace(),
    };
  } catch {
    return {
      workspace: freshWorkspace(),
      warning:
        'Your saved workspace could not be read. It has not been overwritten. Export your raw backup in Settings before making changes.',
    };
  }
}
export function saveWorkspace(w: Workspace, wallet?: string) {
  localStorage.setItem(workspaceKey(wallet), JSON.stringify(w));
}
export function trackWorkspaceChange(previous: Workspace, next: Workspace): Workspace {
  if (next.subscriptions === previous.subscriptions && next.decisions === previous.decisions && next.payments === previous.payments && next.budgetCents === previous.budgetCents) return next;
  return { ...next, backup: { ...next.backup, changes: Math.min(1000000, (previous.backup?.changes ?? previous.subscriptions.length + previous.decisions.length) + 1) } };
}
export function backupDue(workspace: Workspace, now = new Date()) {
  if (!workspace.subscriptions.length && !workspace.decisions.length) return false;
  if (workspace.backup?.snoozedUntil && workspace.backup.snoozedUntil > today(now)) return false;
  return (workspace.backup?.changes ?? workspace.subscriptions.length + workspace.decisions.length) >= 5 ||
    Boolean(workspace.backup?.lastDownloadedAt && workspace.backup.changes > 0 && Date.parse(workspace.backup.lastDownloadedAt) < now.getTime() - 30 * 86400000);
}
export function rawBackup(wallet?: string) {
  return localStorage.getItem(workspaceKey(wallet)) ?? '{}';
}
export function downloadBackup(
  contents: string,
  name = 'subsense-workspace.json',
  type = 'application/json',
) {
  const url = URL.createObjectURL(
    new Blob([contents], { type }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
