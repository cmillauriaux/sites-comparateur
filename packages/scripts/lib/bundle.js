/**
 * Topical-bundle data model.
 *
 * A "bundle" is a 3-article topical cluster: comparatif + pillar guide + avis
 * on the comparatif's top product. They cross-link to form a SEO cluster
 * that Google can recognise as topical authority.
 *
 *   - The COMPARATIF ships first. No external dependencies; identifies the
 *     #1 product (name + ASIN) for the avis slot.
 *   - The PILLAR ships second. Links back to the live comparatif using its
 *     real URL (no fabrication risk).
 *   - The AVIS ships third. Single-product deep dive on the comparatif's
 *     winner. Links back to both siblings.
 *
 * One bundle slot ships per active day (respecting the cross-workflow 1/day
 * cadence rule), so a complete bundle lands over 3 active days. With sandbox
 * stage = 4 active days/week, that's roughly one bundle per week.
 *
 * Bundle state lives inside the existing `data/semrush-priorities.json`
 * opportunity shape under the new `bundle` key. Legacy opps without that
 * key are migrated lazily by initBundle() so existing data isn't lost.
 */
import slugger from 'github-slugger';
import { readPublished } from './queue.js';

const slug = new slugger();

/** Cluster intents that participate in bundles. Informational pieces still
 *  exist outside this model (for now, via the weekly workflow). */
export const BUNDLE_SLOTS = ['comparatif', 'pillar', 'avis'];

/** Subdir mapping by slot. Matches the dynamic page route's segmentByIntent.
 *  Note: "pillar" is rendered as a guide on the site (intent='guide'). */
export const SLOT_INTENT = {
  comparatif: 'comparatif',
  pillar:     'guide',
  avis:       'avis',
};

/** Path segment per slot for a given market. Mirrors i18n#slug* but kept
 *  here so bundle.js doesn't need a runtime dep on the config package — the
 *  URLs we compute are deterministic and the workflow already handles i18n
 *  via the Astro dynamic route. */
const SEGMENT_FR = { comparatif: 'comparatifs', pillar: 'guides', avis: 'avis' };
const SEGMENT_EN = { comparatif: 'comparisons', pillar: 'guides', avis: 'reviews' };

function segmentFor(market, slot) {
  const table = market === 'fr' ? SEGMENT_FR : SEGMENT_EN;
  return table[slot];
}

/** Slug from a free-text keyword. Stable across runs. */
export function slugFromKeyword(s) {
  return slug.slug(s);
}

/** Pillar keyword convention: "comment choisir un <topic>" (FR) / "how to
 *  choose <topic>" (EN). The <topic> is the comparatif's primary keyword
 *  stripped of buying-intent qualifiers ("meilleur", "top", year). */
export function derivePillarKeyword(comparatifKeyword, market) {
  const isFr = market === 'fr';
  const topic = stripBuyIntent(comparatifKeyword, isFr).trim();
  return isFr ? `comment choisir ${withArticle(topic, true)}` : `how to choose a ${topic}`;
}

function stripBuyIntent(kw, isFr) {
  let out = kw.toLowerCase();
  const stop = isFr
    ? /\b(meilleur(?:e|s|es)?|top|comparatif|guide d'achat|guide achat|en\s+\d{4}|\d{4})\b/g
    : /\b(best|top|comparison|review|reviews|in\s+\d{4}|\d{4})\b/g;
  out = out.replace(stop, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

function withArticle(topic, isFr) {
  if (!isFr) return topic;
  // crude "un / une" — defaults to "un" since most jardin/bricolage topics
  // are masculine. The model rewrites the H1 from the keyword anyway, so a
  // wrong article in the keyword string is a minor cosmetic issue, not an
  // SEO one (the URL uses the slug, not the article).
  if (/^[aeiouhâêîôû]/i.test(topic)) return `un ${topic}`;
  return `un ${topic}`;
}

/** Build the complete URL the bundle's article will land at, given the
 *  site origin + market. Used by the prompt to instruct cross-linking. */
export function bundleSlotUrl({ siteOrigin, market, slot, keyword }) {
  const seg = segmentFor(market, slot);
  if (!seg || !keyword) return null;
  return `${siteOrigin.replace(/\/$/, '')}/${seg}/${slugFromKeyword(keyword)}/`;
}

/**
 * Lazy-initialise the `bundle` block on a priorities opp. Idempotent: if
 * `opp.bundle` is already populated, returns it unchanged.
 *
 * Currently only the comparatif and pillar slots can be initialised
 * upfront. The avis keyword is derived AFTER the comparatif ships (it
 * keys on the comparatif's #1 product), so its slot starts with
 * keyword=null and gets filled in markBundleSlotShipped('comparatif', ...).
 */
export function initBundle(opp, market) {
  if (opp.bundle) return opp.bundle;
  const compKeyword = opp.primaryKeyword;
  const pillarKeyword = derivePillarKeyword(compKeyword, market);
  opp.bundle = {
    comparatif: { keyword: compKeyword,   slug: slugFromKeyword(compKeyword),   status: 'pending', url: null, publishedAt: null, topProductName: null, topProductAsin: null },
    pillar:     { keyword: pillarKeyword, slug: slugFromKeyword(pillarKeyword), status: 'pending', url: null, publishedAt: null },
    avis:       { keyword: null,          slug: null,                            status: 'pending', url: null, publishedAt: null },
  };
  return opp.bundle;
}

/** Mark a slot shipped. For the comparatif slot, also seeds the avis slot
 *  with the keyword/slug derived from the #1 product so the next active
 *  day can pick it up. */
export function markBundleSlotShipped(opp, slot, { url, publishedAt, topProductName, topProductAsin } = {}) {
  if (!opp.bundle) return;
  const s = opp.bundle[slot];
  if (!s) return;
  s.status = 'generated';
  s.url = url ?? null;
  s.publishedAt = publishedAt ?? new Date().toISOString();

  if (slot === 'comparatif' && topProductName) {
    s.topProductName = topProductName;
    s.topProductAsin = topProductAsin ?? null;
    if (!opp.bundle.avis.keyword) {
      const avisKeyword = `${topProductName} avis`;
      opp.bundle.avis.keyword = avisKeyword;
      opp.bundle.avis.slug = slugFromKeyword(avisKeyword);
    }
  }

  // Roll up the legacy `status` field — a bundle is "generated" only when
  // every slot has shipped. Partial bundles report 'partial' so external
  // tools can still distinguish them.
  const allDone = BUNDLE_SLOTS.every(k => opp.bundle[k].status === 'generated');
  const anyDone = BUNDLE_SLOTS.some(k => opp.bundle[k].status === 'generated');
  opp.status = allDone ? 'generated' : anyDone ? 'partial' : 'pending';
}

/** Mark a slot as having failed validation past its retry budget. */
export function markBundleSlotFailed(opp, slot, reason) {
  if (!opp.bundle?.[slot]) return;
  opp.bundle[slot].status = 'failed';
  opp.bundle[slot].lastError = reason ?? null;
}

/**
 * Picker: return the next bundle slot to generate for (niche, market).
 *
 *   1. Resume any partial bundle whose next-in-order slot is `pending` and
 *      whose previous slots are all `generated`. (Comparatif must ship before
 *      pillar; pillar must ship before avis.)
 *   2. Otherwise, pick the highest-score brand-new opp (status='pending' AND
 *      no `bundle` block yet) and start its comparatif slot. initBundle()
 *      will be called by the caller after picking.
 *
 *  Returns null when the priorities registry holds no actionable bundle
 *  work for this (niche, market). Caller should log + skip — the operator
 *  is expected to re-run semrush-prioritize.js to refill the registry.
 */
export function pickNextBundleSlot(priorities, niche, market) {
  const opps = priorities?.[niche]?.[market] || [];

  // Pre-rank by score descending so equal-priority comparisons fall back
  // to the higher-value bundle.
  const ranked = [...opps].sort((a, b) => (b.score || 0) - (a.score || 0));

  // 1) FINISH PARTIAL BUNDLES FIRST. The user-facing intent is "ship pillar
  //    + comparatif + avis adossés" — a half-done bundle without its pillar
  //    or its avis is a weaker SEO cluster than a brand-new comparatif on
  //    its own. So we prioritise the NEXT eligible slot of any partial
  //    bundle over starting a fresh one. Within partial bundles, we still
  //    rank by score (highest-value cluster gets completed first).
  for (const opp of ranked) {
    if (!opp.bundle) continue;
    const b = opp.bundle;
    // avis comes after comparatif + after we know its keyword (seeded by
    // the comparatif's top product), so check pillar before avis.
    if (b.comparatif.status === 'generated') {
      if (b.pillar.status === 'pending' && (b.pillar.errorCount || 0) < 3) {
        return { kind: 'bundle-resume', opp, slot: 'pillar' };
      }
      if (b.avis.status === 'pending' && b.avis.keyword && (b.avis.errorCount || 0) < 3) {
        return { kind: 'bundle-resume', opp, slot: 'avis' };
      }
    }
  }

  // 2) No partial bundle to finish — pick the next-best opp that still
  //    needs its comparatif. This includes both already-migrated bundles
  //    (status='pending' across all 3 slots) and brand-new fresh opps
  //    (no bundle field yet).
  for (const opp of ranked) {
    if ((opp.errorCount || 0) >= 3) continue;
    if (opp.status === 'rejected' || opp.status === 'generated') continue;

    if (opp.bundle) {
      const c = opp.bundle.comparatif;
      if (c.status === 'pending' && (c.errorCount || 0) < 3) {
        return { kind: 'bundle-resume', opp, slot: 'comparatif' };
      }
      continue;   // partial-completed but no slots eligible from here
    }

    // Fresh opp (no bundle). Only comparatif intent seeds a new bundle;
    // legacy guide/avis intents are folded by migrateBundleFromLegacy().
    if (opp.intent !== 'comparatif') continue;
    return { kind: 'bundle-fresh', opp, slot: 'comparatif' };
  }

  return null;
}

/**
 * Migrate legacy opportunity shapes to bundles (in-place mutation).
 *
 *   - A `comparatif` opp without `bundle` → init a bundle. If its
 *     publishedUrl is set (status='generated' in legacy), mark the
 *     comparatif slot generated.
 *   - A `guide` opp with `parentClusterId` referring to a comparatif opp →
 *     merge into that bundle's pillar slot. If the guide has a publishedUrl,
 *     mark pillar.status=generated.
 *   - A `guide` opp without a parent → promote to a standalone bundle (its
 *     pillar slot is the seed; a derived comparatif is added with
 *     status=pending so the picker generates a comparatif next).
 *
 * Returns the count of opps migrated (for logging).
 */
export function migrateBundleFromLegacy(priorities, market) {
  if (!priorities) return 0;
  let migrated = 0;
  for (const niche of Object.keys(priorities)) {
    for (const m of Object.keys(priorities[niche] || {})) {
      if (m !== market) continue;
      const opps = priorities[niche][m];
      for (const opp of opps) {
        if (opp.bundle) continue;
        if (opp.intent === 'comparatif') {
          initBundle(opp, m);
          if (opp.publishedUrl) {
            opp.bundle.comparatif.status = 'generated';
            opp.bundle.comparatif.url = opp.publishedUrl;
            opp.bundle.comparatif.publishedAt = opp.generatedAt ?? null;
          }
          opp.status = recomputeRollupStatus(opp);
          migrated++;
        } else if (opp.intent === 'guide') {
          // Standalone pillar — promote it to a bundle. The comparatif
          // keyword is derived by stripping "comment choisir" / "how to choose"
          // back to the topic. Best effort; can be edited later.
          const compKeyword = comparatifFromPillar(opp.primaryKeyword, m);
          opp.bundle = {
            comparatif: { keyword: compKeyword, slug: slugFromKeyword(compKeyword), status: 'pending', url: null, publishedAt: null, topProductName: null, topProductAsin: null },
            pillar:     { keyword: opp.primaryKeyword, slug: slugFromKeyword(opp.primaryKeyword), status: 'pending', url: null, publishedAt: null },
            avis:       { keyword: null, slug: null, status: 'pending', url: null, publishedAt: null },
          };
          if (opp.publishedUrl) {
            opp.bundle.pillar.status = 'generated';
            opp.bundle.pillar.url = opp.publishedUrl;
            opp.bundle.pillar.publishedAt = opp.generatedAt ?? null;
          }
          // Promote the legacy intent to 'comparatif' since the bundle now
          // primarily tracks the comparatif slot for picker purposes.
          opp.intent = 'comparatif';
          opp.primaryKeyword = compKeyword;
          opp.status = recomputeRollupStatus(opp);
          migrated++;
        }
      }
    }
  }
  return migrated;
}

function recomputeRollupStatus(opp) {
  if (!opp.bundle) return opp.status;
  const allDone = BUNDLE_SLOTS.every(k => opp.bundle[k].status === 'generated');
  const anyDone = BUNDLE_SLOTS.some(k => opp.bundle[k].status === 'generated');
  return allDone ? 'generated' : anyDone ? 'partial' : 'pending';
}

function comparatifFromPillar(pillarKeyword, market) {
  const isFr = market === 'fr';
  let core = pillarKeyword.toLowerCase()
    .replace(/^comment\s+choisir\s+(une?\s+|des\s+|le\s+|la\s+)?/i, '')
    .replace(/^how\s+to\s+choose\s+(an?\s+|the\s+)?/i, '')
    .replace(/^guide\s+(d'achat\s+)?/i, '')
    .replace(/^buying\s+guide\s+for\s+/i, '')
    .trim();
  if (!core) core = pillarKeyword;
  return isFr ? `meilleur ${core}` : `best ${core}`;
}

/** Cross-link context used by the prompt: what URLs the model is ALLOWED
 *  to reference in the body. Includes bundle siblings (live and not-yet-
 *  shipped — but only the ALREADY-GENERATED ones, so we never instruct the
 *  model to fabricate a forward link). */
export function buildBundleLinkContext(opp, market, siteOrigin) {
  if (!opp?.bundle) return { live: {}, planned: {} };
  const ctx = { live: {}, planned: {} };
  for (const slot of BUNDLE_SLOTS) {
    const s = opp.bundle[slot];
    if (!s?.keyword) continue;
    const url = s.url || bundleSlotUrl({ siteOrigin, market, slot, keyword: s.keyword });
    if (s.status === 'generated' && s.url) {
      ctx.live[slot] = { url: s.url, title: s.keyword };
    } else {
      ctx.planned[slot] = { url, title: s.keyword };
    }
  }
  return ctx;
}
