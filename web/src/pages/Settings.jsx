import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, TextField, Alert, Paper, Typography, Box, FormControlLabel, Switch } from '@mui/material';

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...window.atob(b64u)].map((c) => c.charCodeAt(0)));
}

function pushSupported() {
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

export default function Settings() {
  const [name, setName] = useState('');
  const [renameMsg, setRenameMsg] = useState({});
  const [pushStatus, setPushStatus] = useState({ text: '', cls: '' });
  const [subscribed, setSubscribed] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [loc, setLoc] = useState(null);
  const [locMsg, setLocMsg] = useState({ text: '', cls: '' });

  useEffect(() => {
    api('/api/me').then((r) => {
      if (r && r.data.name) setName(r.data.name);
    });
    api('/api/location/settings').then((r) => {
      if (r && r.status < 400) setLoc(r.data);
    });
    initPush();
  }, []);

  async function toggleLocation(e) {
    const enabled = e.target.checked;
    setLoc((l) => ({ ...l, enabled }));
    const r = await api('/api/location/settings', { method: 'POST', body: JSON.stringify({ enabled }) });
    if (!r || r.status >= 400) {
      setLoc((l) => ({ ...l, enabled: !enabled }));
      setLocMsg({ text: 'Could not save that setting.', cls: 'error' });
      return;
    }
    setLocMsg({
      text: enabled
        ? 'Location recording is on.'
        : 'Location recording is off — the browser is no longer asked and nothing new is stored.',
      cls: 'ok',
    });
  }

  async function forgetLocation() {
    if (!window.confirm('Delete every location stored for your nixes? This cannot be undone.')) return;
    const r = await api('/api/location', { method: 'DELETE' });
    if (!r || r.status >= 400) { setLocMsg({ text: 'Could not delete your location data.', cls: 'error' }); return; }
    const n = r.data.deleted || 0;
    setLoc((l) => ({ ...l, located: 0 }));
    setLocMsg({ text: `Deleted ${n} stored location${n === 1 ? '' : 's'}.`, cls: 'ok' });
  }

  async function initPush() {
    if (!pushSupported()) {
      setPushStatus({ text: 'This browser does not support Web Push.', cls: 'error' });
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
      setPushReady(true);
      reg.pushManager.onsubscriptionchange = async () => {
        const cur = await reg.pushManager.getSubscription();
        if (cur) await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: cur.toJSON() }) });
      };
    } catch (e) {
      setPushStatus({ text: `Could not start notifications: ${e.message}`, cls: 'error' });
    }
  }

  async function enable() {
    setPushStatus({ text: 'Requesting browser permission…', cls: '' });
    let perm;
    try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; }
    if (perm !== 'granted') {
      setPushStatus({ text: 'Permission denied. Turn on notifications for this site in your browser, then try again.', cls: 'error' });
      return;
    }
    setPushStatus({ text: 'Subscribing…', cls: '' });
    const r = await api('/api/push/public-key');
    const publicKey = r && r.data && r.data.publicKey;
    if (!publicKey) { setPushStatus({ text: 'Could not fetch the push key.', cls: 'error' }); return; }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      }
      const res = await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res || res.status >= 400) { setPushStatus({ text: 'Could not save your subscription.', cls: 'error' }); return; }
      setSubscribed(true);
      setPushStatus({ text: "You're subscribed — you'll get a push for every nix.", cls: 'ok' });
    } catch (e) {
      setPushStatus({ text: `Could not subscribe: ${e.message}`, cls: 'error' });
    }
  }

  async function disable() {
    setPushStatus({ text: 'Disabling…', cls: '' });
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      } else {
        await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({}) });
      }
      setSubscribed(false);
      setPushStatus({ text: '', cls: '' });
    } catch (e) {
      setPushStatus({ text: `Could not disable: ${e.message}`, cls: 'error' });
    }
  }

  async function rename(e) {
    e.preventDefault();
    setRenameMsg({});
    const res = await api('/api/me/name', { method: 'POST', body: JSON.stringify({ name }) });
    if (res.status === 409 && res.data.error === 'name_taken') { setRenameMsg({ text: 'That name is already taken.', cls: 'error' }); return; }
    if (res.status >= 400) { setRenameMsg({ text: 'Could not save name.', cls: 'error' }); return; }
    setName(res.data.name);
    setRenameMsg({ text: 'Saved.', cls: 'ok' });
  }

  const pushBtnLabel = !pushSupported()
    ? 'Not supported in this browser'
    : subscribed ? 'Disable nix notifications' : 'Enable nix notifications';

  return (
    <main className="narrow">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your profile and session.</p>
        </div>
      </div>

      <Paper component="section" className="card" elevation={0}>
        <h2>My nix name</h2>
        <form className="row" onSubmit={rename}>
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New name"
            autoComplete="off"
            required
            size="small"
            slotProps={{ htmlInput: { maxLength: 32 } }}
          />
          <Button variant="contained" type="submit">Save</Button>
        </form>
        {renameMsg.text && (
          <Box sx={{ mt: 1 }}>
            <Alert severity={renameMsg.cls === 'error' ? 'error' : 'success'} className={renameMsg.cls}>{renameMsg.text}</Alert>
          </Box>
        )}
      </Paper>

      <Paper component="section" className="card" elevation={0}>
        <h2>Notifications</h2>
        <p className="push-desc">Get a browser push whenever someone is nixed — even with this tab closed.</p>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" disabled={!pushSupported() || !pushReady} onClick={subscribed ? disable : enable}>
            {pushBtnLabel}
          </Button>
          {pushStatus.text && (
            pushStatus.cls === 'error'
              ? <Alert severity="error" className="error">{pushStatus.text}</Alert>
              : <Typography component="p" className={pushStatus.cls}>{pushStatus.text}</Typography>
          )}
        </Box>
      </Paper>

      <Paper component="section" className="card" elevation={0} id="location-settings">
        <h2>Location</h2>
        <p className="push-desc">
          When you report a nix, this browser can attach where you were. Only your own position is
          stored — never the person you nixed — rounded to roughly 100 m. The heatmap on the
          statistics page only ever shows cells of about a kilometre.
        </p>
        {loc && (
          <>
            <FormControlLabel
              control={<Switch checked={loc.enabled} onChange={toggleLocation} />}
              label="Record my location when I nix"
            />
            <p className="muted">
              {loc.located} location{loc.located === 1 ? '' : 's'} stored for your nixes.
            </p>
            <Button variant="outlined" color="error" disabled={!loc.located} onClick={forgetLocation}>
              Delete my location data
            </Button>
          </>
        )}
        {locMsg.text && (
          <Box sx={{ mt: 1 }}>
            <Alert severity={locMsg.cls === 'error' ? 'error' : 'success'} className={locMsg.cls}>{locMsg.text}</Alert>
          </Box>
        )}
      </Paper>

      <Paper component="section" className="card" elevation={0}>
        <h2>Session</h2>
        <a className="logout" href="/logout">Log out</a>
      </Paper>
    </main>
  );
}
