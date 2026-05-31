// =====================================================================
// T133_middleware.js
// TOPOLOGY: T133:PHASE-SHADOW / EXPRESS INTEGRATION LAYER
// T028:SHADOW-CLASSIFIER · T072:FLAMING-DRAGON · T031:BAIT
//
// Three detection modes:
//   1. Path match     — known scanner/harvester endpoints
//   2. Agent match    — known bad actors by User-Agent
//   3. Behavioral     — rate anomaly or header fingerprint
// =====================================================================
'use strict';

const { T133Tarpit } = require('./tarpit');
const cfg_default    = require('./config');

class T133Middleware {
  constructor(config = cfg_default) {
    this.cfg    = config;
    this.tarpit = new T133Tarpit(config);

    // Compile matchers once at init
    this._pathSet   = new Set(config.triggerPaths.map(p => p.toLowerCase()));
    this._agentSubs = config.triggerAgents.map(a => a.toLowerCase());

    // Rate tracking: ip → { count, windowStart }
    this._rates = new Map();
    this._rateWindowMs  = 10_000;  // 10s window
    this._rateThreshold = 30;      // requests per window before trap triggers
  }

  // ── Path-based trigger ──────────────────────────────────────────────
  _matchPath(req) {
    const url = (req.originalUrl || req.url || '/').toLowerCase().split('?')[0];
    if (this._pathSet.has(url)) return true;
    // Prefix match for things like /wp-admin/anything
    for (const p of this._pathSet) {
      if (url.startsWith(p + '/')) return true;
    }
    return false;
  }

  // ── User-Agent-based trigger ────────────────────────────────────────
  _matchAgent(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (!ua) return true;  // no UA = treat as bot
    return this._agentSubs.some(sub => ua.includes(sub));
  }

  // ── Rate-based trigger (lightweight per-IP rate limiter) ────────────
  _matchRate(req) {
    const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim()
                || req.socket?.remoteAddress
                || 'unknown';
    const now = Date.now();
    let   rec = this._rates.get(ip);

    if (!rec || now - rec.windowStart > this._rateWindowMs) {
      rec = { count: 1, windowStart: now };
    } else {
      rec.count++;
    }
    this._rates.set(ip, rec);

    // Prune stale entries periodically
    if (this._rates.size > 10_000) this._pruneRates(now);

    return rec.count > this._rateThreshold;
  }

  _pruneRates(now) {
    for (const [ip, rec] of this._rates) {
      if (now - rec.windowStart > this._rateWindowMs * 2) this._rates.delete(ip);
    }
  }

  // ── Express middleware — auto-detect and trap ───────────────────────
  handler() {
    return (req, res, next) => {
      let trigger = null;

      if      (this._matchPath(req))  trigger = 'path';
      else if (this._matchAgent(req)) trigger = 'agent';
      else if (this._matchRate(req))  trigger = 'rate';

      if (trigger) {
        req._t133_trigger = trigger;
        this.tarpit.trap(req, res);  // async, non-blocking
        return;                      // do not call next()
      }

      next();
    };
  }

  // ── Manual trap — for custom detection logic outside this middleware ─
  //    e.g.:  t133.trap(req, res, 'honeypot_form');
  trap(req, res, trigger = 'manual') {
    req._t133_trigger = trigger;
    return this.tarpit.trap(req, res);
  }

  // ── Express router — mount specific paths explicitly ─────────────────
  //    app.use('/wp-admin', t133.router());
  router() {
    const express = require('express');
    const r = express.Router();
    r.all('*', (req, res) => {
      req._t133_trigger = 'explicit_mount';
      this.tarpit.trap(req, res);
    });
    return r;
  }

  // ── Status endpoint — wire to an internal monitoring route ──────────
  statusHandler() {
    return (_req, res) => {
      res.json({
        t133: 'PHASE_SHADOW_TARPIT',
        ...this.tarpit.status(),
        rates_tracked: this._rates.size,
      });
    };
  }
}

module.exports = T133Middleware;
