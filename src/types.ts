/** Provider-agnostic types for the strap CLI */

export interface WhoopProfile {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface WhoopBody {
  heightMeter: number;
  weightKilogram: number;
  maxHeartRate: number;
}

export interface WhoopRecovery {
  cycleId: number;
  createdAt: string;
  scoreState: string;
  userCalibrating: boolean;
  score: {
    recoveryScore: number;
    hrvRmssdMilli: number;
    restingHeartRate: number;
    spo2Percentage: number | null;
    skinTempCelsius: number | null;
  } | null;
}

export interface WhoopSleepNeeded {
  baselineMs: number;
  debtMs: number;
  strainMs: number;
  napMs: number;
  totalMs: number;
}

export interface WhoopSleep {
  id: number;
  start: string;
  end: string;
  nap: boolean;
  scoreState: string;
  score: {
    sleepPerformancePercentage: number | null;
    sleepEfficiencyPercentage: number | null;
    sleepConsistencyPercentage: number | null;
    respiratoryRate: number | null;
    disturbanceCount: number | null;
    sleepCycleCount: number | null;
    totalInBedMs: number;
    totalRemMs: number;
    totalDeepMs: number;
    totalLightMs: number;
    totalAwakeMs: number;
    sleepNeeded: WhoopSleepNeeded | null;
  } | null;
}

export interface WhoopWorkout {
  id: number;
  start: string;
  end: string;
  sportName: string;
  scoreState: string;
  score: {
    strain: number;
    averageHeartRate: number;
    maxHeartRate: number;
    kilojoule: number;
    distanceMeter: number | null;
    altitudeGainMeter: number | null;
    altitudeChangeMeter: number | null;
    zoneMs: [number, number, number, number, number, number]; // zones 0-5
    percentRecorded: number | null;
  } | null;
}

export interface WhoopCycle {
  id: number;
  start: string;
  end: string | null;
  scoreState: string;
  score: {
    strain: number;
    averageHeartRate: number;
    maxHeartRate: number;
    kilojoule: number;
  } | null;
}

/** Every WHOOP-data provider must implement this interface */
export interface WhoopProvider {
  name: string;

  profile(): Promise<WhoopProfile>;
  body(): Promise<WhoopBody>;
  recovery(days: number): Promise<WhoopRecovery[]>;
  sleep(days: number): Promise<WhoopSleep[]>;
  workouts(days: number): Promise<WhoopWorkout[]>;
  cycles(days: number): Promise<WhoopCycle[]>;
  json(path: string, params?: Record<string, string>): Promise<unknown>;
}
