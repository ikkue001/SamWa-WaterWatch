const axios = require('axios');
const { STATIONS_MASTER_CONFIG } = require('../stationsConfig');

/**
 * Scraper for BMA Waterflow Stations (ST-2, ST-3, ST-4)
 * Source URL: https://bmawaterflow.bangkok.go.th/map
 */

const BASE_URL = 'https://bmawaterflow.bangkok.go.th';

// Filter BMA Waterflow stations directly from the Single Source of Truth
const STATIONS_CONFIG = STATIONS_MASTER_CONFIG.filter(s => s.source === 'BMA Waterflow');

let cachedToken = null;
let tokenExpiresAt = 0;
const cachedStations = new Map();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const INITIAL_BASELINES = {
  'bma_wf_khw01': { level: 1.87, time: new Date().toISOString() },
  'bma_wf_swa02': { level: 1.46, time: new Date().toISOString() },
  'bma_wf_k0801': { level: 1.80, time: new Date().toISOString() }
};

/**
 * Obtain client bearer token
 */
async function getAuthToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await axios.post(`${BASE_URL}/API/Authentication/Client`, {
    clientId: 'dds-measure-web',
    clientSecret: 'f1d6cf67-946b-4586-934a-6a770d993983'
  }, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/map`
    },
    timeout: 10000
  });

  const token = response.data?.token;
  if (!token) throw new Error('No token returned from BMA Waterflow auth API');

  cachedToken = token;
  tokenExpiresAt = Date.now() + (55 * 60 * 1000);
  return token;
}

/**
 * Fetch all 3 BMA Waterflow stations
 */
async function fetchBmaWaterflowStations() {
  let token;
  try {
    token = await getAuthToken();
  } catch (err) {
    console.error('[BMA Waterflow Auth Error]:', err.message);
  }

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': token ? `Bearer ${token}` : undefined,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': `${BASE_URL}/map`
    },
    timeout: 10000
  });

  const results = [];

  for (let i = 0; i < STATIONS_CONFIG.length; i++) {
    const cfg = STATIONS_CONFIG[i];
    if (i > 0) {
      await sleep(800); // 800ms delay between stations
    }

    try {
      let data = null;
      if (token) {
        const res = await client.get(`/API/Stations/${cfg.uuid}`);
        data = res.data;
      }

      if (!data) throw new Error('No data received from API');

      const ms = data.measuringStations?.[0];
      const tx = data.transactions?.[0];

      let rawWater = (tx?.water !== undefined && tx?.water !== null) ? parseFloat(tx.water) : null;
      let isStale = false;
      let finalWaterLevel = rawWater;
      let finalTime = tx?.siteTime || tx?.serverTime;

      // Stale-While-Revalidate: If rawWater is null or 0.00, NEVER overwrite with 0.00 or null!
      if (finalWaterLevel === null || isNaN(finalWaterLevel) || finalWaterLevel <= 0) {
        if (cachedStations.has(cfg.id)) {
          const prev = cachedStations.get(cfg.id);
          finalWaterLevel = prev.waterLevel;
          finalTime = prev.lastValidTime || prev.updatedAt;
          isStale = true;
          console.log(`[BMA Waterflow SWR] ใช้ค่าเดิม: ${cfg.id} -> ${finalWaterLevel} ม.รทก.`);
        } else if (INITIAL_BASELINES[cfg.id]) {
          finalWaterLevel = INITIAL_BASELINES[cfg.id].level;
          finalTime = INITIAL_BASELINES[cfg.id].time;
          isStale = true;
        } else {
          finalWaterLevel = cfg.defaultWarning;
          isStale = true;
        }
      }

      const leftBank = ms?.crossections?.leftBank !== undefined ? parseFloat(ms.crossections.leftBank) : null;
      const rightBank = ms?.crossections?.rightBank !== undefined ? parseFloat(ms.crossections.rightBank) : null;
      const bankLevel = leftBank !== null ? leftBank : (rightBank !== null ? rightBank : cfg.defaultBank);

      const warningFlood = ms?.crossections?.warningFloodPoint !== undefined ? parseFloat(ms.crossections.warningFloodPoint) : null;
      const warningLevel = (warningFlood !== null && warningFlood > 0) ? warningFlood : cfg.defaultWarning;

      const rawCritical = ms?.crossections?.criticalFloodPoint !== undefined ? parseFloat(ms.crossections.criticalFloodPoint) : null;
      let criticalLevel = cfg.defaultCritical;
      if (rawCritical !== null && rawCritical > 0 && rawCritical <= (bankLevel * 1.5)) {
        criticalLevel = rawCritical;
      } else if (bankLevel) {
        criticalLevel = parseFloat((bankLevel - 0.20).toFixed(2));
      }

      const isOverflow = (finalWaterLevel >= bankLevel);
      const isWarning = !isOverflow && (finalWaterLevel >= criticalLevel);
      const isCritical = (finalWaterLevel >= criticalLevel);

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
      } else if (finalWaterLevel >= warningLevel) {
        statusText = 'เฝ้าระวัง';
        statusSeverity = 'warning';
      }

      const diff = parseFloat((finalWaterLevel - bankLevel).toFixed(2));
      const diffCritical = parseFloat((finalWaterLevel - criticalLevel).toFixed(2));

      let diffText = '';
      if (diff >= 0) {
        diffText = `ล้นตลิ่ง +${diff.toFixed(2)} ม.`;
      } else if (diffCritical >= 0) {
        diffText = `+${diffCritical.toFixed(2)} ม. (เกินเกณฑ์วิกฤติ)`;
      } else {
        diffText = `ต่ำกว่าตลิ่ง ${Math.abs(diff).toFixed(2)} ม.`;
      }

      const storagePercent = bankLevel > 0
        ? parseFloat(((finalWaterLevel / bankLevel) * 100).toFixed(1))
        : 75.0;

      const stationObj = {
        id: cfg.id,
        stCode: cfg.stCode,
        stationId: cfg.uuid,
        stationCode: data.code || cfg.stCode || 'BMA-WF',
        name: cfg.name,
        shortName: cfg.name,
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
        source: 'BMA Waterflow',
        sourceUrl: `${BASE_URL}/map`,
        updatedAt: finalTime || new Date().toISOString(),
        isStale,
        lastValidTime: finalTime,
        lastValidLevel: finalWaterLevel
      };

      if (!isStale && finalWaterLevel > 0) {
        cachedStations.set(cfg.id, stationObj);
      }
      results.push(stationObj);

    } catch (err) {
      console.error(`[BMA Waterflow ${cfg.name} Error]:`, err.message);
      if (cachedStations.has(cfg.id)) {
        const prev = cachedStations.get(cfg.id);
        results.push({
          ...prev,
          isStale: true,
          statusText: `${prev.statusText.replace(' (ข้อมูลเดิม)', '')} (ข้อมูลเดิม)`
        });
      } else {
        const baseline = INITIAL_BASELINES[cfg.id] || { level: cfg.defaultWarning, time: new Date().toISOString() };
        results.push({
          id: cfg.id,
          stCode: cfg.stCode,
          stationId: cfg.uuid,
          stationCode: cfg.stCode || 'BMA-WF',
          name: cfg.name,
          shortName: cfg.name,
          location: cfg.location,
          waterLevel: baseline.level,
          bankLevel: cfg.defaultBank,
          warningLevel: cfg.defaultWarning,
          criticalLevel: cfg.defaultCritical,
          diff: parseFloat((baseline.level - cfg.defaultBank).toFixed(2)),
          diffCritical: parseFloat((baseline.level - cfg.defaultCritical).toFixed(2)),
          diffText: `ต่ำกว่าตลิ่ง ${Math.abs(baseline.level - cfg.defaultBank).toFixed(2)} ม.`,
          unit: 'ม.รทก.',
          storagePercent: 75.0,
          isOverflow: false,
          isWarning: false,
          tier: 'NORMAL',
          statusText: 'ระดับน้ำปกติ (ข้อมูลเดิม)',
          statusSeverity: 'normal',
          lat: cfg.lat,
          lng: cfg.lng,
          canalGroupId: cfg.canalGroupId,
          canalGroupName: cfg.canalGroupName,
          flowOrder: cfg.flowOrder,
          isPinned: cfg.isPinned,
          source: 'BMA Waterflow',
          sourceUrl: `${BASE_URL}/map`,
          updatedAt: baseline.time,
          isStale: true,
          lastValidTime: baseline.time,
          lastValidLevel: baseline.level
        });
      }
    }
  }

  return results;
}

module.exports = {
  fetchBmaWaterflowStations
};
