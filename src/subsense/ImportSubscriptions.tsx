import { useRef, useState } from 'react';
import type { Subscription } from './workspace';
import { downloadBackup, money } from './workspace';
import { CSV_TEMPLATE, parseSubscriptionCsv } from './subscription-csv';
import { Button, Field, Modal, Notice, fieldClass } from './ui';

export default function ImportSubscriptions({ existing, onImport, onClose }: {
  existing: Subscription[]; onImport: (subscriptions: Subscription[]) => boolean; onClose: () => void;
}) {
  const [preview, setPreview] = useState<ReturnType<typeof parseSubscriptionCsv>>();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const request = useRef(0);
  return <Modal title="Import subscriptions" subtitle="Preview your spreadsheet before adding anything." onClose={onClose}>
    <div className="space-y-xl">
      <p className="text-sm text-secondary">Use USD prices, monthly or annual billing, and dates in YYYY-MM-DD format. Imports add new services without replacing existing ones.</p>
      <Button onClick={() => { try { downloadBackup(CSV_TEMPLATE, 'subsense-import-template.csv', 'text/csv;charset=utf-8'); } catch { setError('The template could not be downloaded.'); } }}>Download CSV template</Button>
      <Field label="Choose a CSV file"><input type="file" className={fieldClass} accept=".csv,text/csv" onChange={async (event) => {
        const file = event.target.files?.[0];
        const id = ++request.current;
        setPreview(undefined); setConfirmed(false); setError('');
        if (!file) { setReading(false); return; }
        setReading(true);
        try {
          if (file.size > 200000) throw new Error('CSV must be smaller than 200 KB.');
          const contents = await file.text();
          if (id === request.current) setPreview(parseSubscriptionCsv(contents, existing));
        } catch (e) { if (id === request.current) setError((e as Error).message); }
        finally { if (id === request.current) setReading(false); }
      }} /></Field>
      {reading && <p role="status" className="text-sm text-tertiary">Reading your file…</p>}
      {error && <Notice error>{error}</Notice>}
      {preview && <>
        <p className="text-sm font-semibold">{preview.subscriptions.length} subscriptions ready to review</p>
        <div className="max-h-80 overflow-auto rounded-xl border border-secondary"><table className="w-full text-left text-xs"><caption className="sr-only">CSV import preview in USD</caption><thead className="sticky top-0 bg-secondary"><tr>{['Service', 'Charge', 'Next date'].map((label) => <th scope="col" className="p-lg" key={label}>{label}</th>)}</tr></thead><tbody>{preview.subscriptions.map((s) => <tr key={s.id} className="border-t border-secondary"><td className="max-w-48 break-words p-lg">{s.name}{s.trialEndsOn && <span className="block text-tertiary">Trial</span>}</td><td className="p-lg tabular-nums">{money(s.costCents)} / {s.cadence === 'annual' ? 'yr' : 'mo'}</td><td className="p-lg">{s.renewsOn}</td></tr>)}</tbody></table></div>
        {preview.duplicates.length > 0 && <Notice>Possible duplicates: {[...new Set(preview.duplicates)].join(', ')}. These will be added as separate subscriptions. Edit the CSV first if that isn’t intended.</Notice>}
        <label className="flex items-start gap-md text-sm text-secondary"><input type="checkbox" className="subsense-choice mt-xxs size-4 shrink-0" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I reviewed the prices, dates and any duplicates.</label>
        <Button variant="primary" disabled={!confirmed || reading} onClick={() => { if (onImport(preview.subscriptions)) onClose(); }}>Import {preview.subscriptions.length} subscriptions</Button>
      </>}
    </div>
  </Modal>;
}
