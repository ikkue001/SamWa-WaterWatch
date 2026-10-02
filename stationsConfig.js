/**
 * Master Stations Configuration (Single Source of Truth)
 * Loads verified coordinates and station metadata directly from:
 * stations_verified.json (Automated extraction from official BMA & Thaiwater sources)
 */

const path = require('path');
const fs = require('fs');

const CANAL_GROUPS_CONFIG = {
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
    directionNote: 'แนวคลองเชื่อมต่อเทศบาลลำลูกกา 1 สู่พื้นที่เขตคลองสามวาและถนนประชาร่วมใจ',
    flowLabel: 'แนวคลองสามวา (เหนือ ➡️ ใต้)',
    color: 'emerald'
  }
};

const VERIFIED_JSON_PATH = path.join(__dirname, 'stations_verified.json');

function loadVerifiedStations() {
  if (fs.existsSync(VERIFIED_JSON_PATH)) {
    try {
      const data = fs.readFileSync(VERIFIED_JSON_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('[stationsConfig] Error parsing stations_verified.json:', err.message);
    }
  }
  return [];
}

const STATIONS_CONFIG = loadVerifiedStations();
const STATIONS_MASTER_CONFIG = STATIONS_CONFIG;

function getStationById(id) {
  return STATIONS_CONFIG.find(s => s.id === id || s.altId === id);
}

function getStationByStCode(stCode) {
  return STATIONS_CONFIG.find(s => s.stCode === stCode);
}

function getStationsBySource(sourceKeyword) {
  return STATIONS_CONFIG.filter(s => s.source.toLowerCase().includes(sourceKeyword.toLowerCase()));
}

function getCoordinatesMap() {
  const map = {};
  for (const s of STATIONS_CONFIG) {
    map[s.id] = { lat: s.lat, lng: s.lng, stCode: s.stCode, name: s.name, canal: s.canal, url: s.url };
  }
  return map;
}

module.exports = {
  STATIONS_CONFIG,
  STATIONS_MASTER_CONFIG,
  CANAL_GROUPS_CONFIG,
  loadVerifiedStations,
  getStationById,
  getStationByStCode,
  getStationsBySource,
  getCoordinatesMap
};
