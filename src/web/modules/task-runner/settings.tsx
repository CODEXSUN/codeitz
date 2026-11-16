import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@workspace/ui';

type Connection = { available: boolean; signedIn: boolean; version: string; message: string };
export function SettingsPage() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/tasks/setup');
      if (!response.ok) throw new Error('Unable to check local Codex.');
      setConnection((await response.json()).codex);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection check failed.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <main className="mx-auto max-w-3xl space-y-6 p-6 sm:p-10">
    <h1 className="text-3xl font-semibold">Settings</h1>
    <Card><CardHeader><CardTitle>Local Codex</CardTitle></CardHeader><CardContent className="space-y-4">
      <p role="status">{busy ? 'Checking connection…' : connection?.message || 'Connection not checked.'}</p>
      {connection?.version && <p className="text-sm text-muted-foreground">{connection.version}</p>}
      <p className="text-sm">Uses the existing signed-in Codex session on the computer running Codeitz. Credentials stay outside Codeitz.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Connect local Codex</Button>
      </div>
      {!connection?.signedIn && <p className="text-sm">If your existing session is not detected, restart Codeitz from the terminal where Codex is already signed in, then connect again.</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </CardContent></Card>

  </main>;
}
