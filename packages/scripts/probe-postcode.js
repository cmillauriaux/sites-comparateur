#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  extraHTTPHeaders: { 'Accept-Language': 'en-GB,en;q=0.9' },
});
await ctx.addCookies([
  { name: 'i18n-prefs',    value: 'GBP',     domain: '.amazon.co.uk', path: '/' },
  { name: 'lc-acbuk',      value: 'en_GB',   domain: '.amazon.co.uk', path: '/' },
  { name: 'glow-postcode', value: 'SW1A 0AA', domain: '.amazon.co.uk', path: '/' },
]);

const page = await ctx.newPage();

console.log('--- Test 1: pre-seeded postcode + currency cookies, direct search ---');
await page.goto('https://www.amazon.co.uk/s?k=pressure+washer', { waitUntil: 'networkidle', timeout: 60000 });
let html = await page.content();
console.log('  £ count:', (html.match(/£/g) || []).length);
console.log('  EUR count:', (html.match(/EUR/g) || []).length);
const off1 = [...html.matchAll(/<span[^>]*a-offscreen[^>]*>([^<]+)<\/span>/g)].slice(0, 5).map(m => m[1]);
console.log('  first a-offscreen:', off1);
const cookies1 = await ctx.cookies('https://www.amazon.co.uk');
console.log('  cookies set after request:', cookies1.length);
const i18n1 = cookies1.find(c => c.name === 'i18n-prefs');
console.log('  i18n-prefs cookie value after:', i18n1?.value);
const glow1 = cookies1.find(c => c.name === 'glow-postcode');
console.log('  glow-postcode after:', glow1?.value);

console.log('\n--- Test 2: visit homepage first to let Amazon set its cookies, then search ---');
await page.goto('https://www.amazon.co.uk', { waitUntil: 'networkidle', timeout: 60000 });
const cookies2 = await ctx.cookies('https://www.amazon.co.uk');
console.log('  cookies after homepage:', cookies2.map(c => c.name).join(', '));
const url2 = page.url();
console.log('  landed on:', url2);

await page.goto('https://www.amazon.co.uk/s?k=pressure+washer', { waitUntil: 'networkidle', timeout: 60000 });
html = await page.content();
console.log('  £ count:', (html.match(/£/g) || []).length);
console.log('  EUR count:', (html.match(/EUR/g) || []).length);

await browser.close();
