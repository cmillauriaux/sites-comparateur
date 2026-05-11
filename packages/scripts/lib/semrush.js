/**
 * Semrush Analytics API v3 client — `phrase_fullsearch` (Keyword Magic Tool's
 * broad-match report) with on-disk caching.
 *
 * Cost model (verified against developer.semrush.com):
 *   - phrase_fullsearch = 20 API units per ROW returned (not per call)
 *   - server-side filtering via display_filter is free → push as much filtering
 *     to the server as possible to avoid paying for rows we'd reject anyway.
 *
 * Cache: each (database, phrase, filterSig) → CSV file in data/semrush-cache/.
 * TTL = 14 days (volume/KD don't move materially over that window for the
 * long-tail we target). `--no-cache` on the orchestrator forces a refresh.
 *
 * Response format: CSV with `;` separator. With export_escape=1 fields are
 * wrapped in double quotes. We parse manually (tiny grammar, no dep).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DATA_DIR, requireEnv } from './env.js';

const SEMRUSH_BASE = 'https://api.semrush.com/';
const CACHE_DIR = resolve(DATA_DIR, 'semrush-cache');
const CACHE_TTL_DAYS = 14;
const COST_PER_ROW = 20;
const DEFAULT_LIMIT = 100;

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey({ database, phrase, filter, limit, columns }) {
  const sig = JSON.stringify({ database, phrase, filter, limit, columns });
  return createHash('sha1').update(sig).digest('hex').slice(0, 16);
}

function cachePath(key, database) {
  return join(CACHE_DIR, `${database}-${key}.csv`);
}

function isCacheFresh(path) {
  if (!existsSync(path)) return false;
  const ageMs = Date.now() - statSync(path).mtimeMs;
  return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Map Semrush's human-friendly CSV headers (returned even when we pass
 * `export_columns=Ph,Nq,...`) onto the short column codes the rest of the
 * code reads. Keeps callers using the codes documented in the API spec.
 */
const HEADER_TO_CODE = {
  'Keyword': 'Ph',
  'Search Volume': 'Nq',
  'CPC': 'Cp',
  'Competition': 'Co',
  'Number of Results': 'Nr',
  'Keyword Difficulty Index': 'Kd',
  'Intent': 'In',
  'Trends': 'Td',
  'SERP Features': 'Fk',
};

/**
 * Parse a Semrush CSV with `;` separator and `export_escape=1` quoting.
 * The grammar is small enough that a hand-rolled parser beats pulling a CSV
 * dependency for 200 lines of input.
 */
function parseSemrushCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ';' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  // Normalize headers: prefer the short code (HEADER_TO_CODE), keep raw
  // header as fallback so unknown columns aren't silently dropped.
  const rawHeaders = splitLine(lines[0]);
  const headers = rawHeaders.map(h => HEADER_TO_CODE[h] ?? h);
  const rows = lines.slice(1).map(line => {
    const cells = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

/**
 * Build a Semrush display_filter expression from a list of clauses.
 *
 * Clause shape: { sign: '+' | '-', column: 'Nq'|'Kd'|..., op: 'Gt'|'Lt'|'Eq'|'Bw', value: number }
 * Wire format:  "+|Nq|Gt|199|+|Kd|Lt|30"  (clauses joined by `|`, all AND-ed)
 */
function buildDisplayFilter(clauses) {
  return clauses
    .map(c => `${c.sign}|${c.column}|${c.op}|${c.value}`)
    .join('|');
}

/**
 * Fetch broad-match keywords from Semrush for a single seed phrase.
 *
 * @param {object}   opts
 * @param {string}   opts.phrase      Seed phrase (e.g. "robot tondeuse")
 * @param {string}   opts.database    Semrush database code ('fr', 'us', 'uk')
 * @param {number}   opts.minVolume   Server-side volume floor (Nq > minVolume)
 * @param {number}   opts.maxKD       Server-side KD ceiling (Kd < maxKD)
 * @param {number}   [opts.maxVolume] Server-side volume ceiling (Nq < maxVolume)
 * @param {number}   [opts.limit]     Row limit (default 100)
 * @param {boolean}  [opts.noCache]   Bypass cache
 * @returns {Promise<{rows: object[], cached: boolean, cost: number}>}
 */
export async function fetchBroadMatch({ phrase, database, minVolume, maxKD, maxVolume = null, limit = DEFAULT_LIMIT, noCache = false }) {
  ensureCacheDir();

  const columns = 'Ph,Nq,Cp,Co,Kd,In,Td';
  // `Gt` is strict (>), so "Nq > minVolume - 1" gives us "Nq >= minVolume".
  // Same for `Lt` (<) on KD: "Kd < maxKD + 1" gives us "Kd <= maxKD".
  const clauses = [
    { sign: '+', column: 'Nq', op: 'Gt', value: Math.max(0, minVolume - 1) },
    { sign: '+', column: 'Kd', op: 'Lt', value: maxKD + 1 },
  ];
  if (maxVolume != null) {
    clauses.push({ sign: '+', column: 'Nq', op: 'Lt', value: maxVolume + 1 });
  }
  const filter = buildDisplayFilter(clauses);

  const key = cacheKey({ database, phrase, filter, limit, columns });
  const cacheFile = cachePath(key, database);

  if (!noCache && isCacheFresh(cacheFile)) {
    const text = readFileSync(cacheFile, 'utf-8');
    const { rows } = parseSemrushCsv(text);
    return { rows, cached: true, cost: 0 };
  }

  const params = new URLSearchParams({
    type: 'phrase_fullsearch',
    key: requireEnv('SEMRUSH_API_KEY'),
    phrase,
    database,
    display_limit: String(limit),
    display_sort: 'nq_desc',
    display_filter: filter,
    export_columns: columns,
    export_escape: '1',
  });

  const url = `${SEMRUSH_BASE}?${params.toString()}`;
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Semrush HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  // Semrush returns "ERROR ## :: <message>" as plain text on quota / auth /
  // empty-result conditions (HTTP 200). Detect and surface those.
  if (text.startsWith('ERROR')) {
    // "ERROR 50 :: NOTHING FOUND" is benign — empty result for that seed.
    if (/NOTHING FOUND/i.test(text)) {
      writeFileSync(cacheFile, ''); // cache the empty miss
      return { rows: [], cached: false, cost: 0 };
    }
    throw new Error(`Semrush API: ${text.trim()}`);
  }

  writeFileSync(cacheFile, text);
  const { rows } = parseSemrushCsv(text);
  return { rows, cached: false, cost: rows.length * COST_PER_ROW };
}

/**
 * Normalize a row from Ph,Nq,Cp,Co,Kd,In,Td into typed fields.
 *
 * `In` (intent) values from Semrush:
 *   0 = Commercial, 1 = Informational, 2 = Navigational, 3 = Transactional
 * `Td` (trends) is 12 comma-separated monthly values, last one is most recent.
 */
export function normalizeRow(row) {
  const intentCode = parseInt(row.In ?? '', 10);
  const intentMap = { 0: 'commercial', 1: 'informational', 2: 'navigational', 3: 'transactional' };
  const trends = (row.Td ?? '').split(',').map(v => parseFloat(v)).filter(v => !isNaN(v));
  return {
    keyword: row.Ph,
    volume: parseInt(row.Nq, 10) || 0,
    cpc: parseFloat(row.Cp) || 0,
    competition: parseFloat(row.Co) || 0,
    kd: parseFloat(row.Kd) || 0,
    semrushIntent: intentMap[intentCode] ?? null,
    trends,
  };
}
