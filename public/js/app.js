/**
 * Frontend Controller for Flood Emergency Web Monitor (9 Stations)
 * Full-stack implementation supporting:
 * - Realtime Persistent Connection via Server-Sent Events (SSE)
 * - Refactored Alert Banners (Warning & Emergency) with Responsive Station Cards/Badges
 * - Canal-based Smart GPS Sorting (Detects nearest canal group, displays Upstream -> Downstream)
 * - Pinned Priority Section (4 Key Border Stations: Khlong 8, Khlong Hokwa, Khlong Sam Wa)
 * - Haversine Formula for distance calculation
 * - Visual Alerts Only (No audio alerts or browser notification requests)
 */

const CANAL_GROUPS_META = {
  'khlong-hokwa': {
    id: 'khlong-hokwa',
    name: 'สายคลองหกวา - คลองแปด',
    shortName: 'คลองหกวา - คลองแปด',
    directionNote: 'แนวคลองระบายน้ำเชื่อมต่อปทุมธานี ลำลูกกา และคลองแปด',
    flowLabel: 'แนวคลองหกวา (ตะวันออก ➡️ ตะวันตก)',
    color: 'blue'
  },
  'khlong-phraya-suren': {
    id: 'khlong-phraya-suren',
    name: 'สายคลองพระยาสุเรนทร์',
    shortName: 'คลองพระยาสุเรนทร์ (ต้นน้ำ ➡️ ปลายน้ำ)',
    directionNote: 'แนวระบายน้ำหลักจากคลองหกวา (หนองระแหง) ไหลลงสู่บางชันและคลองแสนแสบ',
    flowLabel: 'ทิศทางการไหลของน้ำ: จากเหนือลงใต้ (ต้นคลอง ➡️ ท้ายคลอง)',
    color: 'indigo'
  },
  'khlong-sam-wa': {
    id: 'khlong-sam-wa',
    name: 'สายคลองสามวา',
    shortName: 'คลองสามวา',
    directionNote: 'แนวคลองเชื่อมต่อเทศบาลลำลูกกา 1 สู่พื้นที่เขตคลองสามวา',
    flowLabel: 'แนวคลองสามวา',
    color: 'emerald'
  },
  'bma-main': {
    id: 'bma-main',
    name: 'จุดวัดหลัก กทม.',
    shortName: 'จุดวัดหลัก กทม.',
    directionNote: 'จุดควบคุมประตูระบายน้ำหลักระบบโทรมาตร กทม.',
    flowLabel: 'จุดควบคุมโทรมาตร กทม.',
    color: 'purple'
  }
};

/**
 * Canonical Pinned Priority Stations (ST-1 to ST-4)
 * Guaranteed fallback data so Section 2 cards never crash or get stuck on 'กำลังโหลด...'
 */
const CANONICAL_PINNED_STATIONS = [
  {
    id: 'thaiwater_k8',
    stCode: 'ST-1',
    stationCode: 'K.8',
    name: 'คลองหกวา ลำลูกกา คลอง 8',
    location: 'ต.ลำลูกกา อ.ลำลูกกา จ.ปทุมธานี',
    bankLevel: 2.71,
    criticalLevel: 2.41,
    lat: 13.9416,
    lng: 100.77499,
    sourceUrl: 'https://pathumthani.thaiwater.net/wl#close'
  },
  {
    id: 'bma_wf_k0801',
    stCode: 'ST-2',
    stationCode: 'WL.K08.01',
    name: 'ปตร.คลองแปด ตอนซอย อบจ.ปทุมธานี 2006',
    location: 'ปตร.คลองแปดสายกลาง ปทุมธานี-กทม.',
    bankLevel: 2.0,
    criticalLevel: 1.8,
    lat: 13.9378,
    lng: 100.7706,
    sourceUrl: 'https://bmawaterflow.bangkok.go.th/map'
  },
  {
    id: 'bma_wf_khw01',
    stCode: 'ST-3',
    stationCode: 'WL.KHW.01',
    name: 'สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่',
    location: 'ถนนนิมิตใหม่ คลองสามวา',
    bankLevel: 2.3,
    criticalLevel: 2.0,
    lat: 13.93354,
    lng: 100.7506,
    sourceUrl: 'https://bmawaterflow.bangkok.go.th/map'
  },
  {
    id: 'bma_wf_swa02',
    stCode: 'ST-4',
    stationCode: 'WL.SWA.02',
    name: 'คลองสามวา ตอนถนนเทศบาลลำลูกกา 1',
    location: 'รอยต่อลำลูกกา - คลองสามวา',
    bankLevel: 2.0,
    criticalLevel: 1.8,
    lat: 13.92929,
    lng: 100.7259,
    sourceUrl: 'https://bmawaterflow.bangkok.go.th/map'
  }
];

/**
 * Returns canonical or fallback official source URL for any station
 */
function getStationSourceUrl(station) {
  if (!station) return 'https://dds.bangkok.go.th';
  if (station.sourceUrl) return station.sourceUrl;
  if (station.url) return station.url;

  const id = station.id || '';
  const numId = station.stationId || (id.startsWith('bma_weather_') ? id.replace('bma_weather_', '') : null);
  if (numId && !isNaN(parseInt(numId, 10))) {
    return `https://weather.bangkok.go.th/water/StationDetail?id=${numId}`;
  }

  if (station.source === 'ThaiWater' || id === 'thaiwater_k8' || id.includes('thaiwater')) {
    return 'https://pathumthani.thaiwater.net/wl#close';
  }

  if (station.source === 'BMA Waterflow' || id.startsWith('bma_wf_')) {
    return 'https://bmawaterflow.bangkok.go.th/map';
  }

  return 'https://dds.bangkok.go.th';
}

function formatWaterLevel(val) {
  if (val === null || val === undefined || val === '') return '--';
  const num = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(num) ? '--' : num.toFixed(2);
}

/**
 * Returns formatted canal badge HTML for station cards
 */
function getCanalBadgeHtml(station) {
  if (!station) return '';
  const canalId = station.canalGroupId;
  let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
  let label = station.canalGroupName || station.canal || 'สายคลอง';

  if (canalId === 'khlong-phraya-suren') {
    colorClass = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    label = 'สายคลองพระยาสุเรนทร์';
  } else if (canalId === 'khlong-sam-wa') {
    colorClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    label = 'สายคลองสามวา';
  } else if (canalId === 'khlong-hokwa') {
    colorClass = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
    label = 'สายคลองหกวา';
  } else if (canalId === 'bma-main') {
    colorClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    label = 'จุดวัดหลัก กทม.';
  }

  return `<span class="px-2 py-0.5 rounded text-[10px] font-bold border ${colorClass} font-sans shrink-0">[${label}]</span>`;
}

let appState = {
  hasEmergency: false,
  hasWarning: false,
  alertLevel: 'NORMAL', // NORMAL | WARNING | EMERGENCY
  emergencyReason: '',
  warningReason: '',
  lastUpdated: null,
  nextPollTime: null,
  stations: [],
  userCoords: { lat: 13.8831, lng: 100.7107 }, // Default center: Khlong Sam Wa / Sai Mai / Lam Luk Ka border
  nearestStation: null,
  nearestCanalGroup: null,
  isJunctionArea: false,
  junctionCanalGroupIds: [],
  junctionCanalNames: [],
  selectedCanalTab: null, // user selected tab or auto-detected
  realtimeConnected: false,
  hasRenderedOnce: false
};

let countdownSeconds = 150;
let countdownTimer = null;
let sseConnection = null;

// Leaflet Map state
let leafletMap = null;
let mapStationMarkers = {};
let mapUserMarker = null;
let mapProximityCircle = null;
let mapJunctionPolylines = [];
const popupHistoryCache = new Map();

// Centralized Popup Chart & History Instance Lifecycle
window.activePopupCharts = window.activePopupCharts || {};
window.cachedStationHistory = window.cachedStationHistory || {};
window.currentOpenPopupStationId = null;
window.mainTrendChart = null;

// Haversine Formula for distance calculation in kilometers
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(distKm) {
  if (distKm === null || distKm === undefined || isNaN(distKm)) return '';
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} ม.`;
  }
  return `${distKm.toFixed(1)} กม.`;
}

/**
 * Format station titles with non-breaking spaces and word-break protection
 * Prevents orphan words like "ซอย", "2006", "ใหม่", "1" from wrapping onto their own lines.
 */
function formatStationTitle(name) {
  if (!name) return '';
  return name
    .replace(/ตอนซอย\s+อบจ\.ปทุมธานี\s+2006/g, 'ตอนซอย&nbsp;อบจ.ปทุมธานี&nbsp;2006')
    .replace(/อบจ\.ปทุมธานี\s+2006/g, 'อบจ.ปทุมธานี&nbsp;2006')
    .replace(/ซอย\s+อบจ\./g, 'ซอย&nbsp;อบจ.')
    .replace(/นิมิตใหม่/g, '<span class="inline-block">นิมิตใหม่</span>')
    .replace(/เทศบาลลำลูกกา\s+1/g, 'เทศบาลลำลูกกา&nbsp;1')
    .replace(/ลำลูกกา\s+1/g, 'ลำลูกกา&nbsp;1')
    .replace(/คลอง\s+8/g, 'คลอง&nbsp;8');
}

/**
 * Safely parse any timestamp to Epoch Milliseconds (UTC+7 / Asia/Bangkok).
 * Handles Thai Buddhist era (256x -> 202x), DD/MM/YYYY, ISO strings, and missing timezone offsets.
 */
function parseSafeTime(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') return isNaN(timeStr) ? 0 : timeStr;
  if (timeStr instanceof Date) return isNaN(timeStr.getTime()) ? 0 : timeStr.getTime();

  let cleanStr = timeStr.toString().trim();
  if (!cleanStr) return 0;

  // หากมีปี พ.ศ. (256x หรือ 25xx) ให้แปลงเป็น ค.ศ. (202x)
  cleanStr = cleanStr.replace(/25(\d{2})/g, (m) => String(parseInt(m, 10) - 543));

  // รองรับ format DD/MM/YYYY HH:mm(:ss)
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
    // หากไม่มี Timezone กำกับ ให้เติม +07:00 (เวลาประเทศไทย UTC+7)
    if (!cleanStr.includes('Z') && !cleanStr.includes('+')) {
      cleanStr = cleanStr.replace(' ', 'T');
      if (!cleanStr.includes('+') && !cleanStr.includes('Z')) {
        cleanStr = cleanStr + '+07:00';
      }
    }
  }

  const t = new Date(cleanStr).getTime();
  if (!isNaN(t)) return t;

  if (typeof parseStationTimestamp === 'function') {
    const d = parseStationTimestamp(timeStr);
    if (d && !isNaN(d.getTime())) return d.getTime();
  }

  return 0;
}
window.parseSafeTime = parseSafeTime;

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

  const rawTimeStr = station.lastValidTime || station.updatedAt || station.time || station.timestamp || station.timestamp;
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
 * Update Header Live Clock immediately without waiting for API response
 */
function updateHeaderTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';

  const timeEl = document.getElementById('lastUpdatedTime') ||
                 document.getElementById('current-time') ||
                 document.querySelector('.header-time');
  if (timeEl) {
    if (appState && appState.lastUpdated) {
      const d = new Date(appState.lastUpdated);
      timeEl.textContent = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } else {
      timeEl.textContent = timeStr;
    }
  }

  const timeMobileEl = document.getElementById('lastUpdatedTimeMobile');
  if (timeMobileEl) {
    if (appState && appState.lastUpdated) {
      const d = new Date(appState.lastUpdated);
      timeMobileEl.textContent = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } else {
      timeMobileEl.textContent = timeStr;
    }
  }
}
window.updateHeaderTime = updateHeaderTime;

/**
 * Auto-Fetch on First Load Core Wrappers (Decoupled & Fault-Tolerant)
 */
async function fetchAllStationData() {
  try {
    return await fetchWaterSummary();
  } catch (err) {
    console.error('Failed to load stations in fetchAllStationData:', err);
    markPinnedCardsNoData();
    if (!appState.hasRenderedOnce) {
      appState.hasRenderedOnce = true;
      renderSection1SmartCanalGPS();
      renderSection2PinnedPriority();
      renderSection3AllCanals();
    }
    return null;
  }
}
window.fetchAllStationData = fetchAllStationData;

async function fetchAiAnalysis(forceRefresh = false) {
  try {
    return await loadAiAnalysis(forceRefresh);
  } catch (err) {
    console.error('Failed to load AI in fetchAiAnalysis:', err);
    renderAiFallback(err);
    return null;
  }
}
window.fetchAiAnalysis = fetchAiAnalysis;

async function fetchWaterHistory(stationCodeOrId = 'ST-1') {
  try {
    await loadChartJs();
    const target = ALL_CHART_STATIONS.find(s => s.stCode === stationCodeOrId || s.id === stationCodeOrId) || ALL_CHART_STATIONS[0];
    const stationId = target ? target.id : (stationCodeOrId || 'thaiwater_k8');
    currentChartStationId = stationId;
    await selectStationChart(stationId);
  } catch (err) {
    console.error('Failed to load chart history in fetchWaterHistory:', err);
    renderChartFallbackMessage();
  }
}
window.fetchWaterHistory = fetchWaterHistory;

function startRefreshTimer() {
  resetCountdown(120);
  startCountdownTimer();
}
window.startRefreshTimer = startRefreshTimer;

let appInitialized = false;

async function initializeApplication() {
  if (appInitialized) return;
  appInitialized = true;

  // 1. เริ่มเวลานาฬิกา Header ทันที ไม่ต้องรอข้อมูล
  updateHeaderTime();
  if (!window._headerTimeInterval) {
    window._headerTimeInterval = setInterval(updateHeaderTime, 1000);
  }

  if (window.lucide) {
    try { window.lucide.createIcons(); } catch (e) {}
  }

  try {
    setupEventListeners();
  } catch (err) {
    console.error('Error in setupEventListeners:', err);
  }

  // Initialize Interactive Map (Leaflet & OSM with guard check)
  try {
    initLeafletMap();
  } catch (err) {
    console.error('Error in initLeafletMap:', err);
  }

  // Connect Realtime SSE Stream
  try {
    initRealtimeSSE();
  } catch (err) {
    console.warn('Realtime SSE error:', err);
  }

  // Recalculate distances based on default Sam Wa center coords
  try {
    recalculateDistances();
  } catch (err) {}

  // 2. ดึงข้อมูลสถานีและแผนที่ (แยกอิสระ)
  try {
    await fetchAllStationData();
  } catch (err) {
    console.error('Failed to load stations:', err);
  }

  // 3. ดึงบทวิเคราะห์ AI (แยกอิสระ)
  try {
    await fetchAiAnalysis();
  } catch (err) {
    console.error('Failed to load AI:', err);
    renderAiFallback(err);
  }

  // 4. ดึงข้อมูลกราฟ (แยกอิสระ)
  try {
    await fetchWaterHistory('ST-1');
  } catch (err) {
    console.error('Failed to load chart history:', err);
    renderChartFallbackMessage();
  }

  // 5. แล้วค่อยเริ่มจับเวลานับถอยหลังรอบถัดไป
  try {
    startRefreshTimer();
  } catch (err) {}
}

// Immediate execution check: If DOM is already loaded/interactive, run immediately without waiting!
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
  initializeApplication();
}

/**
 * Setup Realtime SSE Persistent Connection or Cloudflare Edge Polling Fallback
 */
function initRealtimeSSE() {
  if (!('EventSource' in window)) {
    console.warn('Browser does not support EventSource (SSE). Falling back to edge polling.');
    updateRealtimeBadge('edge_live');
    setInterval(fetchWaterSummary, 120000);
    return;
  }

  if (sseConnection) {
    sseConnection.close();
  }

  updateRealtimeBadge('connecting');
  sseConnection = new EventSource('/api/realtime?_t=' + Date.now());

  sseConnection.onopen = () => {
    appState.realtimeConnected = true;
    updateRealtimeBadge('connected');
    console.log('[Realtime Stream]: เชื่อมต่อ Persistent Connection สำเร็จ (🟢 Live Connected)');
  };

  sseConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      applyDataUpdate(data);
      console.log(`[Realtime Update]: ${data.broadcastReason || 'update'} | Alert: ${data.alertLevel}`);
    } catch (e) {
      // ignore heartbeats
    }
  };

  sseConnection.onerror = () => {
    // If running on Cloudflare Pages / serverless edge, gracefully switch to Edge Polling (120s)
    if (!appState.pollingFallbackActive) {
      appState.pollingFallbackActive = true;
      if (sseConnection) {
        sseConnection.close();
        sseConnection = null;
      }
      updateRealtimeBadge('edge_live');
      setInterval(fetchWaterSummary, 120000);
      console.log('[Cloudflare Edge]: สลับสู่โหมด Edge CDN Polling ทุก 2 นาที (120s)');
    }
  };
}

/**
 * Update Realtime Connection Pill in UI
 */
function updateRealtimeBadge(status) {
  const badge = document.getElementById('realtimeConnectionBadge');
  if (!badge) return;
  badge.classList.add('hidden');
}

/**
 * Apply updated data to appState and re-render
 */
function applyDataUpdate(data) {
  appState.hasEmergency = data.hasEmergency;
  appState.hasWarning = data.hasWarning;
  appState.alertLevel = data.alertLevel;
  appState.emergencyReason = data.emergencyReason;
  appState.warningReason = data.warningReason;
  appState.lastUpdated = data.lastUpdated;
  appState.stations = data.stations || [];

  // Evaluate dynamic staleness based on current client time (> 60 minutes or invalid/missing values)
  const now = new Date();
  appState.stations.forEach(station => {
    const staleness = evaluateStationStaleness(station, now);
    station.isStale = staleness.isStale;
    station.staleMinutes = staleness.minutesDiff;
    station.staleText = staleness.staleText;

    // Explicitly guarantee isCritical boolean on all stations (protects ST-5 against missing flags/type mismatches)
    const rawLvl = station.waterLevel !== null && station.waterLevel !== undefined ? parseFloat(station.waterLevel) : null;
    const critLvl = station.criticalLevel !== null && station.criticalLevel !== undefined ? parseFloat(station.criticalLevel) : null;
    const isCritNum = (rawLvl !== null && critLvl !== null && !isNaN(rawLvl) && !isNaN(critLvl) && rawLvl >= critLvl);
    station.isCritical = Boolean(station.isCritical || station.isWarning || station.isOverflow || isCritNum);
  });

  recalculateDistances();

  // On initial load, render Section 1 & Section 3 while keeping Section 2 updated in-place (CLS = 0)
  if (!appState.hasRenderedOnce) {
    appState.hasRenderedOnce = true;
    renderSection1SmartCanalGPS();
    renderSection3AllCanals();
    updateExistingCardsIfPresent(appState.stations);
  } else {
    // Try updating in-place first for smooth water height transition
    const updatedInPlace = updateExistingCardsIfPresent(appState.stations);
    if (!updatedInPlace) {
      renderAllSections();
    }
  }

  updateMapMarkers();
  handleTwoTierAlerts();
  updateHeaderStatus();
  resetCountdown(120);

  // 2. วาดกราฟซ้ำอัตโนมัติเมื่อข้อมูลอัปเดต (Auto Re-render Open Popup)
  if (window.currentOpenPopupStationId) {
    const openSt = appState.stations.find(s => s.id === window.currentOpenPopupStationId || s.stCode === window.currentOpenPopupStationId);
    if (openSt) {
      setTimeout(() => renderStationPopupSparkline(openSt), 60);
    }
  }
}

/**
 * คำนวณสัดส่วนความสูงของหลอดน้ำ (Gauge Math Calculation) ตามสเกลจริง 100%
 * @param {number|null} current ระดับน้ำปัจจุบัน (ม.รทก.)
 * @param {number} critical ระดับวิกฤติ (ม.รทก.)
 * Unified Gauge Scale Math
 * Calculates percentage positions from bottom (0% to 100%) for water fill, critical line, and overflow line.
 * Guaranteed bottom-anchored scale math:
 *  - When current < critical => waterPct < criticalPct
 *  - When current == critical => waterPct == criticalPct
 *  - When current > critical => waterPct > criticalPct (water mass clearly rises above the critical line)
 *  - When current >= overflow => waterPct >= overflowPct (water mass overflows the bank line)
 */
/**
 * บังคับเขียนฟังก์ชันคำนวณสเกลแบบสัมบูรณ์ (Zero-Failure Gauge Logic)
 * คำนวณความสูง (เป็น % จากฐานล่าง bottom)
 */
function calculateGauge(station) {
  if (!station) station = {};
  const current = Number(station.currentLevel || station.waterLevel || station.level || station.value || 0);
  const critical = Number(station.criticalThreshold || station.criticalLevel || station.critical || (current + 0.3));
  const overflow = Number(station.overflowThreshold || station.bankLevel || station.overflow || station.bank || (critical + 0.2));

  // กำหนดสเกลความสูงของหลอด:
  // จุดต่ำสุด = ต่ำกว่าค่าน้ำจริงและค่าวิกฤติลงไปอย่างน้อย 0.5 เมตร
  const minVal = Math.min(current, critical) - 0.5;
  // จุดสูงสุด = สูงกว่าระดับตลิ่งขึ้นไป 0.2 เมตร
  const maxVal = overflow + 0.2;
  const range = maxVal - minVal;

  const toPct = (val) => Math.min(98, Math.max(8, ((val - minVal) / range) * 100));

  const waterPct = toPct(current).toFixed(1);
  const criticalPct = toPct(critical).toFixed(1);
  const overflowPct = toPct(overflow).toFixed(1);

  // พิมพ์ตรวจสอบในคอนโซล F12
  console.log(`[Gauge] ${station.id || station.name}:`, { current, critical, overflow, waterPct, criticalPct });

  return { current, critical, overflow, waterPct, criticalPct, overflowPct };
}
window.calculateGauge = calculateGauge;
window.getGaugeScales = calculateGauge;

function getSluiceGateSideScales(station, side) {
  const sideData = side === 'inside' ? station?.inside : station?.outside;
  const isSt9 = station?.stCode === 'ST-9' || station?.id === 'bma_weather_21';
  const defaults = side === 'inside'
    ? { critical: 0.80, overflow: 1.30 }
    : { critical: 1.30, overflow: 1.70 };

  const currentLevel = sideData?.level ?? sideData?.waterLevel ?? (side === 'inside' ? station?.insideLevel : station?.outsideLevel);
  const criticalThreshold = isSt9 ? defaults.critical : (sideData?.critical ?? defaults.critical);
  const overflowThreshold = isSt9 ? defaults.overflow : (sideData?.bank ?? defaults.overflow);

  return calculateGauge({
    id: `${station?.id || 'ST-9'}-${side}`,
    name: `${station?.name || 'ปตร.คลองสามวา'} (${side === 'inside' ? 'ด้านใน' : 'ด้านนอก'})`,
    currentLevel,
    criticalThreshold,
    overflowThreshold
  });
}
window.getSluiceGateSideScales = getSluiceGateSideScales;

function calculateGaugePcts(current, critical, overflow, base, warning) {
  const scales = calculateGauge({
    currentLevel: current,
    criticalThreshold: critical,
    overflowThreshold: overflow
  });
  return {
    current: scales.current,
    critical: scales.critical,
    overflow: scales.overflow,
    waterPct: scales.waterPct,
    criticalPct: scales.criticalPct,
    overflowPct: scales.overflowPct
  };
}
window.calculateGaugePcts = calculateGaugePcts;

/**
 * Update existing station cards in place so CSS height transitions smoothly
 * Replaces card contents without rebuilding DOM nodes to eliminate CLS
 */
function updateExistingCardsIfPresent(stations) {
  if (!stations || stations.length === 0) return false;
  const anyCard = document.querySelector('[data-station-fill], [data-station-inside-fill], [data-station-card]');
  if (!anyCard) return false;

  stations.forEach(station => {
    try {
      if (!station) return;

      // 1. Sluice Gate Station Dual-Side In-Place Updates
      if (station.isGate && station.inside && station.outside) {
        const inScales = getSluiceGateSideScales(station, 'inside');
        const outScales = getSluiceGateSideScales(station, 'outside');

        let inFillGrad = inScales.current >= inScales.overflow && inScales.overflow > 0
          ? 'from-rose-600 to-red-500'
          : (inScales.current >= inScales.critical && inScales.critical > 0 ? 'from-amber-600 to-amber-400' : 'from-cyan-600 to-cyan-400');

        let outFillGrad = outScales.current >= outScales.overflow && outScales.overflow > 0
          ? 'from-rose-600 to-red-500'
          : (outScales.current >= outScales.critical && outScales.critical > 0 ? 'from-amber-600 to-amber-400' : 'from-cyan-600 to-cyan-400');

        const rawInLvl = station.inside?.level ?? station.inside?.waterLevel ?? null;
        const inLvl = (rawInLvl !== null && rawInLvl !== undefined && !isNaN(parseFloat(rawInLvl))) ? parseFloat(rawInLvl) : null;
        const inBank = inScales.overflow;
        const inCrit = inScales.critical;

        // Inside elements
        document.querySelectorAll(`[data-station-inside-fill="${station.id}"]`).forEach(fill => {
          fill.setAttribute('data-target-height', inScales.waterPct);
          fill.style.cssText = `position: absolute; bottom: 0; left: 0; width: 100%; height: ${inScales.waterPct}%;`;
          fill.className = `w-full bg-gradient-to-t ${inFillGrad} transition-all duration-500 rounded-b-xl flex items-end justify-center pb-1 z-10`;
        });
        document.querySelectorAll(`[data-station-inside-overflow-line="${station.id}"]`).forEach(line => {
          line.style.cssText = `position: absolute; bottom: ${inScales.overflowPct}%; left: 0; width: 100%;`;
        });
        document.querySelectorAll(`[data-station-inside-critical-line="${station.id}"]`).forEach(line => {
          line.style.cssText = `position: absolute; bottom: ${inScales.criticalPct}%; left: 0; width: 100%;`;
        });
        document.querySelectorAll(`[data-station-inside-level="${station.id}"]`).forEach(el => {
          el.textContent = inLvl !== null ? inLvl.toFixed(2) : '--';
        });
        document.querySelectorAll(`[data-station-inside-level-sub="${station.id}"]`).forEach(el => {
          el.textContent = inLvl !== null ? `${inLvl.toFixed(2)} ม.` : `${inScales.current.toFixed(2)} ม.`;
        });
        document.querySelectorAll(`[data-station-inside-diff="${station.id}"]`).forEach(el => {
          el.textContent = formatFriendlyDiffText(rawInLvl, inBank, inCrit) || station.inside?.diffText || 'ปกติ';
        });

        const rawOutLvl = station.outside?.level ?? station.outside?.waterLevel ?? null;
        const outLvl = (rawOutLvl !== null && rawOutLvl !== undefined && !isNaN(parseFloat(rawOutLvl))) ? parseFloat(rawOutLvl) : null;
        const outBank = outScales.overflow;
        const outCrit = outScales.critical;

        // Outside elements
        document.querySelectorAll(`[data-station-outside-fill="${station.id}"]`).forEach(fill => {
          fill.setAttribute('data-target-height', outScales.waterPct);
          fill.style.cssText = `position: absolute; bottom: 0; left: 0; width: 100%; height: ${outScales.waterPct}%;`;
          fill.className = `w-full bg-gradient-to-t ${outFillGrad} transition-all duration-500 rounded-b-xl flex items-end justify-center pb-1 z-10`;
        });
        document.querySelectorAll(`[data-station-outside-overflow-line="${station.id}"]`).forEach(line => {
          line.style.cssText = `position: absolute; bottom: ${outScales.overflowPct}%; left: 0; width: 100%;`;
        });
        document.querySelectorAll(`[data-station-outside-critical-line="${station.id}"]`).forEach(line => {
          line.style.cssText = `position: absolute; bottom: ${outScales.criticalPct}%; left: 0; width: 100%;`;
        });
        document.querySelectorAll(`[data-station-outside-level="${station.id}"]`).forEach(el => {
          el.textContent = outLvl !== null ? outLvl.toFixed(2) : '--';
        });
        document.querySelectorAll(`[data-station-outside-level-sub="${station.id}"]`).forEach(el => {
          el.textContent = outLvl !== null ? `${outLvl.toFixed(2)} ม.` : `${outScales.current.toFixed(2)} ม.`;
        });
        document.querySelectorAll(`[data-station-outside-diff="${station.id}"]`).forEach(el => {
          el.textContent = formatFriendlyDiffText(rawOutLvl, outBank, outCrit) || station.outside?.diffText || 'ปกติ';
        });

        // Gate Diff & Opening
        document.querySelectorAll(`[data-station-gate-diff="${station.id}"]`).forEach(el => {
          el.textContent = station.diffInOutText || 'ระดับน้ำเท่ากัน';
        });
        document.querySelectorAll(`[data-station-gate-opening="${station.id}"]`).forEach(el => {
          el.textContent = station.gateOpening ? `${parseFloat(station.gateOpening).toFixed(2)} ม.` : '0.43 ม.';
        });
      }

      // 2. Standard Single-Side Station In-Place Updates
      const rawLevel = station.currentLevel ?? station.waterLevel ?? station.level ?? station.inside?.level ?? null;
      const hasValidLevel = rawLevel !== null && rawLevel !== undefined && rawLevel !== '' && !isNaN(parseFloat(rawLevel));
      const levelNum = hasValidLevel ? parseFloat(rawLevel) : null;
      const scales = calculateGauge(station);
      const { waterPct, criticalPct, overflowPct, critical, overflow } = scales;
      const bank = overflow;

      let fillGrad = 'from-cyan-600 to-cyan-400';
      let statusClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      let diffClass = 'text-emerald-400';
      let statusText = station.statusText || 'ปกติ';

      if (!hasValidLevel && !station.statusText) {
        statusText = 'ไม่มีข้อมูล / รอตรวจวัด';
        statusClass = 'bg-slate-800 text-slate-300 border-slate-700';
        diffClass = 'text-slate-400';
      } else if (station.isOverflow || (hasValidLevel && levelNum >= bank && bank > 0)) {
        fillGrad = 'from-rose-600 to-red-500';
        statusClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
        diffClass = 'text-red-400';
      } else if (station.isWarning || (hasValidLevel && levelNum >= critical && critical > 0)) {
        fillGrad = 'from-amber-600 to-yellow-400';
        statusClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
        diffClass = 'text-amber-400';
      }

      // Canonical ID matching for pinned stations
      const canonMatch = CANONICAL_PINNED_STATIONS.find(c => c.id === station.id || c.stCode === station.stCode);
      const targetIds = Array.from(new Set([station.id, canonMatch?.id].filter(Boolean)));

      targetIds.forEach(tid => {
        // Update fills
        document.querySelectorAll(`[data-station-fill="${tid}"]`).forEach(fill => {
          fill.setAttribute('data-target-height', waterPct);
          fill.style.cssText = `position: absolute; bottom: 0; left: 0; width: 100%; height: ${waterPct}%;`;
          fill.className = `w-full bg-gradient-to-t ${fillGrad} transition-all duration-500 rounded-b-xl flex items-end justify-center pb-1 z-10`;
        });

        // Update overflow line & critical line
        document.querySelectorAll(`[data-station-overflow-line="${tid}"]`).forEach(line => {
          line.style.cssText = `position: absolute; bottom: ${overflowPct}%; left: 0; width: 100%;`;
        });
        document.querySelectorAll(`[data-station-overflow-label="${tid}"]`).forEach(label => {
          label.textContent = `ตลิ่ง ${bank.toFixed(2)}m`;
        });
        document.querySelectorAll(`[data-station-critical-line="${tid}"]`).forEach(line => {
          line.style.cssText = `position: absolute; bottom: ${criticalPct}%; left: 0; width: 100%;`;
        });
        document.querySelectorAll(`[data-station-critical-label="${tid}"]`).forEach(label => {
          label.textContent = `วิกฤติ ${critical.toFixed(2)}m`;
        });

        // Update water level text
        document.querySelectorAll(`[data-station-level="${tid}"]`).forEach(el => {
          el.textContent = levelNum !== null ? levelNum.toFixed(2) : '--';
        });
        document.querySelectorAll(`[data-station-level-sub="${tid}"]`).forEach(el => {
          el.textContent = `${scales.current.toFixed(2)} ม.`;
        });

        // Update diff text and color
        const friendlyDiff = hasValidLevel ? formatFriendlyDiffText(levelNum, bank, critical) : 'รอข้อมูลตรวจวัด';
        document.querySelectorAll(`[data-station-diff="${tid}"]`).forEach(el => {
          el.textContent = friendlyDiff || station.diffText || (hasValidLevel ? '' : 'รอข้อมูลตรวจวัด');
          el.className = `text-[11px] mt-1 font-semibold ${diffClass} truncate`;
        });

        // Update status badge
        document.querySelectorAll(`[data-station-status="${tid}"]`).forEach(el => {
          el.textContent = statusText;
          el.className = `px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 shrink-0 ${statusClass}`;
        });

        // Update timestamp & stale styling
        const isStale = station.isStale ?? false;
        const updateTime = formatCardDateTime(station.updatedAt ?? station.time ?? station.timestamp);
        document.querySelectorAll(`[data-station-time="${tid}"]`).forEach(el => {
          el.textContent = updateTime;
          if (isStale) {
            el.className = 'text-amber-400 font-mono font-semibold';
          } else {
            el.className = 'text-slate-300 font-mono';
          }
        });

        // Update stale badge
        document.querySelectorAll(`[data-station-stale-badge="${tid}"]`).forEach(badge => {
          if (isStale) {
            badge.classList.remove('hidden');
          } else {
            badge.classList.add('hidden');
          }
        });

        // Update stale text label
        document.querySelectorAll(`[data-station-stale-text="${tid}"]`).forEach(el => {
          if (isStale && station.staleText) {
            el.classList.remove('hidden');
            el.textContent = `(${station.staleText})`;
          } else {
            el.classList.add('hidden');
          }
        });

        // Update stale pill in level box
        document.querySelectorAll(`[data-station-stale-pill="${tid}"]`).forEach(pill => {
          if (isStale) {
            pill.classList.remove('hidden');
          } else {
            pill.classList.add('hidden');
          }
        });

        // Update source link
        const sourceUrl = getStationSourceUrl(station);
        document.querySelectorAll(`[data-station-source-link="${tid}"]`).forEach(link => {
          link.href = sourceUrl;
        });

        // Update distance tag
        document.querySelectorAll(`[data-station-dist="${tid}"]`).forEach(el => {
          if (station.distanceText) {
            el.classList.remove('hidden');
            el.innerHTML = `<i data-lucide="navigation" class="w-3 h-3 text-sky-400 inline"></i> ${station.distanceKm <= 5.0 ? '🟡 ' : ''}${station.distanceText}`;
          }
        });

        // Update limits
        document.querySelectorAll(`[data-station-bank="${tid}"]`).forEach(el => {
          el.textContent = `${bank.toFixed(2)} ม.`;
        });
        document.querySelectorAll(`[data-station-critical="${tid}"]`).forEach(el => {
          el.textContent = `${critical.toFixed(2)} ม.`;
        });

        // Update sub gauge label if present
        document.querySelectorAll(`[data-station-level-sub="${tid}"]`).forEach(el => {
          el.textContent = `${levelNum !== null ? levelNum.toFixed(2) : '--'} ม.`;
        });

        // Remove skeleton state from card container and apply stale styling
        document.querySelectorAll(`[data-station-card="${tid}"]`).forEach(card => {
          card.classList.remove('animate-pulse');
          if (isStale) {
            card.classList.add('station-stale');
          } else {
            card.classList.remove('station-stale');
          }
          if (station.isOverflow) {
            card.classList.remove('glass-panel-warning', 'border-slate-800');
            card.classList.add('glass-panel-danger');
          } else if (station.isWarning) {
            card.classList.remove('glass-panel-danger', 'border-slate-800');
            card.classList.add('glass-panel-warning');
          }
        });
      });
    } catch (err) {
      console.error(`Error updating station card in place: ${station?.id}`, err);
    }
  });

  // Guarantee pinned stations are never stuck on "กำลังโหลด..."
  CANONICAL_PINNED_STATIONS.forEach(canon => {
    try {
      const live = stations.find(s => s?.id === canon.id || s?.stCode === canon.stCode);
      const liveLevel = live?.waterLevel ?? live?.level ?? live?.inside?.level ?? null;
      const hasLiveLevel = liveLevel !== null && liveLevel !== undefined && liveLevel !== '' && !isNaN(parseFloat(liveLevel));
      if (!live || !hasLiveLevel) {
        document.querySelectorAll(`[data-station-status="${canon.id}"]`).forEach(el => {
          if (el.textContent.includes('กำลังโหลด') || el.textContent.includes('...')) {
            el.textContent = 'ไม่มีข้อมูล / รอตรวจวัด';
            el.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 shrink-0 bg-slate-800 text-slate-300 border-slate-700';
          }
        });
        document.querySelectorAll(`[data-station-diff="${canon.id}"]`).forEach(el => {
          if (el.textContent.includes('กำลังดึง') || el.textContent.includes('...')) {
            el.textContent = 'รอข้อมูลตรวจวัด';
          }
        });
        document.querySelectorAll(`[data-station-time="${canon.id}"]`).forEach(el => {
          if (el.textContent === '--:--' || el.textContent.includes('กำลังโหลด')) {
            el.textContent = '-';
          }
        });
      }
    } catch (e) {
      // safe ignore
    }
  });

  triggerWaterFillTransitions();
  if (window.lucide) window.lucide.createIcons();
  return true;
}

/**
 * Trigger smooth rising transition for water fill bars
 */
function triggerWaterFillTransitions() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-target-height]').forEach(el => {
        const target = el.getAttribute('data-target-height');
        if (target) {
          el.style.setProperty('height', `${target}%`, 'important');
          el.style.setProperty('position', 'absolute', 'important');
          el.style.setProperty('bottom', '0', 'important');
          el.style.setProperty('left', '0', 'important');
          el.style.setProperty('width', '100%', 'important');
        }
      });
    });
  });
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  const btnRefresh = document.getElementById('btnRefresh');
  const btnGpsRefresh = document.getElementById('btnGpsRefresh');

  // Manual data refresh with smooth 360-degree spin
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.disabled = true;
      const icon = document.getElementById('refreshIcon');
      if (icon) icon.classList.add('spinning-360');

      try {
        let res = await fetch('/api/stations?_t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) {
          res = await fetch('/api/water-summary?_t=' + Date.now(), { cache: 'no-store' });
        }
        if (!res.ok) {
          res = await fetch('/api/refresh?_t=' + Date.now(), { method: 'POST', cache: 'no-store' });
        }
        const data = await res.json();
        applyDataUpdate(data);
        fetchAiAnalysis(true);
        if (waterChartInstance) {
          initWaterHistoryChart();
        }
        // Auto Re-render Open Popup on Refresh
        if (window.currentOpenPopupStationId) {
          const openSt = appState.stations.find(s => s.id === window.currentOpenPopupStationId || s.stCode === window.currentOpenPopupStationId);
          if (openSt) {
            renderStationPopupSparkline(openSt);
          }
        }
      } catch (err) {
        console.error('Refresh error:', err);
      } finally {
        setTimeout(() => {
          btnRefresh.disabled = false;
          if (icon) icon.classList.remove('spinning-360');
        }, 750);
      }
    });
  }

  // 3. รองรับการสลับแท็บด้วย VisibilityChange (Handle Tab Switching)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // 1. สั่งกราฟหลักให้ปรับขนาดใหม่
      if (window.mainTrendChart) {
        window.mainTrendChart.resize();
      }
      // 2. สั่งวาดมินิกราฟใน Popup ที่เปิดค้างอยู่ใหม่ทันที
      if (window.currentOpenPopupStationId && window.cachedStationHistory) {
        const stationId = window.currentOpenPopupStationId;
        const historyData = window.cachedStationHistory[stationId];
        if (historyData) {
          setTimeout(() => renderPopupChart(stationId, historyData), 100);
        } else {
          const openSt = appState.stations.find(s => s.id === stationId || s.stCode === stationId);
          if (openSt) {
            setTimeout(() => renderStationPopupSparkline(openSt), 100);
          }
        }
      }
    }
  });

  // GPS Refresh
  if (btnGpsRefresh) {
    btnGpsRefresh.addEventListener('click', () => {
      initGeolocation(true);
    });
  }

  // Guidelines Collapsible Toggle
  setupGuidelinesToggle();
}

/**
 * Set user coordinates (from GPS or interactive map click)
 */
function setUserCoordinates(lat, lng, sourceLabel = 'พิกัด GPS') {
  appState.userCoords = { lat, lng };

  const gpsBtnText = document.getElementById('gpsBtnText');
  const gpsStatusIcon = document.getElementById('gpsStatusIcon');
  const btnGpsRefresh = document.getElementById('btnGpsRefresh');

  if (gpsBtnText) gpsBtnText.textContent = 'ย่านคลองสามวา / พระยาสุเรนทร์';
  if (btnGpsRefresh) btnGpsRefresh.title = `📍 ตำแหน่ง: ย่านคลองสามวา / พระยาสุเรนทร์ (${lat.toFixed(4)}, ${lng.toFixed(4)}) - แตะเพื่ออัปเดต GPS`;
  if (gpsStatusIcon) {
    gpsStatusIcon.classList.remove('animate-spin');
    gpsStatusIcon.setAttribute('data-lucide', 'map-pin');
  }

  console.log(`[User Location]: ${sourceLabel} lat: ${lat.toFixed(4)}, lng: ${lng.toFixed(4)}`);
  recalculateDistances();
  const updatedInPlace = updateExistingCardsIfPresent(appState.stations);
  if (!updatedInPlace) {
    renderAllSections();
  }
  updateMapMarkers();
  handleTwoTierAlerts();
  if (window.lucide) window.lucide.createIcons();
}
window.setUserCoordinates = setUserCoordinates;

/**
 * GPS Geolocation Initialization
 */
/**
 * Helper to generate dynamic WebSocket URL supporting both ws:// and wss://
 */
function getWebSocketUrl(path = '/ws') {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

function initGeolocation(isManual = false) {
  const gpsBtnText = document.getElementById('gpsBtnText');
  const gpsStatusIcon = document.getElementById('gpsStatusIcon');

  if (!navigator.geolocation) {
    if (gpsBtnText) gpsBtnText.textContent = 'ย่านคลองสามวา / พระยาสุเรนทร์';
    return;
  }

  // Modern browsers require HTTPS for Geolocation (except localhost)
  const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isSecure) {
    console.warn('[Geolocation]: Browser requires HTTPS to access Geolocation API');
    if (gpsBtnText) gpsBtnText.textContent = 'ย่านคลองสามวา / พระยาสุเรนทร์';
    if (isManual) {
      alert('⚠️ ระบบต้องการการเชื่อมต่อแบบ HTTPS เพื่อใช้งานพิกัด GPS\nกรุณาเข้าใช้งานผ่าน https:// เพื่อให้เบราว์เซอร์อนุญาตพิกัดตำแหน่ง');
    }
    return;
  }

  if (gpsBtnText) gpsBtnText.textContent = 'กำลังหาพิกัด...';
  if (gpsStatusIcon) gpsStatusIcon.classList.add('animate-spin');

  navigator.geolocation.getCurrentPosition(
    position => {
      setUserCoordinates(position.coords.latitude, position.coords.longitude, 'พิกัด GPS');
      if (isManual) panMapToUser();
    },
    error => {
      console.warn('[GPS Geolocation Error]:', error.code, error.message);
      if (gpsStatusIcon) gpsStatusIcon.classList.remove('animate-spin');

      if (gpsBtnText) gpsBtnText.textContent = 'ย่านคลองสามวา / พระยาสุเรนทร์';

      if (error.code === error.PERMISSION_DENIED && isManual) {
        alert('📍 ยังไม่ได้รับสิทธิ์เข้าถึงตำแหน่ง:\nกรุณากด "อนุญาต (Allow)" ในการตั้งค่าเบราว์เซอร์ เพื่อคำนวณระยะห่างจากสถานีตรวจวัดน้ำใกล้คุณ');
      }

      recalculateDistances();
      const updatedInPlace = updateExistingCardsIfPresent(appState.stations);
      if (!updatedInPlace) {
        renderAllSections();
      }
      updateMapMarkers();
      handleTwoTierAlerts();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/**
 * Calculate distance for each station and determine Nearest Canal Group & Dual-Canal Junction
 */
function recalculateDistances() {
  if (!appState.stations || appState.stations.length === 0) return;

  if (appState.userCoords) {
    appState.stations.forEach(station => {
      const dist = calculateHaversineDistance(
        appState.userCoords.lat,
        appState.userCoords.lng,
        station.lat,
        station.lng
      );
      station.distanceKm = dist;
      station.distanceText = `ห่างจากคุณ ${formatDistance(dist)}`;
    });

    const sorted = [...appState.stations].sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
    appState.nearestStation = sorted[0];
    appState.nearestCanalGroup = appState.nearestStation?.canalGroupId || 'khlong-phraya-suren';

    // 1. Proximity Logic: Check all stations within 5.0 km
    const nearbyStations = appState.stations.filter(s => s.distanceKm !== null && s.distanceKm !== undefined && s.distanceKm <= 5.0);
    const nearbyCanalGroupIds = [...new Set(nearbyStations.map(s => s.canalGroupId).filter(Boolean))];

    // If stations within 5km span >= 2 canal groups, mark as junction area
    if (nearbyCanalGroupIds.length >= 2) {
      appState.isJunctionArea = true;
      appState.junctionCanalGroupIds = nearbyCanalGroupIds;
      appState.junctionCanalNames = nearbyCanalGroupIds.map(id => CANAL_GROUPS_META[id]?.shortName || CANAL_GROUPS_META[id]?.name || id);
    } else {
      appState.isJunctionArea = false;
      appState.junctionCanalGroupIds = nearbyCanalGroupIds;
      appState.junctionCanalNames = nearbyCanalGroupIds.map(id => CANAL_GROUPS_META[id]?.shortName || CANAL_GROUPS_META[id]?.name || id);
    }

    if (!appState.selectedCanalTab) {
      appState.selectedCanalTab = appState.isJunctionArea ? 'nearby-all' : (appState.nearestCanalGroup || 'khlong-phraya-suren');
    } else if (appState.selectedCanalTab === 'nearby-all' && nearbyStations.length === 0) {
      appState.selectedCanalTab = appState.nearestCanalGroup || 'khlong-phraya-suren';
    }
  } else {
    appState.stations.forEach(station => {
      station.distanceKm = null;
      station.distanceText = '';
    });
    appState.nearestStation = appState.stations.find(s => s.id === 'bma_weather_126' || s.id === 'bma-weather-126') || appState.stations[0];
    appState.nearestCanalGroup = 'khlong-phraya-suren';
    appState.isJunctionArea = false;
    appState.junctionCanalGroupIds = [];
    appState.junctionCanalNames = [];
    if (!appState.selectedCanalTab || appState.selectedCanalTab === 'nearby-all') {
      appState.selectedCanalTab = 'khlong-phraya-suren';
    }
  }
}

/**
 * Fetch Water Summary API
 */
async function fetchWaterSummary() {
  try {
    let res = await fetch('/api/stations?_t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) {
      res = await fetch('/api/water-summary?_t=' + Date.now(), { cache: 'no-store' });
    }
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    applyDataUpdate(data);
  } catch (err) {
    console.error('Failed to fetch water summary:', err);
    markPinnedCardsNoData();
  }
}

/**
 * Fallback handler: mark pinned cards as 'ไม่มีข้อมูล / รอตรวจวัด' if API unreachable
 */
function markPinnedCardsNoData() {
  CANONICAL_PINNED_STATIONS.forEach(canon => {
    document.querySelectorAll(`[data-station-status="${canon.id}"]`).forEach(el => {
      if (el.textContent.includes('กำลังโหลด') || el.textContent.includes('...')) {
        el.textContent = 'ไม่มีข้อมูล / รอตรวจวัด';
        el.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 shrink-0 bg-slate-800 text-slate-300 border-slate-700';
      }
    });
    document.querySelectorAll(`[data-station-diff="${canon.id}"]`).forEach(el => {
      if (el.textContent.includes('กำลังดึง') || el.textContent.includes('...')) {
        el.textContent = 'รอข้อมูลตรวจวัด';
      }
    });
    document.querySelectorAll(`[data-station-time="${canon.id}"]`).forEach(el => {
      if (el.textContent === '--:--' || el.textContent.includes('กำลังโหลด')) {
        el.textContent = '-';
      }
    });
  });
}

/**
 * Update Header status and Last Updated timestamp (Desktop & Mobile)
 */
function updateHeaderStatus() {
  const lastUpdatedTime = document.getElementById('lastUpdatedTime');
  const lastUpdatedTimeMobile = document.getElementById('lastUpdatedTimeMobile');

  if (appState.lastUpdated) {
    const d = new Date(appState.lastUpdated);
    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    if (lastUpdatedTime) lastUpdatedTime.textContent = timeStr;
    if (lastUpdatedTimeMobile) lastUpdatedTimeMobile.textContent = timeStr;
  }
}

/**
 * ========================================================
 * INTERACTIVE MAP MODULE (LEAFLET & OPENSTREETMAP)
 * ========================================================
 */

function initLeafletMap() {
  if (typeof L === 'undefined') {
    setTimeout(initLeafletMap, 100);
    return;
  }

  const mapElement = document.getElementById('floodMap');
  if (!mapElement) return;
  if (leafletMap || mapElement._leaflet_id) return;

  try {
    // Center around Lam Luk Ka / Sai Mai / Khlong Sam Wa border
    leafletMap = L.map('floodMap', {
      center: [13.885, 100.72],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
      touchZoom: true,
      tap: false
    });

    // Keep map properly sized during mobile orientation/viewport resize
    window.addEventListener('resize', () => {
      if (leafletMap) leafletMap.invalidateSize();
    });

    // Esri World Dark Gray Canvas Tile Layer (100% Free, No API Key required)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      maxZoom: 16,
      subdomains: ['server', 'services']
    }).addTo(leafletMap);

    // Set accessible Thai labels and attributes on Leaflet Zoom controls
    setTimeout(() => {
      try {
        const zoomIn = mapElement.querySelector('.leaflet-control-zoom-in');
        if (zoomIn) {
          zoomIn.setAttribute('aria-label', 'ซูมเข้าแผนที่');
          zoomIn.setAttribute('title', 'ซูมเข้าแผนที่');
        }
        const zoomOut = mapElement.querySelector('.leaflet-control-zoom-out');
        if (zoomOut) {
          zoomOut.setAttribute('aria-label', 'ซูมออกแผนที่');
          zoomOut.setAttribute('title', 'ซูมออกแผนที่');
        }
      } catch (e) {}
    }, 100);

    // Map Header Buttons
    const btnFitAll = document.getElementById('btnMapFitAll');
    if (btnFitAll) {
      btnFitAll.addEventListener('click', fitMapToAllStations);
    }

    const btnGoUser = document.getElementById('btnMapGoUser');
    if (btnGoUser) {
      btnGoUser.addEventListener('click', () => {
        initGeolocation(true);
        panMapToUser();
      });
    }

    // Trigger lucide icon creation whenever popup opens
    leafletMap.on('popupopen', () => {
      if (window.lucide) window.lucide.createIcons();
    });

    if (appState.stations && appState.stations.length > 0) {
      updateMapMarkers();
    }
  } catch (mapErr) {
    console.error('[Leaflet Map Init Error]:', mapErr);
  }
}
window.initMap = initLeafletMap;
window.initLeafletMap = initLeafletMap;

function formatPopupTime(value) {
  const parsed = parseStationTimestamp(value);
  if (!parsed) return value || '--:-- น.';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')} น.`;
}

function formatCardDateTime(timeStr) {
  if (!timeStr) return '-';
  const date = new Date(timeStr);
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }
  return String(timeStr);
}
window.formatCardDateTime = formatCardDateTime;

function getUnifiedWaterTrend(historyItems) {
  if (!historyItems || !Array.isArray(historyItems) || historyItems.length < 5) {
    return {
      text: "แนวโน้มทรงตัว",
      icon: "—",
      status: "stable",
      color: "text-slate-300 bg-slate-800/60 border-slate-700/50"
    };
  }

  const getVal = item => {
    if (item === null || item === undefined) return 0;
    if (typeof item === 'object') {
      return Number(item.waterLevel ?? item.level ?? item.val ?? item.water ?? 0);
    }
    return Number(item) || 0;
  };

  // 1. ดึงระดับน้ำล่าสุด และค่าเฉลี่ย 1 ชั่วโมงล่าสุด (ลดผลกระทบจากคลื่น/Sensor Noise)
  const recentItems = historyItems.slice(-4);
  const currentAvg = recentItems.reduce((acc, cur) => acc + getVal(cur), 0) / recentItems.length;

  // 2. ดึงจุดเทียบระยะกลาง (ย้อนหลัง 6 - 8 ชั่วโมง หรือกึ่งกลางชุดข้อมูล 24 ชม.)
  // หากข้อมูลมี 24 ชม. (ประมาณ 24-96 จุด) ให้ย้อนกลับไปประมาณ 1/3 ถึง 1/2 ของ Array
  const midIndex = Math.max(0, Math.floor(historyItems.length * 0.6) - 1);
  const midBaseItem = historyItems[midIndex];
  const midBaseLevel = getVal(midBaseItem);

  // 3. คำนวณส่วนต่างระดับน้ำระยะกลาง (Delta)
  const diffMedium = currentAvg - midBaseLevel;

  // 4. ตรวจสอบร่วมกับส่วนต่าง 24 ชม. ทั้งหมด (Total Net Change)
  const firstLevel = getVal(historyItems[0]);
  const diff24h = getVal(historyItems[historyItems.length - 1]) - firstLevel;

  // 5. เกณฑ์การตัดสินทิศทางระยะกลาง:
  // เพิ่มขึ้น: น้ำขึ้นเกิน 5 ซม. ในระยะกลาง หรือขึ้นสะสมเกิน 8 ซม. ใน 24 ชม.
  if (diffMedium >= 0.05 || diff24h >= 0.08) {
    return {
      text: "แนวโน้มเพิ่มขึ้น",
      icon: "📈",
      status: "rising",
      color: "text-amber-400 bg-amber-500/10 border-amber-500/30"
    };
  } 
  // ลดลง: น้ำลดลงเกิน 5 ซม. ในระยะกลาง หรือลดสะสมเกิน 8 ซม. ใน 24 ชม.
  else if (diffMedium <= -0.05 || diff24h <= -0.08) {
    return {
      text: "แนวโน้มลดลง",
      icon: "📉",
      status: "falling",
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30"
    };
  } 
  // ทรงตัว: น้ำเปลี่ยนแปลงไม่เกิน 4-5 ซม. ตลอดช่วงเวลา
  else {
    return {
      text: "แนวโน้มทรงตัว",
      icon: "—",
      status: "stable",
      color: "text-slate-300 bg-slate-800/60 border-slate-700/50"
    };
  }
}
window.getUnifiedWaterTrend = getUnifiedWaterTrend;

function getPopupHistoryValues(station) {
  const cached = (typeof popupHistoryCache !== 'undefined' && popupHistoryCache.get(station.id)) ||
    (window.cachedStationHistory && (window.cachedStationHistory[station.id] || window.cachedStationHistory[station.stCode]));
  if (cached) {
    if (Array.isArray(cached.outside) && cached.outside.length > 0) return cached.outside;
    if (Array.isArray(cached.waterLevels) && cached.waterLevels.length > 0) return cached.waterLevels;
    if (Array.isArray(cached.inside) && cached.inside.length > 0) return cached.inside;
    if (Array.isArray(cached) && cached.length > 0) return cached;
  }

  const rawValues = station.waterLevels || station.history || station.waterHistory;
  const values = Array.isArray(rawValues)
    ? rawValues.map(value => Number(value)).filter(Number.isFinite).slice(-24)
    : [];
  if (values.length > 1) return values;

  const current = Number(station.waterLevel ?? station.inside?.level);
  if (!Number.isFinite(current)) return [];
  const trend = String(station.trend || '').toLowerCase();
  const direction = trend === 'rising' ? 1 : (trend === 'falling' ? -1 : 0);
  return Array.from({ length: 12 }, (_, index) => current - direction * (11 - index) * 0.01);
}

function getPopupHistorySeries(station) {
  const inside = Array.isArray(station.waterLevelsIn)
    ? station.waterLevelsIn.map(Number).filter(Number.isFinite).slice(-24)
    : [];
  const outside = Array.isArray(station.waterLevelsOut)
    ? station.waterLevelsOut.map(Number).filter(Number.isFinite).slice(-24)
    : [];
  if (inside.length > 1 && outside.length > 1) return { inside, outside };
  const values = getPopupHistoryValues(station);
  return values.length > 1 ? { outside: values } : { outside: [] };
}

function drawStationPopupSparkline(station, values = getPopupHistoryValues(station)) {
  const canvas = document.getElementById(`popup-chart-${station.id}`);
  const series = Array.isArray(values) ? { outside: values } : values;
  const insideValues = series.inside || [];
  const outsideValues = series.outside || [];
  if (!canvas || (outsideValues.length < 2 && insideValues.length < 2)) return;

  const width = Math.max(canvas.clientWidth || 250, 180);
  const height = 55;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 5, right: 3, bottom: 5, left: 3 };
  const allValues = [...insideValues, ...outsideValues];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const min = rawMin - 0.15;
  const max = rawMax + 0.15;
  const range = Math.max(max - min, 0.02);
  const effectiveLen = Math.max(outsideValues.length, insideValues.length, 2);
  const xStep = (width - padding.left - padding.right) / (effectiveLen - 1);
  const y = value => padding.top + (1 - ((value - min) / range)) * (height - padding.top - padding.bottom);

  const thresholdLines = station.isGate && station.thresholds
    ? [
      { value: station.thresholds.in.critical, color: 'rgba(251, 146, 60, 0.85)' },
      { value: station.thresholds.out.critical, color: 'rgba(248, 113, 113, 0.85)' }
    ]
    : [{ value: Number(station.criticalLevel), color: 'rgba(251, 191, 36, 0.75)' }];
  thresholdLines.forEach(line => {
    if (!Number.isFinite(Number(line.value)) || line.value < min || line.value > max) return;
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y(line.value));
    ctx.lineTo(width - padding.right, y(line.value));
    ctx.stroke();
    ctx.setLineDash([]);
  });

  const drawLine = (lineValues, color) => {
    if (lineValues.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const points = lineValues.map((value, index) => ({
      x: padding.left + index * xStep,
      y: y(value)
    }));
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index++) {
      const midpointX = (points[index].x + points[index + 1].x) / 2;
      const midpointY = (points[index].y + points[index + 1].y) / 2;
      ctx.quadraticCurveTo(points[index].x, points[index].y, midpointX, midpointY);
    }
    const lastPoint = points[points.length - 1];
    const previousPoint = points[points.length - 2];
    ctx.quadraticCurveTo(previousPoint.x, previousPoint.y, lastPoint.x, lastPoint.y);
    ctx.stroke();
  };

  drawLine(insideValues, 'rgba(56, 189, 248, 1)');
  drawLine(outsideValues, 'rgba(192, 132, 252, 0.9)');
}

/**
 * 1. จัดการ Chart Instance Lifecycle (ป้องกัน Canvas Crash)
 * วาดกราฟ Popup ด้วย Chart.js พร้อมระบบทำลาย Instance เดิมและป้องกัน Canvas ชนกัน
 */
async function renderPopupChart(stationId, data) {
  if (!stationId) return;

  // Make sure Chart.js is loaded
  if (typeof Chart === 'undefined') {
    if (typeof loadChartJs === 'function') {
      try {
        await loadChartJs();
      } catch (err) {
        console.warn('[Popup Chart] Chart.js unavailable, falling back to 2D sparkline:', err);
        const station = (appState.stations || []).find(s => s.id === stationId || s.stCode === stationId);
        if (station) drawStationPopupSparkline(station, data);
        return;
      }
    } else {
      const station = (appState.stations || []).find(s => s.id === stationId || s.stCode === stationId);
      if (station) drawStationPopupSparkline(station, data);
      return;
    }
  }

  // ตรวจสอบและทำลายกราฟเดิมทิ้งก่อนเสมอ
  if (window.activePopupCharts && window.activePopupCharts[stationId]) {
    try {
      window.activePopupCharts[stationId].destroy();
    } catch (e) {
      console.warn('[Popup Chart] Error destroying old chart instance:', e);
    }
    delete window.activePopupCharts[stationId];
  }

  // ตรวจสอบว่า Canvas ยังอยู่ใน DOM และมีขนาดถูกต้อง
  const canvas = document.getElementById(`popup-chart-${stationId}`);
  if (!canvas) return;

  // ป้องกัน Chart instance ตกค้างใน DOM canvas
  if (typeof Chart.getChart === 'function') {
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      try { existingChart.destroy(); } catch (e) {}
    }
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const station = (appState.stations || []).find(s => s.id === stationId || s.stCode === stationId) || {};

  // แยกชุดข้อมูล series
  let insideValues = [];
  let outsideValues = [];

  if (Array.isArray(data)) {
    outsideValues = data.map(Number).filter(Number.isFinite);
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.inside)) insideValues = data.inside.map(Number).filter(Number.isFinite);
    else if (Array.isArray(data.waterLevelsIn)) insideValues = data.waterLevelsIn.map(Number).filter(Number.isFinite);

    if (Array.isArray(data.outside)) outsideValues = data.outside.map(Number).filter(Number.isFinite);
    else if (Array.isArray(data.waterLevelsOut)) outsideValues = data.waterLevelsOut.map(Number).filter(Number.isFinite);
    else if (Array.isArray(data.waterLevels)) outsideValues = data.waterLevels.map(Number).filter(Number.isFinite);
    else if (Array.isArray(data.history)) outsideValues = data.history.map(Number).filter(Number.isFinite);
  }

  if (outsideValues.length < 2 && insideValues.length < 2 && station.id) {
    const fallback = getPopupHistorySeries(station);
    insideValues = fallback.inside || [];
    outsideValues = fallback.outside || [];
  }

  // บันทึกลง cache เสมอเพื่อให้ tab switching หรือ refresh นำไปใช้ได้ทันที
  const normalizedData = { inside: insideValues, outside: outsideValues };
  window.cachedStationHistory[stationId] = normalizedData;
  if (station.id) window.cachedStationHistory[station.id] = normalizedData;
  if (station.stCode) window.cachedStationHistory[station.stCode] = normalizedData;

  // อัปเดตข้อความแนวโน้มบนหัวกล่องกราฟ
  const trendElement = document.getElementById(`popup-trend-${stationId}`);
  if (trendElement) {
    const trendValues = outsideValues.length > 0 ? outsideValues : insideValues;
    const trend = getUnifiedWaterTrend(trendValues);
    trendElement.className = `px-2 py-0.5 rounded-md text-[11px] border inline-flex items-center gap-1 ${trend.color} font-semibold mt-1`;
    trendElement.textContent = `${trend.icon} ${trend.text}`;
  }

  const pointCount = Math.max(outsideValues.length, insideValues.length, 12);
  const labels = Array.from({ length: pointCount }, (_, i) => `${i + 1}`);

  const datasets = [];

  // เส้นระดับน้ำฝั่งใน (กรณีสถานีประตูระบายน้ำ)
  if (insideValues.length > 0) {
    datasets.push({
      label: 'ด้านใน',
      data: insideValues,
      borderColor: 'rgba(56, 189, 248, 1)',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: false
    });
  }

  // เส้นระดับน้ำฝั่งนอก หรือ ระดับน้ำคลองเดี่ยว
  if (outsideValues.length > 0) {
    const lineColor = insideValues.length > 0 ? 'rgba(192, 132, 252, 0.95)' : 'rgba(56, 189, 248, 1)';
    datasets.push({
      label: insideValues.length > 0 ? 'ด้านนอก' : 'ระดับน้ำ',
      data: outsideValues,
      borderColor: lineColor,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: false
    });
  }

  // เส้นประเกณฑ์วิกฤติ (Critical Threshold Line)
  const critVal = Number(station.criticalLevel || station.thresholds?.out?.critical);
  if (Number.isFinite(critVal)) {
    datasets.push({
      label: 'เกณฑ์วิกฤติ',
      data: new Array(labels.length).fill(critVal),
      borderColor: 'rgba(251, 191, 36, 0.85)',
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false
    });
  }

  try {
    window.activePopupCharts[stationId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // ปิด animation ตอน re-draw เพื่อความเร็วและเสถียร
        layout: {
          padding: { top: 4, bottom: 4, left: 2, right: 2 }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${Number(item.raw).toFixed(2)} ม.`
            }
          }
        },
        scales: {
          x: { display: false },
          y: {
            display: false,
            grace: '10%'
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });
  } catch (err) {
    console.error(`[Popup Chart] Failed to render Chart.js for ${stationId}:`, err);
    drawStationPopupSparkline(station, normalizedData);
  }
}
window.renderPopupChart = renderPopupChart;

async function renderStationPopupSparkline(station) {
  if (!station || !station.id) return;

  // บันทึกสถานีที่กำลังเปิด Popup
  window.currentOpenPopupStationId = station.id;

  const fallbackValues = getPopupHistorySeries(station);
  window.cachedStationHistory[station.id] = fallbackValues;

  // Immediate render with cached data if present
  if (popupHistoryCache.has(station.id)) {
    const cached = popupHistoryCache.get(station.id);
    window.cachedStationHistory[station.id] = cached;
    renderPopupChart(station.id, cached);
    return;
  }

  // วาดข้อมูลสำรองก่อนทันที ป้องกันกล่องมืดว่างเปล่า
  renderPopupChart(station.id, fallbackValues);

  try {
    const response = await fetch(`/api/water-history?station=${encodeURIComponent(station.id)}&_t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const selected = data.selectedStation || data;
    const values = {
      inside: (selected.waterLevelsIn || []).map(Number).filter(Number.isFinite).slice(-24),
      outside: (selected.waterLevelsOut || selected.waterLevels || [])
        .map(Number).filter(Number.isFinite).slice(-24)
    };
    if (values.outside.length > 1 || values.inside.length > 1) {
      popupHistoryCache.set(station.id, values);
      window.cachedStationHistory[station.id] = values;
      // วาดซ้ำเฉพาะกรณีที่ Popup ของสถานีนี้ยังเปิดอยู่
      if (window.currentOpenPopupStationId === station.id) {
        renderPopupChart(station.id, values);
      }
    }
  } catch (err) {
    console.warn('[Popup Sparkline] History unavailable:', err);
  }
}

/**
 * Update Leaflet Map Markers & Proximity Circle
 */
function updateMapMarkers() {
  if (!leafletMap) {
    if (typeof L !== 'undefined') initLeafletMap();
    return;
  }

  // 1. User GPS Marker & 5km Radius Circle (Yellow / Amber)
  if (appState.userCoords) {
    const userLat = appState.userCoords.lat;
    const userLng = appState.userCoords.lng;

    const userHtml = `
      <div class="user-gps-marker">
        <div class="user-gps-ring"></div>
        <div class="user-gps-ring user-gps-ring-delayed"></div>
        <div class="user-gps-dot"></div>
      </div>
    `;

    const userIcon = L.divIcon({
      className: 'custom-user-icon',
      html: userHtml,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    if (mapUserMarker) {
      mapUserMarker.setLatLng([userLat, userLng]);
    } else {
      mapUserMarker = L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 }).addTo(leafletMap);
      mapUserMarker.bindTooltip('📍 ตำแหน่งของคุณ (GPS)', { permanent: false, direction: 'top' });
      mapUserMarker.on('click', (e) => {
        if (e && e.originalEvent) {
          L.DomEvent.stopPropagation(e.originalEvent);
        }
      });
    }

    // 5 km Proximity Circle in Yellow / Amber
    if (mapProximityCircle) {
      mapProximityCircle.setLatLng([userLat, userLng]);
      mapProximityCircle.setStyle({
        color: '#eab308',
        fillColor: '#fde047',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6'
      });
    } else {
      mapProximityCircle = L.circle([userLat, userLng], {
        radius: 5000,
        color: '#eab308',
        fillColor: '#fde047',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6'
      }).addTo(leafletMap);
      mapProximityCircle.bindTooltip('🟡 รัศมีเตือนภัยใกล้ตัว 5 กม.', { sticky: true, opacity: 0.9 });
    }
  }

  // 2. Station Markers (all 9 stations: ST-1 through ST-9)
  appState.stations.forEach((station, idx) => {
    if (!station.lat || !station.lng) return;

    const isDanger = station.isOverflow;
    const isWarning = station.isWarning;

    let pinClass = 'station-pin-normal';
    let statusLabel = '🟢 ปกติ';
    let statusColorClass = 'text-emerald-400';
    let radarRingsHtml = '';

    if (station.isStale) {
      pinClass = 'station-pin-stale';
      statusLabel = '⚪ ข้อมูลไม่อัปเดต';
      statusColorClass = 'text-slate-400';
      radarRingsHtml = ''; // Disable radar ping animations completely for stale stations
    } else if (isDanger) {
      pinClass = 'station-pin-emergency';
      statusLabel = station.isGate && station.alertBadgeText ? station.alertBadgeText : '🚨 ล้นตลิ่ง';
      statusColorClass = 'text-red-400';
      radarRingsHtml = `
        <div class="station-radar-ring radar-emergency"></div>
        <div class="station-radar-ring radar-emergency radar-ring-delayed"></div>
      `;
    } else if (isWarning) {
      pinClass = 'station-pin-warning';
      statusLabel = station.isGate && station.alertBadgeText ? station.alertBadgeText : '⚠️ วิกฤติ';
      statusColorClass = 'text-amber-400';
      radarRingsHtml = `
        <div class="station-radar-ring radar-warning"></div>
        <div class="station-radar-ring radar-warning radar-ring-delayed"></div>
      `;
    }

    // Unique Station Badge Code (ST-1 through ST-9)
    const pinBadge = station.stCode || ('ST-' + (idx + 1));
    const pinStaleClass = station.isStale ? ' station-pin-stale' : '';

    const pinHtml = `
      <div class="station-pin-wrapper">
        ${radarRingsHtml}
        <div class="station-pin ${pinClass}${pinStaleClass}" title="${station.name}${station.isStale ? ' (ข้อมูลไม่อัปเดต)' : ''}">
          <span>${pinBadge}</span>
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'custom-station-icon',
      html: pinHtml,
      iconSize: [44, 30],
      iconAnchor: [22, 15],
      popupAnchor: [0, -16]
    });

    const canalMeta = CANAL_GROUPS_META[station.canalGroupId] || { name: 'จุดตรวจวัด', shortName: 'จุดตรวจวัด' };
    const distText = station.distanceText
      ? `<div class="text-xs text-sky-400 mt-1.5 font-semibold flex items-center gap-1"><i data-lucide="navigation" class="w-3.5 h-3.5"></i> ${station.distanceText}</div>`
      : `<div class="text-xs text-slate-400 mt-1.5 flex items-center gap-1"><i data-lucide="navigation" class="w-3.5 h-3.5"></i> ยังไม่ได้ระบุพิกัด GPS</div>`;

    const sourceUrl = getStationSourceUrl(station);
    const popupChartId = `popup-chart-${station.id}`;
    const popupTrend = getUnifiedWaterTrend(getPopupHistoryValues(station));

    let bodyPopupHtml = '';
    if (station.isGate && station.inside && station.outside) {
      bodyPopupHtml = `
        <div class="my-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <div class="grid grid-cols-2 gap-2 text-center pb-2 border-b border-white/10">
            <!-- ด้านใน -->
            <div class="p-1.5 rounded-lg bg-black/40 border border-white/5">
              <div class="text-[10px] font-bold text-sky-300">🌊 ฝั่งด้านใน</div>
              <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${station.inside.level !== null && station.inside.level !== undefined ? station.inside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-slate-400 cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span></div>
              <div class="text-[9px] font-semibold ${station.inside.isOverflow ? 'text-red-400' : (station.inside.isWarning ? 'text-amber-400' : 'text-emerald-400')}">
                ${station.inside.statusText} (${formatFriendlyDiffText(station.inside.level, station.inside.bank, station.inside.critical)})
              </div>
            </div>
            <!-- ด้านนอก -->
            <div class="p-1.5 rounded-lg bg-black/40 border border-white/5">
              <div class="text-[10px] font-bold text-purple-300">🌊 ฝั่งด้านนอก</div>
              <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${station.outside.level !== null && station.outside.level !== undefined ? station.outside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-slate-400 cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span></div>
              <div class="text-[9px] font-semibold ${station.outside.isOverflow ? 'text-red-400' : (station.outside.isWarning ? 'text-amber-400' : 'text-emerald-400')}">
                ${station.outside.statusText} (${formatFriendlyDiffText(station.outside.level, station.outside.bank, station.outside.critical)})
              </div>
            </div>
          </div>
          <!-- Gate Telemetry Summary -->
          <div class="mt-2 text-[11px] space-y-1">
            <div class="flex items-center justify-between text-cyan-300">
              <span>ความต่างระดับ:</span>
              <b class="font-bold text-white font-mono">${station.diffInOutText || ''}</b>
            </div>
            <div class="flex items-center justify-between text-amber-300">
              <span>ระยะเปิดบานประตู:</span>
              <b class="font-bold text-white font-mono">${station.gateOpening ? `${station.gateOpening.toFixed(2)} ม.` : '0.43 ม.'}</b>
            </div>
          </div>
        </div>

        <!-- Limits for both sides -->
        <div class="grid grid-cols-2 gap-1.5 text-[10px] mb-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
          <div>
            <div class="text-slate-400 font-semibold">เกณฑ์ฝั่งใน:</div>
            <div class="text-slate-300">เตือนภัย <b class="text-yellow-300 font-mono">${station.inside.warning.toFixed(2)} ม.</b> | วิกฤติ <b class="text-amber-300 font-mono">${station.inside.critical.toFixed(2)} ม.</b> | ตลิ่ง <b class="font-mono">${station.inside.bank.toFixed(2)} ม.</b></div>
          </div>
          <div>
            <div class="text-slate-400 font-semibold">เกณฑ์ฝั่งนอก:</div>
            <div class="text-slate-300">เตือนภัย <b class="text-yellow-300 font-mono">${station.outside.warning.toFixed(2)} ม.</b> | วิกฤติ <b class="text-amber-300 font-mono">${station.outside.critical.toFixed(2)} ม.</b> | ตลิ่ง <b class="font-mono">${station.outside.bank.toFixed(2)} ม.</b></div>
          </div>
        </div>
      `;
    } else {
      bodyPopupHtml = `
        <div class="my-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>ระดับน้ำปัจจุบัน:</span>
            ${station.isStale ? '<span class="text-[10px] text-amber-300 font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">🕒 (ข้อมูลเดิม)</span>' : ''}
          </div>
          <div class="flex items-baseline gap-1.5 mt-0.5">
            <span class="text-2xl font-black text-white font-mono-numbers">
              ${(station.waterLevel !== null && station.waterLevel !== undefined) ? station.waterLevel.toFixed(2) : '--'}
            </span>
            <span class="text-xs text-slate-400 cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span>
          </div>
          <div class="text-[11px] font-semibold mt-0.5 ${station.diff >= 0 ? 'text-red-400' : (isWarning ? 'text-amber-400' : 'text-emerald-400')}">
            ${formatFriendlyDiffText(station.waterLevel, station.bankLevel, station.criticalLevel)}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-1.5 text-[11px] mb-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
          <div>
            <span class="text-slate-400">ระดับวิกฤติ:</span>
            <b class="ml-1 text-amber-300 font-mono">${station.criticalLevel} <span class="text-[10px] text-slate-400 font-normal cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span></b>
          </div>
          <div>
            <span class="text-slate-400">ระดับตลิ่ง:</span>
            <b class="ml-1 text-slate-200 font-mono">${station.bankLevel} <span class="text-[10px] text-slate-400 font-normal cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span></b>
          </div>
        </div>
      `;
    }

    const popupHtml = `
      <div class="p-1 min-w-[260px] sm:min-w-[280px]">
        <div class="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-white/10">
          <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            ${pinBadge} | ${canalMeta.shortName || canalMeta.name}
          </span>
          <span class="text-[11px] font-bold ${statusColorClass}">
            ${statusLabel}
          </span>
        </div>

        <h4 class="text-sm font-bold text-white leading-snug">
          ${station.name} ${station.isStale ? '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-0.5">[ข้อมูลไม่อัปเดต]</span>' : ''}
        </h4>
        <p class="text-[11px] text-slate-400 mt-0.5">${station.location || ''}</p>

        ${bodyPopupHtml}
        <div class="mt-2 pt-2 border border-slate-800 rounded-xl px-2 pb-1 cursor-pointer transition hover:border-cyan-400/80 hover:bg-slate-800/80 group" onclick="focusMainChart('${station.id}')" role="button" tabindex="0" aria-label="แตะเพื่อดูกราฟใหญ่ของ ${pinBadge}">
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span>แนวโน้ม 24 ชม.</span>
            <span class="text-[9px] text-cyan-400 opacity-80 group-hover:opacity-100">แตะเพื่อดูกราฟใหญ่ ↗</span>
          </div>
          <div>
            <span id="popup-trend-${station.id}" class="px-2 py-0.5 rounded-md text-[11px] border inline-flex items-center gap-1 ${popupTrend.color} font-semibold mt-1">${popupTrend.icon} ${popupTrend.text}</span>
            <div style="height: 55px; min-height: 55px; position: relative;" class="w-full mt-1">
              <canvas id="${popupChartId}"></canvas>
            </div>
            ${station.isGate ? `
              <div class="flex items-center justify-center gap-2 text-[9px] text-slate-300 mt-1">
                <span class="text-sky-300">━ ใน: ${station.inside?.level != null ? station.inside.level.toFixed(2) : '--'} ม.</span>
                <span class="text-purple-300">━ นอก: ${station.outside?.level != null ? station.outside.level.toFixed(2) : '--'} ม.</span>
              </div>
            ` : ''}
          </div>
        </div>

        ${distText}

        <div class="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span class="whitespace-nowrap">เวลา: <b class="${station.isStale ? 'text-amber-400 font-mono font-semibold' : 'font-mono'}">${formatPopupTime(station.updatedAt || station.time || station.timestamp || station.timestamp)}</b> ${station.isStale && station.staleText ? `<span class="text-[10px] text-amber-400/90">(${station.staleText})</span>` : ''}</span>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" onclick="focusStationCard('${station.id}')" class="text-cyan-400 hover:text-cyan-300 font-semibold whitespace-nowrap">การ์ดสถานี ⬇</button>
            <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="${station.isStale ? 'text-amber-300 hover:text-amber-200' : 'text-sky-400 hover:text-sky-300'} font-semibold flex items-center gap-1">
              <span>ต้นทาง ↗</span>
              <i data-lucide="external-link" class="w-3 h-3"></i>
            </a>
          </div>
        </div>
      </div>
    `;

    const popupOptions = { maxWidth: 290, minWidth: 250, autoPan: false };
    const staleTag = station.isStale ? ' [ข้อมูลไม่อัปเดต]' : '';
    const tooltipText = `<b>${pinBadge}: ${station.name}${staleTag}</b>`;

    if (mapStationMarkers[station.id]) {
      mapStationMarkers[station.id].setLatLng([station.lat, station.lng]);
      mapStationMarkers[station.id].setIcon(customIcon);
      mapStationMarkers[station.id].setPopupContent(popupHtml);
      mapStationMarkers[station.id].off('popupopen');
      mapStationMarkers[station.id].off('popupclose');
      mapStationMarkers[station.id].on('popupopen', () => {
        window.currentOpenPopupStationId = station.id;
        renderStationPopupSparkline(station);
      });
      mapStationMarkers[station.id].on('popupclose', () => {
        if (window.currentOpenPopupStationId === station.id) {
          window.currentOpenPopupStationId = null;
        }
        if (window.activePopupCharts && window.activePopupCharts[station.id]) {
          try { window.activePopupCharts[station.id].destroy(); } catch (e) {}
          delete window.activePopupCharts[station.id];
        }
      });
      if (mapStationMarkers[station.id].getTooltip()) {
        mapStationMarkers[station.id].setTooltipContent(tooltipText);
      }
    } else {
      const marker = L.marker([station.lat, station.lng], { icon: customIcon }).addTo(leafletMap);
      marker.bindPopup(popupHtml, popupOptions);
      marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -14], opacity: 0.95 });
      marker.on('popupopen', () => {
        window.currentOpenPopupStationId = station.id;
        renderStationPopupSparkline(station);
      });
      marker.on('popupclose', () => {
        if (window.currentOpenPopupStationId === station.id) {
          window.currentOpenPopupStationId = null;
        }
        if (window.activePopupCharts && window.activePopupCharts[station.id]) {
          try { window.activePopupCharts[station.id].destroy(); } catch (e) {}
          delete window.activePopupCharts[station.id];
        }
      });

      // Stop marker click event from propagating to the map
      marker.on('click', (e) => {
        if (e && e.originalEvent) {
          L.DomEvent.stopPropagation(e.originalEvent);
        }
      });

      mapStationMarkers[station.id] = marker;
    }
  });

  // Auto Re-render chart if a popup is currently open
  if (window.currentOpenPopupStationId) {
    const openStation = appState.stations.find(s => s.id === window.currentOpenPopupStationId || s.stCode === window.currentOpenPopupStationId);
    if (openStation) {
      setTimeout(() => renderStationPopupSparkline(openStation), 50);
    }
  }

  // 3. Highlight dual-canal boundary connections on map (Visual Boundary Connection)
  if (mapJunctionPolylines && mapJunctionPolylines.length > 0) {
    mapJunctionPolylines.forEach(layer => {
      try { leafletMap.removeLayer(layer); } catch (e) {}
    });
    mapJunctionPolylines = [];
  }

  if (appState.isJunctionArea && appState.junctionCanalGroupIds && appState.userCoords) {
    const userLatLng = [appState.userCoords.lat, appState.userCoords.lng];

    appState.junctionCanalGroupIds.forEach(canalId => {
      const canalStations = appState.stations
        .filter(s => s.canalGroupId === canalId && s.distanceKm !== null && s.distanceKm !== undefined && s.lat && s.lng)
        .sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));

      if (canalStations.length > 0) {
        const targetStation = canalStations[0];
        const canalMeta = CANAL_GROUPS_META[canalId] || {};
        let strokeColor = '#38bdf8'; // sky
        if (canalId === 'khlong-phraya-suren') strokeColor = '#818cf8'; // indigo
        else if (canalId === 'khlong-sam-wa') strokeColor = '#34d399'; // emerald
        else if (canalId === 'bma-main') strokeColor = '#c084fc'; // purple

        const polyline = L.polyline([userLatLng, [targetStation.lat, targetStation.lng]], {
          color: strokeColor,
          weight: 3,
          opacity: 0.75,
          dashArray: '8, 8',
          lineCap: 'round',
          className: 'junction-boundary-line'
        }).addTo(leafletMap);

        const canalLabel = canalMeta.shortName || targetStation.canal || 'สายคลอง';
        polyline.bindTooltip(
          `📍 เชื่อมต่อ ${canalLabel}: ${targetStation.stCode || ''} ${targetStation.name} (${formatDistance(targetStation.distanceKm)})`,
          {
            sticky: true,
            direction: 'center',
            className: 'junction-tooltip'
          }
        );

        mapJunctionPolylines.push(polyline);
      }
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Focus & Zoom map to a specific station (Pan/Zoom on Card Click)
 */
function focusStationOnMap(stationId) {
  if (!leafletMap) {
    initLeafletMap();
  }
  if (!leafletMap) return;

  const station = appState.stations.find(s => s.id === stationId);
  if (!station || !station.lat || !station.lng) return;

  const mapSection = document.getElementById('mapSection');
  if (mapSection) {
    mapSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Ensure map size is updated before flying
  leafletMap.invalidateSize();

  leafletMap.flyTo([station.lat, station.lng], 15, {
    animate: true,
    duration: 1.0
  });

  setTimeout(() => {
    const marker = mapStationMarkers[stationId];
    if (marker) {
      marker.openPopup();
      if (window.lucide) window.lucide.createIcons();
    }
  }, 1050);
}
window.focusStationOnMap = focusStationOnMap;

function getCurrentChartStation() {
  return (appState.stations || []).find(station =>
    station.id === currentChartStationId || station.stCode === currentChartStationId
  ) || ALL_CHART_STATIONS.find(station =>
    station.id === currentChartStationId || station.stCode === currentChartStationId
  ) || null;
}

function focusStationCard(stationId) {
  const card = document.querySelector(`[data-station-card="${stationId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('station-card-focus-flash');
  void card.offsetWidth;
  card.classList.add('station-card-focus-flash');
  setTimeout(() => card.classList.remove('station-card-focus-flash'), 1600);
}
window.focusStationCard = focusStationCard;

function focusChartStationOnMap(stationId) {
  const station = (appState.stations || []).find(item =>
    item.id === stationId || item.stCode === stationId
  );
  if (!station || !station.lat || !station.lng) return;
  const mapSection = document.getElementById('mapSection');
  if (mapSection) mapSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  focusStationOnMap(station.id);
}

function bindChartQuickActions() {
  const mapButton = document.getElementById('chartMapShortcut');
  const cardButton = document.getElementById('chartCardShortcut');
  if (mapButton) mapButton.onclick = () => {
    const station = getCurrentChartStation();
    if (station) focusChartStationOnMap(station.id);
  };
  if (cardButton) cardButton.onclick = () => {
    const station = getCurrentChartStation();
    if (station) focusStationCard(station.id);
  };
}
window.focusChartStationOnMap = focusChartStationOnMap;

function fitMapToAllStations() {
  if (!leafletMap || !appState.stations || appState.stations.length === 0) return;
  const latLngs = appState.stations
    .filter(s => s.lat && s.lng)
    .map(s => [s.lat, s.lng]);

  if (appState.userCoords) {
    latLngs.push([appState.userCoords.lat, appState.userCoords.lng]);
  }

  if (latLngs.length > 0) {
    const bounds = L.latLngBounds(latLngs);
    leafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }
}

function panMapToUser() {
  if (!leafletMap) return;
  if (appState.userCoords) {
    leafletMap.flyTo([appState.userCoords.lat, appState.userCoords.lng], 14, { duration: 1.0 });
    if (mapUserMarker) {
      mapUserMarker.openTooltip();
    }
  } else {
    initGeolocation(true);
  }
}

/**
/**
 * ========================================================
 * TARGET-BASED ALERT LOGIC (3 TARGET STATIONS ONLY)
 * ========================================================
 * Evaluates whether top visual alert banners (Visual Alerts) should trigger.
 * Triggers visual banners ONLY if critical or overflow occurs at:
 * 1. Nearest station to user GPS
 * 2. คลองหกวา ลำลูกกา คลอง 8 (ST-1)
 * 3. จุดวัด สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่ (ST-3)
 * All other stations entering warning/emergency show on dashboard & map, but do NOT trigger top banner.
 * Visual Alerts Only: No sirens, beeps, or audio alerts.
 */

/**
 * Helper to check if a station has reached or exceeded critical threshold (Tier 2: Warning)
 * Checks isCritical, isWarning, isOverflow, status, statusText, and double-checks numeric values (prevent type mismatch for ST-5)
 */
function isStationCritical(s) {
  if (!s) return false;
  if (s.isCritical === true || s.isWarning === true || s.isOverflow === true) return true;
  if (s.tier === 'WARNING' || s.tier === 'EMERGENCY') return true;
  if (s.status === 'warning' || s.status === 'danger' || s.statusSeverity === 'danger') return true;
  if (s.statusText && (s.statusText.includes('วิกฤติ') || s.statusText.includes('ล้นตลิ่ง'))) return true;

  // Dual-sided sluice gate check (e.g. ST-9)
  if (s.isGate) {
    if (s.inside && (s.inside.isWarning || s.inside.isOverflow || s.inside.isCritical)) return true;
    if (s.outside && (s.outside.isWarning || s.outside.isOverflow || s.outside.isCritical)) return true;
    const inLvl = s.inside?.level !== null && s.inside?.level !== undefined ? parseFloat(s.inside.level) : null;
    const inCrit = s.inside?.critical !== null && s.inside?.critical !== undefined ? parseFloat(s.inside.critical) : null;
    if (inLvl !== null && inCrit !== null && !isNaN(inLvl) && !isNaN(inCrit) && inLvl >= inCrit) return true;
    const outLvl = s.outside?.level !== null && s.outside?.level !== undefined ? parseFloat(s.outside.level) : null;
    const outCrit = s.outside?.critical !== null && s.outside?.critical !== undefined ? parseFloat(s.outside.critical) : null;
    if (outLvl !== null && outCrit !== null && !isNaN(outLvl) && !isNaN(outCrit) && outLvl >= outCrit) return true;
  }

  // Numeric double-check (protects ST-5 and all stations against type mismatches or unparsed strings)
  const rawLvl = s.waterLevel ?? s.level ?? s.inside?.level ?? null;
  const rawCrit = s.criticalLevel ?? s.inside?.critical ?? null;
  if (rawLvl !== null && rawCrit !== null) {
    const lvlNum = parseFloat(rawLvl);
    const critNum = parseFloat(rawCrit);
    if (!isNaN(lvlNum) && !isNaN(critNum) && lvlNum >= critNum) {
      return true;
    }
  }

  return false;
}

/**
 * Helper to check if a station has exceeded bank level (Tier 3: Emergency)
 */
function isStationOverflow(s) {
  if (!s) return false;
  if (s.isOverflow === true || s.tier === 'EMERGENCY') return true;
  if (s.status === 'danger' || s.statusSeverity === 'danger') return true;
  if (s.statusText && s.statusText.includes('ล้นตลิ่ง')) return true;

  if (s.isGate) {
    if (s.inside && s.inside.isOverflow) return true;
    if (s.outside && s.outside.isOverflow) return true;
    const inLvl = s.inside?.level !== null && s.inside?.level !== undefined ? parseFloat(s.inside.level) : null;
    const inBank = s.inside?.bank !== null && s.inside?.bank !== undefined ? parseFloat(s.inside.bank) : null;
    if (inLvl !== null && inBank !== null && !isNaN(inLvl) && !isNaN(inBank) && inLvl >= inBank) return true;
    const outLvl = s.outside?.level !== null && s.outside?.level !== undefined ? parseFloat(s.outside.level) : null;
    const outBank = s.outside?.bank !== null && s.outside?.bank !== undefined ? parseFloat(s.outside.bank) : null;
    if (outLvl !== null && outBank !== null && !isNaN(outLvl) && !isNaN(outBank) && outLvl >= outBank) return true;
  }

  const rawLvl = s.waterLevel ?? s.level ?? s.inside?.level ?? null;
  const rawBank = s.bankLevel ?? s.inside?.bank ?? null;
  if (rawLvl !== null && rawBank !== null) {
    const lvlNum = parseFloat(rawLvl);
    const bankNum = parseFloat(rawBank);
    if (!isNaN(lvlNum) && !isNaN(bankNum) && lvlNum >= bankNum) {
      return true;
    }
  }

  return false;
}

function getTargetAlertReason(station) {
  if (!station) return '';
  const reasons = [];

  const isNearest = appState.nearestStation && station.id === appState.nearestStation.id;
  if (isNearest) {
    reasons.push(station.distanceText ? `📍 ใกล้คุณที่สุด (${station.distanceText})` : '📍 ใกล้คุณที่สุด');
  } else if (station.distanceKm !== null && station.distanceKm !== undefined) {
    if (station.distanceKm <= 5.0) {
      reasons.push(`📍 ในรัศมี ${formatDistance(station.distanceKm)}`);
    } else {
      reasons.push(`นอกรัศมี 5 กม. (${formatDistance(station.distanceKm)})`);
    }
  }

  if (
    station.stCode === 'ST-1' ||
    station.id === 'thaiwater_k8' ||
    station.id === 'thaiwater-lamlukka-k8' ||
    station.id === 'thaiwater-คลองหกวา-คลอง8' ||
    (station.name && station.name.includes('คลองหกวา ลำลูกกา คลอง 8')) ||
    (station.name && station.name.includes('คลอง 8'))
  ) {
    reasons.push('🌊 ปตร.คลอง 8');
  } else if (
    station.stCode === 'ST-3' ||
    station.id === 'bma_wf_khw01' ||
    station.id === 'bma-waterflow-หกวา-นิมิตใหม่' ||
    station.id === 'bma-waterflow-nimitmai' ||
    (station.name && station.name.includes('นิมิตใหม่')) ||
    (station.name && station.name.includes('WL.KHW.01'))
  ) {
    reasons.push('💧 สูบน้ำนิมิตใหม่');
  } else if (station.canalGroupName || station.canal) {
    reasons.push(station.canalGroupName || station.canal);
  }

  return reasons.join(' • ') || 'สถานีตรวจวัดน้ำ';
}

/**
 * Format water difference into friendly, conversational Thai for citizens
 * e.g. "ต่ำกว่าตลิ่ง 28 ซม.", "เกินระดับวิกฤติ 12 ซม. (เฝ้าระวัง)", "ล้นตลิ่ง 10 ซม."
 */
function formatFriendlyDiffText(waterLevel, bankLevel, criticalLevel) {
  if (waterLevel === null || waterLevel === undefined || waterLevel === '' || isNaN(parseFloat(waterLevel))) {
    return 'รอข้อมูลตรวจวัด';
  }
  const lvl = parseFloat(waterLevel);
  const bank = parseFloat(bankLevel);
  const crit = criticalLevel !== null && criticalLevel !== undefined && !isNaN(parseFloat(criticalLevel)) ? parseFloat(criticalLevel) : null;

  // Case 1: Overflow (waterLevel >= bankLevel)
  if (!isNaN(bank) && lvl >= bank) {
    const diff = parseFloat((lvl - bank).toFixed(2));
    const cm = Math.round(diff * 100);
    if (cm === 0) return 'แตะระดับตลิ่งพอดี (เสี่ยงล้น)';
    return diff < 1.0 ? `ล้นตลิ่ง ${cm} ซม.` : `ล้นตลิ่ง ${diff.toFixed(2)} ม.`;
  }

  // Case 2: Exceeded Critical Level but not bank (waterLevel >= criticalLevel)
  if (crit !== null && lvl >= crit) {
    const diffCrit = parseFloat((lvl - crit).toFixed(2));
    const cmCrit = Math.round(diffCrit * 100);
    return diffCrit < 1.0 ? `เกินระดับวิกฤติ ${cmCrit} ซม. (เฝ้าระวัง)` : `เกินระดับวิกฤติ ${diffCrit.toFixed(2)} ม. (เฝ้าระวัง)`;
  }

  // Case 3: Normal / Safe (Below both bank and critical)
  if (!isNaN(bank)) {
    const diffBank = parseFloat((bank - lvl).toFixed(2));
    const cmBank = Math.round(diffBank * 100);
    return diffBank < 1.0 ? `ต่ำกว่าตลิ่ง ${cmBank} ซม.` : `ต่ำกว่าตลิ่ง ${diffBank.toFixed(2)} ม.`;
  }

  return 'ระดับปกติ';
}
window.formatFriendlyDiffText = formatFriendlyDiffText;

/**
 * 3-Second Quick Glance Hero Status Summary Card
 * Visual tiers: 🟢 Normal, 🟡/🟠 Warning, 🔴 Emergency
 */
function updateHeroStatusSummary(liveOverflowAll, liveCriticalAll, staleStations) {
  const card = document.getElementById('heroStatusCard');
  const iconWrap = document.getElementById('heroStatusIconWrap');
  const icon = document.getElementById('heroStatusIcon');
  const badge = document.getElementById('heroStatusBadge');
  const headline = document.getElementById('heroStatusHeadline');
  const subtitle = document.getElementById('heroStatusSubtitle');
  const counters = document.getElementById('heroStatusCounters');
  const glow = document.getElementById('heroStatusGlow');

  if (!card || !headline) return;

  const totalStations = (appState.stations && appState.stations.length > 0) ? appState.stations.length : 9;
  const overflowCount = (liveOverflowAll || []).length;
  const criticalCount = (liveCriticalAll || []).length;
  const staleCount = (staleStations || []).length;
  const normalCount = Math.max(0, totalStations - overflowCount - criticalCount - staleCount);

  if (overflowCount > 0) {
    // 🔴 TIER 3: EMERGENCY (เตือนภัยระดับสูง)
    card.className = 'rounded-2xl sm:rounded-3xl p-4 sm:p-5 border transition-all duration-300 shadow-2xl relative overflow-hidden bg-gradient-to-r from-red-950/90 via-slate-900/90 to-slate-900/95 border-red-500/60 shadow-red-500/20 emergency-border-pulse';
    if (glow) glow.className = 'absolute -top-16 -right-16 w-56 h-56 bg-red-500/20 rounded-full blur-3xl pointer-events-none animate-pulse';
    if (iconWrap) iconWrap.className = 'w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/20 text-2xl select-none animate-pulse';
    if (icon) {
      icon.setAttribute('data-lucide', 'alert-octagon');
      icon.className = 'w-6 h-6 sm:w-7 sm:h-7';
    }
    if (badge) {
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-red-500/30 text-red-200 border border-red-400/60 font-mono shadow-sm animate-pulse';
      badge.textContent = '🔴 สถานการณ์: เตือนภัยระดับสูง';
    }
    headline.textContent = 'เตือนภัยระดับสูง — เสี่ยงน้ำล้นตลิ่งในพื้นที่ลุ่มต่ำ';
    headline.className = 'text-base sm:text-lg md:text-xl font-black text-red-200 tracking-tight leading-snug';

    if (subtitle) {
      const names = liveOverflowAll.map(s => s.stCode || s.name).slice(0, 3).join(', ');
      subtitle.textContent = `ตรวจพบ ${overflowCount} จุดน้ำล้นตลิ่งแล้ว (${names})! ให้เร่งขนย้ายทรัพย์สินขึ้นที่สูงทันที`;
      subtitle.className = 'text-xs sm:text-sm text-red-300 mt-0.5 flex items-center gap-1.5 flex-wrap font-medium';
    }

    if (counters) {
      counters.innerHTML = `
        <div class="px-3 py-1.5 rounded-xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-black flex items-center gap-1.5 whitespace-nowrap shadow-md animate-pulse">
          <span class="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
          <span>🚨 ล้นตลิ่ง ${overflowCount} จุด</span>
        </div>
        ${criticalCount > 0 ? `
          <div class="px-3 py-1.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm">
            <span>⚠️ วิกฤติ ${criticalCount} จุด</span>
          </div>
        ` : ''}
        <a href="tel:1784" class="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm transition touch-manipulation">
          <i data-lucide="phone-call" class="w-3.5 h-3.5"></i>
          <span>ปภ. 1784</span>
        </a>
      `;
    }

  } else if (criticalCount > 0) {
    // 🟡/🟠 TIER 2: WARNING (เฝ้าระวัง)
    card.className = 'rounded-2xl sm:rounded-3xl p-4 sm:p-5 border transition-all duration-300 shadow-xl relative overflow-hidden bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-slate-900/95 border-amber-500/50 shadow-amber-500/10';
    if (glow) glow.className = 'absolute -top-16 -right-16 w-56 h-56 bg-amber-500/15 rounded-full blur-3xl pointer-events-none';
    if (iconWrap) iconWrap.className = 'w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20 text-2xl select-none';
    if (icon) {
      icon.setAttribute('data-lucide', 'alert-triangle');
      icon.className = 'w-6 h-6 sm:w-7 sm:h-7';
    }
    if (badge) {
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-400/50 font-mono shadow-sm';
      badge.textContent = '🟡 สถานการณ์: เฝ้าระวังระดับน้ำ';
    }
    headline.textContent = `เฝ้าระวัง ${criticalCount} จุด — คลองพระยาสุเรนทร์น้ำสูง แต่ยังไม่ล้นตลิ่ง`;
    headline.className = 'text-base sm:text-lg md:text-xl font-black text-amber-200 tracking-tight leading-snug';

    if (subtitle) {
      subtitle.textContent = `ระดับน้ำเข้าใกล้เกณฑ์วิกฤติในบางจุด ให้เตรียมความพร้อม/ยกของขึ้นที่สูง และระวังฝนตกสะสม`;
      subtitle.className = 'text-xs sm:text-sm text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap';
    }

    if (counters) {
      counters.innerHTML = `
        <div class="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm">
          <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>เฝ้าระวัง ${criticalCount} จุด</span>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>ปกติ ${normalCount} จุด</span>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-amber-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shadow-sm">
          <i data-lucide="package" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>เตรียมยกของขึ้นที่สูง</span>
        </div>
      `;
    }

  } else {
    // 🟢 TIER 1: NORMAL (ปกติ)
    card.className = 'rounded-2xl sm:rounded-3xl p-4 sm:p-5 border transition-all duration-300 shadow-xl relative overflow-hidden bg-gradient-to-r from-emerald-950/70 via-slate-900/90 to-slate-900/95 border-emerald-500/40';
    if (glow) glow.className = 'absolute -top-16 -right-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none';
    if (iconWrap) iconWrap.className = 'w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/15 text-2xl select-none';
    if (icon) {
      icon.setAttribute('data-lucide', 'shield-check');
      icon.className = 'w-6 h-6 sm:w-7 sm:h-7';
    }
    if (badge) {
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono';
      badge.textContent = '🟢 สถานการณ์ภาพรวม: ปกติ';
    }
    headline.textContent = 'ทุกสายคลองยังต่ำกว่าตลิ่ง ระบายน้ำได้ดี';
    headline.className = 'text-base sm:text-lg md:text-xl font-black text-white tracking-tight leading-snug';

    if (subtitle) {
      subtitle.textContent = staleCount > 0
        ? `ระดับน้ำทุกจุดที่ส่งข้อมูลอยู่ในเกณฑ์ควบคุม การระบายน้ำคลองหกวาและคลองพระยาสุเรนทร์คล่องตัว (มีเซนเซอร์ ${staleCount} จุดกำลังซ่อมบำรุง)`
        : 'ระดับน้ำทั้ง 9 จุดตรวจวัดหลักอยู่ในเกณฑ์ควบคุม การระบายน้ำคลองหกวาและคลองพระยาสุเรนทร์คล่องตัว';
      subtitle.className = 'text-xs sm:text-sm text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap';
    }

    if (counters) {
      counters.innerHTML = `
        <div class="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>ปกติ ${normalCount}/${totalStations} จุด</span>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shadow-sm">
          <i data-lucide="droplets" class="w-3.5 h-3.5 text-sky-400"></i>
          <span>ระบายน้ำคล่องตัว</span>
        </div>
      `;
    }
  }
}
window.updateHeroStatusSummary = updateHeroStatusSummary;

/**
 * Enhanced Two-Tier + Overflow Visual Alert Handler
 * Coordinates:
 * 1. Total Overflow (system-wide)
 * 2. Total Critical (system-wide)
 * Renders all nearby critical cards in 1-col mobile / 2-col PC grid.
 * Provides expandable toggle for outside 5km critical stations.
 */
function handleTwoTierAlerts() {
  const normalBanner = document.getElementById('normalBanner');
  const normalBannerText = document.getElementById('normalBannerText');
  const normalStaleBadge = document.getElementById('normalStaleBadge');

  const emergencyBanner = document.getElementById('emergencyBanner');
  const emergencyStationCards = document.getElementById('emergencyStationCards');
  const emergencyOutsideSection = document.getElementById('emergencyOutsideSection');
  const emergencySummaryHeadline = document.getElementById('emergencySummaryHeadline');
  const emergencyStaleBadge = document.getElementById('emergencyStaleBadge');

  const warningBanner = document.getElementById('warningBanner');
  const warningStationCards = document.getElementById('warningStationCards');
  const warningOutsideSection = document.getElementById('warningOutsideSection');
  const warningSummaryHeadline = document.getElementById('warningSummaryHeadline');
  const warningStaleBadge = document.getElementById('warningStaleBadge');

  // Filter ALL overflow (Tier 3: Emergency) stations in the system (excluding stale stations to prevent false alarms)
  const liveOverflowAll = appState.stations.filter(s => isStationOverflow(s) && !s.isStale);
  const nearbyOverflow = liveOverflowAll
    .filter(s => s.distanceKm !== null && s.distanceKm !== undefined && s.distanceKm <= 5.0)
    .sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
  const outsideOverflow = liveOverflowAll
    .filter(s => s.distanceKm === null || s.distanceKm === undefined || s.distanceKm > 5.0)
    .sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));

  // Filter ALL critical (Tier 2: Warning) stations in the system (excluding stale stations to prevent false alarms)
  const liveCriticalAll = appState.stations.filter(s => isStationCritical(s) && !isStationOverflow(s) && !s.isStale);
  const nearbyCritical = liveCriticalAll
    .filter(s => s.distanceKm !== null && s.distanceKm !== undefined && s.distanceKm <= 5.0)
    .sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
  const outsideCritical = liveCriticalAll
    .filter(s => s.distanceKm === null || s.distanceKm === undefined || s.distanceKm > 5.0)
    .sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));

  // Stale stations count across the entire system
  const staleStations = appState.stations.filter(s => s.isStale);
  const staleCount = staleStations.length;
  const staleBadgeHtml = `⚠️ มี ${staleCount} สถานีที่เซนเซอร์หยุดส่งข้อมูล`;

  // Always update 3-Second Quick Glance Hero Summary Card
  updateHeroStatusSummary(liveOverflowAll, liveCriticalAll, staleStations);

  // Update stale badges on all banners
  if (emergencyStaleBadge) {
    if (staleCount > 0) {
      emergencyStaleBadge.textContent = staleBadgeHtml;
      emergencyStaleBadge.classList.remove('hidden');
    } else {
      emergencyStaleBadge.classList.add('hidden');
    }
  }

  if (warningStaleBadge) {
    if (staleCount > 0) {
      warningStaleBadge.textContent = staleBadgeHtml;
      warningStaleBadge.classList.remove('hidden');
    } else {
      warningStaleBadge.classList.add('hidden');
    }
  }

  if (normalStaleBadge) {
    if (staleCount > 0) {
      normalStaleBadge.textContent = staleBadgeHtml;
      normalStaleBadge.classList.remove('hidden');
      if (normalBannerText) {
        normalBannerText.textContent = '🟢 สถานการณ์ปกติ: ระดับน้ำสถานีที่ส่งข้อมูลอยู่ในเกณฑ์ควบคุม';
      }
    } else {
      normalStaleBadge.classList.add('hidden');
      if (normalBannerText) {
        normalBannerText.textContent = '🟢 สถานการณ์ปกติ: ระดับน้ำทุกจุดตรวจวัดหลักอยู่ในเกณฑ์ควบคุม';
      }
    }
  }

  if (liveOverflowAll.length > 0) {
    // ----------------------------------------------------
    // TIER 3: EMERGENCY (🔴 ตรวจพบสถานีน้ำล้นตลิ่งสดใหม่)
    // ----------------------------------------------------
    if (normalBanner) normalBanner.classList.add('hidden');
    if (warningBanner) warningBanner.classList.add('hidden');
    if (emergencyBanner) {
      emergencyBanner.classList.remove('hidden');

      if (emergencySummaryHeadline) {
        if (nearbyOverflow.length > 0) {
          emergencySummaryHeadline.textContent = `🚨 ฉุกเฉิน: ตรวจพบ ${nearbyOverflow.length} สถานีใกล้ตัวคุณ (และ ${liveOverflowAll.length} สถานีในพื้นที่) น้ำล้นตลิ่งแล้ว!`;
        } else {
          emergencySummaryHeadline.textContent = `🚨 ฉุกเฉิน: ตรวจพบ ${liveOverflowAll.length} สถานีในพื้นที่น้ำล้นตลิ่งแล้ว! (อยู่นอกรัศมี 5 กม. ของคุณ)`;
        }
      }

      if (emergencyStationCards) {
        const primaryCards = nearbyOverflow.length > 0 ? nearbyOverflow : outsideOverflow;
        emergencyStationCards.innerHTML = renderAlertStationCards(primaryCards, 'EMERGENCY');
      }

      if (emergencyOutsideSection) {
        if (nearbyOverflow.length > 0 && outsideOverflow.length > 0) {
          const outsideCodes = outsideOverflow.map(s => s.stCode || s.name).join(', ');
          emergencyOutsideSection.innerHTML = `
            <div class="pt-3 border-t border-red-300/20">
              <button type="button" onclick="toggleOutsideAlertCards('emergency')" aria-label="ดูสถานีน้ำล้นตลิ่งนอกรัศมี 5 กม. เพิ่มเติม" class="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl bg-red-950/70 hover:bg-red-900/80 border border-red-400/40 text-red-200 text-xs font-bold flex items-center justify-between sm:justify-start gap-2 transition active:scale-98 cursor-pointer touch-manipulation">
                <div class="flex items-center gap-1.5">
                  <i data-lucide="eye" class="w-4 h-4 text-red-300"></i>
                  <span>ดูสถานีน้ำล้นตลิ่งนอกรัศมี 5 กม. เพิ่มเติม (${outsideOverflow.length} จุด: ${outsideCodes})</span>
                </div>
                <i id="outsideEmergencyChevron" data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-200"></i>
              </button>
              <div id="outsideEmergencyCards" class="hidden mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                ${renderAlertStationCards(outsideOverflow, 'EMERGENCY')}
              </div>
            </div>
          `;
        } else {
          emergencyOutsideSection.innerHTML = '';
        }
      }
    }

    document.body.classList.add('emergency-active');
    updateGuidelinesAutoExpand(true, false);

  } else if (liveCriticalAll.length > 0) {
    // ----------------------------------------------------
    // TIER 2: WARNING (🟡/🟠 ตรวจพบสถานีเข้าสู่เกณฑ์วิกฤติสดใหม่)
    // ----------------------------------------------------
    document.body.classList.remove('emergency-active');
    if (normalBanner) normalBanner.classList.add('hidden');
    if (emergencyBanner) emergencyBanner.classList.add('hidden');

    if (warningBanner) {
      warningBanner.classList.remove('hidden');

      if (warningSummaryHeadline) {
        if (nearbyCritical.length > 0) {
          warningSummaryHeadline.textContent = `⚠️ เตือนภัย: ตรวจพบ ${nearbyCritical.length} สถานีใกล้ตัวคุณ (และ ${liveCriticalAll.length} สถานีในพื้นที่) เข้าสู่เกณฑ์วิกฤติ`;
        } else {
          warningSummaryHeadline.textContent = `⚠️ เตือนภัย: ตรวจพบ ${liveCriticalAll.length} สถานีในพื้นที่เข้าสู่เกณฑ์วิกฤติ (อยู่นอกรัศมี 5 กม. ของคุณ)`;
        }
      }

      if (warningStationCards) {
        const primaryCards = nearbyCritical.length > 0 ? nearbyCritical : outsideCritical;
        warningStationCards.innerHTML = renderAlertStationCards(primaryCards, 'WARNING');
      }

      if (warningOutsideSection) {
        if (nearbyCritical.length > 0 && outsideCritical.length > 0) {
          const outsideCodes = outsideCritical.map(s => s.stCode || s.name).join(', ');
          warningOutsideSection.innerHTML = `
            <div class="pt-3 border-t border-amber-300/20">
              <button type="button" onclick="toggleOutsideAlertCards('warning')" aria-label="ดูสถานีวิกฤตินอกรัศมี 5 กม. เพิ่มเติม" class="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-400/40 text-amber-200 text-xs font-bold flex items-center justify-between sm:justify-start gap-2 transition active:scale-98 cursor-pointer touch-manipulation">
                <div class="flex items-center gap-1.5">
                  <i data-lucide="eye" class="w-4 h-4 text-amber-300"></i>
                  <span>ดูสถานีวิกฤตินอกรัศมี 5 กม. เพิ่มเติม (${outsideCritical.length} จุด: ${outsideCodes})</span>
                </div>
                <i id="outsideWarningChevron" data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-200"></i>
              </button>
              <div id="outsideWarningCards" class="hidden mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                ${renderAlertStationCards(outsideCritical, 'WARNING')}
              </div>
            </div>
          `;
        } else {
          warningOutsideSection.innerHTML = '';
        }
      }
    }

    updateGuidelinesAutoExpand(false, true);

  } else {
    // ----------------------------------------------------
    // TIER 1: NORMAL (Visual Alert Off)
    // ----------------------------------------------------
    document.body.classList.remove('emergency-active');
    if (emergencyBanner) emergencyBanner.classList.add('hidden');
    if (warningBanner) warningBanner.classList.add('hidden');
    if (normalBanner) normalBanner.classList.remove('hidden');

    updateGuidelinesAutoExpand(false, false);
  }

  if (window.lucide) window.lucide.createIcons();
}

function toggleOutsideAlertCards(tier) {
  const isEmerg = tier === 'emergency';
  const container = document.getElementById(isEmerg ? 'outsideEmergencyCards' : 'outsideWarningCards');
  const chevron = document.getElementById(isEmerg ? 'outsideEmergencyChevron' : 'outsideWarningChevron');
  if (!container) return;

  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
  } else {
    container.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
  }
  if (window.lucide) window.lucide.createIcons();
}
window.toggleOutsideAlertCards = toggleOutsideAlertCards;

/**
 * ================= FLOOD EMERGENCY GUIDELINES INTERACTION =================
 */
let prevGuidelinesAlertLevel = 'NORMAL';
let guidelinesUserManuallyClosed = false;

function setupGuidelinesToggle() {
  const btn = document.getElementById('btnToggleGuidelines');
  const accordion = document.getElementById('guidelinesAccordion');
  const chevron = document.getElementById('guidelinesChevron');
  const toggleText = document.getElementById('guidelinesToggleText');

  if (!btn || !accordion) return;

  btn.addEventListener('click', () => {
    const isExpanded = accordion.classList.contains('expanded');
    if (!isExpanded) {
      accordion.classList.add('expanded');
      btn.setAttribute('aria-expanded', 'true');
      if (chevron) chevron.classList.add('rotate-180');
      if (toggleText) toggleText.textContent = 'ย่อเก็บ';
      guidelinesUserManuallyClosed = false;
    } else {
      accordion.classList.remove('expanded');
      btn.setAttribute('aria-expanded', 'false');
      if (chevron) chevron.classList.remove('rotate-180');
      if (toggleText) toggleText.textContent = 'ดูแนวทางปฏิบัติ';
      guidelinesUserManuallyClosed = true;
    }
    if (window.lucide) window.lucide.createIcons();
  });
}

function updateGuidelinesAutoExpand(isEmergency, isWarning) {
  const section = document.getElementById('floodGuidelinesSection');
  const accordion = document.getElementById('guidelinesAccordion');
  const btn = document.getElementById('btnToggleGuidelines');
  const chevron = document.getElementById('guidelinesChevron');
  const toggleText = document.getElementById('guidelinesToggleText');
  const statusPill = document.getElementById('guidelinesStatusPill');
  const headerIcon = document.getElementById('guidelinesHeaderIcon');

  if (!section || !accordion) return;

  const currentLevel = isEmergency ? 'EMERGENCY' : (isWarning ? 'WARNING' : 'NORMAL');
  
  // If alert status escalates, force auto-expansion even if previously collapsed
  if (currentLevel !== prevGuidelinesAlertLevel && (isEmergency || isWarning)) {
    guidelinesUserManuallyClosed = false;
  }
  prevGuidelinesAlertLevel = currentLevel;

  if (isEmergency) {
    if (!guidelinesUserManuallyClosed) {
      accordion.classList.add('expanded');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      if (chevron) chevron.classList.add('rotate-180');
      if (toggleText) toggleText.textContent = 'ย่อเก็บ';
    }

    // Emergency UI Theme
    section.className = 'rounded-2xl border-2 border-red-500/80 bg-red-950/20 backdrop-blur-md overflow-hidden transition-all duration-300 shadow-xl shadow-red-950/30';
    if (headerIcon) {
      headerIcon.className = 'w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center shrink-0 shadow-sm animate-pulse';
    }
    if (statusPill) {
      statusPill.classList.remove('hidden');
      statusPill.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm animate-pulse';
      statusPill.textContent = '🔴 ระดับฉุกเฉิน - ปฏิบัติทันที';
    }
  } else if (isWarning) {
    if (!guidelinesUserManuallyClosed) {
      accordion.classList.add('expanded');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      if (chevron) chevron.classList.add('rotate-180');
      if (toggleText) toggleText.textContent = 'ย่อเก็บ';
    }

    // Warning UI Theme
    section.className = 'rounded-2xl border-2 border-amber-500/70 bg-amber-950/20 backdrop-blur-md overflow-hidden transition-all duration-300 shadow-xl shadow-amber-950/20';
    if (headerIcon) {
      headerIcon.className = 'w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 shadow-sm';
    }
    if (statusPill) {
      statusPill.classList.remove('hidden');
      statusPill.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm';
      statusPill.textContent = '🟠 เกณฑ์วิกฤติ - เตรียมความพร้อม';
    }
  } else {
    // Normal Conditions: Default Collapsed
    section.className = 'rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md overflow-hidden transition-all duration-300 shadow-lg';
    if (headerIcon) {
      headerIcon.className = 'w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-sm';
    }
    if (statusPill) {
      statusPill.classList.add('hidden');
    }
    // If not manually opened by the user, keep it collapsed smoothly
    if (!guidelinesUserManuallyClosed && (!btn || btn.getAttribute('aria-expanded') !== 'true')) {
      accordion.classList.remove('expanded');
      if (chevron) chevron.classList.remove('rotate-180');
      if (toggleText) toggleText.textContent = 'ดูแนวทางปฏิบัติ';
    }
  }
}

/**
 * Render Station Cards inside Alert Banners (Grid Layout)
 * Displays only target stations with clear difference numbers:
 * e.g. +0.19 ม. (เกินเกณฑ์วิกฤติ), -0.21 ม. ถึงตลิ่ง (หรือ +0.15 ม. ล้นตลิ่งแล้ว!)
 */
function renderAlertStationCards(stations, tier) {
  const isEmerg = tier === 'EMERGENCY';

  return stations.map(s => {
    const isStationOverflow = s.isOverflow || isEmerg;
    const targetReason = getTargetAlertReason(s);

    const distTag = s.distanceText
      ? `<span class="text-[11px] text-sky-300 font-bold flex items-center gap-1 font-mono"><i data-lucide="navigation" class="w-3 h-3"></i> ${s.distanceText}</span>`
      : '';

    const bgCard = isStationOverflow
      ? 'bg-red-950/75 border-red-400/60 shadow-lg'
      : 'bg-amber-950/75 border-amber-400/50 shadow-lg';

    // SPECIAL HANDLING FOR SLUICE GATE IN ALERT BANNERS
    if (s.isGate && s.inside && s.outside) {
      return `
        <div data-station-card="${s.id}" onclick="focusStationOnMap('${s.id}')" class="station-card ${s.isStale ? 'station-stale' : ''} rounded-xl p-3 border ${bgCard} flex flex-col justify-between shadow-md cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/15 hover:ring-2 hover:ring-white/40">
          <div>
            <div class="mb-1.5 flex items-center justify-between gap-1 flex-wrap">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-white/15 text-white border border-white/20">
                <i data-lucide="crosshair" class="w-2.5 h-2.5 text-sky-300"></i>
                <span>${targetReason}</span>
              </span>
              <div class="flex items-center gap-1">
                ${s.isStale ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">⚠️ ข้อมูลไม่อัปเดต</span>' : ''}
                <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${isStationOverflow ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-950'}">
                  ${s.alertBadgeText || (isStationOverflow ? '🚨 ล้นตลิ่ง' : '⚠️ วิกฤติ')}
                </span>
              </div>
            </div>

            <h4 class="text-xs sm:text-sm font-bold text-white leading-tight flex items-center gap-1.5 flex-wrap">
              ${s.stCode ? `<span class="text-amber-300 font-mono font-bold">${s.stCode}</span>` : ''}
              ${getCanalBadgeHtml(s)}
              <span>${formatStationTitle(s.name)}</span>
            </h4>

            <!-- Dual Side Water Levels in Alert Banner -->
            <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/10 text-center">
              <div class="bg-black/30 p-2 rounded-lg border border-white/5">
                <div class="text-[10px] font-bold text-sky-300">🌊 ฝั่งด้านใน</div>
                <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${s.inside.level !== null ? s.inside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-white/70 cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span></div>
                <div class="text-[9px] font-bold mt-0.5 ${s.inside.isOverflow ? 'text-red-300' : (s.inside.isWarning ? 'text-amber-300' : 'text-emerald-300')}">
                  ${formatFriendlyDiffText(s.inside.level, s.inside.bank, s.inside.critical)}
                </div>
              </div>

              <div class="bg-black/30 p-2 rounded-lg border border-white/5">
                <div class="text-[10px] font-bold text-purple-300">🌊 ฝั่งด้านนอก</div>
                <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${s.outside.level !== null ? s.outside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-white/70 cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span></div>
                <div class="text-[9px] font-bold mt-0.5 ${s.outside.isOverflow ? 'text-red-300' : (s.outside.isWarning ? 'text-amber-300' : 'text-emerald-300')}">
                  ${formatFriendlyDiffText(s.outside.level, s.outside.bank, s.outside.critical)}
                </div>
              </div>
            </div>

            <!-- Head Difference & Gate Opening -->
            <div class="mt-2 text-[10px] py-1.5 px-2 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between text-white/80">
              <span>ความต่างระดับ: <b class="text-cyan-300 font-mono">${s.diffInOutText || ''}</b></span>
              <span>เปิด: <b class="text-amber-300 font-mono">${s.gateOpening ? `${s.gateOpening.toFixed(2)} ม.` : '0.43 ม.'}</b></span>
            </div>
          </div>

          <div class="mt-auto pt-2.5 border-t border-white/10 flex flex-col items-stretch gap-2 text-[11px] text-white/70 w-full shrink-0">
            <div class="flex items-center gap-1 min-w-0 text-white/70 text-[11px] whitespace-nowrap">
              <span class="shrink-0 text-white/50">เวลา:</span>
                <b class="${s.isStale ? 'text-amber-300 font-mono font-semibold' : ''} shrink-0">${formatCardDateTime(s.updatedAt || s.time || s.timestamp)}</b>
              ${s.isStale && s.staleText ? `<span class="text-[10px] text-amber-300/90 whitespace-nowrap">(${s.staleText})</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              ${distTag}
              <button type="button" onclick="event.stopPropagation(); focusStationOnMap('${s.id}')" aria-label="ดูตำแหน่ง ${s.name} บนแผนที่" class="px-2 py-1 min-h-[44px] rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-bold flex items-center gap-1 text-[11px] transition touch-manipulation whitespace-nowrap" title="ดูตำแหน่งบนแผนที่">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 shrink-0"></i>
                <span>ดูบนแผนที่</span>
              </button>
              <a href="${getStationSourceUrl(s)}" data-station-source-link="${s.id}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้าเว็บต้นทางข้อมูลของ ${s.name} (เปิดแท็บใหม่)" class="px-2 py-1 min-h-[44px] rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-bold border border-white/20 flex items-center gap-1 text-[11px] transition touch-manipulation whitespace-nowrap" title="ตรวจสอบต้นทาง">
                <i data-lucide="globe" class="w-3.5 h-3.5 shrink-0"></i>
                <span>ลิงก์ต้นทาง</span>
                <i data-lucide="external-link" class="w-3 h-3 text-white/70 shrink-0"></i>
              </a>
            </div>
          </div>
        </div>
      `;
    }

    // STANDARD CARD IN ALERT BANNER
    // Calculate critical difference
    let diffCritStr = '--';
    let isCritExceeded = false;
    if (s.waterLevel !== null && s.criticalLevel !== null) {
      const dCrit = parseFloat((s.waterLevel - s.criticalLevel).toFixed(2));
      const cmCrit = Math.round(Math.abs(dCrit) * 100);
      if (dCrit >= 0) {
        diffCritStr = dCrit < 1.0 ? `เกินระดับวิกฤติ ${cmCrit} ซม.` : `เกินระดับวิกฤติ ${dCrit.toFixed(2)} ม.`;
        isCritExceeded = true;
      } else {
        diffCritStr = Math.abs(dCrit) < 1.0 ? `อีก ${cmCrit} ซม. ถึงเกณฑ์วิกฤติ` : `อีก ${Math.abs(dCrit).toFixed(2)} ม. ถึงเกณฑ์วิกฤติ`;
      }
    }

    // Calculate bank difference
    let diffBankStr = '--';
    let isBankOverflow = false;
    if (s.waterLevel !== null && s.bankLevel !== null) {
      const dBank = parseFloat((s.waterLevel - s.bankLevel).toFixed(2));
      const cmBank = Math.round(Math.abs(dBank) * 100);
      if (dBank >= 0) {
        diffBankStr = dBank < 1.0 ? `ล้นตลิ่ง ${cmBank} ซม.!` : `ล้นตลิ่ง ${dBank.toFixed(2)} ม.!`;
        isBankOverflow = true;
      } else {
        diffBankStr = Math.abs(dBank) < 1.0 ? `ต่ำกว่าตลิ่ง ${cmBank} ซม.` : `ต่ำกว่าตลิ่ง ${Math.abs(dBank).toFixed(2)} ม.`;
      }
    }

    return `
      <div data-station-card="${s.id}" onclick="focusStationOnMap('${s.id}')" class="station-card ${s.isStale ? 'station-stale' : ''} rounded-xl p-3 border ${bgCard} flex flex-col justify-between shadow-md cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/15 hover:ring-2 hover:ring-white/40">
        <div>
          <!-- Target Station Trigger Tag -->
          <div class="mb-1.5 flex items-center justify-between gap-1 flex-wrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-white/15 text-white border border-white/20">
              <i data-lucide="crosshair" class="w-2.5 h-2.5 text-sky-300"></i>
              <span>${targetReason}</span>
            </span>
            <div class="flex items-center gap-1">
              ${s.isStale ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">⚠️ ข้อมูลไม่อัปเดต</span>' : ''}
              <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${isStationOverflow ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-950'}">
                ${isStationOverflow ? '🚨 ล้นตลิ่ง' : '⚠️ วิกฤติ'}
              </span>
            </div>
          </div>

          <!-- Station Name -->
          <h4 class="text-xs sm:text-sm font-bold text-white leading-tight flex items-center gap-1.5 flex-wrap">
            ${s.stCode ? `<span class="text-amber-300 font-mono font-bold">${s.stCode}</span>` : ''}
            ${getCanalBadgeHtml(s)}
            <span>${formatStationTitle(s.name)}</span>
          </h4>

          <!-- Big Water Level -->
          <div class="flex items-baseline justify-between gap-2 mt-2">
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl sm:text-3xl font-black text-white font-mono-numbers">
                ${(s.waterLevel !== null && s.waterLevel !== undefined) ? s.waterLevel.toFixed(2) : '--'}
              </span>
              <span class="text-[10px] sm:text-xs text-white/70 cursor-help" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span>
            </div>
            ${s.isStale ? '<span class="text-[10px] text-amber-300 font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">🕒 (ข้อมูลเดิม)</span>' : ''}
          </div>

          <!-- Prominent Difference Metrics (Wrapping safely on small screens) -->
          <div class="space-y-1.5 mt-2.5">
            <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] sm:text-xs py-1.5 px-2 rounded-lg bg-black/40 border border-white/10">
              <span class="text-white/70">เทียบเกณฑ์วิกฤติ (${s.criticalLevel} ม.):</span>
              <b class="font-mono font-bold ${isCritExceeded ? 'text-amber-300' : 'text-emerald-300'}">${diffCritStr}</b>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] sm:text-xs py-1.5 px-2 rounded-lg bg-black/40 border border-white/10">
              <span class="text-white/70">เทียบระดับตลิ่ง (${s.bankLevel} ม.):</span>
              <b class="font-mono font-black ${isBankOverflow ? 'text-red-300 animate-pulse' : 'text-emerald-300'}">${diffBankStr}</b>
            </div>
          </div>
        </div>

        <div class="mt-auto pt-2.5 border-t border-white/10 flex flex-col items-stretch gap-2 text-[11px] text-white/70 w-full shrink-0">
          <div class="flex items-center gap-1 min-w-0 text-white/70 text-[11px] whitespace-nowrap">
            <span class="shrink-0 text-white/50">เวลา:</span>
            <b class="${s.isStale ? 'text-amber-300 font-mono font-semibold' : ''} shrink-0">${formatCardDateTime(s.updatedAt || s.time || s.timestamp)}</b>
            ${s.isStale && s.staleText ? `<span class="text-[10px] text-amber-300/90 whitespace-nowrap">(${s.staleText})</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${distTag}
            <button type="button" onclick="event.stopPropagation(); focusStationOnMap('${s.id}')" aria-label="ดูตำแหน่ง ${s.name} บนแผนที่" class="px-2 py-1 min-h-[44px] rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-bold flex items-center gap-1 text-[11px] transition touch-manipulation whitespace-nowrap" title="ดูตำแหน่งบนแผนที่">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 shrink-0"></i>
              <span>ดูบนแผนที่</span>
            </button>
            <a href="${getStationSourceUrl(s)}" data-station-source-link="${s.id}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้าเว็บต้นทางข้อมูลของ ${s.name} (เปิดแท็บใหม่)" class="px-2 py-1 min-h-[44px] rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-bold border border-white/20 flex items-center gap-1 text-[11px] transition touch-manipulation whitespace-nowrap" title="ตรวจสอบต้นทาง">
              <i data-lucide="globe" class="w-3.5 h-3.5 shrink-0"></i>
              <span>ลิงก์ต้นทาง</span>
              <i data-lucide="external-link" class="w-3 h-3 text-white/70 shrink-0"></i>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


/**
 * Render All Dashboard Sections
 */
function renderAllSections() {
  renderSection1SmartCanalGPS();
  renderSection2PinnedPriority();
  renderSection3AllCanals();
  triggerWaterFillTransitions();
}

/**
 * SECTION 1: Smart Canal GPS Section
 * 1. Filter and highlight stations within <= 5 km radius first with clear distance in km.
 * 2. Order stations from Upstream -> Downstream (ต้นน้ำ ➡️ ปลายน้ำ).
 * 3. Provide interactive canal line explorer tabs.
 */
function renderSection1SmartCanalGPS() {
  const container = document.getElementById('smartCanalSectionContainer');
  if (!container) return;

  const isJunction = appState.isJunctionArea;
  const activeCanalGroupId = appState.selectedCanalTab || (isJunction ? 'nearby-all' : (appState.nearestCanalGroup || 'khlong-phraya-suren'));
  const isNearbyAllActive = activeCanalGroupId === 'nearby-all';
  const canalMeta = CANAL_GROUPS_META[activeCanalGroupId] || CANAL_GROUPS_META['khlong-phraya-suren'];

  // 1. Nearby stations within <= 5.0 km, strictly sorted by actual distance (ใกล้ ➡️ ไกล)
  const nearbyStations = appState.stations
    .filter(s => s.distanceKm !== null && s.distanceKm !== undefined && s.distanceKm <= 5.0)
    .sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));

  // 2. Stations in selected canal line tab, sorted upstream -> downstream (flowOrder ascending)
  const canalStations = appState.stations
    .filter(s => s.canalGroupId === activeCanalGroupId)
    .sort((a, b) => (a.flowOrder || 1) - (b.flowOrder || 1));

  const nearest = appState.nearestStation;
  const isNearestInThisGroup = nearest && nearest.canalGroupId === activeCanalGroupId;
  const distanceText = nearest && nearest.distanceText ? nearest.distanceText : '';

  // Canal Group Switcher Tabs (Thumb friendly >= 40px touch target)
  let nearbyTabHtml = '';
  if (isJunction || nearbyStations.length > 0) {
    const junctionCount = appState.junctionCanalNames?.length || 2;
    const tabLabel = isJunction
      ? `⚡ สถานีในรัศมีใกล้คุณ (${junctionCount === 2 ? 'แสดงทั้ง 2 สายคลอง' : `แสดงทั้ง ${junctionCount} สายคลอง`})`
      : `⚡ สถานีในรัศมีใกล้คุณ (${nearbyStations.length} จุด)`;

    nearbyTabHtml = `
      <button type="button" onclick="switchCanalTab('nearby-all')" aria-label="สลับแสดงสถานีใกล้ฉัน ${tabLabel}" class="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 touch-manipulation active:scale-95 ${
        isNearbyAllActive
          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/25 ring-2 ring-amber-400/50'
          : 'bg-slate-900 text-amber-300 hover:text-amber-100 border border-amber-500/30'
      }">
        <span class="w-2 h-2 rounded-full ${isNearbyAllActive ? 'bg-slate-950 animate-pulse' : 'bg-amber-400 live-pulse'}"></span>
        <span>${tabLabel}</span>
      </button>
    `;
  }

  const canalTabsHtml = Object.keys(CANAL_GROUPS_META).map(k => {
    const meta = CANAL_GROUPS_META[k];
    const isActive = k === activeCanalGroupId;
    const isNearby = isJunction
      ? (appState.junctionCanalGroupIds && appState.junctionCanalGroupIds.includes(k))
      : (appState.nearestCanalGroup === k);

    return `
      <button type="button" onclick="switchCanalTab('${k}')" aria-label="เลือกสายคลอง ${meta.shortName}" class="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 touch-manipulation active:scale-95 ${
        isActive
          ? 'bg-blue-600 text-white shadow-md font-bold'
          : 'bg-slate-900 text-slate-300 hover:text-slate-100 border border-slate-800'
      }">
        ${isNearby ? '<span class="w-2 h-2 rounded-full bg-sky-400 live-pulse"></span>' : ''}
        <span>${meta.shortName}</span>
      </button>
    `;
  }).join('');

  const tabsHtml = nearbyTabHtml + canalTabsHtml;

  // Header content based on Junction or Single Canal mode
  let headerBadgeHtml = '';
  let headerTitleHtml = '';
  let headerSubtitleHtml = '';

  if (isJunction) {
    const canalNamesStr = appState.junctionCanalNames.join(' + ');
    headerBadgeHtml = `
      <span class="px-3 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-mono">
        <i data-lucide="navigation" class="w-3.5 h-3.5 text-amber-400"></i>
        <span>📍 ส่วนที่ 1: สถานีและสายคลองตามตำแหน่ง GPS</span>
      </span>
      <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1 font-mono">
        <i data-lucide="shuffle" class="w-3 h-3 text-sky-400"></i>
        <span>พื้นที่เชื่อมต่อ ${appState.junctionCanalNames.length} สายคลอง</span>
      </span>
      ${
        distanceText
          ? `<span class="distance-pill"><i data-lucide="locate" class="w-3 h-3"></i> จุดที่ใกล้สุด: ${distanceText}</span>`
          : ''
      }
    `;

    if (isNearbyAllActive) {
      headerTitleHtml = `📍 คุณอยู่ในพื้นที่เชื่อมต่อ ${appState.junctionCanalNames.length === 2 ? '2 สายคลอง' : `${appState.junctionCanalNames.length} สายคลอง`}: ${canalNamesStr}`;
      headerSubtitleHtml = `ตรวจพบสถานีตรวจวัดน้ำในรัศมี 5.0 กม. ครอบคลุมทั้ง ${appState.junctionCanalNames.join(' และ ')} (เรียงตามระยะทางจริง ใกล้ ➡️ ไกล)`;
    } else {
      headerTitleHtml = `คุณอยู่ใกล้: ${canalMeta.name} <span class="text-xs font-normal text-sky-300/80">(ในพื้นที่เชื่อมต่อ ${canalNamesStr})</span>`;
      headerSubtitleHtml = canalMeta.directionNote;
    }
  } else {
    headerBadgeHtml = `
      <span class="px-3 py-0.5 rounded-full text-xs font-black bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1">
        <i data-lucide="navigation" class="w-3.5 h-3.5 text-sky-400"></i>
        <span>📍 ส่วนที่ 1: สถานีและสายคลองตามตำแหน่ง GPS</span>
      </span>
      ${
        (isNearestInThisGroup || isNearbyAllActive) && distanceText
          ? `<span class="distance-pill"><i data-lucide="locate" class="w-3 h-3"></i> ${distanceText}</span>`
          : ''
      }
    `;

    headerTitleHtml = isNearbyAllActive ? `สถานีในรัศมีใกล้ตัวคุณ (≤ 5 กม.)` : `คุณอยู่ใกล้: ${canalMeta.name}`;
    headerSubtitleHtml = isNearbyAllActive ? 'สถานีรอบตัวคุณเรียงตามระยะทางจริงจากใกล้ไปไกล' : canalMeta.directionNote;
  }

  // Body content: Unified nearby distance view OR Single canal flow order view
  let bodyContentHtml = '';

  if (isNearbyAllActive) {
    if (nearbyStations.length > 0) {
      bodyContentHtml = `
        <div class="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block animate-pulse"></span>
            <h3 class="text-xs sm:text-sm font-bold text-amber-200 flex items-center gap-1.5">
              <span>🟡 สถานีในรัศมีรอบตัวคุณ (≤ 5.0 กม.)</span>
              <span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 font-mono font-bold">${nearbyStations.length} จุด</span>
            </h3>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-amber-300/90 font-mono">
            <span>⚡ เรียงตามระยะทางจริง (ใกล้ ➡️ ไกล) ไม่แยกสายคลอง</span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(nearbyStations.length, 4)} gap-4">
          ${nearbyStations.map(station => {
            if (station.isGate || station.id === 'bma_weather_21') {
              return renderSluiceGateTwinCard(station, station.stCode, nearbyStations.length, true);
            }
            return renderCanalFlowCard(station, station.stCode, nearbyStations.length, true);
          }).join('')}
        </div>
      `;
    } else {
      bodyContentHtml = `
        <div class="mb-5 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <i data-lucide="info" class="w-4 h-4 text-sky-400 shrink-0"></i>
            <span>ขณะนี้ตำแหน่งของคุณอยู่นอกรัศมี 5 กม. ของทุกสถานี (สถานีที่ใกล้ที่สุด: <b class="text-slate-200">${nearest?.name || '--'}</b> ${distanceText ? `— ${distanceText}` : ''})</span>
          </div>
          <button onclick="panMapToUser()" class="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 active:bg-sky-500/30 text-sky-300 font-semibold text-xs border border-sky-500/30 shrink-0 flex items-center gap-1 touch-manipulation">
            <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
            <span>ดูตำแหน่งบนแผนที่</span>
          </button>
        </div>
      `;
    }
  } else {
    bodyContentHtml = `
      <div class="mb-3 px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-300">
        <div class="flex items-center gap-2">
          <i data-lucide="arrow-down-narrow-wide" class="w-4 h-4 text-sky-400 shrink-0"></i>
          <span class="font-medium">${canalMeta.flowLabel}</span>
        </div>
        <span class="text-[11px] text-slate-400 font-mono">เรียงจากต้นน้ำสู่ปลายน้ำ (Upstream ➡️ Downstream)</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(canalStations.length, 4)} gap-4">
        ${canalStations.map(station => {
          const isNearby = station.distanceKm !== null && station.distanceKm !== undefined && station.distanceKm <= 5.0;
          if (station.isGate || station.id === 'bma_weather_21') {
            return renderSluiceGateTwinCard(station, station.stCode, canalStations.length, isNearby);
          }
          return renderCanalFlowCard(station, station.stCode, canalStations.length, isNearby);
        }).join('')}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="rounded-2xl sm:rounded-3xl glass-panel p-4 sm:p-6 border border-slate-800 relative overflow-hidden">
      <!-- Section Header -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80 mb-4">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-1">
            ${headerBadgeHtml}
          </div>
          <h2 class="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            ${headerTitleHtml}
          </h2>
          <p class="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <i data-lucide="info" class="w-3.5 h-3.5 text-slate-500 shrink-0"></i>
            <span>${headerSubtitleHtml}</span>
          </p>
        </div>

        <!-- Canal Line Selector Tabs -->
        <div class="flex items-center flex-wrap gap-1.5">
          ${tabsHtml}
        </div>
      </div>

      <!-- Station Cards Content -->
      ${bodyContentHtml}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

function switchCanalTab(canalId) {
  appState.selectedCanalTab = canalId;
  renderSection1SmartCanalGPS();
  triggerWaterFillTransitions();
}
window.switchCanalTab = switchCanalTab;

/**
 * Render individual card in canal flow sequence
 */
function renderCanalFlowCard(station, badgeCode, totalCount, isHighlightNearby = false) {
  const isDanger = station.isOverflow;
  const isWarning = station.isWarning;

  let cardBorder = isHighlightNearby ? 'border-amber-500/50 bg-slate-900/95 shadow-lg' : 'border-slate-800';
  let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  let fillGrad = 'bg-gradient-to-t from-blue-700 to-sky-500';

  if (isDanger) {
    cardBorder = 'glass-panel-danger';
    badgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
    fillGrad = 'bg-gradient-to-t from-red-700 to-rose-500';
  } else if (isWarning) {
    cardBorder = 'glass-panel-warning';
    badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
    fillGrad = 'bg-gradient-to-t from-amber-600 to-yellow-400';
  }

  const g = calculateGauge(station);
  const { waterPct, criticalPct, overflowPct, current, critical, overflow } = g;
  const bank = overflow;
  const rawLevel = station.currentLevel ?? station.waterLevel ?? station.level ?? station.value;
  const parsedLevel = parseFloat(rawLevel);
  const level = Number.isFinite(parsedLevel) ? parsedLevel : (current > 0 ? current : null);

  let waterGrad = 'from-cyan-600 to-cyan-400';
  if (isDanger || (current >= overflow && overflow > 0)) {
    waterGrad = 'from-rose-600 to-red-500';
  } else if (isWarning || (current >= critical && critical > 0)) {
    waterGrad = 'from-amber-600 to-yellow-400';
  }

  const isNearest = appState.nearestStation && appState.nearestStation.id === station.id;
  const stCode = station.stCode || badgeCode || '';

  const distancePill = (station.distanceKm !== null && station.distanceKm !== undefined)
    ? `<span class="distance-pill font-mono font-bold text-[11px]"><i data-lucide="navigation" class="w-3 h-3 text-sky-400"></i> ${station.distanceKm <= 5.0 ? '🟡 ' : ''}ห่าง ${formatDistance(station.distanceKm)}</span>`
    : '';

  return `
    <div data-station-card="${station.id}" onclick="focusStationOnMap('${station.id}')" class="station-card ${station.isStale ? 'station-stale' : ''} rounded-2xl glass-panel p-4 border ${cardBorder} flex flex-col justify-between h-full relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer hover:border-sky-400/50">
      ${isDanger ? '<div class="absolute inset-0 bg-red-600/10 pointer-events-none"></div>' : ''}
      ${isWarning ? '<div class="absolute inset-0 bg-amber-500/5 pointer-events-none"></div>' : ''}

      <div>
        <!-- Sequence & Nearest indicator -->
        <div class="flex items-start justify-between gap-1.5 mb-2">
          <div class="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
            <span class="px-2 py-0.5 rounded-md bg-blue-600/30 border border-blue-400/40 text-blue-300 text-[11px] font-black font-mono flex items-center justify-center">
              ${stCode}
            </span>
            ${getCanalBadgeHtml(station)}
            ${distancePill}
            ${
              isNearest
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-400/40">📍 ใกล้คุณที่สุด</span>'
                : ''
            }
          </div>
          <div class="flex flex-wrap items-center gap-1 justify-end shrink-0 text-[10px] max-w-[45%]">
            <span data-station-stale-badge="${station.id}" class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-sm ${station.isStale ? '' : 'hidden'}">
              <i data-lucide="clock" class="w-3 h-3 text-amber-400"></i> ข้อมูลไม่อัปเดต
            </span>
            <span data-station-status="${station.id}" class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}">
              ${station.statusText}
            </span>
          </div>
        </div>

        <h4 class="text-sm font-medium sm:font-bold text-white tracking-tight leading-tight line-clamp-2 hover:text-sky-300 transition">
          ${formatStationTitle(station.name)}
        </h4>
        <p class="text-[10px] text-slate-400 mt-0.5 truncate">
          ${station.location || ''}
        </p>

        <!-- Big Water Level -->
        <div class="my-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
          <div class="flex items-baseline justify-between">
            <div class="flex items-baseline gap-1.5">
              <span data-station-level="${station.id}" class="text-2xl sm:text-3xl font-black text-white font-mono-numbers">
                ${level !== null ? level.toFixed(2) : '--'}
              </span>
              <span class="text-[10px] sm:text-xs text-slate-400 font-normal cursor-help border-b border-dotted border-slate-600 hover:text-sky-300 transition" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span>
            </div>
          </div>
          <div data-station-diff="${station.id}" class="text-[11px] mt-1 font-semibold ${station.diff >= 0 ? 'text-red-400' : (isWarning ? 'text-amber-400' : 'text-emerald-400')} truncate">
            ${formatFriendlyDiffText(level, critical, overflow)}
          </div>
        </div>

        <!-- Gauge Bar (Click to view 24h history chart) -->
        <div role="button" tabindex="0" onclick="event.stopPropagation(); viewStationHistory('${station.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();viewStationHistory('${station.id}')}" aria-label="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม. ของ ${station.name}" class="relative w-full h-28 bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800 mb-3 cursor-pointer group hover:border-sky-400/50 transition" title="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม.">
          <!-- เส้นระดับตลิ่ง (สีแดง) วางจาก bottom เสมอ -->
          <div data-station-overflow-line="${station.id}" class="w-full border-t border-rose-500/80 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${g.overflowPct}%; left: 0; width: 100%;">
            <span data-station-overflow-label="${station.id}" class="text-[9px] bg-rose-950/90 text-rose-300 px-1 rounded -translate-y-1/2">
              ตลิ่ง ${g.overflow.toFixed(2)}m
            </span>
          </div>

          <!-- เส้นระดับวิกฤติ (สีเหลืองประ) วางจาก bottom เสมอ -->
          <div data-station-critical-line="${station.id}" class="w-full border-t border-dashed border-amber-400 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${g.criticalPct}%; left: 0; width: 100%;">
            <span data-station-critical-label="${station.id}" class="text-[9px] bg-amber-950/90 text-amber-300 px-1 rounded -translate-y-1/2">
              วิกฤติ ${g.critical.toFixed(2)}m
            </span>
          </div>

          <!-- มวลน้ำ (ใส่ความสูง inline style จาก bottom เสมอ) -->
          <div data-station-fill="${station.id}" data-target-height="${g.waterPct}" class="w-full bg-gradient-to-t ${waterGrad} rounded-b-xl flex items-end justify-center pb-1 transition-all duration-500 z-10" style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${g.waterPct}%;">
            <span data-station-level-sub="${station.id}" class="text-xs font-bold text-white drop-shadow font-mono">${g.current.toFixed(2)} ม.</span>
          </div>
        </div>

        <!-- Thresholds -->
        <div class="grid grid-cols-2 gap-1.5 text-[10px] text-slate-300">
          <div class="bg-slate-900/50 p-1.5 rounded border border-slate-800">
            <span class="text-slate-400">วิกฤติ:</span> <b class="font-mono text-amber-300">${critical.toFixed(2)}ม.</b>
          </div>
          <div class="bg-slate-900/50 p-1.5 rounded border border-slate-800">
            <span class="text-slate-400">ตลิ่ง:</span> <b class="font-mono text-slate-200">${bank.toFixed(2)}ม.</b>
          </div>
        </div>
      </div>

      <!-- Card Footer -->
      <div class="mt-auto pt-3 border-t border-slate-800/80 flex flex-col items-stretch gap-2 text-[11px] text-slate-300 w-full shrink-0">
        <div class="flex items-center gap-1 min-w-0 text-slate-300 text-[11px] whitespace-nowrap">
          <span class="shrink-0 text-slate-400">เวลา:</span>
          <b data-station-time="${station.id}" class="${station.isStale ? 'text-amber-400 font-mono font-semibold' : 'text-slate-300 font-mono'} shrink-0">${formatCardDateTime(station.updatedAt || station.time || station.timestamp)}</b>
          <span data-station-stale-text="${station.id}" class="text-[10px] text-amber-400/90 font-sans whitespace-nowrap ${station.isStale && station.staleText ? '' : 'hidden'}">(${station.staleText || 'ข้อมูลเดิม'})</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="event.stopPropagation(); focusStationOnMap('${station.id}')" aria-label="ดูตำแหน่ง ${station.name} บนแผนที่" class="px-2 py-1 min-h-[44px] rounded-lg bg-sky-500/10 hover:bg-sky-500/20 active:bg-sky-500/30 text-sky-300 border border-sky-500/30 flex items-center gap-1 text-[11px] font-semibold transition touch-manipulation whitespace-nowrap" title="ดูตำแหน่งบนแผนที่">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-sky-400 shrink-0"></i>
            <span>ดูบนแผนที่</span>
          </button>
          <a href="${getStationSourceUrl(station)}" data-station-source-link="${station.id}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้าเว็บต้นทางข้อมูลของ ${station.name} (เปิดแท็บใหม่)" class="px-2 py-1 min-h-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white border border-slate-700 flex items-center gap-1 text-[11px] font-semibold transition touch-manipulation whitespace-nowrap" title="ตรวจสอบต้นทาง">
            <i data-lucide="globe" class="w-3.5 h-3.5 text-slate-300 shrink-0"></i>
            <span>ลิงก์ต้นทาง</span>
            <i data-lucide="external-link" class="w-3 h-3 text-slate-400 shrink-0"></i>
          </a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Specialized Sluice Gate Twin Card (ปตร. สองฝั่ง ด้านใน & ด้านนอก)
 * Dedicated dual-column card for Station ID 21 (ประตูระบายน้ำคลองสามวา)
 */
function renderSluiceGateTwinCard(station, badgeCode, totalCount, isHighlightNearby = false) {
  const isDanger = station.isOverflow;
  const isWarning = station.isWarning;

  let cardBorder = isHighlightNearby ? 'border-amber-500/50 bg-slate-900/95 shadow-lg' : 'border-slate-800';
  let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

  if (isDanger) {
    cardBorder = 'glass-panel-danger';
    badgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
  } else if (isWarning) {
    cardBorder = 'glass-panel-warning';
    badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
  }

  // Inside parameters
  const inside = station.inside || { label: 'ด้านใน', level: 0.86, warning: 0.70, critical: 0.80, bank: 1.30 };
  const inRawLevel = inside.level ?? inside.waterLevel ?? station.insideLevel;
  const inLevel = (inRawLevel !== null && inRawLevel !== undefined && !isNaN(parseFloat(inRawLevel))) ? parseFloat(inRawLevel) : null;
  const inBank = Number(inside.bank ?? 1.30);
  const inCritical = Number(inside.critical ?? 0.80);
  const gInside = calculateGauge({
    id: `${station.id}-in`,
    name: `${station.name} (ด้านใน)`,
    currentLevel: inLevel,
    criticalThreshold: inCritical,
    overflowThreshold: inBank
  });
  const inIsDanger = inside.isOverflow || (inLevel !== null && inLevel >= inBank && inBank > 0);
  const inIsWarning = inside.isWarning || (inLevel !== null && inLevel >= inCritical && inCritical > 0);

  let inBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  let inWaterGrad = 'from-cyan-600 to-cyan-400';
  if (inIsDanger) {
    inBadgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
    inWaterGrad = 'from-rose-600 to-red-500';
  } else if (inIsWarning) {
    inBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
    inWaterGrad = 'from-amber-600 to-amber-400';
  }

  // Outside parameters
  const outside = station.outside || { label: 'ด้านนอก', level: 1.34, warning: 1.10, critical: 1.30, bank: 1.70 };
  const outRawLevel = outside.level ?? outside.waterLevel ?? station.outsideLevel;
  const outLevel = (outRawLevel !== null && outRawLevel !== undefined && !isNaN(parseFloat(outRawLevel))) ? parseFloat(outRawLevel) : null;
  const outBank = Number(outside.bank ?? 1.70);
  const outCritical = Number(outside.critical ?? 1.30);
  const gOutside = calculateGauge({
    id: `${station.id}-out`,
    name: `${station.name} (ด้านนอก)`,
    currentLevel: outLevel,
    criticalThreshold: outCritical,
    overflowThreshold: outBank
  });
  const outIsDanger = outside.isOverflow || (outLevel !== null && outLevel >= outBank && outBank > 0);
  const outIsWarning = outside.isWarning || (outLevel !== null && outLevel >= outCritical && outCritical > 0);

  let outBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  let outWaterGrad = 'from-cyan-600 to-cyan-400';
  if (outIsDanger) {
    outBadgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
    outWaterGrad = 'from-rose-600 to-red-500';
  } else if (outIsWarning) {
    outBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
    outWaterGrad = 'from-amber-600 to-yellow-400';
  }

  const isNearest = appState.nearestStation && appState.nearestStation.id === station.id;
  const stCode = station.stCode || badgeCode || 'ST-9';

  const distancePill = (station.distanceKm !== null && station.distanceKm !== undefined)
    ? `<span class="distance-pill font-mono font-bold text-[11px]"><i data-lucide="navigation" class="w-3 h-3 text-sky-400"></i> ${station.distanceKm <= 5.0 ? '🟡 ' : ''}ห่าง ${formatDistance(station.distanceKm)}</span>`
    : '';

  const gateOpeningVal = station.gateOpening || 0.43;
  const gateSlabHeight = Math.min(100, Math.max(15, Math.round((gateOpeningVal / 1.5) * 100)));

  return `
    <div data-station-card="${station.id}" onclick="focusStationOnMap('${station.id}')" class="station-card sluice-gate-card ${station.isStale ? 'station-stale' : ''} rounded-2xl glass-panel p-4 sm:p-5 border ${cardBorder} flex flex-col justify-between h-full relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer col-span-1 sm:col-span-2 lg:col-span-2 hover:border-sky-400/50">
      ${isDanger ? '<div class="absolute inset-0 bg-red-600/10 pointer-events-none"></div>' : ''}
      ${isWarning ? '<div class="absolute inset-0 bg-amber-500/5 pointer-events-none"></div>' : ''}

      <div>
        <!-- Top Header & Badges -->
        <div class="flex items-start justify-between gap-1.5 mb-2">
          <div class="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
            <span class="px-2 py-0.5 rounded-md bg-blue-600/30 border border-blue-400/40 text-blue-300 text-[11px] font-black font-mono flex items-center justify-center">
              ${stCode}
            </span>
            ${getCanalBadgeHtml(station)}
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 flex items-center gap-1">
              <i data-lucide="split" class="w-3 h-3 text-cyan-400"></i>
              <span>ปตร. สองฝั่ง</span>
            </span>
            ${distancePill}
            ${
              isNearest
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-400/40">📍 ใกล้คุณที่สุด</span>'
                : ''
            }
          </div>
          <div class="flex flex-wrap items-center gap-1 justify-end shrink-0 text-[10px] max-w-[45%]">
            <span data-station-stale-badge="${station.id}" class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-sm ${station.isStale ? '' : 'hidden'}">
              <i data-lucide="clock" class="w-3 h-3 text-amber-400"></i> ข้อมูลไม่อัปเดต
            </span>
            <span class="px-2.5 py-0.5 rounded text-[11px] font-bold border ${badgeClass}">
              ${station.alertBadgeText || station.statusText}
            </span>
          </div>
        </div>

        <h4 class="text-sm sm:text-base font-medium sm:font-bold text-white tracking-tight leading-tight line-clamp-2 hover:text-sky-300 transition">
          ${formatStationTitle(station.name)}
        </h4>
        <p class="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
          ${station.location || 'ถนนประชาร่วมใจ เขตคลองสามวา'}
        </p>

        <!-- Twin Sluice Columns with Central Pillar -->
        <div class="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 my-3 items-stretch">
          
          <!-- LEFT COLUMN: ด้านใน (Inside) -->
          <div class="bg-slate-900/85 rounded-xl p-2.5 sm:p-3 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-[11px] font-bold text-sky-300 pb-1.5 border-b border-white/5">
                <span class="flex items-center gap-1"><i data-lucide="waves" class="w-3 h-3"></i> ด้านใน</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${inBadgeClass}">${inside.statusText || 'ปกติ'}</span>
              </div>

              <!-- Inside Water Level -->
              <div class="my-2">
                <div class="flex items-baseline gap-1">
                  <span data-station-inside-level="${station.id}" class="text-2xl sm:text-3xl font-black text-white font-mono-numbers">
                    ${inLevel !== null ? inLevel.toFixed(2) : '--'}
                  </span>
                  <span class="text-[10px] sm:text-xs text-slate-400 font-normal cursor-help border-b border-dotted border-slate-600 hover:text-sky-300 transition" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span>
                </div>
                <div data-station-inside-diff="${station.id}" class="text-[10px] mt-0.5 font-medium ${inside.isOverflow ? 'text-red-400' : (inside.isWarning ? 'text-amber-400' : 'text-emerald-400')} truncate">
                  ${formatFriendlyDiffText(inLevel, inBank, inCritical)}
                </div>
              </div>

              <!-- Inside Gauge -->
              <div role="button" tabindex="0" onclick="event.stopPropagation(); viewStationHistory('${station.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();viewStationHistory('${station.id}')}" aria-label="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม. ของ ${station.name}" class="relative w-full h-28 bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800 mb-2 cursor-pointer group hover:border-sky-400/50 transition" title="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม.">
                <!-- เส้นระดับตลิ่ง (สีแดง) วางจาก bottom เสมอ -->
                <div data-station-inside-overflow-line="${station.id}" class="w-full border-t border-rose-500/80 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${gInside.overflowPct}%; left: 0; width: 100%;">
                  <span class="text-[9px] bg-rose-950/90 text-rose-300 px-1 rounded -translate-y-1/2">
                    ตลิ่ง ${gInside.overflow.toFixed(2)}m
                  </span>
                </div>

                <!-- เส้นระดับวิกฤติ (สีเหลืองประ) วางจาก bottom เสมอ -->
                <div data-station-inside-critical-line="${station.id}" class="w-full border-t border-dashed border-amber-400 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${gInside.criticalPct}%; left: 0; width: 100%;">
                  <span class="text-[9px] bg-amber-950/90 text-amber-300 px-1 rounded -translate-y-1/2">
                    วิกฤติ ${gInside.critical.toFixed(2)}m
                  </span>
                </div>

                <!-- มวลน้ำ (ใส่ความสูง inline style จาก bottom เสมอ) -->
                <div data-station-inside-fill="${station.id}" data-target-height="${gInside.waterPct}" class="w-full bg-gradient-to-t ${inWaterGrad} rounded-b-xl flex items-end justify-center pb-1 transition-all duration-500 z-10" style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${gInside.waterPct}%;">
                  <span data-station-inside-level-sub="${station.id}" class="text-xs font-bold text-white drop-shadow font-mono">${gInside.current.toFixed(2)} ม.</span>
                </div>
              </div>

              <!-- Inside Thresholds -->
              <div class="grid grid-cols-3 gap-1 text-[10px] text-center">
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">เตือนภัย:</span> <b class="text-yellow-300 font-mono">${Number(inside.warning ?? 0.70).toFixed(2)}m</b>
                </div>
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">วิกฤติ:</span> <b class="text-amber-300 font-mono">${inCritical.toFixed(2)}m</b>
                </div>
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">ตลิ่ง:</span> <b class="text-slate-300 font-mono">${inBank.toFixed(2)}m</b>
                </div>
              </div>
            </div>
          </div>

          <!-- CENTRAL PILLAR: Sluice Gate Structure (เสาบานประตูกั้นตรงกลาง) -->
          <div class="sluice-gate-pillar flex flex-col items-center justify-between py-2.5 px-1.5 sm:px-2 rounded-xl">
            <!-- Hoist Winch Gear -->
            <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-md shadow-cyan-500/10 shrink-0" title="บานประตูระบายน้ำ">
              <i data-lucide="sliders" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
            </div>

            <!-- Vertical Gate Slab & Rail Graphic -->
            <div class="flex-1 flex flex-col items-center justify-center my-2 w-full">
              <div class="gate-guide-rails h-20 sm:h-24 w-3 sm:w-4 relative bg-slate-900 rounded border border-slate-600/70 overflow-hidden flex flex-col justify-end">
                <div class="gate-opening-slab w-full" style="height: ${gateSlabHeight}%;"></div>
              </div>
              <div class="mt-2 text-center">
                <span class="text-[9px] uppercase font-bold text-slate-400 block tracking-tight">บานเปิด</span>
                <span data-station-gate-opening="${station.id}" class="text-[10px] sm:text-[11px] font-black font-mono text-amber-300 bg-amber-500/15 px-1 py-0.5 rounded border border-amber-500/30 whitespace-nowrap block mt-0.5">
                  ${gateOpeningVal ? `${gateOpeningVal.toFixed(2)} ม.` : 'ปิด'}
                </span>
              </div>
            </div>

            <!-- Head Diff Metric & Arrow Indicator -->
            <div class="text-center shrink-0">
              <div class="text-[10px] text-cyan-300 font-mono font-bold flex items-center justify-center gap-0.5">
                <i data-lucide="arrow-left-right" class="w-3 h-3 text-cyan-400"></i>
              </div>
              <span class="text-[9px] font-mono text-slate-400 block whitespace-nowrap">Δ ${(Math.abs(station.diffInOut || 0) * 100).toFixed(0)}cm</span>
            </div>
          </div>

          <!-- RIGHT COLUMN: ด้านนอก (Outside) -->
          <div class="bg-slate-900/85 rounded-xl p-2.5 sm:p-3 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-[11px] font-bold text-purple-300 pb-1.5 border-b border-white/5">
                <span class="flex items-center gap-1"><i data-lucide="waves" class="w-3 h-3"></i> ด้านนอก</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${outBadgeClass}">${outside.statusText || 'ปกติ'}</span>
              </div>

              <!-- Outside Water Level -->
              <div class="my-2">
                <div class="flex items-baseline gap-1">
                  <span data-station-outside-level="${station.id}" class="text-2xl sm:text-3xl font-black text-white font-mono-numbers">
                    ${outLevel !== null ? outLevel.toFixed(2) : '--'}
                  </span>
                  <span class="text-[10px] sm:text-xs text-slate-400 font-normal cursor-help border-b border-dotted border-slate-600 hover:text-sky-300 transition" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span>
                </div>
                <div data-station-outside-diff="${station.id}" class="text-[10px] mt-0.5 font-medium ${outside.isOverflow ? 'text-red-400' : (outside.isWarning ? 'text-amber-400' : 'text-emerald-400')} truncate">
                  ${formatFriendlyDiffText(outLevel, outBank, outCritical)}
                </div>
              </div>

              <!-- Outside Gauge -->
              <div role="button" tabindex="0" onclick="event.stopPropagation(); viewStationHistory('${station.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();viewStationHistory('${station.id}')}" aria-label="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม. ของ ${station.name}" class="relative w-full h-28 bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800 mb-2 cursor-pointer group hover:border-sky-400/50 transition" title="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม.">
                <!-- เส้นระดับตลิ่ง (สีแดง) วางจาก bottom เสมอ -->
                <div data-station-outside-overflow-line="${station.id}" class="w-full border-t border-rose-500/80 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${gOutside.overflowPct}%; left: 0; width: 100%;">
                  <span class="text-[9px] bg-rose-950/90 text-rose-300 px-1 rounded -translate-y-1/2">
                    ตลิ่ง ${gOutside.overflow.toFixed(2)}m
                  </span>
                </div>

                <!-- เส้นระดับวิกฤติ (สีเหลืองประ) วางจาก bottom เสมอ -->
                <div data-station-outside-critical-line="${station.id}" class="w-full border-t border-dashed border-amber-400 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${gOutside.criticalPct}%; left: 0; width: 100%;">
                  <span class="text-[9px] bg-amber-950/90 text-amber-300 px-1 rounded -translate-y-1/2">
                    วิกฤติ ${gOutside.critical.toFixed(2)}m
                  </span>
                </div>

                <!-- มวลน้ำ (ใส่ความสูง inline style จาก bottom เสมอ) -->
                <div data-station-outside-fill="${station.id}" data-target-height="${gOutside.waterPct}" class="w-full bg-gradient-to-t ${outWaterGrad} rounded-b-xl flex items-end justify-center pb-1 transition-all duration-500 z-10" style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${gOutside.waterPct}%;">
                  <span data-station-outside-level-sub="${station.id}" class="text-xs font-bold text-white drop-shadow font-mono">${gOutside.current.toFixed(2)} ม.</span>
                </div>
              </div>

              <!-- Outside Thresholds -->
              <div class="grid grid-cols-3 gap-1 text-[10px] text-center">
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">เตือนภัย:</span> <b class="text-yellow-300 font-mono">${Number(outside.warning ?? 1.10).toFixed(2)}m</b>
                </div>
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">วิกฤติ:</span> <b class="text-amber-300 font-mono">${outCritical.toFixed(2)}m</b>
                </div>
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">ตลิ่ง:</span> <b class="text-slate-300 font-mono">${outBank.toFixed(2)}m</b>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Sluice Gate Summary Metrics (Diff & Opening) -->
        <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] mb-2">
          <div class="flex items-center gap-1.5 text-cyan-300 font-medium">
            <i data-lucide="scale" class="w-3.5 h-3.5 text-cyan-400 shrink-0"></i>
            <span>ความต่างระดับ: <b data-station-gate-diff="${station.id}" class="font-bold text-white font-mono">${station.diffInOutText || 'ระดับน้ำเท่ากัน'}</b></span>
          </div>
          <div class="flex items-center gap-1.5 text-amber-300 font-medium">
            <i data-lucide="git-commit" class="w-3.5 h-3.5 text-amber-400 shrink-0"></i>
            <span>ระยะเปิดบาน: <b class="font-mono font-bold text-white">${gateOpeningVal ? `${gateOpeningVal.toFixed(2)} ม.` : '0.43 ม.'}</b></span>
          </div>
        </div>
      </div>

      <!-- Card Footer -->
      <div class="mt-auto pt-3 border-t border-slate-800/80 flex flex-col items-stretch gap-2 text-[11px] text-slate-300 w-full shrink-0">
        <div class="flex items-center gap-1 min-w-0 text-slate-300 text-[11px] whitespace-nowrap">
          <span class="shrink-0 text-slate-400">เวลา:</span>
          <b data-station-time="${station.id}" class="${station.isStale ? 'text-amber-400 font-mono font-semibold' : 'text-slate-300 font-mono'} shrink-0">${formatCardDateTime(station.updatedAt || station.time || station.timestamp)}</b>
          <span data-station-stale-text="${station.id}" class="text-[10px] text-amber-400/90 font-sans whitespace-nowrap ${station.isStale && station.staleText ? '' : 'hidden'}">(${station.staleText || 'ข้อมูลเดิม'})</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="event.stopPropagation(); focusStationOnMap('${station.id}')" aria-label="ดูตำแหน่ง ${station.name} บนแผนที่" class="px-2 py-1 min-h-[44px] rounded-lg bg-sky-500/10 hover:bg-sky-500/20 active:bg-sky-500/30 text-sky-300 border border-sky-500/30 flex items-center gap-1 text-[11px] font-semibold transition touch-manipulation whitespace-nowrap" title="ดูตำแหน่งบนแผนที่">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-sky-400 shrink-0"></i>
            <span>ดูบนแผนที่</span>
          </button>
          <a href="${getStationSourceUrl(station)}" data-station-source-link="${station.id}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้าเว็บต้นทางข้อมูลของ ${station.name} (เปิดแท็บใหม่)" class="px-2 py-1 min-h-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 hover:text-white border border-slate-700 flex items-center gap-1 text-[11px] font-semibold transition touch-manipulation whitespace-nowrap" title="ตรวจสอบต้นทาง">
            <i data-lucide="globe" class="w-3.5 h-3.5 text-slate-300 shrink-0"></i>
            <span>ลิงก์ต้นทาง</span>
            <i data-lucide="external-link" class="w-3 h-3 text-slate-400 shrink-0"></i>
          </a>
        </div>
      </div>
    </div>
  `;
}

/**
 * SECTION 2: Pinned Priority Stations (4 จุดเฝ้าระวังหลักรอยต่อ ปทุมธานี - กทม.: ST-1 ถึง ST-4)
 * Always visible and pinned!
 */
function renderPinnedPriorityCard(station, canon, idx) {
  try {
    // 1. Water level with optional chaining and fallbacks
    // station.level ?? station.inside?.level ?? '0.00'
    const rawLevel = station?.waterLevel ?? station?.level ?? station?.inside?.level ?? null;
    const hasValidLevel = rawLevel !== null && rawLevel !== undefined && rawLevel !== '' && !isNaN(parseFloat(rawLevel));
    const levelNum = hasValidLevel ? parseFloat(rawLevel) : null;
    const levelDisplay = levelNum !== null ? levelNum.toFixed(2) : (station?.id ? (station.level ?? station.inside?.level ?? '0.00') : '--');

    // 2. Staleness with optional chaining and fallback
    // station.isStale ?? false
    const isStale = station?.isStale ?? false;
    const staleText = station?.staleText ?? '';

    // 3. Update time with optional chaining and fallback
    // station.time ?? '-'
    const updateTime = formatCardDateTime(station?.updatedAt ?? station?.time ?? station?.timestamp);

    // 4. Thresholds & Status
    const g = calculateGauge(station || canon);
    const { waterPct, criticalPct, overflowPct, current, critical, overflow } = g;
    const bank = overflow;
    const isDanger = station?.isOverflow ?? (levelNum !== null && levelNum >= bank && bank > 0);
    const isWarning = station?.isWarning ?? (levelNum !== null && levelNum >= critical && critical > 0);

    let cardBorder = 'border-slate-800';
    let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    let statusText = station?.statusText ?? 'ปกติ';
    let waterGrad = 'from-cyan-600 to-cyan-400';

    if (!hasValidLevel && !station?.statusText) {
      statusText = 'ไม่มีข้อมูล / รอตรวจวัด';
      badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
    } else if (isDanger) {
      cardBorder = 'glass-panel-danger';
      badgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
      waterGrad = 'from-rose-600 to-red-500';
    } else if (isWarning) {
      cardBorder = 'glass-panel-warning';
      badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
      waterGrad = 'from-amber-600 to-yellow-400';
    }

    const diffText = formatFriendlyDiffText(levelNum, bank, critical);

    const distanceBadge = (station?.distanceKm !== null && station?.distanceKm !== undefined)
      ? `<span data-station-dist="${canon.id}" class="distance-pill text-[11px] font-mono font-bold"><i data-lucide="navigation" class="w-3 h-3 text-sky-400"></i> ${station.distanceKm <= 5.0 ? '🟡 ' : ''}ห่าง ${formatDistance(station.distanceKm)}</span>`
      : `<span data-station-dist="${canon.id}" class="distance-pill text-[11px] font-mono font-bold hidden"></span>`;

    const lat = station?.lat ?? canon.lat ?? 13.93;
    const lng = station?.lng ?? canon.lng ?? 100.75;

    return `
      <div data-station-card="${canon.id}" onclick="focusStationOnMap('${canon.id}')" class="station-card ${isStale ? 'station-stale' : ''} rounded-3xl glass-panel p-5 border ${cardBorder} flex flex-col justify-between h-full relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer hover:border-sky-400/50">
        ${isDanger ? '<div class="absolute inset-0 bg-red-600/10 pointer-events-none"></div>' : ''}
        ${isWarning ? '<div class="absolute inset-0 bg-amber-500/5 pointer-events-none"></div>' : ''}

        <div>
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div>
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-mono">
                  <i data-lucide="pin" class="w-3 h-3 text-amber-400"></i>
                  <span>${canon.stCode || `ST-${idx + 1}`}</span>
                </span>
                ${getCanalBadgeHtml(station || canon)}
                ${distanceBadge}
                <span class="text-[11px] text-slate-500 font-mono">${station?.stationCode ?? canon.stationCode ?? ''}</span>
              </div>
              <h3 class="text-base sm:text-lg font-bold text-white tracking-tight leading-snug line-clamp-2 hover:text-sky-300 transition">
                ${formatStationTitle(station?.name ?? canon.name)}
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <i data-lucide="map-pin" class="w-3 h-3 text-slate-500"></i>
                <span>${station?.location ?? canon.location}</span>
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-1 justify-end shrink-0 text-[10px] max-w-[45%]">
              <span data-station-stale-badge="${canon.id}" class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-sm ${isStale ? '' : 'hidden'}">
                <i data-lucide="clock" class="w-3 h-3 text-amber-400"></i> ข้อมูลไม่อัปเดต
              </span>
              <div data-station-status="${canon.id}" class="px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 shrink-0 ${badgeClass}">
                <span>${statusText}</span>
              </div>
            </div>
          </div>

          <!-- Numbers & Gauge -->
          <div class="grid grid-cols-12 gap-4 my-4 items-center">
            <div class="col-span-7 space-y-2">
              <div class="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                <div class="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>ระดับน้ำปัจจุบัน</span>
                </div>
                <div class="flex items-baseline gap-1.5 mt-0.5">
                  <span data-station-level="${canon.id}" class="text-3xl font-black text-white font-mono-numbers">
                    ${levelDisplay}
                  </span>
                  <span class="text-[10px] sm:text-xs text-slate-400 font-normal cursor-help border-b border-dotted border-slate-600 hover:text-sky-300 transition" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span>
                </div>
                <div data-station-diff="${canon.id}" class="text-[11px] mt-1 font-semibold ${station?.diff >= 0 ? 'text-red-400' : (isWarning ? 'text-amber-400' : (!hasValidLevel ? 'text-slate-400' : 'text-emerald-400'))} truncate">
                  ${diffText}
                </div>
              </div>

              <!-- Limits Grid -->
              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div class="bg-slate-900/50 rounded-lg p-2 border border-slate-800/80">
                  <span class="text-slate-400">ตลิ่ง:</span>
                  <b data-station-bank="${canon.id}" class="text-slate-200 ml-1 font-mono">${bank.toFixed(2)} ม.</b>
                </div>
                <div class="bg-slate-900/50 rounded-lg p-2 border border-slate-800/80">
                  <span class="text-amber-400">วิกฤติ:</span>
                  <b data-station-critical="${canon.id}" class="text-amber-300 ml-1 font-mono">${critical.toFixed(2)} ม.</b>
                </div>
              </div>
            </div>

            <!-- Mini vertical gauge (Click to view 24h history chart) -->
            <div class="col-span-5 flex flex-col items-center">
              <div role="button" tabindex="0" onclick="event.stopPropagation(); viewStationHistory('${canon.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();viewStationHistory('${canon.id}')}" aria-label="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม. ของ ${station?.name ?? canon.name}" title="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม." class="relative w-full h-28 bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800 cursor-pointer group hover:border-sky-400/50 transition">
                <!-- เส้นระดับตลิ่ง (สีแดง) วางจาก bottom เสมอ -->
                <div data-station-overflow-line="${canon.id}" class="w-full border-t border-rose-500/80 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${g.overflowPct}%; left: 0; width: 100%;">
                  <span data-station-overflow-label="${canon.id}" class="text-[9px] bg-rose-950/90 text-rose-300 px-1 rounded -translate-y-1/2">
                    ตลิ่ง ${g.overflow.toFixed(2)}m
                  </span>
                </div>

                <!-- เส้นระดับวิกฤติ (สีเหลืองประ) วางจาก bottom เสมอ -->
                <div data-station-critical-line="${canon.id}" class="w-full border-t border-dashed border-amber-400 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${g.criticalPct}%; left: 0; width: 100%;">
                  <span data-station-critical-label="${canon.id}" class="text-[9px] bg-amber-950/90 text-amber-300 px-1 rounded -translate-y-1/2">
                    วิกฤติ ${g.critical.toFixed(2)}m
                  </span>
                </div>

                <!-- มวลน้ำ (ใส่ความสูง inline style จาก bottom เสมอ) -->
                <div data-station-fill="${canon.id}" data-target-height="${g.waterPct}" class="w-full bg-gradient-to-t ${waterGrad} rounded-b-xl flex items-end justify-center pb-1 transition-all duration-500 z-10" style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${g.waterPct}%;">
                  <span data-station-level-sub="${canon.id}" class="text-xs font-bold text-white drop-shadow font-mono">${g.current.toFixed(2)} ม.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="mt-3 pt-2 border-t border-slate-800/80 flex flex-col gap-2 text-[11px] text-slate-300 w-full shrink-0">
          <div class="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 whitespace-nowrap">
            <span>🕒</span>
            <span>เวลา:</span>
            <b data-station-time="${canon.id}" class="${isStale ? 'text-amber-400 font-semibold' : 'text-slate-300 font-medium'}">${updateTime}</b>
            <span data-station-stale-text="${canon.id}" class="text-[10px] text-amber-400/90 font-sans whitespace-nowrap ${isStale && staleText ? '' : 'hidden'}">(${staleText || 'ข้อมูลเดิม'})</span>
          </div>
          <div class="grid grid-cols-2 gap-2 w-full">
            <button type="button" onclick="event.stopPropagation(); focusStationOnMap('${canon.id}')" aria-label="ดูตำแหน่ง ${station?.name ?? canon.name} บนแผนที่" class="py-1 px-2 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded border border-slate-700/80 flex items-center justify-center gap-1 transition touch-manipulation whitespace-nowrap" title="ดูตำแหน่งบนแผนที่">
              <span>📍</span>
              <span>ดูบนแผนที่</span>
            </button>
            <a href="${getStationSourceUrl(station || canon)}" data-station-source-link="${canon.id}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้าเว็บต้นทางข้อมูลของ ${station?.name ?? canon.name} (เปิดแท็บใหม่)" class="py-1 px-2 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700/80 flex items-center justify-center gap-1 transition touch-manipulation whitespace-nowrap" title="ตรวจสอบต้นทาง">
              <span>🌐</span>
              <span>ลิงก์ต้นทาง</span>
            </a>
          </div>
        </div>

      </div>
    `;
  } catch (cardErr) {
    console.error(`Error rendering Section 2 card for ${canon?.stCode || canon?.id}:`, cardErr);
    return renderFallbackPinnedCard(canon, idx);
  }
}

function renderFallbackPinnedCard(canon, idx) {
  const stCode = canon?.stCode || `ST-${(idx || 0) + 1}`;
  const id = canon?.id || 'unknown';
  const name = canon?.name || 'สถานีตรวจวัดระดับน้ำ';
  const location = canon?.location || 'รอยต่อปทุมธานี - กทม.';
  const g = calculateGauge(canon);
  const { waterPct, criticalPct, overflowPct, current, critical, overflow } = g;
  const bank = overflow;
  const lat = canon?.lat ?? 13.93;
  const lng = canon?.lng ?? 100.75;

  return `
    <div data-station-card="${id}" onclick="focusStationOnMap('${id}')" class="station-card rounded-3xl glass-panel p-5 border border-slate-800 flex flex-col justify-between h-full relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer hover:border-sky-400/50">
      <div>
        <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-mono">
                <i data-lucide="pin" class="w-3 h-3 text-amber-400"></i>
                <span>${stCode}</span>
              </span>
              ${getCanalBadgeHtml(canon)}
              <span class="text-[11px] text-slate-500 font-mono">${canon?.stationCode || ''}</span>
            </div>
            <h3 class="text-base sm:text-lg font-bold text-white tracking-tight leading-snug line-clamp-2 hover:text-sky-300 transition">
              ${formatStationTitle(name)}
            </h3>
            <p class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <i data-lucide="map-pin" class="w-3 h-3 text-slate-500"></i>
              <span>${location}</span>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-1 justify-end shrink-0 text-[10px] max-w-[45%]">
            <div data-station-status="${id}" class="px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 shrink-0 bg-slate-800 text-slate-300 border-slate-700">
              <span>ไม่มีข้อมูล / รอตรวจวัด</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-4 my-4 items-center">
          <div class="col-span-7 space-y-2">
            <div class="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
              <div class="flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>ระดับน้ำปัจจุบัน</span>
              </div>
              <div class="flex items-baseline gap-1.5 mt-0.5">
                <span data-station-level="${id}" class="text-3xl font-black text-white font-mono-numbers">--</span>
                <span class="text-[10px] sm:text-xs text-slate-400 font-normal cursor-help border-b border-dotted border-slate-600 hover:text-sky-300 transition" title="ม.รทก. = เมตรจากระดับน้ำทะเลปานกลาง (ระดับอ้างอิงมาตรฐาน)">ม.รทก.</span>
              </div>
              <div data-station-diff="${id}" class="text-[11px] mt-1 font-semibold text-slate-400 truncate">
                รอข้อมูลตรวจวัด
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <div class="bg-slate-900/50 rounded-lg p-2 border border-slate-800/80">
                <span class="text-slate-400">ตลิ่ง:</span>
                <b data-station-bank="${id}" class="text-slate-200 ml-1 font-mono">${typeof bank === 'number' ? bank.toFixed(2) : bank} ม.</b>
              </div>
              <div class="bg-slate-900/50 rounded-lg p-2 border border-slate-800/80">
                <span class="text-amber-400">วิกฤติ:</span>
                <b data-station-critical="${id}" class="text-amber-300 ml-1 font-mono">${typeof critical === 'number' ? critical.toFixed(2) : critical} ม.</b>
              </div>
            </div>
          </div>

          <div class="col-span-5 flex flex-col items-center">
            <div role="button" tabindex="0" onclick="event.stopPropagation(); viewStationHistory('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();viewStationHistory('${id}')}" aria-label="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม. ของ ${name}" title="คลิกเพื่อดูกราฟระดับน้ำย้อนหลัง 24 ชม." class="relative w-full h-28 bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800 cursor-pointer group hover:border-sky-400/50 transition">
              <!-- เส้นระดับตลิ่ง (สีแดง) วางจาก bottom เสมอ -->
              <div data-station-overflow-line="${id}" class="w-full border-t border-rose-500/80 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${g.overflowPct}%; left: 0; width: 100%;">
                <span data-station-overflow-label="${id}" class="text-[9px] bg-rose-950/90 text-rose-300 px-1 rounded -translate-y-1/2">
                  ตลิ่ง ${g.overflow.toFixed(2)}m
                </span>
              </div>

              <!-- เส้นระดับวิกฤติ (สีเหลืองประ) วางจาก bottom เสมอ -->
              <div data-station-critical-line="${id}" class="w-full border-t border-dashed border-amber-400 z-20 flex justify-end pr-1 pointer-events-none" style="position: absolute; bottom: ${g.criticalPct}%; left: 0; width: 100%;">
                <span data-station-critical-label="${id}" class="text-[9px] bg-amber-950/90 text-amber-300 px-1 rounded -translate-y-1/2">
                  วิกฤติ ${g.critical.toFixed(2)}m
                </span>
              </div>

              <!-- มวลน้ำ (ใส่ความสูง inline style จาก bottom เสมอ) -->
              <div data-station-fill="${id}" data-target-height="${g.waterPct}" class="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-b-xl flex items-end justify-center pb-1 transition-all duration-500 z-10" style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${g.waterPct}%;">
                <span data-station-level-sub="${id}" class="text-xs font-bold text-white drop-shadow font-mono">${g.current.toFixed(2)} ม.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card Footer -->
      <div class="mt-3 pt-2 border-t border-slate-800/80 flex flex-col gap-2 text-[11px] text-slate-300 w-full shrink-0">
        <div class="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
          <span>🕒</span>
          <span>เวลา:</span>
          <b data-station-time="${id}" class="text-slate-300 font-medium">${formatCardDateTime(canon.timestamp || canon.updatedAt || canon.time || '-')}</b>
        </div>
        <div class="grid grid-cols-2 gap-2 w-full">
          <button type="button" onclick="event.stopPropagation(); focusStationOnMap('${id}')" aria-label="ดูตำแหน่ง ${name} บนแผนที่" class="py-1 px-2 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded border border-slate-700/80 flex items-center justify-center gap-1 transition touch-manipulation whitespace-nowrap" title="ดูตำแหน่งบนแผนที่">
            <span>📍</span>
            <span>ดูบนแผนที่</span>
          </button>
          <a href="${getStationSourceUrl(canon)}" data-station-source-link="${id}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้าเว็บต้นทางข้อมูลของ ${name} (เปิดแท็บใหม่)" class="py-1 px-2 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700/80 flex items-center justify-center gap-1 transition touch-manipulation whitespace-nowrap" title="ตรวจสอบต้นทาง">
            <span>🌐</span>
            <span>ลิงก์ต้นทาง</span>
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderSection2PinnedPriority() {
  const container = document.getElementById('pinnedPriorityContainer');
  if (!container) return;

  try {
    container.innerHTML = CANONICAL_PINNED_STATIONS.map((canon, idx) => {
      const liveData = (appState.stations || []).find(s => s?.id === canon.id || s?.stCode === canon.stCode);
      const station = liveData ? { ...canon, ...liveData } : canon;
      return renderPinnedPriorityCard(station, canon, idx);
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('Error rendering Section 2 pinned priority container:', err);
  }
}

/**
 * SECTION 3: All Canals & Stations (Categorized View)
 */
function renderSection3AllCanals() {
  const container = document.getElementById('allCanalsGrid');
  if (!container) return;

  const surenStations = appState.stations.filter(s => s.canalGroupId === 'khlong-phraya-suren');
  const otherStations = appState.stations.filter(s => s.canalGroupId !== 'khlong-phraya-suren');

  container.innerHTML = `
    <!-- Suren Canal Cards -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <span class="p-1 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
          <i data-lucide="waves" class="w-4 h-4"></i>
        </span>
        <h3 class="text-base font-bold text-white">แนวคลองพระยาสุเรนทร์ (ID 126, 125, 124, 127)</h3>
        <span class="text-xs text-slate-500 ml-auto">เรียงจากต้นน้ำสู่ปลายน้ำ</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${surenStations.map((s, idx) => renderCanalFlowCard(s, idx + 1, surenStations.length)).join('')}
      </div>
    </div>

    <!-- Main Bangkok Gate & Others -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <span class="p-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
          <i data-lucide="building-2" class="w-4 h-4"></i>
        </span>
        <h3 class="text-base font-bold text-white">จุดวัดหลัก กทม. & ระบบประตูระบายน้ำ</h3>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${appState.stations.filter(s => s.canalGroupId === 'khlong-sam-wa' || s.id === 'bma_weather_21' || s.id === 'bma_wf_swa02' || s.id === 'bma-weather-21').map(s => {
          if (s.isGate || s.id === 'bma_weather_21') {
            return renderSluiceGateTwinCard(s, s.stCode, 1, false);
          }
          return renderCanalFlowCard(s, 1, 1);
        }).join('')}
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Countdown timer
 */
function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    countdownSeconds--;
    if (countdownSeconds <= 0) {
      resetCountdown(120);
      fetchWaterSummary();
    }
    const mins = Math.floor(countdownSeconds / 60).toString().padStart(2, '0');
    const secs = (countdownSeconds % 60).toString().padStart(2, '0');
    const el = document.getElementById('countdownTimer');
    if (el) el.textContent = `${mins}:${secs}`;
  }, 1000);
}

function resetCountdown(sec = 120) {
  countdownSeconds = sec;
  const mins = Math.floor(countdownSeconds / 60).toString().padStart(2, '0');
  const secs = (countdownSeconds % 60).toString().padStart(2, '0');
  const el = document.getElementById('countdownTimer');
  if (el) el.textContent = `${mins}:${secs}`;
}

/**
 * ========================================================
 * AI WATER SITUATION ANALYSIS & OFFICIAL NEWS (GEMINI AI)
 * ========================================================
 */
let isAiLoading = false;

async function loadAiAnalysis(forceRefresh = false) {
  if (isAiLoading) return;
  isAiLoading = true;

  const skeleton = document.getElementById('aiLoadingSkeleton');
  const content = document.getElementById('aiAnalysisContent');
  const btnRefresh = document.getElementById('btnRefreshAi');

  if (skeleton && content && !content.innerHTML.trim()) {
    skeleton.classList.remove('hidden');
    content.classList.add('hidden');
  }

  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.classList.add('opacity-60', 'cursor-not-allowed');
    const icon = btnRefresh.querySelector('i');
    if (icon) icon.classList.add('animate-spin');
    const label = btnRefresh.querySelector('span');
    if (label) label.textContent = 'กำลังวิเคราะห์...';
  }
  if (forceRefresh && content) {
    content.classList.add('opacity-50', 'animate-pulse');
  }

  try {
    const url = `/api/ai-analysis?_t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderAiAnalysis(data);
  } catch (err) {
    // Gracefully fallback to client-side rule evaluation without throwing console errors
    const fallbackData = generateClientSideAiFallback();
    renderAiAnalysis(fallbackData);
  } finally {
    isAiLoading = false;
    if (btnRefresh) {
      btnRefresh.disabled = false;
      btnRefresh.classList.remove('opacity-60', 'cursor-not-allowed');
      const icon = btnRefresh.querySelector('i');
      if (icon) icon.classList.remove('animate-spin');
      const label = btnRefresh.querySelector('span');
      if (label) label.textContent = 'วิเคราะห์ใหม่';
    }
    if (content) {
      content.classList.remove('opacity-50', 'animate-pulse');
    }
    const updatedBadge = document.getElementById('aiUpdatedTimeBadge');
    if (updatedBadge && forceRefresh) {
      const now = new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      updatedBadge.textContent = `ประมวลผลล่าสุด: ${now} น.`;
    }
    if (forceRefresh) {
      const section = document.getElementById('aiAnalysisSection');
      if (section) {
        section.classList.remove('ai-analysis-refresh-flash');
        void section.offsetWidth;
        section.classList.add('ai-analysis-refresh-flash');
        setTimeout(() => section.classList.remove('ai-analysis-refresh-flash'), 1100);
      }
    }
  }
}
window.loadAiAnalysis = loadAiAnalysis;

function generateClientSideAiFallback() {
  const stations = appState.stations || [];
  let overflowCount = 0;
  let criticalCount = 0;
  let highestStation = null;
  let highestRatio = 0;
  const overflowStations = [];
  const criticalStations = [];

  stations.forEach(s => {
    const lvl = s.waterLevel !== null && s.waterLevel !== undefined ? parseFloat(s.waterLevel) : null;
    const bank = parseFloat(s.bankLevel) || 2.0;
    const crit = parseFloat(s.criticalLevel) || 1.8;
    if (lvl !== null && !isNaN(lvl)) {
      const ratio = lvl / bank;
      if (ratio > highestRatio) {
        highestRatio = ratio;
        highestStation = s;
      }
      if (lvl >= bank) {
        overflowCount++;
        overflowStations.push(s.stCode || s.name);
      } else if (lvl >= crit) {
        criticalCount++;
        criticalStations.push(s.stCode || s.name);
      }
    }
  });

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

  const nowTime = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });

  return {
    success: false,
    error: 'CLIENT_FALLBACK',
    message: 'กำลังประเมินโดยระบบอุทกวิทยาอัตโนมัติบนหน้าเว็บ',
    analyzedAt: nowTime,
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

function cleanThaiText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/排水/g, '')
    .replace(/[\u4e00-\u9fa5]/g, '') // ลบตัวอักษรจีนที่อาจหลุดมา
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function renderAiAnalysis(data) {
  if (!data) return;

  const skeleton = document.getElementById('aiLoadingSkeleton');
  const content = document.getElementById('aiAnalysisContent');
  const modelBadge = document.getElementById('aiModelBadge');
  const updatedBadge = document.getElementById('aiUpdatedTimeBadge');
  const headerRiskBadge = document.getElementById('aiHeaderRiskBadge');

  const isGeminiSuccess = Boolean(data.success === true && (data.modelUsed === 'gemini-3.5-flash-lite' || data.source?.includes('gemini') || !data.modelUsed?.includes('hydrological')));
  const analyzedTime = data.analyzedAt ? `${data.analyzedAt} น.` : (data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : 'ประมวลผลล่าสุด');

  // 1. Header Model Badge
  if (modelBadge) {
    if (isGeminiSuccess) {
      modelBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-400/40 shadow-sm flex items-center gap-1 font-mono';
      modelBadge.innerHTML = '<span class="text-amber-400 select-none">✨</span><span>วิเคราะห์ด้วย Gemini 3.5 Flash Lite</span>';
    } else {
      modelBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow-sm flex items-center gap-1 font-mono';
      modelBadge.innerHTML = '<i data-lucide="alert-triangle" class="w-3 h-3 text-amber-400"></i><span>⚠️ โหมดประเมินอัตโนมัติ</span>';
    }
  }

  // 2. Header Updated Time Badge
  if (updatedBadge) {
    updatedBadge.textContent = isGeminiSuccess ? `ประมวลผลล่าสุด ${analyzedTime}` : `ประเมินเมื่อ ${analyzedTime}`;
  }

  let risk = 'normal';
  const rawRisk = String(data.risk_level || data.riskLevel || '').toLowerCase();
  if (rawRisk.includes('danger') || rawRisk.includes('วิกฤติ') || rawRisk.includes('emergency') || data.riskColor === 'red') {
    risk = 'danger';
  } else if (rawRisk.includes('warn') || rawRisk.includes('เฝ้าระวัง') || rawRisk.includes('เสี่ยง') || data.riskColor === 'amber' || data.riskColor === 'orange') {
    risk = 'warning';
  }

  let badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  let badgeLabel = 'ระดับความเสี่ยง: ปกติ';
  let bannerBorder = 'border-l-4 border-l-emerald-500 bg-emerald-950/20 border-emerald-500/30';
  let headlineClass = 'text-white';
  let riskIcon = 'check-circle';
  let riskIconColor = 'text-emerald-400';

  if (risk === 'danger') {
    badgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
    badgeLabel = 'ระดับความเสี่ยง: วิกฤติ / อันตราย';
    bannerBorder = 'border-l-4 border-l-red-500 bg-red-950/30 border-red-500/30';
    headlineClass = 'text-red-200';
    riskIcon = 'alert-octagon';
    riskIconColor = 'text-red-400';
  } else if (risk === 'warning') {
    badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
    badgeLabel = 'ระดับความเสี่ยง: เฝ้าระวัง';
    bannerBorder = 'border-l-4 border-l-amber-500 bg-amber-950/25 border-amber-500/30';
    headlineClass = 'text-amber-200';
    riskIcon = 'shield-alert';
    riskIconColor = 'text-amber-400';
  }

  if (headerRiskBadge) {
    headerRiskBadge.className = `px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono shadow-sm ${badgeClass}`;
    headerRiskBadge.textContent = badgeLabel;
    headerRiskBadge.classList.remove('hidden');
  }

  const headline = cleanThaiText(data.headline || data.summary || 'สรุปสถานการณ์น้ำเขตคลองสามวาและแนวคลองหกวา');
  const analysis = cleanThaiText(data.analysis || data.summary || 'ระดับน้ำอยู่ในเกณฑ์ปกติ การไหลเวียนของน้ำเป็นไปตามแผนการระบายน้ำ');
  const actionAdvice = cleanThaiText(data.action_advice || data.advisory || 'ติดตามสถานการณ์และตรวจสอบระบบระบายน้ำรอบที่อยู่อาศัย');
  const trend6h = cleanThaiText(data.trend_6h || data.trendPrediction || 'ระดับน้ำทรงตัวในเกณฑ์ปกติ');
  const officialContext = cleanThaiText(data.official_context || data.sourceNews || '');

  const html = `
    <!-- 1. Headline Summary Banner -->
    <div class="p-3.5 sm:p-4 rounded-2xl ${bannerBorder} border shadow-md relative overflow-hidden">
      <div class="flex items-start gap-3">
        <div class="p-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 shrink-0 mt-0.5 shadow-sm">
          <i data-lucide="${riskIcon}" class="w-4 h-4 ${riskIconColor}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black border ${badgeClass}">
              ${badgeLabel}
            </span>
            <span class="text-[11px] text-slate-400">บทสรุปสถานการณ์ล่าสุด</span>
          </div>
          <h3 class="text-sm sm:text-base font-extrabold ${headlineClass} tracking-tight leading-snug">
            ${headline}
          </h3>
        </div>
      </div>
    </div>

    <!-- 2. Dual Content Box: Analysis & Preparation Advice -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      <!-- Water Flow Direction & Current Situation -->
      <div class="rounded-2xl p-4 sm:p-5 bg-gradient-to-b from-[#0d1629] to-[#0a1020] border border-sky-500/30 flex flex-col justify-between shadow-lg">
        <div>
          <div class="flex items-center gap-2 mb-2.5 text-sky-400">
            <div class="p-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 shrink-0">
              <i data-lucide="waves" class="w-4 h-4"></i>
            </div>
            <h4 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-300">สถานการณ์ปัจจุบัน</h4>
          </div>
          <p class="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
            ${analysis}
          </p>
        </div>
      </div>

      <!-- Action Advice for Citizens -->
      <div class="rounded-2xl p-4 sm:p-5 bg-gradient-to-b from-[#181324] to-[#0a1020] border border-amber-500/30 flex flex-col justify-between shadow-lg">
        <div>
          <div class="flex items-center gap-2 mb-2.5 text-amber-400">
            <div class="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 shrink-0">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
            </div>
            <h4 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-300">สิ่งที่ควรเตรียมพร้อม</h4>
          </div>
          <p class="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
            ${actionAdvice}
          </p>
        </div>
      </div>
    </div>

    <!-- 3. Official Context Notice (if provided) -->
    ${officialContext ? `
      <div class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/90 text-xs text-slate-400 flex items-start gap-2.5 shadow-inner">
        <i data-lucide="info" class="w-4 h-4 text-violet-400 shrink-0 mt-0.5"></i>
        <div class="leading-relaxed">
          <span class="font-bold text-slate-300">ประกาศทางการ / สนน.กทม. - กรมชลประทาน:</span> ${officialContext}
        </div>
      </div>
    ` : ''}

    <!-- 4. Warning Bar When AI Call is Not Configured or Failed -->
    ${!isGeminiSuccess ? `
      <div id="aiEvaluationWarningBanner" class="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm mt-1">
        <div class="flex items-center gap-2">
          <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400 shrink-0"></i>
          <span class="font-bold">⚠️ โหมดประเมินอัตโนมัติ (ยังไม่ได้เชื่อมต่อ Gemini API Key)</span>
        </div>
        ${data.apiError && (data.apiError.error?.message || data.apiError.message) ? `
          <div class="text-[11px] text-amber-300/80 font-mono mt-0.5 pl-6">
            Error: ${String(data.apiError.error?.message || data.apiError.message).slice(0, 120)}
          </div>
        ` : ''}
        <span class="text-[11px] text-amber-400/80 font-mono">เวลาประเมิน: ${analyzedTime}</span>
      </div>
    ` : ''}

    <!-- 5. Bottom Status Sub-bar -->
    <div class="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
      <div class="flex items-center gap-2 text-slate-300">
        <span class="p-1 rounded-md bg-slate-800 text-sky-400 shrink-0">
          <i data-lucide="trending-up" class="w-3.5 h-3.5"></i>
        </span>
        <span class="text-slate-400 text-[11px]">แนวโน้ม 6-12 ชม.:</span>
        <span class="font-bold text-sky-300 text-xs">${trend6h}</span>
      </div>
      <div class="flex items-center gap-2.5 text-[11px] text-slate-300 font-mono">
        ${isGeminiSuccess ? `
          <span class="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-400/40 text-[10px] font-bold flex items-center gap-1">
            <span class="text-amber-400 select-none">✨</span>
            <span>วิเคราะห์ด้วย Gemini 3.5 Flash Lite</span>
          </span>
        ` : `
          <span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-semibold border border-slate-700/60">
            ระบบวิเคราะห์อุทกวิทยา
          </span>
        `}
        <span class="text-slate-600">•</span>
        <span class="flex items-center gap-1">
          <i data-lucide="clock" class="w-3 h-3 text-slate-500"></i>
          <span>${analyzedTime}</span>
        </span>
      </div>
    </div>
  `;

  if (content) {
    content.innerHTML = html;
    content.classList.remove('hidden');
  }

  if (skeleton) {
    skeleton.classList.add('hidden');
    skeleton.classList.remove('animate-pulse');
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Always end the AI loading state, including when rendering the normal
 * response or fallback response itself fails.
 */
function renderAiFallback(error) {
  const skeleton = document.getElementById('aiLoadingSkeleton');
  const content = document.getElementById('aiAnalysisContent');
  const message = 'ยังไม่สามารถโหลดบทวิเคราะห์ AI ได้ ขณะนี้ระบบจะแสดงข้อมูลระดับน้ำและสถานะแจ้งเตือนตามปกติ';

  if (skeleton) {
    skeleton.classList.add('hidden');
    skeleton.classList.remove('animate-pulse');
  }
  if (content) {
    content.classList.remove('hidden');
    content.innerHTML = `
      <div class="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-950/20 text-amber-200 text-sm leading-relaxed">
        <div class="flex items-start gap-2">
          <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>
          <span>${message}</span>
        </div>
      </div>
    `;
  }

  const modelBadge = document.getElementById('aiModelBadge');
  if (modelBadge) {
    modelBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow-sm flex items-center gap-1 font-mono';
    modelBadge.textContent = 'โหมดประเมินอัตโนมัติ';
  }
  if (window.lucide) window.lucide.createIcons();
  if (error) console.error('AI fallback rendered:', error);
}
window.renderAiFallback = renderAiFallback;

/**
 * ========================================================
 * 24-HOUR HISTORICAL WATER LEVEL CHART (CHART.JS - DYNAMIC IMPORT)
 * ========================================================
 */
let waterChartInstance = null;
let historicalDataCache = null;
let currentChartStationId = 'thaiwater_k8';
let chartJsLoadingPromise = null;

/**
 * Dynamically load Chart.js on-demand (Deferred until chart section scrolled into view)
 * Eliminates ~250KB from initial render path, improving LCP and eliminating render-blocking JS
 */
function loadChartJs() {
  if (typeof Chart !== 'undefined') {
    return Promise.resolve(window.Chart);
  }
  if (chartJsLoadingPromise) {
    return chartJsLoadingPromise;
  }
  chartJsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.async = true;
    script.onload = () => {
      if (typeof Chart === 'undefined') {
        chartJsLoadingPromise = null;
        reject(new Error('Chart.js loaded without exposing the Chart global'));
        return;
      }
      console.log('[Chart.js]: Loaded dynamically on-demand');
      resolve(window.Chart);
    };
    script.onerror = (err) => {
      chartJsLoadingPromise = null;
      console.error('[Chart.js]: Failed to load dynamically', err);
      reject(err);
    };
    document.head.appendChild(script);
  });
  return chartJsLoadingPromise;
}
window.loadChartJs = loadChartJs;

function renderChartFallbackMessage(message = 'อยู่ระหว่างเชื่อมต่อข้อมูลย้อนหลัง') {
  const canvas = document.getElementById('waterHistoryCanvas');
  if (!canvas) return;

  const container = canvas.parentElement;
  if (!container) return;
  canvas.classList.add('hidden');

  let fallback = document.getElementById('chartFallbackMessage');
  if (!fallback) {
    fallback = document.createElement('div');
    fallback.id = 'chartFallbackMessage';
    fallback.className = 'absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-slate-400';
    container.appendChild(fallback);
  }
  fallback.textContent = message;
}

function clearChartFallbackMessage() {
  const canvas = document.getElementById('waterHistoryCanvas');
  if (canvas) canvas.classList.remove('hidden');
  const fallback = document.getElementById('chartFallbackMessage');
  if (fallback) fallback.remove();
}

function initChart(stationId = currentChartStationId, liveData) {
  if (typeof Chart === 'undefined') {
    loadChartJs()
      .then(() => renderWaterHistoryChart(stationId, liveData))
      .catch(err => {
        console.warn('[Chart.js]: Chart library unavailable', err);
        renderChartFallbackMessage();
      });
    return;
  }
  renderWaterHistoryChart(stationId, liveData);
}
window.initChart = initChart;

/**
 * Setup IntersectionObserver to trigger Chart.js loading only when user scrolls near the chart
 */
function setupChartIntersectionObserver() {
  const chartSection = document.getElementById('waterHistorySection');
  if (!chartSection) return;

  renderStationSelectorButtons();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          observer.disconnect();
          initWaterHistoryChart();
        }
      });
    }, { rootMargin: '250px' });
    observer.observe(chartSection);
  } else {
    initWaterHistoryChart();
  }
}
window.setupChartIntersectionObserver = setupChartIntersectionObserver;

const ALL_CHART_STATIONS = [
  { id: 'thaiwater_k8', stCode: 'ST-1', name: 'คลองหกวา ลำลูกกา คลอง 8', canal: 'คลองหกวา' },
  { id: 'bma_wf_k0801', stCode: 'ST-2', name: 'ปตร.คลองแปด ตอนซอย อบจ.ปทุมธานี 2006', canal: 'คลองหกวา' },
  { id: 'bma_wf_khw01', stCode: 'ST-3', name: 'สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่', canal: 'คลองหกวา' },
  { id: 'bma_wf_swa02', stCode: 'ST-4', name: 'คลองสามวา ตอนถนนเทศบาลลำลูกกา 1', canal: 'คลองสามวา' },
  { id: 'bma_weather_126', stCode: 'ST-5', name: 'คลองพระยาสุเรนทร์ ตอนถนนหนองระแหง', canal: 'คลองพระยาสุเรนทร์' },
  { id: 'bma_weather_125', stCode: 'ST-6', name: 'คลองพระยาสุเรนทร์ ตอนถนนจตุโชติ', canal: 'คลองพระยาสุเรนทร์' },
  { id: 'bma_weather_124', stCode: 'ST-7', name: 'ปตร.พระยาสุเรนทร์ ตอนคู้บอน', canal: 'คลองพระยาสุเรนทร์' },
  { id: 'bma_weather_127', stCode: 'ST-8', name: 'คลองพระยาสุเรนทร์ ตอนปัญญาอินทรา', canal: 'คลองพระยาสุเรนทร์' },
  { id: 'bma_weather_21', stCode: 'ST-9', name: 'ประตูระบายน้ำคลองสามวา (ถนนประชาร่วมใจ)', canal: 'คลองสามวา' }
];

async function initWaterHistoryChart() {
  const overlay = document.getElementById('chartLoadingOverlay');
  if (overlay) overlay.classList.remove('hidden');

  renderStationSelectorButtons();

  try {
    await loadChartJs();
    const res = await fetch(`/api/water-history?station=${encodeURIComponent(currentChartStationId)}&_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    historicalDataCache = data.stations || {};
    window.cachedStationHistory = Object.assign(window.cachedStationHistory || {}, historicalDataCache);
    const targetData = data.selectedStation || (data.waterLevels ? data : null);
    if (targetData) {
      historicalDataCache[currentChartStationId] = targetData;
      if (targetData.id) historicalDataCache[targetData.id] = targetData;
      if (targetData.stCode) historicalDataCache[targetData.stCode] = targetData;
      window.cachedStationHistory[currentChartStationId] = targetData;
      if (targetData.id) window.cachedStationHistory[targetData.id] = targetData;
      if (targetData.stCode) window.cachedStationHistory[targetData.stCode] = targetData;
    }

    renderStationSelectorButtons();
    initChart(currentChartStationId, targetData);
  } catch (err) {
    console.warn('[Water History Error] Using fallback telemetry history:', err);
    historicalDataCache = generateClientSideHistoryFallback();
    window.cachedStationHistory = Object.assign(window.cachedStationHistory || {}, historicalDataCache);
    renderStationSelectorButtons();
    initChart(currentChartStationId);
  } finally {
    if (overlay) overlay.classList.add('hidden');
  }
}
window.initWaterHistoryChart = initWaterHistoryChart;

function generateClientSideHistoryFallback() {
  const fallback = {};
  const now = new Date();
  ALL_CHART_STATIONS.forEach((canon, idx) => {
    const times = [];
    const labels = [];
    const levels = [];

    // Check if card station level exists in appState or DOM
    let currentLvl = 1.0;
    if (typeof appState !== 'undefined' && appState.stations) {
      const match = appState.stations.find(s => s.id === canon.id || s.stCode === canon.stCode);
      if (match && typeof match.waterLevel === 'number') currentLvl = match.waterLevel;
    }

    const defaultBanks = {
      'ST-1': 2.71, 'ST-2': 2.00, 'ST-3': 2.30, 'ST-4': 2.00,
      'ST-5': 1.60, 'ST-6': 1.50, 'ST-7': 1.30, 'ST-8': 1.40, 'ST-9': 1.70
    };
    const defaultCrits = {
      'ST-1': 2.41, 'ST-2': 1.80, 'ST-3': 2.00, 'ST-4': 1.80,
      'ST-5': 1.20, 'ST-6': 1.20, 'ST-7': 0.80, 'ST-8': 1.00, 'ST-9': 1.30
    };
    const stCode = canon.stCode || `ST-${idx + 1}`;
    const bankLvl = defaultBanks[stCode] || 2.00;
    const critLvl = defaultCrits[stCode] || 1.80;

    for (let i = 24; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600000);
      const h = String(d.getHours()).padStart(2, '0');
      times.push(d.toISOString());
      labels.push(i === 0 ? `${h}:${String(now.getMinutes()).padStart(2, '0')}` : `${h}:00`);
      levels.push(currentLvl);
    }
    fallback[canon.id] = {
      id: canon.id,
      stCode: stCode,
      name: canon.name,
      canal: canon.canal || 'คลองหกวา',
      unit: 'ม.รทก.',
      criticalThreshold: critLvl,
      overflowThreshold: bankLvl,
      criticalLevel: critLvl,
      bankLevel: bankLvl,
      currentLevel: currentLvl,
      isEstimated: false,
      trend: 'stable',
      timestamps: times,
      timeLabels: labels,
      waterLevels: levels,
      stats: {
        min: currentLvl,
        max: currentLvl,
        avg: currentLvl,
        change24h: '+0.00'
      }
    };
  });
  return fallback;
}

function renderStationSelectorButtons() {
  const container = document.getElementById('chartStationButtons');
  if (!container) return;

  container.innerHTML = ALL_CHART_STATIONS.map(st => {
    const isSelected = (currentChartStationId === st.id || currentChartStationId === st.stCode);
    const activeClass = isSelected
      ? 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow-sm font-bold ring-1 ring-sky-400/30'
      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800';
    const tabLabel = st.stCode === 'ST-9' ? 'ปตร.คลองสามวา' : st.canal;

    return `
      <button type="button" data-station-id="${st.id}" onclick="selectStationChart('${st.id}')" aria-label="ดูกราฟประวัติระดับน้ำ ${st.stCode} ${st.name}" class="min-h-[44px] px-3.5 py-2 rounded-xl border text-xs whitespace-nowrap shrink-0 transition touch-manipulation flex items-center gap-1.5 ${activeClass}">
        <span class="font-mono font-bold">${st.stCode}</span>
        <span class="text-[11px] whitespace-nowrap">${tabLabel}</span>
      </button>
    `;
  }).join('');
}

async function selectStationChart(stationId) {
  currentChartStationId = stationId;
  renderStationSelectorButtons();

  const overlay = document.getElementById('chartLoadingOverlay');
  if (overlay) overlay.classList.remove('hidden');

  try {
    await loadChartJs();
    const res = await fetch(`/api/water-history?station=${encodeURIComponent(stationId)}&_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const targetData = data.selectedStation || (data.waterLevels ? data : null);
    if (targetData) {
      if (!historicalDataCache) historicalDataCache = {};
      historicalDataCache[stationId] = targetData;
      if (targetData.id) historicalDataCache[targetData.id] = targetData;
      if (targetData.stCode) historicalDataCache[targetData.stCode] = targetData;
      window.cachedStationHistory[stationId] = targetData;
      if (targetData.id) window.cachedStationHistory[targetData.id] = targetData;
      if (targetData.stCode) window.cachedStationHistory[targetData.stCode] = targetData;
      initChart(stationId, targetData);
    } else {
      initChart(stationId);
    }
  } catch (err) {
    console.warn('[Water History] Failed on-demand fetch for', stationId, err);
    initChart(stationId);
  } finally {
    if (overlay) overlay.classList.add('hidden');
  }
}
window.selectStationChart = selectStationChart;

function focusMainChart(stationId) {
  const chartSection = document.getElementById('waterHistorySection') ||
    document.getElementById('trend-chart-section');
  if (!chartSection) return;

  const stationButton = document.querySelector(`[data-station-id="${stationId}"]`);
  if (stationButton) {
    stationButton.click();
  } else {
    selectStationChart(stationId);
  }

  chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  chartSection.classList.remove('main-chart-focus-flash');
  void chartSection.offsetWidth;
  chartSection.classList.add('main-chart-focus-flash');
  setTimeout(() => chartSection.classList.remove('main-chart-focus-flash'), 1100);
}
window.focusMainChart = focusMainChart;

function viewStationHistory(stationId) {
  selectStationChart(stationId);
  const section = document.getElementById('waterHistorySection');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.viewStationHistory = viewStationHistory;

function renderWaterHistoryChart(stationId, liveData) {
  if (typeof Chart === 'undefined') {
    initChart(stationId, liveData);
    return;
  }

  let st = liveData;
  if (!st && historicalDataCache) {
    st = historicalDataCache[stationId] || 
         Object.values(historicalDataCache).find(s => s && (s.id === stationId || s.stCode === stationId));
  }
  if (!st || !Array.isArray(st.waterLevels) || st.waterLevels.length === 0) {
    renderChartFallbackMessage();
    return;
  }
  const isWaterGate = st.isWaterGate === true ||
    (Array.isArray(st.waterLevelsOut) && st.waterLevelsOut.length > 0);
  const waterLevelsOut = (isWaterGate ? st.waterLevelsOut : st.waterLevels)
    .map(Number).filter(Number.isFinite);
  const waterLevelsIn = isWaterGate && Array.isArray(st.waterLevelsIn)
    ? st.waterLevelsIn.map(Number).filter(Number.isFinite)
    : [];
  if (isWaterGate && waterLevelsOut.length > 0) {
    st.waterLevels = waterLevelsOut;
    st.waterLevelsOut = waterLevelsOut;
  }
  clearChartFallbackMessage();
  if (!Array.isArray(st.timeLabels) || st.timeLabels.length !== st.waterLevels.length) {
    st.timeLabels = st.waterLevels.map((_, index) => `${index + 1}:00`);
  }

  const canvas = document.getElementById('waterHistoryCanvas');
  if (!canvas) return;

  // 1:1 Synchronization with Station Card Above
  // Find current water level on the corresponding card in Section 2 / Section 3
  let cardWaterLevel = null;
  let cardSt = null;
  if (typeof appState !== 'undefined' && Array.isArray(appState.stations)) {
    cardSt = appState.stations.find(s => s.id === stationId || s.stCode === stationId || (st && (s.id === st.id || s.stCode === st.stCode)));
    if (cardSt && cardSt.waterLevel !== null && cardSt.waterLevel !== undefined) {
      const parsed = parseFloat(cardSt.waterLevel);
      if (!isNaN(parsed) && parsed > 0) cardWaterLevel = parsed;
    }
  }
  if (cardWaterLevel === null) {
    const cardEl = document.querySelector(`[data-station-level="${st.id || stationId}"]`);
    if (cardEl && cardEl.textContent && cardEl.textContent !== '--') {
      const parsed = parseFloat(cardEl.textContent.trim());
      if (!isNaN(parsed) && parsed > 0) cardWaterLevel = parsed;
    }
  }

  // 1. Build Raw History Array
  let rawHistory = [];
  if (Array.isArray(st.rawHistory) && st.rawHistory.length > 0) {
    rawHistory = st.rawHistory.map(item => ({ ...item }));
  } else if (Array.isArray(st.history) && st.history.length > 0) {
    rawHistory = st.history.map(item => ({ ...item }));
  } else if (Array.isArray(st.waterLevels)) {
    rawHistory = st.waterLevels.map((lvl, idx) => ({
      timestamp: (st.timestamps && st.timestamps[idx]) || null,
      time: (st.timestamps && st.timestamps[idx]) || (st.timeLabels && st.timeLabels[idx]) || `${idx}`,
      timeLabel: (st.timeLabels && st.timeLabels[idx]) || `${idx + 1}:00`,
      waterLevel: Number(lvl),
      waterLevelIn: isWaterGate && Array.isArray(waterLevelsIn) ? Number(waterLevelsIn[idx]) : undefined,
      waterLevelOut: isWaterGate && Array.isArray(waterLevelsOut) ? Number(waterLevelsOut[idx]) : undefined
    }));
  }

  // Filter out any previous synthetic/stale points if re-rendering from cache
  rawHistory = rawHistory.filter(item => !item.isStale && !String(item.timeLabel || '').includes('(ปัจจุบัน)'));

  // 1.2 จัดเรียงข้อมูลจาก "อดีต ไปหา ปัจจุบัน" เสมอ (Ascending Sort)
  rawHistory.sort((a, b) => parseSafeTime(a.timestamp || a.time) - parseSafeTime(b.timestamp || b.time));

  // 2. กรองข้อมูลให้อยู่ในกรอบ 24 ชั่วโมงล่าสุดเท่านั้น (Strict 24-Hour Window)
  const now = Date.now();
  const past24hCutoff = now - (26 * 60 * 60 * 1000); // เผื่อบัฟเฟอร์ 26 ชม.
  let history24h = rawHistory.filter(item => parseSafeTime(item.timestamp || item.time) >= past24hCutoff);
  if (history24h.length === 0 && rawHistory.length > 0) {
    history24h = rawHistory.slice(-24);
  }

  // กรองข้อมูลเวลาซ้ำ (Deduplicate Timestamps)
  const uniqueHistory = [];
  const seenTimes = new Set();
  history24h.forEach(item => {
    const epoch = parseSafeTime(item.timestamp || item.time);
    const timeKey = epoch > 0 ? epoch : (item.time || item.timestamp || item.timeLabel);
    if (!seenTimes.has(timeKey)) {
      seenTimes.add(timeKey);
      uniqueHistory.push(item);
    }
  });

  if (uniqueHistory.length === 0 && history24h.length > 0) {
    uniqueHistory.push(...history24h);
  }

  // Sync latest raw point with card level if available
  if (cardWaterLevel !== null && !isNaN(cardWaterLevel) && uniqueHistory.length > 0) {
    const lastRaw = uniqueHistory[uniqueHistory.length - 1];
    lastRaw.waterLevel = cardWaterLevel;
    if (isWaterGate) lastRaw.waterLevelOut = cardWaterLevel;
  }

  // 3. ตรวจสอบสถานะ "ข้อมูลไม่อัปเดต" อย่างแม่นยำ (Accurate Stale Check)
  let isActuallyStale = false;
  let diffHours = 0;

  if (uniqueHistory.length > 0) {
    const latestItem = uniqueHistory[uniqueHistory.length - 1];
    let latestTime = parseSafeTime(latestItem?.timestamp || latestItem?.time);

    // If card has a fresher valid timestamp, use it
    if (cardSt) {
      const cardTimeStr = cardSt.lastValidTime || cardSt.updatedAt || cardSt.time || cardSt.timestamp;
      const cardTime = parseSafeTime(cardTimeStr);
      if (cardTime > latestTime) {
        latestTime = cardTime;
      }
    }

    if (latestTime > 0) {
      diffHours = (now - latestTime) / (1000 * 60 * 60);

      // เงื่อนไข: ต้องหยุดส่งข้อมูลเกิน 2 ชั่วโมงขึ้นไปจริงๆ จึงจะถือว่าไม่อัปเดต
      isActuallyStale = diffHours >= 2.0 && diffHours < 120; // ป้องกันค่าหลุด NaN

      if (isActuallyStale) {
        // เพิ่มจุดข้อมูลเสมือนที่เวลาปัจจุบัน โดยคงระดับน้ำล่าสุดไว้ (Forward Fill)
        const nowFormatted = new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        uniqueHistory.push({
          timestamp: new Date(now).toISOString(),
          time: new Date(now).toISOString(),
          timeLabel: nowFormatted + ' (ปัจจุบัน)',
          waterLevel: latestItem.waterLevel,
          waterLevelIn: latestItem.waterLevelIn,
          waterLevelOut: latestItem.waterLevelOut,
          isStale: true
        });
      }
    }
  }

  // 4. จัด Format ป้ายแกนเวลาแต่ละจุดให้เป็นช่วงเวลาที่อ่านง่าย (HH:mm)
  uniqueHistory.forEach(item => {
    if (!item.isStale) {
      const epoch = parseSafeTime(item.timestamp || item.time);
      if (epoch > 0) {
        const d = new Date(epoch);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        item.timeLabel = `${hh}:${mm}`;
      }
    }
  });

  // Populate back to station arrays for Chart.js
  st.timeLabels = uniqueHistory.map(item => item.timeLabel);
  st.waterLevels = uniqueHistory.map(item => item.waterLevel);
  if (isWaterGate) {
    st.waterLevelsIn = uniqueHistory.map(item => item.waterLevelIn ?? item.waterLevel);
    st.waterLevelsOut = uniqueHistory.map(item => item.waterLevelOut ?? item.waterLevel);
  }

  // Enforce 1:1 exact match with card on current level and latest point
  const currentLevelVal = cardWaterLevel ?? (st.waterLevels && st.waterLevels.length > 0 ? st.waterLevels[st.waterLevels.length - 1] : null);
  st.currentLevel = currentLevelVal;
  if (isWaterGate) {
    st.currentLevelOut = currentLevelVal;
    if (st.waterLevelsIn && st.waterLevelsIn.length > 0) {
      st.currentLevelIn = st.waterLevelsIn[st.waterLevelsIn.length - 1];
    }
  }

  const historyLevels = st.waterLevels
    .map(value => Number(value))
    .filter(Number.isFinite);
  const currentLevel = Number(st.currentLevel ?? historyLevels[historyLevels.length - 1]);
  const allLevels = Number.isFinite(currentLevel)
    ? [...historyLevels, currentLevel]
    : historyLevels;
  const maxVal = allLevels.length > 0 ? Math.max(...allLevels) : null;
  const minVal = allLevels.length > 0 ? Math.min(...allLevels) : null;
  const diff24h = Number.isFinite(currentLevel) && historyLevels.length > 0
    ? currentLevel - historyLevels[0]
    : null;
  const diff24hText = diff24h === null
    ? '--'
    : `${diff24h >= 0 ? '+' : ''}${diff24h.toFixed(2)}`;
  st.stats = {
    ...(st.stats || {}),
    max: maxVal,
    min: minVal,
    change24h: diff24hText
  };

  // Thresholds standard specs
  if (st.stCode === 'ST-1' || st.id === 'thaiwater_k8') {
    st.bankLevel = 2.71;
    st.criticalLevel = 2.41;
  } else if (st.stCode === 'ST-2') {
    st.bankLevel = 2.00;
    st.criticalLevel = 1.80;
  } else if (st.stCode === 'ST-3') {
    st.bankLevel = 2.30;
    st.criticalLevel = 2.00;
  } else if (st.stCode === 'ST-4') {
    st.bankLevel = 2.00;
    st.criticalLevel = 1.80;
  } else if (st.stCode === 'ST-5') {
    st.bankLevel = 1.60;
    st.criticalLevel = 1.20;
  } else if (st.stCode === 'ST-6') {
    st.bankLevel = 1.50;
    st.criticalLevel = 1.20;
  } else if (st.stCode === 'ST-7') {
    st.bankLevel = 1.30;
    st.criticalLevel = 0.80;
  } else if (st.stCode === 'ST-8') {
    st.bankLevel = 1.40;
    st.criticalLevel = 1.00;
  } else if (st.stCode === 'ST-9') {
    st.bankLevel = 1.70;
    st.criticalLevel = 1.30;
  }
  st.criticalThreshold = st.criticalLevel;
  st.overflowThreshold = st.bankLevel;

  const latestIn = isWaterGate && Array.isArray(st.waterLevelsIn) && st.waterLevelsIn.length > 0
    ? st.waterLevelsIn[st.waterLevelsIn.length - (isStale ? 2 : 1)]
    : null;
  const latestOut = isWaterGate && Array.isArray(st.waterLevelsOut) && st.waterLevelsOut.length > 0
    ? st.waterLevelsOut[st.waterLevelsOut.length - (isStale ? 2 : 1)]
    : null;
  if (isWaterGate && Number.isFinite(latestIn) && Number.isFinite(latestOut)) {
    st.currentLevelIn = Number(st.currentLevelIn ?? latestIn);
    st.currentLevelOut = Number(st.currentLevelOut ?? latestOut);
    st.headDifference = parseFloat((st.currentLevelIn - st.currentLevelOut).toFixed(2));
  }

  // Update Section Badges
  const badge = document.getElementById('chartStationBadge');
  if (badge) badge.textContent = `${st.stCode || stationId}: ${st.name}`;

  // Update Source Badge (Always Real Telemetry: ThaiWater vs สนน.กทม. - Zero "ประมาณการ")
  const sourceBadge = document.getElementById('chartSourceBadge');
  if (sourceBadge) {
    const isThaiwater = (st.stCode === 'ST-1' || st.id === 'thaiwater_k8' || (st.source && st.source.toLowerCase().includes('thaiwater')));
    if (isThaiwater) {
      sourceBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 flex items-center gap-1';
      sourceBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span><span>ข้อมูลจริง ThaiWater</span>';
    } else {
      sourceBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1';
      sourceBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>ข้อมูลจริง สนน.กทม.</span>';
    }
  }

  // 3. การแสดงผล Badge มุมขวาบน และ Legend
  const staleBadge = document.getElementById('chartStaleBadge');
  const staleBadgeText = document.getElementById('chartStaleBadgeText');
  if (staleBadge) {
    if (isActuallyStale) {
      const roundedHours = Math.max(2, Math.round(diffHours));
      const badgeText = `⚠️ ข้อมูลไม่อัปเดต (${roundedHours} ชม. ที่แล้ว)`;
      if (staleBadgeText) {
        staleBadgeText.textContent = badgeText;
      } else {
        staleBadge.textContent = badgeText;
      }
      staleBadge.classList.remove('hidden');
      staleBadge.classList.add('flex');
    } else {
      // หากข้อมูลสดใหม่ (diffHours < 2.0 เช่น เคส ST-1): ห้ามแสดงป้ายข้อมูลไม่อัปเดตเด็ดขาด
      staleBadge.classList.add('hidden');
      staleBadge.classList.remove('flex');
    }
  }

  const staleLegend = document.getElementById('chartStaleLegend');
  if (staleLegend) {
    if (isActuallyStale) {
      staleLegend.classList.remove('hidden');
      staleLegend.classList.add('flex');
    } else {
      staleLegend.classList.add('hidden');
      staleLegend.classList.remove('flex');
    }
  }

  // Update Trend Pill from the same single-source trend calculation used by popups.
  const trendPill = document.getElementById('chartTrendPill');
  const trendText = document.getElementById('chartTrendText');
  if (trendPill && trendText) {
    const trendHistory = (isWaterGate && Array.isArray(st.waterLevelsOut) && st.waterLevelsOut.length > 0)
      ? st.waterLevelsOut
      : st.waterLevels;
    const trend = getUnifiedWaterTrend(trendHistory);
    trendPill.className = `px-2.5 py-1 rounded-xl text-xs font-semibold ${trend.color} border flex items-center gap-1.5 shadow-sm`;
    trendText.textContent = `${trend.icon} ${trend.text}`;
    trendText.className = 'font-semibold';
    const trendIcon = trendPill.querySelector('i');
    if (trendIcon) trendIcon.style.display = 'none';
  }

  // Update Stats Tiles (Matching latest level 1:1)
  const statCurr = document.getElementById('chartStatCurrent');
  const statMax = document.getElementById('chartStatMax');
  const statMin = document.getElementById('chartStatMin');
  const statChg = document.getElementById('chartStatChange');
  const statChgLabel = document.getElementById('chartStatChangeLabel');

  const currVal = (typeof st.currentLevel === 'number')
    ? st.currentLevel.toFixed(2)
    : (st.waterLevels && st.waterLevels.length > 0 ? Number(st.waterLevels[st.waterLevels.length - 1]).toFixed(2) : '--');

  if (statCurr) {
    statCurr.textContent = isWaterGate
      ? `ใน: ${Number(st.currentLevelIn ?? latestIn).toFixed(2)} / นอก: ${Number(st.currentLevelOut ?? latestOut).toFixed(2)}`
      : currVal;
  }
  if (statMax) statMax.textContent = (st.stats && typeof st.stats.max === 'number') ? st.stats.max.toFixed(2) : '--';
  if (statMin) statMin.textContent = (st.stats && typeof st.stats.min === 'number') ? st.stats.min.toFixed(2) : '--';
  if (statChg) statChg.textContent = st.stats?.change24h || '--';
  if (statChgLabel) statChgLabel.textContent = isWaterGate ? 'ส่วนต่างระดับน้ำ (ใน - นอก)' : 'เปลี่ยนแปลง 24 ชม.';
  const currentLabel = statCurr?.parentElement?.parentElement?.querySelector('span.text-\\[10px\\]');
  if (currentLabel) currentLabel.textContent = isWaterGate ? 'ระดับล่าสุด (ม.รทก.)' : 'ระดับล่าสุด';
  if (isWaterGate && statChg) {
    const diff = Number(st.headDifference);
    statChg.textContent = Number.isFinite(diff)
      ? `Δ ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`
      : '--';
  }
  const insideLegend = document.getElementById('chartInsideLegend');
  const outsideLegend = document.getElementById('chartOutsideLegend');
  const levelLegend = document.getElementById('chartLevelLegend');
  if (insideLegend) insideLegend.classList.toggle('hidden', !isWaterGate);
  if (outsideLegend) outsideLegend.classList.toggle('hidden', !isWaterGate);
  if (levelLegend) levelLegend.classList.toggle('hidden', isWaterGate);
  bindChartQuickActions();

  // Check Chart.js availability
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  // Prepare threshold arrays
  const criticalVal = st.criticalThreshold ?? st.criticalLevel ?? 1.8;
  const bankVal = st.overflowThreshold ?? st.bankLevel ?? 2.0;
  const criticalArr = new Array(st.waterLevels.length).fill(criticalVal);
  const bankArr = new Array(st.waterLevels.length).fill(bankVal);
  const gateThresholds = isWaterGate ? (st.thresholds || {
    in: { warning: 0.70, critical: 0.80, overflow: 1.30 },
    out: { warning: 1.10, critical: 1.30, overflow: 1.70 }
  }) : null;
  const gateThresholdDataset = (label, value, color) => ({
    label: `${label} (${Number(value).toFixed(2)} ม.)`,
    data: new Array(st.waterLevels.length).fill(value),
    borderColor: color,
    borderWidth: 1.5,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false,
    tension: 0
  });

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.00)');

  if (waterChartInstance) {
    waterChartInstance.destroy();
    waterChartInstance = null;
    window.mainTrendChart = null;
  }

  waterChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: st.timeLabels,
      datasets: [
        {
          label: isWaterGate ? 'ระดับน้ำด้านใน (ม.รทก.)' : 'ระดับน้ำ (ม.รทก.)',
          data: isWaterGate ? st.waterLevelsIn : st.waterLevels,
          borderColor: '#38bdf8',
          borderWidth: 2.5,
          backgroundColor: isWaterGate ? 'transparent' : gradient,
          fill: !isWaterGate,
          tension: 0.1,
          stepped: 'before',
          pointRadius: (ctx) => (isActuallyStale && ctx.dataIndex === uniqueHistory.length - 1 ? 4.5 : 2.5),
          pointHoverRadius: 6,
          pointBackgroundColor: (ctx) => (isActuallyStale && ctx.dataIndex === uniqueHistory.length - 1 ? '#fb923c' : '#38bdf8'),
          pointBorderColor: (ctx) => (isActuallyStale && ctx.dataIndex === uniqueHistory.length - 1 ? '#fed7aa' : '#bae6fd'),
          pointBorderWidth: 1.5,
          segment: {
            borderColor: (ctx) => (isActuallyStale && ctx.p1DataIndex === uniqueHistory.length - 1 ? '#fb923c' : undefined),
            borderDash: (ctx) => (isActuallyStale && ctx.p1DataIndex === uniqueHistory.length - 1 ? [6, 4] : undefined)
          }
        },
        ...(isWaterGate ? [{
          label: 'ระดับน้ำด้านนอก (ม.รทก.)',
          data: st.waterLevelsOut,
          borderColor: '#c084fc',
          borderWidth: 2.5,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.1,
          stepped: 'before',
          pointRadius: (ctx) => (isActuallyStale && ctx.dataIndex === uniqueHistory.length - 1 ? 4.5 : 2.5),
          pointHoverRadius: 6,
          pointBackgroundColor: (ctx) => (isActuallyStale && ctx.dataIndex === uniqueHistory.length - 1 ? '#fb923c' : '#c084fc'),
          pointBorderColor: (ctx) => (isActuallyStale && ctx.dataIndex === uniqueHistory.length - 1 ? '#fed7aa' : '#f3e8ff'),
          pointBorderWidth: 1.5,
          segment: {
            borderColor: (ctx) => (isActuallyStale && ctx.p1DataIndex === uniqueHistory.length - 1 ? '#fb923c' : undefined),
            borderDash: (ctx) => (isActuallyStale && ctx.p1DataIndex === uniqueHistory.length - 1 ? [6, 4] : undefined)
          }
        }] : []),
        ...(isWaterGate ? [
          gateThresholdDataset('เตือนภัยด้านใน', gateThresholds.in.warning, '#facc15'),
          gateThresholdDataset('วิกฤติด้านใน', gateThresholds.in.critical, '#fb923c'),
          gateThresholdDataset('ตลิ่งด้านใน', gateThresholds.in.overflow, '#f87171'),
          gateThresholdDataset('เตือนภัยด้านนอก', gateThresholds.out.warning, '#fde68a'),
          gateThresholdDataset('วิกฤติด้านนอก', gateThresholds.out.critical, '#fca5a5'),
          gateThresholdDataset('ตลิ่งด้านนอก', gateThresholds.out.overflow, '#ef4444')
        ] : [{
          label: `เกณฑ์วิกฤติ (${criticalVal.toFixed(2)} ม.)`,
          data: criticalArr,
          borderColor: '#fbbf24',
          borderWidth: 1.8,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          tension: 0
        }, {
          label: `ระดับตลิ่ง (${bankVal.toFixed(2)} ม.)`,
          data: bankArr,
          borderColor: '#ef4444',
          borderWidth: 1.8,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          tension: 0
        }])
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: isWaterGate,
          position: 'bottom',
          labels: { usePointStyle: true, color: '#cbd5e1', padding: 12 }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#f8fafc',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              const index = context.dataIndex;
              const isStalePoint = isActuallyStale && index === uniqueHistory.length - 1;
              const staleSuffix = isStalePoint ? ' (คงค่าเดิม - ข้อมูลค้าง)' : '';

              if (isWaterGate && (context.datasetIndex === 0 || context.datasetIndex === 1)) {
                const inside = Number((st.waterLevelsIn || [])[index] ?? val);
                const outside = Number((st.waterLevelsOut || [])[index] ?? val);
                const difference = inside - outside;
                return context.datasetIndex === 0
                  ? ` ใน: ${inside.toFixed(2)} ม.รทก.${staleSuffix}`
                  : ` นอก: ${outside.toFixed(2)} ม.รทก. | Δ ใน-นอก: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)} ม.${staleSuffix}`;
              }
              if (context.datasetIndex === 0) {
                const diffCrit = (val - criticalVal).toFixed(2);
                const diffStr = diffCrit >= 0 ? ` (+${diffCrit} ม. เหนือวิกฤติ)` : ` (${diffCrit} ม. ถึงวิกฤติ)`;
                return ` ระดับน้ำ: ${val.toFixed(2)} ม.รทก.${diffStr}${staleSuffix}`;
              }
              return ` ${context.dataset.label}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 10, family: 'JetBrains Mono, monospace' },
            padding: 8,
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
            callback: function(val) {
              const label = this.getLabelForValue(val) || '';
              const clean = label.replace(/\s*\(ปัจจุบัน\)/, '');
              const m = clean.match(/(\d{1,2}:\d{2})/);
              return m ? m[1] : clean;
            }
          }
        },
        y: {
          min: isWaterGate ? 0.50 : undefined,
          max: isWaterGate ? 1.80 : undefined,
          grid: {
            color: 'rgba(255, 255, 255, 0.06)',
            drawBorder: false
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 10, family: 'JetBrains Mono, monospace' },
            callback: function(val) {
              return val.toFixed(2) + ' ม.';
            }
          }
        }
      }
    }
  });

  window.mainTrendChart = waterChartInstance;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}
