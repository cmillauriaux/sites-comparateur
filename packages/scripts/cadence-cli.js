#!/usr/bin/env node
/**
 * Cadence gate — workflow-side anti-Google-detection check.
 *
 * Invoked from GitHub Actions BEFORE the heavy install/build steps. Reads the
 * site's maturity stage + today's active-day verdict + the slot election, and
 * emits "run" or "skip" on stdout. Workflows wire the result into $GITHUB_ENV
 * to skip the rest of the job on rejected slots/days, which keeps CI minutes
 * spending bounded (~30s per rejection vs full pipeline at ~5-10 min).
 *
 * Usage:
 *   node packages/scripts/cadence-cli.js --niche jardin-bricolage --market fr \
 *        --workflow daily-articles --slot 2 [--num-slots 4]
 *
 * stdout: "run" or "skip"
 * stderr: human-readable trace ("sandbox stage, 6 published, activeToday=false → skip")
 * exit:   0 in all normal cases (the decision is the data, not the exit code)
 *         1 on usage errors (bad workflow name, missing flag, etc.)
 */
import { getCadence, electedSlot } from './lib/cadence.js';
import { parseArgs } from './lib/site-config.js';

const VALID_WORKFLOWS = new Set(['daily-articles', 'daily-guides', 'weekly-informational']);

function fail(msg) {
  console.error(`cadence-cli: ${msg}`);
  console.error(`Usage: cadence-cli --niche <n> --market <m> --workflow <daily-articles|daily-guides|weekly-informational> --slot <N> [--num-slots <N>]`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const niche = args.niche;
const market = args.market;
const workflow = args.workflow;
const slot = parseInt(args.slot ?? '0', 10);
const numSlots = parseInt(args['num-slots'] ?? '4', 10);

if (!niche) fail('missing --niche');
if (!market) fail('missing --market');
if (!workflow || !VALID_WORKFLOWS.has(workflow)) fail(`invalid --workflow "${workflow}" (valid: ${[...VALID_WORKFLOWS].join(', ')})`);
if (!Number.isFinite(slot) || slot < 0) fail(`invalid --slot "${args.slot}"`);
if (!Number.isFinite(numSlots) || numSlots < 1) fail(`invalid --num-slots "${args['num-slots']}"`);

const today = new Date();
const cadence = getCadence(niche, market, { today });
const elected = electedSlot(today, niche, market, numSlots);
const slotMatches = slot === elected;

// Per-workflow rule. Mirrors the table in CLAUDE.md "Cadence" section.
let allow;
if (workflow === 'daily-articles') {
  allow = cadence.activeToday && cadence.affiliateCap > 0 && slotMatches;
} else if (workflow === 'daily-guides') {
  allow = cadence.activeToday && cadence.guideCap > 0 && slotMatches;
} else if (workflow === 'weekly-informational') {
  // Tuesday is the only fire day (cron-enforced upstream) — skip the
  // activeToday check, just gate on stage permission and slot election.
  allow = cadence.allowInformational && slotMatches;
}

const decision = allow ? 'run' : 'skip';
const trace = [
  `stage=${cadence.stage}`,
  `published=${cadence.publishedCount}`,
  `affCap=${cadence.affiliateCap}`,
  `guideCap=${cadence.guideCap}`,
  `info=${cadence.allowInformational}`,
  `activeToday=${cadence.activeToday}`,
  `slot=${slot}/elected=${elected}(of ${numSlots})`,
  `→ ${decision}`,
].join(' ');
console.error(`cadence ${niche}/${market} ${workflow}: ${trace}`);
process.stdout.write(decision + '\n');
