/**
 * Site-maturity cadence ramp — anti-Google-detection.
 *
 * Maps an (niche, market) site to a publication budget based on how many
 * articles already exist in data/published-urls.json. Young sites publish
 * slowly and on fewer days per week; mature sites get the full daily cap.
 * The mechanism is fully automatic — no manual flag toggles — and is the
 * single source of truth shared by article-generator (defensive cap) and
 * the workflow gate (cadence-cli, early skip).
 *
 * See CLAUDE.md "Cadence & ramp" for the rationale.
 */
import { readPublished } from './queue.js';

const STAGES = [
  // Sorted by `min` ascending. The first stage whose `min` is ≤ count wins.
  //
  // affiliateCap is the per-workflow-run max. The cross-workflow 1/day rule
  // (publishedToday() below) is the hard cap and supersedes this — affCap=1
  // everywhere makes that intent explicit and avoids same-run double-publish.
  { name: 'mature',  min: 80, affiliateCap: 1, guideCap: 1, allowInformational: true,  activeDaysPerWeek: 7 },
  { name: 'ramping', min: 30, affiliateCap: 1, guideCap: 1, allowInformational: true,  activeDaysPerWeek: 7 },
  { name: 'warming', min: 10, affiliateCap: 1, guideCap: 1, allowInformational: true,  activeDaysPerWeek: 5 },
  { name: 'sandbox', min: 0,  affiliateCap: 1, guideCap: 0, allowInformational: false, activeDaysPerWeek: 4 },
];

function pickStage(publishedCount) {
  // Iterate descending so the first match is the highest-tier stage the site qualifies for.
  for (const s of STAGES) if (publishedCount >= s.min) return s;
  return STAGES[STAGES.length - 1];   // defensive: shouldn't be reachable
}

/**
 * Count of `published` entries in data/published-urls.json for (niche, market).
 * Drafts, errors, and `absorbed-by-cluster` keywords are NOT counted — only
 * URLs that actually landed on the production site.
 */
export function countPublished(niche, market) {
  return readPublished().filter(e => e?.niche === niche && e?.market === market).length;
}

/**
 * Count of articles already published today (UTC date) for (niche, market).
 *
 * Cross-workflow guard: daily-articles, daily-guides and weekly-informational
 * all run on independent cron crontabs and could otherwise stack on the same
 * day. Google's spam-detection looks for "n articles dropped at H+0 every X
 * days" — keeping it strictly 1/day across workflows is the cheapest defence.
 * cadence-cli rejects the run when this returns > 0.
 */
export function publishedToday(niche, market, today = new Date()) {
  const dateStr = dateKey(today);
  return readPublished().filter(e =>
    e?.niche === niche &&
    e?.market === market &&
    typeof e.publishedAt === 'string' &&
    e.publishedAt.startsWith(dateStr)
  ).length;
}

/**
 * Stable string hash (FNV-1a 32-bit) — deterministic across Node versions,
 * unlike `crypto` which would over-engineer this. Used to derive site- and
 * date-specific integers for the active-day and slot-election predicates.
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Murmur3 finalizer — scrambles low bits so `hash % N` is uniform for small
 * N. FNV-1a alone leaves low-bit biases when inputs share structural
 * patterns (which our YYYY-MM-DD strings absolutely do), causing `% 4` to
 * collapse to a single bucket.
 */
function mix32(x) {
  x = ((x ^ (x >>> 16)) * 0x85ebca6b) >>> 0;
  x = ((x ^ (x >>> 13)) * 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function dateKey(today) {
  // YYYY-MM-DD in UTC. The workflow runs in UTC so consistency follows.
  return today.toISOString().slice(0, 10);
}

function siteKey(niche, market) {
  return `${niche}/${market}`;
}

/**
 * Is today a publication day for this site?
 *
 *   activeDaysPerWeek >= 7 → always true (no skip).
 *   Otherwise: deterministic hash mod 7. Each site gets its own pseudo-random
 *   subset of weekdays. Re-running on the same date returns the same verdict
 *   (no flapping). Different markets get disjoint skip patterns ≥ 50% of the
 *   time, which staggers publication across FR/US/GB.
 */
export function isActiveDay(today, niche, market, activeDaysPerWeek) {
  if (activeDaysPerWeek >= 7) return true;
  if (activeDaysPerWeek <= 0) return false;
  const h = mix32(fnv1a(dateKey(today)) ^ fnv1a(siteKey(niche, market)));
  return (h % 7) < activeDaysPerWeek;
}

/**
 * Which slot (0..numSlots-1) is elected today for this site? Used to honour
 * exactly one of the workflow's multi-cron entries per day. Deterministic so
 * a manual re-run lands on the same slot.
 */
export function electedSlot(today, niche, market, numSlots) {
  if (numSlots <= 1) return 0;
  // Different mixing constant than isActiveDay so the slot election doesn't
  // correlate with the active-day decision (independence avoids "site always
  // publishes on its active day at the same slot").
  const h = mix32(fnv1a('slot:' + dateKey(today)) ^ fnv1a(siteKey(niche, market)));
  return h % numSlots;
}

/**
 * Resolve the full cadence verdict for one (niche, market) at a given date.
 * `publishedCount` can be injected for tests; defaults to a live read.
 */
export function getCadence(niche, market, { today = new Date(), publishedCount } = {}) {
  const count = publishedCount ?? countPublished(niche, market);
  const stage = pickStage(count);
  const todayCount = publishedToday(niche, market, today);
  return {
    stage: stage.name,
    publishedCount: count,
    publishedToday: todayCount,
    affiliateCap: stage.affiliateCap,
    guideCap: stage.guideCap,
    allowInformational: stage.allowInformational,
    activeDaysPerWeek: stage.activeDaysPerWeek,
    activeToday: isActiveDay(today, niche, market, stage.activeDaysPerWeek),
  };
}

// Exported for tests.
export const __internals = { STAGES, fnv1a, pickStage };
