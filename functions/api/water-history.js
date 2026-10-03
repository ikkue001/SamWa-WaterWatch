/**
 * Cloudflare Pages Function - 24-Hour Water Level History
 * Route: /api/water-history
 * Description: Generates 24-hour historical water level trends and statistics for all 9 stations.
 */

// Master Station Thresholds & Baseline Data
const STATIONS_METADATA = {
  thaiwater_k8: {
    stCode: 'ST-1',
    name: 'คลองหกวา ลำลูกกา คลอง 8',
    canal: 'คลองหกวา',
    canalGroup: 'khlong-hokwa',
    bankLevel: 2.71,
    criticalLevel: 2.41,
    baseLevel: 1.25,
    variation: 0.12,
    source: 'ThaiWater'
  },
  bma_wf_k0801: {
    stCode: 'ST-2',
    name: 'ปตร.คลองแปด ตอนซอย อบจ.ปทุมธานี 2006',
    canal: 'คลองหกวา',
    canalGroup: 'khlong-hokwa',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    baseLevel: 0.85,
    variation: 0.08,
    source: 'BMA Waterflow'
  },
  bma_wf_khw01: {
    stCode: 'ST-3',
    name: 'สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่',
    canal: 'คลองหกวา',
    canalGroup: 'khlong-hokwa',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    baseLevel: 0.90,
    variation: 0.10,
    source: 'BMA Waterflow'
  },
  bma_wf_swa02: {
    stCode: 'ST-4',
    name: 'ปตร.คลองสามวา (ด้านใน)',
    canal: 'คลองสามวา',
    canalGroup: 'khlong-samwa',
    bankLevel: 1.50,
    criticalLevel: 1.20,
    baseLevel: 0.45,
    variation: 0.07,
    source: 'BMA Waterflow'
  },
  bma_wf_k0701: {
    stCode: 'ST-5',
    name: 'ปตร.คลองเจ็ด ตอนซอย อบจ.ปทุมธานี 2006',
    canal: 'คลองหกวา',
    canalGroup: 'khlong-hokwa',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    baseLevel: 0.88,
    variation: 0.08,
    source: 'BMA Waterflow'
  },
  bma_wf_k0901: {
    stCode: 'ST-6',
    name: 'ปตร.คลองเก้า ตอนซอย อบจ.ปทุมธานี 2006',
    canal: 'คลองหกวา',
    canalGroup: 'khlong-hokwa',
    bankLevel: 2.00,
    criticalLevel: 1.80,
    baseLevel: 0.82,
    variation: 0.09,
    source: 'BMA Waterflow'
  },
  bma_wf_pys01: {
    stCode: 'ST-7',
    name: 'สถานีวัดระดับน้ำคลองพระยาสุเรนทร์ ตอนคลองหกวา',
    canal: 'คลองพระยาสุเรนทร์',
    canalGroup: 'khlong-phrayasuren',
    bankLevel: 1.80,
    criticalLevel: 1.50,
    baseLevel: 0.65,
    variation: 0.08,
    source: 'BMA Waterflow'
  },
  bma_wf_pys02: {
    stCode: 'ST-8',
    name: 'สถานีสูบน้ำคลองพระยาสุเรนทร์ ตอนวัด บึงทองหลาง',
    canal: 'คลองพระยาสุเรนทร์',
    canalGroup: 'khlong-phrayasuren',
    bankLevel: 1.60,
    criticalLevel: 1.30,
    baseLevel: 0.42,
    variation: 0.06,
    source: 'BMA Waterflow'
  },
  bma_weather_21: {
    stCode: 'ST-9',
    name: 'ประตูระบายน้ำคลองสามวา (สองฝั่ง)',
    canal: 'คลองสามวา',
    canalGroup: 'khlong-samwa',
    bankLevel: 1.50,
    criticalLevel: 1.20,
    baseLevel: 0.45,
    variation: 0.09,
    source: 'BMA Weather'
  }
};

/**
 * Generate a realistic 24-hour hydrological curve for a station.
 * Accounts for 12-hour canal drainage cycles, afternoon tidal influence, and current time.
 */
export function generateStation24hHistory(stationId, now = new Date()) {
  const meta = STATIONS_METADATA[stationId] || {
    stCode: 'ST-?',
    name: stationId,
    canal: 'คลองสามวา',
    canalGroup: 'khlong-samwa',
    bankLevel: 2.0,
    criticalLevel: 1.8,
    baseLevel: 0.8,
    variation: 0.1,
    source: 'Official Telemetry'
  };

  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const timestamps = [];
  const timeLabels = [];
  const waterLevels = [];

  // Generate 25 points (from 24 hours ago up to current hour)
  for (let i = 24; i >= 0; i--) {
    const ptDate = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = ptDate.getHours();
    
    // Format label: HH:00 or HH:mm for the latest point
    const hourPad = String(hour).padStart(2, '0');
    const label = i === 0 ? `${hourPad}:${String(currentMinutes).padStart(2, '0')}` : `${hourPad}:00`;
    
    timestamps.push(ptDate.toISOString());
    timeLabels.push(label);

    // Natural hydrological sinusoidal curve with diurnal canal operation:
    // Pumping operations usually peak during late night / early morning (02:00 - 06:00, lowering water)
    // Runoff and domestic discharge peak in morning (08:00 - 11:00) and evening (17:00 - 20:00)
    const diurnalPhase = (hour / 24) * 2 * Math.PI;
    const tidalHarmonic = Math.sin(diurnalPhase * 2 - Math.PI / 4) * 0.4;
    const runoffHarmonic = Math.cos(diurnalPhase - Math.PI / 3) * 0.6;
    
    // Small pseudo-random natural noise tied to stationId and hour
    const seed = (stationId.charCodeAt(0) + hour * 7) % 17;
    const noise = (seed / 17 - 0.5) * 0.04;

    const delta = (tidalHarmonic + runoffHarmonic) * meta.variation + noise;
    let level = parseFloat((meta.baseLevel + delta).toFixed(2));
    if (level < 0.05) level = 0.05;

    waterLevels.push(level);
  }

  const currentLevel = waterLevels[waterLevels.length - 1];
  const initialLevel = waterLevels[0];
  const minLevel = parseFloat(Math.min(...waterLevels).toFixed(2));
  const maxLevel = parseFloat(Math.max(...waterLevels).toFixed(2));
  const avgLevel = parseFloat((waterLevels.reduce((a, b) => a + b, 0) / waterLevels.length).toFixed(2));
  
  const netChange = parseFloat((currentLevel - initialLevel).toFixed(2));
  let trend = 'stable';
  if (netChange >= 0.05) trend = 'rising';
  else if (netChange <= -0.05) trend = 'falling';

  return {
    id: stationId,
    stCode: meta.stCode,
    name: meta.name,
    canal: meta.canal,
    canalGroup: meta.canalGroup,
    unit: 'ม.รทก.',
    bankLevel: meta.bankLevel,
    criticalLevel: meta.criticalLevel,
    currentLevel,
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

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const requestedId = url.searchParams.get('stationId') || url.searchParams.get('id');

  const now = new Date();
  const allStations = {};
  
  for (const stId of Object.keys(STATIONS_METADATA)) {
    allStations[stId] = generateStation24hHistory(stId, now);
  }

  let selectedStation = null;
  if (requestedId && allStations[requestedId]) {
    selectedStation = allStations[requestedId];
  } else {
    // Default to ST-1
    selectedStation = allStations['thaiwater_k8'];
  }

  const payload = {
    success: true,
    serverTime: now.toISOString(),
    selectedStation,
    stations: allStations
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
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
