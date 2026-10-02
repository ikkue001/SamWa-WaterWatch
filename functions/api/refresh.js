/**
 * Cloudflare Pages Function: /api/refresh
 * Handles manual refresh requests by redirecting or serving fresh data
 */
import { onRequest as handleWaterSummary } from './water-summary.js';

export async function onRequest(context) {
  // Directly forward to water-summary handler
  return handleWaterSummary(context);
}

export async function onRequestPost(context) {
  return handleWaterSummary(context);
}

export async function onRequestGet(context) {
  return handleWaterSummary(context);
}
