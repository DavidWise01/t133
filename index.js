// =====================================================================
// index.js
// TOPOLOGY: T133:PHASE-SHADOW / PUBLIC API
// TRIPOD-IP-v1.1 · DLW · ROOT0
// =====================================================================
'use strict';

const T133Middleware = require('./src/middleware');
const { T133Tarpit, OUTCOME, fBeta } = require('./src/tarpit');
const T133Logger   = require('./src/logger');
const { loadEvents, analyze, report } = require('./src/analyst');
const defaultCfg   = require('./src/config');

module.exports = {
  // ── Primary usage: new T133(config?) ──────────────────────────────
  // Returns a middleware instance. Call .handler() for Express use.
  T133: T133Middleware,

  // ── Lower-level access ─────────────────────────────────────────────
  T133Tarpit,
  T133Logger,
  OUTCOME,
  fBeta,

  // ── Log analysis ───────────────────────────────────────────────────
  analyst: { loadEvents, analyze, report },

  // ── Default config (override selectively) ──────────────────────────
  defaultConfig: defaultCfg,

  // ── Quick-start factory ────────────────────────────────────────────
  // const { create } = require('./T133');
  // app.use(create({ drain: { intervalMs: 800 } }).handler());
  create(overrides = {}) {
    const cfg = deepMerge(defaultCfg, overrides);
    return new T133Middleware(cfg);
  },
};

function deepMerge(base, over) {
  const result = { ...base };
  for (const key of Object.keys(over)) {
    if (over[key] && typeof over[key] === 'object' && !Array.isArray(over[key])) {
      result[key] = deepMerge(base[key] || {}, over[key]);
    } else {
      result[key] = over[key];
    }
  }
  return result;
}
