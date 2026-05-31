// =====================================================================
// T133_logger.js
// TOPOLOGY: T133:PHASE-SHADOW / TELEMETRY RECORD
// T053:CHAIN-OF-CUSTODY · T054:TIMESTAMP · T027:FINGERPRINT
// =====================================================================
'use strict';

const fs   = require('fs');
const path = require('path');

class T133Logger {
  constructor(cfg) {
    this.cfg     = cfg.log;
    this.logPath = path.join(this.cfg.dir, this.cfg.file);
    this.jlPath  = path.join(this.cfg.dir, this.cfg.jsonFile);
    this._ensureDir();
  }

  _ensureDir() {
    fs.mkdirSync(this.cfg.dir, { recursive: true });
  }

  _ip(req) {
    if (this.cfg.redactIp) return '[REDACTED]';
    return (
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'UNKNOWN_VECTOR'
    );
  }

  // ── Write both human-readable and JSONL on every event ─────────────
  record(req, event) {
    const ts        = new Date().toISOString();
    const ip        = this._ip(req);
    const ua        = req.headers['user-agent'] || 'UNDECLARED_AGENT';
    const url       = req.originalUrl || req.url || '/';
    const method    = req.method || 'GET';

    // ── Human-readable ──────────────────────────────────────────────
    const human = [
      ``,
      `[DECOHERENCE_EVENT]`,
      `[TIMESTAMP]      ${ts}`,
      `[CRAWLER_VECTOR] ${ip}`,
      `[IDENTITY]       ${ua}`,
      `[METHOD/PATH]    ${method} ${url}`,
      `[DEBT_TOLERANCE] ${(event.windingNumber || 0).toFixed(4)} rads`,
      `[CYCLES]         ${event.cycles || 0}`,
      `[SURVIVAL_TIME]  ${event.durationMs || 0}ms`,
      `[OUTCOME]        ${event.outcome}`,
      `[TRIGGER]        ${event.trigger || 'path'}`,
      `--------------------------------------------------`,
    ].join('\n') + '\n';

    // ── JSONL (machine-readable, one object per line) ───────────────
    const structured = JSON.stringify({
      ts, ip, ua, method, url,
      windingNumber: event.windingNumber,
      cycles:        event.cycles,
      durationMs:    event.durationMs,
      outcome:       event.outcome,
      trigger:       event.trigger,
    }) + '\n';

    try {
      fs.appendFileSync(this.logPath, human);
      fs.appendFileSync(this.jlPath,  structured);
    } catch (err) {
      // T128:ROOT — log write fault does not propagate to caller
      if (this.cfg.console) console.error('[T128:ROOT] LOG_WRITE_FAULT', err.message);
    }

    if (this.cfg.console) {
      console.log(`[T133] ${event.outcome.padEnd(24)} ${ip.padEnd(20)} ${durationStr(event.durationMs)} ${url}`);
    }
  }
}

function durationStr(ms) {
  if (!ms) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = T133Logger;
