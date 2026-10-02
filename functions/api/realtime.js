/**
 * Cloudflare Pages Function: /api/realtime
 * Provides fallback SSE or JSON response for edge runtime
 */
import { onRequest as handleWaterSummary } from './water-summary.js';

export async function onRequest(context) {
  // On serverless edge without persistent state, return fresh data as JSON or SSE event
  const summaryRes = await handleWaterSummary(context);
  const data = await summaryRes.json();

  const sseData = `data: ${JSON.stringify({ ...data, broadcastReason: 'edge_sync', serverTime: new Date().toISOString() })}\n\n`;

  return new Response(sseData, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestGet(context) {
  return onRequest(context);
}
