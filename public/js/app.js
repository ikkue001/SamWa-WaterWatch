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
  selectedCanalTab: null, // user selected tab or auto-detected
  realtimeConnected: false
};

let countdownSeconds = 150;
let countdownTimer = null;
let sseConnection = null;

// Leaflet Map state
let leafletMap = null;
let mapStationMarkers = {};
let mapUserMarker = null;
let mapProximityCircle = null;

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

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  setupEventListeners();

  // Initialize Interactive Map (Leaflet & OSM)
  initLeafletMap();

  // Connect Realtime SSE Stream
  initRealtimeSSE();

  // Initial fetch and start GPS detection
  fetchWaterSummary();
  initGeolocation();

  // Countdown timer
  startCountdownTimer();
});

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
  sseConnection = new EventSource('/api/realtime');

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

  if (status === 'connected' || status === 'edge_live') {
    badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] sm:min-h-[38px] rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0';
    badge.innerHTML = `
      <span class="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="animate-pulse relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
      </span>
      <span class="hidden sm:inline font-medium">${status === 'edge_live' ? 'Edge Live (CDN)' : 'Live Connected'}</span>
      <span class="sm:hidden font-medium">Live</span>
    `;
  } else if (status === 'connecting') {
    badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] sm:min-h-[38px] rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-spin"></span> <span class="hidden sm:inline">กำลังเชื่อมต่อ...</span><span class="sm:hidden">ต่อ...</span>';
  } else if (status === 'disconnected') {
    badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] sm:min-h-[38px] rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 shrink-0';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> <span class="hidden sm:inline">เชื่อมต่อใหม่...</span><span class="sm:hidden">ต่อใหม่...</span>';
  } else {
    badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] sm:min-h-[38px] rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 shrink-0';
    badge.innerHTML = '<span>⏱ Edge Polling</span>';
  }
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

  recalculateDistances();

  // Try updating in-place first for smooth water height transition
  const updatedInPlace = updateExistingCardsIfPresent(appState.stations);
  if (!updatedInPlace) {
    renderAllSections();
  }

  updateMapMarkers();
  handleTwoTierAlerts();
  updateHeaderStatus();
  resetCountdown(120);
}

/**
 * Update existing station cards in place so CSS height transitions smoothly
 */
function updateExistingCardsIfPresent(stations) {
  if (!stations || stations.length === 0) return false;
  const anyCard = document.querySelector('[data-station-fill], [data-station-inside-fill]');
  if (!anyCard) return false;

  stations.forEach(station => {
    // 1. Sluice Gate Station Dual-Side In-Place Updates
    if (station.isGate && station.inside && station.outside) {
      const inBank = station.inside.bank || 1.30;
      const inLvl = station.inside.level !== null ? station.inside.level : 0;
      const inPct = Math.min(100, Math.max(10, Math.round((inLvl / inBank) * 80)));

      const outBank = station.outside.bank || 1.70;
      const outLvl = station.outside.level !== null ? station.outside.level : 0;
      const outPct = Math.min(100, Math.max(10, Math.round((outLvl / outBank) * 80)));

      // Inside elements
      document.querySelectorAll(`[data-station-inside-fill="${station.id}"]`).forEach(fill => {
        fill.setAttribute('data-target-height', inPct);
        fill.style.height = `${inPct}%`;
      });
      document.querySelectorAll(`[data-station-inside-level="${station.id}"]`).forEach(el => {
        el.textContent = station.inside.level !== null && station.inside.level !== undefined ? station.inside.level.toFixed(2) : '--';
      });
      document.querySelectorAll(`[data-station-inside-diff="${station.id}"]`).forEach(el => {
        el.textContent = station.inside.diffCritical >= 0 
          ? `+${station.inside.diffCritical.toFixed(2)}ม. (เกินวิกฤติ)`
          : `${station.inside.diffBank.toFixed(2)}ม. ถึงตลิ่ง`;
      });

      // Outside elements
      document.querySelectorAll(`[data-station-outside-fill="${station.id}"]`).forEach(fill => {
        fill.setAttribute('data-target-height', outPct);
        fill.style.height = `${outPct}%`;
      });
      document.querySelectorAll(`[data-station-outside-level="${station.id}"]`).forEach(el => {
        el.textContent = station.outside.level !== null && station.outside.level !== undefined ? station.outside.level.toFixed(2) : '--';
      });
      document.querySelectorAll(`[data-station-outside-diff="${station.id}"]`).forEach(el => {
        el.textContent = station.outside.diffCritical >= 0 
          ? `+${station.outside.diffCritical.toFixed(2)}ม. (เกินวิกฤติ)`
          : `${station.outside.diffBank.toFixed(2)}ม. ถึงตลิ่ง`;
      });

      // Gate Diff & Opening
      document.querySelectorAll(`[data-station-gate-diff="${station.id}"]`).forEach(el => {
        el.textContent = station.diffInOutText || 'ระดับน้ำเท่ากัน';
      });
      document.querySelectorAll(`[data-station-gate-opening="${station.id}"]`).forEach(el => {
        el.textContent = station.gateOpening ? `${station.gateOpening.toFixed(2)} ม.` : '0.43 ม.';
      });
    }

    // 2. Standard Single-Side Station In-Place Updates
    const bank = station.bankLevel || 2.0;
    const level = station.waterLevel !== null ? station.waterLevel : 0;
    const fillPct = Math.min(100, Math.max(10, Math.round((level / bank) * 80)));

    // Update fills
    document.querySelectorAll(`[data-station-fill="${station.id}"]`).forEach(fill => {
      fill.setAttribute('data-target-height', fillPct);
      fill.style.height = `${fillPct}%`;
    });

    // Update water level text
    document.querySelectorAll(`[data-station-level="${station.id}"]`).forEach(el => {
      el.textContent = (station.waterLevel !== null && station.waterLevel !== undefined) ? station.waterLevel.toFixed(2) : '--';
    });

    // Update diff text
    document.querySelectorAll(`[data-station-diff="${station.id}"]`).forEach(el => {
      el.textContent = station.diffText || '';
    });

    // Update sub gauge label if present
    document.querySelectorAll(`[data-station-level-sub="${station.id}"]`).forEach(el => {
      el.textContent = `${(station.waterLevel !== null && station.waterLevel !== undefined) ? station.waterLevel.toFixed(2) : '--'} ม.`;
    });
  });

  return true;
}

/**
 * Trigger smooth rising transition for water fill bars
 */
function triggerWaterFillTransitions() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.water-wave-fill[data-target-height]').forEach(el => {
        const target = el.getAttribute('data-target-height');
        if (target) {
          el.style.height = `${target}%`;
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
        let res = await fetch('/api/water-summary');
        if (!res.ok) {
          res = await fetch('/api/refresh', { method: 'POST' });
        }
        const data = await res.json();
        applyDataUpdate(data);
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
  if (gpsBtnText) gpsBtnText.textContent = `📍 ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  if (gpsStatusIcon) {
    gpsStatusIcon.classList.remove('animate-spin');
    gpsStatusIcon.setAttribute('data-lucide', 'locate-fixed');
  }

  console.log(`[User Location]: ${sourceLabel} lat: ${lat.toFixed(4)}, lng: ${lng.toFixed(4)}`);
  recalculateDistances();
  renderAllSections();
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
    if (gpsBtnText) gpsBtnText.textContent = '📍 GPS ไม่รองรับ';
    return;
  }

  // Modern browsers require HTTPS for Geolocation (except localhost)
  const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isSecure) {
    console.warn('[Geolocation]: Browser requires HTTPS to access Geolocation API');
    if (gpsBtnText) gpsBtnText.textContent = '📍 13.881, 100.711';
    if (isManual) {
      alert('⚠️ ระบบต้องการการเชื่อมต่อแบบ HTTPS เพื่อใช้งานพิกัด GPS\nกรุณาเข้าใช้งานผ่าน https:// เพื่อให้เบราว์เซอร์อนุญาตพิกัดตำแหน่ง');
    }
    return;
  }

  if (gpsBtnText) gpsBtnText.textContent = 'หาพิกัด...';
  if (gpsStatusIcon) gpsStatusIcon.classList.add('animate-spin');

  navigator.geolocation.getCurrentPosition(
    position => {
      setUserCoordinates(position.coords.latitude, position.coords.longitude, 'พิกัด GPS');
      if (isManual) panMapToUser();
    },
    error => {
      console.warn('[GPS Geolocation Error]:', error.code, error.message);
      if (gpsStatusIcon) gpsStatusIcon.classList.remove('animate-spin');

      if (error.code === error.PERMISSION_DENIED) {
        if (gpsBtnText) gpsBtnText.textContent = '📍 13.881, 100.711';
        if (isManual) {
          alert('📍 ยังไม่ได้รับสิทธิ์เข้าถึงตำแหน่ง:\nกรุณากด "อนุญาต (Allow)" ในการตั้งค่าเบราว์เซอร์ เพื่อคำนวณระยะห่างจากสถานีตรวจวัดน้ำใกล้คุณ');
        }
      } else if (error.code === error.TIMEOUT) {
        if (gpsBtnText) gpsBtnText.textContent = '📍 13.881, 100.711';
      } else {
        if (gpsBtnText) gpsBtnText.textContent = '📍 13.881, 100.711';
      }

      recalculateDistances();
      renderAllSections();
      updateMapMarkers();
      handleTwoTierAlerts();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/**
 * Calculate distance for each station and determine Nearest Canal Group
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
    appState.nearestCanalGroup = appState.nearestStation.canalGroupId || 'khlong-phraya-suren';
    if (!appState.selectedCanalTab) {
      appState.selectedCanalTab = appState.nearestCanalGroup;
    }
  } else {
    appState.stations.forEach(station => {
      station.distanceKm = null;
      station.distanceText = '';
    });
    appState.nearestStation = appState.stations.find(s => s.id === 'bma_weather_126' || s.id === 'bma-weather-126') || appState.stations[0];
    appState.nearestCanalGroup = 'khlong-phraya-suren';
    if (!appState.selectedCanalTab) {
      appState.selectedCanalTab = 'khlong-phraya-suren';
    }
  }
}

/**
 * Fetch Water Summary API
 */
async function fetchWaterSummary() {
  try {
    const res = await fetch('/api/water-summary');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    applyDataUpdate(data);
  } catch (err) {
    console.error('Failed to fetch water summary:', err);
  }
}

/**
 * Update Header status and Last Updated timestamp (Desktop & Mobile)
 */
function updateHeaderStatus() {
  const lastUpdatedTime = document.getElementById('lastUpdatedTime');
  const lastUpdatedTimeMobile = document.getElementById('lastUpdatedTimeMobile');

  if (appState.lastUpdated) {
    const d = new Date(appState.lastUpdated);
    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.';
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
    console.warn('Leaflet is not loaded yet, retrying in 250ms...');
    setTimeout(initLeafletMap, 250);
    return;
  }

  const mapElement = document.getElementById('floodMap');
  if (!mapElement) return;
  if (leafletMap) return;

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

  // OpenStreetMap base layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  }).addTo(leafletMap);

  // Map Header Buttons
  const btnFitAll = document.getElementById('btnMapFitAll');
  if (btnFitAll) {
    btnFitAll.addEventListener('click', fitMapToAllStations);
  }

  const btnGoUser = document.getElementById('btnMapGoUser');
  if (btnGoUser) {
    btnGoUser.addEventListener('click', panMapToUser);
  }

  // Trigger lucide icon creation whenever popup opens
  leafletMap.on('popupopen', () => {
    if (window.lucide) window.lucide.createIcons();
  });

  if (appState.stations && appState.stations.length > 0) {
    updateMapMarkers();
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

    if (isDanger) {
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

    const pinHtml = `
      <div class="station-pin-wrapper">
        ${radarRingsHtml}
        <div class="station-pin ${pinClass}" title="${station.name}">
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

    let bodyPopupHtml = '';
    if (station.isGate && station.inside && station.outside) {
      bodyPopupHtml = `
        <div class="my-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <div class="grid grid-cols-2 gap-2 text-center pb-2 border-b border-white/10">
            <!-- ด้านใน -->
            <div class="p-1.5 rounded-lg bg-black/40 border border-white/5">
              <div class="text-[10px] font-bold text-sky-300">🌊 ฝั่งด้านใน</div>
              <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${station.inside.level !== null && station.inside.level !== undefined ? station.inside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-slate-400">ม.</span></div>
              <div class="text-[9px] font-semibold ${station.inside.isOverflow ? 'text-red-400' : (station.inside.isWarning ? 'text-amber-400' : 'text-emerald-400')}">
                ${station.inside.statusText} (${station.inside.diffCritical >= 0 ? `+${station.inside.diffCritical.toFixed(2)}` : `${station.inside.diffBank.toFixed(2)}`})
              </div>
            </div>
            <!-- ด้านนอก -->
            <div class="p-1.5 rounded-lg bg-black/40 border border-white/5">
              <div class="text-[10px] font-bold text-purple-300">🌊 ฝั่งด้านนอก</div>
              <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${station.outside.level !== null && station.outside.level !== undefined ? station.outside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-slate-400">ม.</span></div>
              <div class="text-[9px] font-semibold ${station.outside.isOverflow ? 'text-red-400' : (station.outside.isWarning ? 'text-amber-400' : 'text-emerald-400')}">
                ${station.outside.statusText} (${station.outside.diffCritical >= 0 ? `+${station.outside.diffCritical.toFixed(2)}` : `${station.outside.diffBank.toFixed(2)}`})
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
            <div class="text-slate-300">วิกฤติ <b class="text-amber-300 font-mono">${station.inside.critical}m</b> / ตลิ่ง <b class="font-mono">${station.inside.bank}m</b></div>
          </div>
          <div>
            <div class="text-slate-400 font-semibold">เกณฑ์ฝั่งนอก:</div>
            <div class="text-slate-300">วิกฤติ <b class="text-amber-300 font-mono">${station.outside.critical}m</b> / ตลิ่ง <b class="font-mono">${station.outside.bank}m</b></div>
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
            <span class="text-xs text-slate-400">ม.รทก.</span>
          </div>
          <div class="text-[11px] font-semibold mt-0.5 ${station.diff >= 0 ? 'text-red-400' : (isWarning ? 'text-amber-400' : 'text-emerald-400')}">
            ${station.diffText || ''}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-1.5 text-[11px] mb-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
          <div>
            <span class="text-slate-400">ระดับวิกฤติ:</span>
            <b class="ml-1 text-amber-300 font-mono">${station.criticalLevel} ม.รทก.</b>
          </div>
          <div>
            <span class="text-slate-400">ระดับตลิ่ง:</span>
            <b class="ml-1 text-slate-200 font-mono">${station.bankLevel} ม.รทก.</b>
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
          ${station.name}
        </h4>
        <p class="text-[11px] text-slate-400 mt-0.5">${station.location || ''}</p>

        ${bodyPopupHtml}

        ${distText}

        <div class="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <span>เวลา: <b>${station.updatedAt}</b></span>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1">
            <span>นำทาง</span>
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
        </div>
      </div>
    `;

    const popupOptions = { maxWidth: station.isGate ? 340 : 320, autoPan: false };

    if (mapStationMarkers[station.id]) {
      mapStationMarkers[station.id].setLatLng([station.lat, station.lng]);
      mapStationMarkers[station.id].setIcon(customIcon);
      mapStationMarkers[station.id].setPopupContent(popupHtml);
    } else {
      const marker = L.marker([station.lat, station.lng], { icon: customIcon }).addTo(leafletMap);
      marker.bindPopup(popupHtml, popupOptions);

      // Stop marker click event from propagating to the map
      marker.on('click', (e) => {
        if (e && e.originalEvent) {
          L.DomEvent.stopPropagation(e.originalEvent);
        }
      });

      mapStationMarkers[station.id] = marker;
    }
  });

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

function isTargetAlertStation(station) {
  if (!station) return false;

  // 1. สถานีที่ใกล้ตำแหน่งผู้ใช้ที่สุด (Nearest Station ตามระยะ GPS)
  if (appState.nearestStation && station.id === appState.nearestStation.id) {
    return true;
  }

  // 2. สถานี คลองหกวา ลำลูกกา คลอง 8 (ST-1)
  if (
    station.stCode === 'ST-1' ||
    station.id === 'thaiwater_k8' ||
    station.id === 'thaiwater-lamlukka-k8' ||
    station.id === 'thaiwater-คลองหกวา-คลอง8' ||
    (station.name && station.name.includes('คลองหกวา ลำลูกกา คลอง 8')) ||
    (station.name && station.name.includes('คลอง 8'))
  ) {
    return true;
  }

  // 3. จุดวัด สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่ (ST-3)
  if (
    station.stCode === 'ST-3' ||
    station.id === 'bma_wf_khw01' ||
    station.id === 'bma-waterflow-หกวา-นิมิตใหม่' ||
    station.id === 'bma-waterflow-nimitmai' ||
    (station.name && station.name.includes('นิมิตใหม่')) ||
    (station.name && station.name.includes('WL.KHW.01'))
  ) {
    return true;
  }

  return false;
}

function getTargetAlertReason(station) {
  if (!station) return '';
  const reasons = [];

  const isNearest = appState.nearestStation && station.id === appState.nearestStation.id;
  if (isNearest) {
    reasons.push(station.distanceText ? `📍 ใกล้คุณที่สุด (${station.distanceText})` : '📍 ใกล้คุณที่สุด');
  }

  if (
    station.stCode === 'ST-1' ||
    station.id === 'thaiwater_k8' ||
    station.id === 'thaiwater-lamlukka-k8' ||
    station.id === 'thaiwater-คลองหกวา-คลอง8' ||
    (station.name && station.name.includes('คลองหกวา ลำลูกกา คลอง 8')) ||
    (station.name && station.name.includes('คลอง 8'))
  ) {
    reasons.push('🌊 ปตร.คลอง 8 (จุดเฝ้าระวังหลัก)');
  }

  if (
    station.stCode === 'ST-3' ||
    station.id === 'bma_wf_khw01' ||
    station.id === 'bma-waterflow-หกวา-นิมิตใหม่' ||
    station.id === 'bma-waterflow-nimitmai' ||
    (station.name && station.name.includes('นิมิตใหม่')) ||
    (station.name && station.name.includes('WL.KHW.01'))
  ) {
    reasons.push('💧 สูบน้ำนิมิตใหม่ (จุดเฝ้าระวังหลัก)');
  }

  return reasons.join(' • ') || 'จุดเฝ้าระวังเป้าหมาย';
}

/**
 * REFACTORED ALERT BANNERS (VISUAL ALERTS ONLY):
 * Filters strictly to 3 target stations (Nearest + Khlong 8 + Nimit Mai).
 * Controls top Emergency / Warning banner display (Visual alerts only, no audio).
 */
function handleTwoTierAlerts() {
  const emergencyBanner = document.getElementById('emergencyBanner');
  const emergencyStationCards = document.getElementById('emergencyStationCards');
  const emergencySummaryHeadline = document.getElementById('emergencySummaryHeadline');

  const warningBanner = document.getElementById('warningBanner');
  const warningStationCards = document.getElementById('warningStationCards');
  const warningSummaryHeadline = document.getElementById('warningSummaryHeadline');

  // Filter ONLY stations that match the 3 targets
  const targetOverflowStations = appState.stations.filter(s => s.isOverflow && isTargetAlertStation(s));
  const targetWarningStations = appState.stations.filter(s => s.isWarning && !s.isOverflow && isTargetAlertStation(s));

  if (targetOverflowStations.length > 0) {
    // ----------------------------------------------------
    // TIER 3: EMERGENCY (🔴 น้ำล้นตลิ่งที่จุดเป้าหมาย - Visual Alert)
    // ----------------------------------------------------
    if (emergencyBanner) {
      emergencyBanner.classList.remove('hidden');
      if (emergencySummaryHeadline) {
        emergencySummaryHeadline.textContent = `🚨 ฉุกเฉิน: ตรวจพบ ${targetOverflowStations.length} สถานีเป้าหมายน้ำล้นตลิ่งแล้ว!`;
      }
      if (emergencyStationCards) {
        emergencyStationCards.innerHTML = renderAlertStationCards(targetOverflowStations, 'EMERGENCY');
      }
    }
    if (warningBanner) warningBanner.classList.add('hidden');

    // Visual indicators only
    document.body.classList.add('emergency-active');

    // Auto-expand emergency guidelines
    updateGuidelinesAutoExpand(true, false);

  } else if (targetWarningStations.length > 0) {
    // ----------------------------------------------------
    // TIER 2: WARNING (🟡/🟠 เตือนภัยวิกฤติที่จุดเป้าหมาย - Visual Alert)
    // ----------------------------------------------------
    document.body.classList.remove('emergency-active');
    if (emergencyBanner) emergencyBanner.classList.add('hidden');

    if (warningBanner) {
      warningBanner.classList.remove('hidden');
      if (warningSummaryHeadline) {
        warningSummaryHeadline.textContent = `⚠️ เตือนภัย: ตรวจพบ ${targetWarningStations.length} สถานีเป้าหมายเข้าสู่เกณฑ์วิกฤติ (เตรียมความพร้อม)`;
      }
      if (warningStationCards) {
        warningStationCards.innerHTML = renderAlertStationCards(targetWarningStations, 'WARNING');
      }
    }

    // Auto-expand warning guidelines
    updateGuidelinesAutoExpand(false, true);

  } else {
    // ----------------------------------------------------
    // TIER 1: NORMAL (Visual Alert Off)
    // ----------------------------------------------------
    document.body.classList.remove('emergency-active');
    if (emergencyBanner) emergencyBanner.classList.add('hidden');
    if (warningBanner) warningBanner.classList.add('hidden');

    // Normal guidelines state (collapsed by default)
    updateGuidelinesAutoExpand(false, false);
  }

  if (window.lucide) window.lucide.createIcons();
}

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
        <div onclick="focusStationOnMap('${s.id}')" class="station-card rounded-xl p-3 border ${bgCard} flex flex-col justify-between shadow-md cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/15 hover:ring-2 hover:ring-white/40">
          <div>
            <div class="mb-1.5 flex items-center justify-between gap-1 flex-wrap">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-white/15 text-white border border-white/20">
                <i data-lucide="crosshair" class="w-2.5 h-2.5 text-sky-300"></i>
                <span>${targetReason}</span>
              </span>
              <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${isStationOverflow ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-950'}">
                ${s.alertBadgeText || (isStationOverflow ? '🚨 ล้นตลิ่ง' : '⚠️ วิกฤติ')}
              </span>
            </div>

            <h4 class="text-xs sm:text-sm font-bold text-white leading-tight">
              ${s.stCode ? `<span class="text-amber-300 mr-1 font-mono font-bold">${s.stCode}</span>` : ''}${s.name}
            </h4>

            <!-- Dual Side Water Levels in Alert Banner -->
            <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/10 text-center">
              <div class="bg-black/30 p-2 rounded-lg border border-white/5">
                <div class="text-[10px] font-bold text-sky-300">🌊 ฝั่งด้านใน</div>
                <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${s.inside.level !== null ? s.inside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-white/70">ม.</span></div>
                <div class="text-[9px] font-bold mt-0.5 ${s.inside.isOverflow ? 'text-red-300' : (s.inside.isWarning ? 'text-amber-300' : 'text-emerald-300')}">
                  ${s.inside.statusText} (${s.inside.diffCritical >= 0 ? `+${s.inside.diffCritical.toFixed(2)}m` : `${s.inside.diffBank.toFixed(2)}m`})
                </div>
              </div>

              <div class="bg-black/30 p-2 rounded-lg border border-white/5">
                <div class="text-[10px] font-bold text-purple-300">🌊 ฝั่งด้านนอก</div>
                <div class="text-xl font-black text-white font-mono-numbers mt-0.5">${s.outside.level !== null ? s.outside.level.toFixed(2) : '--'} <span class="text-[10px] font-normal text-white/70">ม.</span></div>
                <div class="text-[9px] font-bold mt-0.5 ${s.outside.isOverflow ? 'text-red-300' : (s.outside.isWarning ? 'text-amber-300' : 'text-emerald-300')}">
                  ${s.outside.statusText} (${s.outside.diffCritical >= 0 ? `+${s.outside.diffCritical.toFixed(2)}m` : `${s.outside.diffBank.toFixed(2)}m`})
                </div>
              </div>
            </div>

            <!-- Head Difference & Gate Opening -->
            <div class="mt-2 text-[10px] py-1.5 px-2 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between text-white/80">
              <span>ความต่างระดับ: <b class="text-cyan-300 font-mono">${s.diffInOutText || ''}</b></span>
              <span>เปิด: <b class="text-amber-300 font-mono">${s.gateOpening ? `${s.gateOpening.toFixed(2)} ม.` : '0.43 ม.'}</b></span>
            </div>
          </div>

          <div class="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-white/70">
            <span>เวลา: <b>${s.updatedAt}</b></span>
            <div class="flex items-center gap-2">
              ${distTag}
              <button onclick="event.stopPropagation(); focusStationOnMap('${s.id}')" class="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-bold flex items-center gap-1 transition touch-manipulation" title="ดูตำแหน่งบนแผนที่">
                <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
                <span>แผนที่</span>
              </button>
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
      if (dCrit >= 0) {
        diffCritStr = `+${dCrit.toFixed(2)} ม. (เกินเกณฑ์วิกฤติ)`;
        isCritExceeded = true;
      } else {
        diffCritStr = `${dCrit.toFixed(2)} ม. ถึงเกณฑ์วิกฤติ`;
      }
    }

    // Calculate bank difference
    let diffBankStr = '--';
    let isBankOverflow = false;
    if (s.waterLevel !== null && s.bankLevel !== null) {
      const dBank = parseFloat((s.waterLevel - s.bankLevel).toFixed(2));
      if (dBank >= 0) {
        diffBankStr = `+${dBank.toFixed(2)} ม. ล้นตลิ่งแล้ว!`;
        isBankOverflow = true;
      } else {
        diffBankStr = `${dBank.toFixed(2)} ม. ถึงตลิ่ง`;
      }
    }

    return `
      <div onclick="focusStationOnMap('${s.id}')" class="station-card rounded-xl p-3 border ${bgCard} flex flex-col justify-between shadow-md cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/15 hover:ring-2 hover:ring-white/40">
        <div>
          <!-- Target Station Trigger Tag -->
          <div class="mb-1.5 flex items-center justify-between gap-1 flex-wrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-white/15 text-white border border-white/20">
              <i data-lucide="crosshair" class="w-2.5 h-2.5 text-sky-300"></i>
              <span>${targetReason}</span>
            </span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${isStationOverflow ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-950'}">
              ${isStationOverflow ? '🚨 ล้นตลิ่ง' : '⚠️ วิกฤติ'}
            </span>
          </div>

          <!-- Station Name -->
          <h4 class="text-xs sm:text-sm font-bold text-white leading-tight">
            ${s.stCode ? `<span class="text-amber-300 mr-1 font-mono font-bold">${s.stCode}</span>` : ''}${s.name}
          </h4>

          <!-- Big Water Level -->
          <div class="flex items-baseline justify-between gap-2 mt-2">
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl sm:text-3xl font-black text-white font-mono-numbers">
                ${(s.waterLevel !== null && s.waterLevel !== undefined) ? s.waterLevel.toFixed(2) : '--'}
              </span>
              <span class="text-xs text-white/70">ม.รทก.</span>
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

        <div class="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-white/70">
          <span>เวลา: <b>${s.updatedAt}</b></span>
          <div class="flex items-center gap-2">
            ${distTag}
            <button onclick="event.stopPropagation(); focusStationOnMap('${s.id}')" class="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-bold flex items-center gap-1 transition touch-manipulation" title="ดูตำแหน่งบนแผนที่">
              <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
              <span>แผนที่</span>
            </button>
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

  const activeCanalGroupId = appState.selectedCanalTab || appState.nearestCanalGroup || 'khlong-phraya-suren';
  const canalMeta = CANAL_GROUPS_META[activeCanalGroupId] || CANAL_GROUPS_META['khlong-phraya-suren'];

  // Canal ordering rank (upstream to downstream geographic flow)
  const canalOrderRank = {
    'khlong-hokwa': 1,
    'khlong-sam-wa': 2,
    'khlong-phraya-suren': 3,
    'bma-main': 4
  };

  // 1. Nearby stations within <= 5.0 km, sorted upstream -> downstream
  const nearbyStations = appState.stations
    .filter(s => s.distanceKm !== null && s.distanceKm !== undefined && s.distanceKm <= 5.0)
    .sort((a, b) => {
      const groupRankA = canalOrderRank[a.canalGroupId] || 99;
      const groupRankB = canalOrderRank[b.canalGroupId] || 99;
      if (groupRankA !== groupRankB) return groupRankA - groupRankB;
      return (a.flowOrder || 1) - (b.flowOrder || 1);
    });

  // 2. Stations in selected canal line tab, sorted upstream -> downstream (flowOrder ascending)
  const canalStations = appState.stations
    .filter(s => s.canalGroupId === activeCanalGroupId)
    .sort((a, b) => (a.flowOrder || 1) - (b.flowOrder || 1));

  const nearest = appState.nearestStation;
  const isNearestInThisGroup = nearest && nearest.canalGroupId === activeCanalGroupId;
  const distanceText = nearest && nearest.distanceText ? nearest.distanceText : '';

  // Canal Group Switcher Tabs (Thumb friendly >= 40px touch target)
  const tabsHtml = Object.keys(CANAL_GROUPS_META).map(k => {
    const meta = CANAL_GROUPS_META[k];
    const isActive = k === activeCanalGroupId;
    const isNearby = appState.nearestCanalGroup === k;
    return `
      <button onclick="switchCanalTab('${k}')" class="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 touch-manipulation active:scale-95 ${
        isActive
          ? 'bg-blue-600 text-white shadow-md'
          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
      }">
        ${isNearby ? '<span class="w-2 h-2 rounded-full bg-sky-400 live-pulse"></span>' : ''}
        <span>${meta.shortName}</span>
      </button>
    `;
  }).join('');

  // Proximity 5km Container
  let nearbyHtml = '';
  if (nearbyStations.length > 0) {
    nearbyHtml = `
      <div class="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block animate-pulse"></span>
            <h3 class="text-sm sm:text-base font-bold text-amber-200 flex items-center gap-1.5">
              <span>🟡 สถานีในรัศมีรอบตัวคุณ (≤ 5 กม.)</span>
              <span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 font-mono font-bold">${nearbyStations.length} จุด</span>
            </h3>
          </div>
          <span class="text-[11px] text-amber-300/80 font-mono">เรียงจากต้นน้ำสู่ปลายน้ำ (Upstream ➡️ Downstream)</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(nearbyStations.length, 4)} gap-4">
          ${nearbyStations.map(station => {
            if (station.isGate || station.id === 'bma_weather_21') {
              return renderSluiceGateTwinCard(station, station.stCode, nearbyStations.length, true);
            }
            return renderCanalFlowCard(station, station.stCode, nearbyStations.length, true);
          }).join('')}
        </div>
      </div>
    `;
  } else {
    nearbyHtml = `
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

  container.innerHTML = `
    <div class="rounded-2xl sm:rounded-3xl glass-panel p-4 sm:p-6 border border-slate-800 relative overflow-hidden">
      <!-- Section Header -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80 mb-4">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="px-3 py-0.5 rounded-full text-xs font-black bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1">
              <i data-lucide="navigation" class="w-3.5 h-3.5 text-sky-400"></i>
              <span>📍 ส่วนที่ 1: สถานีและสายคลองตามตำแหน่ง GPS</span>
            </span>
            ${
              isNearestInThisGroup && distanceText
                ? `<span class="distance-pill"><i data-lucide="locate" class="w-3 h-3"></i> ${distanceText}</span>`
                : ''
            }
          </div>
          <h2 class="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            คุณอยู่ใกล้: ${canalMeta.name}
          </h2>
          <p class="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <i data-lucide="info" class="w-3.5 h-3.5 text-slate-500"></i>
            <span>${canalMeta.directionNote}</span>
          </p>
        </div>

        <!-- Canal Line Selector Tabs -->
        <div class="flex items-center flex-wrap gap-1.5">
          ${tabsHtml}
        </div>
      </div>

      <!-- Priority 1: Stations <= 5km -->
      ${nearbyHtml}

      <!-- Priority 2: Canal Flow Sequence -->
      <div class="mt-2 pt-3 border-t border-slate-800/60">
        <div class="mb-3 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
          <div class="flex items-center gap-2">
            <i data-lucide="arrow-down-narrow-wide" class="w-4 h-4 text-blue-400"></i>
            <span class="font-medium">${canalMeta.flowLabel}</span>
          </div>
          <span class="text-[11px] text-slate-500 font-mono">เรียงจากต้นน้ำสู่ปลายน้ำ</span>
        </div>

        <!-- Stations Cards in Flow Order (Grid: 1 col on mobile, 2 on tablet, up to 4 on desktop) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(canalStations.length, 4)} gap-4">
          ${canalStations.map(station => {
            if (station.isGate || station.id === 'bma_weather_21') {
              return renderSluiceGateTwinCard(station, station.stCode, canalStations.length, false);
            }
            return renderCanalFlowCard(station, station.stCode, canalStations.length, false);
          }).join('')}
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

function switchCanalTab(canalId) {
  appState.selectedCanalTab = canalId;
  renderSection1SmartCanalGPS();
  triggerWaterFillTransitions();
}

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

  const bank = station.bankLevel || 2.0;
  const level = station.waterLevel !== null ? station.waterLevel : 0;
  const fillPct = Math.min(100, Math.max(10, Math.round((level / bank) * 80)));

  const isNearest = appState.nearestStation && appState.nearestStation.id === station.id;
  const stCode = station.stCode || badgeCode || '';

  const distancePill = (station.distanceKm !== null && station.distanceKm !== undefined)
    ? `<span class="distance-pill font-mono font-bold text-[11px]"><i data-lucide="navigation" class="w-3 h-3 text-sky-400"></i> ${station.distanceKm <= 5.0 ? '🟡 ' : ''}ห่าง ${formatDistance(station.distanceKm)}</span>`
    : '';

  return `
    <div onclick="focusStationOnMap('${station.id}')" class="station-card rounded-2xl glass-panel p-4 border ${cardBorder} flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer hover:border-sky-400/50">
      ${isDanger ? '<div class="absolute inset-0 bg-red-600/10 pointer-events-none"></div>' : ''}
      ${isWarning ? '<div class="absolute inset-0 bg-amber-500/5 pointer-events-none"></div>' : ''}

      <div>
        <!-- Sequence & Nearest indicator -->
        <div class="flex items-center justify-between gap-1 mb-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-md bg-blue-600/30 border border-blue-400/40 text-blue-300 text-[11px] font-black font-mono flex items-center justify-center">
              ${stCode}
            </span>
            ${distancePill}
            ${
              isNearest
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-400/40">📍 ใกล้คุณที่สุด</span>'
                : ''
            }
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}">
            ${station.statusText}
          </span>
        </div>

        <h4 class="text-sm font-bold text-white tracking-tight leading-tight line-clamp-2 hover:text-sky-300 transition">
          ${station.name}
        </h4>
        <p class="text-[10px] text-slate-400 mt-0.5 truncate">
          ${station.location || ''}
        </p>

        <!-- Big Water Level -->
        <div class="my-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
          <div class="flex items-baseline justify-between">
            <div class="flex items-baseline gap-1.5">
              <span data-station-level="${station.id}" class="text-2xl sm:text-3xl font-black text-white font-mono-numbers">
                ${(station.waterLevel !== null && station.waterLevel !== undefined) ? station.waterLevel.toFixed(2) : '--'}
              </span>
              <span class="text-xs text-slate-400">ม.รทก.</span>
            </div>
            ${station.isStale ? '<span class="text-[10px] text-amber-300 font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">🕒 (ข้อมูลเดิม)</span>' : ''}
          </div>
          <div data-station-diff="${station.id}" class="text-[11px] mt-1 font-semibold ${station.diff >= 0 ? 'text-red-400' : (isWarning ? 'text-amber-400' : 'text-emerald-400')} truncate">
            ${station.diffText || ''}
          </div>
        </div>

        <!-- Gauge Bar -->
        <div class="w-full h-24 water-gauge-container border border-slate-700/80 flex flex-col justify-end p-1 relative shadow-inner mb-3">
          <div class="bank-marker-line" style="bottom: 78%;">
            <span class="bank-marker-label">ตลิ่ง ${station.bankLevel}m</span>
          </div>
          <div class="critical-marker-line" style="bottom: 58%;">
            <span class="critical-marker-label">วิกฤติ ${station.criticalLevel}m</span>
          </div>
          <div class="water-wave-fill ${fillGrad}" data-station-fill="${station.id}" data-target-height="${fillPct}" style="height: 0%;">
            <div class="water-surface-line"></div>
          </div>
        </div>

        <!-- Thresholds -->
        <div class="grid grid-cols-2 gap-1.5 text-[10px] text-slate-300">
          <div class="bg-slate-900/50 p-1.5 rounded border border-slate-800">
            <span class="text-slate-400">วิกฤติ:</span> <b class="font-mono text-amber-300">${station.criticalLevel}ม.</b>
          </div>
          <div class="bg-slate-900/50 p-1.5 rounded border border-slate-800">
            <span class="text-slate-400">ตลิ่ง:</span> <b class="font-mono text-slate-200">${station.bankLevel}ม.</b>
          </div>
        </div>
      </div>

      <!-- Card Footer -->
      <div class="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
        <span>${station.distanceText || station.updatedAt}</span>
        <div class="flex items-center gap-1.5">
          <button onclick="event.stopPropagation(); focusStationOnMap('${station.id}')" class="px-2.5 py-1 min-h-[36px] rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1 font-semibold transition touch-manipulation" title="คลิกเพื่อซูมดูตำแหน่งบนแผนที่">
            <i data-lucide="map-pin" class="w-3 h-3 text-sky-400"></i>
            <span>แผนที่</span>
          </button>
          <a href="https://www.google.com/maps?q=${station.lat},${station.lng}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" class="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-sky-300 transition touch-manipulation" title="เปิด Google Maps">
            <i data-lucide="external-link" class="w-3.5 h-3.5 text-slate-400"></i>
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
  const inside = station.inside || { label: 'ด้านใน', level: 0.93, warning: 0.70, critical: 0.80, bank: 1.30 };
  const inLevel = inside.level !== null && inside.level !== undefined ? inside.level : 0;
  const inBank = inside.bank || 1.30;
  const inCritical = inside.critical || 0.80;
  const inFillPct = Math.min(100, Math.max(10, Math.round((inLevel / inBank) * 80)));
  const inIsDanger = inside.isOverflow;
  const inIsWarning = inside.isWarning;

  let inBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  let inFillGrad = 'bg-gradient-to-t from-blue-700 to-sky-500';
  if (inIsDanger) {
    inBadgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
    inFillGrad = 'bg-gradient-to-t from-red-700 to-rose-500';
  } else if (inIsWarning) {
    inBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
    inFillGrad = 'bg-gradient-to-t from-amber-600 to-yellow-400';
  }

  // Outside parameters
  const outside = station.outside || { label: 'ด้านนอก', level: 1.39, warning: 1.10, critical: 1.30, bank: 1.70 };
  const outLevel = outside.level !== null && outside.level !== undefined ? outside.level : 0;
  const outBank = outside.bank || 1.70;
  const outCritical = outside.critical || 1.30;
  const outFillPct = Math.min(100, Math.max(10, Math.round((outLevel / outBank) * 80)));
  const outIsDanger = outside.isOverflow;
  const outIsWarning = outside.isWarning;

  let outBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  let outFillGrad = 'bg-gradient-to-t from-blue-700 to-sky-500';
  if (outIsDanger) {
    outBadgeClass = 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
    outFillGrad = 'bg-gradient-to-t from-red-700 to-rose-500';
  } else if (outIsWarning) {
    outBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
    outFillGrad = 'bg-gradient-to-t from-amber-600 to-yellow-400';
  }

  const isNearest = appState.nearestStation && appState.nearestStation.id === station.id;
  const stCode = station.stCode || badgeCode || 'ST-9';

  const distancePill = (station.distanceKm !== null && station.distanceKm !== undefined)
    ? `<span class="distance-pill font-mono font-bold text-[11px]"><i data-lucide="navigation" class="w-3 h-3 text-sky-400"></i> ${station.distanceKm <= 5.0 ? '🟡 ' : ''}ห่าง ${formatDistance(station.distanceKm)}</span>`
    : '';

  const gateOpeningVal = station.gateOpening || 0.43;
  const gateSlabHeight = Math.min(100, Math.max(15, Math.round((gateOpeningVal / 1.5) * 100)));

  return `
    <div onclick="focusStationOnMap('${station.id}')" class="station-card sluice-gate-card rounded-2xl glass-panel p-4 sm:p-5 border ${cardBorder} flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer col-span-1 sm:col-span-2 lg:col-span-2 hover:border-sky-400/50">
      ${isDanger ? '<div class="absolute inset-0 bg-red-600/10 pointer-events-none"></div>' : ''}
      ${isWarning ? '<div class="absolute inset-0 bg-amber-500/5 pointer-events-none"></div>' : ''}

      <div>
        <!-- Top Header & Badges -->
        <div class="flex items-center justify-between gap-1 mb-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-md bg-blue-600/30 border border-blue-400/40 text-blue-300 text-[11px] font-black font-mono flex items-center justify-center">
              ${stCode}
            </span>
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
          <span class="px-2.5 py-0.5 rounded text-[11px] font-bold border ${badgeClass}">
            ${station.alertBadgeText || station.statusText}
          </span>
        </div>

        <h4 class="text-sm sm:text-base font-bold text-white tracking-tight leading-tight hover:text-sky-300 transition">
          ${station.name}
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
                    ${inside.level !== null && inside.level !== undefined ? inside.level.toFixed(2) : '--'}
                  </span>
                  <span class="text-[11px] text-slate-400">ม.รทก.</span>
                </div>
                <div data-station-inside-diff="${station.id}" class="text-[10px] mt-0.5 font-medium ${inside.isOverflow ? 'text-red-400' : (inside.isWarning ? 'text-amber-400' : 'text-emerald-400')} truncate">
                  ${inside.diffCritical >= 0 ? `+${inside.diffCritical.toFixed(2)}ม. (เกินวิกฤติ)` : `${inside.diffBank.toFixed(2)}ม. ถึงตลิ่ง`}
                </div>
              </div>

              <!-- Inside Gauge -->
              <div class="w-full h-28 sm:h-32 water-gauge-container border border-slate-700/80 flex flex-col justify-end p-1 relative shadow-inner mb-2">
                <div class="bank-marker-line" style="bottom: 78%;">
                  <span class="bank-marker-label">ตลิ่ง ${inside.bank}m</span>
                </div>
                <div class="critical-marker-line" style="bottom: 58%;">
                  <span class="critical-marker-label">วิกฤติ ${inside.critical}m</span>
                </div>
                <div class="water-wave-fill ${inFillGrad}" data-station-inside-fill="${station.id}" data-target-height="${inFillPct}" style="height: 0%;">
                  <div class="water-surface-line"></div>
                </div>
              </div>

              <!-- Inside Thresholds -->
              <div class="grid grid-cols-2 gap-1 text-[10px] text-center">
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">วิกฤติ:</span> <b class="text-amber-300 font-mono">${inside.critical}m</b>
                </div>
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">ตลิ่ง:</span> <b class="text-slate-300 font-mono">${inside.bank}m</b>
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
                    ${outside.level !== null && outside.level !== undefined ? outside.level.toFixed(2) : '--'}
                  </span>
                  <span class="text-[11px] text-slate-400">ม.รทก.</span>
                </div>
                <div data-station-outside-diff="${station.id}" class="text-[10px] mt-0.5 font-medium ${outside.isOverflow ? 'text-red-400' : (outside.isWarning ? 'text-amber-400' : 'text-emerald-400')} truncate">
                  ${outside.diffCritical >= 0 ? `+${outside.diffCritical.toFixed(2)}ม. (เกินวิกฤติ)` : `${outside.diffBank.toFixed(2)}ม. ถึงตลิ่ง`}
                </div>
              </div>

              <!-- Outside Gauge -->
              <div class="w-full h-28 sm:h-32 water-gauge-container border border-slate-700/80 flex flex-col justify-end p-1 relative shadow-inner mb-2">
                <div class="bank-marker-line" style="bottom: 78%;">
                  <span class="bank-marker-label">ตลิ่ง ${outside.bank}m</span>
                </div>
                <div class="critical-marker-line" style="bottom: 58%;">
                  <span class="critical-marker-label">วิกฤติ ${outside.critical}m</span>
                </div>
                <div class="water-wave-fill ${outFillGrad}" data-station-outside-fill="${station.id}" data-target-height="${outFillPct}" style="height: 0%;">
                  <div class="water-surface-line"></div>
                </div>
              </div>

              <!-- Outside Thresholds -->
              <div class="grid grid-cols-2 gap-1 text-[10px] text-center">
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">วิกฤติ:</span> <b class="text-amber-300 font-mono">${outside.critical}m</b>
                </div>
                <div class="bg-black/30 p-1 rounded border border-white/5">
                  <span class="text-slate-400">ตลิ่ง:</span> <b class="text-slate-300 font-mono">${outside.bank}m</b>
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
      <div class="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
        <span>เวลา: <b class="text-slate-300 font-mono">${station.updatedAt}</b></span>
        <div class="flex items-center gap-1.5">
          <button onclick="event.stopPropagation(); focusStationOnMap('${station.id}')" class="px-2.5 py-1 min-h-[36px] rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1 font-semibold transition touch-manipulation" title="คลิกเพื่อซูมดูตำแหน่งบนแผนที่">
            <i data-lucide="map-pin" class="w-3 h-3 text-sky-400"></i>
            <span>แผนที่</span>
          </button>
          <a href="https://www.google.com/maps?q=${station.lat},${station.lng}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" class="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-sky-300 transition touch-manipulation" title="เปิด Google Maps">
            <i data-lucide="external-link" class="w-3.5 h-3.5 text-slate-400"></i>
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
function renderSection2PinnedPriority() {
  const container = document.getElementById('pinnedPriorityContainer');
  if (!container) return;

  const pinnedOrder = ['ST-1', 'ST-2', 'ST-3', 'ST-4'];
  const pinnedStations = appState.stations
    .filter(s => s.isPinned || pinnedOrder.includes(s.stCode))
    .sort((a, b) => {
      const idxA = pinnedOrder.indexOf(a.stCode);
      const idxB = pinnedOrder.indexOf(b.stCode);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      const numA = parseInt((a.stCode || '').replace(/\D/g, ''), 10) || 999;
      const numB = parseInt((b.stCode || '').replace(/\D/g, ''), 10) || 999;
      return numA - numB;
    });

  if (pinnedStations.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-slate-400">กำลังโหลด 4 จุดเฝ้าระวังหลัก (ST-1 ถึง ST-4)...</div>`;
    return;
  }

  container.innerHTML = pinnedStations.map((station, idx) => {
    const isDanger = station.isOverflow;
    const isWarning = station.isWarning;

    let cardBorder = 'border-slate-800';
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

    const bank = station.bankLevel || 2.0;
    const level = station.waterLevel !== null ? station.waterLevel : 0;
    const fillPct = Math.min(100, Math.max(10, Math.round((level / bank) * 80)));

    const distanceBadge = (station.distanceKm !== null && station.distanceKm !== undefined)
      ? `<span class="distance-pill text-[11px] font-mono font-bold"><i data-lucide="navigation" class="w-3 h-3 text-sky-400"></i> ${station.distanceKm <= 5.0 ? '🟡 ' : ''}ห่าง ${formatDistance(station.distanceKm)}</span>`
      : '';

    return `
      <div onclick="focusStationOnMap('${station.id}')" class="station-card rounded-3xl glass-panel p-5 border ${cardBorder} flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer hover:border-sky-400/50">
        ${isDanger ? '<div class="absolute inset-0 bg-red-600/10 pointer-events-none"></div>' : ''}
        ${isWarning ? '<div class="absolute inset-0 bg-amber-500/5 pointer-events-none"></div>' : ''}

        <div>
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div>
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-mono">
                  <i data-lucide="pin" class="w-3 h-3 text-amber-400"></i>
                  <span>${station.stCode || `ST-${idx + 1}`}</span>
                </span>
                ${distanceBadge}
                <span class="text-[11px] text-slate-500 font-mono">${station.stationCode || ''}</span>
              </div>
              <h3 class="text-base sm:text-lg font-bold text-white tracking-tight leading-snug hover:text-sky-300 transition">
                ${station.name}
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <i data-lucide="map-pin" class="w-3 h-3 text-slate-500"></i>
                ${station.location || 'รอยต่อปทุมธานี - กทม.'}
              </p>
            </div>

            <div class="px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 shrink-0 ${badgeClass}">
              <span>${station.statusText}</span>
            </div>
          </div>

          <!-- Numbers & Gauge -->
          <div class="grid grid-cols-12 gap-4 my-4 items-center">
            <div class="col-span-7 space-y-2">
              <div class="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                <div class="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>ระดับน้ำปัจจุบัน</span>
                  ${station.isStale ? '<span class="text-[9px] text-amber-300 font-bold bg-amber-500/20 px-1 py-0.5 rounded border border-amber-500/30">🕒 (ข้อมูลเดิม)</span>' : ''}
                </div>
                <div class="flex items-baseline gap-1.5 mt-0.5">
                  <span data-station-level="${station.id}" class="text-3xl font-black text-white font-mono-numbers">
                    ${(station.waterLevel !== null && station.waterLevel !== undefined) ? station.waterLevel.toFixed(2) : '--'}
                  </span>
                  <span class="text-xs text-slate-400">ม.รทก.</span>
                </div>
                <div data-station-diff="${station.id}" class="text-[11px] mt-1 font-semibold ${station.diff >= 0 ? 'text-red-400' : (isWarning ? 'text-amber-400' : 'text-emerald-400')}">
                  ${station.diffText || ''}
                </div>
              </div>

              <!-- Limits Grid -->
              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div class="bg-slate-900/50 rounded-lg p-2 border border-slate-800/80">
                  <span class="text-slate-400">ตลิ่ง:</span>
                  <b class="text-slate-200 ml-1 font-mono">${station.bankLevel} ม.</b>
                </div>
                <div class="bg-slate-900/50 rounded-lg p-2 border border-slate-800/80">
                  <span class="text-amber-400">วิกฤติ:</span>
                  <b class="text-amber-300 ml-1 font-mono">${station.criticalLevel} ม.</b>
                </div>
              </div>
            </div>

            <!-- Mini vertical gauge -->
            <div class="col-span-5 flex flex-col items-center">
              <div class="w-full h-36 water-gauge-container border border-slate-700/80 flex flex-col justify-end p-1.5 relative shadow-inner">
                <div class="bank-marker-line" style="bottom: 78%;">
                  <span class="bank-marker-label">ตลิ่ง ${station.bankLevel}m</span>
                </div>
                <div class="critical-marker-line" style="bottom: 60%;">
                  <span class="critical-marker-label">วิกฤติ ${station.criticalLevel}m</span>
                </div>
                <div class="water-wave-fill ${fillGrad}" data-station-fill="${station.id}" data-target-height="${fillPct}" style="height: 0%;">
                  <div class="water-surface-line"></div>
                </div>
                <div data-station-level-sub="${station.id}" class="z-20 relative text-center text-[11px] font-mono font-bold text-white drop-shadow">
                  ${(station.waterLevel !== null && station.waterLevel !== undefined) ? station.waterLevel.toFixed(2) : '--'} ม.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>เวลา: <b class="text-slate-300 font-mono">${station.updatedAt}</b></span>
          <div class="flex items-center gap-2">
            <button onclick="event.stopPropagation(); focusStationOnMap('${station.id}')" class="px-3 py-1.5 min-h-[36px] rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1 font-semibold transition touch-manipulation" title="ซูมไปยังจุดนี้บนแผนที่">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-sky-400"></i>
              <span>ดูบนแผนที่</span>
            </button>
            <a href="https://www.google.com/maps?q=${station.lat},${station.lng}" onclick="event.stopPropagation()" target="_blank" rel="noopener noreferrer" class="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-sky-300 transition touch-manipulation" title="เปิด Google Maps">
              <i data-lucide="external-link" class="w-3.5 h-3.5 text-slate-400"></i>
            </a>
          </div>
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
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
