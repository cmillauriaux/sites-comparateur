#!/usr/bin/env node
/**
 * Probe: validate findAmazonProduct success rate per marketplace after tuning.
 * Reports asin / matchScore / title for each test product.
 */
import { findAmazonProduct } from './lib/product-images.js';
import { closeBrowser } from './lib/browser.js';

const PROBES = [
  { market: 'us', name: 'DeWalt DCD999' },
  { market: 'us', name: 'DeWalt DCD771C2' },
  { market: 'us', name: 'Makita XPH14' },
  { market: 'us', name: 'Flex FX1271T' },
  { market: 'us', name: 'Black+Decker BDCDD12C' },
  { market: 'gb', name: 'Stihl RE 100 Plus Control' },
  { market: 'gb', name: 'Nilfisk Core 140-6' },
  { market: 'gb', name: 'Husqvarna PW 235R' },
  { market: 'gb', name: 'Vonhaus 1600W Pressure Washer' },
];

let matched = 0;
for (const p of PROBES) {
  process.stdout.write(`[${p.market}] "${p.name}"  →  `);
  const r = await findAmazonProduct(p.name, { market: p.market });
  const ok = !!r.asin;
  if (ok) matched++;
  console.log(`${ok ? '✅' : '❌'}  asin=${r.asin ?? '∅'}  score=${(r.matchScore ?? 0).toFixed(2)}  title=${r.title?.slice(0, 60) || '∅'}`);
}
console.log(`\n${matched}/${PROBES.length} matched`);

await closeBrowser();
