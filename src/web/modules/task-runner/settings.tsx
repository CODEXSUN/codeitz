import { SettingsNav } from '@workspace/ui/blocks/settings-nav';
import { useEffect, useState } from 'react';
import { Bot, Palette, Settings2 } from 'lucide-react';
import { AppearanceSettings, Badge, Button, Card, CardHeader, CardTitle, CardContent, useDesignSystem } from '@workspace/ui';
import packageInfo from '../../../../package.json';

import { navigate, useLocation } from '../../navigation';

type Connection = { available: boolean; signedIn: boolean; version: string; message: string };
export function SettingsPage() {
  const { section } = useLocation();
  const setSection = (value: string) => navigate(`/settings/${value}`);
  const { reset } = useDesignSystem();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/v1/tasks/setup');
      if (!response.ok) throw new Error('Unable to check local Codex.');
      setConnection((await response.json()).codex);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection check failed.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <main className="mx-auto max-w-6xl space-y-5 p-5 sm:p-8">
    <div><h1 className="text-2xl font-semibold tracking-tight">Settings</h1><p className="text-sm text-muted-foreground">Manage this workspace and how it looks on your device.</p></div>
    <div className="grid items-start gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
      <SettingsNav items={[{ id: 'application', label: 'Application', icon: <Settings2 className="size-4"/> }, { id: 'appearance', label: 'Appearance', icon: <Palette className="size-4"/> }, { id: 'codex', label: 'Codex', icon: <Bot className="size-4"/> }]} value={section} onValueChange={setSection}/>
      {section === 'appearance' ? <div className="space-y-5"><AppearanceSettings/><Button type="button" variant="outline" onClick={reset}>Reset defaults</Button></div> : section === 'application' ? <Card><CardHeader><CardTitle className="text-lg">Application</CardTitle><p className="text-sm text-muted-foreground">Codeitz · Local coding workspace</p></CardHeader><CardContent><dl className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Version</dt><dd className="mt-1 text-sm">{packageInfo.version}</dd></div><div><dt className="text-xs text-muted-foreground">Preferences</dt><dd className="mt-1 text-sm">Saved on this device for Codeitz</dd></div></dl></CardContent></Card> : <Card><CardHeader><CardTitle className="flex items-center justify-between gap-3 text-lg">Codex settings<Badge variant="outline">{busy ? 'Checking…' : connection?.signedIn ? 'Connected' : connection?.available ? 'Session unavailable' : 'CLI unavailable'}</Badge></CardTitle></CardHeader><CardContent className="space-y-5">
        <div><h2 className="text-sm font-medium">Local Codex connection</h2><p role="status" className="mt-2 text-sm">{busy ? 'Checking connection…' : connection?.message || 'Connection not checked.'}</p><p className="mt-2 text-sm text-muted-foreground">Reuses the existing signed-in Codex session on the computer running Codeitz. Credentials stay outside Codeitz.</p></div>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Connect local Codex</Button>
        <dl className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">CLI version</dt><dd className="mt-1 break-words text-sm">{connection?.version || 'Not detected'}</dd></div><div><dt className="text-xs text-muted-foreground">Session</dt><dd className="mt-1 text-sm">{connection?.signedIn ? 'Existing local session' : 'Not connected'}</dd></div><div><dt className="text-xs text-muted-foreground">Planning</dt><dd className="mt-1 text-sm">Read-only app inspection</dd></div><div><dt className="text-xs text-muted-foreground">Coding</dt><dd className="mt-1 text-sm">Selected app only, after approval</dd></div></dl>
        {!busy && !connection?.signedIn && <p className="text-sm text-muted-foreground">If your existing session is not detected, restart Codeitz from the terminal where Codex is already signed in, then connect again.</p>}
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      </CardContent></Card>}
    </div>
  </main>;
}
