/**
 * Lazy Playwright Chromium singleton with stealth-ish defaults.
 *
 * Why a singleton: launching Chromium is ~1s and uses ~150MB RAM. We reuse one
 * browser process across all scrape calls in a single article-generation run.
 *
 * Stealth tweaks: real-looking UA, French locale, common viewport, removal of
 * navigator.webdriver, and Sec-Fetch headers. This is enough to defeat lazy WAFs
 * (Que Choisir, Mr Bricolage, Boulanger) but NOT enterprise bot management
 * (Akamai Pro on big retailers, Amazon, Cloudflare Enterprise). For those,
 * fall back to DataForSEO On-Page API or accept the miss.
 */
import { chromium } from 'playwright';

let _browser = null;
let _context = null;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

async function ensureContext() {
  if (_context) return _context;
  const browser = await ensureBrowser();
  _context = await browser.newContext({
    userAgent: UA,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
    },
    javaScriptEnabled: true,
  });

  // Hide navigator.webdriver — the cheapest, most universal stealth tweak.
  await _context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  return _context;
}

export async function fetchWithBrowser(url, { timeoutMs = 25_000, waitFor = 'domcontentloaded' } = {}) {
  const context = await ensureContext();
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
  if (_context) { try { await _context.close(); } catch {} _context = null; }
  if (_browser) { try { await _browser.close(); } catch {} _browser = null; }
}

// Best-effort cleanup on process exit.
process.once('exit', () => { closeBrowser(); });
process.once('SIGINT', () => { closeBrowser().then(() => process.exit(130)); });
