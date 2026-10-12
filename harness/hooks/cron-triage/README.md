# cron-triage — wake an agent only when it is worth it

A configurable trigger example that uses the JEV **`triage`** pack to decide
whether a scheduled tick or an incoming event should **wake an agent**. It
reuses the same provider + packs as the MCP server (via `../runner.mjs`).

> **Cron is an external wrapper, not an agent feature.** No coding agent ships a
> scheduler you can trust; a timer belongs to the operating system (cron,
> systemd-timer, a cloud scheduler) or to an event source (a webhook). This
> script is the decision the wrapper calls — it does not schedule anything.

## The decision

| `triage` verdict | Wake? | Why |
|---|---|---|
| `blocking` (a real regression) | **WAKE** | A human/agent must act now. |
| `rerunable` (flake) | sleep | Let the interval retry; do not spend an agent turn. |
| `environment` | sleep | Fix the environment; waking the agent will not help. |
| `test_bug` / `unknown` | sleep | Never wake on an unclassified signal. |

Offline (no provider key) means **sleep** — an unavailable pack can never
justify waking an agent.

## Two trigger shapes (both supported, choose per deployment)

### 1. Interval (cron / systemd-timer / cloud scheduler)

```bash
# every 5 minutes — a POLICY CHOICE, never hardcoded
*/5 * * * * cd /path/to/repo && \
  JEV_TRIAGE_INTERVAL_MS=300000 JEV_WAKE_CMD='<your wake command>' \
  node harness/hooks/cron-triage/wake.mjs --interval
```

See [`crontab.example`](./crontab.example). There is deliberately **no 15-minute
default**: the cadence is deployment policy. A fast tick is cheap because most
ticks resolve to sleep.

### 2. Event (webhook)

The same script, invoked by an event source. Any endpoint that can run a command
works — a tiny receiver, a CI failure hook, an alert manager, an inbound
webhook:

```bash
# a webhook handler / CI failure step receives an event payload and calls:
node harness/hooks/cron-triage/wake.mjs --event '{"kind":"ci_failed","log":"...","sha":"abc123"}'
```

`--event` sets the trigger to `event` and prepends the payload to the pack's
state. The decision is identical — only the *trigger* differs.

## Output

```json
{ "wake": true, "cause": "regression", "reason": "blocking regression",
  "trigger": "interval", "provider": "jev", "engine": "jev", "decision": { ... } }
```

Exit code is always `0`: "wake" is data, not an error. A caller branches on
`wake`. If `wake` is true and `JEV_WAKE_CMD` is set, the wake command runs.

## Configuration

| Env | Meaning |
|---|---|
| `JEV_TRIAGE_INTERVAL_MS` | Informational cadence for the pack's context (the real cadence is the trigger). |
| `JEV_WAKE_CMD` | Command to run when triage says WAKE. |
| `DECISION_ENGINE` / `JEV_API_KEY` | Same provider config as the MCP server (see `../../mcp/README.md`). |

## Verify

```bash
node harness/hooks/cron-triage/wake.mjs --state "the webhook handler throws after deploy"
node harness/hooks/cron-triage/wake.mjs --event '{"kind":"ci_failed"}'
```
