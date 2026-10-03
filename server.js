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
