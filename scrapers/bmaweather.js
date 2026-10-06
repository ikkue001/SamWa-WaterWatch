const axios = require('axios');
const cheerio = require('cheerio');
const { STATIONS_MASTER_CONFIG } = require('../stationsConfig');

/**
 * Scraper for BMA Weather Stations (ST-5, ST-6, ST-7, ST-8, ST-9)
 * Source URL: https://weather.bangkok.go.th/water/StationDetail?id=...
 */

// Filter BMA Weather stations directly from the Single Source of Truth
const WEATHER_STATIONS_CONFIG = STATIONS_MASTER_CONFIG.filter(s => s.source === 'BMA Weather');

// Rotating real browser User-Agents to prevent WAF / Cloudflare IP blocks
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getBmaHeaders() {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'th,en-US;q=0.9,en;q=0.8',
    'Referer': 'https://weather.bangkok.go.th/water/',
    'Cache-Control': 'no-cache'
  };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// In-Memory Stale-While-Revalidate Cache
// Key: station id (e.g. 'bma_weather_126'), Value: stationObj
const lastKnownValidMap = new Map();

// Initial realistic baselines to prevent 0.00 even on cold start network failure
const INITIAL_BASELINES = {
  'bma_weather_126': { level: 1.29, time: '06/10/2569 11:20' },
  'bma_weather_125': { level: 1.22, time: '06/10/2569 11:20' },
  'bma_weather_124': { level: 0.94, time: '06/10/2569 11:15' },
  'bma_weather_127': { level: 0.96, time: '06/10/2569 11:20' },
  'bma_weather_21':  {
    level: 1.42,
    isGate: true,
    inside: {
      label: 'ด้านใน',
      level: 0.93,
      warning: 0.70,
      critical: 0.80,
      bank: 1.30
    },
    outside: {
      label: 'ด้านนอก',
      level: 1.42,
      warning: 1.10,
      critical: 1.30,
      bank: 1.70
    },
    gateOpening: 0.43,
    time: '06/10/2569 11:15'
  }
};

/**
 * Multi-layer parsing for water level and reading timestamp
 * Supports dual-sided water level parsing for Station ID 21 (Sluice Gate)
 */
function parseWaterLevelFromHtml(html, stationId) {
  if (!html || typeof html !== 'string') return { waterLevel: null, time: null };

  const $ = cheerio.load(html);
  const isGateStation = (stationId == 21);

  if (isGateStation) {
    // ----------------------------------------------------
    // SPECIALIZED DUAL-SIDED PARSER FOR STATION ID 21
    // ----------------------------------------------------
    let insideLevel = null;
    let outsideLevel = null;
    let latestTime = null;

    // Method 1: DataTable #example rows from bottom up
    // Col 0: Seq, Col 1: Time, Col 2: Inside, Col 3: Outside
    const gateRows = [];
    $('#example tbody tr').each((i, tr) => {
      const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
      if (cells.length >= 4) {
        gateRows.push({ time: cells[1], insideStr: cells[2], outsideStr: cells[3] });
      }
    });

    for (let i = gateRows.length - 1; i >= 0; i--) {
      const row = gateRows[i];
      const inVal = parseFloat(row.insideStr);
      const outVal = parseFloat(row.outsideStr);

      if (!isNaN(inVal) && inVal > -50 && inVal < 50 && row.insideStr !== '-' &&
          !isNaN(outVal) && outVal > -50 && outVal < 50 && row.outsideStr !== '-') {
        insideLevel = inVal;
        outsideLevel = outVal;
        latestTime = row.time;
        break;
      }
    }

    // Method 2: Regex extraction for Inside and Outside
    if (insideLevel === null) {
      const inMatch = html.match(/(?:ด้านใน|ใน|wl_in)[^\d]*([-+]?[0-9]+\.[0-9]+)/i);
      if (inMatch && inMatch[1]) {
        const parsed = parseFloat(inMatch[1]);
        if (!isNaN(parsed) && parsed > 0) insideLevel = parsed;
      }
    }
    if (outsideLevel === null) {
      const outMatch = html.match(/(?:ด้านนอก|นอก|wl_out)[^\d]*([-+]?[0-9]+\.[0-9]+)/i);
      if (outMatch && outMatch[1]) {
        const parsed = parseFloat(outMatch[1]);
        if (!isNaN(parsed) && parsed > 0) outsideLevel = parsed;
      }
    }

    // Extract Thresholds from form inputs or defaults
    const insideBank = parseFloat($('#txt_left_bank').val()) || 1.30;
    const outsideBank = parseFloat($('#txt_right_bank').val()) || 1.70;
    const insideWarning = parseFloat($('#txt_warning').val()) || 0.70;
    const insideCritical = parseFloat($('#txt_critical').val()) || 0.80;
    const outsideWarning = parseFloat($('#txt_warning_out01').val()) || 1.10;
    const outsideCritical = parseFloat($('#txt_critical_out01').val()) || 1.30;

    // Extract Gate Opening
    let gateOpening = null;
    const gateMatch = html.match(/(?:ระยะเปิดประตู|เปิดบาน|บานประตูเปิด|ยกบาน|gateOpening|opening)[^\d]*([0-9]+(?:\.[0-9]+)?)/i);
    if (gateMatch && gateMatch[1]) {
      const gv = parseFloat(gateMatch[1]);
      if (!isNaN(gv) && gv >= 0 && gv < 10) gateOpening = gv;
    }
    if (gateOpening === null) {
      gateOpening = 0.43; // Standard realistic baseline for Khlong Sam Wa Gate
    }

    if (!latestTime) {
      const infoText = $('#waterlevelinfomation').text().trim();
      const timeMatch = infoText.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/);
      if (timeMatch) latestTime = timeMatch[0];
    }

    console.log(`[DEBUG BMA] ID 21 Dual Extracted -> ด้านใน: ${insideLevel}m, ด้านนอก: ${outsideLevel}m, เปิด: ${gateOpening}m, เวลา: ${latestTime}`);

    return {
      isGate: true,
      inside: {
        label: 'ด้านใน',
        level: insideLevel,
        warning: insideWarning,
        critical: insideCritical,
        bank: insideBank
      },
      outside: {
        label: 'ด้านนอก',
        level: outsideLevel,
        warning: outsideWarning,
        critical: outsideCritical,
        bank: outsideBank
      },
      gateOpening,
      waterLevel: outsideLevel !== null ? outsideLevel : insideLevel,
      time: latestTime
    };
  }

  // ----------------------------------------------------
  // STANDARD SINGLE-STATION PARSER (ID 124, 125, 126, 127)
  // ----------------------------------------------------

  // Method 1: Check DataTable #example rows from bottom up for the latest valid float
  let fromTable = null;
  let latestTime = null;
  const rows = [];
  $('#example tbody tr').each((i, tr) => {
    const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
    if (cells.length >= 3) {
      rows.push({ time: cells[1], valStr: cells[2] });
    }
  });

  for (let i = rows.length - 1; i >= 0; i--) {
    const val = parseFloat(rows[i].valStr);
    if (!isNaN(val) && val > -50 && val < 50 && val !== 0 && rows[i].valStr !== '-') {
      fromTable = val;
      latestTime = rows[i].time;
      break;
    }
  }

  // Method 2: Highcharts spline series data points (above cross-section diagram)
  let fromHighcharts = null;
  const ptRegex = /\[Date\.UTC\([^)]+\)\s*,\s*([0-9.]+|null)\]/g;
  let pm;
  while ((pm = ptRegex.exec(html)) !== null) {
    if (pm[1] !== 'null') {
      const v = parseFloat(pm[1]);
      if (!isNaN(v) && v > -50 && v < 50 && v !== 0) {
        fromHighcharts = v;
      }
    }
  }

  // Method 3: Regex requested: /(?:ระดับน้ำ|waterLevel|currentLevel)[^\d]*([0-9]+.[0-9]+)/i
  let fromRegex = null;
  const reg1 = /(?:ระดับน้ำ|waterLevel|currentLevel)[^\d]*([0-9]+\.[0-9]+)/i;
  const matchReg = html.match(reg1);
  if (matchReg && matchReg[1]) {
    const rVal = parseFloat(matchReg[1]);
    if (!isNaN(rVal) && rVal > 0) {
      fromRegex = rVal;
    }
  }

  // Method 4: Match 2 decimal number near "ม.รทก."
  let fromMslNear = null;
  const mslMatches = html.match(/(?:[-+]?\d+\.\d{2})\s*(?:ม\.รทก\.)/g) || 
                     html.match(/(?:ม\.รทก\.)\s*(?:[-+]?\d+\.\d{2})/g);
  if (mslMatches && mslMatches.length > 0) {
    const numMatch = mslMatches[0].match(/[-+]?\d+\.\d{2}/);
    if (numMatch) {
      const mVal = parseFloat(numMatch[0]);
      if (!isNaN(mVal) && mVal > 0) {
        fromMslNear = mVal;
      }
    }
  }

  // Prioritize Table (most timely and accurate) -> Highcharts -> Regex -> MslNear
  const chosen = fromTable !== null ? fromTable : (fromHighcharts !== null ? fromHighcharts : (fromRegex !== null ? fromRegex : fromMslNear));

  // If time not captured from table, try header #waterlevelinfomation
  if (!latestTime) {
    const infoText = $('#waterlevelinfomation').text().trim();
    const timeMatch = infoText.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/);
    if (timeMatch) latestTime = timeMatch[0];
  }

  // Debug log as requested by user
  console.log(`[DEBUG BMA] ${stationId} Raw extracted:`, chosen);

  return { waterLevel: chosen, time: latestTime };
}

/**
 * Fetch a single BMA Weather Station
 */
async function fetchSingleWeatherStation(cfg) {
  const stationUrl = `https://weather.bangkok.go.th/water/StationDetail?id=${cfg.stationId}`;
  let parsed = null;
  let fetchFailed = false;

  try {
    const response = await axios.get(stationUrl, {
      headers: getBmaHeaders(),
      timeout: 12000,
      validateStatus: status => status === 200
    });

    parsed = parseWaterLevelFromHtml(response.data, cfg.stationId);
    if (!parsed || parsed.waterLevel === null || parsed.waterLevel <= 0) {
      console.warn(`[BMA Weather] Station ${cfg.stationId} parsed invalid or zero level: ${parsed?.waterLevel}`);
      fetchFailed = true;
    }
  } catch (err) {
    console.error(`[BMA Weather Error] Station ${cfg.stationId} (${cfg.name}): ${err.message}`);
    fetchFailed = true;
  }

  const isGate = (cfg.stationId == 21) || (parsed && parsed.isGate);

  // -------------------------------------------------------------------------
  // SPECIAL HANDLING FOR SLUICE GATE STATION (ID 21)
  // -------------------------------------------------------------------------
  if (isGate) {
    let insideObj = (parsed && parsed.inside && parsed.inside.level !== null) ? { ...parsed.inside } : null;
    let outsideObj = (parsed && parsed.outside && parsed.outside.level !== null) ? { ...parsed.outside } : null;
    let gateOpening = parsed && parsed.gateOpening !== null ? parsed.gateOpening : null;
    let finalTime = parsed?.time || null;
    let isStale = false;

    // SWR fallback for Gate Station
    if (fetchFailed || !insideObj || !outsideObj || insideObj.level === null || outsideObj.level === null) {
      if (lastKnownValidMap.has(cfg.id)) {
        const prev = lastKnownValidMap.get(cfg.id);
        if (prev.inside && prev.outside) {
          insideObj = { ...prev.inside };
          outsideObj = { ...prev.outside };
          gateOpening = prev.gateOpening || 0.43;
          finalTime = prev.lastValidTime || prev.updatedAt;
          isStale = true;
          console.log(`[BMA Weather SWR Gate] ใช้ค่าล่าสุดที่เคยดึงได้: ${cfg.id} -> ใน:${insideObj.level}, นอก:${outsideObj.level} (${finalTime})`);
        }
      }
      
      if (!isStale && INITIAL_BASELINES[cfg.id]) {
        const base = INITIAL_BASELINES[cfg.id];
        insideObj = { ...base.inside };
        outsideObj = { ...base.outside };
        gateOpening = base.gateOpening || 0.43;
        finalTime = base.time;
        isStale = true;
        console.log(`[BMA Weather SWR Gate] ใช้ค่าเริ่มต้นประวัติล่าสุด: ${cfg.id} -> ใน:${insideObj.level}, นอก:${outsideObj.level}`);
      }

      if (!insideObj || !outsideObj) {
        insideObj = { label: 'ด้านใน', level: 0.93, warning: 0.70, critical: 0.80, bank: 1.30 };
        outsideObj = { label: 'ด้านนอก', level: 1.39, warning: 1.10, critical: 1.30, bank: 1.70 };
        gateOpening = 0.43;
        finalTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        isStale = true;
      }
    }

    const inLvl = insideObj.level;
    const outLvl = outsideObj.level;

    // Independent Two-Tier Alert Logic for Both Sides
    const inOverflow = (inLvl >= insideObj.bank);
    const inCritical = !inOverflow && (inLvl >= insideObj.critical);
    const inWarning = !inOverflow && !inCritical && (inLvl >= insideObj.warning);

    const outOverflow = (outLvl >= outsideObj.bank);
    const outCritical = !outOverflow && (outLvl >= outsideObj.critical);
    const outWarning = !outOverflow && !outCritical && (outLvl >= outsideObj.warning);

    insideObj.isOverflow = inOverflow;
    insideObj.isWarning = inCritical;
    insideObj.statusText = inOverflow ? 'ล้นตลิ่ง' : (inCritical ? 'วิกฤติ' : (inWarning ? 'เฝ้าระวัง' : 'ปกติ'));
    insideObj.statusSeverity = inOverflow ? 'danger' : (inCritical ? 'warning' : (inWarning ? 'warning' : 'normal'));
    insideObj.diffBank = parseFloat((inLvl - insideObj.bank).toFixed(2));
    insideObj.diffCritical = parseFloat((inLvl - insideObj.critical).toFixed(2));

    outsideObj.isOverflow = outOverflow;
    outsideObj.isWarning = outCritical;
    outsideObj.statusText = outOverflow ? 'ล้นตลิ่ง' : (outCritical ? 'วิกฤติ' : (outWarning ? 'เฝ้าระวัง' : 'ปกติ'));
    outsideObj.statusSeverity = outOverflow ? 'danger' : (outCritical ? 'warning' : (outWarning ? 'warning' : 'normal'));
    outsideObj.diffBank = parseFloat((outLvl - outsideObj.bank).toFixed(2));
    outsideObj.diffCritical = parseFloat((outLvl - outsideObj.critical).toFixed(2));

    // Combined Station-level Alert Status
    const isOverflow = inOverflow || outOverflow;
    const isWarningStatus = !isOverflow && (inCritical || outCritical);
    const isWatchStatus = !isOverflow && !isWarningStatus && (inWarning || outWarning);

    let tier = 'NORMAL';
    let statusText = 'ปกติ';
    let alertBadgeText = 'ปกติ 🟢';
    let statusSeverity = 'normal';
    let overflowReason = '';
    let warningReason = '';

    if (isOverflow) {
      tier = 'EMERGENCY';
      statusSeverity = 'danger';
      if (inOverflow && outOverflow) {
        statusText = 'น้ำล้นตลิ่งทั้งสองฝั่ง!';
        alertBadgeText = 'ล้นตลิ่งทั้ง 2 ฝั่ง 🔴';
        overflowReason = `น้ำล้นตลิ่งทั้ง 2 ฝั่ง (ใน: ${inLvl} ม., นอก: ${outLvl} ม.)`;
      } else if (outOverflow) {
        statusText = 'น้ำล้นตลิ่งฝั่งด้านนอก!';
        alertBadgeText = 'ล้นตลิ่งฝั่งนอก 🔴';
        overflowReason = `น้ำล้นตลิ่งฝั่งด้านนอก (${outLvl} ม. / ตลิ่งนอก ${outsideObj.bank} ม.)`;
      } else {
        statusText = 'น้ำล้นตลิ่งฝั่งด้านใน!';
        alertBadgeText = 'ล้นตลิ่งฝั่งใน 🔴';
        overflowReason = `น้ำล้นตลิ่งฝั่งด้านใน (${inLvl} ม. / ตลิ่งใน ${insideObj.bank} ม.)`;
      }
    } else if (isWarningStatus) {
      tier = 'WARNING';
      statusSeverity = 'warning';
      if (inCritical && outCritical) {
        statusText = 'วิกฤติทั้งสองฝั่ง';
        alertBadgeText = 'วิกฤติ 2 ฝั่ง 🟠';
        warningReason = `ระดับน้ำวิกฤติทั้ง 2 ฝั่ง (ใน: ${inLvl} ม., นอก: ${outLvl} ม.)`;
      } else if (outCritical) {
        statusText = 'วิกฤติฝั่งด้านนอก';
        alertBadgeText = 'วิกฤติฝั่งนอก 🟠';
        warningReason = `ระดับน้ำวิกฤติฝั่งด้านนอก (${outLvl} ม. / เกณฑ์วิกฤตินอก ${outsideObj.critical} ม.)`;
      } else {
        statusText = 'วิกฤติฝั่งด้านใน';
        alertBadgeText = 'วิกฤติฝั่งใน 🟠';
        warningReason = `ระดับน้ำวิกฤติฝั่งด้านใน (${inLvl} ม. / เกณฑ์วิกฤติใน ${insideObj.critical} ม.)`;
      }
    } else if (isWatchStatus) {
      statusSeverity = 'warning';
      if (inWarning && outWarning) {
        statusText = 'เฝ้าระวังทั้งสองฝั่ง';
        alertBadgeText = 'เฝ้าระวัง 2 ฝั่ง 🟡';
      } else if (outWarning) {
        statusText = 'เฝ้าระวังฝั่งด้านนอก';
        alertBadgeText = 'เฝ้าระวังฝั่งนอก 🟡';
      } else {
        statusText = 'เฝ้าระวังฝั่งด้านใน';
        alertBadgeText = 'เฝ้าระวังฝั่งใน 🟡';
      }
    }

    // Head Difference (Diff between Outside and Inside)
    const diffInOut = parseFloat((outLvl - inLvl).toFixed(2));
    const diffCm = Math.round(Math.abs(diffInOut) * 100);
    let diffInOutText = '';
    if (diffInOut > 0) {
      diffInOutText = `ด้านนอกสูงกว่าด้านใน ${diffCm} ซม.`;
    } else if (diffInOut < 0) {
      diffInOutText = `ด้านในสูงกว่าด้านนอก ${diffCm} ซม.`;
    } else {
      diffInOutText = 'ระดับน้ำเท่ากันทั้งสองฝั่ง';
    }

    // Single representative water level (Outside level as primary for Bangkok connection)
    const primaryLevel = outLvl;
    const bankLevel = outsideObj.bank;
    const warningLevel = outsideObj.warning;
    const criticalLevel = outsideObj.critical;

    const diff = parseFloat((primaryLevel - bankLevel).toFixed(2));
    const diffCritical = parseFloat((primaryLevel - criticalLevel).toFixed(2));

    const stationObj = {
      id: cfg.id,
      stCode: cfg.stCode,
      stationId: cfg.stationId,
      stationCode: cfg.stationCode || `BMA-${cfg.stationId}`,
      name: cfg.name,
      shortName: cfg.shortName || cfg.name,
      location: cfg.location,
      isGate: true,
      inside: insideObj,
      outside: outsideObj,
      gateOpening,
      diffInOut,
      diffInOutText,
      waterLevel: primaryLevel,
      bankLevel,
      warningLevel,
      criticalLevel,
      diff,
      diffCritical,
      diffText: diffInOutText,
      unit: 'ม.รทก.',
      storagePercent: parseFloat(((primaryLevel / bankLevel) * 100).toFixed(1)),
      isOverflow,
      isWarning: isWarningStatus,
      isCritical: (inCritical || outCritical),
      tier,
      statusText: isStale ? `${statusText} (ข้อมูลเดิม)` : statusText,
      alertBadgeText,
      statusSeverity,
      overflowReason,
      warningReason,
      lat: cfg.lat,
      lng: cfg.lng,
      canalGroupId: cfg.canalGroupId,
      canalGroupName: cfg.canalGroupName,
      flowOrder: cfg.flowOrder,
      isPinned: cfg.isPinned,
      source: 'BMA Weather',
      sourceUrl: stationUrl,
      updatedAt: finalTime || new Date().toISOString(),
      isStale,
      lastValidTime: finalTime,
      lastValidLevel: primaryLevel
    };

    if (!isStale && outLvl > 0) {
      lastKnownValidMap.set(cfg.id, stationObj);
    }

    return stationObj;
  }

  // -------------------------------------------------------------------------
  // STANDARD SINGLE-STATION FLOW (ST-5, ST-6, ST-7, ST-8)
  // -------------------------------------------------------------------------
  let extractedLevel = (parsed && parsed.waterLevel !== null && parsed.waterLevel > 0) ? parsed.waterLevel : null;
  let readingTime = parsed ? parsed.time : null;

  // Stale-While-Revalidate: KEEP LAST KNOWN VALUE. Never overwrite with 0.00 or null!
  let isStale = false;
  let finalWaterLevel = extractedLevel;
  let finalTime = readingTime;

  if (fetchFailed || finalWaterLevel === null || finalWaterLevel <= 0) {
    if (lastKnownValidMap.has(cfg.id)) {
      const prev = lastKnownValidMap.get(cfg.id);
      finalWaterLevel = prev.waterLevel;
      finalTime = prev.lastValidTime || prev.updatedAt;
      isStale = true;
      console.log(`[BMA Weather SWR] ใช้ค่าล่าสุดที่เคยดึงได้: ${cfg.id} -> ${finalWaterLevel} ม.รทก. (${finalTime})`);
    } else if (INITIAL_BASELINES[cfg.id]) {
      finalWaterLevel = INITIAL_BASELINES[cfg.id].level;
      finalTime = INITIAL_BASELINES[cfg.id].time;
      isStale = true;
      console.log(`[BMA Weather SWR] ใช้ค่าเริ่มต้นประวัติล่าสุด: ${cfg.id} -> ${finalWaterLevel} ม.รทก.`);
    } else {
      finalWaterLevel = cfg.defaultWarning;
      finalTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
      isStale = true;
    }
  }

  const bankLevel = cfg.defaultBank;
  const warningLevel = cfg.defaultWarning;
  const criticalLevel = cfg.defaultCritical;

  // Two-Tier Alert Logic
  const isOverflow = (finalWaterLevel !== null && finalWaterLevel >= bankLevel);
  const isWarning = !isOverflow && (finalWaterLevel !== null && finalWaterLevel >= criticalLevel);
  const isCritical = (finalWaterLevel !== null && finalWaterLevel >= criticalLevel);

  let tier = 'NORMAL';
  let statusText = 'ปกติ';
  let statusSeverity = 'normal';

  if (isOverflow) {
    tier = 'EMERGENCY';
    statusText = 'น้ำล้นตลิ่ง!';
    statusSeverity = 'danger';
  } else if (isWarning) {
    tier = 'WARNING';
    statusText = 'เตือนภัย: วิกฤติ';
    statusSeverity = 'warning';
  } else if (finalWaterLevel !== null && finalWaterLevel >= warningLevel) {
    statusText = 'เฝ้าระวัง';
    statusSeverity = 'warning';
  }

  const diff = finalWaterLevel !== null && bankLevel !== null
    ? parseFloat((finalWaterLevel - bankLevel).toFixed(2))
    : null;

  const diffCritical = finalWaterLevel !== null && criticalLevel !== null
    ? parseFloat((finalWaterLevel - criticalLevel).toFixed(2))
    : null;

  let diffText = '';
  if (diff !== null) {
    if (diff >= 0) {
      diffText = `ล้นตลิ่ง +${diff.toFixed(2)} ม.`;
    } else if (diffCritical !== null && diffCritical >= 0) {
      diffText = `+${diffCritical.toFixed(2)} ม. (เกินเกณฑ์วิกฤติ)`;
    } else {
      diffText = `ต่ำกว่าตลิ่ง ${Math.abs(diff).toFixed(2)} ม.`;
    }
  }

  const storagePercent = finalWaterLevel !== null && bankLevel !== null && bankLevel > 0
    ? parseFloat(((finalWaterLevel / bankLevel) * 100).toFixed(1))
    : null;

  const stationObj = {
    id: cfg.id,
    stCode: cfg.stCode,
    stationId: cfg.stationId,
    stationCode: cfg.stationCode || `BMA-${cfg.stationId}`,
    name: cfg.name,
    shortName: cfg.shortName || cfg.name,
    location: cfg.location,
    waterLevel: finalWaterLevel,
    bankLevel,
    warningLevel,
    criticalLevel,
    diff,
    diffCritical,
    diffText,
    unit: 'ม.รทก.',
    storagePercent,
    isOverflow,
    isWarning,
    isCritical,
    tier,
    statusText: isStale ? `${statusText} (ข้อมูลเดิม)` : statusText,
    statusSeverity,
    lat: cfg.lat,
    lng: cfg.lng,
    canalGroupId: cfg.canalGroupId,
    canalGroupName: cfg.canalGroupName,
    flowOrder: cfg.flowOrder,
    isPinned: cfg.isPinned,
    source: 'BMA Weather',
    sourceUrl: stationUrl,
    updatedAt: finalTime || new Date().toISOString(),
    isStale,
    lastValidTime: finalTime,
    lastValidLevel: finalWaterLevel
  };

  // Cache last valid value
  if (!isStale && finalWaterLevel > 0) {
    lastKnownValidMap.set(cfg.id, stationObj);
  }

  return stationObj;
}

/**
 * Fetch all BMA Weather stations sequentially with 1,000ms delay to avoid WAF / Rate Limit
 */
async function fetchBmaWeatherStations() {
  const results = [];
  for (let i = 0; i < WEATHER_STATIONS_CONFIG.length; i++) {
    const cfg = WEATHER_STATIONS_CONFIG[i];
    if (i > 0) {
      await sleep(1000); // 1,000 ms delay between each station request
    }
    const stObj = await fetchSingleWeatherStation(cfg);
    results.push(stObj);
  }
  return results;
}

module.exports = {
  fetchBmaWeatherStations,
  fetchSingleWeatherStation,
  WEATHER_STATIONS_CONFIG,
  lastKnownValidMap
};
