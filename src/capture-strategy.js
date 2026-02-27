const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const OVERRIDE_PATH = process.env.CAPTURE_STRATEGY_FILE || path.join(process.cwd(), 'config', 'capture-strategy.overrides.json');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseUsernameFromMessage(message) {
  if (!message) return null;
  const m = message.match(/for\s+([@a-zA-Z0-9_.-]+)/i);
  return m ? m[1].replace(/^@+/, '') : null;
}

function loadOverrides() {
  if (!fs.existsSync(OVERRIDE_PATH)) {
    return { byCountry: {}, byUsername: {} };
  }

  try {
    const json = JSON.parse(fs.readFileSync(OVERRIDE_PATH, 'utf8'));
    return {
      byCountry: json.byCountry || {},
      byUsername: json.byUsername || {}
    };
  } catch (err) {
    logger.warn('Failed to parse capture strategy override file', { error: err.message, path: OVERRIDE_PATH });
    return { byCountry: {}, byUsername: {} };
  }
}

function collectRecentStats(accountMap, maxLogFiles = 5) {
  const result = {
    byUsername: new Map(),
    byCountry: new Map()
  };

  const files = logger.getLogFiles().slice(0, maxLogFiles);

  for (const f of files) {
    const fullPath = path.join(logger.logDir || './logs', f.name);
    if (!fs.existsSync(fullPath)) continue;

    const lines = fs.readFileSync(fullPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split('] ');
      if (parts.length < 3) continue;
      const messageAndMeta = parts.slice(2).join('] ');

      const username = parseUsernameFromMessage(messageAndMeta);
      if (!username) continue;

      const normalized = username.replace(/^@+/, '');
      if (!result.byUsername.has(normalized)) {
        result.byUsername.set(normalized, {
          blackWarnings: 0,
          renderTimeouts: 0,
          recoveredCaptures: 0
        });
      }

      const stats = result.byUsername.get(normalized);
      if (messageAndMeta.includes('Likely black screen')) stats.blackWarnings += 1;
      if (messageAndMeta.includes('Stream not confirmed renderable')) stats.renderTimeouts += 1;
      if (messageAndMeta.includes('Recovered non-black screenshot')) stats.recoveredCaptures += 1;

      const country = accountMap.get(normalized) || 'DEFAULT';
      if (!result.byCountry.has(country)) {
        result.byCountry.set(country, {
          blackWarnings: 0,
          renderTimeouts: 0,
          recoveredCaptures: 0
        });
      }
      const c = result.byCountry.get(country);
      if (messageAndMeta.includes('Likely black screen')) c.blackWarnings += 1;
      if (messageAndMeta.includes('Stream not confirmed renderable')) c.renderTimeouts += 1;
      if (messageAndMeta.includes('Recovered non-black screenshot')) c.recoveredCaptures += 1;
    }
  }

  return result;
}

function getDynamicCapturePolicy({ username, country, stats, overrides }) {
  const baseMinBytes = Number(process.env.MIN_SCREENSHOT_BYTES || 28000);
  const baseWaitLoops = Number(process.env.STREAM_WAIT_LOOPS || 20);
  const baseCaptureAttempts = Number(process.env.CAPTURE_ATTEMPTS || 3);

  const userStats = stats.byUsername.get(username) || { blackWarnings: 0, renderTimeouts: 0, recoveredCaptures: 0 };
  const countryStats = stats.byCountry.get(country || 'DEFAULT') || { blackWarnings: 0, renderTimeouts: 0, recoveredCaptures: 0 };

  const blackScore = userStats.blackWarnings * 2 + countryStats.blackWarnings;
  const timeoutScore = userStats.renderTimeouts * 2 + countryStats.renderTimeouts;

  let minScreenshotBytes = baseMinBytes;
  let streamWaitLoops = baseWaitLoops;
  let captureAttempts = baseCaptureAttempts;

  if (blackScore >= 3) minScreenshotBytes += 8000;
  if (blackScore >= 8) minScreenshotBytes += 12000;
  if (timeoutScore >= 2) streamWaitLoops += 6;
  if (timeoutScore >= 6) streamWaitLoops += 8;

  if (blackScore >= 5 || timeoutScore >= 4) {
    captureAttempts += 1;
  }

  // country overrides
  const countryOverride = overrides.byCountry[country] || overrides.byCountry[(country || '').toUpperCase()] || null;
  if (countryOverride) {
    if (Number.isFinite(countryOverride.minScreenshotBytes)) minScreenshotBytes = countryOverride.minScreenshotBytes;
    if (Number.isFinite(countryOverride.streamWaitLoops)) streamWaitLoops = countryOverride.streamWaitLoops;
    if (Number.isFinite(countryOverride.captureAttempts)) captureAttempts = countryOverride.captureAttempts;
  }

  // username overrides highest priority
  const userOverride = overrides.byUsername[username] || null;
  if (userOverride) {
    if (Number.isFinite(userOverride.minScreenshotBytes)) minScreenshotBytes = userOverride.minScreenshotBytes;
    if (Number.isFinite(userOverride.streamWaitLoops)) streamWaitLoops = userOverride.streamWaitLoops;
    if (Number.isFinite(userOverride.captureAttempts)) captureAttempts = userOverride.captureAttempts;
  }

  minScreenshotBytes = clamp(minScreenshotBytes, 15000, 90000);
  streamWaitLoops = clamp(streamWaitLoops, 10, 45);
  captureAttempts = clamp(captureAttempts, 2, 6);

  return {
    minScreenshotBytes,
    streamWaitLoops,
    captureAttempts,
    renderableTimeoutMs: streamWaitLoops * 2500,
    reason: {
      country: country || null,
      userStats,
      countryStats,
      blackScore,
      timeoutScore,
      hasCountryOverride: Boolean(countryOverride),
      hasUserOverride: Boolean(userOverride)
    }
  };
}

module.exports = {
  loadOverrides,
  collectRecentStats,
  getDynamicCapturePolicy,
  OVERRIDE_PATH
};