/**
 * Cloudflare Pages Function - AI Water Situation Analysis & Official News
 * Route: /api/ai-analysis
 * Description: Hydrological assessment of the 9 stations using Google Gemini API (Gemini 1.5 Flash)
 * with intelligent rule-based fallback and Edge CDN caching (30 minutes).
 */

import { assembleWaterSummaryData } from './water-summary.js';

// Station baseline telemetry metadata (fallback in case real telemetry cannot be reached)
const STATIONS_INFO_BASELINE = [
  { stCode: 'ST-1', name: 'คลองหกวา ลำลูกกา คลอง 8', canal: 'คลองหกวา', criticalLevel: 2.41, bankLevel: 2.71, waterLevel: 1.92, trend: 'STABLE' },
  { stCode: 'ST-2', name: 'ปตร.คลองแปด ตอนซอย อบจ.ปทุมธานี 2006', canal: 'คลองหกวา', criticalLevel: 1.80, bankLevel: 2.00, waterLevel: 0.85, trend: 'STABLE' },
  { stCode: 'ST-3', name: 'สถานีสูบน้ำกลางคลองหกวา ตอนถนนนิมิตใหม่', canal: 'คลองหกวา', criticalLevel: 1.80, bankLevel: 2.00, waterLevel: 0.90, trend: 'STABLE' },
  { stCode: 'ST-4', name: 'ปตร.คลองสามวา (ด้านใน)', canal: 'คลองสามวา', criticalLevel: 1.20, bankLevel: 1.50, waterLevel: 0.45, trend: 'STABLE' },
  { stCode: 'ST-5', name: 'ปตร.คลองเจ็ด ตอนซอย อบจ.ปทุมธานี 2006', canal: 'คลองหกวา', criticalLevel: 1.80, bankLevel: 2.00, waterLevel: 0.88, trend: 'STABLE' },
  { stCode: 'ST-6', name: 'ปตร.คลองเก้า ตอนซอย อบจ.ปทุมธานี 2006', canal: 'คลองหกวา', criticalLevel: 1.80, bankLevel: 2.00, waterLevel: 0.82, trend: 'STABLE' },
  { stCode: 'ST-7', name: 'สถานีวัดระดับน้ำคลองพระยาสุเรนทร์ ตอนคลองหกวา', canal: 'คลองพระยาสุเรนทร์', criticalLevel: 1.50, bankLevel: 1.80, waterLevel: 0.65, trend: 'STABLE' },
  { stCode: 'ST-8', name: 'สถานีสูบน้ำคลองพระยาสุเรนทร์ ตอนวัด บึงทองหลาง', canal: 'คลองพระยาสุเรนทร์', criticalLevel: 1.30, bankLevel: 1.60, waterLevel: 0.42, trend: 'STABLE' },
  { stCode: 'ST-9', name: 'ประตูระบายน้ำคลองสามวา (สองฝั่ง)', canal: 'คลองสามวา', criticalLevel: 1.20, bankLevel: 1.50, waterLevel: 0.45, outsideLevel: 0.78, gateOpening: 0.43, trend: 'STABLE' }
];

/**
 * Intelligent Rule-Based Hydrological Fallback Engine
 * Generates accurate hydrological analysis without requiring external API calls.
 * Ensures the system never crashes with 500 when Gemini API key is missing or quota exceeded.
 */
function generateGracefulHydrologicalFallback(stations = STATIONS_INFO_BASELINE) {
  let criticalCount = 0;
  let overflowCount = 0;
  let highestRatio = 0;
  let criticalStation = null;
  const overflowStations = [];
  const criticalStations = [];

  for (const st of stations) {
    const lvl = st.waterLevel !== null && st.waterLevel !== undefined ? Number(st.waterLevel) : null;
    const bank = Number(st.bankLevel) || 2.0;
    const crit = Number(st.criticalLevel) || 1.8;

    if (lvl !== null && !isNaN(lvl)) {
      const ratio = lvl / bank;
      if (ratio > highestRatio) {
        highestRatio = ratio;
        criticalStation = st;
      }
      if (lvl >= bank) {
        overflowCount++;
        overflowStations.push(st.stCode || st.name);
      } else if (lvl >= crit) {
        criticalCount++;
        criticalStations.push(st.stCode || st.name);
      }
    }
  }

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

  return {
    risk_level: riskLevel,
    headline,
    analysis,
    trend_6h: trend6h,
    action_advice: actionAdvice,
    official_context: officialContext,
    // Backward-compatibility aliases
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

export async function onRequest(context) {
  const { request, env } = context;
  const apiKey = env?.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : null);

  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // 1. Cloudflare Edge Cache API: 30 minutes (1800s)
  const cacheUrl = new URL(request.url);
  const cacheKey = new Request(cacheUrl.toString(), request);
  let cache = null;
  try {
    cache = caches.default;
  } catch (e) {
    // Edge cache unavailable (local or non-worker runtime)
  }

  // If client did not explicitly request fresh data (e.g. via cache bust query ?t=)
  const isBustCache = cacheUrl.searchParams.has('t') || cacheUrl.searchParams.has('force');
  if (cache && !isBustCache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (e) {
      // cache match failed, proceed to generate
    }
  }

  // 2. Collect Live Telemetry Context across all 9 stations
  let stations = STATIONS_INFO_BASELINE;
  try {
    const summaryData = await assembleWaterSummaryData();
    if (summaryData && Array.isArray(summaryData.stations) && summaryData.stations.length > 0) {
      stations = summaryData.stations;
    }
  } catch (err) {
    console.warn('[AI Analysis] Could not assemble live telemetry, using baseline:', err.message);
  }

  // Summarize key indicators for the AI prompt
  const criticalOrOverflow = stations.filter(s => {
    const lvl = Number(s.waterLevel);
    const crit = Number(s.criticalLevel);
    const bank = Number(s.bankLevel);
    return !isNaN(lvl) && ((crit && lvl >= crit) || (bank && lvl >= bank));
  });

  const staleStations = stations.filter(s => s.isStale);

  const telemetryContext = stations.map(s => ({
    code: s.stCode,
    name: s.name,
    canal: s.canal,
    water_level_m: s.waterLevel !== null && s.waterLevel !== undefined ? Number(s.waterLevel) : null,
    warning_level_m: Number(s.warningLevel) || null,
    critical_level_m: Number(s.criticalLevel) || null,
    bank_level_m: Number(s.bankLevel) || null,
    trend: s.trend || 'STABLE',
    is_stale: Boolean(s.isStale),
    is_warning: Boolean(s.isWarning),
    is_overflow: Boolean(s.isOverflow)
  }));

  let aiResult = null;

  // 3. Call Google Gemini API if key is configured
  if (apiKey) {
    try {
      const promptText = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมชลประทานและอุทกวิทยา วิเคราะห์สถานการณ์น้ำท่วมเขตคลองสามวาและพื้นที่ใกล้เคียง จากข้อมูลโทรมาตรล่าสุด:
${JSON.stringify({
  stations_telemetry: telemetryContext,
  critical_or_overflow_count: criticalOrOverflow.length,
  critical_or_overflow_stations: criticalOrOverflow.map(s => s.stCode + ' ' + s.name),
  stale_count: staleStations.length,
  stale_stations: staleStations.map(s => s.stCode),
  junction_context: 'แนวคลองหกวาตอนบน (ST-1, ST-2, ST-3, ST-5, ST-6) เชื่อมต่อเข้าคลองพระยาสุเรนทร์ (ST-7, ST-8) และระบายออกผ่าน ปตร.คลองสามวา (ST-4, ST-9)'
}, null, 2)}

วิเคราะห์และตอบกลับในรูปแบบ JSON ตามโครงสร้างนี้เท่านั้น:
{
  "risk_level": "normal" | "warning" | "danger",
  "headline": "หัวข้อสรุปสั้นกระชับ ไม่เกิน 15 คำ",
  "analysis": "บทวิเคราะห์สรุปแนวโน้มน้ำและการไหลในแนวคลองหกวา/พระยาสุเรนทร์ 2-3 ประโยค",
  "trend_6h": "แนวโน้ม 6-12 ชม. ข้างหน้า (เพิ่มขึ้น / ทรงตัว / ลดลง)",
  "action_advice": "คำแนะนำเชิงรุกสำหรับประชาชนในพื้นที่ (เช่น ยกของขึ้นที่สูง, ติดตามข่าวสาร)",
  "official_context": "บริบทประกาศจาก สนน.กทม. หรือ กรมชลประทานที่เกี่ยวข้อง"
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 800,
            response_mime_type: 'application/json',
            responseMimeType: 'application/json'
          }
        })
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          let cleaned = candidateText.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          }
          const parsed = JSON.parse(cleaned);

          if (parsed && (parsed.headline || parsed.analysis)) {
            // Normalize risk_level strictly to 'normal' | 'warning' | 'danger'
            let risk = 'normal';
            const rawRisk = String(parsed.risk_level || parsed.riskLevel || '').toLowerCase();
            if (rawRisk.includes('danger') || rawRisk.includes('วิกฤติ') || rawRisk.includes('emergency')) {
              risk = 'danger';
            } else if (rawRisk.includes('warn') || rawRisk.includes('เฝ้าระวัง') || rawRisk.includes('เสี่ยง')) {
              risk = 'warning';
            }

            aiResult = {
              risk_level: risk,
              headline: parsed.headline || 'สรุปสถานการณ์น้ำเขตคลองสามวาและแนวคลองหกวา',
              analysis: parsed.analysis || '',
              trend_6h: parsed.trend_6h || 'ทรงตัวในเกณฑ์ปกติ',
              action_advice: parsed.action_advice || 'ติดตามข้อมูลข่าวสารอย่างต่อเนื่อง',
              official_context: parsed.official_context || 'สนน.กทม. และกรมชลประทานร่วมบริหารจัดการน้ำ',
              // Aliases for backward compatibility
              riskLevel: risk === 'danger' ? 'วิกฤติ' : (risk === 'warning' ? 'เฝ้าระวัง' : 'ปกติ'),
              riskColor: risk === 'danger' ? 'red' : (risk === 'warning' ? 'amber' : 'emerald'),
              summary: parsed.analysis || '',
              trendPrediction: parsed.trend_6h || '',
              sourceNews: parsed.official_context || '',
              advisory: parsed.action_advice || '',
              source: 'gemini-1.5-flash',
              generatedAt: new Date().toISOString()
            };
          }
        }
      } else {
        const errText = await geminiRes.text();
        console.warn(`[AI Analysis] Gemini API HTTP ${geminiRes.status}:`, errText);
      }
    } catch (apiErr) {
      console.warn('[AI Analysis] Gemini API request failed:', apiErr.message);
    }
  } else {
    console.warn('[AI Analysis] GEMINI_API_KEY environment variable is not configured. Falling back to hydrological evaluation.');
  }

  // 4. Graceful Degradation: If Gemini call fails or no API key, use Expert Hydrological Engine
  if (!aiResult) {
    aiResult = generateGracefulHydrologicalFallback(stations);
  }

  // 5. Construct HTTP Response with 30-Minute Edge Caching Headers
  const response = new Response(JSON.stringify(aiResult), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'X-AI-Source': aiResult.source || 'gemini-1.5-flash'
    }
  });

  // Save to Edge Cache
  if (cache && context.waitUntil && !isBustCache) {
    try {
      context.waitUntil(cache.put(cacheKey, response.clone()));
    } catch (e) {
      // cache put ignore
    }
  }

  return response;
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
