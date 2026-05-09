# strap

A terminal CLI for [WHOOP](https://www.whoop.com) — recovery, strain, sleep, workouts, and cycles via the official WHOOP API v2.

The name comes from WHOOP's wearable, which is called a *strap*. This is an unofficial third-party CLI.

```
$ strap recovery
Recovery — last 7 days

Date        Score  HRV  RHR  SpO2  Skin°C
──────────  ─────  ───  ───  ────  ──────
2026-05-03  68     52   54   97    34.2
2026-05-04  74     58   53   97    34.1
2026-05-05  41     38   58   96    34.6
2026-05-06  55     46   55   96    34.4
2026-05-07  72     56   53   97    34.2
2026-05-08  81     63   51   97    34.1
2026-05-09  79     61   52   97    34.1

$ strap sleep 1
Sleep — last 1 days

Date        Perf%  Eff%  Total  REM   Deep  Light  Awake  RespR  Dist  Cycles  Nap
──────────  ─────  ────  ─────  ────  ────  ─────  ─────  ─────  ────  ──────  ───
2026-05-09  92%    91%   7h44m  1h45m 1h22m 4h12m  0h25m  15.2   8     5
```

## Requirements

- macOS (uses Keychain for credential storage)
- [Bun](https://bun.sh) ≥ 1.0
- A [WHOOP developer app](https://developer.whoop.com/) — register at developer.whoop.com to get a `client_id`, `client_secret`, and configure a redirect URI.

## Install

```bash
git clone https://github.com/serhiitroinin/strap.git
cd strap
bun install
bun run build              # compiles to dist/strap
ln -s "$PWD/dist/strap" /usr/local/bin/strap   # optional: put on PATH
```

Or run directly: `bun run src/cli.ts recovery`

## First-time setup

1. Register a developer app at https://developer.whoop.com/.
2. Note your `client_id`, `client_secret`, and configured redirect URI (any HTTPS URL works — `https://localhost:8080/callback` is fine).
3. Run setup + login:

   ```bash
   strap auth-setup <client_id> <client_secret> <redirect_uri>
   strap auth-login
   ```

   `auth-login` prints an authorization URL. Open it, log in to WHOOP, authorize the app, then paste the resulting redirect URL back into the terminal. Tokens are saved to macOS Keychain (service: `strap`) and auto-refresh on subsequent calls.

## Commands

### Auth

| Command | Description |
|---|---|
| `strap auth-setup <id> <secret> <uri>` | Save OAuth2 app credentials |
| `strap auth-login` | Interactive OAuth2 login flow |
| `strap auth-status` | Check token validity |
| `strap auth-logout` | Wipe all credentials |

### Data (default: last 7 days)

| Command | Description |
|---|---|
| `strap overview [days]` | Profile + recovery + sleep + workouts |
| `strap recovery [days]` | Score, HRV, RHR, SpO2, skin temperature |
| `strap sleep [days]` | Stages, performance, efficiency, sleep need |
| `strap workouts [days]` | Strain, HR zones (Z0–Z5), distance, elevation |
| `strap cycles [days]` | Day strain, avg/max HR, kilojoules |
| `strap profile` | User profile |
| `strap body` | Height, weight, max HR |

### Raw API

| Command | Description |
|---|---|
| `strap json <path> [k=v ...]` | Print raw JSON from any WHOOP API v2 endpoint |

## Metric reference

### Recovery score (0–100)

| Score | Color | Meaning |
|---|---|---|
| 67–100 | Green | Well recovered. Push hard, high-intensity training OK. |
| 34–66 | Yellow | Moderate. Normal training, monitor fatigue. |
| 0–33 | Red | Under-recovered. Light activity only, prioritize sleep. |

### Strain (0–21, logarithmic)

| Range | Label | Meaning |
|---|---|---|
| 0–9 | Light | Easy day, minimal cardiovascular load |
| 10–13 | Moderate | Noticeable effort, typical normal day |
| 14–17 | High | Hard training, significant cardiovascular load |
| 18–21 | All-out | Maximal effort, extreme exertion |

### Sleep performance (% of need)

`100%+` exceeded · `85–99%` good · `70–84%` fair · `<70%` significant debt

### Sleep stages (% of total)

REM 20–25% · Deep 15–20% · Light 50–55% · Awake <10%

### HR zones (per workout)

| Zone | % max HR | Meaning |
|---|---|---|
| Z0 | <50% | Warm-up / cooldown |
| Z1 | 50–60% | Light / recovery |
| Z2 | 60–70% | Fat burn / aerobic base |
| Z3 | 70–80% | Aerobic / cardio |
| Z4 | 80–90% | Threshold / tempo |
| Z5 | 90–100% | VO2 max / anaerobic |

### Alerting thresholds

- Recovery <25 two days in a row → critically low, consider rest day
- Sleep <5h two nights in a row → sleep debt accumulating
- HRV declining 3+ days → watch for overtraining or illness
- SpO2 <94% → below normal, monitor for altitude or illness
- Skin temp >1°C above baseline → possible illness onset
- Strain >16 on red recovery day → overreaching risk

## Credentials & security

Stored in macOS Keychain under service `strap`:

- `client-id`, `client-secret`, `redirect-uri` — your WHOOP app credentials
- `access-token`, `refresh-token`, `expires-at` — OAuth2 tokens

Inspect: `security find-generic-password -s strap -a access-token -w`

Wipe: `strap auth-logout`

## Disclaimer

This tool is **not** affiliated with, endorsed by, or supported by WHOOP, Inc. "WHOOP" is a trademark of WHOOP, Inc. This CLI uses the public WHOOP Developer API v2 and adheres to its terms of use; you must register your own developer app to use it.

## License

MIT
