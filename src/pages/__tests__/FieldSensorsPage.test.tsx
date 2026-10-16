import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FieldSensorsPage } from '../FieldSensorsPage';
import type { SensorReading } from '../../services/sensorService';

describe('FieldSensorsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading and empty state when no readings exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', service: 'PlantDoctor Field Sensor Service' }),
        } as unknown as Response;
      }
      if (urlStr.includes('/api/sensor-readings/latest')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', reading: null }),
        } as unknown as Response;
      }
      if (urlStr.includes('/api/sensor-readings/history')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', readings: [] }),
        } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    });

    render(<FieldSensorsPage />);

    expect(screen.getByRole('heading', { name: /Field Sensor Monitoring/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No Sensor Readings Received Yet/i)).toBeInTheDocument();
    });
  });

  it('renders live readings, stress level, and disclaimer for real sensor data', async () => {
    const mockRealReading: SensorReading = {
      id: 1,
      device_id: 'FIELD_01',
      temperature: 32.0,
      humidity: 65.0,
      motion: true,
      is_simulated: false,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', service: 'PlantDoctor Field Sensor Service' }),
        } as unknown as Response;
      }
      if (urlStr.includes('/api/sensor-readings/latest')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', reading: mockRealReading }),
        } as unknown as Response;
      }
      if (urlStr.includes('/api/sensor-readings/history')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', readings: [mockRealReading] }),
        } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    });

    render(<FieldSensorsPage />);

    // Check device ID & temperature & humidity
    await waitFor(() => {
      expect(screen.getAllByText('FIELD_01').length).toBeGreaterThan(0);
      expect(screen.getByText('32.0')).toBeInTheDocument();
      expect(screen.getByText('65.0')).toBeInTheDocument();
    });

    // Check Real LoRa badge
    expect(screen.getByTestId('badge-real-data')).toBeInTheDocument();
    expect(screen.getByText(/REAL SENSOR DATA \(LoRa Telemetry\)/i)).toBeInTheDocument();

    // Check motion detection alert is active
    expect(screen.getByText('MOTION ACTIVE')).toBeInTheDocument();

    // Check Environmental Stress Level
    expect(screen.getByTestId('stress-level-badge')).toBeInTheDocument();

    // Check mandatory disclaimer
    expect(
      screen.getByText(/Do not treat these categories as confirmed crop disease diagnoses/i)
    ).toBeInTheDocument();
  });

  it('renders simulated badge when reading is simulated', async () => {
    const mockSimReading: SensorReading = {
      id: 2,
      device_id: 'SIM_FIELD_01',
      temperature: 24.5,
      humidity: 55.0,
      motion: false,
      is_simulated: true,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', service: 'PlantDoctor Field Sensor Service' }),
        } as unknown as Response;
      }
      if (urlStr.includes('/api/sensor-readings/latest')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', reading: mockSimReading }),
        } as unknown as Response;
      }
      if (urlStr.includes('/api/sensor-readings/history')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', readings: [mockSimReading] }),
        } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    });

    render(<FieldSensorsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-simulated-data')).toBeInTheDocument();
      expect(screen.getByText(/SIMULATED TEST DATA/i)).toBeInTheDocument();
    });

    // Motion should be CLEAR
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
  });
});
