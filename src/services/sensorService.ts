/**
 * Service for Field Sensor Monitoring (Temperature, Humidity, Motion via LoRa).
 * Communicates with the local Python Flask SQLite service.
 * Supports configurable local endpoints so mobile phones on the local Wi-Fi can reach the service.
 */

export interface SensorReading {
  id?: number;
  device_id: string;
  temperature: number;
  humidity: number;
  motion: boolean;
  is_simulated: boolean;
  created_at: string;
}

export type StressLevel = 'Easy' | 'Medium' | 'Hard';

export interface SensorThresholds {
  easyTempMax: number;    // default 28°C
  mediumTempMax: number;  // default 35°C
  easyHumMin: number;     // default 40%
  easyHumMax: number;     // default 70%
  mediumHumMin: number;   // default 30%
  mediumHumMax: number;   // default 85%
}

export const DEFAULT_THRESHOLDS: SensorThresholds = {
  easyTempMax: 28,
  mediumTempMax: 35,
  easyHumMin: 40,
  easyHumMax: 70,
  mediumHumMin: 30,
  mediumHumMax: 85,
};

const STORAGE_KEY_BACKEND_URL = 'plant_doctor_sensor_backend_url';
const STORAGE_KEY_THRESHOLDS = 'plant_doctor_sensor_thresholds';
export const DEFAULT_LOCAL_BACKEND_URL = 'http://localhost:5000';

/** Retrieve currently configured local backend URL */
export function getSensorBackendUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_BACKEND_URL;
  const saved = localStorage.getItem(STORAGE_KEY_BACKEND_URL);
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, '');
  }
  return DEFAULT_LOCAL_BACKEND_URL;
}

/** Update local backend URL (e.g. set to local PC IP like http://192.168.1.50:5000) */
export function setSensorBackendUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const cleaned = url.trim().replace(/\/+$/, '');
  localStorage.setItem(STORAGE_KEY_BACKEND_URL, cleaned);
}

/** Retrieve configured threshold settings */
export function getSensorThresholds(): SensorThresholds {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_THRESHOLDS, ...parsed };
    }
  } catch {
    // Fallback to default
  }
  return DEFAULT_THRESHOLDS;
}

/** Save threshold settings */
export function saveSensorThresholds(thresholds: SensorThresholds): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(thresholds));
}

export interface StressLevelResult {
  level: StressLevel;
  reasons: string[];
  disclaimer: string;
}

/**
 * Assigns an Easy, Medium, or Hard level using simple threshold rules.
 * Motion is strictly excluded from this category and shown as a separate alert.
 * 
 * IMPORTANT: This represents ambient environmental stress and MUST NOT be
 * treated as a confirmed crop disease diagnosis.
 */
export function computeStressLevel(
  temp: number,
  humidity: number,
  thresholds: SensorThresholds = getSensorThresholds()
): StressLevelResult {
  const reasons: string[] = [];

  // Check temperature bounds
  const isTempExtreme = temp > thresholds.mediumTempMax;
  const isTempElevated = temp > thresholds.easyTempMax && temp <= thresholds.mediumTempMax;

  // Check humidity bounds
  const isHumExtreme = humidity < thresholds.mediumHumMin || humidity > thresholds.mediumHumMax;
  const isHumSuboptimal =
    (humidity >= thresholds.mediumHumMin && humidity < thresholds.easyHumMin) ||
    (humidity > thresholds.easyHumMax && humidity <= thresholds.mediumHumMax);

  let level: StressLevel = 'Easy';

  if (isTempExtreme || isHumExtreme) {
    level = 'Hard';
    if (isTempExtreme) reasons.push(`High Heat Stress (${temp}°C > ${thresholds.mediumTempMax}°C)`);
    if (humidity < thresholds.mediumHumMin) reasons.push(`Extreme Dry Air (${humidity}% < ${thresholds.mediumHumMin}%)`);
    if (humidity > thresholds.mediumHumMax) reasons.push(`Excess Moisture / Saturation (${humidity}% > ${thresholds.mediumHumMax}%)`);
  } else if (isTempElevated || isHumSuboptimal) {
    level = 'Medium';
    if (isTempElevated) reasons.push(`Warm Ambient Temperature (${temp}°C)`);
    if (isHumSuboptimal) reasons.push(`Moderate Moisture Imbalance (${humidity}%)`);
  } else {
    level = 'Easy';
    reasons.push(`Optimal Growing Comfort (${temp}°C, ${humidity}% RH)`);
  }

  return {
    level,
    reasons,
    disclaimer: 'Environmental stress level only — Do not treat these categories as confirmed crop disease diagnoses.',
  };
}

/** Check health status of local Flask service */
export async function checkLocalServiceHealth(customUrl?: string): Promise<{ ok: boolean; message: string }> {
  const baseUrl = customUrl ? customUrl.trim().replace(/\/+$/, '') : getSensorBackendUrl();
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return { ok: false, message: `Service returned HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, message: data.service || 'Connected to local service' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Cannot reach local service. Verify Flask is running on local computer.',
    };
  }
}

/** Fetch latest single reading */
export async function fetchLatestReading(): Promise<SensorReading | null> {
  const baseUrl = getSensorBackendUrl();
  const res = await fetch(`${baseUrl}/api/sensor-readings/latest`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch latest reading: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.reading || null;
}

/** Fetch historical sensor readings */
export async function fetchReadingsHistory(limit = 50): Promise<SensorReading[]> {
  const baseUrl = getSensorBackendUrl();
  const res = await fetch(`${baseUrl}/api/sensor-readings/history?limit=${limit}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch readings history: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.readings || [];
}

/** Trigger simulated test reading on the backend */
export async function triggerSimulatedReading(overrides?: Partial<SensorReading>): Promise<SensorReading> {
  const baseUrl = getSensorBackendUrl();
  const res = await fetch(`${baseUrl}/api/sensor-readings/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides || {}),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    throw new Error(`Simulation failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.data;
}

/** Clear all stored readings on the local backend */
export async function clearReadingsHistory(): Promise<boolean> {
  const baseUrl = getSensorBackendUrl();
  const res = await fetch(`${baseUrl}/api/sensor-readings`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(4000),
  });
  return res.ok;
}
