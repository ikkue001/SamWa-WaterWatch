import { onRequestGet as __api_realtime_js_onRequestGet } from "D:\\Flood Emergency\\functions\\api\\realtime.js"
import { onRequestGet as __api_refresh_js_onRequestGet } from "D:\\Flood Emergency\\functions\\api\\refresh.js"
import { onRequestPost as __api_refresh_js_onRequestPost } from "D:\\Flood Emergency\\functions\\api\\refresh.js"
import { onRequestGet as __api_water_summary_js_onRequestGet } from "D:\\Flood Emergency\\functions\\api\\water-summary.js"
import { onRequestOptions as __api_water_summary_js_onRequestOptions } from "D:\\Flood Emergency\\functions\\api\\water-summary.js"
import { onRequest as __api_realtime_js_onRequest } from "D:\\Flood Emergency\\functions\\api\\realtime.js"
import { onRequest as __api_refresh_js_onRequest } from "D:\\Flood Emergency\\functions\\api\\refresh.js"
import { onRequest as __api_water_summary_js_onRequest } from "D:\\Flood Emergency\\functions\\api\\water-summary.js"

export const routes = [
    {
      routePath: "/api/realtime",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_realtime_js_onRequestGet],
    },
  {
      routePath: "/api/refresh",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_refresh_js_onRequestGet],
    },
  {
      routePath: "/api/refresh",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_refresh_js_onRequestPost],
    },
  {
      routePath: "/api/water-summary",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_water_summary_js_onRequestGet],
    },
  {
      routePath: "/api/water-summary",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_water_summary_js_onRequestOptions],
    },
  {
      routePath: "/api/realtime",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_realtime_js_onRequest],
    },
  {
      routePath: "/api/refresh",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_refresh_js_onRequest],
    },
  {
      routePath: "/api/water-summary",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_water_summary_js_onRequest],
    },
  ]