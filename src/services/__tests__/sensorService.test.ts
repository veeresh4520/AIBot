import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeStressLevel,
  DEFAULT_THRESHOLDS,
  getSensorBackendUrl,
  setSensorBackendUrl,
  getSensorThresholds,
  saveSensorThresholds,
  fetchLatestReading,
  fetchReadingsHistory,
  triggerSimulatedReading,
  checkLocalServiceHealth,
  evaluateCropCondition,
  CROP_PROFILES,
} from '../sensorService';

describe('sensorService - Environmental Stress Level Evaluation', () => {
  it('assigns Easy for comfortable temperature and humidity', () => {
    const res = computeStressLevel(24.0, 55.0, DEFAULT_THRESHOLDS);
    expect(res.level).toBe('Easy');
    expect(res.disclaimer).toContain('Do not treat these categories as confirmed crop disease diagnoses');
  });

  it('assigns Medium for warm temperature within medium thresholds', () => {
    const res = computeStressLevel(31.0, 55.0, DEFAULT_THRESHOLDS);
    expect(res.level).toBe('Medium');
    expect(res.reasons.some((r) => r.includes('Warm Ambient Temperature'))).toBe(true);
  });

  it('assigns Medium for suboptimal humidity within medium thresholds', () => {
    const res = computeStressLevel(24.0, 35.0, DEFAULT_THRESHOLDS);
    expect(res.level).toBe('Medium');
    expect(res.reasons.some((r) => r.includes('Moderate Moisture Imbalance'))).toBe(true);
  });

  it('assigns Hard for extreme temperature above 35°C', () => {
    const res = computeStressLevel(38.5, 60.0, DEFAULT_THRESHOLDS);
    expect(res.level).toBe('Hard');
    expect(res.reasons.some((r) => r.includes('High Heat Stress'))).toBe(true);
  });

  it('assigns Hard for extreme dryness (< 30% humidity)', () => {
    const res = computeStressLevel(25.0, 22.0, DEFAULT_THRESHOLDS);
    expect(res.level).toBe('Hard');
    expect(res.reasons.some((r) => r.includes('Extreme Dry Air'))).toBe(true);
  });

  it('assigns Hard for extreme saturation (> 85% humidity)', () => {
    const res = computeStressLevel(26.0, 92.0, DEFAULT_THRESHOLDS);
    expect(res.level).toBe('Hard');
    expect(res.reasons.some((r) => r.includes('Excess Moisture / Saturation'))).toBe(true);
  });

  it('respects custom user-configured thresholds', () => {
    const customThresholds = {
      easyTempMax: 22,
      mediumTempMax: 28,
      easyHumMin: 50,
      easyHumMax: 60,
      mediumHumMin: 40,
      mediumHumMax: 75,
    };
    // 25°C is Medium with custom thresholds
    const res = computeStressLevel(25.0, 55.0, customThresholds);
    expect(res.level).toBe('Medium');
  });
});

describe('sensorService - Backend URL & Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns default localhost URL when unset', () => {
    expect(getSensorBackendUrl()).toBe('http://localhost:5000');
  });

  it('saves and normalizes custom backend URL', () => {
    setSensorBackendUrl(' http://192.168.1.50:5000/// ');
    expect(getSensorBackendUrl()).toBe('http://192.168.1.50:5000');
  });

  it('saves and retrieves custom thresholds in localStorage', () => {
    saveSensorThresholds({
      ...DEFAULT_THRESHOLDS,
      easyTempMax: 26,
    });
    const retrieved = getSensorThresholds();
    expect(retrieved.easyTempMax).toBe(26);
  });
});

describe('sensorService - API operations', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('fetches latest reading from backend', async () => {
    const mockReading = {
      id: 1,
      device_id: 'FIELD_01',
      temperature: 32.0,
      humidity: 65.0,
      motion: true,
      is_simulated: false,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', reading: mockReading }),
    } as unknown as Response);

    const reading = await fetchLatestReading();
    expect(reading).toEqual(mockReading);
    expect(reading?.is_simulated).toBe(false);
  });

  it('fetches readings history', async () => {
    const mockHistory = [
      {
        id: 2,
        device_id: 'FIELD_01',
        temperature: 30.0,
        humidity: 60.0,
        motion: false,
        is_simulated: false,
        created_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', readings: mockHistory }),
    } as unknown as Response);

    const list = await fetchReadingsHistory(10);
    expect(list).toHaveLength(1);
    expect(list[0].device_id).toBe('FIELD_01');
  });

  it('triggers simulated reading', async () => {
    const mockSim = {
      id: 99,
      device_id: 'SIM_FIELD_01',
      temperature: 28.0,
      humidity: 55.0,
      motion: false,
      is_simulated: true,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success', data: mockSim }),
    } as unknown as Response);

    const created = await triggerSimulatedReading();
    expect(created.is_simulated).toBe(true);
  });

  it('checks service health successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', service: 'PlantDoctor Field Sensor Service' }),
    } as unknown as Response);

    const health = await checkLocalServiceHealth();
    expect(health.ok).toBe(true);
    expect(health.message).toContain('PlantDoctor Field Sensor Service');
  });

  it('returns false when service cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network request failed'));

    const health = await checkLocalServiceHealth('http://invalid-host:9999');
    expect(health.ok).toBe(false);
    expect(health.message).toContain('Network request failed');
  });
});

describe('sensorService - Crop Condition Evaluation', () => {
  it('correctly provides crop profiles for major crops', () => {
    expect(CROP_PROFILES.tomato).toBeDefined();
    expect(CROP_PROFILES.rice).toBeDefined();
    expect(CROP_PROFILES.wheat).toBeDefined();
    expect(CROP_PROFILES.cotton).toBeDefined();
    expect(CROP_PROFILES.chilli).toBeDefined();
    expect(CROP_PROFILES.tomato.scientificName).toBe('Solanum lycopersicum');
  });

  it('evaluates optimal growing conditions for tomato', () => {
    const reading = {
      temperature: 24.0,
      humidity: 55.0,
      soil_moisture: 52.0,
      water_level: 80.0,
    };
    const res = evaluateCropCondition(reading, DEFAULT_THRESHOLDS, 'tomato');
    expect(res.status).toBe('optimal');
    expect(res.healthScore).toBeGreaterThanOrEqual(80);
    expect(res.irrigationNeeded).toBe(false);
    expect(res.diseaseRisk).toBe('low');
  });

  it('detects severe heat stress and generates shade/cooling recommendations', () => {
    const reading = {
      temperature: 38.0,
      humidity: 45.0,
      soil_moisture: 50.0,
      water_level: 60.0,
    };
    const res = evaluateCropCondition(reading, DEFAULT_THRESHOLDS, 'tomato');
    expect(res.status).toBe('critical');
    expect(res.conditionTitle).toContain('Heat Stress');
    expect(res.recommendations.some((r) => r.includes('shade netting'))).toBe(true);
  });

  it('detects drought stress and triggers urgent irrigation advice', () => {
    const reading = {
      temperature: 28.0,
      humidity: 40.0,
      soil_moisture: 20.0,
      water_level: 50.0,
    };
    const res = evaluateCropCondition(reading, DEFAULT_THRESHOLDS, 'tomato');
    expect(res.irrigationNeeded).toBe(true);
    expect(res.recommendations.some((r) => r.includes('Urgent irrigation required'))).toBe(true);
  });

  it('detects root waterlogging when soil moisture is saturated', () => {
    const reading = {
      temperature: 26.0,
      humidity: 60.0,
      soil_moisture: 88.0,
      water_level: 85.0,
    };
    const res = evaluateCropCondition(reading, DEFAULT_THRESHOLDS, 'chilli');
    expect(res.recommendations.some((r) => r.includes('Halt all watering'))).toBe(true);
    expect(res.metrics.find((m) => m.metric === 'soil_moisture')?.status).toBe('critical');
  });

  it('detects high fungal disease risk when humidity is saturated', () => {
    const reading = {
      temperature: 27.0,
      humidity: 92.0,
      soil_moisture: 55.0,
      water_level: 70.0,
    };
    const res = evaluateCropCondition(reading, DEFAULT_THRESHOLDS, 'tomato');
    expect(res.diseaseRisk).toBe('high');
    expect(res.recommendations.some((r) => r.includes('bio-fungicide'))).toBe(true);
  });
});

