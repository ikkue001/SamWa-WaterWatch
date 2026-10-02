/**
 * Automated Coordinate Extraction Script
 * Extracts real GPS coordinates directly from official source websites & APIs:
 * 1. BMA Weather (weather.bangkok.go.th/water/StationDetail?id=...) via Leaflet HTML Regex
 * 2. BMA Waterflow (bmawaterflow.bangkok.go.th) via API / Station Location data
 * 3. Thaiwater (pathumthani.thaiwater.net / api-v3.thaiwater.net) via official telemetry station data
 *
 * Saves verified stations to: stations_verified.json
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const VERIFIED_OUTPUT_PATH = path.join(__dirname, '..', 'stations_verified.json');

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7'
};

/**
 * 1. Extract coordinates from BMA Weather (5 stations)
 */
async function fetchBmaWeatherCoords() {
  console.log('\n[1/3] กำลังสกัดพิกัดจาก BMA Weather (weather.bangkok.go.th)...');
  const stationsMeta = [
    {
      id: 'bma_weather_126',
      stCode: 'ST-5',
      bmaId: 126,
      name: 'คลองพระยาสุเรนทร์ ตอนถนนหนองระแหง',
      canal: 'คลองพระยาสุเรนทร์',
      canalGroupId: 'khlong-phraya-suren',
      canalGroupName: 'สายคลองพระยาสุเรนทร์',
      flowOrder: 1,
      isPinned: false,
      code: 'WL.PSR.02',
      query: 'หนองระแหง',
      defaultBank: 1.60,
      defaultWarning: 1.00,
      defaultCritical: 1.20
    },
    {
      id: 'bma_weather_125',
      stCode: 'ST-6',
      bmaId: 125,
      name: 'คลองพระยาสุเรนทร์ ตอนถนนจตุโชติ',
      canal: 'คลองพระยาสุเรนทร์',
      canalGroupId: 'khlong-phraya-suren',
      canalGroupName: 'สายคลองพระยาสุเรนทร์',
      flowOrder: 2,
      isPinned: false,
      code: 'WL.PSR.03',
      query: 'จตุโชติ',
      defaultBank: 1.50,
      defaultWarning: 1.00,
      defaultCritical: 1.20
    },
    {
      id: 'bma_weather_124',
      stCode: 'ST-7',
      bmaId: 124,
      name: 'ปตร.พระยาสุเรนทร์ ตอนคู้บอน',
      canal: 'คลองพระยาสุเรนทร์',
      canalGroupId: 'khlong-phraya-suren',
      canalGroupName: 'สายคลองพระยาสุเรนทร์',
      flowOrder: 3,
      isPinned: false,
      code: 'WL.PSR.04',
      query: 'คู้บอน',
      defaultBank: 1.30,
      defaultWarning: 0.70,
      defaultCritical: 0.80
    },
    {
      id: 'bma_weather_127',
      stCode: 'ST-8',
      bmaId: 127,
      name: 'คลองพระยาสุเรนทร์ ตอนปัญญาอินทรา',
      canal: 'คลองพระยาสุเรนทร์',
      canalGroupId: 'khlong-phraya-suren',
      canalGroupName: 'สายคลองพระยาสุเรนทร์',
      flowOrder: 4,
      isPinned: false,
      code: 'WL.PSR.05',
      query: 'ปัญญาอินทรา',
      defaultBank: 1.40,
      defaultWarning: 0.80,
      defaultCritical: 1.00
    },
    {
      id: 'bma_weather_21',
      stCode: 'ST-9',
      bmaId: 21,
      name: 'ประตูระบายน้ำคลองสามวา (ถนนประชาร่วมใจ)',
      canal: 'คลองสามวา',
      canalGroupId: 'khlong-sam-wa',
      canalGroupName: 'สายคลองสามวา',
      flowOrder: 2,
      isPinned: false,
      code: 'WL.SWA.01',
      query: 'คลองสามวา',
      defaultBank: 1.30,
      defaultWarning: 0.70,
      defaultCritical: 0.80
    }
  ];

  const results = [];

  for (const s of stationsMeta) {
    const url = `https://weather.bangkok.go.th/water/StationDetail?id=${s.bmaId}`;
    try {
      const response = await axios.get(url, { headers: HTTP_HEADERS, timeout: 12000 });
      const html = response.data;
      const $ = cheerio.load(html);

      // Extract official title from page
      let scrapedTitle = '';
      $('h1, h2, h3, h4, h5, strong, .card-title').each((i, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text && (text.includes('คลอง') || text.includes('ปตร.') || text.includes('Khlong')) && !scrapedTitle) {
          scrapedTitle = text;
        }
      });

      // Regex matching Leaflet marker coordinates in page script:
      // Pattern 1: L.marker([lat, lng])
      // Pattern 2: L.LatLng(lat, lng)
      // Pattern 3: setView(new L.LatLng(lat, lng))
      const markerMatch = html.match(/L\.marker\(\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\)/i) ||
                          html.match(/L\.LatLng\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)/i);

      if (!markerMatch) {
        throw new Error(`ไม่พบโค้ด L.marker หรือ L.LatLng บนหน้าเว็บ ID ${s.bmaId}`);
      }

      const lat = parseFloat(markerMatch[1]);
      const lng = parseFloat(markerMatch[2]);

      results.push({
        id: s.id,
        altId: s.id.replace(/_/g, '-'),
        stCode: s.stCode,
        stationId: s.bmaId,
        stationCode: s.code,
        name: s.name,
        officialName: scrapedTitle || s.name,
        source: 'BMA Weather',
        canal: s.canal,
        canalGroupId: s.canalGroupId,
        canalGroupName: s.canalGroupName,
        flowOrder: s.flowOrder,
        isPinned: s.isPinned,
        lat,
        lng,
        url,
        sourceUrl: url,
        defaultBank: s.defaultBank,
        defaultWarning: s.defaultWarning,
        defaultCritical: s.defaultCritical,
        extractionMethod: `Leaflet HTML Regex (/L.marker/) -> [${lat}, ${lng}]`,
        verified: true
      });

      console.log(`  ✓ [BMA Weather ID ${s.bmaId}] ${s.name} -> Lat: ${lat}, Lng: ${lng}`);

    } catch (err) {
      console.error(`  ✗ [BMA Weather ID ${s.bmaId} Error]:`, err.message);
      throw err;
    }
  }

  return results;
}

/**
 * 2. Extract coordinates from BMA Waterflow (3 stations)
 */
async function fetchBmaWaterflowCoords() {
  console.log('\n[2/3] กำลังสกัดพิกัดจาก BMA Waterflow (bmawaterflow.bangkok.go.th)...');
  const BASE_URL = 'https://bmawaterflow.bangkok.go.th';

  const authRes = await axios.post(`${BASE_URL}/API/Authentication/Client`, {
    clientId: 'dds-measure-web',
    clientSecret: 'f1d6cf67-946b-4586-934a-6a770d993983'
  }, { headers: HTTP_HEADERS, timeout: 10000 });

  const token = authRes.data.token;
  if (!token) throw new Error('ไม่สามารถรับ Token จาก BMA Waterflow API');

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...HTTP_HEADERS
    },
    timeout: 10000
  });

  const targets = [
    {
      id: 'bma_wf_khw01',
      stCode: 'ST-3',
      uuid: '6bceb086-0008-4910-bda8-d8e618ab3c5d',
      expectedCode: 'WL.KHW.01',
      name: 'สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่',
      canal: 'คลองหกวา',
      canalGroupId: 'khlong-hokwa',
      canalGroupName: 'สายคลองหกวา - คลองแปด',
      flowOrder: 3,
      isPinned: true,
      defaultBank: 2.30,
      defaultWarning: 1.80,
      defaultCritical: 2.00
    },
    {
      id: 'bma_wf_swa02',
      stCode: 'ST-4',
      uuid: '05b29a52-712d-4b90-a4ff-b2c2eb9817ff',
      expectedCode: 'WL.SWA.02',
      name: 'คลองสามวา ตอนถนนเทศบาลลำลูกกา 1',
      canal: 'คลองสามวา',
      canalGroupId: 'khlong-sam-wa',
      canalGroupName: 'สายคลองสามวา',
      flowOrder: 1,
      isPinned: true,
      defaultBank: 2.00,
      defaultWarning: 1.40,
      defaultCritical: 1.80
    },
    {
      id: 'bma_wf_k0801',
      stCode: 'ST-2',
      uuid: '69ae363d-80d0-47c0-97c4-14731bb235e1',
      expectedCode: 'WL.K08.01',
      name: 'ปตร.คลองแปด ตอนซอย อบจ.ปทุมธานี 2006',
      canal: 'คลองหกวา',
      canalGroupId: 'khlong-hokwa',
      canalGroupName: 'สายคลองหกวา - คลองแปด',
      flowOrder: 2,
      isPinned: true,
      defaultBank: 2.00,
      defaultWarning: 1.40,
      defaultCritical: 1.80
    }
  ];

  const results = [];

  for (const t of targets) {
    try {
      const res = await client.get(`/API/Stations/${t.uuid}`);
      const data = res.data;

      let lat = null;
      let lng = null;
      let method = '';

      // Check text for "โลเคชั่น" in description or name or web page
      const desc = data.description || '';
      const locTextMatch = desc.match(/โลเคชั่น[:\s]*([0-9.]+)[,\s]+([0-9.]+)/i);

      if (locTextMatch) {
        lat = parseFloat(locTextMatch[1]);
        lng = parseFloat(locTextMatch[2]);
        method = `Text match "โลเคชั่น" -> [${lat}, ${lng}]`;
      } else if (data.latitude && data.longitude) {
        lat = parseFloat(data.latitude);
        lng = parseFloat(data.longitude);
        method = `BMA Waterflow API backend station coordinates -> [${lat}, ${lng}]`;
      } else {
        throw new Error(`ไม่พบพิกัดสำหรับสถานี ${t.uuid}`);
      }

      results.push({
        id: t.id,
        altId: t.id.replace(/_/g, '-'),
        stCode: t.stCode,
        uuid: t.uuid,
        stationId: t.uuid,
        stationCode: data.code || t.expectedCode,
        name: t.name,
        officialName: data.name || t.name,
        source: 'BMA Waterflow',
        canal: t.canal,
        canalGroupId: t.canalGroupId,
        canalGroupName: t.canalGroupName,
        flowOrder: t.flowOrder,
        isPinned: t.isPinned,
        lat,
        lng,
        url: `${BASE_URL}/map`,
        sourceUrl: `${BASE_URL}/map`,
        defaultBank: t.defaultBank,
        defaultWarning: t.defaultWarning,
        defaultCritical: t.defaultCritical,
        extractionMethod: method,
        verified: true
      });

      console.log(`  ✓ [BMA Waterflow ${t.expectedCode}] ${t.name} -> Lat: ${lat}, Lng: ${lng}`);

    } catch (err) {
      console.error(`  ✗ [BMA Waterflow ${t.expectedCode} Error]:`, err.message);
      throw err;
    }
  }

  return results;
}

/**
 * 3. Extract coordinates from Thaiwater (1 station)
 */
async function fetchThaiwaterCoords() {
  console.log('\n[3/3] กำลังสกัดพิกัดจาก Thaiwater (pathumthani.thaiwater.net)...');
  const API_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel';
  const PAGE_URL = 'https://pathumthani.thaiwater.net/wl#close';

  try {
    const res = await axios.get(API_URL, { headers: HTTP_HEADERS, timeout: 10000 });
    const stations = res.data?.data || [];

    const target = stations.find(s => {
      const sid = s.station?.id;
      const oldCode = s.station?.tele_station_oldcode;
      const thName = s.station?.tele_station_name?.th || '';
      return sid === 37 || oldCode === 'BKK015' ||
             (thName.includes('คลองหกวา') && thName.includes('คลอง8')) ||
             (thName.includes('ลำลูกกา') && thName.includes('คลอง8'));
    });

    if (!target || !target.station) {
      throw new Error('ไม่พบสถานี คลองหกวา ลำลูกกา คลอง8 ในระบบ Thaiwater');
    }

    const st = target.station;
    const lat = parseFloat(st.tele_station_lat);
    const lng = parseFloat(st.tele_station_long);

    console.log(`  ✓ [Thaiwater ID 37] ${st.tele_station_name?.th} -> Lat: ${lat}, Lng: ${lng}`);

    return [{
      id: 'thaiwater_k8',
      altId: 'thaiwater-คลองหกวา-คลอง8',
      stCode: 'ST-1',
      stationId: st.id || 37,
      stationCode: 'ST-1',
      oldCode: st.tele_station_oldcode || 'BKK015',
      name: 'คลองหกวา ลำลูกกา คลอง 8',
      officialName: st.tele_station_name?.th || 'คลองหกวา ลำลูกกา คลอง8',
      source: 'ThaiWater',
      canal: 'คลองหกวา',
      canalGroupId: 'khlong-hokwa',
      canalGroupName: 'สายคลองหกวา - คลองแปด',
      flowOrder: 1,
      isPinned: true,
      lat,
      lng,
      url: PAGE_URL,
      sourceUrl: PAGE_URL,
      defaultBank: parseFloat(st.min_bank) || 2.71,
      defaultWarning: 2.01,
      defaultCritical: 2.41,
      extractionMethod: `Thaiwater Official Telemetry API (tele_station_lat, long) -> [${lat}, ${lng}]`,
      verified: true
    }];

  } catch (err) {
    console.error('  ✗ [Thaiwater Error]:', err.message);
    throw err;
  }
}

/**
 * Main Orchestrator
 */
async function main() {
  console.log('================================================================================');
  console.log('🚀 เริ่มกระบวนการดึงพิกัดจริงจากหน้าเว็บต้นทาง 100% (Automated Coordinate Extraction)');
  console.log('================================================================================');

  const startTime = Date.now();

  try {
    const [bmaWeather, bmaWaterflow, thaiwater] = await Promise.all([
      fetchBmaWeatherCoords(),
      fetchBmaWaterflowCoords(),
      fetchThaiwaterCoords()
    ]);

    // Consolidate into canonical 9 stations order:
    // 1. thaiwater_k8
    // 2. bma_wf_khw01
    // 3. bma_wf_swa02
    // 4. bma_wf_k0801
    // 5. bma_weather_126
    // 6. bma_weather_125
    // 7. bma_weather_124
    // 8. bma_weather_127
    // 9. bma_weather_21
    const order = [
      'thaiwater_k8',
      'bma_wf_khw01',
      'bma_wf_swa02',
      'bma_wf_k0801',
      'bma_weather_126',
      'bma_weather_125',
      'bma_weather_124',
      'bma_weather_127',
      'bma_weather_21'
    ];

    const allExtracted = [...thaiwater, ...bmaWaterflow, ...bmaWeather];
    const verifiedStations = order.map(id => allExtracted.find(s => s.id === id)).filter(Boolean);

    // Save to stations_verified.json
    fs.writeFileSync(VERIFIED_OUTPUT_PATH, JSON.stringify(verifiedStations, null, 2), 'utf-8');
    console.log(`\n💾 บันทึกพิกัดจริงทั้ง ${verifiedStations.length} สถานีลงไฟล์สำเร็จ: ${VERIFIED_OUTPUT_PATH}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️ ดึงข้อมูลเสร็จสิ้นในเวลา: ${duration} วินาที\n`);

    // Print Terminal Table
    console.log('========================================================================================================================');
    console.log('📍 ตารางสรุปพิกัดจริงที่ดึงสดๆ จากหน้าเว็บต้นทาง 100% (Verified Real Coordinates)');
    console.log('========================================================================================================================');
    console.log(
      'No.'.padEnd(4) +
      'ID'.padEnd(18) +
      'รหัส'.padEnd(7) +
      'ชื่อสถานีตรวจวัด'.padEnd(42) +
      'สายคลอง'.padEnd(18) +
      'Latitude'.padEnd(12) +
      'Longitude'.padEnd(13) +
      'แหล่งข้อมูล'
    );
    console.log('------------------------------------------------------------------------------------------------------------------------');

    verifiedStations.forEach((s, idx) => {
      console.log(
        (idx + 1).toString().padEnd(4) +
        s.id.padEnd(18) +
        s.stCode.padEnd(7) +
        s.name.padEnd(42) +
        s.canal.padEnd(18) +
        s.lat.toFixed(5).padEnd(12) +
        s.lng.toFixed(5).padEnd(13) +
        s.source
      );
    });
    console.log('========================================================================================================================');

    return verifiedStations;

  } catch (error) {
    console.error('\n❌ เกิดข้อผิดพลาดร้ายแรงในการสกัดพิกัด:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, fetchBmaWeatherCoords, fetchBmaWaterflowCoords, fetchThaiwaterCoords };
