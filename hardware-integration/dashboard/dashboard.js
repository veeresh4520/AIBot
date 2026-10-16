/**
 * Plant Doctor - Standalone Hardware Integration Dashboard Logic
 * Directory: hardware-integration/dashboard/dashboard.js
 * 
 * Works in two modes:
 * 1. Direct Web Serial (Browser directly connects to USB Arduino RF receiver)
 * 2. Backend Polling (Fetches from isolated Python Flask backend on port 5050)
 */

const BACKEND_URL = 'http://localhost:5050';

const CROP_PROFILES = {
  tomato: {
    id: 'tomato',
    name: 'Tomato',
    scientific: '(Solanum lycopersicum)',
    icon: '🍅',
    optTempMin: 20,
    optTempMax: 28,
    stressTempMax: 34,
    optHumMin: 45,
    optHumMax: 70,
    optSoilMin: 45,
    optSoilMax: 68,
    minWater: 30,
  },
  rice: {
    id: 'rice',
    name: 'Rice / Paddy',
    scientific: '(Oryza sativa)',
    icon: '🌾',
    optTempMin: 22,
    optTempMax: 33,
    stressTempMax: 38,
    optHumMin: 60,
    optHumMax: 85,
    optSoilMin: 60,
    optSoilMax: 90,
    minWater: 40,
  },
  wheat: {
    id: 'wheat',
    name: 'Wheat',
    scientific: '(Triticum aestivum)',
    icon: '🌱',
    optTempMin: 15,
    optTempMax: 24,
    stressTempMax: 30,
    optHumMin: 40,
    optHumMax: 65,
    optSoilMin: 35,
    optSoilMax: 65,
    minWater: 20,
  },
  cotton: {
    id: 'cotton',
    name: 'Cotton',
    scientific: '(Gossypium hirsutum)',
    icon: '☁️',
    optTempMin: 24,
    optTempMax: 34,
    stressTempMax: 38,
    optHumMin: 40,
    optHumMax: 65,
    optSoilMin: 35,
    optSoilMax: 65,
    minWater: 25,
  },
  chilli: {
    id: 'chilli',
    name: 'Chilli / Pepper',
    scientific: '(Capsicum annuum)',
    icon: '🌶️',
    optTempMin: 20,
    optTempMax: 30,
    stressTempMax: 35,
    optHumMin: 45,
    optHumMax: 65,
    optSoilMin: 40,
    optSoilMax: 65,
    minWater: 25,
  },
  maize: {
    id: 'maize',
    name: 'Maize / Corn',
    scientific: '(Zea mays)',
    icon: '🌽',
    optTempMin: 20,
    optTempMax: 32,
    stressTempMax: 36,
    optHumMin: 45,
    optHumMax: 75,
    optSoilMin: 45,
    optSoilMax: 70,
    minWater: 25,
  },
  general: {
    id: 'general',
    name: 'General Field Crop',
    scientific: '(Mixed Plantation)',
    icon: '🌾',
    optTempMin: 18,
    optTempMax: 28,
    stressTempMax: 35,
    optHumMin: 40,
    optHumMax: 70,
    optSoilMin: 40,
    optSoilMax: 70,
    minWater: 25,
  },
};

let currentCropId = 'tomato';
let activeSerialPort = null;
let currentReading = null;

// UI Elements
const connectionPill = document.getElementById('connectionPill');
const connectionText = document.getElementById('connectionText');
const btnConnectUsb = document.getElementById('btnConnectUsb');
const btnSimulate = document.getElementById('btnSimulate');
const noticeBanner = document.getElementById('noticeBanner');
const cropSelect = document.getElementById('cropSelect');
const terminalConsole = document.getElementById('terminalConsole');

function logTerminal(message) {
  const line = document.createElement('div');
  line.className = 'terminal-line';
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  terminalConsole.appendChild(line);
  terminalConsole.scrollTop = terminalConsole.scrollHeight;
}

function showNotice(msg, isError = false) {
  noticeBanner.textContent = msg;
  noticeBanner.style.display = 'block';
  noticeBanner.style.borderColor = isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)';
  noticeBanner.style.color = isError ? '#fca5a5' : '#86efac';
  setTimeout(() => {
    noticeBanner.style.display = 'none';
  }, 4000);
}

// Crop Condition Evaluation Engine
function evaluateCropCondition(reading, cropId) {
  const crop = CROP_PROFILES[cropId] || CROP_PROFILES.tomato;
  const temp = reading.temperature;
  const hum = reading.humidity;
  const soil = reading.soil_moisture ?? 50.0;
  const water = reading.water_level ?? 75.0;

  let score = 100;
  const recs = [];
  let irrigationNeeded = false;
  let fungalRisk = false;

  let tempStatus = 'optimal';
  let tempMsg = `Comfortable vegetative temperature (${temp}°C, range ${crop.optTempMin}°C–${crop.optTempMax}°C)`;
  if (temp > crop.stressTempMax) {
    score -= 35;
    tempStatus = 'critical';
    tempMsg = `Critical heat stress (${temp}°C > ${crop.stressTempMax}°C threshold). Flower drop risk!`;
    recs.push(`Heat Stress Warning: Deploy 50% shade netting or overhead micro-sprinklers for ${crop.name}.`);
  } else if (temp > crop.optTempMax) {
    score -= 15;
    tempStatus = 'high';
    tempMsg = `Elevated warmth (${temp}°C > ${crop.optTempMax}°C optimal)`;
    recs.push(`Ensure soil has sufficient moisture to allow evaporative foliar cooling.`);
  } else if (temp < crop.optTempMin) {
    score -= 20;
    tempStatus = 'low';
    tempMsg = `Chilling stress (${temp}°C < ${crop.optTempMin}°C)`;
    recs.push(`Cold Alert: Cover seedling beds or close greenhouse vents.`);
  }

  let soilStatus = 'optimal';
  let soilMsg = `Ideal root zone hydration (${soil}%, range ${crop.optSoilMin}%–${crop.optSoilMax}%)`;
  if (soil < crop.optSoilMin - 10) {
    score -= 35;
    soilStatus = 'critical';
    irrigationNeeded = true;
    soilMsg = `Severe root drought (${soil}% < ${crop.optSoilMin}%). Permanent wilting point risk!`;
    recs.push(`Urgent Irrigation: Activate drip irrigation immediately (35–45 minutes) for ${crop.name}.`);
  } else if (soil < crop.optSoilMin) {
    score -= 15;
    soilStatus = 'low';
    irrigationNeeded = true;
    soilMsg = `Moisture deficit (${soil}% < ${crop.optSoilMin}%)`;
    recs.push(`Schedule drip cycle within 2–3 hours.`);
  } else if (soil > crop.optSoilMax + 10) {
    score -= 30;
    soilStatus = 'critical';
    soilMsg = `Waterlogged root zone (${soil}% > ${crop.optSoilMax}%). Oxygen depletion risk!`;
    recs.push(`Halt Irrigation: Clear drainage ditches immediately to prevent root rot.`);
  }

  let humStatus = 'optimal';
  let humMsg = `Balanced relative humidity (${hum}%)`;
  if (hum > crop.optHumMax + 10) {
    score -= 20;
    humStatus = 'critical';
    fungalRisk = true;
    humMsg = `Saturation (${hum}%). High leaf wetness triggers fungal blight/mildew!`;
    recs.push(`Fungal Spore Alert: Inspect ${crop.name} leaves; apply preventive bio-fungicide (Trichoderma).`);
  } else if (hum > crop.optHumMax) {
    score -= 10;
    humStatus = 'high';
    fungalRisk = true;
    humMsg = `Humid microclimate (${hum}% > ${crop.optHumMax}%)`;
    recs.push(`Avoid overhead sprinkler watering to keep foliage dry.`);
  }

  let waterStatus = 'optimal';
  let waterMsg = `Adequate irrigation reserves (${water}%)`;
  if (water < crop.minWater) {
    score -= 10;
    waterStatus = 'critical';
    waterMsg = `Low reservoir reserve (${water}% < ${crop.minWater}%). Pump dry-run risk!`;
    recs.push(`Refill water reservoir before commencing scheduled watering.`);
  }

  score = Math.max(10, Math.min(100, score));

  let overallStatus = 'optimal';
  let conditionTitle = 'Optimal Plant Vigour & Comfort';
  if (score < 60 || tempStatus === 'critical' || soilStatus === 'critical') {
    overallStatus = 'critical';
    conditionTitle = tempStatus === 'critical' ? 'Critical Heat Stress Alert' : 'Severe Root Drought Alert';
  } else if (score < 85 || tempStatus === 'high' || soilStatus === 'low') {
    overallStatus = 'warning';
    conditionTitle = 'Moderate Microclimate Stress';
  }

  if (recs.length === 0) {
    recs.push(`All parameters are ideal for ${crop.name}. Maintain normal fertigation schedule.`);
  }

  return {
    crop,
    score,
    overallStatus,
    conditionTitle,
    summary: `${crop.name}: ${conditionTitle} (Health: ${score}%). Temp: ${temp}°C, Soil: ${soil}%, Hum: ${hum}%.`,
    tempStatus,
    tempMsg,
    soilStatus,
    soilMsg,
    humStatus,
    humMsg,
    waterStatus,
    waterMsg,
    irrigationNeeded,
    fungalRisk,
    recs,
  };
}

// Update Dashboard UI with latest reading
function updateDashboard(reading) {
  if (!reading) return;
  currentReading = reading;

  // 1. Metric Cards
  document.getElementById('valTemp').textContent = Number(reading.temperature).toFixed(1);
  document.getElementById('subTemp').textContent = reading.temperature > 32 ? 'High thermal elevation' : 'Vegetative comfort';

  document.getElementById('valHum').textContent = Number(reading.humidity).toFixed(1);
  document.getElementById('subHum').textContent = reading.humidity > 75 ? 'Humid microclimate' : 'Balanced moisture';

  document.getElementById('valSoil').textContent = Number(reading.soil_moisture ?? 50.0).toFixed(1);
  document.getElementById('subSoil').textContent = (reading.soil_moisture ?? 50.0) < 35 ? 'Dry soil · Irrigation required' : 'Optimal root moisture';

  document.getElementById('valWater').textContent = Number(reading.water_level ?? 75.0).toFixed(1);
  document.getElementById('subWater').textContent = (reading.water_level ?? 75.0) < 25 ? 'Low tank reserve' : 'Adequate supply';

  const motionCard = document.getElementById('motionCard');
  const valMotion = document.getElementById('valMotion');
  const motionIcon = document.getElementById('motionIcon');
  const subMotion = document.getElementById('subMotion');

  if (reading.motion) {
    motionCard.classList.add('motion-active');
    valMotion.textContent = 'MOVEMENT DETECTED';
    valMotion.style.color = '#ef4444';
    motionIcon.textContent = '🚨';
    subMotion.textContent = 'Field PIR sensor triggered';
  } else {
    motionCard.classList.remove('motion-active');
    valMotion.textContent = 'CLEAR';
    valMotion.style.color = 'inherit';
    motionIcon.textContent = '🛡️';
    subMotion.textContent = 'No movement detected in field';
  }

  // 2. Crop Condition Evaluation
  const evalResult = evaluateCropCondition(reading, currentCropId);
  const crop = evalResult.crop;

  document.getElementById('cropIcon').textContent = crop.icon;
  document.getElementById('cropNameHeading').textContent = `${crop.name} Health Assessment`;
  document.getElementById('cropScientific').textContent = crop.scientific;

  const scoreBanner = document.getElementById('healthScoreBanner');
  scoreBanner.className = `score-banner score-${evalResult.overallStatus}`;
  document.getElementById('healthScoreValue').textContent = `${evalResult.score}%`;
  document.getElementById('conditionTitle').textContent = evalResult.conditionTitle;

  const statusBadge = document.getElementById('statusBadge');
  statusBadge.className = `badge-status badge-${evalResult.overallStatus}`;
  statusBadge.textContent = evalResult.overallStatus.toUpperCase();

  document.getElementById('conditionSummary').textContent = evalResult.summary;

  // Quick Badges
  document.getElementById('irrigationBadge').style.display = evalResult.irrigationNeeded ? 'inline-block' : 'none';
  document.getElementById('fungalBadge').style.display = evalResult.fungalRisk ? 'inline-block' : 'none';

  // Diagnostics Grid
  document.getElementById('diagTemp').textContent = Number(reading.temperature).toFixed(1);
  document.getElementById('diagTempMsg').textContent = evalResult.tempMsg;
  setMiniPill('tempStatusPill', evalResult.tempStatus);

  document.getElementById('diagSoil').textContent = Number(reading.soil_moisture ?? 50.0).toFixed(1);
  document.getElementById('diagSoilMsg').textContent = evalResult.soilMsg;
  setMiniPill('soilStatusPill', evalResult.soilStatus);

  document.getElementById('diagHum').textContent = Number(reading.humidity).toFixed(1);
  document.getElementById('diagHumMsg').textContent = evalResult.humMsg;
  setMiniPill('humStatusPill', evalResult.humStatus);

  document.getElementById('diagWater').textContent = Number(reading.water_level ?? 75.0).toFixed(1);
  document.getElementById('diagWaterMsg').textContent = evalResult.waterMsg;
  setMiniPill('waterStatusPill', evalResult.waterStatus);

  // Recommendations
  const recList = document.getElementById('recommendationsList');
  recList.innerHTML = '';
  evalResult.recs.forEach((rec) => {
    const li = document.createElement('li');
    li.textContent = rec;
    recList.appendChild(li);
  });
}

function setMiniPill(elementId, status) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = `pill-mini pill-${status === 'optimal' ? 'green' : status === 'critical' ? 'red' : 'amber'}`;
  el.textContent = status.toUpperCase();
}

// Prepend history row
function addHistoryRow(r) {
  const tbody = document.getElementById('historyTableBody');
  const emptyRow = tbody.querySelector('.table-empty');
  if (emptyRow) emptyRow.parentElement.remove();

  const tr = document.createElement('tr');
  const timeStr = new Date(r.created_at || Date.now()).toLocaleTimeString();
  tr.innerHTML = `
    <td>${timeStr}</td>
    <td><code>${r.device_id || 'RF_NODE'}</code></td>
    <td>${Number(r.temperature).toFixed(1)}°C</td>
    <td>${Number(r.humidity).toFixed(1)}%</td>
    <td>${Number(r.soil_moisture ?? 50.0).toFixed(1)}%</td>
    <td>${Number(r.water_level ?? 75.0).toFixed(1)}%</td>
    <td>${r.motion ? '<span style="color:#ef4444;font-weight:700">Movement</span>' : '<span style="color:#8fa796">Clear</span>'}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);

  // Cap rows at 30
  while (tbody.children.length > 30) {
    tbody.removeChild(tbody.lastChild);
  }

  const countBadge = document.getElementById('historyCount');
  countBadge.textContent = `${tbody.children.length} Records`;
}

// Connect Direct USB via Web Serial API
async function connectUsbSerial() {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    alert('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera on Desktop, or Chrome on Android with OTG.');
    return;
  }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    activeSerialPort = port;

    connectionPill.className = 'status-pill status-online';
    connectionText.textContent = 'USB Hardware Connected (115200 Baud)';
    btnConnectUsb.textContent = '🔌 USB Connected';
    btnConnectUsb.style.borderColor = '#22c55e';
    showNotice('Connected directly to USB RF receiver hardware!');
    logTerminal('Direct Web Serial link established at 115200 baud.');

    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

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
          logTerminal(`RAW: ${trimmed}`);
          try {
            const data = JSON.parse(trimmed);
            if (data.temperature !== undefined || data.temp !== undefined) {
              const reading = {
                device_id: data.device_id || 'USB_HW_01',
                temperature: Number(data.temperature ?? data.temp),
                humidity: Number(data.humidity ?? data.hum ?? 55.0),
                soil_moisture: Number(data.soil_moisture ?? data.soil ?? 50.0),
                water_level: Number(data.water_level ?? data.water ?? 75.0),
                motion: Boolean(data.motion),
                created_at: new Date().toISOString(),
              };
              updateDashboard(reading);
              addHistoryRow(reading);
            }
          } catch {
            // Ignore non-JSON log line
          }
        }
      }
    }
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      const msg = err.message || '';
      if (msg.includes('open') || msg.includes('Failed to open')) {
        alert(
          'Failed to open serial port!\n\n' +
          '1. Selected Bluetooth port by mistake: Pick "USB-SERIAL CH340" or "Arduino Uno", NOT "Bluetooth link".\n' +
          '2. Arduino IDE Serial Monitor is open: CLOSE the Serial Monitor in the Arduino IDE.\n' +
          '3. Check USB Data cable.'
        );
      } else {
        alert(`Serial connection failed: ${err.message}`);
      }
    }
  }
}

// Poll local backend on port 5050
async function checkBackend() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sensor-readings/latest`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (!activeSerialPort) {
        connectionPill.className = 'status-pill status-online';
        connectionText.textContent = 'Backend Active (Port 5050)';
      }
      if (data.reading && (!currentReading || data.reading.id !== currentReading.id)) {
        updateDashboard(data.reading);
        addHistoryRow(data.reading);
      }
    }
  } catch {
    if (!activeSerialPort) {
      connectionPill.className = 'status-pill status-offline';
      connectionText.textContent = 'Backend Offline (Port 5050)';
    }
  }
}

// Inject simulated test packet
async function injectSimulated() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sensor-readings/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      updateDashboard(data.data);
      addHistoryRow(data.data);
      logTerminal(`[Simulated Packet Injected] Temp: ${data.data.temperature}°C, Soil: ${data.data.soil_moisture}%`);
      showNotice('Test telemetry packet injected successfully');
      return;
    }
  } catch {
    // In-browser fallback simulation if backend is not running
  }

  const fallback = {
    device_id: 'SIM_DIRECT_01',
    temperature: Number((24.0 + Math.random() * 12.0).toFixed(1)),
    humidity: Number((45.0 + Math.random() * 35.0).toFixed(1)),
    soil_moisture: Number((35.0 + Math.random() * 40.0).toFixed(1)),
    water_level: Number((50.0 + Math.random() * 45.0).toFixed(1)),
    motion: Math.random() < 0.25,
    created_at: new Date().toISOString(),
  };
  updateDashboard(fallback);
  addHistoryRow(fallback);
  logTerminal(`[In-Memory Test Packet] Temp: ${fallback.temperature}°C, Soil: ${fallback.soil_moisture}%`);
  showNotice('Local test telemetry injected');
}

// Event Listeners
btnConnectUsb.addEventListener('click', connectUsbSerial);
btnSimulate.addEventListener('click', injectSimulated);
cropSelect.addEventListener('change', (e) => {
  currentCropId = e.target.value;
  if (currentReading) updateDashboard(currentReading);
});

// Initial boot
logTerminal('Isolated hardware test dashboard initialized.');
checkBackend();
setInterval(checkBackend, 3500);

// Default seed initial reading
injectSimulated();
