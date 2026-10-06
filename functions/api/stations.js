/**
 * Cloudflare Pages Function - Route: /api/stations
 * Telemetry endpoint for all 9 stations with strict no-cache headers.
 */
import { assembleWaterSummaryData } from './water-summary.js';

export async function onRequest(context) {
  const { request } = context;

  // CORS preflight handling
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  const data = await assembleWaterSummaryData();

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Edge-Source': 'Cloudflare-Pages-Function'
  };

  return new Response(JSON.stringify(data), { headers });
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
