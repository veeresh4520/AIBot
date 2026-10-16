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
  soil_moisture?: number;
  water_level?: number;
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

export interface CropProfile {
  id: string;
  name: string;
  hindiName: string;
  teluguName: string;
  scientificName: string;
  icon: string;
  optimalTempMin: number;
  optimalTempMax: number;
  stressTempMax: number;
  optimalHumMin: number;
  optimalHumMax: number;
  optimalSoilMin: number;
  optimalSoilMax: number;
  minWaterLevel: number;
  description: string;
}

export const CROP_PROFILES: Record<string, CropProfile> = {
  general: {
    id: 'general',
    name: 'General Field Crop',
    hindiName: 'सामान्य फसल',
    teluguName: 'సాధారణ పంట',
    scientificName: 'Plantae',
    icon: '🌾',
    optimalTempMin: 18,
    optimalTempMax: 28,
    stressTempMax: 35,
    optimalHumMin: 40,
    optimalHumMax: 70,
    optimalSoilMin: 40,
    optimalSoilMax: 70,
    minWaterLevel: 25,
    description: 'Standard agronomic baseline suitable for mixed horticultural and cereal crops.',
  },
  tomato: {
    id: 'tomato',
    name: 'Tomato',
    hindiName: 'टमाटर',
    teluguName: 'టమాటా',
    scientificName: 'Solanum lycopersicum',
    icon: '🍅',
    optimalTempMin: 20,
    optimalTempMax: 28,
    stressTempMax: 34,
    optimalHumMin: 45,
    optimalHumMax: 70,
    optimalSoilMin: 45,
    optimalSoilMax: 68,
    minWaterLevel: 30,
    description: 'Day-neutral solanaceous crop sensitive to flower drop above 32°C and fungal blight in high humidity.',
  },
  rice: {
    id: 'rice',
    name: 'Rice / Paddy',
    hindiName: 'चावल / धान',
    teluguName: 'వరి / వరిధాన్యం',
    scientificName: 'Oryza sativa',
    icon: '🌾',
    optimalTempMin: 22,
    optimalTempMax: 33,
    stressTempMax: 38,
    optimalHumMin: 60,
    optimalHumMax: 85,
    optimalSoilMin: 60,
    optimalSoilMax: 90,
    minWaterLevel: 40,
    description: 'Semi-aquatic cereal demanding high soil moisture and standing water during tillering/panicle stages.',
  },
  wheat: {
    id: 'wheat',
    name: 'Wheat',
    hindiName: 'गेहूं',
    teluguName: 'గోధుమ',
    scientificName: 'Triticum aestivum',
    icon: '🌱',
    optimalTempMin: 15,
    optimalTempMax: 24,
    stressTempMax: 30,
    optimalHumMin: 40,
    optimalHumMax: 65,
    optimalSoilMin: 35,
    optimalSoilMax: 65,
    minWaterLevel: 20,
    description: 'Cool-season cereal vulnerable to terminal heat stress during anthesis and grain filling.',
  },
  cotton: {
    id: 'cotton',
    name: 'Cotton',
    hindiName: 'कपास',
    teluguName: 'పత్తి',
    scientificName: 'Gossypium hirsutum',
    icon: '☁️',
    optimalTempMin: 24,
    optimalTempMax: 34,
    stressTempMax: 38,
    optimalHumMin: 40,
    optimalHumMax: 65,
    optimalSoilMin: 35,
    optimalSoilMax: 65,
    minWaterLevel: 25,
    description: 'Deep-rooted fiber crop with moderate heat tolerance; highly vulnerable to waterlogging.',
  },
  chilli: {
    id: 'chilli',
    name: 'Chilli / Pepper',
    hindiName: 'हरी मिर्च',
    teluguName: 'పచ్చిమిర్చి',
    scientificName: 'Capsicum annuum',
    icon: '🌶️',
    optimalTempMin: 20,
    optimalTempMax: 30,
    stressTempMax: 35,
    optimalHumMin: 45,
    optimalHumMax: 65,
    optimalSoilMin: 40,
    optimalSoilMax: 65,
    minWaterLevel: 25,
    description: 'Warm-season spice crop prone to flower abortion under heat and damping-off if waterlogged.',
  },
  maize: {
    id: 'maize',
    name: 'Maize / Corn',
    hindiName: 'मक्का',
    teluguName: 'మొక్కజొన్న',
    scientificName: 'Zea mays',
    icon: '🌽',
    optimalTempMin: 20,
    optimalTempMax: 32,
    stressTempMax: 36,
    optimalHumMin: 45,
    optimalHumMax: 75,
    optimalSoilMin: 45,
    optimalSoilMax: 70,
    minWaterLevel: 25,
    description: 'High-biomass C4 crop requiring consistent moisture during tasseling and silking.',
  },
};

export type CropConditionStatus = 'optimal' | 'warning' | 'critical';

export interface CropConditionMetricAssessment {
  metric: 'temperature' | 'humidity' | 'soil_moisture' | 'water_level';
  label: string;
  currentValue: number;
  unit: string;
  status: 'optimal' | 'low' | 'high' | 'critical';
  message: string;
}

export interface CropConditionResult {
  crop: CropProfile;
  status: CropConditionStatus;
  conditionTitle: string;
  healthScore: number; // 0 to 100
  summary: string;
  metrics: CropConditionMetricAssessment[];
  recommendations: string[];
  irrigationNeeded: boolean;
  diseaseRisk: 'low' | 'moderate' | 'high';
}

/**
 * Evaluates real-time crop condition and agronomic health
 * based on Temperature, Humidity, Soil Moisture, Water Reservoir, and configurable thresholds.
 */
export function evaluateCropCondition(
  reading: { temperature: number; humidity: number; soil_moisture?: number; water_level?: number },
  thresholds: SensorThresholds = getSensorThresholds(),
  cropId: string = 'tomato'
): CropConditionResult {
  const crop = CROP_PROFILES[cropId] || CROP_PROFILES['general'];
  const temp = reading.temperature;
  const hum = reading.humidity;
  const soil = reading.soil_moisture ?? 50.0;
  const water = reading.water_level ?? 75.0;

  // Use user-configured thresholds if customized beyond baseline
  const effectiveOptimalTempMax = thresholds.easyTempMax !== DEFAULT_THRESHOLDS.easyTempMax
    ? thresholds.easyTempMax
    : crop.optimalTempMax;
  const effectiveStressTempMax = thresholds.mediumTempMax !== DEFAULT_THRESHOLDS.mediumTempMax
    ? thresholds.mediumTempMax
    : crop.stressTempMax;
  const effectiveHumMin = thresholds.easyHumMin !== DEFAULT_THRESHOLDS.easyHumMin
    ? thresholds.easyHumMin
    : crop.optimalHumMin;
  const effectiveHumMax = thresholds.easyHumMax !== DEFAULT_THRESHOLDS.easyHumMax
    ? thresholds.easyHumMax
    : crop.optimalHumMax;

  let healthScore = 100;
  const metrics: CropConditionMetricAssessment[] = [];
  const recommendations: string[] = [];
  let irrigationNeeded = false;
  let diseaseRisk: 'low' | 'moderate' | 'high' = 'low';

  // 1. Temperature Evaluation
  if (temp > effectiveStressTempMax) {
    healthScore -= 35;
    metrics.push({
      metric: 'temperature',
      label: 'Temperature',
      currentValue: temp,
      unit: '°C',
      status: 'critical',
      message: `Extreme heat stress (${temp}°C > ${effectiveStressTempMax}°C threshold). Risk of flower abortion and cellular stress.`,
    });
    recommendations.push(
      `High heat alert for ${crop.name}: Provide 50% shade netting or run overhead micro-sprinklers during peak afternoon hours.`
    );
  } else if (temp > effectiveOptimalTempMax) {
    healthScore -= 15;
    metrics.push({
      metric: 'temperature',
      label: 'Temperature',
      currentValue: temp,
      unit: '°C',
      status: 'high',
      message: `Warm temperature (${temp}°C > ${effectiveOptimalTempMax}°C threshold). Increased vegetative transpiration.`,
    });
    recommendations.push(
      `Ensure adequate root hydration to assist ${crop.name} with evaporative cooling.`
    );
  } else if (temp < crop.optimalTempMin) {
    healthScore -= 20;
    metrics.push({
      metric: 'temperature',
      label: 'Temperature',
      currentValue: temp,
      unit: '°C',
      status: 'low',
      message: `Chilling stress (${temp}°C < ${crop.optimalTempMin}°C optimal). Slows photosynthesis and nutrient transport.`,
    });
    recommendations.push(
      `Cold protection: Shield ${crop.name} beds or close greenhouse side-curtains overnight.`
    );
  } else {
    metrics.push({
      metric: 'temperature',
      label: 'Temperature',
      currentValue: temp,
      unit: '°C',
      status: 'optimal',
      message: `Ideal vegetative temperature (${temp}°C, comfort band: ${crop.optimalTempMin}°C–${effectiveOptimalTempMax}°C).`,
    });
  }

  // 2. Soil Moisture Evaluation
  if (soil < crop.optimalSoilMin - 10 || soil < 28) {
    healthScore -= 35;
    irrigationNeeded = true;
    metrics.push({
      metric: 'soil_moisture',
      label: 'Soil Moisture',
      currentValue: soil,
      unit: '%',
      status: 'critical',
      message: `Severe root drought (${soil}% < ${crop.optimalSoilMin}% threshold). Plant reaching wilting point.`,
    });
    recommendations.push(
      `Urgent irrigation required: Activate drip irrigation immediately (35–45 minutes) for ${crop.name}.`
    );
  } else if (soil < crop.optimalSoilMin) {
    healthScore -= 15;
    irrigationNeeded = true;
    metrics.push({
      metric: 'soil_moisture',
      label: 'Soil Moisture',
      currentValue: soil,
      unit: '%',
      status: 'low',
      message: `Low soil moisture (${soil}% < ${crop.optimalSoilMin}% threshold). Soil is drying out.`,
    });
    recommendations.push(
      `Schedule next irrigation cycle within 2–4 hours to maintain vigorous ${crop.name} growth.`
    );
  } else if (soil > crop.optimalSoilMax + 10 || soil > 82) {
    healthScore -= 30;
    metrics.push({
      metric: 'soil_moisture',
      label: 'Soil Moisture',
      currentValue: soil,
      unit: '%',
      status: 'critical',
      message: `Waterlogged root zone (${soil}% > ${crop.optimalSoilMax}% threshold). Severe root asphyxiation risk.`,
    });
    recommendations.push(
      `Halt all watering: Clear drainage furrows immediately to allow soil aeration and prevent root rot in ${crop.name}.`
    );
  } else if (soil > crop.optimalSoilMax) {
    healthScore -= 10;
    metrics.push({
      metric: 'soil_moisture',
      label: 'Soil Moisture',
      currentValue: soil,
      unit: '%',
      status: 'high',
      message: `Moisture slightly above optimum (${soil}% > ${crop.optimalSoilMax}% threshold).`,
    });
    recommendations.push(
      `Pause upcoming irrigation cycles until soil moisture drops back below ${crop.optimalSoilMax}%.`
    );
  } else {
    metrics.push({
      metric: 'soil_moisture',
      label: 'Soil Moisture',
      currentValue: soil,
      unit: '%',
      status: 'optimal',
      message: `Optimal root zone hydration (${soil}%, target: ${crop.optimalSoilMin}%–${crop.optimalSoilMax}%).`,
    });
  }

  // 3. Relative Humidity & Disease Risk Evaluation
  if (hum > effectiveHumMax + 10 || hum > 85) {
    healthScore -= 20;
    diseaseRisk = 'high';
    metrics.push({
      metric: 'humidity',
      label: 'Relative Humidity',
      currentValue: hum,
      unit: '%',
      status: 'critical',
      message: `Severe humidity saturation (${hum}%). Prolonged leaf wetness triggers fungal blight/powdery mildew.`,
    });
    recommendations.push(
      `High disease susceptibility: Inspect ${crop.name} foliage for leaf spots or downy mildew; apply preventive bio-fungicide (Trichoderma / Bacillus subtilis).`
    );
  } else if (hum > effectiveHumMax) {
    healthScore -= 10;
    diseaseRisk = 'moderate';
    metrics.push({
      metric: 'humidity',
      label: 'Relative Humidity',
      currentValue: hum,
      unit: '%',
      status: 'high',
      message: `Humid microclimate (${hum}% > ${effectiveHumMax}% threshold). Elevated spore germination pressure.`,
    });
    recommendations.push(
      `Maintain airflow between rows and avoid overhead sprinkler watering to keep leaves dry.`
    );
  } else if (hum < effectiveHumMin - 10 || hum < 28) {
    healthScore -= 15;
    metrics.push({
      metric: 'humidity',
      label: 'Relative Humidity',
      currentValue: hum,
      unit: '%',
      status: 'low',
      message: `Extremely dry air (${hum}% < ${effectiveHumMin}% threshold). High vapor pressure deficit causes foliar desiccation.`,
    });
    recommendations.push(
      `Consider light inter-row misting or organic mulching to buffer moisture loss around ${crop.name}.`
    );
  } else {
    metrics.push({
      metric: 'humidity',
      label: 'Relative Humidity',
      currentValue: hum,
      unit: '%',
      status: 'optimal',
      message: `Balanced humidity (${hum}%, target: ${effectiveHumMin}%–${effectiveHumMax}%).`,
    });
  }

  // 4. Water Level Evaluation
  if (water < crop.minWaterLevel) {
    healthScore -= 10;
    metrics.push({
      metric: 'water_level',
      label: 'Water Reservoir',
      currentValue: water,
      unit: '%',
      status: 'critical',
      message: `Low water reserve (${water}% < ${crop.minWaterLevel}% reserve minimum). Dry-run risk for pumps.`,
    });
    recommendations.push(
      `Refill irrigation reservoir/tank before starting next scheduled watering cycle.`
    );
  } else {
    metrics.push({
      metric: 'water_level',
      label: 'Water Reservoir',
      currentValue: water,
      unit: '%',
      status: 'optimal',
      message: `Adequate irrigation reserve (${water}%). System ready for automated watering.`,
    });
  }

  healthScore = Math.max(10, Math.min(100, healthScore));

  const hasCriticalMetric = metrics.some((m) => m.status === 'critical');
  const hasWarningMetric = metrics.some((m) => m.status === 'high' || m.status === 'low');

  let status: CropConditionStatus = 'optimal';
  let conditionTitle = 'Optimal Growing Conditions';
  if (healthScore < 60 || hasCriticalMetric) {
    status = 'critical';
    if (temp > effectiveStressTempMax && soil < crop.optimalSoilMin) {
      conditionTitle = 'Severe Heat & Drought Shock';
    } else if (temp > effectiveStressTempMax) {
      conditionTitle = 'Critical Heat Stress Alert';
    } else if (soil < crop.optimalSoilMin) {
      conditionTitle = 'Severe Root Zone Drought';
    } else if (soil > crop.optimalSoilMax) {
      conditionTitle = 'Root Asphyxiation / Waterlogging';
    } else {
      conditionTitle = 'Critical Microclimate Stress';
    }
  } else if (healthScore < 85 || hasWarningMetric) {
    status = 'warning';
    if (temp > effectiveOptimalTempMax) {
      conditionTitle = 'Moderate Heat Elevation';
    } else if (soil < crop.optimalSoilMin) {
      conditionTitle = 'Mild Moisture Deficit';
    } else if (diseaseRisk === 'moderate' || hum > effectiveHumMax) {
      conditionTitle = 'Elevated Humidity & Fungal Watch';
    } else {
      conditionTitle = 'Suboptimal Environmental Conditions';
    }
  } else {
    conditionTitle = 'Optimal Plant Vigour & Comfort';
    if (recommendations.length === 0) {
      recommendations.push(
        `Conditions are optimal for ${crop.name}. Maintain current fertigation and pest scouting schedule.`
      );
    }
  }

  const summary = `${crop.name}: ${conditionTitle} (Health Score: ${healthScore}%). Temperature is ${temp.toFixed(1)}°C, Soil Moisture is ${soil.toFixed(1)}%, Humidity is ${hum.toFixed(1)}%.`;

  return {
    crop,
    status,
    conditionTitle,
    healthScore,
    summary,
    metrics,
    recommendations,
    irrigationNeeded,
    diseaseRisk,
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

/** Trigger simulated test reading on the backend, with fallback for HTTPS/disconnected testing */
export async function triggerSimulatedReading(overrides?: Partial<SensorReading>): Promise<SensorReading> {
  const baseUrl = getSensorBackendUrl();
  try {
    const res = await fetch(`${baseUrl}/api/sensor-readings/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides || {}),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.data) {
        return data.data;
      }
    }
  } catch {
    // Fallback below
  }

  // In-memory fallback simulated test reading for hosted HTTPS demo or when Flask is offline
  const simTemp = overrides?.temperature ?? Number((22.0 + Math.random() * 14.0).toFixed(1));
  const simHum = overrides?.humidity ?? Number((40.0 + Math.random() * 45.0).toFixed(1));
  const simSoil = overrides?.soil_moisture ?? Number((35.0 + Math.random() * 40.0).toFixed(1));
  const simWater = overrides?.water_level ?? Number((45.0 + Math.random() * 45.0).toFixed(1));
  const simMotion = overrides?.motion ?? Math.random() < 0.35;
  const deviceId = overrides?.device_id ?? 'SIM_FIELD_01';

  return {
    id: Date.now(),
    device_id: deviceId,
    temperature: simTemp,
    humidity: simHum,
    soil_moisture: simSoil,
    water_level: simWater,
    motion: Boolean(simMotion),
    is_simulated: true,
    created_at: new Date().toISOString(),
  };
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
