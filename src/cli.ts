#!/usr/bin/env bun
import { Command } from "commander";
import {
  saveOAuth2Credentials,
  loadOAuth2Credentials,
  loadTokens,
  saveTokens,
  buildAuthorizeUrl,
  exchangeCode,
  clearOAuth2Data,
} from "./lib/oauth2.ts";
import { importFromLuff } from "./lib/import-luff.ts";
import { readSecret } from "./lib/prompt.ts";
import * as out from "./lib/output.ts";
import { whoopProvider, OAUTH2_CONFIG } from "./providers/whoop.ts";
import type { WhoopProvider, WhoopSleep } from "./types.ts";

const provider: WhoopProvider = whoopProvider;

// ── Formatting helpers ───────────────────────────────────────────

function msToHm(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h${m}m`;
}

function msToMin(ms: number): string {
  return `${Math.round(ms / 60000)}m`;
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${Math.round(n)}%`;
}

function num(n: number | null): string {
  if (n == null) return "—";
  return String(Math.round(n));
}

// ── Program ──────────────────────────────────────────────────────

const program = new Command();
program
  .name("strap")
  .description("WHOOP health-data CLI — recovery, strain, sleep, workouts, cycles")
  .version("0.2.1")
  .addHelpText("after", `
OVERVIEW
  Fetches health and recovery data from the WHOOP API v2.
  All credentials are stored in macOS Keychain (service: strap).
  All data commands accept an optional [days] argument (default: 7).
  Output is formatted tables to stdout; use 'json' for raw API data.

COMMAND CATEGORIES
  Auth:
    auth-setup <id> <uri>            Save OAuth2 app credentials (secret prompted)
    auth-login                       Interactive OAuth2 login flow
    auth-status                      Check token validity
    auth-logout                      Remove all credentials

  Data (default 7 days):
    overview [days]    Full dashboard — profile + recovery + sleep + workouts
    recovery [days]    Recovery score, HRV, RHR, SpO2, skin temperature
    sleep [days]       Sleep stages, performance, efficiency, respiratory rate
    workouts [days]    Workout strain, HR zones, distance, elevation
    cycles [days]      Physiological cycles (day strain, avg/max HR, kJ)
    profile            User profile information
    body               Body measurements (height, weight, max HR)

  Raw API:
    json <path> [k=v ...]   Raw JSON from any WHOOP API endpoint

METRIC QUICK REFERENCE
  Recovery Score (0–100):
    67–100  Green   — Well recovered. Push hard, high-intensity training OK.
    34–66   Yellow  — Moderate recovery. Normal training, monitor fatigue.
    0–33    Red     — Under-recovered. Light activity only, prioritize sleep.

  Strain (0–21 scale, logarithmic):
    0–9     Light     — Easy day, minimal cardiovascular load
    10–13   Moderate  — Noticeable effort, typical normal day
    14–17   High      — Hard training, significant cardiovascular load
    18–21   All-out   — Maximal effort, extreme exertion

  Sleep Performance (%):
    100%+   Exceeded sleep need
    85–99%  Good — meeting most sleep needs
    70–84%  Fair — some sleep debt accumulating
    <70%    Poor — significant sleep debt

  Sleep Efficiency (%):
    ≥85%   Good — most time in bed is actual sleep
    <85%   Below target — too much awake time in bed

  Sleep Stages (% of total sleep time):
    REM    20–25%  — Memory consolidation, learning, emotional processing
    Deep   15–20%  — Physical recovery, immune function, growth hormone
    Light  50–55%  — Transition sleep, muscle recovery
    Awake  <10%    — Normal awakenings during sleep

  Sleep Needed breakdown:
    Baseline  — Base sleep need (genetic, age-dependent)
    +Debt     — Extra sleep needed to repay accumulated debt
    +Strain   — Extra sleep needed due to today's strain
    -Nap      — Sleep credit from naps taken

  HRV (RMSSD, ms) — higher is better:
    Highly individual. Track YOUR trend, not absolute values.
    Declining HRV over 3+ days = possible overtraining or illness.

  RHR (bpm) — lower is better:
    Trending down = improving fitness.
    Sudden spike (5+ bpm) = potential illness, stress, or overtraining.

  SpO2 (%):
    95–100%  Normal
    <95%     Below normal — may indicate altitude or respiratory issues

  Skin Temperature (°C):
    Baseline varies by person (~34–35°C typical).
    Spike >1°C above your baseline may indicate illness onset.

  Respiratory Rate (breaths/min during sleep):
    Normal: 12–20 breaths/min. Sudden increase may indicate illness.

  HR Zones (per workout, Z0–Z5):
    Z0  Below 50% max HR — Warm-up / cooldown
    Z1  50–60% max HR    — Light / recovery
    Z2  60–70% max HR    — Fat burn / aerobic base
    Z3  70–80% max HR    — Aerobic / cardio
    Z4  80–90% max HR    — Threshold / tempo
    Z5  90–100% max HR   — VO2 max / anaerobic

ALERTING THRESHOLDS
  Recovery <25 two days in a row    → Recovery critically low, consider rest day
  Sleep <5h two nights in a row     → Sleep debt accumulating, prioritize tonight
  HRV declining 3+ days             → Watch for overtraining or illness
  SpO2 <94%                         → Below normal, monitor for altitude or illness
  Skin temp >1°C above baseline     → Possible illness onset
  Strain >16 on red recovery day    → Overreaching risk

EXAMPLES
  strap recovery              Last 7 days recovery scores
  strap recovery 1            Just today's recovery
  strap sleep 14              Two weeks of sleep data
  strap workouts 30           Last month of workouts
  strap overview              Full 7-day dashboard
  strap json /v2/recovery     Raw JSON from recovery endpoint`);

// ── Auth commands ────────────────────────────────────────────────

program
  .command("auth-setup <clientId> <redirectUri>")
  .description("Save WHOOP OAuth2 app credentials (client secret prompted securely)")
  .addHelpText("after", `
Details:
  Stores your WHOOP developer app credentials in macOS Keychain
  (service: strap). You need a WHOOP developer account and an app
  registered at https://developer.whoop.com/ to get these values.
  The client secret is prompted securely (never passed as an argument).

  After setup, run 'strap auth-login' to complete the OAuth2 flow.

Arguments:
  clientId      — OAuth2 client ID from WHOOP developer portal
  redirectUri   — Redirect URI configured in your WHOOP app
  (client secret is entered at the secure prompt)

Example:
  strap auth-setup abc123 https://localhost:8080/callback`)
  .action(async (clientId: string, redirectUri: string) => {
    const clientSecret = await readSecret("WHOOP client secret: ");
    if (!clientSecret) {
      out.error("No client secret provided.");
      process.exit(1);
    }
    saveOAuth2Credentials(clientId, clientSecret, redirectUri);
    out.success("OAuth2 credentials saved to Keychain.");
    out.info("Now run: strap auth-login");
  });

program
  .command("auth-login")
  .description("Interactive OAuth2 login — opens browser, waits for redirect URL")
  .addHelpText("after", `
Details:
  Starts the OAuth2 Authorization Code flow:
  1. Prints an authorization URL — open it in your browser
  2. Log in to WHOOP and authorize the app
  3. You'll be redirected to your redirect URI with a code parameter
  4. Paste the full redirect URL back into the terminal
  5. Tokens are exchanged and saved to macOS Keychain

  Tokens auto-refresh on subsequent API calls via the 'offline' scope.
  Run 'strap auth-setup' first if you haven't saved credentials yet.

Example:
  strap auth-login`)
  .action(async () => {
    const creds = loadOAuth2Credentials();
    const state = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const url = buildAuthorizeUrl(OAUTH2_CONFIG, creds.clientId, creds.redirectUri, state);

    out.info("Open this URL in your browser:\n");
    console.log(url);
    out.blank();

    const rl = await import("readline");
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    const redirectUrl = await new Promise<string>((resolve) => {
      iface.question("After authorizing, paste the full redirect URL here:\n", (answer) => {
        iface.close();
        resolve(answer.trim());
      });
    });

    let parsed: URL;
    try {
      parsed = new URL(redirectUrl);
    } catch {
      out.error("That does not look like a valid redirect URL.");
      process.exit(1);
    }

    // searchParams.get() URL-decodes the value for us.
    const code = parsed.searchParams.get("code");
    if (!code) {
      out.error("Could not extract authorization code from URL.");
      process.exit(1);
    }

    // Validate the state parameter to bind this redirect to our request (CSRF protection).
    if (parsed.searchParams.get("state") !== state) {
      out.error("OAuth2 state mismatch — the pasted URL does not match this login request. Aborting.");
      process.exit(1);
    }

    const tokens = await exchangeCode(
      OAUTH2_CONFIG,
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
      code,
    );
    saveTokens(tokens);
    out.success("Login successful! Tokens saved to Keychain.");
  });

program
  .command("auth-status")
  .description("Check OAuth2 token status and expiry")
  .addHelpText("after", `
Details:
  Shows whether you're logged in, how long the access token is valid,
  and whether a refresh token is available for auto-renewal.

  If the access token is expired but a refresh token exists, it will
  auto-refresh on the next API call — no action needed.

Output fields:
  Token status    — Valid (with seconds remaining) or expired
  Refresh token   — Available or missing
  Credentials     — Storage location (macOS Keychain)

Example:
  strap auth-status`)
  .action(() => {
    const tokens = loadTokens();
    if (!tokens) {
      out.info("Not logged in.");
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    if (now >= tokens.expiresAt) {
      out.info("Token expired. Will auto-refresh on next API call.");
    } else {
      const remaining = tokens.expiresAt - now;
      out.success(`Logged in. Token valid for ${remaining}s.`);
    }
    out.info(`Refresh token: ${tokens.refreshToken ? "available" : "missing"}`);
    out.info("Credentials: macOS Keychain (service: strap)");
  });

program
  .command("auth-logout")
  .description("Remove all WHOOP credentials from macOS Keychain")
  .addHelpText("after", `
Details:
  Deletes OAuth2 client credentials and tokens from macOS Keychain.
  After logout, you'll need to run 'strap auth-setup' and 'strap auth-login'
  again to re-authenticate.

Example:
  strap auth-logout`)
  .action(() => {
    clearOAuth2Data();
    out.success("All WHOOP credentials removed from Keychain.");
  });

program
  .command("auth-import-from-luff")
  .description("One-shot: copy WHOOP auth from legacy luff-whoop Keychain entry")
  .addHelpText("after", `
Details:
  For users migrating from the older 'whoop' CLI shipped via the luff
  monorepo. Reads all credentials stored under the 'luff-whoop' Keychain
  service and copies them to 'strap'. Idempotent — re-run is safe.

  The source entries are NOT deleted; remove them manually with:
    security delete-generic-password -s luff-whoop -a <account>

Example:
  strap auth-import-from-luff`)
  .action(() => {
    const { copied, missing } = importFromLuff();
    if (copied.length === 0) {
      out.error("No entries found under luff-whoop. Nothing to import.");
      process.exit(1);
    }
    out.success(`Imported ${copied.length} entries from luff-whoop:`);
    for (const k of copied) console.log(`  + ${k}`);
    if (missing.length > 0) {
      out.blank();
      out.info(`Missing (not present in luff-whoop): ${missing.join(", ")}`);
    }
  });

// ── Data commands ────────────────────────────────────────────────

program
  .command("profile")
  .description("Show user profile (name, email)")
  .action(async () => {
    const p = await provider.profile();
    out.heading("Profile");
    out.blank();
    out.info(`${p.firstName} ${p.lastName} (${p.email})`);
  });

program
  .command("body")
  .description("Show body measurements — height, weight, max heart rate")
  .action(async () => {
    const b = await provider.body();
    out.heading("Body Measurements");
    out.blank();
    out.table(
      ["Metric", "Value"],
      [
        ["Height", `${(b.heightMeter * 100).toFixed(0)} cm`],
        ["Weight", `${b.weightKilogram.toFixed(1)} kg`],
        ["Max HR", `${b.maxHeartRate} bpm`],
      ],
    );
  });

program
  .command("recovery [days]")
  .description("Recovery scores (0–100), HRV (ms), RHR (bpm), SpO2 (%), skin temperature (°C)")
  .action(async (days?: string) => {
    const d = parseInt(days ?? "7", 10);
    const records = await provider.recovery(d);
    out.heading(`Recovery — last ${d} days`);
    out.blank();

    if (records.length === 0) {
      out.info("No recovery data.");
      return;
    }

    const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    out.table(
      ["Date", "Score", "HRV", "RHR", "SpO2", "Skin°C"],
      sorted.map((r) => [
        r.createdAt.split("T")[0]!,
        r.score ? String(r.score.recoveryScore) : r.scoreState,
        r.score ? String(Math.round(r.score.hrvRmssdMilli)) : "—",
        r.score ? String(Math.round(r.score.restingHeartRate)) : "—",
        r.score?.spo2Percentage != null ? String(r.score.spo2Percentage) : "—",
        r.score?.skinTempCelsius != null ? String(r.score.skinTempCelsius) : "—",
      ]),
    );
  });

program
  .command("sleep [days]")
  .description("Sleep stages, performance %, efficiency %, respiratory rate, sleep needed breakdown")
  .action(async (days?: string) => {
    const d = parseInt(days ?? "7", 10);
    const records = await provider.sleep(d);
    out.heading(`Sleep — last ${d} days`);
    out.blank();

    if (records.length === 0) {
      out.info("No sleep data.");
      return;
    }

    const sorted = [...records].sort((a, b) => a.start.localeCompare(b.start));
    out.table(
      ["Date", "Perf%", "Eff%", "Total", "REM", "Deep", "Light", "Awake", "RespR", "Dist", "Cycles", "Nap"],
      sorted.map((r: WhoopSleep) => [
        r.start.split("T")[0]!,
        pct(r.score?.sleepPerformancePercentage ?? null),
        pct(r.score?.sleepEfficiencyPercentage ?? null),
        r.score ? msToHm(r.score.totalInBedMs) : "—",
        r.score ? msToHm(r.score.totalRemMs) : "—",
        r.score ? msToHm(r.score.totalDeepMs) : "—",
        r.score ? msToHm(r.score.totalLightMs) : "—",
        r.score ? msToHm(r.score.totalAwakeMs) : "—",
        r.score?.respiratoryRate != null ? round1(r.score.respiratoryRate) : "—",
        num(r.score?.disturbanceCount ?? null),
        num(r.score?.sleepCycleCount ?? null),
        r.nap ? "nap" : "",
      ]),
    );

    const withNeeded = sorted.filter((r) => r.score?.sleepNeeded && !r.nap);
    if (withNeeded.length > 0) {
      out.blank();
      out.subheading("Sleep Need Breakdown");
      out.table(
        ["Date", "Needed", "Baseline", "+Debt", "+Strain", "-Nap"],
        withNeeded.map((r) => {
          const sn = r.score!.sleepNeeded!;
          return [
            r.start.split("T")[0]!,
            msToHm(sn.totalMs),
            msToHm(sn.baselineMs),
            sn.debtMs > 0 ? `+${msToHm(sn.debtMs)}` : "—",
            sn.strainMs > 0 ? `+${msToHm(sn.strainMs)}` : "—",
            sn.napMs < 0 ? msToHm(Math.abs(sn.napMs)) : "—",
          ];
        }),
      );
    }
  });

program
  .command("workouts [days]")
  .description("Workout strain (0–21), HR zones (Z0–Z5), distance, elevation, kilojoules")
  .action(async (days?: string) => {
    const d = parseInt(days ?? "7", 10);
    const records = await provider.workouts(d);
    out.heading(`Workouts — last ${d} days`);
    out.blank();

    if (records.length === 0) {
      out.info("No workout data.");
      return;
    }

    const sorted = [...records].sort((a, b) => a.start.localeCompare(b.start));
    out.table(
      ["Date", "Sport", "Strain", "AvgHR", "MaxHR", "kJ", "Dist(km)", "Elev(m)"],
      sorted.map((r) => [
        r.start.split("T")[0]!,
        r.sportName,
        r.score ? round1(r.score.strain) : "—",
        r.score ? String(r.score.averageHeartRate) : "—",
        r.score ? String(r.score.maxHeartRate) : "—",
        r.score ? String(Math.round(r.score.kilojoule)) : "—",
        r.score?.distanceMeter != null ? round1(r.score.distanceMeter / 1000) : "—",
        r.score?.altitudeGainMeter != null ? num(r.score.altitudeGainMeter) : "—",
      ]),
    );

    const withZones = sorted.filter((r) => r.score && r.score.zoneMs.some((z) => z > 0));
    if (withZones.length > 0) {
      out.blank();
      out.subheading("HR Zones");
      out.table(
        ["Date", "Sport", "Z0", "Z1", "Z2", "Z3", "Z4", "Z5"],
        withZones.map((r) => [
          r.start.split("T")[0]!,
          r.sportName,
          ...r.score!.zoneMs.map((z) => z > 0 ? msToMin(z) : "—"),
        ]),
      );
    }
  });

program
  .command("cycles [days]")
  .description("Physiological cycles — day strain, average/max HR, energy expenditure")
  .action(async (days?: string) => {
    const d = parseInt(days ?? "7", 10);
    const records = await provider.cycles(d);
    out.heading(`Cycles — last ${d} days`);
    out.blank();

    if (records.length === 0) {
      out.info("No cycle data.");
      return;
    }

    const sorted = [...records].sort((a, b) => a.start.localeCompare(b.start));
    out.table(
      ["Start", "End", "Strain", "AvgHR", "MaxHR", "kJ"],
      sorted.map((r) => {
        const startParts = r.start.split("T");
        const startStr = `${startParts[0]} ${startParts[1]?.split(".")[0]?.slice(0, 5) ?? ""}`;
        let endStr = "ongoing";
        if (r.end) {
          const endParts = r.end.split("T");
          endStr = `${endParts[0]} ${endParts[1]?.split(".")[0]?.slice(0, 5) ?? ""}`;
        }
        return [
          startStr,
          endStr,
          r.score ? round1(r.score.strain) : "—",
          r.score ? String(r.score.averageHeartRate) : "—",
          r.score ? String(r.score.maxHeartRate) : "—",
          r.score ? String(Math.round(r.score.kilojoule)) : "—",
        ];
      }),
    );
  });

program
  .command("overview [days]")
  .description("Full dashboard — profile + recovery + sleep + workouts in one view")
  .action(async (days?: string) => {
    const d = parseInt(days ?? "7", 10);
    out.heading(`WHOOP Overview — last ${d} days`);
    out.blank();

    try {
      const p = await provider.profile();
      out.subheading("Profile");
      out.info(`${p.firstName} ${p.lastName} (${p.email})`);
    } catch {
      out.info("(could not fetch profile)");
    }
    out.blank();

    out.subheading("Recovery");
    const recoveries = await provider.recovery(d);
    if (recoveries.length === 0) {
      out.info("No recovery data.");
    } else {
      const sortedR = [...recoveries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      out.table(
        ["Date", "Score", "HRV", "RHR", "SpO2", "Skin°C"],
        sortedR.map((r) => [
          r.createdAt.split("T")[0]!,
          r.score ? String(r.score.recoveryScore) : r.scoreState,
          r.score ? String(Math.round(r.score.hrvRmssdMilli)) : "—",
          r.score ? String(Math.round(r.score.restingHeartRate)) : "—",
          r.score?.spo2Percentage != null ? String(r.score.spo2Percentage) : "—",
          r.score?.skinTempCelsius != null ? String(r.score.skinTempCelsius) : "—",
        ]),
      );
    }
    out.blank();

    out.subheading("Sleep");
    const sleeps = await provider.sleep(d);
    if (sleeps.length === 0) {
      out.info("No sleep data.");
    } else {
      const sortedS = [...sleeps].sort((a, b) => a.start.localeCompare(b.start));
      out.table(
        ["Date", "Perf%", "Eff%", "Total", "REM", "Deep", "Light", "Awake", "RespR", "Nap"],
        sortedS.map((r) => [
          r.start.split("T")[0]!,
          pct(r.score?.sleepPerformancePercentage ?? null),
          pct(r.score?.sleepEfficiencyPercentage ?? null),
          r.score ? msToHm(r.score.totalInBedMs) : "—",
          r.score ? msToHm(r.score.totalRemMs) : "—",
          r.score ? msToHm(r.score.totalDeepMs) : "—",
          r.score ? msToHm(r.score.totalLightMs) : "—",
          r.score ? msToHm(r.score.totalAwakeMs) : "—",
          r.score?.respiratoryRate != null ? round1(r.score.respiratoryRate) : "—",
          r.nap ? "nap" : "",
        ]),
      );
    }
    out.blank();

    out.subheading("Workouts");
    const workoutsData = await provider.workouts(d);
    if (workoutsData.length === 0) {
      out.info("No workout data.");
    } else {
      const sortedW = [...workoutsData].sort((a, b) => a.start.localeCompare(b.start));
      out.table(
        ["Date", "Sport", "Strain", "AvgHR", "MaxHR", "kJ", "Dist(km)", "Elev(m)"],
        sortedW.map((r) => [
          r.start.split("T")[0]!,
          r.sportName,
          r.score ? round1(r.score.strain) : "—",
          r.score ? String(r.score.averageHeartRate) : "—",
          r.score ? String(r.score.maxHeartRate) : "—",
          r.score ? String(Math.round(r.score.kilojoule)) : "—",
          r.score?.distanceMeter != null ? round1(r.score.distanceMeter / 1000) : "—",
          r.score?.altitudeGainMeter != null ? num(r.score.altitudeGainMeter) : "—",
        ]),
      );
    }
  });

program
  .command("json <path> [params...]")
  .description("Raw JSON from any WHOOP API v2 endpoint")
  .action(async (path: string, params: string[]) => {
    const paramMap: Record<string, string> = {};
    for (const p of params) {
      const [k, v] = p.split("=");
      if (k && v) paramMap[k] = v;
    }
    out.json(await provider.json(path, Object.keys(paramMap).length ? paramMap : undefined));
  });

// ── Run ──────────────────────────────────────────────────────────

try {
  await program.parseAsync(process.argv);
} catch (e: unknown) {
  out.error((e as Error).message);
  process.exit(1);
}
