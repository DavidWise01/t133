// =====================================================================
// T133_config.js
// TOPOLOGY: T133:PHASE-SHADOW / TARPIT CONFIGURATION
// ARCHITECT: DAVID WISE (HB) | ROOT0 | TRIPOD-IP-v1.1
// =====================================================================
'use strict';

const path = require('path');

module.exports = {

  // ── TRAP TIMING ────────────────────────────────────────────────────
  // How long to hold a connection before terminal decoherence
  drain: {
    intervalMs:       500,    // ms between each chunk write
    coherenceWall:    600,    // max cycles before forced termination (300s at 500ms)
    jitterMs:         150,    // ±jitter added to interval — defeats timing fingerprinting
  },

  // ── f(β) COUPLING PARAMETERS ──────────────────────────────────────
  // Controls how fast the phase shadow appears to accumulate
  // β < 1.0 always — asymptote is the point, not the value
  coupling: {
    beta:             0.72,   // base Patricia pressure (0 < β < 1)
    drift:            true,   // enable cycle-by-cycle phase drift
    driftAmplitude:   0.003,  // radians of drift per cycle
  },

  // ── CONCURRENT TRAP LIMITS ────────────────────────────────────────
  // Prevent accidental DDoS of own server via trap accumulation
  concurrency: {
    maxActiveTraps:   64,     // max simultaneous held connections
    queueOverflow:    'drop', // 'drop' | 'immediate_terminate' when over limit
  },

  // ── FEED CONTENT ──────────────────────────────────────────────────
  // What to stream to the trapped client
  feed: {
    mode:             'phase_shadow',  // 'phase_shadow' | 'zeros' | 'custom'
    prefix:           '[T133_SHADOW_ZONE] ',
    includeTimestamp: true,
    terminalMessage:  '[TERMINAL_DECOHERENCE_REACHED]\n',
    dropMessage:      '[COHERENCE_LOST]\n',
  },

  // ── LOGGING ───────────────────────────────────────────────────────
  log: {
    dir:              path.join(__dirname, '../logs'),
    file:             'T133_PHASE_SHADOW_BREACH.log',
    jsonFile:         'T133_events.jsonl',   // machine-readable parallel log
    console:          false,                 // mirror to stdout
    redactIp:         false,                 // set true for GDPR contexts
  },

  // ── TRIGGER PATHS ─────────────────────────────────────────────────
  // Routes that automatically route into the tarpit
  // Extend or override in your Express integration
  triggerPaths: [
    '/wp-admin', '/wp-login.php', '/xmlrpc.php',
    '/.env', '/.git/config', '/config.php',
    '/api/v1/users', '/api/v1/harvest', '/api/v1/dump',
    '/admin', '/administrator', '/phpmyadmin',
    '/backup', '/db', '/database',
    '/etc/passwd', '/proc/self/environ',
    '/actuator', '/actuator/env', '/actuator/health',
    '/botscan', '/crawl', '/sitemap_index.xml',
  ],

  // ── TRIGGER USER-AGENTS (substring match) ─────────────────────────
  triggerAgents: [
    'Scrapy', 'curl/', 'python-requests', 'Go-http-client',
    'libwww-perl', 'zgrab', 'masscan', 'nmap',
    'sqlmap', 'nikto', 'dirbuster', 'gobuster',
    'semrushbot', 'dotbot', 'ahrefsbot', 'mj12bot',
  ],
};
