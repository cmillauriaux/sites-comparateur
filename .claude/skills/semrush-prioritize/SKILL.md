---
name: semrush-prioritize
description: Mine Semrush for Easy/Very-Easy keyword opportunities and decide which articles to write next. Use when the user asks for "Semrush priorities", "Keyword Magic Tool opportunities", or "what should I write next?". Calls the existing packages/scripts/semrush-prioritize.js to fetch + cluster + score, then presents the top opportunities and updates data/semrush-priorities.json. Optionally launches the article generator on a chosen cluster.
---

# Semrush keyword prioritization

This skill helps the user find the highest-ROI keyword clusters across their
enabled (niche, market) sites and decide which one to turn into an article
next. It is a thin wrapper around `packages/scripts/semrush-prioritize.js`
plus a manual generation step using `packages/scripts/article-generator.js
--cluster <id>`.

## When to invoke

The user explicitly asks for one of:

- "Semrush priorities" / "priorisation Semrush"
- "Keyword Magic Tool opportunities" / "opportunités Keyword Magic Tool"
- "What should I write next?" (in the context of this project)
- "Mine Semrush for [niche]" / "scanne Semrush pour [niche]"
- "/semrush-prioritize"

Do NOT invoke for the daily auto pipeline — that uses DataForSEO via the
GitHub Actions workflow. This skill is for the **manual** flow where the user
wants to hand-pick articles to generate.

## Inputs the skill expects

The user may pass any of:

- `--niche <name>` (e.g. `jardin-bricolage`) — scope to one niche, all enabled markets
- `--market <fr|us|gb>` — pair with `--niche` for one (niche, market)
- `--site <niche>-<market>` — same as above in siteId form
- (no scope flag) — every row in `ENABLED_SITES`
- `--no-cache` — bypass the 14-day disk cache (rare, costs API units)
- `--top <N>` — how many opportunities to print (default 15)
- `--max-units <N>` — cap Semrush API spend in this run (default 100000)
- `--generate <id>` — after mining, immediately spawn article-generator on
  this cluster id

If the user names a cluster topic or keyword instead of a niche, infer the
niche from `packages/config/niches.js#NICHES` and the seed keywords in the
relevant `sites/<niche>/<market>/site.config.js`.

## Required env

`SEMRUSH_API_KEY` must be set in `.env`. If it is missing, tell the user to
add it before retrying — do not attempt the run without it. Verify with:

```bash
grep -q '^SEMRUSH_API_KEY=..' .env && echo OK || echo MISSING
```

## Flow

1. **Sanity-check the env** (above).

2. **Run the miner**:

   ```bash
   node packages/scripts/semrush-prioritize.js [--niche X] [--market Y] [--top 15]
   ```

   The script prints per-seed row counts, API cost in units, and a top-N table.
   It writes `data/semrush-priorities.json` (merge mode — never wipes existing
   entries; new clusters are appended and sorted by score).

3. **Read `data/semrush-priorities.json`** to confirm what was added and pick
   the highest-priority cluster the user has not yet generated. Show the user
   a short ranked list (5-10 entries) with: id, primary keyword, intent,
   totalVolume, avgKD, secondary count.

4. **Ask the user which cluster(s) to generate**. Recommend the top entry by
   `score` but make it easy to override.

5. **Generate one article** (only when the user confirms):

   ```bash
   node packages/scripts/article-generator.js --cluster <id>
   ```

   This invokes the same scrape → Claude Code CLI → image injection → FAQ
   pipeline as the daily run, with the cluster's secondary keywords woven
   into the prompt. On success the registry's `status` flips to `generated`
   and the publishedUrl is recorded.

6. **Build + deploy** are NOT this skill's job. Tell the user to push the
   committed `.mdx` and let the existing CI handle Cloudflare deploy + GSC
   indexing — same path as auto-generated articles.

## Cost awareness

`phrase_fullsearch` costs 20 API units per ROW returned. With ~13 seeds × 100
rows × 3 markets, a cold-cache full run is up to **78,000 units**. Subsequent
runs within 14 days are free (disk cache). Always show the user the printed
"Total Semrush API cost this run" before they run another scope. Refuse to
run without `--no-cache` if the user is asking for the same scope twice in
under 2 hours — that's a quota mistake.

## Outputs to summarize back

After step 3, give the user a compact ranked list. After step 5, just
confirm the published URL. Never paste the entire registry — it grows.

## Failure modes

- `Missing required env var: SEMRUSH_API_KEY` → tell user to set it.
- `Semrush API: ERROR 135 :: API UNITS BALANCE IS ZERO` → quota exhausted; tell user.
- `Semrush API: ERROR 50 :: NOTHING FOUND` → benign, the seed has no broad-match data in that database. Continue.
- `output already exists` during generation → the cluster's primary keyword was already published as a single-keyword article from the daily pipeline. Mark the opportunity `rejected` (in registry) and move on.

## Architecture pointers

- `packages/scripts/lib/semrush.js` — API client + disk cache (14-day TTL)
- `packages/scripts/lib/cluster.js` — token-Jaccard greedy clustering
- `packages/scripts/semrush-prioritize.js` — orchestrator
- `packages/scripts/article-generator.js#generateFromCluster` — `--cluster` mode
- `data/semrush-priorities.json` — registry (manual flow)
- `data/keywords-queue.json` — separate, owned by the daily DataForSEO flow
