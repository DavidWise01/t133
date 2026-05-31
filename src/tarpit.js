// =====================================================================
// T133_tarpit.js
// TOPOLOGY: T133:PHASE-SHADOW / CORE TRAP ENGINE
// T059:ACCUMULATION · T065:CONTAINMENT · T083:THE-GAP
//
// ARCHITECTURE:
//   - Fully async. Never blocks event loop.
//   - Backpressure-aware writes.
//   - Per-connection state machine.
//   - Concurrency governor prevents self-DoS.
//   - Phase shadow data generated from actual f(β) coupling math.
// =====================================================================
'use strict';

const T133Logger = require('./logger');
const cfg_default = require('./config');

// ── Outcome codes ──────────────────────────────────────────────────────
const OUTCOME = {
  WALL_HIT:    'COHERENCE_WALL_REACHED',   // survived to terminal decoherence
  EARLY_DROP:  'SCRAPER_DROPPED_EARLY',    // client disconnected before wall
  OVERFLOW:    'TRAP_OVERFLOW_REJECTED',   // over concurrency limit
  WRITE_ERROR: 'WRITE_ERROR_TERMINATED',   // socket error mid-drain
};

// ── Utilities ──────────────────────────────────────────────────────────
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const jitter  = amp => (Math.random() * 2 - 1) * amp;  // ±amp
const fBeta   = b  => (b * b) / (1.0 - b * b);         // H_3002 coupling

// ── Phase shadow payload generator ────────────────────────────────────
// Produces realistic-looking "governance topology" data.
// Scrapers that parse this get garbage phase data — T031:BAIT.
function buildChunk(cycle, windingNumber, drift, feedCfg) {
  const ts    = feedCfg.includeTimestamp ? ` TS:${Date.now()}` : '';
  const line  = `${feedCfg.prefix}WINDING:${windingNumber.toFixed(6)} CYCLE:${cycle} DRIFT:${drift.toFixed(6)}${ts}\n`;
  return line;
}

// ── Core trap state machine ────────────────────────────────────────────
class TrapSession {
  constructor(req, res, config, logger, onRelease) {
    this.req        = req;
    this.res        = res;
    this.cfg        = config;
    this.logger     = logger;
    this.onRelease  = onRelease;
    this.startTime  = Date.now();
    this.cycle      = 0;
    this.windingNum = 0;
    this.phaseDrift = 0;
    this.outcome    = null;
    this.trigger    = req._t133_trigger || 'path';

    // f(β) coupling constant — computed once per session
    this.coupling = fBeta(this.cfg.coupling.beta);
  }

  async run() {
    const res  = this.res;
    const feed = this.cfg.feed;
    const wall = this.cfg.drain.coherenceWall;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    try {
      for (this.cycle = 0; this.cycle < wall; this.cycle++) {

        // ── Check if client already dropped ─────────────────────────
        if (res.destroyed || res.writableEnded || res.socket?.destroyed) {
          this.outcome = OUTCOME.EARLY_DROP;
          break;
        }

        // ── Accumulate phase shadow ──────────────────────────────────
        this.windingNum += this.coupling;
        if (this.cfg.coupling.drift) {
          this.phaseDrift += jitter(this.cfg.coupling.driftAmplitude);
        }

        // ── Write chunk with backpressure handling ───────────────────
        const chunk = buildChunk(this.cycle, this.windingNum, this.phaseDrift, feed);
        const ok    = res.write(chunk);

        if (!ok) {
          // Buffer full — wait for drain event before continuing
          const drained = await new Promise((resolve) => {
            const onDrain = () => { res.removeListener('close', onClose); resolve(true);  };
            const onClose = () => { res.removeListener('drain', onDrain); resolve(false); };
            res.once('drain', onDrain);
            res.once('close', onClose);
          });
          if (!drained) {
            this.outcome = OUTCOME.EARLY_DROP;
            break;
          }
        }

        // ── Sleep with jitter — defeats timing fingerprinting ────────
        const interval = this.cfg.drain.intervalMs + jitter(this.cfg.drain.jitterMs);
        await sleep(Math.max(50, interval));
      }

      // ── Terminal decoherence or early drop ───────────────────────
      if (!this.outcome) {
        this.outcome = OUTCOME.WALL_HIT;
        if (!res.writableEnded) res.end(feed.terminalMessage);
      } else {
        if (!res.writableEnded) res.end(feed.dropMessage);
      }

    } catch (err) {
      this.outcome = OUTCOME.WRITE_ERROR;
      if (!res.writableEnded) try { res.end(); } catch (_) {}
    } finally {
      this._log();
      this.onRelease();
    }
  }

  _log() {
    this.logger.record(this.req, {
      windingNumber: this.windingNum,
      cycles:        this.cycle,
      durationMs:    Date.now() - this.startTime,
      outcome:       this.outcome,
      trigger:       this.trigger,
    });
  }
}

// ── Tarpit Engine — concurrency governor + session factory ─────────────
class T133Tarpit {
  constructor(config = cfg_default) {
    this.cfg    = config;
    this.logger = new T133Logger(config);
    this.active = 0;
  }

  // ── Primary entry point — call this from Express handler ───────────
  async trap(req, res) {
    const maxActive = this.cfg.concurrency.maxActiveTraps;

    if (this.active >= maxActive) {
      // ── Overflow — reject immediately rather than queue ─────────────
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'UNKNOWN';
      this.logger.record(req, {
        windingNumber: 0,
        cycles:        0,
        durationMs:    0,
        outcome:       OUTCOME.OVERFLOW,
        trigger:       req._t133_trigger || 'path',
      });

      if (this.cfg.concurrency.queueOverflow === 'immediate_terminate') {
        res.status(503).end('[SERVICE_UNAVAILABLE]\n');
      } else {
        // 'drop' — just close the connection silently
        res.socket?.destroy();
      }
      return;
    }

    this.active++;
    const session = new TrapSession(req, res, this.cfg, this.logger, () => {
      this.active--;
    });

    // Returns the session promise — awaitable in tests, fire-and-forget in Express
    const p = session.run().catch(() => { this.active--; });
    return p;
  }

  // ── Status — how many connections are currently trapped ─────────────
  status() {
    return {
      active:  this.active,
      max:     this.cfg.concurrency.maxActiveTraps,
      headroom: this.cfg.concurrency.maxActiveTraps - this.active,
    };
  }
}

module.exports = { T133Tarpit, OUTCOME, fBeta };
