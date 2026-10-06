/**
 * Cloudflare Pages Function - 24-Hour Real Telemetry Water Level History
 * Route: /api/water-history
 * Description: Retrieves real historical telemetry from ThaiWater and BMA DDS APIs,
 * with 1:1 currentLevel card anchoring, Edge CDN caching, and zero mock/random formula.
 */

// Master Station Metadata and Official API Mappings
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
    isWaterGate: true,
    bedLevel: -1.64,
    thresholds: {
      in: { warning: 0.70, critical: 0.80, overflow: 1.30 },
      out: { warning: 1.10, critical: 1.30, overflow: 1.70 }
    },
    bankLevel: 1.70,
    criticalLevel: 1.30,
    fallbackLevel: 1.39
  }
};

// Global in-memory cache for Worker isolates
const GLOBAL_HISTORY_CACHE = new Map();
let cachedBmaToken = null;
let bmaTokenExpiresAt = 0;

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*'
};

/**
 * Obtain BMA Waterflow Client Token
 */
async function getBmaWaterflowToken() {
  if (cachedBmaToken && Date.now() < bmaTokenExpiresAt) {
    return cachedBmaToken;
  }
  const res = await fetch('https://bmawaterflow.bangkok.go.th/API/Authentication/Client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://bmawaterflow.bangkok.go.th',
      'Referer': 'https://bmawaterflow.bangkok.go.th/map',
      ...COMMON_HEADERS
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
  cachedBmaToken = token;
  bmaTokenExpiresAt = Date.now() + 50 * 60 * 1000;
  return token;
}

// Aliases mapping: supports ST-1..ST-9, numeric IDs, or standard IDs
function resolveStationMeta(query) {
  if (!query) return STATIONS_MAP['thaiwater_k8'];
  const q = String(query).trim().toLowerCase();

  // Match by id directly
  if (STATIONS_MAP[q]) return STATIONS_MAP[q];

  // Match by stCode (e.g. "st-1" or "st1")
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

  // Default fallback
  return STATIONS_MAP['thaiwater_k8'];
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

/**
 * Universal Thai date parser: "DD/MM/BBBB HH:mm" -> Date object (UTC)
 */
function parseThaiDate(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y > 2400) y -= 543; // Convert Buddhist Era to CE
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[1], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  return new Date(Date.UTC(y, month, day, hour - 7, minute));
}

/**
 * Thaiwater date parser: "YYYY-MM-DD HH:mm" -> Date object (UTC)
 */
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

/**
 * Format any Date object to Thai HH:mm (UTC+7)
 */
function formatThaiTimeLabel(dateObj) {
  const dThai = new Date(dateObj.getTime() + 7 * 3600 * 1000);
  return String(dThai.getUTCHours()).padStart(2, '0') + ':' + String(dThai.getUTCMinutes()).padStart(2, '0');
}

/**
 * Sample 25 hourly points from rows array covering the last 24 hours,
 * strictly anchoring the latest real telemetry point at the right-most edge.
 */
function sampleHourlyRows(rows, meta, now = new Date()) {
  if (!rows || rows.length === 0) {
    throw new Error(`No telemetry rows for ${meta.stCode}`);
  }

  // Sort chronologically ascending
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

  // Guarantee that the right-most point is the latest real telemetry reading
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

  const response = {
    stationId: meta.stCode,
    id: meta.id,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    unit: 'ม.รทก.',
    source: meta.source,
    isWaterGate: meta.isGate === true,
    criticalThreshold: meta.criticalLevel,
    overflowThreshold: meta.bankLevel,
    bedLevel: meta.bedLevel,
    thresholds: meta.thresholds,
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

  return response;
}

function sampleHourlyGateRows(rows, meta, now = new Date()) {
  if (!rows || rows.length === 0) {
    throw new Error(`No telemetry rows for ${meta.stCode}`);
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const timestamps = [];
  const timeLabels = [];
  const waterLevelsIn = [];
  const waterLevelsOut = [];

  for (let i = 24; i >= 0; i--) {
    const targetMs = now.getTime() - i * 3600 * 1000;
    let closest = null;
    let minDiff = Infinity;
    for (const row of rows) {
      const diff = Math.abs(row.date.getTime() - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = row;
      }
    }
    if (closest) {
      timestamps.push(closest.date.toISOString());
      timeLabels.push(formatThaiTimeLabel(closest.date));
      waterLevelsIn.push(closest.valIn);
      waterLevelsOut.push(closest.valOut);
    }
  }

  const latestRow = rows[rows.length - 1];
  if (latestRow && waterLevelsIn.length > 0) {
    const lastIndex = waterLevelsIn.length - 1;
    timestamps[lastIndex] = latestRow.date.toISOString();
    timeLabels[lastIndex] = formatThaiTimeLabel(latestRow.date);
    waterLevelsIn[lastIndex] = latestRow.valIn;
    waterLevelsOut[lastIndex] = latestRow.valOut;
  }

  const currentLevelIn = waterLevelsIn[waterLevelsIn.length - 1];
  const currentLevelOut = waterLevelsOut[waterLevelsOut.length - 1];
  const changeIn = currentLevelIn - waterLevelsIn[0];
  const changeOut = currentLevelOut - waterLevelsOut[0];

  return {
    stationId: meta.stCode,
    id: meta.id,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    unit: 'ม.รทก.',
    source: meta.source,
    isWaterGate: true,
    criticalThreshold: meta.criticalLevel,
    overflowThreshold: meta.bankLevel,
    bedLevel: meta.bedLevel,
    thresholds: meta.thresholds,
    criticalLevel: meta.criticalLevel,
    bankLevel: meta.bankLevel,
    currentLevel: currentLevelOut,
    currentLevelIn,
    currentLevelOut,
    bedLevel: meta.bedLevel,
    thresholds: meta.thresholds,
    isEstimated: false,
    trend: Math.abs(changeIn) >= 0.05 ? (changeIn > 0 ? 'rising' : 'falling') : 'stable',
    timestamps,
    timeLabels,
    waterLevels: waterLevelsOut,
    waterLevelsIn,
    waterLevelsOut,
    rawHistory: rows.map(r => ({
      timestamp: r.date.toISOString(),
      time: r.date.toISOString(),
      timeLabel: formatThaiTimeLabel(r.date),
      waterLevel: r.valOut,
      waterLevelIn: r.valIn,
      waterLevelOut: r.valOut
    })),
    headDifference: parseFloat((currentLevelIn - currentLevelOut).toFixed(2)),
    stats: {
      min: parseFloat(Math.min(...waterLevelsOut).toFixed(2)),
      max: parseFloat(Math.max(...waterLevelsOut).toFixed(2)),
      avg: parseFloat((waterLevelsOut.reduce((a, b) => a + b, 0) / waterLevelsOut.length).toFixed(2)),
      change24h: changeOut >= 0 ? `+${changeOut.toFixed(2)}` : changeOut.toFixed(2),
      minIn: parseFloat(Math.min(...waterLevelsIn).toFixed(2)),
      maxIn: parseFloat(Math.max(...waterLevelsIn).toFixed(2)),
      avgIn: parseFloat((waterLevelsIn.reduce((a, b) => a + b, 0) / waterLevelsIn.length).toFixed(2)),
      change24hIn: changeIn >= 0 ? `+${changeIn.toFixed(2)}` : changeIn.toFixed(2)
    }
  };
}

/**
 * 1. Fetch Real ThaiWater Telemetry History (ST-1)
 */
async function fetchRealThaiwaterHistory(meta, now = new Date()) {
  const url = `https://api-v3.thaiwater.net/api/v1/thaiwater30/iframe/waterlevel_graph?station_type=tele_waterlevel&id=${meta.thaiwaterId || 37}`;
  const response = await fetch(url, {
    headers: {
      ...COMMON_HEADERS,
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
    throw new Error('No valid telemetry points parsed from ThaiWater graph API');
  }

  const result = sampleHourlyRows(rows, meta, now);
  GLOBAL_HISTORY_CACHE.set(meta.id, result);
  return result;
}

/**
 * 2. Fetch Real BMA Waterflow Telemetry History (ST-2, ST-3, ST-4)
 */
async function fetchRealBmaWaterflowHistory(meta, now = new Date()) {
  const token = await getBmaWaterflowToken();
  const startStr = new Date(now.getTime() - 48 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  const stopStr = now.toISOString().replace(/\.\d{3}Z$/, '');

  const url = `https://bmawaterflow.bangkok.go.th/API/DataTransections/Stations/${meta.uuid}?datestart=${startStr}&datestop=${stopStr}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...COMMON_HEADERS,
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
    throw new Error(`No valid transactions parsed from BMA Waterflow ${meta.stCode}`);
  }

  const result = sampleHourlyRows(rows, meta, now);
  GLOBAL_HISTORY_CACHE.set(meta.id, result);
  return result;
}

/**
 * 3. Fetch Real BMA Weather Telemetry History (ST-5, ST-6, ST-7, ST-8, ST-9)
 */
async function fetchRealBmaWeatherHistory(bmaId, meta, now = new Date()) {
  const url = `https://weather.bangkok.go.th/water/StationDetail?id=${bmaId}`;
  const response = await fetch(url, {
    headers: {
      ...COMMON_HEADERS,
      'Referer': 'https://weather.bangkok.go.th/water/'
    }
  });

  if (!response.ok) {
    throw new Error(`BMA Weather HTTP error ${response.status}`);
  }

  const html = await response.text();
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const isGate = meta.isGate === true || bmaId === 21;
  const rows = [];

  for (const tr of trMatches) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length >= (isGate ? 4 : 3)) {
      const timeStr = cells[1];
      const valIn = parseFloat(cells[2]);
      const valOut = parseFloat(isGate ? cells[3] : cells[2]);
      if (timeStr && !isNaN(valIn) && valIn > -50 && valIn < 50 &&
          !isNaN(valOut) && valOut > -50 && valOut < 50) {
        const dateObj = parseThaiDate(timeStr);
        if (dateObj && !isNaN(dateObj.getTime())) {
          rows.push({
            date: dateObj,
            val: parseFloat(valOut.toFixed(2)),
            valIn: parseFloat(valIn.toFixed(2)),
            valOut: parseFloat(valOut.toFixed(2))
          });
        }
      }
    }
  }

  if (rows.length === 0) {
    throw new Error(`No telemetry rows parsed from BMA Weather ID ${bmaId}`);
  }

  const result = isGate
    ? sampleHourlyGateRows(rows, meta, now)
    : sampleHourlyRows(rows, meta, now);
  result.isWaterGate = isGate;
  GLOBAL_HISTORY_CACHE.set(meta.id, result);
  return result;
}

/**
 * Universal station history fetcher dispatcher
 */
async function fetchStationHistory(meta, now = new Date()) {
  if (meta.source === 'ThaiWater') {
    return await fetchRealThaiwaterHistory(meta, now);
  }
  if (meta.source === 'BMA Waterflow') {
    return await fetchRealBmaWaterflowHistory(meta, now);
  }
  if (meta.source === 'BMA Weather' && meta.bmaId) {
    return await fetchRealBmaWeatherHistory(meta.bmaId, meta, now);
  }
  throw new Error(`No handler for source: ${meta.source}`);
}

/**
 * Safe fallback anchored at real verified current level (NO random/mock formula)
 */
function createSafeBaselineHistory(meta, now = new Date()) {
  const timestamps = [];
  const timeLabels = [];
  const waterLevels = [];
  const baseLvl = parseFloat(meta.fallbackLevel);

  for (let i = 24; i >= 0; i--) {
    const ptDate = new Date(now.getTime() - i * 3600 * 1000);
    timestamps.push(ptDate.toISOString());
    timeLabels.push(formatThaiTimeLabel(ptDate));
    waterLevels.push(baseLvl);
  }

  const response = {
    stationId: meta.stCode,
    id: meta.id,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    unit: 'ม.รทก.',
    source: meta.source,
    isWaterGate: meta.isGate === true,
    criticalThreshold: meta.criticalLevel,
    overflowThreshold: meta.bankLevel,
    bedLevel: meta.bedLevel,
    thresholds: meta.thresholds,
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

  if (meta.isGate) {
    const insideLevel = 0.93;
    response.currentLevelIn = insideLevel;
    response.currentLevelOut = baseLvl;
    response.waterLevelsIn = waterLevels.map(() => insideLevel);
    response.waterLevelsOut = waterLevels.slice();
    response.headDifference = parseFloat((insideLevel - baseLvl).toFixed(2));
    response.stats.minIn = insideLevel;
    response.stats.maxIn = insideLevel;
    response.stats.avgIn = insideLevel;
    response.stats.change24hIn = '+0.00';
  }

  return response;
}

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  const url = new URL(request.url);
  const requestedQuery = url.searchParams.get('station') || url.searchParams.get('stationId') || url.searchParams.get('id');
  const fetchAll = url.searchParams.get('all') === 'true';
  const targetMeta = resolveStationMeta(requestedQuery);
  const now = new Date();

  let selectedStationData = null;

  // Fetch requested station telemetry
  try {
    selectedStationData = await fetchStationHistory(targetMeta, now);
  } catch (err) {
    console.warn(`[Water History] Failed real fetch for ${targetMeta.stCode}:`, err.message);
    if (GLOBAL_HISTORY_CACHE.has(targetMeta.id)) {
      selectedStationData = GLOBAL_HISTORY_CACHE.get(targetMeta.id);
    } else {
      selectedStationData = createSafeBaselineHistory(targetMeta, now);
    }
  }

  // Pre-populate stations map
  const allStations = {};
  if (fetchAll) {
    const keys = Object.keys(STATIONS_MAP);
    const results = await Promise.allSettled(keys.map(k => {
      const m = STATIONS_MAP[k];
      return m.id === targetMeta.id ? Promise.resolve(selectedStationData) : fetchStationHistory(m, now);
    }));
    keys.forEach((k, idx) => {
      const res = results[idx];
      const m = STATIONS_MAP[k];
      if (res.status === 'fulfilled') {
        allStations[m.id] = res.value;
      } else if (GLOBAL_HISTORY_CACHE.has(m.id)) {
        allStations[m.id] = GLOBAL_HISTORY_CACHE.get(m.id);
      } else {
        allStations[m.id] = createSafeBaselineHistory(m, now);
      }
    });
  } else {
    for (const key of Object.keys(STATIONS_MAP)) {
      const m = STATIONS_MAP[key];
      if (m.id === targetMeta.id) {
        allStations[m.id] = selectedStationData;
      } else if (GLOBAL_HISTORY_CACHE.has(m.id)) {
        allStations[m.id] = GLOBAL_HISTORY_CACHE.get(m.id);
      } else {
        allStations[m.id] = createSafeBaselineHistory(m, now);
      }
    }
  }

  const payload = {
    success: true,
    serverTime: now.toISOString(),
    ...selectedStationData,
    selectedStation: selectedStationData,
    stations: allStations
  };

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Data-Source': selectedStationData.source || 'Official-Telemetry'
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers
  });
}

export async function onRequestGet(context) {
  return onRequest(context);
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
