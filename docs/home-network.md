# Home Network Setup

How to run MISSION-CONTROL so every device on your home network pushes its
Claude Code session data to one dashboard, and any browser on the network can
view it.

## Architecture

```
┌─────────────── host machine ───────────────┐
│  Postgres (Docker, loopback only)          │
│  Express backend  ← 0.0.0.0:9000 ──────────┼── LAN
│  collector (host's own sessions)           │
└────────────────────────────────────────────┘
        ▲ HTTP ingest (device key)     ▲ browser (password login)
┌───────┴────────┐              ┌──────┴───────┐
│ laptop         │              │ phone/tablet │
│ collector.js   │              │ dashboard UI │
└────────────────┘              └──────────────┘
```

- **One host** runs Postgres + the backend (`./start.sh`). Postgres is bound to
  `127.0.0.1` and is never reachable from the network — collectors talk to the
  backend over HTTP only.
- **Every device** (including the host) runs a collector that reads its local
  `~/.claude` session files and pushes them to the backend with a per-device
  API key.
- **Any browser** on the network views the dashboard with the shared
  `DASHBOARD_PASSWORD`.

## 1. Host setup (once)

```bash
git clone git@github.com:erickcap14/mission-control.git
cd mission-control
cp .env.example .env        # then set a real DASHBOARD_PASSWORD
./start.sh
```

`start.sh` starts Postgres (Docker), applies migrations, launches the backend,
and starts the host's own collector. On startup the backend prints every URL
it is reachable at, e.g.:

```
Reachable from other devices on your network:
  http://your-mac.local:9000
  http://192.168.1.23:9000
```

Prefer the `.local` (Bonjour/mDNS) name — it survives DHCP lease changes.
If your router doesn't resolve `.local` names for some device, use the IP, or
give the host a DHCP reservation in your router settings so its IP is stable.

## 2. Register each additional device (on the host)

```bash
npm run register-device -- --id macbook-air --name "MacBook Air"
```

This prints the device's API key **exactly once**. Copy it — you'll paste it
into that device's config in the next step. Re-running the command for the
same id rotates the key.

## 3. Configure the collector (on each device)

Clone the repo on the device, then:

```bash
npm install
cp collector.config.example.json collector.config.json
```

Edit `collector.config.json`:

```json
{
  "backendUrl": "http://your-mac.local:9000",
  "deviceId": "macbook-air",
  "deviceName": "MacBook Air",
  "deviceKey": "<key printed at registration>",
  "claudeDir": "~/.claude",
  "scanPath": "~/Documents"
}
```

Then run it:

```bash
npm run collector
```

The collector backfills that device's session history on startup, then watches
`~/.claude/projects/**/*.jsonl` and pushes changes live. Leave it running (or
add it to your login items / a `launchd` job).

## 4. View the dashboard from anywhere on the network

Open `http://your-mac.local:9000` from any device and log in with
`DASHBOARD_PASSWORD`. Use the device filter in the top bar to slice stats by
machine.

## Security notes

- The dashboard and all read APIs require the password; ingest requires a
  valid device key (stored scrypt-hashed on the host). Failed logins are
  rate-limited per IP (10 failures → 15-minute lockout).
- Traffic is plain HTTP by default, which is fine for a trusted home LAN. For
  an untrusted network, run `npm run gen-cert` and set `TLS_CERT_FILE` /
  `TLS_KEY_FILE` in `.env`, or put all devices on a Tailscale/WireGuard
  overlay (see `.claude/security.md`).
- Changing `DASHBOARD_PASSWORD` logs every browser out automatically (the
  cookie secret is derived from it unless `SESSION_SECRET` is set).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Collector logs `cannot reach backend` | Check `backendUrl`, host firewall (macOS: System Settings → Network → Firewall must allow node), and that `start.sh` is running. |
| Collector gets `403` | Device key is wrong or was rotated — re-run `register-device` and update `collector.config.json`. |
| Browser can't resolve `your-mac.local` | Use the IP printed at backend startup, or set a DHCP reservation for the host. |
| Login returns `429` | Too many failed attempts from that device; wait 15 minutes. |
