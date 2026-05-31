// =====================================================================
// example_server.js
// T133:PHASE-SHADOW — INTEGRATION EXAMPLE
// Not production code — illustrates all mounting patterns
// =====================================================================
'use strict';

const express = require('express');
const { create } = require('./index');

const app = express();

// ── Initialize tarpit (override defaults selectively) ─────────────────
const t133 = create({
  drain: {
    intervalMs: 600,      // 600ms between chunks — ~10 min max hold time
    coherenceWall: 1000,  // 1000 cycles × 600ms = 10 minutes
    jitterMs: 200,
  },
  coupling: {
    beta: 0.80,           // higher β = more dramatic phase accumulation
  },
  log: {
    console: true,        // mirror events to stdout while testing
  },
});

// ── Pattern 1: Auto-detect middleware (path + agent + rate) ───────────
// Place BEFORE your real routes. Intercepts known scanner traffic.
app.use(t133.handler());

// ── Pattern 2: Explicit honeypot routes ───────────────────────────────
// Routes that should never have legitimate traffic.
// Mount the tarpit router directly.
app.use('/wp-admin',     t133.router());
app.use('/xmlrpc.php',   t133.router());
app.use('/.env',         t133.router());
app.use('/.git',         t133.router());

// ── Pattern 3: Hidden honeypot link in HTML ───────────────────────────
// Put this in your HTML, hidden from humans:
//   <a href="/t133-canary" style="display:none">link</a>
// Only bots following all links will hit it.
app.get('/t133-canary', (req, res) => t133.trap(req, res, 'honeypot_link'));

// ── Pattern 4: Form honeypot ──────────────────────────────────────────
// Add a hidden field to your forms:
//   <input name="t133_check" type="text" style="display:none" value="">
// If it arrives populated, it's a bot.
app.post('/submit', (req, res, next) => {
  if (req.body?.t133_check) {          // bot filled the hidden field
    return t133.trap(req, res, 'honeypot_form');
  }
  next();
});

// ── Status endpoint (internal monitoring only — DO NOT expose publicly) 
app.get('/_t133/status',
  // Add your own auth middleware here before exposing
  t133.statusHandler()
);

// ── Your real routes go here ──────────────────────────────────────────
app.get('/', (_req, res) => res.send('OK'));

// ── Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[T133] Tarpit active on :${PORT}`);
  console.log(`[T133] Max concurrent traps: ${t133.tarpit.cfg.concurrency.maxActiveTraps}`);
});
