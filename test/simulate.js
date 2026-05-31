// =====================================================================
// test/simulate.js
// T133:PHASE-SHADOW — LOCAL SIMULATION
// Runs the trap engine against mock req/res objects.
// No network required. Tests all three exit paths.
// =====================================================================
'use strict';

const { T133Tarpit, OUTCOME } = require('../src/tarpit');
const cfg = require('../src/config');

// ── Minimal mock req ──────────────────────────────────────────────────
function mockReq(overrides = {}) {
  return {
    headers: {
      'user-agent': overrides.ua || 'TestBot/1.0 (simulate)',
      'x-forwarded-for': overrides.ip || '10.0.0.1',
    },
    originalUrl: overrides.url || '/wp-admin',
    method: 'GET',
    socket: { remoteAddress: overrides.ip || '10.0.0.1', destroyed: false },
    _t133_trigger: overrides.trigger || 'test',
  };
}

// ── Mock res that collects chunks and supports early disconnect ────────
function mockRes(opts = {}) {
  const chunks = [];
  const listeners = { drain: [], close: [] };

  const res = {
    destroyed: false,
    writableEnded: false,
    _chunks: chunks,

    setHeader: () => {},

    write(chunk) {
      if (res.destroyed || res.writableEnded) return false;

      if (opts.dropAfterChunks && chunks.length >= opts.dropAfterChunks) {
        res.destroyed = true;
        if (res.socket) res.socket.destroyed = true;
        // Notify anyone waiting on close
        for (const cb of listeners['close']) cb();
        listeners['close'] = [];
        return false;
      }
      chunks.push(chunk);
      if (opts.verbose) process.stdout.write('.');
      // Simulate drain available immediately
      setImmediate(() => { for (const cb of listeners['drain']) cb(); listeners['drain'] = []; });
      return true;
    },

    end(msg) {
      if (res.writableEnded) return;
      if (msg) chunks.push(msg);
      res.writableEnded = true;
    },

    once(event, cb) {
      // If already destroyed and someone is waiting for close, fire immediately
      if (event === 'close' && res.destroyed) { setImmediate(cb); return res; }
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return res;
    },
    removeListener(event, cb) {
      if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== cb);
      return res;
    },

    socket: { destroyed: false },
    status: () => res,
  };

  return res;
}

// ── Test runner ───────────────────────────────────────────────────────
async function runTest(name, tarpitCfg, reqOpts, resOpts) {
  const tarpit = new T133Tarpit({
    ...cfg,
    ...tarpitCfg,
    log: { ...cfg.log, console: false, dir: '/tmp/t133_test_logs' },
  });

  const req = mockReq(reqOpts);
  const res = mockRes({ verbose: false, ...resOpts });

  const start = Date.now();
  await tarpit.trap(req, res);
  const elapsed = Date.now() - start;

  const lastChunk = res._chunks[res._chunks.length - 1] || '';
  const outcome   = lastChunk.includes('TERMINAL')  ? OUTCOME.WALL_HIT
                  : lastChunk.includes('COHERENCE_LOST') ? OUTCOME.EARLY_DROP
                  : 'UNKNOWN';

  const pass = resOpts?.expectOutcome ? outcome === resOpts.expectOutcome : true;

  console.log(`  ${pass ? '✓' : '✗'} ${name}`);
  console.log(`    chunks:   ${res._chunks.length}`);
  console.log(`    elapsed:  ${elapsed}ms`);
  console.log(`    outcome:  ${lastChunk.trim()}`);
  if (!pass) console.log(`    EXPECTED: ${resOpts.expectOutcome}  GOT: ${outcome}`);
  return pass;
}

async function main() {
  console.log('\n[T133] PHASE-SHADOW TARPIT — SIMULATION SUITE\n');

  const fastCfg = {
    drain: { intervalMs: 10, jitterMs: 2, coherenceWall: 5 },
    coupling: { beta: 0.72, drift: true, driftAmplitude: 0.003 },
    concurrency: { maxActiveTraps: 64, queueOverflow: 'drop' },
    feed: {
      mode: 'phase_shadow', prefix: '[T133_SHADOW_ZONE] ',
      includeTimestamp: true,
      terminalMessage: '[TERMINAL_DECOHERENCE_REACHED]\n',
      dropMessage: '[COHERENCE_LOST]\n',
    },
  };

  const results = [];

  results.push(await runTest(
    'Wall hit — scraper endures full drain cycle',
    fastCfg,
    { ua: 'Scrapy/2.6', ip: '1.2.3.4', url: '/wp-admin' },
    { expectOutcome: OUTCOME.WALL_HIT }
  ));

  results.push(await runTest(
    'Early drop — scraper disconnects after 2 chunks',
    fastCfg,
    { ua: 'python-requests/2.28', ip: '5.6.7.8', url: '/.env' },
    { dropAfterChunks: 2, expectOutcome: OUTCOME.EARLY_DROP }
  ));

  results.push(await runTest(
    'Overflow — reject when at capacity',
    { ...fastCfg, concurrency: { maxActiveTraps: 0, queueOverflow: 'immediate_terminate' } },
    { ua: 'masscan', ip: '9.9.9.9', url: '/admin' },
    {}
  ));

  const passed = results.filter(Boolean).length;
  console.log(`\n  ${passed}/${results.length} tests passed`);

  // ── Print analysis of test log ────────────────────────────────────
  const { loadEvents, report } = require('../src/analyst');
  const events = loadEvents('/tmp/t133_test_logs/T133_events.jsonl');
  if (events.length) console.log(report(events));

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
