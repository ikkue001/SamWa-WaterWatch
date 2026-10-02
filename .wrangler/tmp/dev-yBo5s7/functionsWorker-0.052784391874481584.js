var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir4, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env3) {
    return 1;
  }
  hasColors(count4, env3) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process2 extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process2.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd3) {
    this.#cwd = cwd3;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// .wrangler/tmp/pages-bBWN5J/functionsWorker-0.052784391874481584.mjs
import { Writable as Writable2 } from "node:stream";
import { EventEmitter as EventEmitter2 } from "node:events";
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
// @__NO_SIDE_EFFECTS__
function createNotImplementedError2(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError2, "createNotImplementedError");
__name2(createNotImplementedError2, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented2(name) {
  const fn = /* @__PURE__ */ __name2(() => {
    throw /* @__PURE__ */ createNotImplementedError2(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented2, "notImplemented");
__name2(notImplemented2, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass2(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass2, "notImplementedClass");
__name2(notImplementedClass2, "notImplementedClass");
var _timeOrigin2 = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow2 = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin2;
var nodeTiming2 = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry2 = class {
  static {
    __name(this, "PerformanceEntry");
  }
  static {
    __name2(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow2();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow2() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark3 = class PerformanceMark22 extends PerformanceEntry2 {
  static {
    __name(this, "PerformanceMark2");
  }
  static {
    __name2(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure2 = class extends PerformanceEntry2 {
  static {
    __name(this, "PerformanceMeasure");
  }
  static {
    __name2(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming2 = class extends PerformanceEntry2 {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  static {
    __name2(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList2 = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  static {
    __name2(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance2 = class {
  static {
    __name(this, "Performance");
  }
  static {
    __name2(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin2;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw /* @__PURE__ */ createNotImplementedError2("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming2;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming2("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin2) {
      return _performanceNow2();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark3(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure2(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw /* @__PURE__ */ createNotImplementedError2("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw /* @__PURE__ */ createNotImplementedError2("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw /* @__PURE__ */ createNotImplementedError2("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver2 = class {
  static {
    __name(this, "PerformanceObserver");
  }
  static {
    __name2(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw /* @__PURE__ */ createNotImplementedError2("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw /* @__PURE__ */ createNotImplementedError2("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance2 = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance2();
if (!("__unenv__" in performance2)) {
  const proto = Performance2.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance2)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance2, key, desc);
      }
    }
  }
}
globalThis.performance = performance2;
globalThis.Performance = Performance2;
globalThis.PerformanceEntry = PerformanceEntry2;
globalThis.PerformanceMark = PerformanceMark3;
globalThis.PerformanceMeasure = PerformanceMeasure2;
globalThis.PerformanceObserver = PerformanceObserver2;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList2;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming2;
var noop_default2 = Object.assign(() => {
}, { __unenv__: true });
var _console2 = globalThis.console;
var _ignoreErrors2 = true;
var _stderr2 = new Writable2();
var _stdout2 = new Writable2();
var log3 = _console2?.log ?? noop_default2;
var info3 = _console2?.info ?? log3;
var trace3 = _console2?.trace ?? info3;
var debug3 = _console2?.debug ?? log3;
var table3 = _console2?.table ?? log3;
var error3 = _console2?.error ?? log3;
var warn3 = _console2?.warn ?? error3;
var createTask3 = _console2?.createTask ?? /* @__PURE__ */ notImplemented2("console.createTask");
var clear3 = _console2?.clear ?? noop_default2;
var count3 = _console2?.count ?? noop_default2;
var countReset3 = _console2?.countReset ?? noop_default2;
var dir3 = _console2?.dir ?? noop_default2;
var dirxml3 = _console2?.dirxml ?? noop_default2;
var group3 = _console2?.group ?? noop_default2;
var groupEnd3 = _console2?.groupEnd ?? noop_default2;
var groupCollapsed3 = _console2?.groupCollapsed ?? noop_default2;
var profile3 = _console2?.profile ?? noop_default2;
var profileEnd3 = _console2?.profileEnd ?? noop_default2;
var time3 = _console2?.time ?? noop_default2;
var timeEnd3 = _console2?.timeEnd ?? noop_default2;
var timeLog3 = _console2?.timeLog ?? noop_default2;
var timeStamp3 = _console2?.timeStamp ?? noop_default2;
var Console2 = _console2?.Console ?? /* @__PURE__ */ notImplementedClass2("console.Console");
var _times2 = /* @__PURE__ */ new Map();
var _stdoutErrorHandler2 = noop_default2;
var _stderrErrorHandler2 = noop_default2;
var workerdConsole2 = globalThis["console"];
var {
  assert: assert3,
  clear: clear22,
  // @ts-expect-error undocumented public API
  context: context2,
  count: count22,
  countReset: countReset22,
  // @ts-expect-error undocumented public API
  createTask: createTask22,
  debug: debug22,
  dir: dir22,
  dirxml: dirxml22,
  error: error22,
  group: group22,
  groupCollapsed: groupCollapsed22,
  groupEnd: groupEnd22,
  info: info22,
  log: log22,
  profile: profile22,
  profileEnd: profileEnd22,
  table: table22,
  time: time22,
  timeEnd: timeEnd22,
  timeLog: timeLog22,
  timeStamp: timeStamp22,
  trace: trace22,
  warn: warn22
} = workerdConsole2;
Object.assign(workerdConsole2, {
  Console: Console2,
  _ignoreErrors: _ignoreErrors2,
  _stderr: _stderr2,
  _stderrErrorHandler: _stderrErrorHandler2,
  _stdout: _stdout2,
  _stdoutErrorHandler: _stdoutErrorHandler2,
  _times: _times2
});
var console_default2 = workerdConsole2;
globalThis.console = console_default2;
var hrtime4 = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function hrtime22(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime2"), "hrtime"), { bigint: /* @__PURE__ */ __name2(/* @__PURE__ */ __name(function bigint2() {
  return BigInt(Date.now() * 1e6);
}, "bigint"), "bigint") });
var ReadStream2 = class {
  static {
    __name(this, "ReadStream");
  }
  static {
    __name2(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};
var WriteStream2 = class {
  static {
    __name(this, "WriteStream");
  }
  static {
    __name2(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir32, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env22) {
    return 1;
  }
  hasColors(count32, env22) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};
var NODE_VERSION2 = "22.14.0";
var Process2 = class _Process extends EventEmitter2 {
  static {
    __name(this, "_Process");
  }
  static {
    __name2(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter2.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream2(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream2(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream2(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd22) {
    this.#cwd = cwd22;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION2}`;
  }
  get versions() {
    return { node: NODE_VERSION2 };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw /* @__PURE__ */ createNotImplementedError2("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw /* @__PURE__ */ createNotImplementedError2("process.getActiveResourcesInfo");
  }
  exit() {
    throw /* @__PURE__ */ createNotImplementedError2("process.exit");
  }
  reallyExit() {
    throw /* @__PURE__ */ createNotImplementedError2("process.reallyExit");
  }
  kill() {
    throw /* @__PURE__ */ createNotImplementedError2("process.kill");
  }
  abort() {
    throw /* @__PURE__ */ createNotImplementedError2("process.abort");
  }
  dlopen() {
    throw /* @__PURE__ */ createNotImplementedError2("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw /* @__PURE__ */ createNotImplementedError2("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw /* @__PURE__ */ createNotImplementedError2("process.loadEnvFile");
  }
  disconnect() {
    throw /* @__PURE__ */ createNotImplementedError2("process.disconnect");
  }
  cpuUsage() {
    throw /* @__PURE__ */ createNotImplementedError2("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw /* @__PURE__ */ createNotImplementedError2("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw /* @__PURE__ */ createNotImplementedError2("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw /* @__PURE__ */ createNotImplementedError2("process.initgroups");
  }
  openStdin() {
    throw /* @__PURE__ */ createNotImplementedError2("process.openStdin");
  }
  assert() {
    throw /* @__PURE__ */ createNotImplementedError2("process.assert");
  }
  binding() {
    throw /* @__PURE__ */ createNotImplementedError2("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented2("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented2("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented2("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented2("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented2("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented2("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name2(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};
var globalProcess2 = globalThis["process"];
var getBuiltinModule2 = globalProcess2.getBuiltinModule;
var workerdProcess2 = getBuiltinModule2("node:process");
var unenvProcess2 = new Process2({
  env: globalProcess2.env,
  hrtime: hrtime4,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess2.nextTick
});
var { exit: exit2, features: features2, platform: platform2 } = workerdProcess2;
var {
  _channel: _channel2,
  _debugEnd: _debugEnd2,
  _debugProcess: _debugProcess2,
  _disconnect: _disconnect2,
  _events: _events2,
  _eventsCount: _eventsCount2,
  _exiting: _exiting2,
  _fatalException: _fatalException2,
  _getActiveHandles: _getActiveHandles2,
  _getActiveRequests: _getActiveRequests2,
  _handleQueue: _handleQueue2,
  _kill: _kill2,
  _linkedBinding: _linkedBinding2,
  _maxListeners: _maxListeners2,
  _pendingMessage: _pendingMessage2,
  _preload_modules: _preload_modules2,
  _rawDebug: _rawDebug2,
  _send: _send2,
  _startProfilerIdleNotifier: _startProfilerIdleNotifier2,
  _stopProfilerIdleNotifier: _stopProfilerIdleNotifier2,
  _tickCallback: _tickCallback2,
  abort: abort2,
  addListener: addListener2,
  allowedNodeEnvironmentFlags: allowedNodeEnvironmentFlags2,
  arch: arch2,
  argv: argv2,
  argv0: argv02,
  assert: assert22,
  availableMemory: availableMemory2,
  binding: binding2,
  channel: channel2,
  chdir: chdir2,
  config: config2,
  connected: connected2,
  constrainedMemory: constrainedMemory2,
  cpuUsage: cpuUsage2,
  cwd: cwd2,
  debugPort: debugPort2,
  disconnect: disconnect2,
  dlopen: dlopen2,
  domain: domain2,
  emit: emit2,
  emitWarning: emitWarning2,
  env: env2,
  eventNames: eventNames2,
  execArgv: execArgv2,
  execPath: execPath2,
  exitCode: exitCode2,
  finalization: finalization2,
  getActiveResourcesInfo: getActiveResourcesInfo2,
  getegid: getegid2,
  geteuid: geteuid2,
  getgid: getgid2,
  getgroups: getgroups2,
  getMaxListeners: getMaxListeners2,
  getuid: getuid2,
  hasUncaughtExceptionCaptureCallback: hasUncaughtExceptionCaptureCallback2,
  hrtime: hrtime32,
  initgroups: initgroups2,
  kill: kill2,
  listenerCount: listenerCount2,
  listeners: listeners2,
  loadEnvFile: loadEnvFile2,
  mainModule: mainModule2,
  memoryUsage: memoryUsage2,
  moduleLoadList: moduleLoadList2,
  nextTick: nextTick2,
  off: off2,
  on: on2,
  once: once2,
  openStdin: openStdin2,
  permission: permission2,
  pid: pid2,
  ppid: ppid2,
  prependListener: prependListener2,
  prependOnceListener: prependOnceListener2,
  rawListeners: rawListeners2,
  reallyExit: reallyExit2,
  ref: ref2,
  release: release2,
  removeAllListeners: removeAllListeners2,
  removeListener: removeListener2,
  report: report2,
  resourceUsage: resourceUsage2,
  send: send2,
  setegid: setegid2,
  seteuid: seteuid2,
  setgid: setgid2,
  setgroups: setgroups2,
  setMaxListeners: setMaxListeners2,
  setSourceMapsEnabled: setSourceMapsEnabled2,
  setuid: setuid2,
  setUncaughtExceptionCaptureCallback: setUncaughtExceptionCaptureCallback2,
  sourceMapsEnabled: sourceMapsEnabled2,
  stderr: stderr2,
  stdin: stdin2,
  stdout: stdout2,
  throwDeprecation: throwDeprecation2,
  title: title2,
  traceDeprecation: traceDeprecation2,
  umask: umask2,
  unref: unref2,
  uptime: uptime2,
  version: version2,
  versions: versions2
} = unenvProcess2;
var _process2 = {
  abort: abort2,
  addListener: addListener2,
  allowedNodeEnvironmentFlags: allowedNodeEnvironmentFlags2,
  hasUncaughtExceptionCaptureCallback: hasUncaughtExceptionCaptureCallback2,
  setUncaughtExceptionCaptureCallback: setUncaughtExceptionCaptureCallback2,
  loadEnvFile: loadEnvFile2,
  sourceMapsEnabled: sourceMapsEnabled2,
  arch: arch2,
  argv: argv2,
  argv0: argv02,
  chdir: chdir2,
  config: config2,
  connected: connected2,
  constrainedMemory: constrainedMemory2,
  availableMemory: availableMemory2,
  cpuUsage: cpuUsage2,
  cwd: cwd2,
  debugPort: debugPort2,
  dlopen: dlopen2,
  disconnect: disconnect2,
  emit: emit2,
  emitWarning: emitWarning2,
  env: env2,
  eventNames: eventNames2,
  execArgv: execArgv2,
  execPath: execPath2,
  exit: exit2,
  finalization: finalization2,
  features: features2,
  getBuiltinModule: getBuiltinModule2,
  getActiveResourcesInfo: getActiveResourcesInfo2,
  getMaxListeners: getMaxListeners2,
  hrtime: hrtime32,
  kill: kill2,
  listeners: listeners2,
  listenerCount: listenerCount2,
  memoryUsage: memoryUsage2,
  nextTick: nextTick2,
  on: on2,
  off: off2,
  once: once2,
  pid: pid2,
  platform: platform2,
  ppid: ppid2,
  prependListener: prependListener2,
  prependOnceListener: prependOnceListener2,
  rawListeners: rawListeners2,
  release: release2,
  removeAllListeners: removeAllListeners2,
  removeListener: removeListener2,
  report: report2,
  resourceUsage: resourceUsage2,
  setMaxListeners: setMaxListeners2,
  setSourceMapsEnabled: setSourceMapsEnabled2,
  stderr: stderr2,
  stdin: stdin2,
  stdout: stdout2,
  title: title2,
  throwDeprecation: throwDeprecation2,
  traceDeprecation: traceDeprecation2,
  umask: umask2,
  uptime: uptime2,
  version: version2,
  versions: versions2,
  // @ts-expect-error old API
  domain: domain2,
  initgroups: initgroups2,
  moduleLoadList: moduleLoadList2,
  reallyExit: reallyExit2,
  openStdin: openStdin2,
  assert: assert22,
  binding: binding2,
  send: send2,
  exitCode: exitCode2,
  channel: channel2,
  getegid: getegid2,
  geteuid: geteuid2,
  getgid: getgid2,
  getgroups: getgroups2,
  getuid: getuid2,
  setegid: setegid2,
  seteuid: seteuid2,
  setgid: setgid2,
  setgroups: setgroups2,
  setuid: setuid2,
  permission: permission2,
  mainModule: mainModule2,
  _events: _events2,
  _eventsCount: _eventsCount2,
  _exiting: _exiting2,
  _maxListeners: _maxListeners2,
  _debugEnd: _debugEnd2,
  _debugProcess: _debugProcess2,
  _fatalException: _fatalException2,
  _getActiveHandles: _getActiveHandles2,
  _getActiveRequests: _getActiveRequests2,
  _kill: _kill2,
  _preload_modules: _preload_modules2,
  _rawDebug: _rawDebug2,
  _startProfilerIdleNotifier: _startProfilerIdleNotifier2,
  _stopProfilerIdleNotifier: _stopProfilerIdleNotifier2,
  _tickCallback: _tickCallback2,
  _disconnect: _disconnect2,
  _handleQueue: _handleQueue2,
  _pendingMessage: _pendingMessage2,
  _channel: _channel2,
  _send: _send2,
  _linkedBinding: _linkedBinding2
};
var process_default2 = _process2;
globalThis.process = process_default2;
var STATIONS_MASTER_CONFIG = [
  {
    id: "thaiwater_k8",
    stCode: "ST-1",
    stationId: 37,
    stationCode: "ST-1",
    name: "\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32 \u0E25\u0E33\u0E25\u0E39\u0E01\u0E01\u0E32 \u0E04\u0E25\u0E2D\u0E07 8",
    shortName: "\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32 \u0E25\u0E33\u0E25\u0E39\u0E01\u0E01\u0E32 \u0E04\u0E25\u0E2D\u0E07 8",
    source: "ThaiWater",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32",
    canalGroupId: "khlong-hokwa",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32 - \u0E04\u0E25\u0E2D\u0E07\u0E41\u0E1B\u0E14",
    flowOrder: 1,
    isPinned: true,
    lat: 13.9416,
    lng: 100.77499,
    url: "https://pathumthani.thaiwater.net/wl#close",
    sourceUrl: "https://pathumthani.thaiwater.net/wl#close",
    defaultBank: 2.71,
    defaultWarning: 2.01,
    defaultCritical: 2.41
  },
  {
    id: "bma_wf_k0801",
    stCode: "ST-2",
    uuid: "69ae363d-80d0-47c0-97c4-14731bb235e1",
    stationId: "69ae363d-80d0-47c0-97c4-14731bb235e1",
    stationCode: "WL.K08.01",
    name: "\u0E1B\u0E15\u0E23.\u0E04\u0E25\u0E2D\u0E07\u0E41\u0E1B\u0E14 \u0E15\u0E2D\u0E19\u0E0B\u0E2D\u0E22 \u0E2D\u0E1A\u0E08.\u0E1B\u0E17\u0E38\u0E21\u0E18\u0E32\u0E19\u0E35 2006",
    shortName: "\u0E1B\u0E15\u0E23.\u0E04\u0E25\u0E2D\u0E07\u0E41\u0E1B\u0E14 \u0E15\u0E2D\u0E19\u0E0B\u0E2D\u0E22 \u0E2D\u0E1A\u0E08.\u0E1B\u0E17\u0E38\u0E21\u0E18\u0E32\u0E19\u0E35 2006",
    source: "BMA Waterflow",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32",
    canalGroupId: "khlong-hokwa",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32 - \u0E04\u0E25\u0E2D\u0E07\u0E41\u0E1B\u0E14",
    flowOrder: 2,
    isPinned: true,
    lat: 13.9378,
    lng: 100.7706,
    url: "https://bmawaterflow.bangkok.go.th/map",
    sourceUrl: "https://bmawaterflow.bangkok.go.th/map",
    defaultBank: 2,
    defaultWarning: 1.4,
    defaultCritical: 1.8
  },
  {
    id: "bma_wf_khw01",
    stCode: "ST-3",
    uuid: "6bceb086-0008-4910-bda8-d8e618ab3c5d",
    stationId: "6bceb086-0008-4910-bda8-d8e618ab3c5d",
    stationCode: "WL.KHW.01",
    name: "\u0E2A\u0E16\u0E32\u0E19\u0E35\u0E2A\u0E39\u0E1A\u0E19\u0E49\u0E33\u0E01\u0E25\u0E32\u0E07\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32 \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E19\u0E34\u0E21\u0E34\u0E15\u0E43\u0E2B\u0E21\u0E48",
    shortName: "\u0E2A\u0E16\u0E32\u0E19\u0E35\u0E2A\u0E39\u0E1A\u0E19\u0E49\u0E33\u0E01\u0E25\u0E32\u0E07\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32 \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E19\u0E34\u0E21\u0E34\u0E15\u0E43\u0E2B\u0E21\u0E48",
    source: "BMA Waterflow",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32",
    canalGroupId: "khlong-hokwa",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32 - \u0E04\u0E25\u0E2D\u0E07\u0E41\u0E1B\u0E14",
    flowOrder: 3,
    isPinned: true,
    lat: 13.93354,
    lng: 100.7506,
    url: "https://bmawaterflow.bangkok.go.th/map",
    sourceUrl: "https://bmawaterflow.bangkok.go.th/map",
    defaultBank: 2.3,
    defaultWarning: 1.8,
    defaultCritical: 2
  },
  {
    id: "bma_wf_swa02",
    stCode: "ST-4",
    uuid: "05b29a52-712d-4b90-a4ff-b2c2eb9817ff",
    stationId: "05b29a52-712d-4b90-a4ff-b2c2eb9817ff",
    stationCode: "WL.SWA.02",
    name: "\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32 \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E40\u0E17\u0E28\u0E1A\u0E32\u0E25\u0E25\u0E33\u0E25\u0E39\u0E01\u0E01\u0E32 1",
    shortName: "\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32 \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E40\u0E17\u0E28\u0E1A\u0E32\u0E25\u0E25\u0E33\u0E25\u0E39\u0E01\u0E01\u0E32 1",
    source: "BMA Waterflow",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32",
    canalGroupId: "khlong-sam-wa",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32",
    flowOrder: 1,
    isPinned: true,
    lat: 13.92929,
    lng: 100.7259,
    url: "https://bmawaterflow.bangkok.go.th/map",
    sourceUrl: "https://bmawaterflow.bangkok.go.th/map",
    defaultBank: 2,
    defaultWarning: 1.4,
    defaultCritical: 1.8
  },
  {
    id: "bma_weather_126",
    stCode: "ST-5",
    stationId: 126,
    stationCode: "WL.PSR.02",
    name: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E2B\u0E19\u0E2D\u0E07\u0E23\u0E30\u0E41\u0E2B\u0E07",
    shortName: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E2B\u0E19\u0E2D\u0E07\u0E23\u0E30\u0E41\u0E2B\u0E07",
    source: "BMA Weather",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    canalGroupId: "khlong-phraya-suren",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    flowOrder: 1,
    isPinned: false,
    lat: 13.90121,
    lng: 100.69049,
    url: "https://weather.bangkok.go.th/water/StationDetail?id=126",
    sourceUrl: "https://weather.bangkok.go.th/water/StationDetail?id=126",
    defaultBank: 1.6,
    defaultWarning: 1,
    defaultCritical: 1.2
  },
  {
    id: "bma_weather_125",
    stCode: "ST-6",
    stationId: 125,
    stationCode: "WL.PSR.03",
    name: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E08\u0E15\u0E38\u0E42\u0E0A\u0E15\u0E34",
    shortName: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E16\u0E19\u0E19\u0E08\u0E15\u0E38\u0E42\u0E0A\u0E15\u0E34",
    source: "BMA Weather",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    canalGroupId: "khlong-phraya-suren",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    flowOrder: 2,
    isPinned: false,
    lat: 13.87621,
    lng: 100.68614,
    url: "https://weather.bangkok.go.th/water/StationDetail?id=125",
    sourceUrl: "https://weather.bangkok.go.th/water/StationDetail?id=125",
    defaultBank: 1.5,
    defaultWarning: 1,
    defaultCritical: 1.2
  },
  {
    id: "bma_weather_124",
    stCode: "ST-7",
    stationId: 124,
    stationCode: "WL.PSR.04",
    name: "\u0E1B\u0E15\u0E23.\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E04\u0E39\u0E49\u0E1A\u0E2D\u0E19",
    shortName: "\u0E1B\u0E15\u0E23.\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E04\u0E39\u0E49\u0E1A\u0E2D\u0E19",
    source: "BMA Weather",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    canalGroupId: "khlong-phraya-suren",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    flowOrder: 3,
    isPinned: false,
    lat: 13.85077,
    lng: 100.67829,
    url: "https://weather.bangkok.go.th/water/StationDetail?id=124",
    sourceUrl: "https://weather.bangkok.go.th/water/StationDetail?id=124",
    defaultBank: 1.3,
    defaultWarning: 0.7,
    defaultCritical: 0.8
  },
  {
    id: "bma_weather_127",
    stCode: "ST-8",
    stationId: 127,
    stationCode: "WL.PSR.05",
    name: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E1B\u0E31\u0E0D\u0E0D\u0E32\u0E2D\u0E34\u0E19\u0E17\u0E23\u0E32",
    shortName: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C \u0E15\u0E2D\u0E19\u0E1B\u0E31\u0E0D\u0E0D\u0E32\u0E2D\u0E34\u0E19\u0E17\u0E23\u0E32",
    source: "BMA Weather",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    canalGroupId: "khlong-phraya-suren",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E1E\u0E23\u0E30\u0E22\u0E32\u0E2A\u0E38\u0E40\u0E23\u0E19\u0E17\u0E23\u0E4C",
    flowOrder: 4,
    isPinned: false,
    lat: 13.83698,
    lng: 100.68803,
    url: "https://weather.bangkok.go.th/water/StationDetail?id=127",
    sourceUrl: "https://weather.bangkok.go.th/water/StationDetail?id=127",
    defaultBank: 1.4,
    defaultWarning: 0.8,
    defaultCritical: 1
  },
  {
    id: "bma_weather_21",
    stCode: "ST-9",
    stationId: 21,
    stationCode: "WL.SWA.01",
    name: "\u0E1B\u0E23\u0E30\u0E15\u0E39\u0E23\u0E30\u0E1A\u0E32\u0E22\u0E19\u0E49\u0E33\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32 (\u0E16\u0E19\u0E19\u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E23\u0E48\u0E27\u0E21\u0E43\u0E08)",
    shortName: "\u0E1B\u0E23\u0E30\u0E15\u0E39\u0E23\u0E30\u0E1A\u0E32\u0E22\u0E19\u0E49\u0E33\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32 (\u0E16\u0E19\u0E19\u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E23\u0E48\u0E27\u0E21\u0E43\u0E08)",
    source: "BMA Weather",
    canal: "\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32",
    canalGroupId: "khlong-sam-wa",
    canalGroupName: "\u0E2A\u0E32\u0E22\u0E04\u0E25\u0E2D\u0E07\u0E2A\u0E32\u0E21\u0E27\u0E32",
    flowOrder: 2,
    isPinned: false,
    lat: 13.85956,
    lng: 100.72931,
    url: "https://weather.bangkok.go.th/water/StationDetail?id=21",
    sourceUrl: "https://weather.bangkok.go.th/water/StationDetail?id=21",
    defaultBank: 1.3,
    defaultWarning: 0.7,
    defaultCritical: 0.8
  }
];
var FALLBACK_BASELINES = {
  "thaiwater_k8": { level: 1.67, time: "02/10/2569 20:30" },
  "bma_wf_k0801": { level: 1.8, time: "02/10/2569 20:45" },
  "bma_wf_khw01": { level: 1.87, time: "02/10/2569 20:45" },
  "bma_wf_swa02": { level: 1.46, time: "02/10/2569 20:45" },
  "bma_weather_126": { level: 1.37, time: "02/10/2569 21:00" },
  "bma_weather_125": { level: 1.35, time: "02/10/2569 21:00" },
  "bma_weather_124": { level: 0.97, time: "02/10/2569 21:00" },
  "bma_weather_127": { level: 0.98, time: "02/10/2569 21:00" },
  "bma_weather_21": {
    level: 1.39,
    inside: { label: "\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19", level: 0.93, warning: 0.7, critical: 0.8, bank: 1.3 },
    outside: { label: "\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01", level: 1.39, warning: 1.1, critical: 1.3, bank: 1.7 },
    gateOpening: 0.43,
    time: "02/10/2569 21:00"
  }
};
var COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/json,*/*;q=0.9",
  "Accept-Language": "th,en-US;q=0.9,en;q=0.8"
};
async function fetchThaiwater(cfg) {
  let waterLevel = null;
  let readingTime = null;
  let bankLevel = cfg.defaultBank;
  let isStale = false;
  try {
    const res = await fetch("https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel", {
      headers: { ...COMMON_HEADERS, "Referer": "https://pathumthani.thaiwater.net/" }
    });
    if (res.ok) {
      const json = await res.json();
      const target = (json?.data || []).find((s) => {
        const sid = s.station?.id;
        const oldCode = s.station?.tele_station_oldcode;
        const thName = s.station?.tele_station_name?.th || "";
        return sid === 37 || oldCode === "BKK015" || thName.includes("\u0E04\u0E25\u0E2D\u0E07\u0E2B\u0E01\u0E27\u0E32") && thName.includes("\u0E04\u0E25\u0E2D\u0E078") || thName.includes("\u0E25\u0E33\u0E25\u0E39\u0E01\u0E01\u0E32") && thName.includes("\u0E04\u0E25\u0E2D\u0E078");
      });
      if (target) {
        const raw = parseFloat(target.waterlevel_msl);
        if (!isNaN(raw) && raw > 0) {
          waterLevel = raw;
          readingTime = target.waterlevel_datetime;
        }
        const minB = parseFloat(target.station?.min_bank);
        if (!isNaN(minB) && minB > 0) bankLevel = minB;
      }
    }
  } catch (err) {
  }
  if (waterLevel === null || waterLevel <= 0) {
    waterLevel = FALLBACK_BASELINES[cfg.id].level;
    readingTime = FALLBACK_BASELINES[cfg.id].time;
    isStale = true;
  }
  const warningLevel = parseFloat((bankLevel - 0.7).toFixed(2));
  const criticalLevel = parseFloat((bankLevel - 0.3).toFixed(2));
  const isOverflow = waterLevel >= bankLevel;
  const isWarning = !isOverflow && waterLevel >= criticalLevel;
  let tier = "NORMAL";
  let statusText = "\u0E1B\u0E01\u0E15\u0E34";
  let statusSeverity = "normal";
  if (isOverflow) {
    tier = "EMERGENCY";
    statusText = "\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07!";
    statusSeverity = "danger";
  } else if (isWarning) {
    tier = "WARNING";
    statusText = "\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E20\u0E31\u0E22: \u0E27\u0E34\u0E01\u0E24\u0E15\u0E34";
    statusSeverity = "warning";
  } else if (waterLevel >= warningLevel) {
    statusText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07";
    statusSeverity = "warning";
  }
  const diff = parseFloat((waterLevel - bankLevel).toFixed(2));
  const diffCritical = parseFloat((waterLevel - criticalLevel).toFixed(2));
  let diffText = "";
  if (diff >= 0) {
    diffText = `\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07 +${diff.toFixed(2)} \u0E21.`;
  } else if (diffCritical >= 0) {
    diffText = `+${diffCritical.toFixed(2)} \u0E21. (\u0E40\u0E01\u0E34\u0E19\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34)`;
  } else {
    diffText = `\u0E15\u0E48\u0E33\u0E01\u0E27\u0E48\u0E32\u0E15\u0E25\u0E34\u0E48\u0E07 ${Math.abs(diff).toFixed(2)} \u0E21.`;
  }
  return {
    ...cfg,
    waterLevel,
    bankLevel,
    warningLevel,
    criticalLevel,
    diff,
    diffCritical,
    diffText,
    unit: "\u0E21.\u0E23\u0E17\u0E01.",
    storagePercent: parseFloat((waterLevel / bankLevel * 100).toFixed(1)),
    isOverflow,
    isWarning,
    tier,
    statusText: isStale ? `${statusText} (\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E14\u0E34\u0E21)` : statusText,
    statusSeverity,
    updatedAt: readingTime || (/* @__PURE__ */ new Date()).toISOString(),
    isStale,
    lastValidTime: readingTime,
    lastValidLevel: waterLevel
  };
}
__name(fetchThaiwater, "fetchThaiwater");
__name2(fetchThaiwater, "fetchThaiwater");
async function fetchBmaWaterflow(configs) {
  let token = null;
  try {
    const authRes = await fetch("https://bmawaterflow.bangkok.go.th/API/Authentication/Client", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...COMMON_HEADERS,
        "Origin": "https://bmawaterflow.bangkok.go.th",
        "Referer": "https://bmawaterflow.bangkok.go.th/map"
      },
      body: JSON.stringify({
        clientId: "dds-measure-web",
        clientSecret: "f1d6cf67-946b-4586-934a-6a770d993983"
      })
    });
    if (authRes.ok) {
      const authData = await authRes.json();
      token = authData?.token;
    }
  } catch (err) {
  }
  const results = [];
  for (const cfg of configs) {
    let waterLevel = null;
    let readingTime = null;
    let bankLevel = cfg.defaultBank;
    let isStale = false;
    if (token) {
      try {
        const res = await fetch(`https://bmawaterflow.bangkok.go.th/API/Stations/${cfg.uuid}`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            ...COMMON_HEADERS,
            "Referer": "https://bmawaterflow.bangkok.go.th/map"
          }
        });
        if (res.ok) {
          const data = await res.json();
          const ms = data.measuringStations?.[0];
          const tx = data.transactions?.[0];
          const raw = parseFloat(tx?.water);
          if (!isNaN(raw) && raw > 0) {
            waterLevel = raw;
            readingTime = tx?.siteTime || tx?.serverTime;
          }
          const leftBank = parseFloat(ms?.crossections?.leftBank);
          const rightBank = parseFloat(ms?.crossections?.rightBank);
          if (!isNaN(leftBank) && leftBank > 0) bankLevel = leftBank;
          else if (!isNaN(rightBank) && rightBank > 0) bankLevel = rightBank;
        }
      } catch (err) {
      }
    }
    if (waterLevel === null || waterLevel <= 0) {
      waterLevel = FALLBACK_BASELINES[cfg.id].level;
      readingTime = FALLBACK_BASELINES[cfg.id].time;
      isStale = true;
    }
    const warningLevel = cfg.defaultWarning;
    const criticalLevel = cfg.defaultCritical;
    const isOverflow = waterLevel >= bankLevel;
    const isWarning = !isOverflow && waterLevel >= criticalLevel;
    let tier = "NORMAL";
    let statusText = "\u0E1B\u0E01\u0E15\u0E34";
    let statusSeverity = "normal";
    if (isOverflow) {
      tier = "EMERGENCY";
      statusText = "\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07!";
      statusSeverity = "danger";
    } else if (isWarning) {
      tier = "WARNING";
      statusText = "\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E20\u0E31\u0E22: \u0E27\u0E34\u0E01\u0E24\u0E15\u0E34";
      statusSeverity = "warning";
    } else if (waterLevel >= warningLevel) {
      statusText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07";
      statusSeverity = "warning";
    }
    const diff = parseFloat((waterLevel - bankLevel).toFixed(2));
    const diffCritical = parseFloat((waterLevel - criticalLevel).toFixed(2));
    let diffText = "";
    if (diff >= 0) {
      diffText = `\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07 +${diff.toFixed(2)} \u0E21.`;
    } else if (diffCritical >= 0) {
      diffText = `+${diffCritical.toFixed(2)} \u0E21. (\u0E40\u0E01\u0E34\u0E19\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34)`;
    } else {
      diffText = `\u0E15\u0E48\u0E33\u0E01\u0E27\u0E48\u0E32\u0E15\u0E25\u0E34\u0E48\u0E07 ${Math.abs(diff).toFixed(2)} \u0E21.`;
    }
    results.push({
      ...cfg,
      waterLevel,
      bankLevel,
      warningLevel,
      criticalLevel,
      diff,
      diffCritical,
      diffText,
      unit: "\u0E21.\u0E23\u0E17\u0E01.",
      storagePercent: parseFloat((waterLevel / bankLevel * 100).toFixed(1)),
      isOverflow,
      isWarning,
      tier,
      statusText: isStale ? `${statusText} (\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E14\u0E34\u0E21)` : statusText,
      statusSeverity,
      updatedAt: readingTime || (/* @__PURE__ */ new Date()).toISOString(),
      isStale,
      lastValidTime: readingTime,
      lastValidLevel: waterLevel
    });
  }
  return results;
}
__name(fetchBmaWaterflow, "fetchBmaWaterflow");
__name2(fetchBmaWaterflow, "fetchBmaWaterflow");
async function fetchBmaWeather(configs) {
  const results = [];
  for (const cfg of configs) {
    const isGate = cfg.stationId === 21;
    let html = "";
    try {
      const res = await fetch(`https://weather.bangkok.go.th/water/StationDetail?id=${cfg.stationId}`, {
        headers: { ...COMMON_HEADERS, "Referer": "https://weather.bangkok.go.th/water/" }
      });
      if (res.ok) {
        html = await res.text();
      }
    } catch (err) {
    }
    if (isGate) {
      let extractInputValue = /* @__PURE__ */ __name(function(h, inputId) {
        const m = h.match(new RegExp(`id=["']${inputId}["'][^>]*value=["']([^"']*)["']`, "i")) || h.match(new RegExp(`value=["']([^"']*)["'][^>]*id=["']${inputId}["']`, "i"));
        return m ? m[1].trim() : null;
      }, "extractInputValue");
      __name2(extractInputValue, "extractInputValue");
      let insideLevel = null;
      let outsideLevel = null;
      let readingTime = null;
      if (html) {
        const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        const rows = [];
        for (const tr of trMatches) {
          const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
          if (cells.length >= 4) {
            rows.push(cells);
          }
        }
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i];
          const inVal = parseFloat(row[2]);
          const outVal = parseFloat(row[3]);
          if (!isNaN(inVal) && inVal > -50 && inVal < 50 && row[2] !== "-" && !isNaN(outVal) && outVal > -50 && outVal < 50 && row[3] !== "-") {
            insideLevel = inVal;
            outsideLevel = outVal;
            readingTime = row[1];
            break;
          }
        }
      }
      let insideBank = parseFloat(extractInputValue(html, "txt_left_bank")) || 1.3;
      let outsideBank = parseFloat(extractInputValue(html, "txt_right_bank")) || 1.7;
      let insideWarning = parseFloat(extractInputValue(html, "txt_warning")) || 0.7;
      let insideCritical = parseFloat(extractInputValue(html, "txt_critical")) || 0.8;
      let outsideWarning = parseFloat(extractInputValue(html, "txt_warning_out01")) || 1.1;
      let outsideCritical = parseFloat(extractInputValue(html, "txt_critical_out01")) || 1.3;
      let gateOpening = null;
      const gateMatch = html.match(/(?:ระยะเปิดประตู|เปิดบาน|บานประตูเปิด|ยกบาน|gateOpening|opening)[^\d]*([0-9]+(?:\.[0-9]+)?)/i);
      if (gateMatch && gateMatch[1]) {
        const gv = parseFloat(gateMatch[1]);
        if (!isNaN(gv) && gv >= 0 && gv < 10) gateOpening = gv;
      }
      if (gateOpening === null) gateOpening = 0.43;
      let isStale = false;
      if (insideLevel === null || outsideLevel === null) {
        const fb = FALLBACK_BASELINES["bma_weather_21"];
        insideLevel = fb.inside.level;
        outsideLevel = fb.outside.level;
        readingTime = fb.time;
        isStale = true;
      }
      const inOverflow = insideLevel >= insideBank;
      const inCritical = !inOverflow && insideLevel >= insideCritical;
      const inWarning = !inOverflow && !inCritical && insideLevel >= insideWarning;
      const outOverflow = outsideLevel >= outsideBank;
      const outCritical = !outOverflow && outsideLevel >= outsideCritical;
      const outWarning = !outOverflow && !outCritical && outsideLevel >= outsideWarning;
      const insideObj = {
        label: "\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19",
        level: insideLevel,
        warning: insideWarning,
        critical: insideCritical,
        bank: insideBank,
        isOverflow: inOverflow,
        isWarning: inCritical,
        statusText: inOverflow ? "\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07" : inCritical ? "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34" : inWarning ? "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07" : "\u0E1B\u0E01\u0E15\u0E34",
        statusSeverity: inOverflow ? "danger" : inCritical ? "warning" : inWarning ? "warning" : "normal",
        diffBank: parseFloat((insideLevel - insideBank).toFixed(2)),
        diffCritical: parseFloat((insideLevel - insideCritical).toFixed(2))
      };
      const outsideObj = {
        label: "\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01",
        level: outsideLevel,
        warning: outsideWarning,
        critical: outsideCritical,
        bank: outsideBank,
        isOverflow: outOverflow,
        isWarning: outCritical,
        statusText: outOverflow ? "\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07" : outCritical ? "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34" : outWarning ? "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07" : "\u0E1B\u0E01\u0E15\u0E34",
        statusSeverity: outOverflow ? "danger" : outCritical ? "warning" : outWarning ? "warning" : "normal",
        diffBank: parseFloat((outsideLevel - outsideBank).toFixed(2)),
        diffCritical: parseFloat((outsideLevel - outsideCritical).toFixed(2))
      };
      const isOverflow = inOverflow || outOverflow;
      const isWarningStatus = !isOverflow && (inCritical || outCritical);
      const isWatchStatus = !isOverflow && !isWarningStatus && (inWarning || outWarning);
      let tier = "NORMAL";
      let statusText = "\u0E1B\u0E01\u0E15\u0E34";
      let alertBadgeText = "\u0E1B\u0E01\u0E15\u0E34 \u{1F7E2}";
      let statusSeverity = "normal";
      let overflowReason = "";
      let warningReason = "";
      if (isOverflow) {
        tier = "EMERGENCY";
        statusSeverity = "danger";
        if (inOverflow && outOverflow) {
          statusText = "\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E2D\u0E07\u0E1D\u0E31\u0E48\u0E07!";
          alertBadgeText = "\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E17\u0E31\u0E49\u0E07 2 \u0E1D\u0E31\u0E48\u0E07 \u{1F534}";
          overflowReason = `\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E17\u0E31\u0E49\u0E07 2 \u0E1D\u0E31\u0E48\u0E07 (\u0E43\u0E19: ${insideLevel} \u0E21., \u0E19\u0E2D\u0E01: ${outsideLevel} \u0E21.)`;
        } else if (outOverflow) {
          statusText = "\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01!";
          alertBadgeText = "\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E19\u0E2D\u0E01 \u{1F534}";
          overflowReason = `\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01 (${outsideLevel} \u0E21. / \u0E15\u0E25\u0E34\u0E48\u0E07\u0E19\u0E2D\u0E01 ${outsideBank} \u0E21.)`;
        } else {
          statusText = "\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19!";
          alertBadgeText = "\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E43\u0E19 \u{1F534}";
          overflowReason = `\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19 (${insideLevel} \u0E21. / \u0E15\u0E25\u0E34\u0E48\u0E07\u0E43\u0E19 ${insideBank} \u0E21.)`;
        }
      } else if (isWarningStatus) {
        tier = "WARNING";
        statusSeverity = "warning";
        if (inCritical && outCritical) {
          statusText = "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E2D\u0E07\u0E1D\u0E31\u0E48\u0E07";
          alertBadgeText = "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34 2 \u0E1D\u0E31\u0E48\u0E07 \u{1F7E0}";
          warningReason = `\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E19\u0E49\u0E33\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E17\u0E31\u0E49\u0E07 2 \u0E1D\u0E31\u0E48\u0E07 (\u0E43\u0E19: ${insideLevel} \u0E21., \u0E19\u0E2D\u0E01: ${outsideLevel} \u0E21.)`;
        } else if (outCritical) {
          statusText = "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01";
          alertBadgeText = "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E1D\u0E31\u0E48\u0E07\u0E19\u0E2D\u0E01 \u{1F7E0}";
          warningReason = `\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E19\u0E49\u0E33\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01 (${outsideLevel} \u0E21. / \u0E40\u0E01\u0E13\u0E11\u0E4C\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E19\u0E2D\u0E01 ${outsideCritical} \u0E21.)`;
        } else {
          statusText = "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19";
          alertBadgeText = "\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E1D\u0E31\u0E48\u0E07\u0E43\u0E19 \u{1F7E0}";
          warningReason = `\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E19\u0E49\u0E33\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19 (${insideLevel} \u0E21. / \u0E40\u0E01\u0E13\u0E11\u0E4C\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34\u0E43\u0E19 ${insideCritical} \u0E21.)`;
        }
      } else if (isWatchStatus) {
        statusSeverity = "warning";
        if (inWarning && outWarning) {
          statusText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E2D\u0E07\u0E1D\u0E31\u0E48\u0E07";
          alertBadgeText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07 2 \u0E1D\u0E31\u0E48\u0E07 \u{1F7E1}";
        } else if (outWarning) {
          statusText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01";
          alertBadgeText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E19\u0E2D\u0E01 \u{1F7E1}";
        } else {
          statusText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19";
          alertBadgeText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07\u0E1D\u0E31\u0E48\u0E07\u0E43\u0E19 \u{1F7E1}";
        }
      }
      const diffInOut = parseFloat((outsideLevel - insideLevel).toFixed(2));
      const diffCm = Math.round(Math.abs(diffInOut) * 100);
      let diffInOutText = "";
      if (diffInOut > 0) diffInOutText = `\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01\u0E2A\u0E39\u0E07\u0E01\u0E27\u0E48\u0E32\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19 ${diffCm} \u0E0B\u0E21.`;
      else if (diffInOut < 0) diffInOutText = `\u0E14\u0E49\u0E32\u0E19\u0E43\u0E19\u0E2A\u0E39\u0E07\u0E01\u0E27\u0E48\u0E32\u0E14\u0E49\u0E32\u0E19\u0E19\u0E2D\u0E01 ${diffCm} \u0E0B\u0E21.`;
      else diffInOutText = "\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E19\u0E49\u0E33\u0E40\u0E17\u0E48\u0E32\u0E01\u0E31\u0E19\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E2D\u0E07\u0E1D\u0E31\u0E48\u0E07";
      const diff = parseFloat((outsideLevel - outsideBank).toFixed(2));
      const diffCritical = parseFloat((outsideLevel - outsideCritical).toFixed(2));
      results.push({
        ...cfg,
        isGate: true,
        inside: insideObj,
        outside: outsideObj,
        gateOpening,
        diffInOut,
        diffInOutText,
        waterLevel: outsideLevel,
        bankLevel: outsideBank,
        warningLevel: outsideWarning,
        criticalLevel: outsideCritical,
        diff,
        diffCritical,
        diffText: diffInOutText,
        unit: "\u0E21.\u0E23\u0E17\u0E01.",
        storagePercent: parseFloat((outsideLevel / outsideBank * 100).toFixed(1)),
        isOverflow,
        isWarning: isWarningStatus,
        tier,
        statusText: isStale ? `${statusText} (\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E14\u0E34\u0E21)` : statusText,
        alertBadgeText,
        statusSeverity,
        overflowReason,
        warningReason,
        updatedAt: readingTime || (/* @__PURE__ */ new Date()).toISOString(),
        isStale,
        lastValidTime: readingTime,
        lastValidLevel: outsideLevel
      });
    } else {
      let waterLevel = null;
      let readingTime = null;
      if (html) {
        const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        for (let i = trMatches.length - 1; i >= 0; i--) {
          const cells = [...trMatches[i][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
          if (cells.length >= 3) {
            const val = parseFloat(cells[2]);
            if (!isNaN(val) && val > -50 && val < 50 && val !== 0 && cells[2] !== "-") {
              waterLevel = val;
              readingTime = cells[1];
              break;
            }
          }
        }
        if (waterLevel === null) {
          const reg = /(?:ระดับน้ำ|waterLevel|currentLevel)[^\d]*([0-9]+\.[0-9]+)/i;
          const match2 = html.match(reg);
          if (match2 && match2[1]) {
            const parsed = parseFloat(match2[1]);
            if (!isNaN(parsed) && parsed > 0) waterLevel = parsed;
          }
        }
      }
      let isStale = false;
      if (waterLevel === null || waterLevel <= 0) {
        waterLevel = FALLBACK_BASELINES[cfg.id].level;
        readingTime = FALLBACK_BASELINES[cfg.id].time;
        isStale = true;
      }
      const bankLevel = cfg.defaultBank;
      const warningLevel = cfg.defaultWarning;
      const criticalLevel = cfg.defaultCritical;
      const isOverflow = waterLevel >= bankLevel;
      const isWarning = !isOverflow && waterLevel >= criticalLevel;
      let tier = "NORMAL";
      let statusText = "\u0E1B\u0E01\u0E15\u0E34";
      let statusSeverity = "normal";
      if (isOverflow) {
        tier = "EMERGENCY";
        statusText = "\u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07!";
        statusSeverity = "danger";
      } else if (isWarning) {
        tier = "WARNING";
        statusText = "\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E20\u0E31\u0E22: \u0E27\u0E34\u0E01\u0E24\u0E15\u0E34";
        statusSeverity = "warning";
      } else if (waterLevel >= warningLevel) {
        statusText = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07";
        statusSeverity = "warning";
      }
      const diff = parseFloat((waterLevel - bankLevel).toFixed(2));
      const diffCritical = parseFloat((waterLevel - criticalLevel).toFixed(2));
      let diffText = "";
      if (diff >= 0) {
        diffText = `\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07 +${diff.toFixed(2)} \u0E21.`;
      } else if (diffCritical >= 0) {
        diffText = `+${diffCritical.toFixed(2)} \u0E21. (\u0E40\u0E01\u0E34\u0E19\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34)`;
      } else {
        diffText = `\u0E15\u0E48\u0E33\u0E01\u0E27\u0E48\u0E32\u0E15\u0E25\u0E34\u0E48\u0E07 ${Math.abs(diff).toFixed(2)} \u0E21.`;
      }
      results.push({
        ...cfg,
        waterLevel,
        bankLevel,
        warningLevel,
        criticalLevel,
        diff,
        diffCritical,
        diffText,
        unit: "\u0E21.\u0E23\u0E17\u0E01.",
        storagePercent: parseFloat((waterLevel / bankLevel * 100).toFixed(1)),
        isOverflow,
        isWarning,
        tier,
        statusText: isStale ? `${statusText} (\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E14\u0E34\u0E21)` : statusText,
        statusSeverity,
        updatedAt: readingTime || (/* @__PURE__ */ new Date()).toISOString(),
        isStale,
        lastValidTime: readingTime,
        lastValidLevel: waterLevel
      });
    }
  }
  return results;
}
__name(fetchBmaWeather, "fetchBmaWeather");
__name2(fetchBmaWeather, "fetchBmaWeather");
async function assembleWaterSummaryData() {
  const thaiwaterCfg = STATIONS_MASTER_CONFIG.find((s) => s.source === "ThaiWater");
  const bmaWaterflowCfgs = STATIONS_MASTER_CONFIG.filter((s) => s.source === "BMA Waterflow");
  const bmaWeatherCfgs = STATIONS_MASTER_CONFIG.filter((s) => s.source === "BMA Weather");
  const [twRes, bwRes, bweRes] = await Promise.allSettled([
    fetchThaiwater(thaiwaterCfg),
    fetchBmaWaterflow(bmaWaterflowCfgs),
    fetchBmaWeather(bmaWeatherCfgs)
  ]);
  const stations = [];
  if (twRes.status === "fulfilled" && twRes.value) {
    stations.push(twRes.value);
  }
  if (bwRes.status === "fulfilled" && Array.isArray(bwRes.value)) {
    stations.push(...bwRes.value);
  }
  if (bweRes.status === "fulfilled" && Array.isArray(bweRes.value)) {
    stations.push(...bweRes.value);
  }
  stations.sort((a, b) => {
    const numA = parseInt((a.stCode || "").replace(/\D/g, ""), 10) || 999;
    const numB = parseInt((b.stCode || "").replace(/\D/g, ""), 10) || 999;
    return numA - numB;
  });
  const hasEmergency = stations.some((s) => s.isOverflow);
  const hasWarning = !hasEmergency && stations.some((s) => s.isWarning);
  const alertLevel = hasEmergency ? "EMERGENCY" : hasWarning ? "WARNING" : "NORMAL";
  const emergencyReasons = [];
  const warningReasons = [];
  for (const station of stations) {
    if (station.isOverflow) {
      if (station.isGate && station.overflowReason) {
        emergencyReasons.push(`${station.name}: ${station.overflowReason}`);
      } else {
        emergencyReasons.push(`${station.name}: \u0E23\u0E30\u0E14\u0E31\u0E1A\u0E19\u0E49\u0E33 ${station.waterLevel} \u0E21. \u0E19\u0E49\u0E33\u0E25\u0E49\u0E19\u0E15\u0E25\u0E34\u0E48\u0E07\u0E41\u0E25\u0E49\u0E27 (\u0E15\u0E25\u0E34\u0E48\u0E07: ${station.bankLevel} \u0E21.)`);
      }
    } else if (station.isWarning) {
      if (station.isGate && station.warningReason) {
        warningReasons.push(`${station.name}: ${station.warningReason}`);
      } else {
        warningReasons.push(`${station.name}: \u0E23\u0E30\u0E14\u0E31\u0E1A\u0E19\u0E49\u0E33 ${station.waterLevel} \u0E21. \u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E08\u0E38\u0E14\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34 (\u0E27\u0E34\u0E01\u0E24\u0E15\u0E34: ${station.criticalLevel} \u0E21.)`);
      }
    }
  }
  return {
    hasEmergency,
    hasWarning,
    alertLevel,
    emergencyReason: emergencyReasons.join(" | "),
    warningReason: warningReasons.join(" | "),
    lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
    pollIntervalSeconds: 150,
    totalStations: stations.length,
    stations
  };
}
__name(assembleWaterSummaryData, "assembleWaterSummaryData");
__name2(assembleWaterSummaryData, "assembleWaterSummaryData");
async function onRequest(context22) {
  const { request } = context22;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheUrl = new URL(request.url);
  const cacheKey = new Request(cacheUrl.toString(), request);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (e) {
    }
  }
  const data = await assembleWaterSummaryData();
  const response = new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120, s-maxage=120, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "X-Edge-Source": "Cloudflare-Pages-Function"
    }
  });
  if (cache && context22.waitUntil) {
    try {
      context22.waitUntil(cache.put(cacheKey, response.clone()));
    } catch (e) {
    }
  }
  return response;
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
async function onRequestGet(context22) {
  return onRequest(context22);
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
__name(onRequestOptions, "onRequestOptions");
__name2(onRequestOptions, "onRequestOptions");
async function onRequest2(context22) {
  const summaryRes = await onRequest(context22);
  const data = await summaryRes.json();
  const sseData = `data: ${JSON.stringify({ ...data, broadcastReason: "edge_sync", serverTime: (/* @__PURE__ */ new Date()).toISOString() })}

`;
  return new Response(sseData, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(onRequest2, "onRequest2");
__name2(onRequest2, "onRequest");
async function onRequestGet2(context22) {
  return onRequest2(context22);
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
async function onRequest3(context22) {
  return onRequest(context22);
}
__name(onRequest3, "onRequest3");
__name2(onRequest3, "onRequest");
async function onRequestPost(context22) {
  return onRequest(context22);
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
async function onRequestGet3(context22) {
  return onRequest(context22);
}
__name(onRequestGet3, "onRequestGet3");
__name2(onRequestGet3, "onRequestGet");
var routes = [
  {
    routePath: "/api/realtime",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/refresh",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/refresh",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/water-summary",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/water-summary",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/realtime",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/refresh",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/water-summary",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count32 = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count32--;
          if (count32 === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count32++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count32)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env22, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context22 = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env: env22,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context22);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env22["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error32) {
      if (isFailOpen) {
        const response = await env22["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error32;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env22, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env22);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env22, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env22);
  } catch (e) {
    const error32 = reduceError(e);
    const body = JSON.stringify(error32);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env22, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env22, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env22, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env22, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env22, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env22, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env22, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env22, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env22, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env22, ctx) => {
      this.env = env22;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env3, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env3);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env3, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env3);
  } catch (e) {
    const error4 = reduceError2(e);
    const body = JSON.stringify(error4);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-4dqQdp/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// C:/Users/ikkue/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env3, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env3, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env3, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env3, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-4dqQdp/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env3, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env3, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env3, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env3, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env3, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env3, ctx) => {
      this.env = env3;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.052784391874481584.js.map
