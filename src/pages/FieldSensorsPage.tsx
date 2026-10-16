import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Radio,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  HelpCircle,
  Trash2,
  Sliders,
  Smartphone,
  Waves,
  Sprout,
  Play,
  Pause,
  Cpu,
  Terminal,
  X,
} from 'lucide-react';
import type { SensorReading, SensorThresholds } from '../services/sensorService';
import {
  getSensorBackendUrl,
  setSensorBackendUrl,
  getSensorThresholds,
  saveSensorThresholds,
  computeStressLevel,
  evaluateCropCondition,
  CROP_PROFILES,
  fetchLatestReading,
  fetchReadingsHistory,
  triggerSimulatedReading,
  checkLocalServiceHealth,
  clearReadingsHistory,
} from '../services/sensorService';

/**
 * Robust telemetry parser supporting:
 * 1. Clean JSON: {"device_id":"FIELD_01","temperature":26.5,...}
 * 2. Embedded JSON within noise / boot messages: extracts { ... }
 * 3. Key-Value pairs: "Temp: 26.5 Hum: 58.0 Soil: 52 Water: 75 Motion: 0"
 * 4. CSV lines: "26.5,58.0,52.0,75.0,0"
 */
function parseIncomingSerialLine(line: string): Partial<SensorReading> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1. JSON or embedded JSON extraction
  const startIdx = trimmed.indexOf('{');
  const endIdx = trimmed.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    try {
      const jsonStr = trimmed.substring(startIdx, endIdx + 1);
      const data = JSON.parse(jsonStr);

      // Verify that this packet contains actual sensor metrics rather than just a boot/status message
      const hasSensorField =
        data.temperature !== undefined ||
        data.temp !== undefined ||
        data.humidity !== undefined ||
        data.hum !== undefined ||
        data.soil_moisture !== undefined ||
        data.soil !== undefined ||
        data.water_level !== undefined ||
        data.water !== undefined;

      if (!hasSensorField) {
        return null;
      }

      return {
        device_id: data.device_id || 'USB_ARDUINO_01',
        temperature: Number(data.temperature ?? data.temp ?? 25.0),
        humidity: Number(data.humidity ?? data.hum ?? 55.0),
        soil_moisture: Number(data.soil_moisture ?? data.soil ?? 50.0),
        water_level: Number(data.water_level ?? data.water ?? 75.0),
        motion: Boolean(data.motion),
      };
    } catch {
      // Fall through to text formats
    }
  }

  // 2. Key-Value format (e.g. "Temp: 26.5 Hum: 58.0 Soil: 52 Water: 75 Motion: 0")
  const tempMatch = trimmed.match(/(?:temp(?:erature)?|t)\s*[:=]\s*([\d.]+)/i);
  const humMatch = trimmed.match(/(?:hum(?:idity)?|h)\s*[:=]\s*([\d.]+)/i);
  const soilMatch = trimmed.match(/(?:soil(?:_moisture)?|s)\s*[:=]\s*([\d.]+)/i);
  const waterMatch = trimmed.match(/(?:water(?:_level)?|w)\s*[:=]\s*([\d.]+)/i);
  const motionMatch = trimmed.match(/(?:motion|pir|m)\s*[:=]\s*([01]|true|false)/i);

  if (tempMatch || humMatch || soilMatch) {
    return {
      device_id: 'USB_ARDUINO_01',
      temperature: tempMatch ? parseFloat(tempMatch[1]) : 25.0,
      humidity: humMatch ? parseFloat(humMatch[1]) : 55.0,
      soil_moisture: soilMatch ? parseFloat(soilMatch[1]) : 50.0,
      water_level: waterMatch ? parseFloat(waterMatch[1]) : 75.0,
      motion: motionMatch ? (motionMatch[1] === '1' || motionMatch[1].toLowerCase() === 'true') : false,
    };
  }

  // 3. CSV format (e.g. "26.5,58.0,52.0,75.0,0")
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length >= 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
    return {
      device_id: 'USB_ARDUINO_01',
      temperature: parseFloat(parts[0]),
      humidity: parseFloat(parts[1]),
      soil_moisture: parts[2] && !isNaN(Number(parts[2])) ? parseFloat(parts[2]) : 50.0,
      water_level: parts[3] && !isNaN(Number(parts[3])) ? parseFloat(parts[3]) : 75.0,
      motion: parts[4] ? (parts[4] === '1' || parts[4].toLowerCase() === 'true') : false,
    };
  }

  return null;
}

export function FieldSensorsPage() {
  const isHosted = typeof window !== 'undefined' && (
    window.location.hostname.includes('github.io') ||
    (window.location.protocol === 'https:' && !window.location.hostname.includes('localhost'))
  );

  const [backendUrl, setBackendUrlState] = useState<string>(getSensorBackendUrl());
  const [urlInput, setUrlInput] = useState<string>(backendUrl);
  const [thresholds, setThresholds] = useState<SensorThresholds>(getSensorThresholds());
  const [selectedCrop, setSelectedCrop] = useState<string>('tomato');
  
  const [latestReading, setLatestReading] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionMessage, setConnectionMessage] = useState<string>('Connecting to local service…');
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isLiveStreamRunning, setIsLiveStreamRunning] = useState<boolean>(() => isHosted);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPhoneGuide, setShowPhoneGuide] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isSerialConnected, setIsSerialConnected] = useState<boolean>(false);
  const [usbBaudRate, setUsbBaudRate] = useState<number>(115200);
  const [usbPacketCount, setUsbPacketCount] = useState<number>(0);
  const [usbLog, setUsbLog] = useState<string[]>([]);
  const [showUsbLog, setShowUsbLog] = useState<boolean>(false);

  const pollIntervalRef = useRef<number | null>(null);
  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const isSerialConnectedRef = useRef<boolean>(false);

  // Load telemetry from local Flask service
  const loadTelemetry = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const health = await checkLocalServiceHealth(backendUrl);
      setIsConnected(health.ok);
      setConnectionMessage(
        health.ok
          ? health.message
          : isHosted
          ? 'Hosted Mode · Continuous Live Telemetry Streaming'
          : health.message
      );

      if (health.ok) {
        const [latest, hist] = await Promise.all([
          fetchLatestReading().catch(() => null),
          fetchReadingsHistory(30).catch(() => []),
        ]);
        if (latest) {
          setLatestReading(latest);
        }
        if (hist.length > 0) {
          setHistory(hist);
        }
      }
    } catch (err) {
      setIsConnected(false);
      setConnectionMessage(
        isHosted
          ? 'Hosted Mode · Continuous Live Telemetry Streaming'
          : err instanceof Error
          ? err.message
          : 'Cannot reach local service'
      );
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, [backendUrl, isHosted]);

  // Initial load and continuous polling/streaming cycle
  useEffect(() => {
    let cancelled = false;

    // When hosted on GitHub Pages, seed with initial reading if completely empty
    if (isHosted && !latestReading) {
      void triggerSimulatedReading().then((initial) => {
        if (!cancelled) {
          setLatestReading((prev) => prev ?? initial);
          setHistory((prev) => (prev.length === 0 ? [initial] : prev));
        }
      });
    }

    void loadTelemetry(true);

    if (autoRefresh) {
      pollIntervalRef.current = window.setInterval(async () => {
        // Real USB Hardware takes precedence: NEVER overwrite active hardware stream with simulated data!
        if (isSerialConnectedRef.current) {
          return;
        }

        if (isConnected) {
          await loadTelemetry(false);
        } else if (isLiveStreamRunning) {
          // Continuous live stream mode for hosted demo
          setLatestReading((prev) => {
            // Never overwrite real hardware reading with simulated data
            if (prev && !prev.is_simulated) {
              return prev;
            }

            const baseTemp = prev ? prev.temperature : 26.5;
            const baseHum = prev ? prev.humidity : 58.0;
            const baseSoil = prev?.soil_moisture ?? 52.0;
            const baseWater = prev?.water_level ?? 74.0;

            // Small realistic organic drift for continuous live display
            const newTemp = Number(Math.max(16, Math.min(42, baseTemp + (Math.random() - 0.49) * 0.4)).toFixed(1));
            const newHum = Number(Math.max(25, Math.min(95, baseHum + (Math.random() - 0.49) * 0.8)).toFixed(1));
            const newSoil = Number(Math.max(15, Math.min(95, baseSoil + (Math.random() - 0.5) * 0.5)).toFixed(1));
            const newWater = Number(Math.max(10, Math.min(100, baseWater + (Math.random() - 0.52) * 0.2)).toFixed(1));
            const newMotion = Math.random() < 0.18;

            const nextReading: SensorReading = {
              id: Date.now(),
              device_id: prev?.device_id || 'LIVE_STREAM_01',
              temperature: newTemp,
              humidity: newHum,
              soil_moisture: newSoil,
              water_level: newWater,
              motion: newMotion,
              is_simulated: true,
              created_at: new Date().toISOString(),
            };

            setHistory((h) => [nextReading, ...h.slice(0, 49)]);
            return nextReading;
          });
        } else {
          await loadTelemetry(false);
        }
      }, 3500);
    }

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, [loadTelemetry, autoRefresh, isConnected, isLiveStreamRunning, isHosted]);

  // Handle URL change
  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = urlInput.trim();
    if (!clean) return;
    setSensorBackendUrl(clean);
    setBackendUrlState(clean);
    setActionNotice(`Backend URL updated to ${clean}`);
    setTimeout(() => setActionNotice(null), 3000);
    void loadTelemetry(true);
  };

  // Handle threshold updates
  const handleThresholdChange = (key: keyof SensorThresholds, val: number) => {
    const updated = { ...thresholds, [key]: val };
    setThresholds(updated);
    saveSensorThresholds(updated);
  };

  // Toggle or start continuous live stream
  const handleToggleLiveStream = async () => {
    const nextState = !isLiveStreamRunning;
    setIsLiveStreamRunning(nextState);
    if (nextState && !latestReading) {
      const reading = await triggerSimulatedReading();
      setLatestReading(reading);
      setHistory((prev) => [reading, ...prev]);
    }
    setActionNotice(nextState ? 'Continuous live telemetry stream running' : 'Live stream paused');
    setTimeout(() => setActionNotice(null), 3000);
  };

  // Cleanly disconnect USB Serial
  const handleDisconnectUsbSerial = async () => {
    isSerialConnectedRef.current = false;
    setIsSerialConnected(false);
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel().catch(() => {});
        serialReaderRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close().catch(() => {});
        serialPortRef.current = null;
      }
    } catch {
      // Ignore cleanup error
    }
    setActionNotice('USB Hardware sensor disconnected');
    setTimeout(() => setActionNotice(null), 3000);
  };

  // Connect USB Arduino directly in browser via Web Serial API
  const handleConnectUsbSerial = async () => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      alert(
        'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Chrome on Android with a USB OTG cable to connect directly to the microcontroller.'
      );
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: usbBaudRate });
      serialPortRef.current = port;
      isSerialConnectedRef.current = true;
      setIsSerialConnected(true);
      setIsLiveStreamRunning(false); // Stop simulation immediately
      setUsbPacketCount(0);
      setActionNotice(`Connected directly to USB Arduino hardware on ${usbBaudRate} baud!`);
      setTimeout(() => setActionNotice(null), 4000);

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      serialReaderRef.current = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Log incoming raw line for user inspection
            setUsbLog((prev) => [
              `[${new Date().toLocaleTimeString()}] ${trimmed.length > 120 ? trimmed.substring(0, 120) + '…' : trimmed}`,
              ...prev.slice(0, 49),
            ]);

            const parsed = parseIncomingSerialLine(trimmed);
            if (parsed) {
              const reading: SensorReading = {
                id: Date.now(),
                device_id: parsed.device_id || 'USB_ARDUINO_01',
                temperature: Number(parsed.temperature ?? 25.0),
                humidity: Number(parsed.humidity ?? 55.0),
                soil_moisture: Number(parsed.soil_moisture ?? 50.0),
                water_level: Number(parsed.water_level ?? 75.0),
                motion: Boolean(parsed.motion),
                is_simulated: false, // REAL HARDWARE TELEMETRY
                created_at: new Date().toISOString(),
              };

              // Immediately set real reading and pause any simulation
              setLatestReading(reading);
              setHistory((prev) => [reading, ...prev.slice(0, 49)]);
              setUsbPacketCount((count) => count + 1);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotFoundError') {
        const msg = err.message || '';
        if (msg.includes('open') || msg.includes('Failed to open')) {
          alert(
            'Failed to open serial port!\n\n' +
            'Common Causes & Fixes:\n' +
            '1. Selected a Bluetooth port: In the browser popup, select the USB COM port (e.g. "USB-SERIAL CH340" or "Arduino Uno"), NOT "Standard Serial over Bluetooth link".\n\n' +
            '2. Arduino IDE Serial Monitor is open: CLOSE the Serial Monitor tab inside the Arduino IDE (Windows gives exclusive access to one program at a time).\n\n' +
            '3. Baud Rate Mismatch: Make sure your Arduino sketch baud rate matches the selected dropdown rate (' + usbBaudRate + ').\n\n' +
            '4. USB Cable: Use a USB DATA cable (many phone charging cables are charge-only without data lines).\n\n' +
            '5. Driver: If using a clone Arduino Uno/Nano, install the CH340 USB driver (CH341SER).'
          );
        } else {
          alert(`Serial connection failed: ${err.message}`);
        }
      }
      isSerialConnectedRef.current = false;
      setIsSerialConnected(false);
    }
  };

  // Generate simulated reading
  const handleSimulate = async () => {
    setIsSimulating(true);
    try {
      const newReading = await triggerSimulatedReading();
      setLatestReading(newReading);
      setHistory((prev) => [newReading, ...prev.filter((r) => r.id !== newReading.id)]);
      setActionNotice('Simulated sensor telemetry injected successfully');
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      alert(`Simulation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // Clear history
  const handleClearHistory = async () => {
    if (!confirm('Clear all local sensor readings from SQLite?')) return;
    try {
      await clearReadingsHistory();
      setLatestReading(null);
      setHistory([]);
      setActionNotice('Sensor history cleared from local database');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err) {
      alert(`Clear failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Stress calculation for latest reading
  const stress = latestReading
    ? computeStressLevel(latestReading.temperature, latestReading.humidity, thresholds)
    : null;

  // Real-time Crop Condition evaluation based on Temperature, Humidity, Soil Moisture, and Thresholds
  const cropCondition = latestReading
    ? evaluateCropCondition(latestReading, thresholds, selectedCrop)
    : null;

  // Format relative timestamp
  const formatTimestamp = (iso: string) => {
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
        ' (' + date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Activity size={24} aria-hidden="true" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-foreground">
              Field Sensor Monitoring
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time on-field environmental telemetry received via LoRa transmitter and local Python Flask service.
          </p>
        </div>

        {/* Live Service Pill */}
        <div className="flex items-center gap-3">
          <div
            data-testid="local-service-status"
            title={connectionMessage}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
              isConnected
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
            }`}
          >
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span>Local Service Active</span>
              </>
            ) : (
              <>
                <WifiOff size={13} />
                <span>Local Service Offline</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadTelemetry(false)}
            aria-label="Refresh telemetry"
            title="Refresh now"
            className="p-2 rounded-xl border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="bg-primary/10 border border-primary/20 text-primary rounded-xl px-4 py-2 text-xs font-medium flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={15} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Quick Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border">
          {/* Continuous Live Stream Toggle Button */}
          <button
            type="button"
            onClick={handleToggleLiveStream}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer border shadow-xs ${
              isLiveStreamRunning
                ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                : 'bg-muted text-foreground border-border hover:bg-muted/80'
            }`}
          >
            {isLiveStreamRunning ? (
              <>
                <Pause size={14} />
                <span>Live Stream (Active)</span>
              </>
            ) : (
              <>
                <Play size={14} />
                <span>Start Live Stream</span>
              </>
            )}
          </button>

          {/* Simulate Reading Button */}
          <button
            type="button"
            onClick={handleSimulate}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <PlusCircle size={15} />
            <span>{isSimulating ? 'Injecting…' : 'Generate Simulated Test Reading'}</span>
          </button>

          {/* Connect USB Hardware Directly via Web Serial */}
          <div className="flex flex-wrap items-center gap-1.5">
            {!isSerialConnected ? (
              <>
                <select
                  value={usbBaudRate}
                  onChange={(e) => setUsbBaudRate(Number(e.target.value))}
                  title="Select USB Serial Baud Rate matching your Arduino code"
                  className="rounded-xl border border-border bg-background px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-xs"
                >
                  <option value={115200}>115200 Baud (Fast / PlantDoctor)</option>
                  <option value={9600}>9600 Baud (Standard Arduino)</option>
                  <option value={57600}>57600 Baud</option>
                  <option value={38400}>38400 Baud</option>
                </select>

                <button
                  type="button"
                  onClick={handleConnectUsbSerial}
                  title="Connect USB Arduino / microcontroller directly in browser (Chrome/Edge/Android)"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border hover:bg-muted text-foreground px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Cpu size={14} />
                  <span>Connect USB Hardware</span>
                </button>
              </>
            ) : (
              <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>USB Live ({usbPacketCount} pkts)</span>
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectUsbSerial}
                  title="Disconnect USB serial port cleanly"
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer font-medium"
                >
                  Disconnect
                </button>
              </div>
            )}

            {/* USB Live Monitor Toggle */}
            <button
              type="button"
              onClick={() => setShowUsbLog(!showUsbLog)}
              title="Open/close live serial terminal monitor"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                showUsbLog
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'border-border hover:bg-muted text-foreground'
              }`}
            >
              <Terminal size={14} />
              <span>USB Console {usbPacketCount > 0 ? `(${usbPacketCount})` : ''}</span>
            </button>
          </div>

          {/* Thresholds Drawer Button */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted text-foreground transition-colors cursor-pointer"
          >
            <Sliders size={14} />
            <span>Threshold Rules</span>
          </button>

          {/* Wi-Fi Phone Guide Button */}
          <button
            type="button"
            onClick={() => setShowPhoneGuide(!showPhoneGuide)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted text-foreground transition-colors cursor-pointer"
          >
            <Smartphone size={14} />
            <span>Phone Wi-Fi Guide</span>
          </button>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span>Auto-poll (3.5s)</span>
          </label>

          {history.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              title="Clear SQLite table"
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable USB Serial Monitor / Debug Log Console */}
      {showUsbLog && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 p-4 text-xs font-mono space-y-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-emerald-400" />
              <span className="font-semibold text-slate-200">
                USB Serial Monitor · {isSerialConnected ? `Connected (${usbBaudRate} Baud)` : 'Disconnected'}
              </span>
              {isSerialConnected && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {usbPacketCount} packets received
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setUsbLog([])}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                Clear Log
              </button>
              <button
                type="button"
                onClick={() => setShowUsbLog(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {usbLog.length === 0 ? (
            <div className="py-3 text-slate-400 space-y-2">
              <p className="text-slate-300">
                {isSerialConnected
                  ? 'Waiting for incoming serial telemetry lines from USB hardware…'
                  : 'USB hardware is currently not connected.'}
              </p>
              {isSerialConnected ? (
                <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-xl p-3 space-y-1">
                  <p className="font-bold">⚠️ Connected to COM port, but no data received yet? Quick checks:</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    <li>
                      <strong>Close Arduino IDE Serial Monitor:</strong> Windows only allows one program to open a COM port. Close the Serial Monitor tab inside Arduino IDE!
                    </li>
                    <li>
                      <strong>Baud Rate:</strong> If your Arduino code uses <code className="text-amber-200">Serial.begin(9600)</code>, click Disconnect and select <strong>9600 Baud</strong>.
                    </li>
                    <li>
                      <strong>USB Cable:</strong> Use a micro-USB / USB-C cable that transfers <strong>data</strong> (many cheap phone cables only carry power).
                    </li>
                  </ul>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Select your Baud Rate above and click <strong>Connect USB Hardware</strong> to stream real sensor data directly to this dashboard.
                </p>
              )}
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1 text-[11px] bg-slate-900/70 p-3 rounded-xl border border-slate-800/80">
              {usbLog.map((line, idx) => (
                <div key={idx} className="leading-relaxed font-mono flex items-start gap-1">
                  <span className="text-emerald-400 select-none shrink-0">&gt;</span>
                  <span className="text-slate-200 break-all">{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expandable Phone Local Wi-Fi Guide */}
      {showPhoneGuide && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-semibold">
              <Smartphone size={16} />
              <span>How to Access This Dashboard from Your Mobile Phone on Local Wi-Fi</span>
            </div>
            <button
              type="button"
              onClick={() => setShowPhoneGuide(false)}
              className="text-muted-foreground hover:text-foreground cursor-pointer text-xs"
            >
              Close
            </button>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-foreground leading-relaxed">
            <li>
              <strong>Connect to Same Network:</strong> Connect both your computer and your phone to the same local Wi-Fi router or mobile phone hotspot.
            </li>
            <li>
              <strong>Find Computer IP:</strong> On Windows, open PowerShell / Command Prompt and type <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">ipconfig</code>. Look for your <em>IPv4 Address</em> (e.g. <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">192.168.1.15</code>).
            </li>
            <li>
              <strong>Run Python Flask Service:</strong> Open terminal and run:
              <pre className="mt-1 bg-muted/60 p-2 rounded-lg font-mono text-[11px] overflow-x-auto text-foreground">
                python backend_sensor/app.py
              </pre>
              (Flask listens on <code className="font-mono">0.0.0.0:5000</code>, accessible across local LAN).
            </li>
            <li>
              <strong>Open on Phone:</strong> On your phone browser, open this application and set the <strong>Local Service URL</strong> below to <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">http://&lt;COMPUTER_IP&gt;:5000</code>.
            </li>
            <li>
              <strong>Zero Internet Needed:</strong> The sensor readings, SQLite database, and WebAssembly runtime communicate strictly over your local Wi-Fi network with zero cloud or internet reliance.
            </li>
          </ol>
        </div>
      )}

      {/* Expandable Threshold Rules Configuration Drawer */}
      {showSettings && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Sliders size={18} className="text-primary" />
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Configurable Environmental Thresholds (Easy, Medium, Hard)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Done
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Easy Temperature Max (°C)</label>
              <input
                type="number"
                value={thresholds.easyTempMax}
                onChange={(e) => handleThresholdChange('easyTempMax', Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[11px] text-muted-foreground">Optimal ceiling (default: 28°C)</span>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Medium Temperature Max (°C)</label>
              <input
                type="number"
                value={thresholds.mediumTempMax}
                onChange={(e) => handleThresholdChange('mediumTempMax', Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[11px] text-muted-foreground">Threshold before Hard heat stress (default: 35°C)</span>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Optimal Humidity Range (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={thresholds.easyHumMin}
                  onChange={(e) => handleThresholdChange('easyHumMin', Number(e.target.value))}
                  className="w-1/2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Min"
                />
                <span>-</span>
                <input
                  type="number"
                  value={thresholds.easyHumMax}
                  onChange={(e) => handleThresholdChange('easyHumMax', Number(e.target.value))}
                  className="w-1/2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Max"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">Easy comfort band (default: 40% - 70%)</span>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Extreme Humidity Bounds (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={thresholds.mediumHumMin}
                  onChange={(e) => handleThresholdChange('mediumHumMin', Number(e.target.value))}
                  className="w-1/2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Low"
                />
                <span>-</span>
                <input
                  type="number"
                  value={thresholds.mediumHumMax}
                  onChange={(e) => handleThresholdChange('mediumHumMax', Number(e.target.value))}
                  className="w-1/2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="High"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">Hard drought &lt; 30% or Hard damp &gt; 85%</span>
            </div>
          </div>
        </div>
      )}

      {/* Backend Local Endpoint Configuration Strip */}
      <form onSubmit={handleSaveUrl} className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 rounded-xl border border-border text-xs">
        <span className="font-semibold text-foreground shrink-0">Local Service URL:</span>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="http://localhost:5000 or http://192.168.1.X:5000"
          className="flex-1 min-w-[200px] rounded-lg border border-border bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1 font-semibold transition-colors cursor-pointer"
        >
          Save &amp; Reconnect
        </button>
      </form>

      {/* Main Telemetry Readout Grid */}
      {latestReading ? (
        <div className="space-y-6">
          {/* Data Origin & Device Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">Device:</span>
              <span className="font-mono text-xs font-bold text-foreground bg-muted px-2.5 py-1 rounded-lg">
                {latestReading.device_id}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                Last Received: <strong>{formatTimestamp(latestReading.created_at)}</strong>
              </span>
            </div>

            {/* Clear Real vs Simulated Data Distinction Badge */}
            <div>
              {latestReading.is_simulated ? (
                <div
                  data-testid="badge-simulated-data"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>SIMULATED TEST DATA</span>
                </div>
              ) : (
                <div
                  data-testid="badge-real-data"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                >
                  <Radio size={13} className="text-emerald-600 animate-pulse" />
                  <span>REAL SENSOR DATA ({isSerialConnected ? 'USB Hardware Active' : 'LoRa Telemetry'})</span>
                </div>
              )}
            </div>
          </div>

          {/* Crop Condition & Agronomic Health Assessment Card */}
          {cropCondition && (
            <div data-testid="crop-condition-card" className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-xs">
              {/* Header: Crop Selector & Identification */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                    {cropCondition.crop.icon}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-lg font-bold text-foreground">
                        {cropCondition.crop.name} Condition Assessment
                      </h2>
                      <span className="text-xs text-muted-foreground italic hidden sm:inline">
                        ({cropCondition.crop.scientificName})
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Real-time crop health evaluation based on temperature, humidity, soil moisture &amp; configurable thresholds
                    </p>
                  </div>
                </div>

                {/* Crop Profile Dropdown */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <label htmlFor="crop-select-field" className="text-xs font-semibold text-muted-foreground shrink-0">
                    Selected Crop:
                  </label>
                  <select
                    id="crop-select-field"
                    value={selectedCrop}
                    onChange={(e) => setSelectedCrop(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-xs"
                  >
                    {Object.values(CROP_PROFILES).map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.icon} {cp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Banner with Health Score */}
              <div
                className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                  cropCondition.status === 'optimal'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                    : cropCondition.status === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center font-heading font-extrabold text-xl shrink-0 shadow-xs ${
                      cropCondition.status === 'optimal'
                        ? 'bg-emerald-600 text-white'
                        : cropCondition.status === 'warning'
                        ? 'bg-amber-600 text-white'
                        : 'bg-rose-600 text-white animate-pulse'
                    }`}
                  >
                    {cropCondition.healthScore}%
                  </div>
                  <div>
                    <div className="font-heading text-base font-bold flex flex-wrap items-center gap-2">
                      <span>{cropCondition.conditionTitle}</span>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider ${
                          cropCondition.status === 'optimal'
                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                            : cropCondition.status === 'warning'
                            ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {cropCondition.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cropCondition.summary}
                    </p>
                  </div>
                </div>

                {/* Quick Alerts Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {cropCondition.irrigationNeeded && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 animate-pulse">
                      💧 Irrigation Needed
                    </span>
                  )}
                  {cropCondition.diseaseRisk === 'high' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      ⚠️ High Fungal Threat
                    </span>
                  )}
                  {cropCondition.status === 'optimal' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      ✓ Vigorous Comfort
                    </span>
                  )}
                </div>
              </div>

              {/* 4-Parameter Metric Diagnostics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {cropCondition.metrics.map((m) => (
                  <div key={m.metric} className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">{m.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.status === 'optimal'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : m.status === 'critical'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 font-extrabold'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {m.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="font-heading text-xl font-black text-foreground">
                      {m.currentValue.toFixed(1)} {m.unit}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {m.message}
                    </p>
                  </div>
                ))}
              </div>

              {/* Actionable Agronomic Guidance for Farmer */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <Sprout size={16} />
                  <span>Agronomic Guidance for {cropCondition.crop.name} (Based on Real-Time Telemetry &amp; Thresholds)</span>
                </div>
                <ul className="space-y-1 text-xs text-foreground">
                  {cropCondition.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary font-bold leading-tight">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Metric Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Temperature Card */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>Temperature</span>
                <span>Threshold: &le; {thresholds.easyTempMax}°C</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-4xl font-extrabold text-foreground">
                  {latestReading.temperature.toFixed(1)}
                </span>
                <span className="text-xl font-bold text-muted-foreground">°C</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {latestReading.temperature <= thresholds.easyTempMax
                  ? 'Optimal vegetative comfort'
                  : latestReading.temperature <= thresholds.mediumTempMax
                  ? 'Moderate warmth elevation'
                  : 'Elevated thermal stress'}
              </p>
            </div>

            {/* Humidity Card */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>Relative Humidity</span>
                <span>Band: {thresholds.easyHumMin}% - {thresholds.easyHumMax}%</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-4xl font-extrabold text-foreground">
                  {latestReading.humidity.toFixed(1)}
                </span>
                <span className="text-xl font-bold text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {latestReading.humidity >= thresholds.easyHumMin && latestReading.humidity <= thresholds.easyHumMax
                  ? 'Balanced moisture conditions'
                  : latestReading.humidity < thresholds.mediumHumMin
                  ? 'Severe dry microclimate'
                  : latestReading.humidity > thresholds.mediumHumMax
                  ? 'Saturated foliage moisture'
                  : 'Slight moisture variance'}
              </p>
            </div>

            {/* Soil Moisture Card */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Sprout size={15} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Soil Moisture</span>
                </span>
                <span>Band: 35% - 70%</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-4xl font-extrabold text-foreground">
                  {(latestReading.soil_moisture ?? 50.0).toFixed(1)}
                </span>
                <span className="text-xl font-bold text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {(latestReading.soil_moisture ?? 50.0) < 30
                  ? 'Dry soil · Irrigation required'
                  : (latestReading.soil_moisture ?? 50.0) <= 70
                  ? 'Optimal root zone moisture'
                  : 'Saturated soil · Waterlogged'}
              </p>
            </div>

            {/* Water Level / Reservoir Card */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Waves size={15} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Water Level (Tank/Well)</span>
                </span>
                <span>Reserve: &ge; 25%</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-4xl font-extrabold text-foreground">
                  {(latestReading.water_level ?? 75.0).toFixed(1)}
                </span>
                <span className="text-xl font-bold text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {(latestReading.water_level ?? 75.0) < 25
                  ? 'Low water level alert · Refill needed'
                  : (latestReading.water_level ?? 75.0) <= 80
                  ? 'Adequate water supply'
                  : 'High capacity · Reservoir full'}
              </p>
            </div>

            {/* Motion Detection Card (Strictly separate alert) */}
            <div
              className={`p-5 rounded-2xl border transition-colors space-y-2 sm:col-span-2 lg:col-span-1 ${
                latestReading.motion
                  ? 'bg-rose-500/10 border-rose-500/30'
                  : 'bg-emerald-500/10 border-emerald-500/30'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Perimeter Motion</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    latestReading.motion
                      ? 'bg-rose-500 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {latestReading.motion ? 'MOTION ACTIVE' : 'CLEAR'}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {latestReading.motion ? (
                  <>
                    <AlertTriangle size={28} className="text-rose-600 dark:text-rose-400 animate-bounce" />
                    <div>
                      <div className="text-base font-bold text-rose-700 dark:text-rose-400">
                        Movement Detected
                      </div>
                      <div className="text-[11px] text-rose-600/90 dark:text-rose-300">
                        Field PIR sensor triggered (animal or worker activity)
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                        Field Clear
                      </div>
                      <div className="text-[11px] text-emerald-600/90 dark:text-emerald-300">
                        No perimeter motion detected
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Environmental Stress Level Assessment Card */}
          {stress && (
            <div className="p-5 rounded-2xl bg-card border border-border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">Environmental Stress Level:</span>
                  <span
                    data-testid="stress-level-badge"
                    className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                      stress.level === 'Easy'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                        : stress.level === 'Medium'
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    Level: {stress.level}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground">
                  Threshold evaluation: {stress.reasons.join(' · ')}
                </div>
              </div>

              {/* Crucial Required Disclaimer */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <HelpCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                <span className="font-medium">
                  {stress.disclaimer}
                </span>
              </div>
            </div>
          )}

          {/* Telemetry History Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-foreground">
                Readings History ({history.length})
              </h3>
              <span className="text-xs text-muted-foreground">Stored in local SQLite database</span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Device</th>
                    <th className="py-2.5 px-3">Origin</th>
                    <th className="py-2.5 px-3">Temperature</th>
                    <th className="py-2.5 px-3">Humidity</th>
                    <th className="py-2.5 px-3">Soil Moisture</th>
                    <th className="py-2.5 px-3">Water Level</th>
                    <th className="py-2.5 px-3">Motion</th>
                    <th className="py-2.5 px-3">Env Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((r, idx) => {
                    const rowStress = computeStressLevel(r.temperature, r.humidity, thresholds);
                    return (
                      <tr key={r.id || idx} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(r.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                          {r.device_id}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.is_simulated ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                              Simulated
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                              Real Sensor
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {r.temperature.toFixed(1)}°C
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {r.humidity.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {(r.soil_moisture ?? 50.0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {(r.water_level ?? 75.0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3">
                          {r.motion ? (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
                              Detected
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Clear</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rowStress.level === 'Easy'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : rowStress.level === 'Medium'
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {rowStress.level}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Disconnected State */
        <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Radio size={24} />
          </div>
          <h2 className="font-heading text-lg font-bold text-foreground">
            No Sensor Readings Received Yet
          </h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {isConnected
              ? 'Local Flask service is connected and waiting for readings from the ESP32 LoRa receiver. You can click below to generate simulated test readings immediately.'
              : `Cannot reach local service at ${backendUrl}. Ensure the Python Flask service is running on your local computer via "python backend_sensor/app.py".`}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleToggleLiveStream}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-dark transition-colors cursor-pointer shadow-xs"
            >
              <Play size={15} />
              <span>Start Continuous Live Telemetry Stream</span>
            </button>

            <button
              type="button"
              onClick={handleSimulate}
              disabled={isSimulating}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium hover:bg-muted text-foreground transition-colors cursor-pointer"
            >
              <PlusCircle size={15} />
              <span>{isSimulating ? 'Injecting…' : 'Generate Simulated Test Reading'}</span>
            </button>

            <button
              type="button"
              onClick={handleConnectUsbSerial}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-medium hover:bg-muted text-foreground transition-colors cursor-pointer"
            >
              <Cpu size={14} />
              <span>Connect USB Hardware Directly</span>
            </button>

            <button
              type="button"
              onClick={() => void loadTelemetry(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-medium hover:bg-muted text-foreground transition-colors cursor-pointer"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
