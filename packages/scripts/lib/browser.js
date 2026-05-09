/**
 * Lazy Playwright Chromium singleton with per-market browser contexts.
 *
 * Why a singleton browser: launching Chromium is ~1s and uses ~150MB RAM. We
 * reuse one browser process across all scrape calls in a single article run.
 *
 * Why per-market contexts: Amazon (and other geo-aware retailers) localise
 * pricing + UI based on the visitor's locale + timezone. A `fr-FR` visitor
 * landing on amazon.co.uk gets EUR prices and a "ship to France" notice; we
 * want each market scrape to see what a native visitor sees. A separate
 * BrowserContext per market gives us isolated cookies + locale.
 *
 * Stealth tweaks: real-looking UA, FR/EN locale, common viewport, removal of
 * navigator.webdriver. Enough to defeat lazy WAFs (Que Choisir, Boulanger)
 * but NOT enterprise bot management (Akamai Pro on big retailers, Cloudflare
 * Enterprise). For those, fall back to DataForSEO On-Page API or accept the
 * miss.
 */
import { chromium } from 'playwright';

let _browser = null;
const _contexts = {};   // keyed by market: { fr, us, gb }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MARKET_PROFILES = {
  fr: {
    locale:   'fr-FR',
    timezone: 'Europe/Paris',
    languages: ['fr-FR', 'fr', 'en'],
    acceptLang: 'fr-FR,fr;q=0.9,en;q=0.5',
    amazonHost: '.amazon.fr',
    // No postcode needed when the IP is in France (Amazon defaults to FR).
    amazonCookies: { 'i18n-prefs': 'EUR', 'lc-acbfr': 'fr_FR' },
  },
  us: {
    locale:   'en-US',
    timezone: 'America/New_York',
    languages: ['en-US', 'en'],
    acceptLang: 'en-US,en;q=0.9',
    amazonHost: '.amazon.com',
    // glow-postcode is THE crucial cookie when scraping from outside the US:
    // Amazon's pricing engine quotes USD only when it has a US delivery
    // location. Without it, prices come back in the visitor's local currency
    // (EUR from a French IP), which the £/$ regex misses entirely.
    // 10001 = a real US zip (Manhattan); any valid one works.
    amazonCookies: { 'i18n-prefs': 'USD', 'lc-main': 'en_US', 'glow-postcode': '10001' },
  },
  gb: {
    locale:   'en-GB',
    timezone: 'Europe/London',
    languages: ['en-GB', 'en'],
    acceptLang: 'en-GB,en-US;q=0.9,en;q=0.8',
    amazonHost: '.amazon.co.uk',
    // SW1A 0AA = Buckingham Palace. A valid UK postcode is required to force
    // Amazon UK to quote GBP from a non-UK IP — without it we get EUR.
    amazonCookies: { 'i18n-prefs': 'GBP', 'lc-acbuk': 'en_GB', 'glow-postcode': 'SW1A 0AA' },
  },
};

async function ensureBrowser() {
  if (_browser) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });
  return _browser;
}

async function ensureContext(market = 'fr') {
  if (_contexts[market]) return _contexts[market];
  const profile = MARKET_PROFILES[market] ?? MARKET_PROFILES.fr;
  const browser = await ensureBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    locale:     profile.locale,
    timezoneId: profile.timezone,
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': profile.acceptLang,
    },
    javaScriptEnabled: true,
  });

  // Hide navigator.webdriver — the cheapest, most universal stealth tweak.
  await context.addInitScript((langs) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => langs });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  }, profile.languages);

  // Force Amazon's marketplace currency + locale via cookies. Without these,
  // a non-IP-local visitor (we're scraping from a French IP) gets EUR prices
  // on amazon.co.uk and a "ship to FR" interstitial on amazon.com — both of
  // which break the price-extraction regex (£/$ symbols).
  if (profile.amazonCookies) {
    const cookies = Object.entries(profile.amazonCookies).map(([name, value]) => ({
      name, value, domain: profile.amazonHost, path: '/',
    }));
    await context.addCookies(cookies);
  }

  _contexts[market] = context;
  return context;
}

export async function fetchWithBrowser(url, { timeoutMs = 25_000, waitFor = 'domcontentloaded', market = 'fr' } = {}) {
  const context = await ensureContext(market);
  const page = await context.newPage();
  try {
    const response = await page.goto(url, {
      waitUntil: waitFor,
      timeout: timeoutMs,
    });

    // Settle a beat for late-rendering content (Cdiscount etc.)
    await page.waitForTimeout(800);

    const html = await page.content();
    const status = response?.status() ?? 0;
    const finalUrl = page.url();
    return { html, status, finalUrl };
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  for (const m of Object.keys(_contexts)) {
    try { await _contexts[m].close(); } catch {}
    delete _contexts[m];
  }
  if (_browser) { try { await _browser.close(); } catch {} _browser = null; }
}

// Best-effort cleanup on process exit.
process.once('exit', () => { closeBrowser(); });
process.once('SIGINT', () => { closeBrowser().then(() => process.exit(130)); });
