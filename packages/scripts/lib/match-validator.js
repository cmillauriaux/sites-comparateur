/**
 * Claude-validation pass over Amazon-DFS candidates.
 *
 * The matcher in product-images.js + match.js can filter obvious junk (wrong
 * brand, wrong SKU) via hard gates but cannot reliably distinguish "the
 * headline product" from "a high-end accessory whose listing happens to
 * match every token of the product name". Example: Husqvarna Automower 310
 * search returns the €1799 robot AND the €100 "Batterie Husqvarna Automower
 * 310 Compatible 18V" — both pass token-level scoring, the battery only
 * loses 0.6 from the accessory-penalty heuristic which the fallback loop in
 * product-images.js used to override.
 *
 * Solution: present the top N candidates (passing hard gates) to Claude and
 * let it pick the right ASIN per product, or "none" if all candidates are
 * obvious mismatches. Batched per article so we only burn one Claude call
 * regardless of how many products are in the comparatif.
 *
 * Cache: keyed on sha256(productName + sorted candidate ASINs). Re-running a
 * seed flow that re-queries the same products with the same DFS results
 * doesn't re-spend Claude credits.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DATA_DIR, requireEnv } from './env.js';

const CACHE_DIR = resolve(DATA_DIR, 'match-validation-cache');

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey({ productName, candidates }) {
  const asinList = candidates.map(c => c.asin).sort().join(',');
  const sig = `${productName}::${asinList}`;
  return createHash('sha256').update(sig).digest('hex').slice(0, 16);
}

function cachePath({ niche, market, productName, candidates }) {
  const key = cacheKey({ productName, candidates });
  return join(CACHE_DIR, `${niche}-${market}-${key}.json`);
}

function readCache(args) {
  const path = cachePath(args);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** `entry` = { pick: 'A' | 'none', pickedAsin: <ASIN> | null }. Stored flat
 *  so the read path can do `cached.pick.charCodeAt(0)` / `cached.pickedAsin`
 *  without unwrapping (previous bug: writeCache was called with the entry as
 *  the 2nd arg AND nested it under `pick`, breaking re-reads). */
function writeCache(args, entry) {
  ensureCacheDir();
  const path = cachePath(args);
  try {
    writeFileSync(path, JSON.stringify({
      productName: args.productName,
      candidates: args.candidates.map(c => ({ asin: c.asin, title: c.title })),
      pick: entry.pick,
      pickedAsin: entry.pickedAsin ?? null,
      decidedAt: new Date().toISOString(),
    }, null, 2));
  } catch { /* cache write failure is non-fatal */ }
}

/**
 * Build the prompt body. One block per product, each with up to N labelled
 * candidates (A, B, C, …). The model is asked to pick a letter OR "none".
 * Reasons to reject (in plain language) are spelled out so the model doesn't
 * have to infer them — accessories, mismatched variant, generic listing.
 */
function buildPrompt({ niche, market, items }) {
  const isFr = market === 'fr';
  const introFr = `Tu valides des matchs Amazon pour un article ${niche} en français. Pour chaque produit demandé, choisis la lettre du candidat qui correspond exactement à ce produit, OU "none" si TOUS les candidats sont de mauvais matchs.

REJETER (répondre "none" ou choisir un autre candidat) si le titre indique :
- un accessoire / pièce détachée (batterie, chargeur, housse, filtre, lame de rechange, sac, joint, tampon)
- un modèle différent (ex. on demande "Husqvarna 310" et le titre dit "Husqvarna 305")
- un produit complètement différent (ex. on demande une tondeuse et le titre est une tronçonneuse)
- un lot d'accessoires "pour" ce produit (titre commençant par "Pour ...", "Compatible avec ...")

Prix très bas (sous 30€) sur un produit normalement cher (>500€) = quasi-certainement un accessoire, à rejeter.

Réponds UNIQUEMENT en JSON, une clé par produit demandé, valeur = lettre du candidat ("A","B",…) ou "none".`;

  const introEn = `You are validating Amazon matches for a ${niche} article in ${market === 'gb' ? 'British English' : 'American English'}. For each requested product, pick the letter of the candidate that matches exactly, OR "none" if ALL candidates are bad matches.

REJECT (answer "none" or pick a different candidate) when the title indicates:
- an accessory / spare part (battery, charger, cover, filter, replacement blade, bag, gasket, pad)
- a different model (e.g. asked for "Husqvarna 310", title says "Husqvarna 305")
- a completely different product (asked for a mower, title is a chainsaw)
- an accessory bundle "for" this product (title starts with "For ...", "Compatible with ...")

Very low price (under ${market === 'gb' ? '£25' : '$30'}) on a product that should be expensive (>${market === 'gb' ? '£400' : '$500'}) almost certainly = accessory, reject.

Respond ONLY in JSON, one key per requested product, value = candidate letter ("A","B",…) or "none".`;

  const intro = isFr ? introFr : introEn;

  const productsBlock = items.map(({ productName, candidates }, idx) => {
    const lines = candidates.map((c, ci) => {
      const letter = String.fromCharCode(65 + ci);
      const price = c.price ?? (Number.isFinite(c.priceValue) ? `${c.priceValue}` : '—');
      // Truncate excessive titles to keep prompt focused.
      const title = c.title.length > 220 ? c.title.slice(0, 217) + '…' : c.title;
      return `  ${letter}. ASIN=${c.asin}  prix=${price}  titre="${title}"`;
    }).join('\n');
    return `Produit ${idx + 1}: "${productName}"\n${lines}`;
  }).join('\n\n');

  const example = `\n\nExemple de format de réponse :\n{\n  "Marque Modèle 1": "B",\n  "Marque Modèle 2": "none"\n}`;

  return `${intro}\n\n${productsBlock}${example}`;
}

/** Extract the first {…} JSON object from Claude's stdout. Claude sometimes
 *  wraps its answer in markdown ("```json\n{…}\n```") or chatty preamble. */
function extractJsonObject(text) {
  if (!text) return null;
  // Try direct parse first
  try { return JSON.parse(text); } catch { /* continue */ }
  // Then scan for { … } across the whole output
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/**
 * Validate one or more (product, candidates[]) tuples in a single Claude call.
 *
 *   candidatesByProduct = { [productName]: Candidate[] }
 *   → returns { [productName]: { asin, title, imageUrl, price, priceValue } | null }
 *
 * Cached calls: when EVERY product hits the cache, no Claude call is made.
 * Partial-cache scenario: cached products are reused, uncached ones are
 * batched into a single Claude call.
 *
 * Fallback policy on parse error / missing keys / Claude failure: pick the
 * candidate[0] (highest adjusted score). This preserves the pre-validator
 * behaviour rather than silently dropping the product — better a possibly-
 * wrong link than no link, since article-validator.js still demands ≥3
 * AffiliateButtons on comparatifs.
 */
export async function validateMatchesWithClaude({ niche, market, candidatesByProduct, verbose = true }) {
  const picksByProduct = {};
  const toAsk = [];

  for (const [productName, candidates] of Object.entries(candidatesByProduct)) {
    if (!candidates || candidates.length === 0) {
      picksByProduct[productName] = null;
      continue;
    }
    // No single-candidate shortcut: hard gates pass batteries / spare parts
    // whose titles match every token of the query (the very case we built
    // this validator for — Husqvarna Automower 310 returns a single
    // "Husqvarna Batterie Automower 310" with score 1.0). Always ask Claude
    // unless the cache already answered for this exact candidate set.
    const cached = readCache({ niche, market, productName, candidates });
    if (cached && cached.pick !== undefined) {
      if (cached.pick === 'none') {
        picksByProduct[productName] = null;
        if (verbose) console.log(`    💾 validator cache: "${productName}" → none`);
      } else {
        const picked = candidates.find(c => c.asin === cached.pickedAsin)
                    ?? candidates[cached.pick.charCodeAt(0) - 65];
        if (picked) {
          picksByProduct[productName] = {
            asin: picked.asin, title: picked.title, imageUrl: picked.imageUrl,
            price: picked.price, priceValue: picked.priceValue,
          };
          if (verbose) console.log(`    💾 validator cache: "${productName}" → ${picked.asin}`);
        } else {
          // Cached letter doesn't resolve (candidate list changed). Re-ask.
          toAsk.push({ productName, candidates });
        }
      }
      continue;
    }
    toAsk.push({ productName, candidates });
  }

  if (toAsk.length === 0) return picksByProduct;

  if (verbose) console.log(`    🤖 validator: asking Claude for ${toAsk.length} product(s)…`);
  const prompt = buildPrompt({ niche, market, items: toAsk });
  const oauthToken = requireEnv('CLAUDE_CODE_OAUTH_TOKEN');
  const result = spawnSync('claude', ['-p', '--dangerously-skip-permissions'], {
    input: prompt,
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken },
    encoding: 'utf-8',
    timeout: 120_000,
  });

  let parsed = null;
  if (result.status === 0) {
    parsed = extractJsonObject(result.stdout);
  } else {
    if (verbose) console.warn(`    ⚠️  validator: claude CLI exited ${result.status} — falling back to candidate[0] for unresolved products`);
  }

  for (const { productName, candidates } of toAsk) {
    const answer = parsed?.[productName];
    let picked = null;
    if (typeof answer === 'string') {
      const trimmed = answer.trim().toUpperCase();
      if (trimmed === 'NONE') {
        picked = null;
      } else if (/^[A-Z]$/.test(trimmed)) {
        picked = candidates[trimmed.charCodeAt(0) - 65] ?? null;
      } else {
        // Some other string (ASIN echo, free-text) — try ASIN match
        picked = candidates.find(c => c.asin === answer) ?? null;
      }
    } else {
      // Parse failure or missing key → fall back to top candidate. Keeps the
      // pipeline shipping rather than producing empty product cards.
      picked = candidates[0];
      if (verbose) console.warn(`    ⚠️  validator: no parseable answer for "${productName}" — using candidate[0] (${picked?.asin})`);
    }

    if (picked) {
      picksByProduct[productName] = {
        asin: picked.asin, title: picked.title, imageUrl: picked.imageUrl,
        price: picked.price, priceValue: picked.priceValue,
      };
      writeCache({ niche, market, productName, candidates },
                 { pick: String.fromCharCode(65 + candidates.indexOf(picked)), pickedAsin: picked.asin });
      if (verbose) console.log(`    ✅ validator: "${productName}" → ${picked.asin} ("${picked.title.slice(0, 60)}…")`);
    } else {
      picksByProduct[productName] = null;
      writeCache({ niche, market, productName, candidates }, { pick: 'none' });
      if (verbose) console.log(`    🛑 validator: "${productName}" → none (all ${candidates.length} candidates rejected)`);
    }
  }

  return picksByProduct;
}
