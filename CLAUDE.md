# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Monorepo skeleton + jardin-bricolage FR site are live (production daily pipeline runs). US/GB scaffolds for jardin-bricolage exist but need:
- Real domains wired in `site.config.js` + `astro.config.mjs` (search `TODO_US_DOMAIN` / `TODO_GB_DOMAIN`).
- Amazon Associates US/GB tags populated in `.env` (`AMAZON_AFFILIATE_ID_US` / `_GB`) and as GitHub Secrets.
- Cloudflare Pages projects `jardin-bricolage-us` and `jardin-bricolage-gb` created and bound to the domains.
- UI/content i18n pass on `src/` (see "EN sites — content-launch checklist" below).

The other three niches (sport-fitness, cuisine, maison-elec) have no `sites/<niche>/` directory yet. Bootstrap them by mirroring `sites/jardin-bricolage/` and adding the matching rows to `ENABLED_SITES`. The original master brief — [claude-code-guide-affiliation-sites.md](claude-code-guide-affiliation-sites.md) — is preserved as historical context but the current architecture supersedes it where they disagree (in particular: per-(niche, market) directories, `ENABLED_SITES` registry, multi-marketplace Amazon).

## Reference projects (read these before improvising)

- **[/Users/cedric/projects/perso/adult-visual-novel](/Users/cedric/projects/perso/adult-visual-novel)** — production Astro + Cloudflare Pages site that runs daily content generation via GitHub Actions calling the Claude Code CLI (`@anthropic-ai/claude-code`) with `CLAUDE_CODE_OAUTH_TOKEN`. Use its [scripts/generate-review.sh](/Users/cedric/projects/perso/adult-visual-novel/scripts/generate-review.sh) and [.github/workflows/generate-review.yml](/Users/cedric/projects/perso/adult-visual-novel/.github/workflows/generate-review.yml) as the canonical pattern: scrape sources first → build a `mktemp` prompt file with grounded data → invoke `claude_retry -p --dangerously-skip-permissions` → commit only `src/content/` and `public/images/`. The brief shows the Anthropic SDK approach (`article-generator.js` calling `client.messages.create`); **prefer the Claude Code CLI pattern from adult-visual-novel** unless explicitly asked otherwise — it inherits tool use (Write, Bash, scrapers) and is what the user already operates.
- **[/Users/cedric/projects/perso/seo-analyzer](/Users/cedric/projects/perso/seo-analyzer)** — Python pipeline for DataForSEO + GSC. Reuse its scoring logic and DataForSEO call patterns ([seo_analyzer/fetch](/Users/cedric/projects/perso/seo-analyzer/seo_analyzer/fetch), [seo_analyzer/score](/Users/cedric/projects/perso/seo-analyzer/seo_analyzer/score)) rather than reimplementing. The brief's [`packages/scripts/dataforseo-keywords.js`](claude-code-guide-affiliation-sites.md) is a JS rewrite of the same idea — keep them aligned.

## Architecture — multi-niche × multi-market

Monorepo with one shared `packages/` dir and one Astro site per **(niche, market)** pair under `sites/<niche>/<market>/`. The four niches are mirrored across three markets (FR / US / GB); each pair gets its own domain, its own Amazon Associates tag, and its own Cloudflare Pages project.

```
sites/
  jardin-bricolage/
    fr/   → jardinguide.fr        (Amazon FR, Awin FR, Que Choisir / Les Numériques sources)
    us/   → TODO_US_DOMAIN        (Amazon US, Wirecutter / Consumer Reports sources)
    gb/   → TODO_GB_DOMAIN        (Amazon UK, Which? / Trusted Reviews sources)
  sport-fitness/{fr,us,gb}/   ← niches not yet scaffolded
  cuisine/{fr,us,gb}/
  maison-elec/{fr,us,gb}/
```

The single source of truth for what is actually wired up is [`packages/config/niches.js#ENABLED_SITES`](packages/config/niches.js). Pipelines, workflows, and `loadSiteConfig()` all gate off this list — adding a `(niche, market)` row is what turns a market on. Search `TODO_US_DOMAIN` / `TODO_GB_DOMAIN` to find every spot that still needs the real domain wired.

Daily pipeline (per ENABLED_SITES row, GitHub Actions matrix, `max-parallel: 1` to serialize writes to `data/keywords-queue.json`):
1. `dataforseo-keywords.js --niche <n> --market <m>` fills `data/keywords-queue.json[niche][market]` with `{keyword, volume, kd, cpc, score, intent, status, niche, market}`. DataForSEO `location_code` + `language_code` come from `MARKET_DATAFORSEO` in `niches.js`.
2. `article-generator.js --niche <n> --market <m>` picks the highest-score `pending` keyword, scrapes the (niche, market) whitelist from [`packages/config/sources.config.js`](packages/config/sources.config.js), builds a per-market grounded prompt (Les Numériques voice for FR, Wirecutter voice for US, Which?/TechRadar voice for GB — see [`packages/scripts/lib/prompts.js`](packages/scripts/lib/prompts.js)), writes `sites/<niche>/<market>/src/content/articles/<slug>.mdx`, then post-fetches Amazon image+ASIN+price from the **correct marketplace** (`amazon.fr` / `amazon.com` / `amazon.co.uk`) and injects them.
3. `gsc-indexing.js` submits `pending` URLs to the GSC Indexing API (200/day cap tracked in `data/indexation-requests.json`). Use `--niche` / `--market` (or `--site <niche>-<market>`) to scope. Each (niche, market) is a separate GSC property since the domains differ.
4. Weekly `update-articles.yml` refills the queue if empty, then refreshes the oldest published articles per (niche, market).

Shared state lives in `data/*.json` at the repo root and **must be committed by the workflow** so the next run sees it. The schema is `keywords-queue.json = { [niche]: { [market]: KeywordEntry[] } }` and `published-urls.json = PublishedUrl[]` where each entry carries `niche` and `market`.

### Editorial voice per market

| Market | Locale  | Voice / Reference     | Sources whitelist (jardin-bricolage)                        |
|--------|---------|-----------------------|-------------------------------------------------------------|
| `fr`   | fr-FR   | Les Numériques        | Que Choisir, Les Numériques, Leroy Merlin, Castorama, ...   |
| `us`   | en-US   | Wirecutter            | Wirecutter, Consumer Reports, Home Depot, Lowe's, ...       |
| `gb`   | en-GB   | Which?, TechRadar     | Which?, Trusted Reviews, B&Q, Screwfix, ...                 |

Spelling matters: en-US uses "color" / "tire" / "trash"; en-GB uses "colour" / "tyre" / "rubbish". The prompt template in `prompts.js` is split (`buildPromptFr` / `buildPromptEn` with a `market` branch) precisely so the LLM cannot drift between en-US and en-GB.

### Adding a new (niche, market)

1. Add the row to `ENABLED_SITES` in [packages/config/niches.js](packages/config/niches.js).
2. Create `sites/<niche>/<market>/site.config.js` (copy from a sibling, adapt `domain`, `locale`, `language`, `seedKeywords`, `topicTokens`, `affiliatePrograms`, `editorialReference`).
3. Add the matching matrix row in `.github/workflows/{daily-articles,update-articles,build-check}.yml`.
4. Create the Cloudflare Pages project: `wrangler pages project create <niche>-<market>`.
5. Wire the custom domain at OVH and add it in the Pages project.
6. Add the Amazon Associates tag (`AMAZON_AFFILIATE_ID_<MARKET>`) to `.env` and to GitHub Secrets.

### EN sites — content-launch checklist (NOT done by the architecture refactor)

The US/GB scaffolds inherit the FR site's `src/` (layouts, components, static pages, content/pages). Before launching either, the following content i18n is needed:

- Translate `src/components/{Header,Footer,ArticleCard}.astro` (page chrome, navigation labels, SEO titles).
- Translate `src/layouts/{SiteLayout,ArticleLayout}.astro` and `src/pages/{index,404,comparatifs/index,avis/index,guides/index}.astro`.
- Rewrite `src/content/pages/{mentions-legales,politique-confidentialite,affiliation}.md` for the target jurisdiction (US privacy / FTC affiliate disclosure / UK ICO + ASA rules) and rename to `legal-notice.md` / `privacy-policy.md` / `affiliate-disclosure.md`. Update the corresponding routes.
- Decide whether to also localize URL slugs (`/comparatifs/` → `/comparison/`, `/avis/` → `/review/`, `/guides/` → `/guide/`). If yes, rename the matching `src/pages/<x>/[...slug].astro` directories AND update the subdir constant in [packages/scripts/article-generator.js](packages/scripts/article-generator.js).

## Hosting — Cloudflare Pages from a monorepo

Domains are registered at OVH; hosting is **Cloudflare Pages**, one project per site (4 total). The brief leaves the `Deploy to hosting` step as a placeholder — fill it as follows.

**Recommended pattern: deploy from the workflow with Wrangler** (not Cloudflare's Git integration). Reason: the daily workflow already runs `npm run build` after generating content, so we publish the artifact directly and avoid Cloudflare rebuilding from scratch (faster, no double-build, no need to expose API keys to Cloudflare's build env). The Git-integration alternative is documented below for the case where no workflow runs (manual edits pushed to `main`).

### Wrangler-based deploy (primary)

Append this step per site in [`.github/workflows/daily-articles.yml`](claude-code-guide-affiliation-sites.md) after the `Build Astro site` step:

```yaml
- name: Deploy ${{ matrix.site }} to Cloudflare Pages
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken:  ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: pages deploy sites/${{ matrix.site }}/dist --project-name=${{ matrix.site }} --branch=main
```

Pages project naming convention = niche slug (`jardin-bricolage`, `sport-fitness`, `cuisine`, `maison-elec`) so `--project-name` interpolates from the matrix. Create the four projects once via the dashboard (or `wrangler pages project create <niche>`) before the first run.

### Git-integration fallback (for non-workflow pushes)

In each Pages project's settings: **Root directory = `sites/<niche>`**, **Build command = `npm install && npm run build`** (or `pnpm`), **Build output = `dist`**, **Production branch = `main`**. Cloudflare watches the whole repo by default; add path filters under Build Watch Paths to scope each project to `sites/<niche>/**` + `packages/**` so a change in `sites/cuisine` doesn't redeploy the three other sites. Keep this disabled when Wrangler deploys from the workflow — otherwise both pipelines fight over the same project.

### DNS at OVH

Two options, pick one and stay consistent across the four domains:

1. **Delegate nameservers to Cloudflare** (recommended) — add the domain as a Cloudflare site, copy the assigned NS records into OVH's domain manager. Gives full DNS + CDN + analytics control. Cloudflare Pages then auto-provisions the apex and `www` records when you add a Custom Domain in the project.
2. **Keep DNS at OVH** — add a `CNAME` from `www.<domain>` → `<niche>.pages.dev` and use OVH's CNAME flattening / `ALIAS` for the apex. Simpler short-term, loses Cloudflare CDN/WAF features.

### Required GitHub Secrets

Cloudflare:
```
CLOUDFLARE_API_TOKEN     # scoped: Account → Cloudflare Pages → Edit
CLOUDFLARE_ACCOUNT_ID    # from dash.cloudflare.com URL
```

Amazon Associates — one tag per marketplace (separate accounts):
```
AMAZON_AFFILIATE_ID_FR
AMAZON_AFFILIATE_ID_US
AMAZON_AFFILIATE_ID_GB
```

Add these to the brief's [section 8](claude-code-guide-affiliation-sites.md) secrets list. The legacy `AMAZON_AFFILIATE_ID` (no suffix) is retired — `buildAmazonUrl` only reads `AMAZON_AFFILIATE_ID_<MARKET>`.

## Editorial line — non-negotiable

Voice and depth: **Les Numériques** (lesnumeriques.com). Tone: expert, factual, neutral, French, no superlatives without evidence. Two and only two article types:

### Type 1 — Test (intent: `avis`, single product)

- **Minimum 2 distinct sources** scraped before writing — this is anti-plagiarism, not a soft target. If only one source is reachable, abort the article (write `ERROR_INSUFFICIENT_SOURCES`, leave status `pending`, increment `errorCount`). Never paraphrase a single source.
- Required structure: H1 → intro → **specs/fiche technique** → sections per criterion (each with an **intermediate score `/10`**: e.g. *Performance*, *Ergonomie*, *Rapport qualité-prix*, *Autonomie/Bruit/whatever fits the niche*) → verdict with **a single final score `/10`** computed as a weighted average → pros/cons → conclusion.
- The final score must be derived from the intermediate scores in frontmatter (`subscores: { performance: 8, ergonomie: 7, ... }`, `finalScore: 7.6`). Document the weighting once in the frontmatter so reviewers can audit. **Never invent a score** — anchor each one in a sourced statement.
- **Affiliate placement**: the affiliate CTA must appear at least **3 times**: (1) right after the intro ("Voir le prix actuel"), (2) inside the specs/verdict block, (3) in the conclusion. Use the `<AffiliateButton>` component, not raw links.

### Type 2 — Comparatif (intent: `comparatif`, multi-product)

- Open with **the buying criteria** ("Comment choisir un X") before any product — this is what Les Numériques does and what ranks.
- Brief presentation per product (3–6 lines, not a mini-test) with one affiliate CTA each.
- **Mandatory recap table** (`<ComparisonTable>`) with the same criteria as columns and an affiliate link in the last column.
- Order products by a stated rationale ("Notre choix" / "Meilleur rapport qualité-prix" / "Pas cher" etc.), not arbitrarily.

### Grounding rules (apply to both types)

- Every factual claim must be traceable to a URL in the `sources:` frontmatter array.
- Contradictions across sources → state both ("Selon Que Choisir : X ; selon Les Numériques : Y").
- Prices: always tag as "vérifié le {date}, susceptible de changer". Never write a price not seen in the scrape.
- Required `<SourceList>` block at the bottom of every article for transparency (Google E-E-A-T signal).

## Frontmatter contract

Both article types share this base — `article-generator.js` and the Astro Zod schema must stay in sync:

```yaml
title: "..."                 # contains the keyword, ≤60 chars total with site suffix
description: "..."           # 150-160 chars, contains keyword
keyword: "..."
intent: "avis" | "comparatif" | "guide"
publishedAt: ISO8601
updatedAt:   ISO8601
sources:
  - { url, domain, scrapedAt }
affiliateLinks:
  - { product, url, program }   # program: "amazon" | "awin-<merchant>"
groundingScore: "5/8"        # sources used / sources available
# Test-only:
subscores: { criterion: number/10, ... }
finalScore: number            # weighted average of subscores
weights:    { criterion: number, ... }   # must sum to 1
# Comparatif-only:
products: [ { name, score, asin?, awinId?, criteria: {...} } ]
```

## Editorial / SEO conventions

- Slug from the keyword via `github-slugger`. Do not edit slugs after publication — the URL is in `data/published-urls.json` and was submitted to GSC.
- Internal linking: every new article should link to ≥2 existing articles in the same niche if any exist (cluster strategy). Read the `src/content/articles/*.md` directory before writing.
- Affiliation disclosure block (RGPD + Amazon/Awin TOS) must be present on every article — render it once via the `ArticleLayout`, don't ask the model to repeat it.
- All four sites must each include `/mentions-legales` and `/politique-confidentialite` pages. Do not deploy a site missing these.

## CLI / commands cheatsheet

```bash
# Refill the keyword queue for one (niche, market), or every ENABLED_SITES row
node packages/scripts/dataforseo-keywords.js --niche jardin-bricolage --market fr
node packages/scripts/dataforseo-keywords.js --site jardin-bricolage-us
node packages/scripts/dataforseo-keywords.js                              # all enabled

# Generate the next article(s) — env MAX_ARTICLES_PER_RUN limits per (niche, market)
node packages/scripts/article-generator.js --niche jardin-bricolage --market fr

# Submit pending URLs to GSC (rate-limited to 1/s, daily cap 200). Optional scoping flags.
node packages/scripts/gsc-indexing.js
node packages/scripts/gsc-indexing.js --niche jardin-bricolage --market us

# Per-site Astro dev / build
pnpm --filter ./sites/jardin-bricolage/fr dev
pnpm --filter ./sites/jardin-bricolage/fr build
pnpm --filter ./sites/jardin-bricolage/us build
pnpm --filter ./sites/jardin-bricolage/gb build
# (or via the convenience scripts: `pnpm dev:jardin:fr`, `pnpm build:jardin:us`, ...)

# Trigger a workflow manually instead of waiting for cron
gh workflow run daily-articles.yml -f site=jardin-bricolage-fr
gh workflow run daily-articles.yml -f site=all

# Manual one-off deploy to Cloudflare Pages (after a local build)
pnpm --filter ./sites/jardin-bricolage/fr build && \
  npx wrangler pages deploy sites/jardin-bricolage/fr/dist --project-name=jardin-bricolage-fr --branch=main
```

Local dev requires `.env` at the repo root with the variables listed in [section 8 of the brief](claude-code-guide-affiliation-sites.md). Never commit `.env`. The same keys must exist as GitHub Secrets.

## When extending the brief

- Adding a niche → update [packages/config/sources.config.js](claude-code-guide-affiliation-sites.md), [packages/config/affiliate.config.js](claude-code-guide-affiliation-sites.md), `data/keywords-queue.json` (init `[]`), the GitHub Actions matrix in all three workflows, the niche list in `dataforseo-keywords.js#loadSiteConfigs`, **and** create the matching Cloudflare Pages project (`wrangler pages project create <niche>`) plus its custom domain. Forgetting any of these silently drops the niche from the pipeline.

## Scraper bypass strategy

The scraper in [packages/scripts/lib/scrape.js](packages/scripts/lib/scrape.js) uses **fetch-first, Playwright fallback**. Routing rules:

1. **Fetch path** (1-2s): for sources without aggressive WAFs (editorial sites, smaller retailers). Default route.
2. **Browser path** (5-8s): for sources tagged `useBrowser: true` in `sources.config.js`. Uses a Chromium singleton from [lib/browser.js](packages/scripts/lib/browser.js) with stealth tweaks (`--disable-blink-features=AutomationControlled`, `navigator.webdriver` removal, FR locale, real Chrome UA).
3. **Auto-fallback**: if fetch returns < 2KB (challenge stub) or the extraction is < 300 chars, the source is retried via browser before giving up.
4. **5xx hard reject**: even if browser reaches the page, status ≥ 500 (≠ 503) is treated as the WAF serving an error page. Don't try to extract from those.

When you see a source failing in production logs:
- "HTTP 5xx" → real server-side block, no recovery without proxy. Either drop the source or replace it with a related domain.
- "text too short via browser" → page rendered but Akamai/PerimeterX served a near-empty challenge. Examples currently failing: Leroy Merlin, Mr Bricolage. Don't waste cycles tweaking selectors — these need residential proxies (DataForSEO On-Page API or Bright Data).
- "thin extraction via fetch" → JS-rendered (e.g. Cdiscount). The auto-retry via browser usually fixes it; if not, add `useBrowser: true` to skip the wasted fetch.

Don't add new "stealth" plugins reactively. The current setup beats lazy WAFs (Que Choisir's UA filter, Cdiscount's JS rendering, Amazon's basic bot check). Sources that beat it (Akamai Pro on big retailers) won't fall to incremental tweaks — accept them as misses or pay for a residential proxy.
- Adding a source for an existing niche → add it to `sources.config.js`. If it needs a non-trivial search URL, also extend `buildSearchUrl()` in `article-generator.js` — the default `?q=` fallback breaks on most retailer sites.
- Adding an affiliate program → add credentials to `.env` and GitHub Secrets, register it in `affiliate.config.js#programs`, and extend `buildAffiliateUrl()`. Then map at least one product to it in `affiliate.config.js#products` to test.
- Tweaking the scoring formula in `dataforseo-keywords.js` → mirror the change in seo-analyzer's [seo_analyzer/score](/Users/cedric/projects/perso/seo-analyzer/seo_analyzer/score) so the two pipelines don't diverge.
