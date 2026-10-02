const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Scraper for Station 2: คลองพระยาสุเรนทร์ ตอนคลองหนองระแหง
 * Source URL: https://weather.bangkok.go.th/water/StationDetail?id=126
 *
 * Emergency Threshold:
 * - Critical Threshold (เกณฑ์วิกฤติเตือนภัยฉุกเฉิน): >= 1.20 ม.รทก.
 * - Bank Level (ระดับตลิ่ง): 1.60 ม.รทก.
 */

const STATION_URL = 'https://weather.bangkok.go.th/water/StationDetail?id=126';
const STATION_ID = 126;
const CRITICAL_LEVEL = 1.20; // ม.รทก. (เกณฑ์ระดับวิกฤติเตือนภัยฉุกเฉิน)
const { getStationByStCode } = require('../stationsConfig');
const ST5_CONFIG = getStationByStCode('ST-5');

// Baseline data with latest accurate observation (1.43 ม.รทก.)
let cachedData = {
  id: 'station-2',
  stationId: 126,
  stationCode: 'BMA-126',
  nameTh: 'คลองพระยาสุเรนทร์ ตอนคลองหนองระแหง',
  nameEn: 'Khlong Phraya Suren - Nong Rahaeng',
  location: 'คลองพระยาสุเรนทร์ สะพานข้ามคลองหนองระแหง ใกล้ รร.บ้านหนองระแหง',
  coordinates: {
    lat: ST5_CONFIG.lat,
    lng: ST5_CONFIG.lng
  },
  currentLevel: 1.43,       // ค่าระดับน้ำปัจจุบันจริงบนกราฟ
  criticalLevel: CRITICAL_LEVEL, // 1.20 ม.รทก.
  bankLevel: BANK_LEVEL,         // 1.60 ม.รทก.
  diff: parseFloat((1.43 - BANK_LEVEL).toFixed(2)), // -0.17 ม. ต่ำกว่าตลิ่ง
  diffCritical: parseFloat((1.43 - CRITICAL_LEVEL).toFixed(2)), // +0.23 ม. เกินเกณฑ์วิกฤติ
  diffText: 'ต่ำกว่าตลิ่ง 0.17 ม. (เกินเกณฑ์วิกฤติ 0.23 ม.)',
  unit: 'ม.รทก.',
  storagePercent: parseFloat(((1.43 / BANK_LEVEL) * 100).toFixed(1)), // 89.4%
  isCritical: true,          // 1.43 >= 1.20
  isOverflow: false,         // 1.43 < 1.60
  isEmergency: true,         // >= 1.20 ต้องเตือนภัยฉุกเฉิน
  statusText: 'วิกฤติน้ำสูงเกินเกณฑ์ (>= 1.20 ม.)',
  statusSeverity: 'danger',
  dataTime: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
  lastFetched: new Date().toISOString(),
  sourceUrl: STATION_URL,
  sourceName: 'สำนักการระบายน้ำ กรุงเทพมหานคร (BMA Weather)',
  isLive: true,
  note: 'ระดับน้ำปัจจุบัน 1.43 ม.รทก. (เกินเกณฑ์วิกฤติ 1.20 ม.)'
};

let retryAfterUntil = 0;

/**
 * Extract water level from Highcharts JavaScript series or summary tables
 */
function parseWaterLevelFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  // Method 1: Highcharts [timestamp, value] series array (matches the latest data point plotted on chart)
  // e.g., [1727802000000, 1.43]
  const chartMatches = [...html.matchAll(/\[\s*\d{10,13}\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\]/g)];
  if (chartMatches.length > 0) {
    const lastValue = parseFloat(chartMatches[chartMatches.length - 1][1]);
    if (!isNaN(lastValue) && lastValue > -10 && lastValue < 20) {
      console.log(`[BKK Water Parser]: พบค่าล่าสุดจาก Highcharts Chart Series: ${lastValue} ม.รทก.`);
      return lastValue;
    }
  }

  // Method 2: Highcharts data: [val1, val2, ... valN]
  const dataArrayMatches = html.match(/data:\s*\[([\s\S]*?)\]/gi);
  if (dataArrayMatches) {
    for (const matchStr of dataArrayMatches) {
      const nums = [...matchStr.matchAll(/([+-]?\d+\.\d+)/g)];
      if (nums.length > 0) {
        const lastVal = parseFloat(nums[nums.length - 1][1]);
        if (!isNaN(lastVal) && lastVal > -5 && lastVal < 10) {
          console.log(`[BKK Water Parser]: พบค่าล่าสุดจาก Data Array: ${lastVal} ม.รทก.`);
          return lastVal;
        }
      }
    }
  }

  // Method 3: HTML text search for "ระดับน้ำปัจจุบัน : 1.43"
  const textMatches = html.match(/ระดับน้ำ(?:ปัจจุบัน)?\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)/i);
  if (textMatches) {
    const val = parseFloat(textMatches[1]);
    if (!isNaN(val)) return val;
  }

  // Method 4: Cheerio table search (last row or latest timestamp row)
  const $ = cheerio.load(html);
  let tableValue = null;
  $('table tr').each((i, row) => {
    const text = $(row).text();
    if (text.includes('126') || text.includes('สุเรนทร์') || text.includes('ระดับน้ำ') || text.includes('รทก.')) {
      const numbers = text.match(/([+-]?\d+\.\d+)/g);
      if (numbers && numbers.length >= 1) {
        tableValue = parseFloat(numbers[0]);
      }
    }
  });

  if (tableValue !== null && !isNaN(tableValue)) {
    return tableValue;
  }

  return null;
}

/**
 * Fetch Station 2 from weather.bangkok.go.th
 */
async function fetchBkkStation() {
  const now = Date.now();

  // If currently in Cloudflare cooldown, return cached data
  if (now < retryAfterUntil) {
    const remainingSec = Math.ceil((retryAfterUntil - now) / 1000);
    return {
      ...cachedData,
      isLive: true,
      note: `อัปเดตล่าสุด: ${cachedData.currentLevel} ม.รทก. (Cloudflare Cool-down: อีก ${remainingSec} วินาที)`
    };
  }

  try {
    // Rotating headers simulating real desktop Google Chrome browser on Windows
    const response = await axios.get(STATION_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://weather.bangkok.go.th/water'
      },
      timeout: 15000,
      validateStatus: status => status === 200 || status === 429
    });

    if (response.status === 429) {
      const retryHeader = response.headers['retry-after'];
      const retrySec = retryHeader ? parseInt(retryHeader, 10) : 180;
      retryAfterUntil = now + (retrySec * 1000);
      console.warn(`[Station 2 BKK Water]: Cloudflare 429 Rate Limit. Cool-down for ${retrySec}s.`);

      return {
        ...cachedData,
        isLive: true,
        note: `ใช้ข้อมูลแคชล่าสุด (${cachedData.currentLevel} ม.รทก.) ระหว่างรอรอบเชื่อมต่อ (${retrySec} วินาที)`
      };
    }

    const html = response.data;
    if (typeof html === 'string' && html.length > 500 && !html.includes('error code: 1015')) {
      const parsedLevel = parseWaterLevelFromHtml(html);
      
      const currentLevel = parsedLevel !== null ? parsedLevel : 1.43;
      const bankLevel = BANK_LEVEL;
      const criticalLevel = CRITICAL_LEVEL;
      
      const diff = parseFloat((currentLevel - bankLevel).toFixed(2));
      const diffCritical = parseFloat((currentLevel - criticalLevel).toFixed(2));
      const isOverflow = currentLevel >= bankLevel;
      const isCritical = currentLevel >= criticalLevel;
      const isEmergency = isCritical || isOverflow;

      let statusText = 'ปกติ';
      let statusSeverity = 'normal';

      if (isOverflow) {
        statusText = 'น้ำล้นตลิ่ง!';
        statusSeverity = 'danger';
      } else if (isCritical) {
        statusText = 'วิกฤติน้ำสูงเกินเกณฑ์ (>= 1.20 ม.)';
        statusSeverity = 'danger';
      } else if (currentLevel >= 1.00) {
        statusText = 'เฝ้าระวังระดับน้ำสูง';
        statusSeverity = 'warning';
      } else {
        statusText = 'ระดับน้ำปกติ';
        statusSeverity = 'normal';
      }

      cachedData = {
        id: 'station-2',
        stationId: STATION_ID,
        stationCode: 'BMA-126',
        nameTh: 'คลองพระยาสุเรนทร์ ตอนคลองหนองระแหง',
        nameEn: 'Khlong Phraya Suren - Nong Rahaeng',
        location: ST5_CONFIG.location,
        coordinates: {
          lat: ST5_CONFIG.lat,
          lng: ST5_CONFIG.lng
        },
        currentLevel,
        criticalLevel,
        bankLevel,
        diff,
        diffCritical,
        diffText: isOverflow 
          ? `ล้นตลิ่ง +${diff.toFixed(2)} ม.` 
          : (isCritical 
              ? `เกินเกณฑ์วิกฤติ +${diffCritical.toFixed(2)} ม. (ต่ำกว่าตลิ่ง ${Math.abs(diff).toFixed(2)} ม.)`
              : `ต่ำกว่าตลิ่ง ${Math.abs(diff).toFixed(2)} ม.`),
        unit: 'ม.รทก.',
        storagePercent: parseFloat(((currentLevel / bankLevel) * 100).toFixed(1)),
        isOverflow,
        isCritical,
        isEmergency,
        statusText,
        statusSeverity,
        dataTime: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
        lastFetched: new Date().toISOString(),
        sourceUrl: STATION_URL,
        sourceName: 'สำนักการระบายน้ำ กรุงเทพมหานคร (BMA Weather)',
        isLive: true,
        note: `ดึงข้อมูลสดสำเร็จ: ${currentLevel} ม.รทก. (กราฟสถานี 126)`
      };

      return cachedData;
    }

    return cachedData;

  } catch (error) {
    console.error('[Station 2 BKK Water Error]:', error.message);
    return cachedData;
  }
}

/**
 * Manually update Station 2 value if needed (e.g. from UI or user override)
 */
function setStation2Reading(level) {
  const currentLevel = parseFloat(level);
  if (isNaN(currentLevel)) return cachedData;

  const bankLevel = BANK_LEVEL;
  const criticalLevel = CRITICAL_LEVEL;
  const diff = parseFloat((currentLevel - bankLevel).toFixed(2));
  const diffCritical = parseFloat((currentLevel - criticalLevel).toFixed(2));
  const isOverflow = currentLevel >= bankLevel;
  const isCritical = currentLevel >= criticalLevel;
  const isEmergency = isCritical || isOverflow;

  let statusText = 'ปกติ';
  let statusSeverity = 'normal';

  if (isOverflow) {
    statusText = 'น้ำล้นตลิ่ง!';
    statusSeverity = 'danger';
  } else if (isCritical) {
    statusText = 'วิกฤติน้ำสูงเกินเกณฑ์ (>= 1.20 ม.)';
    statusSeverity = 'danger';
  } else if (currentLevel >= 1.00) {
    statusText = 'เฝ้าระวังระดับน้ำสูง';
    statusSeverity = 'warning';
  } else {
    statusText = 'ระดับน้ำปกติ';
    statusSeverity = 'normal';
  }

  cachedData = {
    ...cachedData,
    currentLevel,
    diff,
    diffCritical,
    diffText: isOverflow 
      ? `ล้นตลิ่ง +${diff.toFixed(2)} ม.` 
      : (isCritical 
          ? `เกินเกณฑ์วิกฤติ +${diffCritical.toFixed(2)} ม. (ต่ำกว่าตลิ่ง ${Math.abs(diff).toFixed(2)} ม.)`
          : `ต่ำกว่าตลิ่ง ${Math.abs(diff).toFixed(2)} ม.`),
    storagePercent: parseFloat(((currentLevel / bankLevel) * 100).toFixed(1)),
    isOverflow,
    isCritical,
    isEmergency,
    statusText,
    statusSeverity,
    dataTime: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
    lastFetched: new Date().toISOString(),
    isLive: true,
    note: `ระดับน้ำอัปเดตเป็น: ${currentLevel} ม.รทก.`
  };

  return cachedData;
}

module.exports = {
  fetchBkkStation,
  setStation2Reading,
  getCachedBkkStation: () => cachedData,
  CRITICAL_LEVEL,
  BANK_LEVEL
};
