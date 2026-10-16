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
} from 'lucide-react';
import type { SensorReading, SensorThresholds } from '../services/sensorService';
import {
  getSensorBackendUrl,
  setSensorBackendUrl,
  getSensorThresholds,
  saveSensorThresholds,
  computeStressLevel,
  fetchLatestReading,
  fetchReadingsHistory,
  triggerSimulatedReading,
  checkLocalServiceHealth,
  clearReadingsHistory,
} from '../services/sensorService';

export function FieldSensorsPage() {
  const [backendUrl, setBackendUrlState] = useState<string>(getSensorBackendUrl());
  const [urlInput, setUrlInput] = useState<string>(backendUrl);
  const [thresholds, setThresholds] = useState<SensorThresholds>(getSensorThresholds());
  
  const [latestReading, setLatestReading] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionMessage, setConnectionMessage] = useState<string>('Connecting to local service…');
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPhoneGuide, setShowPhoneGuide] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const pollIntervalRef = useRef<number | null>(null);

  // Load telemetry from local Flask service
  const loadTelemetry = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const health = await checkLocalServiceHealth(backendUrl);
      setIsConnected(health.ok);
      setConnectionMessage(health.message);

      if (health.ok) {
        const [latest, hist] = await Promise.all([
          fetchLatestReading().catch(() => null),
          fetchReadingsHistory(30).catch(() => []),
        ]);
        setLatestReading(latest);
        setHistory(hist);
      }
    } catch (err) {
      setIsConnected(false);
      setConnectionMessage(err instanceof Error ? err.message : 'Cannot reach local service');
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, [backendUrl]);

  // Initial load and polling cycle
  useEffect(() => {
    void loadTelemetry(true);

    if (autoRefresh) {
      pollIntervalRef.current = window.setInterval(() => {
        void loadTelemetry(false);
      }, 3500);
    }

    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, [loadTelemetry, autoRefresh]);

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
        <div className="flex flex-wrap items-center gap-2">
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
        </div>

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
                  <span>REAL SENSOR DATA (LoRa Telemetry)</span>
                </div>
              )}
            </div>
          </div>

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
              onClick={handleSimulate}
              disabled={isSimulating}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-dark transition-colors cursor-pointer"
            >
              <PlusCircle size={15} />
              <span>Generate Simulated Test Reading</span>
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
