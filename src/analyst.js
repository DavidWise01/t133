// =====================================================================
// T133_analyst.js
// TOPOLOGY: T133:PHASE-SHADOW / LOG ANALYSIS
// T059:ACCUMULATION · T056:CORRELATION · T060:MATERIALITY
//
// Parse the JSONL event log and surface:
//   - Top offending IPs
//   - Agent fingerprints
//   - Survival time distribution
//   - Early-drop vs wall-hit ratio
//   - Path hit frequency
// =====================================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const cfg  = require('./config');

const JSONL_PATH = path.join(cfg.log.dir, cfg.log.jsonFile);

function loadEvents(filePath = JSONL_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function analyze(events) {
  if (!events.length) return { total: 0, message: 'No events logged yet.' };

  const total       = events.length;
  const byOutcome   = {};
  const byIp        = {};
  const byAgent     = {};
  const byPath      = {};
  const byTrigger   = {};
  const durations   = [];
  const windings    = [];

  for (const e of events) {
    // Outcome
    byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + 1;

    // IP
    const ip = e.ip || 'UNKNOWN';
    byIp[ip] = (byIp[ip] || 0) + 1;

    // Agent — truncate to first 60 chars
    const ua = (e.ua || 'NONE').slice(0, 60);
    byAgent[ua] = (byAgent[ua] || 0) + 1;

    // Path
    const url = e.url || '/';
    byPath[url] = (byPath[url] || 0) + 1;

    // Trigger
    byTrigger[e.trigger || 'unknown'] = (byTrigger[e.trigger || 'unknown'] || 0) + 1;

    if (e.durationMs) durations.push(e.durationMs);
    if (e.windingNumber) windings.push(e.windingNumber);
  }

  const sorted     = arr => arr.slice().sort((a,b) => a-b);
  const median     = arr => { const s = sorted(arr); return s[Math.floor(s.length/2)] || 0; };
  const pct        = (n, d) => d ? ((n/d)*100).toFixed(1)+'%' : '0%';
  const topN       = (obj, n=10) =>
    Object.entries(obj).sort(([,a],[,b]) => b-a).slice(0,n)
      .map(([k,v]) => ({ value: k, count: v }));

  const wallHit    = byOutcome['COHERENCE_WALL_REACHED']  || 0;
  const earlyDrop  = byOutcome['SCRAPER_DROPPED_EARLY']   || 0;
  const overflow   = byOutcome['TRAP_OVERFLOW_REJECTED']  || 0;

  return {
    total,
    window: {
      first: events[0]?.ts,
      last:  events[events.length-1]?.ts,
    },
    outcomes: {
      wallHit,   wallHitPct:   pct(wallHit,  total),
      earlyDrop, earlyDropPct: pct(earlyDrop, total),
      overflow,  overflowPct:  pct(overflow,  total),
    },
    triggers:   byTrigger,
    duration: {
      medianMs:  median(durations),
      maxMs:     Math.max(...durations, 0),
      minMs:     Math.min(...durations, Infinity) === Infinity ? 0 : Math.min(...durations),
      totalHeld: durations.reduce((a,b) => a+b, 0),
    },
    winding: {
      median:   median(windings),
      max:      Math.max(...windings, 0),
    },
    topIps:    topN(byIp),
    topAgents: topN(byAgent),
    topPaths:  topN(byPath),
  };
}

function report(events) {
  const r   = analyze(events);
  const hr  = ms => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
  const lines = [];
  const add  = s => lines.push(s);

  add(`\n╔══════════════════════════════════════════════════════════════════`);
  add(`║  T133:PHASE-SHADOW  TARPIT REPORT`);
  add(`║  ${r.window?.first || '—'}  →  ${r.window?.last || '—'}`);
  add(`╚══════════════════════════════════════════════════════════════════`);
  add(`\n  TOTAL EVENTS       ${r.total}`);
  add(`  WALL HIT           ${r.outcomes.wallHit}  (${r.outcomes.wallHitPct})`);
  add(`  EARLY DROP         ${r.outcomes.earlyDrop}  (${r.outcomes.earlyDropPct})`);
  add(`  OVERFLOW REJECTED  ${r.outcomes.overflow}  (${r.outcomes.overflowPct})`);
  add(`\n  DURATION    median ${hr(r.duration.medianMs)}  max ${hr(r.duration.maxMs)}  total held ${hr(r.duration.totalHeld)}`);
  add(`  WINDING     median ${r.winding.median?.toFixed(2)}  max ${r.winding.max?.toFixed(2)}`);

  add(`\n  TRIGGERS`);
  for (const [k,v] of Object.entries(r.triggers || {})) add(`    ${k.padEnd(20)} ${v}`);

  add(`\n  TOP IPs`);
  (r.topIps||[]).forEach(({value,count}) => add(`    ${value.padEnd(40)} ${count}`));

  add(`\n  TOP USER-AGENTS`);
  (r.topAgents||[]).forEach(({value,count}) => add(`    ${value.padEnd(60)} ${count}`));

  add(`\n  TOP PATHS`);
  (r.topPaths||[]).forEach(({value,count}) => add(`    ${value.padEnd(50)} ${count}`));

  add(`\n═══════════════════════════════════════════════════════════════════\n`);
  return lines.join('\n');
}

// ── CLI: node T133_analyst.js [path/to/events.jsonl] ───────────────────
if (require.main === module) {
  const filePath = process.argv[2] || JSONL_PATH;
  const events   = loadEvents(filePath);
  console.log(report(events));
}

module.exports = { loadEvents, analyze, report };
