import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('renders crop condition assessment card with actionable agronomic guidance', async () => {
    const mockCropReading: SensorReading = {
      id: 3,
      device_id: 'FIELD_02',
      temperature: 26.0,
      humidity: 58.0,
      soil_moisture: 52.0,
      water_level: 78.0,
      motion: false,
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
          json: async () => ({ status: 'ok', reading: mockCropReading }),
        } as unknown as Response;
      }
      if (urlStr.includes('/api/sensor-readings/history')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', readings: [mockCropReading] }),
        } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    });

    render(<FieldSensorsPage />);

    // Wait for crop condition card to appear
    await waitFor(() => {
      expect(screen.getByTestId('crop-condition-card')).toBeInTheDocument();
      expect(screen.getByText(/Tomato Condition Assessment/i)).toBeInTheDocument();
      expect(screen.getByText(/Agronomic Guidance for Tomato/i)).toBeInTheDocument();
    });

    // Check crop selector dropdown
    const select = screen.getByLabelText(/Selected Crop/i) as HTMLSelectElement;
    expect(select.value).toBe('tomato');

    // Change crop to Rice
    fireEvent.change(select, { target: { value: 'rice' } });
    expect(screen.getByText(/Rice \/ Paddy Condition Assessment/i)).toBeInTheDocument();
  });

  it('provides continuous live stream controls', async () => {
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

    // Verify empty state offers "Start Continuous Live Telemetry Stream"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Start Continuous Live Telemetry Stream/i })
      ).toBeInTheDocument();
    });

    // Click start continuous live stream
    fireEvent.click(screen.getByRole('button', { name: /Start Continuous Live Telemetry Stream/i }));

    // Should now show live reading and crop condition card
    await waitFor(() => {
      expect(screen.getByTestId('crop-condition-card')).toBeInTheDocument();
    });
  });
});
