import { useRef, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { loadConnections } from './api';
import type { Connections } from './api';
import CredentialsVault from './CredentialsVault';
import { readVault } from './vault';
import { useWalletAccess } from './WalletAccess';
import { Badge, Button, Modal } from './ui';

export default function HomeConnections({ busy, onBusy, onConfig }: {
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onConfig: (config: Connections) => void;
}) {
  const { session } = useWalletAccess();
  const [saved] = useState(() => {
    try { return Boolean(readVault(session.walletAddress!)); }
    catch { return false; }
  });
  const [unlocking, setUnlocking] = useState(false);
  const unlockCompleted = useRef(false);
  const connected = Boolean(session.vaultUnlocked ?? session.credentialsConfigured);
  if (!saved && !connected) return null;
  return <>
    <section className="ss-panel flex flex-col justify-between gap-xl p-2xl sm:flex-row sm:items-center" aria-label="Online connections">
      <div className="flex items-start gap-lg">
        <span className="ss-stat-icon">{connected ? <ShieldCheck size={21} className="shrink-0" aria-hidden="true" /> : <LockKeyhole size={21} className="shrink-0" aria-hidden="true" />}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-md"><h2 className="text-md font-semibold">Online connections</h2><Badge tone={connected ? 'success' : 'gray'}>{connected ? 'Unlocked' : 'Locked'}</Badge></div>
          <p className="mt-xs text-sm text-tertiary">{connected ? 'Your saved services are unlocked. You still choose what to share.' : 'Unlock your saved services for online memory or AI help. Nothing is shared automatically.'}</p>
        </div>
      </div>
      {!connected && <Button disabled={busy} onClick={() => setUnlocking(true)}><LockKeyhole size={16} className="shrink-0" aria-hidden="true" />Unlock online connections</Button>}
    </section>
    {unlocking && <Modal title="Unlock online connections" subtitle="Use the password for your saved keys on this device." onClose={() => { if (!busy) setUnlocking(false); }}>
      <CredentialsVault unlockOnly onChanged={async () => {
        onConfig(await loadConnections());
        unlockCompleted.current = true;
      }} onBusy={(value) => {
        onBusy(value);
        // Release the busy gate before closing and unmounting the vault.
        if (!value && unlockCompleted.current) {
          unlockCompleted.current = false;
          setUnlocking(false);
        }
      }} />
    </Modal>}
  </>;
}
