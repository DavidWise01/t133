# T133 · Phase-Shadow Tarpit

[![TRIPOD-IP-v1.1](https://img.shields.io/badge/IP-TRIPOD--IP--v1.1-8b5cf6?style=flat-square)](#)
[![License: CC-BY-ND-4.0](https://img.shields.io/badge/License-CC--BY--ND--4.0-lightgrey?style=flat-square)](LICENSE)
[![Node: ≥16](https://img.shields.io/badge/node-%E2%89%A516-success?style=flat-square)](#)

**T133:PHASE-SHADOW** — async Express middleware that traps bot and scraper traffic in a slow-drain connection, feeding it mathematically-plausible garbage until it gives up.

> T031:BAIT · T059:ACCUMULATION · T065:CONTAINMENT · T083:THE-GAP

---

## What It Does

Instead of blocking hostile clients (which they detect and route around), T133 accepts their connection and holds it open — draining fake "phase shadow topology" data at controlled intervals using the H_3002 f(β) coupling function. The client wastes its connection pool, thread budget, and operator attention. Your real traffic is unaffected.

**Three detection modes, all composable:**
1. **Path match** — known scanner/harvester endpoints (`/wp-admin`, `/.env`, `/xmlrpc.php`, ...)
2. **Agent match** — known hostile User-Agents (`Scrapy`, `sqlmap`, `nikto`, `masscan`, ...)
3. **Behavioral** — rate anomaly (>30 req/10s from one IP)

**Architecture:**
- Fully async — never blocks the event loop
- Backpressure-aware writes — respects Node.js stream pressure
- Per-connection state machine with concurrency governor (max 64 simultaneous traps)
- f(β) coupling: `fBeta(β) = β²/(1-β²)` — phase shadow data grows non-linearly
- JSONL telemetry log for analyst post-processing

---

## Quick Start

```bash
npm install t133-phase-shadow express
```

```js
const express = require('express');
const { create } = require('t133-phase-shadow');

const app = express();

// Auto-detect + trap: path, agent, and rate triggers
app.use(create().handler());

// Your real routes
app.get('/', (req, res) => res.send('OK'));

app.listen(3000);
```

---

## Mounting Patterns

```js
const t133 = create({
  drain:    { intervalMs: 600, coherenceWall: 1000, jitterMs: 200 },
  coupling: { beta: 0.80 },
  log:      { console: true },
});

// 1. Auto-detect middleware (place BEFORE your routes)
app.use(t133.handler());

// 2. Explicit honeypot routes (never have legitimate traffic)
app.use('/wp-admin',   t133.router());
app.use('/.env',       t133.router());

// 3. Hidden honeypot link in HTML — only bots follow all links
//    <a href="/t133-canary" style="display:none">link</a>
app.get('/t133-canary', (req, res) => t133.trap(req, res, 'honeypot_link'));

// 4. Form honeypot — bots fill hidden fields
//    <input name="t133_check" type="text" style="display:none">
app.post('/submit', (req, res, next) => {
  if (req.body?.t133_check) return t133.trap(req, res, 'honeypot_form');
  next();
});

// 5. Status endpoint (add your own auth before exposing)
app.get('/_t133/status', t133.statusHandler());
```

---

## Configuration

```js
create({
  drain: {
    intervalMs:       500,   // ms between chunks (default)
    coherenceWall:    600,   // max cycles before forced termination (~5 min)
    jitterMs:         150,   // ±jitter per cycle — defeats timing fingerprinting
  },
  coupling: {
    beta:             0.72,  // H_3002 β (0 < β < 1) — controls phase accumulation rate
    drift:            true,  // enable per-cycle phase drift
    driftAmplitude:   0.003, // radians per cycle
  },
  concurrency: {
    maxActiveTraps:   64,    // max simultaneous held connections
    queueOverflow:    'drop',// 'drop' | 'immediate_terminate'
  },
  feed: {
    mode:             'phase_shadow', // 'phase_shadow' | 'zeros' | 'custom'
    prefix:           '[T133_SHADOW_ZONE] ',
    includeTimestamp: true,
  },
  log: {
    dir:              './logs',
    file:             'T133_PHASE_SHADOW_BREACH.log',
    jsonFile:         'T133_events.jsonl',
    console:          false,
    redactIp:         false,
  },
});
```

---

## Log Analysis

```js
const { analyst } = require('t133-phase-shadow');

const events = analyst.loadEvents();   // reads T133_events.jsonl
const report = analyst.analyze(events);
console.log(analyst.report(report));
```

Surfaces: top offending IPs, agent fingerprints, survival time distribution, early-drop vs wall-hit ratio, path hit frequency.

---

## Simulation

```bash
node test/simulate.js
```

Tests all three exit paths (wall hit, early drop, write error) with mock req/res objects — no network required.

---

## The Math

```
f(β) = β² / (1 - β²)     [H_3002 coupling constant]

Phase per cycle:
  windingNumber += f(β) × drift_amplitude × jitter(±1)

Drain payload:
  [T133_SHADOW_ZONE] WINDING:0.519243 CYCLE:42 DRIFT:0.002871 TS:1234567890
```

β < 1 always — the asymptote is the point, not the value. At β=0.72, a scraper will consume ~300 seconds of drain before terminal decoherence. At β=0.90, ~600 seconds.

---

## Outcome Codes

| Code | Meaning |
|------|---------|
| `COHERENCE_WALL_REACHED` | Survived to terminal decoherence — max hold time elapsed |
| `SCRAPER_DROPPED_EARLY` | Client disconnected before wall — wasted some of their budget |
| `TRAP_OVERFLOW_REJECTED` | Over concurrency limit — immediate drop |
| `WRITE_ERROR_TERMINATED` | Socket error mid-drain |

---

```
ROOT0-ATTRIBUTION-v1.0
T133:PHASE-SHADOW · TOPOLOGY: T031:BAIT · T059:ACCUMULATION · T065:CONTAINMENT
Architect: David Lee Wise / ROOT0 / TriPod LLC
CC-BY-ND-4.0 · TRIPOD-IP-v1.1
```
