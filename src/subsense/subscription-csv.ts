import { dollarsToCents } from '../../shared/subsense.mjs';
import { validateTrackedSubscription } from './tracking.ts';
import type { Subscription } from './tracking.ts';

export const CSV_TEMPLATE = 'name,price,cadence,renewsOn,category,trialEndsOn,cancellationDeadline,manageUrl\r\nMy service,9.99,monthly,2027-01-15,Other,,,\r\n';
export function parseSubscriptionCsv(contents: string, existing: Subscription[] = []) {
  if (contents.length > 200000) throw new Error('CSV must be smaller than 200 KB.');
  // Quoted fields may contain commas, newlines and escaped double quotes.
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const input = contents.replace(/^\uFEFF/, '');
  for (let i = 0; i <= input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === undefined) throw new Error('CSV has an unclosed quoted field.');
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === ',' || ch === '\n' || ch === '\r' || ch === undefined) {
      row.push(field.trim()); field = ''; closed = false;
      if (ch !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (ch === '\r' && input[i + 1] === '\n') i++;
      }
    } else if (ch === '"' && !field && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error('CSV has invalid quoting.');
      field += ch;
    }
  }
  const headers = rows.shift();
  const allowed = ['name', 'price', 'cadence', 'renewsOn', 'category', 'trialEndsOn', 'cancellationDeadline', 'manageUrl', 'notes'];
  if (!headers || new Set(headers).size !== headers.length || headers.some((h) => !allowed.includes(h)) || ['name', 'price', 'cadence', 'renewsOn'].some((h) => !headers.includes(h))) throw new Error('Use the template headers: name, price, cadence, renewsOn, with the optional columns shown in the template.');
  if (!rows.length || rows.length + existing.length > 200) throw new Error('Import between 1 and 200 subscriptions, including those already saved.');
  const names = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  const duplicates: string[] = [];
  const subscriptions = rows.map((columns, index) => {
    try {
      if (columns.length !== headers.length) throw new Error('Column count does not match the header.');
      const raw = Object.fromEntries(headers.map((h, i) => [h, columns[i]]));
      const service = validateTrackedSubscription({ ...raw, id: crypto.randomUUID(), costCents: dollarsToCents(raw.price), category: raw.category || 'Other', usage: 'occasional', importance: 'useful', status: 'active', workRelated: false, notes: raw.notes || '' });
      const name = service.name.toLowerCase();
      if (names.has(name)) duplicates.push(service.name);
      names.add(name);
      return service;
    } catch (error) { throw new Error(`Data row ${index + 1}: ${(error as Error).message}`); }
  });
  return { subscriptions, duplicates };
}
