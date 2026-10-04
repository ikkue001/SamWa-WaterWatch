/**
 * Cloudflare Pages Function - AI Water Situation Analysis & Official News
 * Route: /api/ai-analysis
 * Description: Hydrological assessment of the 9 stations using Google Gemini API (Gemini 3.5 Flash Lite)
 * with strict key validation, explicit error status, and intelligent rule-based fallback.
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
 * Generates accurate hydrological analysis based on real water telemetry.
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
    modelUsed: 'hydrological-expert-system',
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

  const rawKey = env?.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || '';
  const apiKey = String(rawKey).trim();
  const analyzedAt = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });

  // 1. Collect Live Telemetry Context across all 9 stations
  let stations = STATIONS_INFO_BASELINE;
  try {
    const summaryData = await assembleWaterSummaryData();
    if (summaryData && Array.isArray(summaryData.stations) && summaryData.stations.length > 0) {
      stations = summaryData.stations;
    }
  } catch (err) {
    console.warn('[AI Analysis] Telemetry error, using baseline:', err.message);
  }

  // 2. Validate API Key: Missing or does not start with "AIza"
  if (!apiKey || !apiKey.startsWith('AIza')) {
    console.warn('[AI Analysis] GEMINI_API_KEY is missing or invalid (must start with AIza).');
    const fallback = generateGracefulHydrologicalFallback(stations);
    return new Response(JSON.stringify({
      success: false,
      error: "INVALID_OR_MISSING_API_KEY",
      message: "กรุณาใส่ Gemini API Key (ที่ขึ้นต้นด้วย AIza...) ใน Cloudflare Pages",
      modelUsed: "hydrological-expert-system",
      analyzedAt,
      ...fallback
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    });
  }

  // 3. Summarize telemetry context for AI prompt
  const criticalOrOverflow = stations.filter(s => {
    const lvl = Number(s.waterLevel);
    const crit = Number(s.criticalLevel);
    const bank = Number(s.bankLevel);
    return !isNaN(lvl) && ((crit && lvl >= crit) || (bank && lvl >= bank));
  });

  const telemetryContext = stations.map(s => ({
    code: s.stCode,
    name: s.name,
    canal: s.canal,
    water_level_m: s.waterLevel !== null && s.waterLevel !== undefined ? Number(s.waterLevel) : null,
    critical_level_m: Number(s.criticalLevel) || null,
    bank_level_m: Number(s.bankLevel) || null,
    trend: s.trend || 'STABLE'
  }));

  const promptText = `คุณคือผู้เชี่ยวชาญด้านอุทกวิทยา วิเคราะห์ข้อมูลระดับน้ำ 9 สถานีเขตคลองสามวาและแนวเชื่อมต่อคลองหกวา/พระยาสุเรนทร์:
${JSON.stringify({
  stations_telemetry: telemetryContext,
  critical_or_overflow_count: criticalOrOverflow.length,
  critical_or_overflow_stations: criticalOrOverflow.map(s => `${s.stCode} ${s.name}`)
}, null, 2)}
วิเคราะห์ความเสี่ยงและส่งผลลัพธ์เป็น JSON ภาษาไทย (headline, analysis, trend_6h, action_advice) ตามโครงสร้างนี้:
{
  "risk_level": "normal" | "warning" | "danger",
  "headline": "หัวข้อสรุปสั้นกระชับ ไม่เกิน 15 คำ",
  "analysis": "บทวิเคราะห์สรุปแนวโน้มน้ำและการไหล 2-3 ประโยค",
  "trend_6h": "แนวโน้ม 6-12 ชม. ข้างหน้า (เพิ่มขึ้น / ทรงตัว / ลดลง)",
  "action_advice": "คำแนะนำเชิงรุกสำหรับประชาชนในพื้นที่",
  "official_context": "บริบทประกาศจาก สนน.กทม. หรือ กรมชลประทานที่เกี่ยวข้อง"
}`;

  // 4. Request Gemini API (gemini-3.5-flash-lite)
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: promptText
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.warn(`[AI Analysis] Gemini API Error (HTTP ${geminiRes.status}):`, errText);
      const fallback = generateGracefulHydrologicalFallback(stations);
      return new Response(JSON.stringify({
        success: false,
        error: `GEMINI_HTTP_${geminiRes.status}`,
        message: `Gemini API Error (${geminiRes.status}): ${errText.slice(0, 160)}`,
        modelUsed: "hydrological-expert-system",
        analyzedAt,
        ...fallback
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        }
      });
    }

    const geminiData = await geminiRes.json();
    const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Gemini API returned empty candidate text');
    }

    let cleaned = candidateText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    let parsed = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // If plain text was returned instead of JSON
      const lines = cleaned.split('\n').filter(Boolean);
      parsed = {
        headline: lines[0] || 'สรุปสถานการณ์น้ำสดเขตคลองสามวา',
        analysis: lines.slice(0, 2).join(' ') || cleaned,
        action_advice: lines.slice(2).join(' ') || 'ติดตามสถานการณ์และตรวจสอบระบบระบายน้ำรอบที่อยู่อาศัย',
        risk_level: 'normal',
        trend_6h: 'ทรงตัวในเกณฑ์ปกติ'
      };
    }

    // Normalize risk_level strictly to 'normal' | 'warning' | 'danger'
    let risk = 'normal';
    const rawRisk = String(parsed.risk_level || parsed.riskLevel || '').toLowerCase();
    if (rawRisk.includes('danger') || rawRisk.includes('วิกฤติ') || rawRisk.includes('emergency')) {
      risk = 'danger';
    } else if (rawRisk.includes('warn') || rawRisk.includes('เฝ้าระวัง') || rawRisk.includes('เสี่ยง')) {
      risk = 'warning';
    }

    const aiResult = {
      success: true,
      modelUsed: "gemini-3.5-flash-lite",
      source: "gemini-3.5-flash-lite",
      risk_level: risk,
      headline: parsed.headline || 'สรุปสถานการณ์น้ำเขตคลองสามวาและแนวคลองหกวา',
      analysis: parsed.analysis || '',
      trend_6h: parsed.trend_6h || 'ทรงตัวในเกณฑ์ปกติ',
      action_advice: parsed.action_advice || 'ติดตามข้อมูลข่าวสารอย่างต่อเนื่อง',
      official_context: parsed.official_context || 'สนน.กทม. และกรมชลประทานร่วมบริหารจัดการน้ำ',
      analyzedAt,
      // Aliases for backward compatibility
      riskLevel: risk === 'danger' ? 'วิกฤติ' : (risk === 'warning' ? 'เฝ้าระวัง' : 'ปกติ'),
      riskColor: risk === 'danger' ? 'red' : (risk === 'warning' ? 'amber' : 'emerald'),
      summary: parsed.analysis || '',
      trendPrediction: parsed.trend_6h || '',
      sourceNews: parsed.official_context || '',
      advisory: parsed.action_advice || '',
      generatedAt: new Date().toISOString()
    };

    return new Response(JSON.stringify(aiResult), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'X-AI-Source': 'gemini-3.5-flash-lite'
      }
    });

  } catch (apiErr) {
    console.warn('[AI Analysis] Gemini execution error:', apiErr.message);
    const fallback = generateGracefulHydrologicalFallback(stations);
    return new Response(JSON.stringify({
      success: false,
      error: 'GEMINI_CALL_FAILED',
      message: `เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini API: ${apiErr.message}`,
      modelUsed: "hydrological-expert-system",
      analyzedAt,
      ...fallback
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    });
  }
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
