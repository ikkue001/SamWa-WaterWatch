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

/**
 * Format water difference into friendly conversational Thai for citizens
 * e.g. "ต่ำกว่าตลิ่ง 28 ซม.", "เกินระดับวิกฤติ 12 ซม. (เฝ้าระวัง)", "ล้นตลิ่ง 10 ซม."
 */
function formatFriendlyDiffServer(waterLevel, bankLevel, criticalLevel) {
  if (waterLevel === null || waterLevel === undefined || isNaN(waterLevel)) {
    return 'รอข้อมูลตรวจวัด';
  }
  const lvl = parseFloat(waterLevel);
  const bank = parseFloat(bankLevel);
  const crit = criticalLevel !== null && criticalLevel !== undefined && !isNaN(parseFloat(criticalLevel)) ? parseFloat(criticalLevel) : null;

  if (!isNaN(bank) && lvl >= bank) {
    const diff = parseFloat((lvl - bank).toFixed(2));
    const cm = Math.round(diff * 100);
    if (cm === 0) return 'แตะระดับตลิ่งพอดี (เสี่ยงล้น)';
    return diff < 1.0 ? `ล้นตลิ่ง ${cm} ซม.` : `ล้นตลิ่ง ${diff.toFixed(2)} ม.`;
  }

  if (crit !== null && lvl >= crit) {
    const diffCrit = parseFloat((lvl - crit).toFixed(2));
    const cmCrit = Math.round(diffCrit * 100);
    return diffCrit < 1.0 ? `เกินระดับวิกฤติ ${cmCrit} ซม. (เฝ้าระวัง)` : `เกินระดับวิกฤติ ${diffCrit.toFixed(2)} ม. (เฝ้าระวัง)`;
  }

  if (!isNaN(bank)) {
    const diffBank = parseFloat((bank - lvl).toFixed(2));
    const cmBank = Math.round(diffBank * 100);
    return diffBank < 1.0 ? `ต่ำกว่าตลิ่ง ${cmBank} ซม.` : `ต่ำกว่าตลิ่ง ${diffBank.toFixed(2)} ม.`;
  }

  return 'ระดับปกติ';
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
    diffText: formatFriendlyDiffServer(cfg.defaultWarning, cfg.defaultBank, cfg.defaultCritical),
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

    // Format friendly citizen-oriented diff text
    if (!s.isGate) {
      s.diffText = formatFriendlyDiffServer(s.waterLevel, s.bankLevel, s.criticalLevel);
    } else if (s.isGate && s.inside && s.outside) {
      if (s.inside.bank && s.inside.level !== undefined && s.inside.level !== null) {
        s.inside.diffText = formatFriendlyDiffServer(s.inside.level, s.inside.bank, s.inside.critical);
      }
      if (s.outside.bank && s.outside.level !== undefined && s.outside.level !== null) {
        s.outside.diffText = formatFriendlyDiffServer(s.outside.level, s.outside.bank, s.outside.critical);
      }
    }
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
    thaiwaterId: 37,
    uuid: null,
    bmaId: null,
    source: 'ThaiWater',
    name: 'คลองหกวา ลำลูกกา คลอง 8',
    canal: 'คลองหกวา',
    bankLevel: 2.71,
    criticalLevel: 2.41,
    fallbackLevel: 1.92
  },
  'bma_wf_k0801': {
    stCode: 'ST-2',
    id: 'bma_wf_k0801',
    thaiwaterId: null,
    uuid: '69ae363d-80d0-47c0-97c4-14731bb235e1',
    bmaId: null,
    source: 'BMA Waterflow',
    name: 'ปตร.คลองแปด ตอนซอย อบจ.ปทุมธานี 2006',
    canal: 'คลองหกวา',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    fallbackLevel: 1.79
  },
  'bma_wf_khw01': {
    stCode: 'ST-3',
    id: 'bma_wf_khw01',
    thaiwaterId: null,
    uuid: '6bceb086-0008-4910-bda8-d8e618ab3c5d',
    bmaId: null,
    source: 'BMA Waterflow',
    name: 'สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่',
    canal: 'คลองหกวา',
    bankLevel: 2.30,
    criticalLevel: 2.00,
    fallbackLevel: 1.82
  },
  'bma_wf_swa02': {
    stCode: 'ST-4',
    id: 'bma_wf_swa02',
    thaiwaterId: null,
    uuid: '05b29a52-712d-4b90-a4ff-b2c2eb9817ff',
    bmaId: null,
    source: 'BMA Waterflow',
    name: 'คลองสามวา ตอนถนนเทศบาลลำลูกกา 1',
    canal: 'คลองสามวา',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    fallbackLevel: 1.40
  },
  'bma_weather_126': {
    stCode: 'ST-5',
    id: 'bma_weather_126',
    thaiwaterId: null,
    uuid: null,
    bmaId: 126,
    source: 'BMA Weather',
    name: 'คลองพระยาสุเรนทร์ ตอนถนนหนองระแหง',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.60,
    criticalLevel: 1.20,
    fallbackLevel: 1.39
  },
  'bma_weather_125': {
    stCode: 'ST-6',
    id: 'bma_weather_125',
    thaiwaterId: null,
    uuid: null,
    bmaId: 125,
    source: 'BMA Weather',
    name: 'คลองพระยาสุเรนทร์ ตอนถนนจตุโชติ',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.50,
    criticalLevel: 1.20,
    fallbackLevel: 1.37
  },
  'bma_weather_124': {
    stCode: 'ST-7',
    id: 'bma_weather_124',
    thaiwaterId: null,
    uuid: null,
    bmaId: 124,
    source: 'BMA Weather',
    name: 'ปตร.พระยาสุเรนทร์ ตอนคู้บอน',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.30,
    criticalLevel: 0.80,
    fallbackLevel: 0.99
  },
  'bma_weather_127': {
    stCode: 'ST-8',
    id: 'bma_weather_127',
    thaiwaterId: null,
    uuid: null,
    bmaId: 127,
    source: 'BMA Weather',
    name: 'คลองพระยาสุเรนทร์ ตอนปัญญาอินทรา',
    canal: 'คลองพระยาสุเรนทร์',
    bankLevel: 1.40,
    criticalLevel: 1.00,
    fallbackLevel: 1.00
  },
  'bma_weather_21': {
    stCode: 'ST-9',
    id: 'bma_weather_21',
    thaiwaterId: null,
    uuid: null,
    bmaId: 21,
    source: 'BMA Weather',
    name: 'ประตูระบายน้ำคลองสามวา (ถนนประชาร่วมใจ)',
    canal: 'คลองสามวา',
    isGate: true,
    bankLevel: 1.70,
    criticalLevel: 1.30,
    fallbackLevel: 1.39
  }
};

const STATIONS_HISTORY_METADATA = STATIONS_MAP;
const GLOBAL_SERVER_HISTORY_CACHE = new Map();
let serverCachedBmaToken = null;
let serverBmaTokenExpiresAt = 0;

async function getServerBmaWaterflowToken() {
  if (serverCachedBmaToken && Date.now() < serverBmaTokenExpiresAt) {
    return serverCachedBmaToken;
  }
  const res = await fetch('https://bmawaterflow.bangkok.go.th/API/Authentication/Client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://bmawaterflow.bangkok.go.th',
      'Referer': 'https://bmawaterflow.bangkok.go.th/map',
      'User-Agent': 'Mozilla/5.0'
    },
    body: JSON.stringify({
      clientId: 'dds-measure-web',
      clientSecret: 'f1d6cf67-946b-4586-934a-6a770d993983'
    })
  });
  if (!res.ok) throw new Error(`BMA Auth HTTP ${res.status}`);
  const auth = await res.json();
  const token = auth.token;
  if (!token) throw new Error('No token returned');
  serverCachedBmaToken = token;
  serverBmaTokenExpiresAt = Date.now() + 50 * 60 * 1000;
  return token;
}

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
    if (item.thaiwaterId && String(item.thaiwaterId) === q) {
      return item;
    }
  }

}

function parseSafeTime(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') return isNaN(timeStr) ? 0 : timeStr;
  if (timeStr instanceof Date) return isNaN(timeStr.getTime()) ? 0 : timeStr.getTime();

  let cleanStr = timeStr.toString().trim();
  if (!cleanStr) return 0;
  cleanStr = cleanStr.replace(/25(\d{2})/g, (m) => String(parseInt(m, 10) - 543));

  const dmyMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    const hour = dmyMatch[4].padStart(2, '0');
    const minute = dmyMatch[5].padStart(2, '0');
    const second = (dmyMatch[6] || '00').padStart(2, '0');
    cleanStr = `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
  } else {
    if (!cleanStr.includes('Z') && !cleanStr.includes('+')) {
      cleanStr = cleanStr.replace(' ', 'T');
      if (!cleanStr.includes('+') && !cleanStr.includes('Z')) {
        cleanStr = cleanStr + '+07:00';
      }
    }
  }

  const t = new Date(cleanStr).getTime();
  return isNaN(t) ? 0 : t;
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

function parseThaiwaterDateTime(dtStr) {
  if (!dtStr) return null;
  const m = dtStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const h = parseInt(m[4], 10);
  const mi = parseInt(m[5], 10);
  return new Date(Date.UTC(y, mo, d, h - 7, mi));
}

function formatThaiTimeLabel(dateObj) {
  const dThai = new Date(dateObj.getTime() + 7 * 3600 * 1000);
  return String(dThai.getUTCHours()).padStart(2, '0') + ':' + String(dThai.getUTCMinutes()).padStart(2, '0');
}

function sampleHourlyRowsServer(rows, meta, now = new Date()) {
  if (!rows || rows.length === 0) {
    throw new Error(`No telemetry rows for ${meta.stCode}`);
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

  return {
    stationId: meta.stCode,
    id: meta.id,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    unit: 'ม.รทก.',
    source: meta.source,
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
    rawHistory: rows.map(r => ({
      timestamp: r.date.toISOString(),
      time: r.date.toISOString(),
      timeLabel: formatThaiTimeLabel(r.date),
      waterLevel: r.val,
      waterLevelIn: r.valIn,
      waterLevelOut: r.valOut
    })),
    stats: {
      min: minLevel,
      max: maxLevel,
      avg: avgLevel,
      change24h: netChange >= 0 ? `+${netChange.toFixed(2)}` : `${netChange.toFixed(2)}`
    }
  };
}

async function fetchRealThaiwaterHistoryServer(meta, now = new Date()) {
  const url = `https://api-v3.thaiwater.net/api/v1/thaiwater30/iframe/waterlevel_graph?station_type=tele_waterlevel&id=${meta.thaiwaterId || 37}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://pathumthani.thaiwater.net/'
    }
  });

  if (!response.ok) {
    throw new Error(`ThaiWater graph HTTP error ${response.status}`);
  }

  const json = await response.json();
  const rawList = json.data?.graph_data || [];
  const rows = [];

  for (const item of rawList) {
    if (item.value !== null && item.value !== undefined) {
      const val = parseFloat(item.value);
      const d = parseThaiwaterDateTime(item.datetime);
      if (d && !isNaN(val) && val > -50 && val < 50) {
        rows.push({ date: d, val: parseFloat(val.toFixed(2)) });
      }
    }
  }

  if (rows.length === 0) {
    throw new Error('No valid telemetry points from ThaiWater');
  }

  const res = sampleHourlyRowsServer(rows, meta, now);
  GLOBAL_SERVER_HISTORY_CACHE.set(meta.id, res);
  return res;
}

async function fetchRealBmaWaterflowHistoryServer(meta, now = new Date()) {
  const token = await getServerBmaWaterflowToken();
  const startStr = new Date(now.getTime() - 48 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  const stopStr = now.toISOString().replace(/\.\d{3}Z$/, '');

  const url = `https://bmawaterflow.bangkok.go.th/API/DataTransections/Stations/${meta.uuid}?datestart=${startStr}&datestop=${stopStr}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Referer': 'https://bmawaterflow.bangkok.go.th/map'
    }
  });

  if (!response.ok) {
    throw new Error(`BMA Waterflow HTTP error ${response.status}`);
  }

  const json = await response.json();
  const txList = json.transactions || [];
  const rows = [];

  for (const t of txList) {
    if (t.water !== null && t.water !== undefined) {
      const val = parseFloat(t.water);
      const timeStr = t.serverTime || t.siteTime;
      if (timeStr && !isNaN(val) && val > -50 && val < 50) {
        const ms = parseSafeTime(timeStr);
        if (ms > 0) {
          rows.push({ date: new Date(ms), val: parseFloat(val.toFixed(2)) });
        }
      }
    }
  }

  if (rows.length === 0) {
    throw new Error(`No valid transactions from BMA Waterflow ${meta.stCode}`);
  }

  const res = sampleHourlyRowsServer(rows, meta, now);
  GLOBAL_SERVER_HISTORY_CACHE.set(meta.id, res);
  return res;
}

async function fetchRealBmaWeatherHistory(bmaId, meta, now = new Date()) {
  const url = `https://weather.bangkok.go.th/water/StationDetail?id=${bmaId}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://weather.bangkok.go.th/water/'
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
          rows.push({ date: dateObj, val: parseFloat(val.toFixed(2)) });
        }
      }
    }
  }

  if (rows.length === 0) {
    throw new Error(`No telemetry rows parsed from BMA Weather ID ${bmaId}`);
  }

  const res = sampleHourlyRowsServer(rows, meta, now);
  GLOBAL_SERVER_HISTORY_CACHE.set(meta.id, res);
  return res;
}

async function fetchStationHistoryServer(meta, now = new Date()) {
  if (meta.source === 'ThaiWater') {
    return await fetchRealThaiwaterHistoryServer(meta, now);
  }
  if (meta.source === 'BMA Waterflow') {
    return await fetchRealBmaWaterflowHistoryServer(meta, now);
  }
  if (meta.source === 'BMA Weather' && meta.bmaId) {
    return await fetchRealBmaWeatherHistory(meta.bmaId, meta, now);
  }
  throw new Error(`No handler for source: ${meta.source}`);
}

function createSafeBaselineHistoryServer(meta, anchorLevel, now = new Date()) {
  const timestamps = [];
  const timeLabels = [];
  const waterLevels = [];
  const baseLvl = parseFloat(anchorLevel || meta.fallbackLevel);

  for (let i = 24; i >= 0; i--) {
    const ptDate = new Date(now.getTime() - i * 3600 * 1000);
    timestamps.push(ptDate.toISOString());
    timeLabels.push(formatThaiTimeLabel(ptDate));
    waterLevels.push(baseLvl);
  }

  return {
    stationId: meta.stCode,
    id: meta.id,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    unit: 'ม.รทก.',
    source: meta.source,
    criticalThreshold: meta.criticalLevel,
    overflowThreshold: meta.bankLevel,
    criticalLevel: meta.criticalLevel,
    bankLevel: meta.bankLevel,
    currentLevel: baseLvl,
    isEstimated: false,
    trend: 'stable',
    timestamps,
    timeLabels,
    waterLevels,
    rawHistory: timestamps.map((ts, idx) => ({
      timestamp: ts,
      time: ts,
      timeLabel: timeLabels[idx],
      waterLevel: waterLevels[idx]
    })),
    stats: {
      min: baseLvl,
      max: baseLvl,
      avg: baseLvl,
      change24h: '+0.00'
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
  const overflowStations = [];
  const criticalStations = [];

  for (const st of processedStations) {
    const lvl = st.waterLevel !== null && st.waterLevel !== undefined ? parseFloat(st.waterLevel) : null;
    const bank = parseFloat(st.bankLevel) || 2.0;
    const crit = parseFloat(st.criticalLevel) || 1.8;

    if (lvl !== null && !isNaN(lvl)) {
      const ratio = lvl / bank;
      if (ratio > highestRatio) {
        highestRatio = ratio;
        criticalStation = st;
      }
      if (lvl >= bank) {
        overflowCount++;
        overflowStations.push(st.stCode || st.name);
      } else if (lvl >= crit) {
        criticalCount++;
        criticalStations.push(st.stCode || st.name);
      }
    }
  }

  let riskLevel = 'normal';
  let headline = '';
  let analysis = '';
  let trend6h = '';
  let actionAdvice = '';
  let officialContext = '';

  if (overflowCount > 0) {
    riskLevel = 'danger';
    headline = `ระดับน้ำล้นตลิ่งที่ ${overflowStations.join(', ')} เฝ้าระวังน้ำท่วมฉับพลัน`;
    analysis = `มวลน้ำในแนวคลองหกวาตอนบนมีระดับสูงเกินคันตลิ่ง (${overflowStations.join(', ')}) ส่งผลให้การระบายน้ำเข้าสู่คลองพระยาสุเรนทร์และคลองสามวาต้องเร่งระบายน้ำเต็มกำลัง อาจมีน้ำเอ่อล้นเข้าท่วมพื้นที่ลุ่มต่ำริมสองฝั่งคลอง`;
    trend6h = 'เพิ่มขึ้นหรือทรงตัวในระดับสูง (6-12 ชม. ข้างหน้า)';
    actionAdvice = 'ยกเครื่องใช้ไฟฟ้าและทรัพย์สินขึ้นที่สูงทันที เสริมแนวกระสอบทรายในจุดเสี่ยงริมตลิ่ง และเฝ้าระวังผู้สูงอายุ/ผู้ป่วยติดเตียง';
    officialContext = 'สำนักการระบายน้ำ กทม. และกรมชลประทานเดินเครื่องสูบน้ำสถานีคลองหกวาเต็มกำลัง พร้อมเร่งระบายน้ำออกสู่แม่น้ำบางปะกง';
  } else if (criticalCount > 0) {
    riskLevel = 'warning';
    headline = `ระดับน้ำแตะเกณฑ์เฝ้าระวังที่ ${criticalStations.join(', ')} ยังอยู่ในการควบคุม`;
    analysis = `ระดับน้ำในแนวคลองหกวาและคลองพระยาสุเรนทร์แตะเกณฑ์วิกฤติในบางจุด (${criticalStations.join(', ')}) แต่ยังต่ำกว่าระดับตลิ่ง การไหลเวียนของน้ำยังคงดำเนินไปได้โดยการเปิดบานระบาย ปตร.คลองสามวา`;
    trend6h = 'ทรงตัวถึงลดลงเล็กน้อย หากไม่มีฝนตกหนักเพิ่มเติม';
    actionAdvice = 'ตรวจสอบความพร้อมของคันกั้นน้ำรอบที่อยู่อาศัย เคลื่อนย้ายของไวต่อความชื้นขึ้นที่ปลอดภัย และติดตามข่าวสารจาก กทม. ต่อเนื่อง';
    officialContext = 'สำนักการระบายน้ำ กทม. เปิดประตูระบายน้ำคลองสามวาและเดินเครื่องสูบน้ำสถานีปลายคลองพระยาสุเรนทร์เพื่อพร่องน้ำรอรับน้ำฝน';
  } else {
    riskLevel = 'normal';
    headline = 'สถานการณ์น้ำคลองหกวาและคลองสามวาอยู่ในเกณฑ์ปกติ ต่ำกว่าตลิ่งปลอดภัย';
    analysis = 'ระดับน้ำทั้ง 9 สถานีในแนวคลองหกวา คลองพระยาสุเรนทร์ และคลองสามวา อยู่ในเกณฑ์ควบคุมปกติ ต่ำกว่าระดับวิกฤติและตลิ่ง การระบายน้ำไหลเวียนได้ดี ไม่มีมวลน้ำหลากผ่านพื้นที่';
    trend6h = 'ทรงตัวในเกณฑ์ปกติ (6-12 ชม. ข้างหน้า)';
    actionAdvice = 'ดำเนินกิจกรรมในชีวิตประจำวันได้ตามปกติ แนะนำให้ตรวจสอบท่อระบายน้ำรอบบ้านไม่ให้อุดตันด้วยเศษใบไม้หรือขยะ';
    officialContext = 'สนน.กทม. และกรมชลประทานบริหารจัดการน้ำตามเกณฑ์ปกติ พร้อมเฝ้าระวังเรดาร์ฝนกลุ่มเมฆในพื้นที่เขตคลองสามวา';
  }

  return {
    risk_level: riskLevel,
    headline,
    analysis,
    trend_6h: trend6h,
    action_advice: actionAdvice,
    official_context: officialContext,
    riskLevel: riskLevel === 'danger' ? 'วิกฤติ' : (riskLevel === 'warning' ? 'เฝ้าระวัง' : 'ปกติ'),
    riskColor: riskLevel === 'danger' ? 'red' : (riskLevel === 'warning' ? 'amber' : 'emerald'),
    summary: analysis,
    trendPrediction: trend6h,
    sourceNews: officialContext,
    advisory: actionAdvice,
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
  try {
    stationHistory = await fetchStationHistoryServer(targetMeta, now);
  } catch (err) {
    console.warn(`[Server Water History] Real telemetry error for ${targetMeta.stCode}:`, err.message);
    if (GLOBAL_SERVER_HISTORY_CACHE.has(targetMeta.id)) {
      stationHistory = GLOBAL_SERVER_HISTORY_CACHE.get(targetMeta.id);
    } else {
      stationHistory = createSafeBaselineHistoryServer(targetMeta, liveLvl, now);
    }
  }

  // Anchor right-most point to card level 1:1 if available
  if (liveLvl && stationHistory.waterLevels && stationHistory.waterLevels.length > 0) {
    stationHistory.currentLevel = liveLvl;
    stationHistory.waterLevels[stationHistory.waterLevels.length - 1] = liveLvl;
  }

  // Pre-generate map for all 9 stations so the frontend has quick access
  const allStations = {};
  for (const key of Object.keys(STATIONS_MAP)) {
    const m = STATIONS_MAP[key];
    if (m.id === targetMeta.id) {
      allStations[m.id] = stationHistory;
    } else if (GLOBAL_SERVER_HISTORY_CACHE.has(m.id)) {
      allStations[m.id] = GLOBAL_SERVER_HISTORY_CACHE.get(m.id);
    } else {
      const match = processed.find(s => s.id === m.id || s.stCode === m.stCode);
      const lvl = (match && match.waterLevel !== null && match.waterLevel !== undefined) ? match.waterLevel : m.fallbackLevel;
      allStations[m.id] = createSafeBaselineHistoryServer(m, lvl, now);
    }
  }

  res.set('Cache-Control', 'public, max-age=120');
  res.json({
    success: true,
    serverTime: now.toISOString(),
    ...stationHistory,
    selectedStation: stationHistory,
    stations: allStations
  });
});

/**
 * Sanitize and clean Thai text, removing unwanted Chinese/CJK characters (e.g. 排水)
 */
function cleanThaiText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/排水/g, '')
    .replace(/[\u4e00-\u9fa5]/g, '') // ลบตัวอักษรจีนที่อาจหลุดมา
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * GET /api/ai-analysis
 */
app.get('/api/ai-analysis', async (req, res) => {
  const nowMs = Date.now();
  const isForce = req.query.t || req.query.force;
  const rawKey = process.env.GEMINI_API_KEY || '';
  const apiKey = String(rawKey).trim();
  const processed = getProcessedStations();
  const analyzedAt = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });

  // Missing API key (no prefix restriction to support all keys)
  if (!apiKey) {
    console.warn('[server.js] GEMINI_API_KEY is missing.');
    const fallback = generateHydrologicalFallbackServer(processed);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({
      success: false,
      apiError: { message: "GEMINI_API_KEY is not defined in environment" },
      debugEnvFound: false,
      error: 'MISSING_API_KEY',
      message: 'กรุณาใส่ Gemini API Key ใน environment variable',
      modelUsed: 'hydrological-expert-system',
      analyzedAt,
      ...fallback
    });
  }

  if (!isForce && cachedAiAnalysis && (nowMs - cachedAiTimestamp < AI_CACHE_DURATION_MS)) {
    res.set('Cache-Control', 'public, max-age=1800');
    return res.json(cachedAiAnalysis);
  }

  let result = null;

  try {
    const criticalOrOverflow = processed.filter(s => {
      const lvl = Number(s.waterLevel);
      const crit = Number(s.criticalLevel);
      const bank = Number(s.bankLevel);
      return !isNaN(lvl) && ((crit && lvl >= crit) || (bank && lvl >= bank));
    });

    const promptText = `วิเคราะห์สถานการณ์น้ำสดสำหรับเขตคลองสามวาและรอยต่อ: สรุปสั้น กระชับ 2 ประโยค พร้อมคำแนะนำประชาชน
จากข้อมูลโทรมาตร 9 สถานีล่าสุด:
${JSON.stringify({
  stations_telemetry: processed.map(s => ({
    code: s.stCode,
    name: s.name,
    canal: s.canal,
    water_level_m: s.waterLevel !== null && s.waterLevel !== undefined ? Number(s.waterLevel) : null,
    critical_level_m: Number(s.criticalLevel) || null,
    bank_level_m: Number(s.bankLevel) || null,
    trend: s.trend || 'STABLE'
  })),
  critical_or_overflow_count: criticalOrOverflow.length,
  critical_or_overflow_stations: criticalOrOverflow.map(s => `${s.stCode} ${s.name}`)
}, null, 2)}

ข้อบังคับสำคัญ: ต้องตอบเป็นภาษาไทยล้วน 100% เท่านั้น ห้ามมีภาษาจีน ตัวอักษรจีน (เช่น 排水) หรือภาษาอื่นปนในเนื้อหาโดยเด็ดขาด สำหรับคำว่าการระบายน้ำ ให้ใช้คำภาษาไทยว่า 'การระบายน้ำ' เสมอ

ตอบกลับในรูปแบบ JSON ตามโครงสร้างนี้เท่านั้น:
{
  "risk_level": "normal" | "warning" | "danger",
  "headline": "หัวข้อสรุปสั้นกระชับ ไม่เกิน 15 คำ",
  "analysis": "บทวิเคราะห์สรุปแนวโน้มน้ำและการไหล 2-3 ประโยค",
  "trend_6h": "แนวโน้ม 6-12 ชม. ข้างหน้า (เพิ่มขึ้น / ทรงตัว / ลดลง)",
  "action_advice": "คำแนะนำเชิงรุกสำหรับประชาชนในพื้นที่",
  "official_context": "บริบทประกาศจาก สนน.กทม. หรือ กรมชลประทานที่เกี่ยวข้อง"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: promptText
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
    });

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidateText) {
        let cleaned = candidateText.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        let parsed = null;
        try {
          parsed = JSON.parse(cleaned);
        } catch (_) {
          const lines = cleaned.split('\n').filter(Boolean);
          parsed = {
            headline: lines[0] || 'สรุปสถานการณ์น้ำสดเขตคลองสามวา',
            analysis: lines.slice(0, 2).join(' ') || cleaned,
            action_advice: lines.slice(2).join(' ') || 'ติดตามสถานการณ์น้ำอย่างต่อเนื่อง',
            risk_level: 'normal',
            trend_6h: 'ทรงตัวในเกณฑ์ปกติ'
          };
        }

        let risk = 'normal';
        const rawRisk = String(parsed.risk_level || parsed.riskLevel || '').toLowerCase();
        if (rawRisk.includes('danger') || rawRisk.includes('วิกฤติ') || rawRisk.includes('emergency')) {
          risk = 'danger';
        } else if (rawRisk.includes('warn') || rawRisk.includes('เฝ้าระวัง') || rawRisk.includes('เสี่ยง')) {
          risk = 'warning';
        }

        const headlineClean = cleanThaiText(parsed.headline || 'สรุปสถานการณ์น้ำเขตคลองสามวาและแนวคลองหกวา');
        const analysisClean = cleanThaiText(parsed.analysis || '');
        const trendClean = cleanThaiText(parsed.trend_6h || 'ทรงตัวในเกณฑ์ปกติ');
        const adviceClean = cleanThaiText(parsed.action_advice || 'ติดตามข้อมูลข่าวสารอย่างต่อเนื่อง');
        const contextClean = cleanThaiText(parsed.official_context || 'สนน.กทม. และกรมชลประทานร่วมบริหารจัดการน้ำ');

        result = {
          success: true,
          apiError: null,
          debugEnvFound: true,
          modelUsed: 'gemini-3.5-flash-lite',
          source: 'gemini-3.5-flash-lite',
          risk_level: risk,
          headline: headlineClean,
          analysis: analysisClean,
          trend_6h: trendClean,
          action_advice: adviceClean,
          official_context: contextClean,
          analyzedAt,
          riskLevel: risk === 'danger' ? 'วิกฤติ' : (risk === 'warning' ? 'เฝ้าระวัง' : 'ปกติ'),
          riskColor: risk === 'danger' ? 'red' : (risk === 'warning' ? 'amber' : 'emerald'),
          summary: analysisClean,
          trendPrediction: trendClean,
          sourceNews: contextClean,
          advisory: adviceClean,
          generatedAt: new Date().toISOString()
        };
      }
    } else {
      let errorData = null;
      const rawErr = await geminiRes.text();
      try {
        errorData = JSON.parse(rawErr);
      } catch (_) {
        errorData = { status: geminiRes.status, statusText: geminiRes.statusText, message: rawErr };
      }
      console.warn(`[server.js] Gemini API HTTP ${geminiRes.status}:`, errorData);
      const fallback = generateHydrologicalFallbackServer(processed);
      res.set('Cache-Control', 'no-store');
      return res.json({
        success: false,
        apiError: errorData,
        debugEnvFound: !!apiKey,
        status: geminiRes.status,
        error: `GEMINI_HTTP_${geminiRes.status}`,
        message: typeof errorData?.error?.message === 'string' ? errorData.error.message : `Gemini API Error (${geminiRes.status})`,
        modelUsed: "hydrological-expert-system",
        analyzedAt,
        ...fallback
      });
    }
  } catch (e) {
    console.warn('[server.js] Gemini API call error:', e.message);
    const fallback = generateHydrologicalFallbackServer(processed);
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: false,
      apiError: { message: e.message, stack: e.stack },
      debugEnvFound: !!apiKey,
      error: 'GEMINI_CALL_FAILED',
      message: e.message,
      modelUsed: 'hydrological-expert-system',
      analyzedAt,
      ...fallback
    });
  }

  if (!result) {
    const fallback = generateHydrologicalFallbackServer(processed);
    result = {
      success: false,
      apiError: { message: "Empty candidate text returned from Gemini API" },
      debugEnvFound: !!apiKey,
      error: 'GEMINI_CALL_FAILED',
      message: 'ไม่สามารถเรียกใช้ Gemini API ได้ กำลังใช้งานระบบประเมินอุทกวิทยาอัตโนมัติ',
      modelUsed: 'hydrological-expert-system',
      analyzedAt,
      ...fallback
    };
  }

  cachedAiAnalysis = result;
  cachedAiTimestamp = nowMs;

  res.set('Cache-Control', result.success ? 'public, max-age=1800' : 'no-store');
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
