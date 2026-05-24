# OpenClaw Server Maintenance

Operational files for the OpenClaw gateway on `193.203.182.112`.

## Files

- `10-resilience.conf`: systemd drop-in for gateway restart resilience.
- `openclaw-watchdog.sh`: lightweight health watchdog using `/health` with three-failure hysteresis.
- `openclaw-watchdog.service`: one-shot watchdog service.
- `openclaw-watchdog.timer`: runs watchdog every two minutes.
- `agent-identity-map.tsv`: ASCII-safe agent display names.
- `apply-agent-identities.sh`: applies agent names through `openclaw agents set-identity`.

## Safety

Do not commit raw OpenClaw backups, `.openclaw`, tokens, passwords, or config JSON containing secrets.
