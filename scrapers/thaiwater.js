const axios = require('axios');
const { getStationByStCode } = require('../stationsConfig');

/**
 * Scraper for Thaiwater Station: คลองหกวา ลำลูกกา คลอง 8 (ST-1)
 * Source URL: https://pathumthani.thaiwater.net/wl#close
 * API Endpoint: https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel
 */

const THAIWATER_API_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel';
const SOURCE_PAGE_URL = 'https://pathumthani.thaiwater.net/wl#close';

const ST1_CONFIG = getStationByStCode('ST-1');
const LAT = ST1_CONFIG ? ST1_CONFIG.lat : 13.9416;
const LNG = ST1_CONFIG ? ST1_CONFIG.lng : 100.77499;

let cachedData = null;
const INITIAL_BASELINE = {
  level: 1.67,
  time: new Date().toISOString()
};

async function fetchThaiwaterStation() {
  try {
    const response = await axios.get(THAIWATER_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://pathumthani.thaiwater.net/'
      },
      timeout: 10000
    });

    const stations = response.data?.data || [];
    const target = stations.find(s => {
      const sid = s.station?.id;
      const oldCode = s.station?.tele_station_oldcode;
      const thName = s.station?.tele_station_name?.th || '';
      return sid === 37 || oldCode === 'BKK015' || 
             (thName.includes('คลองหกวา') && thName.includes('คลอง8')) ||
             (thName.includes('ลำลูกกา') && thName.includes('คลอง8'));
    });

    if (!target) {
      throw new Error('ไม่พบข้อมูลสถานี คลองหกวา ลำลูกกา คลอง 8 ในระบบ Thaiwater API');
    }

    let rawWater = (target.waterlevel_msl !== null && target.waterlevel_msl !== undefined)
      ? parseFloat(target.waterlevel_msl)
      : null;

    let isStale = false;
    let finalWaterLevel = rawWater;
    let finalTime = target.waterlevel_datetime;

    // Stale-While-Revalidate: Never overwrite with 0.00 or null!
    if (finalWaterLevel === null || isNaN(finalWaterLevel) || finalWaterLevel <= 0) {
      if (cachedData) {
        finalWaterLevel = cachedData.waterLevel;
        finalTime = cachedData.lastValidTime || cachedData.updatedAt;
        isStale = true;
        console.log(`[Thaiwater SWR] ใช้ค่าเดิม: thaiwater_k8 -> ${finalWaterLevel} ม.รทก.`);
      } else {
        finalWaterLevel = INITIAL_BASELINE.level;
        finalTime = INITIAL_BASELINE.time;
        isStale = true;
      }
    }

    const minBank = target.station?.min_bank !== null && target.station?.min_bank !== undefined
      ? parseFloat(target.station.min_bank)
      : null;
    const leftBank = target.station?.left_bank ? parseFloat(target.station.left_bank) : null;
    const rightBank = target.station?.right_bank ? parseFloat(target.station.right_bank) : null;
    const bankLevel = minBank !== null ? minBank : (leftBank !== null ? leftBank : (rightBank !== null ? rightBank : 2.71));

    const warningLevel = parseFloat((bankLevel - 0.70).toFixed(2));
    const criticalLevel = parseFloat((bankLevel - 0.30).toFixed(2));

    const diffText = target.diff_wl_bank_text || '';
    
    const isOverflow = (finalWaterLevel !== null && (finalWaterLevel >= bankLevel || diffText.includes('ล้นตลิ่ง')));
    const isWarning = !isOverflow && (finalWaterLevel !== null && finalWaterLevel >= criticalLevel);

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

    const diff = parseFloat((finalWaterLevel - bankLevel).toFixed(2));
    const diffCritical = parseFloat((finalWaterLevel - criticalLevel).toFixed(2));

    let formattedDiffText = '';
    if (diff >= 0) {
      formattedDiffText = `ล้นตลิ่ง +${diff.toFixed(2)} ม.`;
    } else if (diffCritical >= 0) {
      formattedDiffText = `+${diffCritical.toFixed(2)} ม. (เกินเกณฑ์วิกฤติ)`;
    } else {
      formattedDiffText = `ต่ำกว่าตลิ่ง ${Math.abs(diff).toFixed(2)} ม.`;
    }

    const storagePercent = bankLevel > 0
      ? parseFloat(((finalWaterLevel / bankLevel) * 100).toFixed(1))
      : 61.6;

    const result = {
      id: 'thaiwater_k8',
      stCode: 'ST-1',
      stationId: target.station?.id || 37,
      stationCode: 'ST-1',
      name: 'คลองหกวา ลำลูกกา คลอง 8',
      shortName: 'คลองหกวา ลำลูกกา คลอง 8',
      location: 'คลองหกวา อ.ลำลูกกา จ.ปทุมธานี',
      waterLevel: finalWaterLevel,
      bankLevel,
      warningLevel,
      criticalLevel,
      diff,
      diffCritical,
      diffText: formattedDiffText,
      unit: 'ม.รทก.',
      storagePercent,
      isOverflow,
      isWarning,
      tier,
      statusText: isStale ? `${statusText} (ข้อมูลเดิม)` : statusText,
      statusSeverity,
      lat: LAT,
      lng: LNG,
      canalGroupId: 'khlong-hokwa',
      canalGroupName: 'สายคลองหกวา - คลองแปด',
      flowOrder: 1,
      isPinned: true,
      source: 'Thaiwater ปทุมธานี',
      sourceUrl: SOURCE_PAGE_URL,
      updatedAt: finalTime || new Date().toISOString(),
      isStale,
      lastValidTime: finalTime,
      lastValidLevel: finalWaterLevel
    };

    if (!isStale && finalWaterLevel > 0) {
      cachedData = result;
    }
    return result;

  } catch (error) {
    console.error('[Thaiwater Error]:', error.message);
    if (cachedData) {
      return {
        ...cachedData,
        isStale: true,
        statusText: `${cachedData.statusText.replace(' (ข้อมูลเดิม)', '')} (ข้อมูลเดิม)`
      };
    }
    return {
      id: 'thaiwater_k8',
      stCode: 'ST-1',
      stationId: 37,
      stationCode: 'ST-1',
      name: 'คลองหกวา ลำลูกกา คลอง 8',
      shortName: 'คลองหกวา ลำลูกกา คลอง 8',
      location: 'คลองหกวา อ.ลำลูกกา จ.ปทุมธานี',
      waterLevel: INITIAL_BASELINE.level,
      bankLevel: 2.71,
      warningLevel: 2.01,
      criticalLevel: 2.41,
      diff: -1.04,
      diffCritical: -0.74,
      diffText: 'ต่ำกว่าตลิ่ง 1.04 ม.',
      unit: 'ม.รทก.',
      storagePercent: 61.6,
      isOverflow: false,
      isWarning: false,
      tier: 'NORMAL',
      statusText: 'ระดับน้ำปกติ (ข้อมูลเดิม)',
      statusSeverity: 'normal',
      lat: LAT,
      lng: LNG,
      canalGroupId: 'khlong-hokwa',
      canalGroupName: 'สายคลองหกวา - คลองแปด',
      flowOrder: 1,
      isPinned: true,
      source: 'Thaiwater ปทุมธานี',
      sourceUrl: SOURCE_PAGE_URL,
      updatedAt: INITIAL_BASELINE.time,
      isStale: true,
      lastValidTime: INITIAL_BASELINE.time,
      lastValidLevel: INITIAL_BASELINE.level
    };
  }
}

module.exports = {
  fetchThaiwaterStation
};
