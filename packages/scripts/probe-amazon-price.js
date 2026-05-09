#!/usr/bin/env node
/**
 * Probe: count price-like markup across the WHOLE HTML (not just the ASIN
 * window) and dump a sample, so we can see which CSS class Amazon currently
 * uses for prices on .com / .co.uk.
 */
import { fetchWithBrowser, closeBrowser } from './lib/browser.js';

const TARGETS = [
  { market: 'us', query: 'cordless drill' },
  { market: 'gb', query: 'pressure washer' },
  { market: 'fr', query: 'perceuse' },
];
const HOST = { fr: 'www.amazon.fr', us: 'www.amazon.com', gb: 'www.amazon.co.uk' };

for (const t of TARGETS) {
  console.log(`\n========== [${t.market}] "${t.query}" ==========`);
  const url = `https://${HOST[t.market]}/s?k=${encodeURIComponent(t.query)}`;
  let html;
  try {
    ({ html } = await fetchWithBrowser(url, { waitFor: 'networkidle', timeoutMs: 60000 }));
  } catch (e) {
    console.log(`  FETCH FAILED: ${e.message}`);
    continue;
  }
  console.log(`  total HTML: ${html.length} bytes`);
  console.log(`  $ symbols: ${(html.match(/\$/g) || []).length}`);
  console.log(`  £ symbols: ${(html.match(/£/g) || []).length}`);
  console.log(`  € symbols: ${(html.match(/€/g) || []).length}`);
  console.log(`  &euro; entities: ${(html.match(/&euro;/g) || []).length}`);
  console.log(`  a-offscreen total: ${(html.match(/<span[^>]*a-offscreen/g) || []).length}`);
  console.log(`  a-price total: ${(html.match(/<span[^>]*class="[^"]*a-price[^"]*"/g) || []).length}`);
  console.log(`  a-price-whole total: ${(html.match(/<span[^>]*a-price-whole/g) || []).length}`);

  // Sample first 5 a-offscreen contents
  const off = [...html.matchAll(/<span[^>]*a-offscreen[^>]*>([^<]+)<\/span>/g)].slice(0, 8).map(m => m[1]);
  console.log(`  first 8 a-offscreen contents: ${JSON.stringify(off)}`);

  // Sample first 5 a-price-whole contents
  const wh = [...html.matchAll(/<span[^>]*a-price-whole[^>]*>([^<]+)<\/span>/g)].slice(0, 8).map(m => m[1]);
  console.log(`  first 8 a-price-whole:        ${JSON.stringify(wh)}`);

  // Distance from first ASIN to first a-offscreen
  const firstAsin = html.match(/\/dp\/B0[A-Z0-9]{8}/)?.index;
  const firstOff = html.match(/<span[^>]*a-offscreen/)?.index;
  console.log(`  first /dp/ at ${firstAsin}, first a-offscreen at ${firstOff}, distance=${firstOff && firstAsin ? firstOff - firstAsin : 'n/a'}`);
}

await closeBrowser();
