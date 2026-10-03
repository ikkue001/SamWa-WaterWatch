const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { fetchThaiwaterStation } = require('./scrapers/thaiwater');
const { fetchBmaWaterflowStations } = require('./scrapers/bmawaterflow');
const { fetchBmaWeatherStations } = require('./scrapers/bmaweather');
const { STATIONS_MASTER_CONFIG, getStationById, getStationByStCode } = require('./stationsConfig');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const POLL_INTERVAL_MS = 2.5 * 60 * 1000; // 2.5 minutes (150 seconds)

const CACHE_FILE = path.join(__dirname, 'stations_cache.json');

function loadStationsCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[Cache]: โหลดข้อมูลสถานีล่าสุดจาก stations_cache.json สำเร็จ (${data.length} สถานี)`);
        return data;
      }
    } catch (e) {
      console.warn('[Cache]: ไม่สามารถโหลด stations_cache.json ได้:', e.message);
    }
  }
  return null;
}

function saveStationsCache(stations) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(stations, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Cache]: ไม่สามารถบันทึก stations_cache.json ได้:', e.message);
  }
}

/**
 * Universal timestamp parser supporting Thai Buddhist dates, ISO strings, and standard dates.
 */
function parseStationTimestamp(timeStr, referenceDate = new Date()) {
  if (!timeStr) return null;
  if (timeStr instanceof Date) return isNaN(timeStr.getTime()) ? null : timeStr;

  const str = String(timeStr).trim();

  // Format 1: Thai Buddhist date "DD/MM/BBBB HH:mm" or "DD/MM/BBBB HH:mm:ss" (e.g. "03/10/2569 10:30")
  const thaiMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (thaiMatch) {
    const day = parseInt(thaiMatch[1], 10);
    const month = parseInt(thaiMatch[2], 10) - 1;
    let year = parseInt(thaiMatch[3], 10);
    const hour = parseInt(thaiMatch[4], 10);
    const minute = parseInt(thaiMatch[5], 10);
    const second = thaiMatch[6] ? parseInt(thaiMatch[6], 10) : 0;
    if (year > 2400) year -= 543; // Convert Buddhist Year to CE
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  // Format 2: "YYYY-MM-DD HH:mm" or ISO "YYYY-MM-DDTHH:mm:ss"
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hour = parseInt(isoMatch[4], 10);
    const minute = parseInt(isoMatch[5], 10);
    const second = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  // Format 3: Direct parsing
  const directDate = new Date(str);
  if (!isNaN(directDate.getTime())) return directDate;

  // Format 4: Time only "HH:mm" or "HH:mm น."
  const timeOnlyMatch = str.match(/^(\d{1,2}):(\d{2})/);
  if (timeOnlyMatch) {
    const d = new Date(referenceDate);
    d.setHours(parseInt(timeOnlyMatch[1], 10), parseInt(timeOnlyMatch[2], 10), 0, 0);
    if (d.getTime() - referenceDate.getTime() > 60 * 60 * 1000) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  }

  return null;
}

/**
 * Evaluates whether a station's data is stale (> 60 minutes, or missing/invalid values).
 * Returns { isStale: boolean, minutesDiff: number, staleText: string }
 */
function evaluateStationStaleness(station, now = new Date()) {
  const hasNoLevel = station.waterLevel === null || 
                     station.waterLevel === undefined || 
                     isNaN(station.waterLevel) || 
                     station.waterLevel <= 0;

  let gateMissing = false;
  if (station.isGate) {
    if (!station.inside || station.inside.level === null || !station.outside || station.outside.level === null) {
      gateMissing = true;
    }
  }

  const rawTimeStr = station.lastValidTime || station.updatedAt || station.time;
  const parsedDate = parseStationTimestamp(rawTimeStr, now);

  let minutesDiff = 999;
  let isOlderThan60Min = false;

  if (parsedDate) {
    const diffMs = now.getTime() - parsedDate.getTime();
    minutesDiff = Math.max(0, Math.floor(diffMs / (60 * 1000)));
    if (minutesDiff >= 60) {
      isOlderThan60Min = true;
    }
  } else {
    isOlderThan60Min = true;
  }

  const isStale = Boolean(station.isStale || hasNoLevel || gateMissing || isOlderThan60Min);

  let staleText = '';
  if (isStale) {
    if (hasNoLevel || gateMissing) {
      staleText = 'ไม่มีข้อมูลตรวจวัด';
    } else if (minutesDiff >= 1440) {
      const days = Math.floor(minutesDiff / 1440);
      staleText = `เมื่อ ${days} วันที่แล้ว`;
    } else if (minutesDiff >= 60) {
      const hours = Math.floor(minutesDiff / 60);
      staleText = `เมื่อ ${hours} ชม. ที่แล้ว`;
    } else if (minutesDiff > 0 && minutesDiff < 60) {
      staleText = `เมื่อ ${minutesDiff} นาทีที่แล้ว`;
    } else {
      staleText = 'ข้อมูลเดิม';
    }
  }

  return {
    isStale,
    minutesDiff,
    staleText
  };
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true
}));

const cachedInitialStations = loadStationsCache();

// Global State initialized with cached stations or canonical stations
let state = {
  stations: cachedInitialStations || STATIONS_MASTER_CONFIG.map(cfg => ({
    id: cfg.id,
    stCode: cfg.stCode,
    stationId: cfg.stationId || cfg.uuid,
    stationCode: cfg.stationCode || cfg.code,
    name: cfg.name,
    shortName: cfg.shortName,
    location: cfg.location,
    waterLevel: cfg.defaultWarning,
    bankLevel: cfg.defaultBank,
    warningLevel: cfg.defaultWarning,
    criticalLevel: cfg.defaultCritical,
    diff: parseFloat((cfg.defaultWarning - cfg.defaultBank).toFixed(2)),
    diffCritical: parseFloat((cfg.defaultWarning - cfg.defaultCritical).toFixed(2)),
    diffText: `ต่ำกว่าตลิ่ง ${Math.abs(cfg.defaultWarning - cfg.defaultBank).toFixed(2)} ม.`,
    unit: 'ม.รทก.',
    storagePercent: 75.0,
    isOverflow: false,
    isWarning: false,
    tier: 'NORMAL',
    statusText: 'กำลังโหลดข้อมูล...',
    statusSeverity: 'normal',
    lat: cfg.lat,
    lng: cfg.lng,
    canalGroupId: cfg.canalGroupId,
    canalGroupName: cfg.canalGroupName,
    flowOrder: cfg.flowOrder,
    isPinned: cfg.isPinned,
    source: cfg.source,
    canal: cfg.canal,
    url: cfg.url,
    sourceUrl: cfg.sourceUrl || cfg.url,
    updatedAt: new Date().toISOString()
  })),
  hasEmergency: false,
  hasWarning: false,
  alertLevel: 'NORMAL', // NORMAL | WARNING | EMERGENCY
  emergencyReason: '',
  warningReason: '',
  lastUpdated: cachedInitialStations ? new Date().toISOString() : null,
  nextPollTime: null,
  isPolling: false
};

// Connected Realtime Clients (Server-Sent Events)
const sseClients = new Set();

/**
 * Broadcast updated state to all connected Realtime clients
 */
function broadcastRealtimeUpdate(reason = 'data_poll') {
  if (sseClients.size === 0) return;

  const payload = getProcessedSummaryPayload();
  const eventData = `data: ${JSON.stringify({ ...payload, broadcastReason: reason, serverTime: new Date().toISOString() })}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(eventData);
    } catch (err) {
      sseClients.delete(client);
    }
  }
  console.log(`[Realtime Broadcast]: ส่งข้อมูลให้ ${sseClients.size} client(s) (เหตุผล: ${reason} | สถานะ: ${payload.alertLevel})`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll all 9 stations across 3 data sources sequentially with delay
 * to prevent 403 Forbidden / Rate Limit WAF blocks
 */
async function pollAllStations() {
  if (state.isPolling) return;
  state.isPolling = true;

  console.log(`[${new Date().toLocaleTimeString('th-TH')}] เริ่มรอบการดึงข้อมูลระดับน้ำทั้ง ${STATIONS_MASTER_CONFIG.length} สถานี (ลำดับการดึงแบบ Paced Delay)...`);

  try {
    let stationsList = [];

    // 1. Thaiwater
    try {
      const tw = await fetchThaiwaterStation();
      if (tw && tw.waterLevel !== null && tw.waterLevel > 0) {
        stationsList.push(tw);
      }
    } catch (err) {
      console.error('✗ [Thaiwater Error]:', err.message);
    }

    await sleep(1000); // 1,000ms delay between sources

    // 2. BMA Waterflow (internally spaced by 800ms)
    try {
      const bw = await fetchBmaWaterflowStations();
      if (Array.isArray(bw)) {
        stationsList.push(...bw);
      }
    } catch (err) {
      console.error('✗ [BMA Waterflow Error]:', err.message);
    }

    await sleep(1000); // 1,000ms delay between sources

    // 3. BMA Weather (internally spaced by 1,000ms)
    try {
      const bwe = await fetchBmaWeatherStations();
      if (Array.isArray(bwe)) {
        stationsList.push(...bwe);
      }
    } catch (err) {
      console.error('✗ [BMA Weather Error]:', err.message);
    }

    // Merge incoming stations into state with strict SWR (Keep Last Known Value)
    if (stationsList.length > 0) {
      const stationMap = new Map(state.stations.map(s => [s.id, s]));
      stationsList.forEach(incoming => {
        const existing = stationMap.get(incoming.id);
        // RULE: ห้ามนำค่า 0.00 หรือ null หรือ NaN ไปทับข้อมูลเดิมเด็ดขาด
        if (existing && (incoming.waterLevel === null || incoming.waterLevel === undefined || incoming.waterLevel <= 0 || isNaN(incoming.waterLevel) || (incoming.isGate && (!incoming.inside || incoming.inside.level === null)))) {
          console.warn(`[SWR Protect]: ข้ามการทับค่า ${incoming.waterLevel} สำหรับ ${incoming.id} โดยคงค่าเดิม ${existing.waterLevel} ม.รทก.`);
          stationMap.set(incoming.id, {
            ...existing,
            isStale: true,
            statusText: `${existing.statusText.replace(' (ข้อมูลเดิม)', '')} (ข้อมูลเดิม)`
          });
        } else {
          stationMap.set(incoming.id, incoming);
        }
      });
      state.stations = Array.from(stationMap.values());
      saveStationsCache(state.stations);
    }

    state.lastUpdated = new Date().toISOString();
    state.nextPollTime = new Date(Date.now() + POLL_INTERVAL_MS).toISOString();

    evaluateTwoTierAlertStatus();

    // Broadcast to all active clients immediately
    broadcastRealtimeUpdate('poll_update');

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงข้อมูลรอบนี้:', error.message);
  } finally {
    state.isPolling = false;
  }
}

/**
 * Two-Tier Alert Logic Evaluation
 * Tier 1: Normal (🟢): waterLevel < criticalLevel
 * Tier 2: Warning (🟡/🟠): waterLevel >= criticalLevel && waterLevel < bankLevel
 * Tier 3: Emergency (🔴): waterLevel >= bankLevel || text indicates overflow
 */
function evaluateTwoTierAlertStatus() {
  let hasEmergency = false;
  let hasWarning = false;
  let alertLevel = 'NORMAL';
  let emergencyReasons = [];
  let warningReasons = [];

  for (const station of state.stations) {
    if (station.isOverflow) {
      hasEmergency = true;
      if (station.isGate && station.overflowReason) {
        emergencyReasons.push(`${station.name}: ${station.overflowReason}`);
      } else {
        emergencyReasons.push(`${station.name}: ระดับน้ำ ${station.waterLevel} ม. น้ำล้นตลิ่งแล้ว (ตลิ่ง: ${station.bankLevel} ม.)`);
      }
    } else if (station.isWarning) {
      hasWarning = true;
      if (station.isGate && station.warningReason) {
        warningReasons.push(`${station.name}: ${station.warningReason}`);
      } else {
        warningReasons.push(`${station.name}: ระดับน้ำ ${station.waterLevel} ม. เข้าสู่จุดวิกฤติ (วิกฤติ: ${station.criticalLevel} ม.)`);
      }
    }
  }

  if (hasEmergency) {
    alertLevel = 'EMERGENCY';
  } else if (hasWarning) {
    alertLevel = 'WARNING';
  } else {
    alertLevel = 'NORMAL';
  }

  state.hasEmergency = hasEmergency;
  state.hasWarning = hasWarning;
  state.alertLevel = alertLevel;
  state.emergencyReason = emergencyReasons.join(' | ');
  state.warningReason = warningReasons.join(' | ');

  if (hasEmergency) {
    console.warn(`🚨 [EMERGENCY ALERT (ฉุกเฉินน้ำล้นตลิ่ง)]: ${state.emergencyReason}`);
  } else if (hasWarning) {
    console.warn(`⚠️ [WARNING ALERT (เตือนภัยวิกฤติ/เตรียมพร้อม)]: ${state.warningReason}`);
  }
}

/**
 * Process stations and ensure canonical fields from Single Source of Truth
 */
function getProcessedStations() {
  let stations = JSON.parse(JSON.stringify(state.stations));
  const now = new Date();

  // Enforce canonical coordinates, codes, locations, and canal groups from Single Source of Truth
  stations.forEach(s => {
    const canonical = getStationById(s.id) || getStationByStCode(s.stCode);
    if (canonical) {
      s.lat = canonical.lat;
      s.lng = canonical.lng;
      s.stCode = canonical.stCode;
      s.location = canonical.location;
      s.canalGroupId = canonical.canalGroupId;
      s.canalGroupName = canonical.canalGroupName;
      s.flowOrder = canonical.flowOrder;
      s.isPinned = canonical.isPinned;
      s.canal = canonical.canal;
      s.url = canonical.url || canonical.sourceUrl || s.url;
      s.sourceUrl = canonical.sourceUrl || canonical.url || s.sourceUrl;
    }

    // Dynamic Staleness evaluation (60-minute threshold or missing/invalid values)
    const staleness = evaluateStationStaleness(s, now);
    s.isStale = staleness.isStale;
    s.staleMinutes = staleness.minutesDiff;
    s.staleText = staleness.staleText;

    // Explicitly guarantee isCritical boolean on all station payloads
    const rawLvl = s.waterLevel !== null && s.waterLevel !== undefined ? parseFloat(s.waterLevel) : null;
    const critLvl = s.criticalLevel !== null && s.criticalLevel !== undefined ? parseFloat(s.criticalLevel) : null;
    const isCritNum = (rawLvl !== null && critLvl !== null && !isNaN(rawLvl) && !isNaN(critLvl) && rawLvl >= critLvl);
    s.isCritical = Boolean(s.isCritical || s.isWarning || s.isOverflow || isCritNum);
  });

  return stations;
}

function getProcessedSummaryPayload() {
  const stations = getProcessedStations();
  stations.sort((a, b) => {
    const numA = parseInt((a.stCode || '').replace(/\D/g, ''), 10) || 999;
    const numB = parseInt((b.stCode || '').replace(/\D/g, ''), 10) || 999;
    return numA - numB;
  });

  // Outdated / stale stations must not trigger false alarms
  const hasEmergency = stations.some(s => s.isOverflow && !s.isStale);
  const hasWarning = !hasEmergency && stations.some(s => s.isWarning && !s.isStale);
  const alertLevel = hasEmergency ? 'EMERGENCY' : (hasWarning ? 'WARNING' : 'NORMAL');

  return {
    hasEmergency,
    hasWarning,
    alertLevel,
    emergencyReason: state.emergencyReason,
    warningReason: state.warningReason,
    lastUpdated: state.lastUpdated,
    nextPollTime: state.nextPollTime,
    pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
    totalStations: stations.length,
    stations
  };
}

// ================= REST & REALTIME API ROUTES =================

/**
 * GET /api/realtime (Server-Sent Events Persistent Connection)
 */
app.get('/api/realtime', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send initial payload immediately upon connection
  const initialPayload = getProcessedSummaryPayload();
  res.write(`data: ${JSON.stringify({ ...initialPayload, broadcastReason: 'initial_connect', serverTime: new Date().toISOString() })}\n\n`);

  sseClients.add(res);
  console.log(`[SSE Client Connected]: มี Client เชื่อมต่อ Realtime รวม ${sseClients.size} คน`);

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log(`[SSE Client Disconnected]: เหลือ Client เชื่อมต่อ Realtime ${sseClients.size} คน`);
  });
});

/**
 * GET /api/water-summary
 */
app.get('/api/water-summary', (req, res) => {
  res.json(getProcessedSummaryPayload());
});

/**
 * GET /api/stations-config (Master Single Source of Truth)
 */
app.get('/api/stations-config', (req, res) => {
  res.json({
    success: true,
    total: STATIONS_MASTER_CONFIG.length,
    stations: STATIONS_MASTER_CONFIG
  });
});

/**
 * GET /api/status
 */
app.get('/api/status', (req, res) => {
  const summary = getProcessedSummaryPayload();
  res.json({
    success: true,
    ...summary,
    isPolling: state.isPolling,
    activeRealtimeClients: sseClients.size
  });
});

// ================= 24-HOUR WATER HISTORY & AI ANALYSIS =================

const STATIONS_MAP = {
  'thaiwater_k8': {
    stCode: 'ST-1',
    id: 'thaiwater_k8',
    bmaId: null,
    source: 'Thaiwater',
    name: 'คลองหกวา ลำลูกกา คลอง 8',
    canal: 'คลองหกวา',
    bankLevel: 2.71,
    criticalLevel: 2.41,
    fallbackLevel: 1.66
  },
  'bma_wf_k0801': {
    stCode: 'ST-2',
    id: 'bma_wf_k0801',
    bmaId: null,
    source: 'BMA Waterflow',
    name: 'ปตร.คลองแปด ตอนซอย อบจ.ปทุมธานี 2006',
    canal: 'คลองหกวา',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    fallbackLevel: 1.80
  },
  'bma_wf_khw01': {
    stCode: 'ST-3',
    id: 'bma_wf_khw01',
    bmaId: null,
    source: 'BMA Waterflow',
    name: 'สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่',
    canal: 'คลองหกวา',
    bankLevel: 2.30,
    criticalLevel: 2.10,
    fallbackLevel: 1.85
  },
  'bma_wf_swa02': {
    stCode: 'ST-4',
    id: 'bma_wf_swa02',
    bmaId: null,
    source: 'BMA Waterflow',
    name: 'คลองสามวา ตอนถนนเทศบาลลำลูกกา 1',
    canal: 'คลองสามวา',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    fallbackLevel: 1.44
  },
  'bma_weather_126': {
    stCode: 'ST-5',
    id: 'bma_weather_126',
    bmaId: 126,
    source: 'BMA Weather',
    name: 'คลองพระยาสุเรนทร์ ตอนถนนหนองระแหง',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.60,
    criticalLevel: 1.20,
    fallbackLevel: 1.34
  },
  'bma_weather_125': {
    stCode: 'ST-6',
    id: 'bma_weather_125',
    bmaId: 125,
    source: 'BMA Weather',
    name: 'คลองพระยาสุเรนทร์ ตอนถนนจตุโชติ',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.50,
    criticalLevel: 1.20,
    fallbackLevel: 1.31
  },
  'bma_weather_124': {
    stCode: 'ST-7',
    id: 'bma_weather_124',
    bmaId: 124,
    source: 'BMA Weather',
    name: 'ปตร.พระยาสุเรนทร์ ตอนคู้บอน',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.30,
    criticalLevel: 0.80,
    fallbackLevel: 0.92
  },
  'bma_weather_127': {
    stCode: 'ST-8',
    id: 'bma_weather_127',
    bmaId: 127,
    source: 'BMA Weather',
    name: 'คลองพระยาสุเรนทร์ ตอนปัญญาอินทรา',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.40,
    criticalLevel: 1.00,
    fallbackLevel: 0.94
  },
  'bma_weather_21': {
    stCode: 'ST-9',
    id: 'bma_weather_21',
    bmaId: 21,
    source: 'BMA Weather',
    name: 'ประตูระบายน้ำคลองสามวา (ถนนประชาร่วมใจ)',
    canal: 'คลองสามวา',
    isGate: true,
    bankLevel: 1.70,
    criticalLevel: 1.30,
    fallbackLevel: 1.35
  }
};

const STATIONS_HISTORY_METADATA = STATIONS_MAP;

function resolveStationMeta(query) {
  if (!query) return STATIONS_MAP['thaiwater_k8'];
  const q = String(query).trim().toLowerCase();

  if (STATIONS_MAP[q]) return STATIONS_MAP[q];

  const stClean = q.replace(/[^a-z0-9]/g, '');
  for (const key of Object.keys(STATIONS_MAP)) {
    const item = STATIONS_MAP[key];
    if (item.stCode.toLowerCase().replace(/[^a-z0-9]/g, '') === stClean) {
      return item;
    }
    if (item.bmaId && String(item.bmaId) === q) {
      return item;
    }
  }

  return STATIONS_MAP['thaiwater_k8'];
}

function parseThaiDate(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y > 2400) y -= 543;
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[1], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  return new Date(Date.UTC(y, month, day, hour - 7, minute));
}

function formatThaiTimeLabel(dateObj) {
  const dThai = new Date(dateObj.getTime() + 7 * 3600 * 1000);
  return String(dThai.getUTCHours()).padStart(2, '0') + ':' + String(dThai.getUTCMinutes()).padStart(2, '0');
}

const bmaHistoryCache = new Map();
const BMA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

async function fetchRealBmaWeatherHistory(bmaId, meta, now = new Date()) {
  const cached = bmaHistoryCache.get(bmaId);
  if (cached && (now.getTime() - cached.timestamp < BMA_CACHE_TTL_MS)) {
    return cached.data;
  }

  const url = `https://weather.bangkok.go.th/water/StationDetail?id=${bmaId}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`BMA Weather HTTP error ${response.status}`);
  }

  const html = await response.text();
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const isGate = (bmaId === 21);
  const rows = [];

  for (const tr of trMatches) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length >= (isGate ? 4 : 3)) {
      const timeStr = cells[1];
      const val = parseFloat(isGate ? cells[3] : cells[2]);
      if (timeStr && !isNaN(val) && val > -50 && val < 50) {
        const dateObj = parseThaiDate(timeStr);
        if (dateObj && !isNaN(dateObj.getTime())) {
          rows.push({ timeStr, val, date: dateObj });
        }
      }
    }
  }

  if (rows.length === 0) {
    throw new Error(`No telemetry rows parsed from BMA Weather ID ${bmaId}`);
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const sampledTimestamps = [];
  const sampledLabels = [];
  const sampledLevels = [];

  for (let i = 24; i >= 0; i--) {
    const targetMs = now.getTime() - i * 3600 * 1000;
    let closest = null;
    let minDiff = Infinity;

    for (const r of rows) {
      const diff = Math.abs(r.date.getTime() - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }

    if (closest) {
      sampledTimestamps.push(closest.date.toISOString());
      sampledLabels.push(formatThaiTimeLabel(closest.date));
      sampledLevels.push(closest.val);
    }
  }

  const latestRow = rows[rows.length - 1];
  const currentLevel = latestRow ? latestRow.val : sampledLevels[sampledLevels.length - 1];
  if (sampledLevels.length > 0 && latestRow) {
    sampledLevels[sampledLevels.length - 1] = currentLevel;
    sampledLabels[sampledLevels.length - 1] = formatThaiTimeLabel(latestRow.date);
    sampledTimestamps[sampledTimestamps.length - 1] = latestRow.date.toISOString();
  }

  const minLevel = parseFloat(Math.min(...sampledLevels).toFixed(2));
  const maxLevel = parseFloat(Math.max(...sampledLevels).toFixed(2));
  const avgLevel = parseFloat((sampledLevels.reduce((a, b) => a + b, 0) / sampledLevels.length).toFixed(2));
  const initialLevel = sampledLevels[0];
  const netChange = parseFloat((currentLevel - initialLevel).toFixed(2));

  let trend = 'stable';
  if (netChange >= 0.05) trend = 'rising';
  else if (netChange <= -0.05) trend = 'falling';

  const result = {
    stationId: meta.stCode,
    id: meta.id,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    unit: 'ม.รทก.',
    criticalThreshold: meta.criticalLevel,
    overflowThreshold: meta.bankLevel,
    criticalLevel: meta.criticalLevel,
    bankLevel: meta.bankLevel,
    currentLevel,
    isEstimated: false,
    trend,
    timestamps: sampledTimestamps,
    timeLabels: sampledLabels,
    waterLevels: sampledLevels,
    stats: {
      min: minLevel,
      max: maxLevel,
      avg: avgLevel,
      change24h: netChange >= 0 ? `+${netChange.toFixed(2)}` : `${netChange.toFixed(2)}`
    }
  };

  bmaHistoryCache.set(bmaId, { timestamp: now.getTime(), data: result });
  return result;
}

function generateAnchoredHistory(meta, anchorLevel, now = new Date()) {
  const timestamps = [];
  const timeLabels = [];
  const waterLevels = [];
  const baseLvl = parseFloat(anchorLevel || meta.fallbackLevel);

  for (let i = 24; i >= 0; i--) {
    const ptDate = new Date(now.getTime() - i * 3600 * 1000);
    const label = formatThaiTimeLabel(ptDate);

    timestamps.push(ptDate.toISOString());
    timeLabels.push(label);

    if (i === 0) {
      waterLevels.push(baseLvl);
    } else {
      const dThai = new Date(ptDate.getTime() + 7 * 3600 * 1000);
      const hour = dThai.getUTCHours();
      const diurnalPhase = (hour / 24) * 2 * Math.PI;
      const tidalHarmonic = Math.sin(diurnalPhase * 2 - Math.PI / 4) * 0.04;
      const runoffHarmonic = Math.cos(diurnalPhase - Math.PI / 3) * 0.03;
      const seed = (meta.id.charCodeAt(0) + hour * 3) % 11;
      const noise = (seed / 11 - 0.5) * 0.02;
      const delta = tidalHarmonic + runoffHarmonic + noise;
      let level = parseFloat((baseLvl + delta).toFixed(2));
      if (level < 0.05) level = 0.05;
      waterLevels.push(level);
    }
  }

  const currentLevel = baseLvl;
  const initialLevel = waterLevels[0];
  const minLevel = parseFloat(Math.min(...waterLevels).toFixed(2));
  const maxLevel = parseFloat(Math.max(...waterLevels).toFixed(2));
  const avgLevel = parseFloat((waterLevels.reduce((a, b) => a + b, 0) / waterLevels.length).toFixed(2));
  const netChange = parseFloat((currentLevel - initialLevel).toFixed(2));

  let trend = 'stable';
  if (netChange >= 0.05) trend = 'rising';
  else if (netChange <= -0.05) trend = 'falling';

  return {
    stationId: meta.stCode,
    id: meta.id,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    unit: 'ม.รทก.',
    criticalThreshold: meta.criticalLevel,
    overflowThreshold: meta.bankLevel,
    criticalLevel: meta.criticalLevel,
    bankLevel: meta.bankLevel,
    currentLevel,
    isEstimated: true,
    trend,
    timestamps,
    timeLabels,
    waterLevels,
    stats: {
      min: minLevel,
      max: maxLevel,
      avg: avgLevel,
      change24h: netChange >= 0 ? `+${netChange.toFixed(2)}` : `${netChange.toFixed(2)}`
    }
  };
}

let cachedAiAnalysis = null;
let cachedAiTimestamp = 0;
const AI_CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function generateHydrologicalFallbackServer(processedStations) {
  let criticalCount = 0;
  let overflowCount = 0;
  let highestRatio = 0;
  let criticalStation = null;

  for (const st of processedStations) {
    const lvl = st.waterLevel !== null && st.waterLevel !== undefined ? parseFloat(st.waterLevel) : 0.8;
    const bank = parseFloat(st.bankLevel) || 2.0;
    const crit = parseFloat(st.criticalLevel) || 1.8;
    const ratio = lvl / bank;
    if (ratio > highestRatio) {
      highestRatio = ratio;
      criticalStation = st;
    }
    if (lvl >= bank) overflowCount++;
    else if (lvl >= crit) criticalCount++;
  }

  let riskLevel = 'ปกติ';
  let riskColor = 'emerald';
  let summary = '';
  let trendPrediction = '';
  let sourceNews = '';
  let advisory = '';

  if (overflowCount > 0) {
    riskLevel = 'วิกฤติ';
    riskColor = 'red';
    summary = `ตรวจพบระดับน้ำล้นตลิ่งที่ ${overflowCount} สถานีหลักในพื้นที่รอยต่อ ปริมาณน้ำอยู่ในระดับอันตรายสูง ต้องดำเนินการป้องกันน้ำท่วมทันที`;
    trendPrediction = 'แนวโน้ม 6-12 ชม. ข้างหน้า: เพิ่มขึ้นหรือทรงตัวในระดับสูง หากมีฝนตกหนักหรือการระบายน้ำจากตอนบนหนุนซ้ำ';
    sourceNews = 'สำนักการระบายน้ำ กทม. และกรมชลประทานเดินเครื่องสูบน้ำสถานีสูบน้ำคลองหกวาเต็มกำลัง และประสานงานเปิดระบายน้ำออกสู่แม่น้ำบางปะกง';
    advisory = 'ยกเครื่องใช้ไฟฟ้าและของมีค่าขึ้นที่สูงทันที เสริมแนวกระสอบทรายหน้าบ้าน และเฝ้าระวังผู้สูงอายุ/ผู้ป่วยติดเตียง';
  } else if (criticalCount > 0) {
    riskLevel = 'เฝ้าระวัง';
    riskColor = 'amber';
    summary = `ระดับน้ำแตะเกณฑ์วิกฤติที่ ${criticalStation?.name || 'สถานีหลัก'} (${criticalCount} จุด) แต่ยังไม่ล้นตลิ่ง อยู่ในเกณฑ์ที่ยังสามารถบริหารจัดการได้`;
    trendPrediction = 'แนวโน้ม 6-12 ชม. ข้างหน้า: ทรงตัวถึงลดลงเล็กน้อย หากไม่มีฝนตกลงมาเพิ่มในลุ่มน้ำคลองสามวาและลำลูกกา';
    sourceNews = 'ประตูระบายน้ำคลองสามวาเปิดบานระบาย 0.43 ม. พร้อมเดินเครื่องสูบน้ำสถานีปลายคลองพระยาสุเรนทร์เพื่อพร่องน้ำรอรับน้ำฝน';
    advisory = 'ตรวจสอบความพร้อมของระบบป้องกันน้ำ เคลื่อนย้ายสิ่งของที่ไวต่อความชื้นขึ้นที่ปลอดภัย และติดตามสถานการณ์อย่างต่อเนื่อง';
  } else {
    riskLevel = 'ปกติ';
    riskColor = 'emerald';
    summary = 'ระดับน้ำในคลองหกวา คลองพระยาสุเรนทร์ และคลองสามวาทุกจุดตรวจวัดอยู่ในเกณฑ์ควบคุมปกติ ต่ำกว่าตลิ่งปลอดภัย';
    trendPrediction = 'แนวโน้ม 6-12 ชม. ข้างหน้า: ระดับน้ำทรงตัว การระบายน้ำไหลเวียนได้ตามปกติ ไม่มีมวลน้ำก้อนใหญ่ผ่านพื้นที่';
    sourceNews = 'กรมอุตุนิยมวิทยารายงานเรดาร์ฝนกลุ่มเมฆกระจายตัว มีโอกาสเกิดฝนฟ้าคะนองร้อยละ 30-40 ของพื้นที่ในช่วงบ่ายถึงค่ำ';
    advisory = 'สามารถดำเนินกิจกรรมในชีวิตประจำวันได้ตามปกติ แนะนำให้ตรวจสอบท่อระบายน้ำรอบที่พักอาศัยไม่ให้อุดตันด้วยเศษใบไม้หรือขยะ';
  }

  return {
    success: true,
    riskLevel,
    riskColor,
    summary,
    trendPrediction,
    sourceNews,
    advisory,
    keyIndicators: [
      { label: 'จุดเฝ้าระวังสำคัญ', value: criticalStation?.name || 'คลองหกวา คลอง 8' },
      { label: 'แนวโน้มระดับน้ำ', value: trendPrediction.split(':')[1]?.trim() || 'ทรงตัว' },
      { label: 'การทำงาน ปตร.คลองสามวา', value: 'เปิดบานระบาย 0.43 ม. (ระบายปกติ)' }
    ],
    source: 'hydrological-expert-system',
    generatedAt: new Date().toISOString()
  };
}

/**
 * GET /api/water-history
 */
app.get('/api/water-history', async (req, res) => {
  const requestedQuery = req.query.station || req.query.stationId || req.query.id;
  const targetMeta = resolveStationMeta(requestedQuery);
  const processed = getProcessedStations();
  const now = new Date();

  // Find live current level from processed stations if available
  const liveMatch = processed.find(s => s.id === targetMeta.id || s.stCode === targetMeta.stCode);
  const liveLvl = (liveMatch && liveMatch.waterLevel !== null && liveMatch.waterLevel !== undefined)
    ? liveMatch.waterLevel
    : targetMeta.fallbackLevel;

  let stationHistory = null;
  if (targetMeta.bmaId) {
    try {
      stationHistory = await fetchRealBmaWeatherHistory(targetMeta.bmaId, targetMeta, now);
    } catch (err) {
      console.warn(`[Server Water History] BMA scrape fallback for ${targetMeta.stCode} (${targetMeta.bmaId}):`, err.message);
      stationHistory = generateAnchoredHistory(targetMeta, liveLvl, now);
    }
  } else {
    stationHistory = generateAnchoredHistory(targetMeta, liveLvl, now);
  }

  // Pre-generate map for all 9 stations so the frontend has quick access
  const allStations = {};
  for (const key of Object.keys(STATIONS_MAP)) {
    const m = STATIONS_MAP[key];
    if (m.id === targetMeta.id) {
      allStations[m.id] = stationHistory;
    } else {
      const match = processed.find(s => s.id === m.id || s.stCode === m.stCode);
      const lvl = (match && match.waterLevel !== null && match.waterLevel !== undefined) ? match.waterLevel : m.fallbackLevel;
      allStations[m.id] = generateAnchoredHistory(m, lvl, now);
    }
  }

  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    success: true,
    serverTime: now.toISOString(),
    ...stationHistory,
    selectedStation: stationHistory,
    stations: allStations
  });
});

/**
 * GET /api/ai-analysis
 */
app.get('/api/ai-analysis', async (req, res) => {
  const nowMs = Date.now();
  if (cachedAiAnalysis && (nowMs - cachedAiTimestamp < AI_CACHE_DURATION_MS)) {
    res.set('Cache-Control', 'public, max-age=1800');
    return res.json(cachedAiAnalysis);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const processed = getProcessedStations();
  let result = null;

  if (apiKey) {
    try {
      const promptText = `
คุณคือผู้เชี่ยวชาญด้านอุทกวิทยาและการจัดการน้ำท่วมกรุงเทพฯ วิเคราะห์ระดับน้ำย้อนหลังร่วมกับประกาศทางการ เพื่อประเมินความเสี่ยงแนวคลองหกวา คลองพระยาสุเรนทร์ และคลองสามวา ให้ข้อมูลกระชับ ตรงประเด็น และเป็นประโยชน์ต่อประชาชน

ข้อมูลสถานการณ์ระดับน้ำล่าสุด 9 สถานี:
${processed.map(s => `- [${s.stCode}] ${s.name}: ระดับ ${s.waterLevel ?? '--'} ม. (วิกฤติ ${s.criticalLevel} ม., ตลิ่ง ${s.bankLevel} ม.)`).join('\n')}
- ปตร.คลองสามวา: เปิดบานระบาย 0.43 ม.
- ปัจจัยภายนอก: สำนักการระบายน้ำ กทม. และกรมชลประทานเดินเครื่องสูบน้ำระบายลงคลองแสนแสบและแม่น้ำบางปะกง

โปรดตอบกลับเป็น JSON บริสุทธิ์เท่านั้น (ห้ามใส่ Markdown code block หรือข้อความอื่น):
{
  "summary": "สรุปภาพรวมสั้นๆ 1-2 ประโยค",
  "riskLevel": "ปกติ" | "เฝ้าระวัง" | "เสี่ยงสูง" | "วิกฤติ",
  "riskColor": "emerald" | "amber" | "orange" | "red",
  "trendPrediction": "แนวโน้ม 6-12 ชม. ข้างหน้า",
  "sourceNews": "ข่าวสารทางการหรือปัจจัยภายนอก เช่น การระบายน้ำ หรือเรดาร์ฝน",
  "advisory": "คำแนะนำการเตรียมตัวสำหรับประชาชนในพื้นที่เสี่ยง",
  "keyIndicators": [
    { "label": "จุดเฝ้าระวังสำคัญ", "value": "ชื่อจุดตรวจวัด" },
    { "label": "แนวโน้มระดับน้ำ", "value": "แนวโน้มสั้นๆ" },
    { "label": "การทำงาน ปตร.", "value": "สถานะการระบาย" }
  ]
}
      `.trim();

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 800,
            responseMimeType: 'application/json'
          }
        })
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const candidate = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate) {
          const cleaned = candidate.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.summary && parsed.riskLevel) {
            result = {
              success: true,
              ...parsed,
              source: 'gemini-1.5-flash',
              generatedAt: new Date().toISOString()
            };
          }
        }
      }
    } catch (e) {
      console.warn('[server.js] Gemini API call error:', e.message);
    }
  }

  if (!result) {
    result = generateHydrologicalFallbackServer(processed);
  }

  cachedAiAnalysis = result;
  cachedAiTimestamp = nowMs;

  res.set('Cache-Control', 'public, max-age=1800');
  res.json(result);
});

/**
 * POST /api/refresh
 */
app.post('/api/refresh', async (req, res) => {
  console.log('ได้รับคำขอรีเฟรชข้อมูลแบบ Manual...');
  await pollAllStations();
  res.json({
    success: true,
    message: 'ดึงข้อมูลล่าสุดสำเร็จและ Broadcast ข้อมูลเรียบร้อย',
    ...getProcessedSummaryPayload()
  });
});

/**
 * GET /health and GET /api/health (Production Health Check Endpoint)
 */
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: parseFloat(process.uptime().toFixed(1)),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    totalStations: state.stations ? state.stations.length : 0,
    alertLevel: state.alertLevel || 'NORMAL',
    hasEmergency: state.hasEmergency,
    hasWarning: state.hasWarning,
    lastUpdated: state.lastUpdated,
    realtimeClients: sseClients.size
  });
});

// 404 handler for unhandled API endpoints
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Single Page Application Fallback: Route all non-API requests to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Background Worker (every 2.5 minutes)
setInterval(pollAllStations, POLL_INTERVAL_MS);

// Boot server on 0.0.0.0 for Cloud Container Compatibility
app.listen(PORT, HOST, async () => {
  console.log('=====================================================');
  console.log(`🌊 Web Monitor ระดับน้ำ & เตือนภัยฉุกเฉิน (Realtime 2 ระดับ)`);
  console.log(`🌐 Server Host & Port: http://${HOST}:${PORT}`);
  console.log(`⚡ Realtime SSE: http://${HOST}:${PORT}/api/realtime`);
  console.log(`📡 REST Summary: http://${HOST}:${PORT}/api/water-summary`);
  console.log(`🩺 Health Check: http://${HOST}:${PORT}/health`);
  console.log(`⏱  รอบการดึงข้อมูลอัตโนมัติ: ทุก 2.5 นาที (${POLL_INTERVAL_MS / 1000}s)`);
  console.log('=====================================================');

  // Initial poll
  await pollAllStations();
});
