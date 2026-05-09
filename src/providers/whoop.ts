import { HttpClient } from "../lib/http.ts";
import { getValidAccessToken, type OAuth2Config } from "../lib/oauth2.ts";
import type {
  WhoopProvider,
  WhoopProfile,
  WhoopBody,
  WhoopRecovery,
  WhoopSleep,
  WhoopSleepNeeded,
  WhoopWorkout,
  WhoopCycle,
} from "../types.ts";

const BASE_URL = "https://api.prod.whoop.com/developer";

export const OAUTH2_CONFIG: OAuth2Config = {
  authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
  tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
  scopes: [
    "read:recovery",
    "read:cycles",
    "read:sleep",
    "read:workout",
    "read:profile",
    "read:body_measurement",
    "offline",
  ],
};

// ── Raw API types (snake_case) ───────────────────────────────────

interface RawRecovery {
  cycle_id: number;
  created_at: string;
  score_state: string;
  user_calibrating?: boolean;
  score: {
    recovery_score: number;
    hrv_rmssd_milli: number;
    resting_heart_rate: number;
    spo2_percentage: number | null;
    skin_temp_celsius: number | null;
  } | null;
}

interface RawSleepNeeded {
  baseline_milli: number;
  need_from_sleep_debt_milli: number;
  need_from_recent_strain_milli: number;
  need_from_recent_nap_milli: number;
}

interface RawSleep {
  id: number;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score: {
    sleep_performance_percentage: number | null;
    sleep_efficiency_percentage: number | null;
    sleep_consistency_percentage: number | null;
    respiratory_rate: number | null;
    stage_summary: {
      total_in_bed_time_milli: number;
      total_rem_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_light_sleep_time_milli: number;
      total_awake_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: RawSleepNeeded | null;
  } | null;
}

interface RawWorkout {
  id: number;
  start: string;
  end: string;
  sport_name: string;
  score_state: string;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    distance_meter: number | null;
    altitude_gain_meter: number | null;
    altitude_change_meter: number | null;
    zone_zero_milli: number | null;
    zone_one_milli: number | null;
    zone_two_milli: number | null;
    zone_three_milli: number | null;
    zone_four_milli: number | null;
    zone_five_milli: number | null;
    percent_recorded: number | null;
  } | null;
}

interface RawCycle {
  id: number;
  start: string;
  end: string | null;
  score_state: string;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
  } | null;
}

interface RawProfile {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface RawBody {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

interface Paginated<T> {
  records: T[];
  next_token: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────

async function client(): Promise<HttpClient> {
  const token = await getValidAccessToken(OAUTH2_CONFIG);
  return new HttpClient({
    baseUrl: BASE_URL,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function getAll<T>(
  http: HttpClient,
  path: string,
  params?: Record<string, string>,
): Promise<T[]> {
  let all: T[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 40; i++) {
    const p: Record<string, string> = { ...params, limit: "25" };
    if (nextToken) p.nextToken = nextToken;
    const res = await http.get<Paginated<T>>(path, p);
    all = all.concat(res.records ?? []);
    if (!res.next_token) break;
    nextToken = res.next_token;
  }
  return all;
}

function dateRange(days: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setUTCHours(0, 0, 0, 0);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

// ── Mappers ──────────────────────────────────────────────────────

function mapRecovery(r: RawRecovery): WhoopRecovery {
  return {
    cycleId: r.cycle_id,
    createdAt: r.created_at,
    scoreState: r.score_state,
    userCalibrating: r.user_calibrating ?? false,
    score: r.score
      ? {
          recoveryScore: r.score.recovery_score,
          hrvRmssdMilli: r.score.hrv_rmssd_milli,
          restingHeartRate: r.score.resting_heart_rate,
          spo2Percentage: r.score.spo2_percentage,
          skinTempCelsius: r.score.skin_temp_celsius,
        }
      : null,
  };
}

function mapSleepNeeded(sn: RawSleepNeeded | null): WhoopSleepNeeded | null {
  if (!sn) return null;
  return {
    baselineMs: sn.baseline_milli,
    debtMs: sn.need_from_sleep_debt_milli,
    strainMs: sn.need_from_recent_strain_milli,
    napMs: sn.need_from_recent_nap_milli,
    totalMs: sn.baseline_milli + sn.need_from_sleep_debt_milli + sn.need_from_recent_strain_milli + sn.need_from_recent_nap_milli,
  };
}

function mapSleep(r: RawSleep): WhoopSleep {
  return {
    id: r.id,
    start: r.start,
    end: r.end,
    nap: r.nap,
    scoreState: r.score_state,
    score: r.score
      ? {
          sleepPerformancePercentage: r.score.sleep_performance_percentage,
          sleepEfficiencyPercentage: r.score.sleep_efficiency_percentage,
          sleepConsistencyPercentage: r.score.sleep_consistency_percentage,
          respiratoryRate: r.score.respiratory_rate,
          disturbanceCount: r.score.stage_summary.disturbance_count,
          sleepCycleCount: r.score.stage_summary.sleep_cycle_count,
          totalInBedMs: r.score.stage_summary.total_in_bed_time_milli,
          totalRemMs: r.score.stage_summary.total_rem_sleep_time_milli,
          totalDeepMs: r.score.stage_summary.total_slow_wave_sleep_time_milli,
          totalLightMs: r.score.stage_summary.total_light_sleep_time_milli,
          totalAwakeMs: r.score.stage_summary.total_awake_time_milli,
          sleepNeeded: mapSleepNeeded(r.score.sleep_needed),
        }
      : null,
  };
}

function mapWorkout(r: RawWorkout): WhoopWorkout {
  return {
    id: r.id,
    start: r.start,
    end: r.end,
    sportName: r.sport_name,
    scoreState: r.score_state,
    score: r.score
      ? {
          strain: r.score.strain,
          averageHeartRate: r.score.average_heart_rate,
          maxHeartRate: r.score.max_heart_rate,
          kilojoule: r.score.kilojoule,
          distanceMeter: r.score.distance_meter,
          altitudeGainMeter: r.score.altitude_gain_meter,
          altitudeChangeMeter: r.score.altitude_change_meter,
          zoneMs: [
            r.score.zone_zero_milli ?? 0,
            r.score.zone_one_milli ?? 0,
            r.score.zone_two_milli ?? 0,
            r.score.zone_three_milli ?? 0,
            r.score.zone_four_milli ?? 0,
            r.score.zone_five_milli ?? 0,
          ],
          percentRecorded: r.score.percent_recorded,
        }
      : null,
  };
}

function mapCycle(r: RawCycle): WhoopCycle {
  return {
    id: r.id,
    start: r.start,
    end: r.end,
    scoreState: r.score_state,
    score: r.score
      ? {
          strain: r.score.strain,
          averageHeartRate: r.score.average_heart_rate,
          maxHeartRate: r.score.max_heart_rate,
          kilojoule: r.score.kilojoule,
        }
      : null,
  };
}

function mapProfile(r: RawProfile): WhoopProfile {
  return {
    userId: r.user_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
  };
}

function mapBody(r: RawBody): WhoopBody {
  return {
    heightMeter: r.height_meter,
    weightKilogram: r.weight_kilogram,
    maxHeartRate: r.max_heart_rate,
  };
}

// ── Provider ─────────────────────────────────────────────────────

export const whoopProvider: WhoopProvider = {
  name: "whoop",

  async profile() {
    const http = await client();
    return mapProfile(await http.get<RawProfile>("/v2/user/profile/basic"));
  },

  async body() {
    const http = await client();
    return mapBody(await http.get<RawBody>("/v2/user/measurement/body"));
  },

  async recovery(days) {
    const http = await client();
    const { start, end } = dateRange(days);
    const raw = await getAll<RawRecovery>(http, "/v2/recovery", { start, end });
    return raw.map(mapRecovery);
  },

  async sleep(days) {
    const http = await client();
    const { start, end } = dateRange(days);
    const raw = await getAll<RawSleep>(http, "/v2/activity/sleep", { start, end });
    return raw.map(mapSleep);
  },

  async workouts(days) {
    const http = await client();
    const { start, end } = dateRange(days);
    const raw = await getAll<RawWorkout>(http, "/v2/activity/workout", { start, end });
    return raw.map(mapWorkout);
  },

  async cycles(days) {
    const http = await client();
    const { start, end } = dateRange(days);
    const raw = await getAll<RawCycle>(http, "/v2/cycle", { start, end });
    return raw.map(mapCycle);
  },

  async json(path, params) {
    const http = await client();
    return http.get(path, params);
  },
};
