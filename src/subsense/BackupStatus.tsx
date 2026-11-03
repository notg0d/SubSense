import { useState } from 'react';
import type { Commit } from './ConnectionsView';
import type { Workspace } from './workspace';
import { backupDue, downloadBackup } from './workspace';
import { addDays, today } from './tracking';
import { Button, Notice } from './ui';

export default function BackupStatus({ workspace, commit, locked, compact = false }: { workspace: Workspace; commit: Commit; locked: boolean; compact?: boolean }) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (compact && !backupDue(workspace)) return null;
  return <div className={compact ? 'ss-panel p-2xl space-y-lg' : 'space-y-lg'}>
    <p className="text-sm font-medium">{compact ? 'You’ve made changes worth keeping a copy of.' : 'Workspace backup status'}</p>
    <p className="text-xs text-tertiary">{workspace.backup?.lastDownloadedAt ? `Last backup download: ${new Date(workspace.backup.lastDownloadedAt).toLocaleString()}. ${workspace.backup.changes} changes since then.` : 'No backup download recorded on this device.'} Online decision memory is not a full workspace backup.</p>
    <div className="flex flex-wrap items-center gap-md"><Button disabled={locked} onClick={() => {
      setError(''); setMessage('');
      try {
        const backup = { lastDownloadedAt: new Date().toISOString(), changes: 0 };
        downloadBackup(JSON.stringify({ ...workspace, backup }, null, 2));
        if (commit((w) => ({ ...w, backup }))) setMessage('Download started. Check that your browser saved the file.');
      } catch { setError('The backup could not be downloaded. Try again.'); }
    }}>Download backup</Button>
      {compact && <Button disabled={locked} variant="quiet" onClick={() => commit((w) => ({ ...w, backup: { ...w.backup, changes: w.backup?.changes ?? w.subscriptions.length + w.decisions.length, snoozedUntil: addDays(today(), 7) } }))}>Remind me in a week</Button>}
    </div>
    {error && <Notice error>{error}</Notice>}{message && <p role="status" className="text-xs text-tertiary">{message}</p>}
  </div>;
}
