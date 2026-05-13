/**
 * Per-article hero image fetcher (Pexels first, Pixabay fallback).
 *
 * Why this exists: the prompt used to hard-code `heroImage: "/images/hero.jpg"`
 * in every frontmatter, so every article on the site shared the same generic
 * niche-level photo. Visitors landing on a Lavor pressure washer article saw
 * a photo of hand-planting tools. That reads as low-effort templated content
 * AND hurts E-E-A-T signal. This module fetches a topic-specific photo per
 * article, saved at sites/<niche>/<market>/public/images/heroes/<slug>.jpg.
 *
 * Selection strategy:
 *   1. Pexels search with the primary keyword (FR/EN auto — Pexels has both
 *      indexes). Landscape orientation required so the hero crops cleanly.
 *   2. If nothing matches OR Pexels fails, retry with a niche-level fallback
 *      query from images.config.js (e.g. "garden tools" for jardin-bricolage).
 *   3. If still nothing, return null — the article ships with no heroImage
 *      and ArticleLayout renders without the hero block. Better than a wrong
 *      photo.
 *
 * Caching is by output path: if the .jpg already exists on disk we skip the
 * API call. The hero is a one-shot fetch per article — no TTL invalidation
 * (an image relevant when an article was published stays relevant).
 */
import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SITES_DIR } from './env.js';
import { IMAGE_QUERIES } from '@comparateur/config/images';

const PEXELS_URL = 'https://api.pexels.com/v1/search';
const PIXABAY_URL = 'https://pixabay.com/api/';

async function searchPexels(query, { excludeIds = new Set() } = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const url = `${PEXELS_URL}?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return null;
  const data = await res.json();
  // Skip already-used photo ids so a multi-image article doesn't show the
  // same hero photo twice (hero + inline). When everything is excluded, fall
  // back to the first result rather than returning null — duplicate beats
  // missing.
  const photos = data.photos || [];
  const fresh = photos.find(p => !excludeIds.has(p.id));
  const photo = fresh || photos[0];
  // Prefer `large2x` for retina, fall back to `large`. `original` is too big
  // for a hero (often 4000+ px) — Cloudflare image optimization handles
  // resizing at the CDN.
  return photo ? {
    id: photo.id,
    url: photo.src?.large2x || photo.src?.large || null,
    alt: photo.alt || null,
    source: 'pexels',
    photographer: photo.photographer,
  } : null;
}

async function searchPixabay(query, { excludeIds = new Set() } = {}) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const url = `${PIXABAY_URL}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&per_page=8&orientation=horizontal&image_type=photo&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hits = data.hits || [];
  const fresh = hits.find(h => !excludeIds.has(h.id));
  const hit = fresh || hits[0];
  return hit ? {
    id: hit.id,
    url: hit.largeImageURL || hit.webformatURL || null,
    alt: hit.tags || null,
    source: 'pixabay',
    photographer: hit.user,
  } : null;
}

async function downloadImage(url, outputPath) {
  if (!url) return false;
  if (existsSync(outputPath)) return true;        // cached
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(outputPath));
  return true;
}

// Brand tokens to STRIP from the search query before sending to Pexels —
// stock photo libraries don't have brand-specific photography, so "Lavor"
// hurts more than it helps ("Lavor" is also an Italian place name → returns
// landscape shots). Word-boundary matched, case-insensitive.
const BRAND_TOKENS = [
  // Power tools
  'bosch', 'makita', 'dewalt', 'milwaukee', 'parkside', 'ryobi', 'einhell',
  'metabo', 'aeg', 'hilti', 'festool', 'black decker', 'black\\+decker',
  // Garden
  'stihl', 'husqvarna', 'gardena', 'flymo', 'mcculloch', 'oleo mac', 'oleomac',
  // Pressure washers
  'karcher', 'kärcher', 'lavor', 'kranzle', 'nilfisk', 'stihl',
  // Cuisine — coffee
  'jura', 'sage', 'krups', 'melitta', 'delonghi', "de'longhi", 'de longhi',
  'philips', 'siemens', 'saeco', 'gaggia', 'rocket', 'breville', 'nespresso',
  // Cuisine — kitchen appliances
  'moulinex', 'magimix', 'kenwood', 'kitchenaid', 'kitchen aid', 'tefal',
  'seb', 'ninja', 'thermomix', 'vorwerk', 'instant pot', 'cookeo', 'companion',
  'monsieur cuisine', 'lidl', 'silvercrest',
  // Generic e-commerce / retailer
  'brico depot', 'brico-depot', 'leroy merlin', 'castorama', 'manomano',
  'amazon', 'cdiscount', 'darty', 'fnac', 'boulanger', 'carrefour',
];

// FR noun → English Pexels query. Pexels has very thin coverage of FR
// DIY/tool vocabulary, so we route to the EN equivalent for the actual
// search. Longest patterns first so "taille haie thermique" matches before
// the generic "taille haie".
const FR_TO_EN_QUERY = [
  // Garden tools — specific before generic
  ['robot tondeuse',         'robot lawn mower garden'],
  ['tondeuse a gazon',       'lawn mower grass'],
  ['tondeuse gazon',         'lawn mower grass'],
  ['tondeuse',               'lawn mower'],
  ['taille-haie thermique',  'petrol hedge trimmer'],
  ['taille haie thermique',  'petrol hedge trimmer'],
  ['taille-haie electrique', 'electric hedge trimmer'],
  ['taille haie electrique', 'electric hedge trimmer'],
  ['taille-haie sur perche', 'long reach hedge trimmer'],
  ['taille haie perche',     'long reach hedge trimmer'],
  ['taille-haie',            'hedge trimmer'],
  ['taille haie',            'hedge trimmer'],
  ['debroussailleuse',       'brush cutter trimmer'],
  ['débroussailleuse',       'brush cutter trimmer'],
  ['tronconneuse',           'chainsaw'],
  ['tronçonneuse',           'chainsaw'],
  ['souffleur feuilles',     'leaf blower'],
  ['souffleur de feuilles',  'leaf blower'],
  ['souffleur',              'leaf blower'],
  ['scie sauteuse',          'jigsaw power tool'],
  ['scie circulaire',        'circular saw'],
  ['scie',                   'saw power tool'],
  // Cleaning tools
  ['nettoyeur haute pression', 'pressure washer cleaning'],
  ['nettoyeur vapeur',         'steam cleaner'],
  ['nettoyeur',                'pressure washer'],
  // Drilling / fastening
  ['perceuse visseuse',      'cordless drill'],
  ['perceuse',               'power drill workshop'],
  ['visseuse',               'screwdriver power tool'],
  ['cloueur',                'nail gun'],
  ['agrafeuse',              'staple gun'],
  // Surface tools
  ['meuleuse',               'angle grinder'],
  ['ponceuse',               'orbital sander'],
  ['rabot',                  'electric planer'],
  // Watering / garden infrastructure
  ['arrosage',               'garden watering'],
  ['tuyau',                  'garden hose'],
  // Cuisine — coffee
  ['machine a cafe a grain', 'bean to cup coffee machine kitchen'],
  ['machine a cafe a grains', 'bean to cup coffee machine kitchen'],
  ['machine a grains',        'bean to cup coffee machine kitchen'],
  ['machine a grain',         'bean to cup coffee machine kitchen'],
  ['machine a cafe',         'espresso machine coffee'],
  ['machine a café',         'espresso machine coffee'],
  ['cafetiere italienne',    'moka pot coffee italian'],
  ['cafetiere',              'coffee maker kitchen'],
  ['cafetière',              'coffee maker kitchen'],
  ['expresso',               'espresso coffee machine'],
  ['espresso',               'espresso coffee machine'],
  ['barista',                'barista coffee shop espresso'],
  ['moulin a cafe',          'coffee grinder beans'],
  ['broyeur cafe',           'coffee grinder beans'],
  ['cafe grain',             'coffee beans roasted'],
  // Cuisine — cooking appliances
  ['air fryer',              'air fryer kitchen'],
  ['airfryer',               'air fryer kitchen'],
  ['friteuse sans huile',    'air fryer kitchen'],
  ['friteuse',               'deep fryer kitchen'],
  ['robot patissier',        'stand mixer baking kitchen'],
  ['robot pâtissier',        'stand mixer baking kitchen'],
  ['robot multifonction',    'food processor kitchen'],
  ['robot cuisine',          'food processor kitchen'],
  ['multicuiseur',           'multi cooker pressure kitchen'],
  ['autocuiseur',            'pressure cooker pot kitchen'],
  ['mixeur plongeant',       'hand blender immersion kitchen'],
  ['mixeur',                 'blender smoothie kitchen'],
  ['blender chauffant',      'soup maker blender kitchen'],
  ['blender',                'blender smoothie kitchen'],
  ['extracteur de jus',      'juicer fresh fruit kitchen'],
  ['centrifugeuse',          'juicer fresh fruit kitchen'],
  ['hachoir',                'food chopper kitchen'],
  ['gaufrier',               'waffle maker kitchen'],
  ['grille pain',            'toaster bread kitchen'],
  ['grille-pain',            'toaster bread kitchen'],
  ['toaster',                'toaster bread kitchen'],
  ['mini four',              'mini oven kitchen counter'],
  ['mini-four',              'mini oven kitchen counter'],
  ['micro ondes',            'microwave oven kitchen'],
  ['micro-ondes',            'microwave oven kitchen'],
  ['plancha',                'plancha grill cooking'],
  ['crepiere',               'crepe maker kitchen'],
  ['crêpière',               'crepe maker kitchen'],
  ['raclette',               'raclette cheese cooking'],
  ['fondue',                 'fondue cheese cooking'],
  // Cuisine generics
  ['cuisson',                'cooking food kitchen'],
  ['cuisine',                'kitchen cooking'],
  // Generic fallbacks (last resort)
  ['outillage',              'power tools workshop'],
  ['outil',                  'tools workshop'],
  ['jardin',                 'garden tools'],
  ['bricolage',              'workshop tools'],
];

function stripBrandsAndNormalize(keyword) {
  let s = keyword.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const brand of BRAND_TOKENS) {
    s = s.replace(new RegExp(`\\b${brand}\\b`, 'gi'), '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

// Sort the dictionary by needle length descending ONCE at module load. The
// table is hand-maintained in a niche-then-specificity order which is easy
// to read, but `categoricalEnQuery` returns the FIRST hit — so "tuyau" (5
// chars) used to win over "machine a cafe a grain" (21 chars) when both
// appear in the same scan target. Sorting by length forces the most
// specific term to match first regardless of authoring order.
const FR_TO_EN_QUERY_SORTED = [...FR_TO_EN_QUERY].sort((a, b) => b[0].length - a[0].length);

function categoricalEnQuery(normalized) {
  for (const [needle, enQuery] of FR_TO_EN_QUERY_SORTED) {
    if (normalized.includes(needle)) return enQuery;
  }
  return null;
}

/**
 * Build the search queries cascade.
 *
 *  1. Brand-stripped + EN-translated categorical query ("hedge trimmer") —
 *     best Pexels coverage. Skipped when no FR→EN mapping matches.
 *  2. Brand-stripped FR keyword — covers gaps in the FR→EN map.
 *  3. Niche-level English fallbacks ("garden tools", "workshop tools") —
 *     last resort, returns at least topically-coherent (vs random landscape).
 *
 * The unfiltered keyword is intentionally NOT used: it leaks brand names
 * ("Lavor" → Italian landscapes) and FR vocabulary Pexels can't match.
 */
function buildQueries(keyword, niche) {
  const normalized = stripBrandsAndNormalize(keyword);
  const queries = [];
  const enQuery = categoricalEnQuery(normalized);
  if (enQuery) queries.push(enQuery);
  if (normalized && normalized.length >= 4 && !queries.includes(normalized)) queries.push(normalized);
  for (const f of (IMAGE_QUERIES[niche]?.hero ?? [])) {
    if (!queries.includes(f)) queries.push(f);
  }
  return queries;
}

/**
 * Fetch a hero image for one article. Returns `{ publicPath, alt, source }`
 * or `null` if nothing usable was found.
 *
 * @param {object} opts
 * @param {string} opts.niche
 * @param {'fr'|'us'|'gb'} opts.market
 * @param {string} opts.articleSlug
 * @param {string} opts.keyword         Primary article keyword (search seed)
 * @param {boolean} [opts.verbose]
 */
export async function fetchArticleHero({ niche, market, articleSlug, keyword, verbose = true }) {
  const dir = resolve(SITES_DIR, niche, market, 'public/images/heroes');
  const localPath = join(dir, `${articleSlug}.jpg`);
  const publicPath = `/images/heroes/${articleSlug}.jpg`;

  // Cache hit — skip the API call entirely. Alt text is recovered from the
  // sidecar so it survives re-runs.
  const sidecarPath = join(dir, `${articleSlug}.json`);
  if (existsSync(localPath) && existsSync(sidecarPath)) {
    try {
      const meta = JSON.parse(await import('node:fs').then(fs => fs.promises.readFile(sidecarPath, 'utf-8')));
      if (verbose) console.log(`    🖼  cached hero: ${publicPath}`);
      return { publicPath, alt: meta.alt ?? keyword, source: meta.source };
    } catch { /* fall through and refetch */ }
  }

  mkdirSync(dir, { recursive: true });
  const queries = buildQueries(keyword, niche);

  for (const q of queries) {
    let match = await searchPexels(q);
    if (!match) match = await searchPixabay(q);
    if (!match?.url) continue;

    try {
      await downloadImage(match.url, localPath);
      // Persist sidecar so the alt text survives re-runs without an API hit.
      const meta = {
        keyword,
        query: q,
        alt: match.alt || keyword,
        source: match.source,
        photoId: match.id ?? null,
        photographer: match.photographer ?? null,
        fetchedAt: new Date().toISOString(),
      };
      await import('node:fs').then(fs => fs.promises.writeFile(sidecarPath, JSON.stringify(meta, null, 2) + '\n'));
      if (verbose) console.log(`    🖼  hero: ${publicPath} (query="${q}", source=${match.source})`);
      return { publicPath, alt: meta.alt, source: match.source, photoId: match.id ?? null };
    } catch (err) {
      if (verbose) console.warn(`    ⚠️  hero download failed for "${q}": ${err.message}`);
      continue;
    }
  }

  if (verbose) console.warn(`    ⚠️  no hero image found for "${keyword}" — article ships without one`);
  return null;
}

// Re-exports for sibling modules (inline-images.js) that share the same
// Pexels/Pixabay cascade. Kept private to the scripts package — not a public
// API.
export { searchPexels, searchPixabay, buildQueries, stripBrandsAndNormalize, categoricalEnQuery };
