# OpenClaw Maintenance Report - 2026-05-24

## Server

- Host: `193.203.182.112`
- OpenClaw: `2026.5.22`
- Channel: `stable`
- Update status: latest available on stable, no registry update available.
- Gateway service: `openclaw.service` active and enabled.
- Gateway bind: `172.17.0.1:18789`
- HTTP health: `{"ok":true,"status":"live"}`
- Watchdog: `openclaw-watchdog.timer` active and enabled.
- Watchdog policy: HTTP `/health`, 15s timeout, restart after 3 consecutive failures.

## Backups

Pre-change verified backup:

- `/root/openclaw-backups/2026-05-24T19-04-59.047Z-openclaw-backup.tar.gz`

Post-change verified backup:

- `/root/openclaw-backups/2026-05-24T19-38-40.985Z-openclaw-backup.tar.gz`
- `openclaw backup verify`: `ok: true`
- Entries: `95583`
- Runtime version in backup manifest: `2026.5.22`

Config-local backup before agent rename:

- `/root/.openclaw/openclaw.json.pre-name-normalize-2026-05-24T19-37-28-789Z.bak`

## Agent Names

- Total agents checked: `66`
- Broken/non-ASCII names before fix: `35`
- Agents normalized: `66`
- Broken/non-ASCII names after fix: `0`
- Naming policy: ASCII `Title-Case-Hyphen` to avoid terminal/UI mojibake.

## Robustness

- `Restart=always`
- `RestartSec=5s`
- `StartLimitIntervalSec=0`
- `Environment=HOME=/root`
- Config validation passed after changes.
- Gateway restarted cleanly after config normalization.

## Known Warnings Not Auto-Fixed

- `openclaw doctor` reports plaintext secrets in `openclaw.json`. This should be migrated with `openclaw secrets configure/apply`, but it requires careful secret handling and should not be automated blindly.
- `openclaw doctor` reports `custom` bind on `172.17.0.1`; this is expected for the current reverse-proxy/container path.
- `openclaw doctor` reports cron jobs pinned to `openai/gpt-4.1-mini`; this appears intentional for cost control.
- `openclaw gateway status --deep` still describes the legacy user service runtime as stopped, while the real system service is active and responding. The active production service is `/etc/systemd/system/openclaw.service`.
