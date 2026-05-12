# ARCHITECTURE-SEO.md

Cartographie factuelle de l'infrastructure SEO + génération de contenu du monorepo. Document de référence pour mener une revue objective de la stratégie (cf. dernière section **Questions ouvertes pour la revue**).

> Sources de vérité (lues lors de la rédaction) : code de [`packages/scripts/`](packages/scripts/), [`packages/site-template/src/`](packages/site-template/src/), [`packages/config/`](packages/config/), workflows [`.github/workflows/`](.github/workflows/). En cas de désaccord avec [CLAUDE.md](CLAUDE.md), le code fait foi — les divergences sont listées en fin de document.

---

## 1. Vue d'ensemble

Monorepo Astro multi-niche × multi-marché. Une seule source de code partagée ([`packages/site-template/src/`](packages/site-template/src/)), un site Cloudflare Pages par paire **(niche, marché)**. Registre unique des sites actifs : [`packages/config/niches.js#ENABLED_SITES`](packages/config/niches.js). À date, seul **jardin-bricolage** est wiré sur ses trois marchés (FR/US/GB) ; les autres niches sont scaffold-only.

Le SEO repose sur **trois leviers couplés** :

1. **Génération de contenu automatisée** via GitHub Actions + Claude Code CLI (pas le SDK), gated par une cadence anti-sandbox déterministe.
2. **Découverte de mots-clés** : Semrush (clusters + secondaryKeywords) — source unique alimentant à la fois le daily et le manuel.
3. **Signaux E-E-A-T enforced à la génération** : grounding ≥3 sources, JSON-LD Person + bio auteur, disclosure affiliation, SourceList visible.

Le tout est conçu pour qu'un nouveau site **ne sorte pas du bac à sable Google** par un comportement programmatique détectable (cadence régulière, timestamps groupés, contenu identique entre marchés).

---

## 2. Pipelines GitHub Actions

Quatre workflows dans [`.github/workflows/`](.github/workflows/) :

| Workflow | Trigger | Rôle |
|---|---|---|
| [`daily-content.yml`](.github/workflows/daily-content.yml) | 4 crons/jour (06:11, 10:37, 14:23, 18:47 UTC) | Article du jour, **bundle-aware** (comparatif → pillar → avis) |
| [`update-articles.yml`](.github/workflows/update-articles.yml) | Hebdomadaire (lundi 09:00 UTC) | Refresh anciens articles (re-scrape sources + diff ciblé) |
| [`gsc-indexing.yml`](.github/workflows/gsc-indexing.yml) | Quotidien | Soumission URLs `pending` à GSC Indexing API |
| [`build-check.yml`](.github/workflows/build-check.yml) | Push/PR | Validation schéma Zod + build Astro |

**Matrix** : un job par paire (niche, marché) issue de `ENABLED_SITES`, `max-parallel: 1` pour sérialiser les écritures sur `data/*.json`. La matrice est statique dans le YAML — l'ajout d'une niche nécessite **éditer les workflows ET `ENABLED_SITES`**.

**Gating commun** :
- `isLaunched()` ([`lib/site-config.js`](packages/scripts/lib/site-config.js)) : skip si le `domain` est encore un `TODO_*`.
- `cadence-cli` ([`packages/scripts/cadence-cli.js`](packages/scripts/cadence-cli.js)) : skip si le jour n'est pas actif pour ce site, ou si le slot horaire élu n'est pas celui en cours, ou si un article a déjà été publié aujourd'hui pour ce site.

> **Divergence CLAUDE.md** : la doc parle de trois workflows séparés (daily-articles, daily-guides, weekly-informational). En réalité **tout est fusionné dans `daily-content.yml`** avec un picker conscient des bundles.

---

## 3. Pipeline de génération d'article

### 3.1. Flow général — [`article-generator.js`](packages/scripts/article-generator.js)

Modes d'invocation :

| Mode | Comportement |
|---|---|
| `--bundle` | Daily — pioche le prochain slot d'un bundle ouvert (comparatif → pillar → avis) depuis `data/semrush-priorities.json` |
| `--cluster <id>` | Génère le cluster Semrush par id |
| `--cluster --count N` | Top N clusters pending par score, stop au 1er échec |
| `--cluster --count N --longtail` | Idem, mais clusters avec primary ≥3 tokens AND avgKD ≤ 19 |

Étapes (`generateArticle`) :
1. Pick keyword (bundle slot / cluster selon mode) depuis `data/semrush-priorities.json`.
2. Marque `status: 'writing'` dans la registry.
3. Scrape ≥3 sources whitelistées ([`sources.config.js`](packages/config/sources.config.js) — différent par marché). **Si <3 reachable → abort, status revient à `pending`, `errorCount++`**.
4. Construit un prompt grounded (`buildPromptFr` ou `buildPromptEn` selon market) injecté via `mktemp` à **Claude Code CLI** (`claude_retry -p --dangerously-skip-permissions`).
5. Claude écrit le `.mdx` directement via son outil `Write`.
6. Post-traitement :
   - **Amazon match** ([`product-images.js`](packages/scripts/lib/product-images.js)) — résout image/ASIN/prix sur la marketplace correcte (amazon.fr / .com / .co.uk).
   - **Google Shopping fallback** ([`google-shopping.js`](packages/scripts/lib/google-shopping.js)) — DataForSEO Shopping API si Amazon échoue.
   - **FAQ extraction** ([`faq-extract.js`](packages/scripts/lib/faq-extract.js)) pour le JSON-LD FAQPage.
   - **Price scrubber** ([`price-scrubber.js`](packages/scripts/lib/price-scrubber.js)) — datage des prix.
7. **Validation** ([`article-validator.js`](packages/scripts/lib/article-validator.js)) :
   - `sources ≥ 3` (Zod + check JS).
   - Density affiliée : `≥3 CTAs` sur intent=avis/comparatif, `0` sur informational/guide.
   - Stylometric tics (em-dash, banned phrases — cf. §3.3) : **scan warn-only**, jamais bloquant. Cf. §12.4.
8. Mark `published`, append `data/published-urls.json`, update bundle siblings, commit.

### 3.2. Bundle topique — [`lib/bundle.js`](packages/scripts/lib/bundle.js)

Concept clé qui remplace la notion "weekly informational" de CLAUDE.md. Un bundle = **3 articles topiquement liés** générés en séquence :

1. **comparatif** (transactionnel, identifie le produit #1) → publié en premier.
2. **pillar/guide** (informationnel, link vers le comparatif live) → 1-2 jours plus tard.
3. **avis** (single-product deep dive sur le produit #1) → encore 1-2 jours plus tard.

Effet SEO recherché : maillage hub-and-spoke naturel, dilution de la densité affiliée par 1/3 d'article info pur, sémantique cluster cohérente pour les SERP entités.

Les `bundleSiblings` sont injectées rétroactivement dans la frontmatter des articles déjà publiés du bundle quand un nouveau slot ship — le layout Astro lit ce champ pour afficher "Articles liés".

### 3.3. Prompt engineering — [`lib/prompts.js`](packages/scripts/lib/prompts.js)

**Voix éditoriale par marché** (deux fonctions séparées `buildPromptFr` / `buildPromptEn`, le marché EN se sous-branche US/GB) :

| Marché | Référence ton | Spelling |
|---|---|---|
| `fr` | Les Numériques (factuel, scoring /10, pas de superlatifs sans preuve) | fr-FR |
| `us` | Wirecutter (opinionated, pas de hedging) | en-US (color, tire, trash) |
| `gb` | Which? + TechRadar | en-GB (colour, tyre, rubbish) |

**Règles anti-LLM-tics enforced dans le prompt** (et vérifiées en post-pass) :
- Tirets em/en (`—`/`–`) interdits → remplacer par virgule/point/deux-points.
- Phrases bannies (zéro occurrence) : "it is important to note", "let's dive in", "in conclusion", équivalents FR ("il est important de noter", "plongeons dans", "en conclusion").
- Rythme : alternance phrases 5-12 mots / 20-35 mots, max 3 consécutives de longueur similaire.
- Frontière d'opinion : "satisfaisant" plutôt que "plutôt bon" — jugements ancrés sur une source.
- Pas de réutilisation du même connecteur deux fois.
- Longueur 1500-3200 mots (range volontairement large pour variabilité statistique).
- 4-6 critères de scoring (pas toujours le même nombre).
- 3-5 entrées FAQ.

**Cluster awareness** : si l'article vient d'un cluster Semrush, le prompt reçoit un bloc `secondaryKeywords:` (4-7 variantes long-tail) à intégrer naturellement.

**Internal linking** (`buildClusterBlock`) : groupe les articles déjà publiés par intent et demande à Claude de prioriser les liens vers l'intent *complémentaire* (transactionnel ↔ éditorial), pas vers la même classe.

### 3.4. Validation & schéma — [`packages/site-template/src/content.config.ts`](packages/site-template/src/content.config.ts)

Schéma Zod qui s'exécute à chaque build Astro (donc dans `build-check.yml` aussi) :
- `sources: z.array(...).min(3)` — anti-grounding-bypass.
- `subscores` / `finalScore` / `weights` requis si intent=avis ; `products` requis si intent=comparatif.
- `groundingScore: "X/Y"` parsé et vérifié.

Un article hand-edited qui violerait ces contraintes échoue le build : **le CI est la dernière ligne de défense**.

---

## 4. Stratégie de découverte de mots-clés — Semrush (source unique)

Semrush est la **seule** source de keywords. Le même registre `data/semrush-priorities.json` alimente à la fois le daily auto (`--bundle`) et le manuel (`--cluster`). DataForSEO n'est plus utilisé que pour l'enrichissement produit côté Amazon/Google Shopping (cf. §3.1 étape 6).

### 4.1. Pipeline — [`semrush-prioritize.js`](packages/scripts/semrush-prioritize.js)

- Endpoint : `/phrase_fullsearch` (filtres KD/vol push server-side car 20 API units / row).
- `database` + `language` par marché via `MARKET_SEMRUSH` ([`niches.js`](packages/config/niches.js)) — fr→fr, us→us, gb→**uk** (Semrush code historique).
- **Clustering** ([`lib/cluster.js`](packages/scripts/lib/cluster.js)) : token-Jaccard ≥ 0.6 — tokenize + overlap. Pas de SERP overlap (≠ approches concurrence de type SERP-clustering).
- **Cache disque** `data/semrush-cache/` TTL 14 jours.
- **Intent classification** ([`lib/intent.js`](packages/scripts/lib/intent.js)) : heuristique pattern + CPC threshold (≥0.20€ → commercial). L'intent du cluster est indicatif — Claude peut le promouvoir au moment d'écrire l'article (l'URL est dérivée du frontmatter, pas du cluster).
- **Deux presets** :
  - Régulier : KD ≤ 29, vol ≥ 200.
  - **Long-tail (anti-sandbox)** : KD ≤ 19, vol 50-500, ≥3 content tokens — entrées taggées `longtail: true`. Recommandé pour les sites fraîchement lancés (US/GB en cours de bootstrap).
- Écrit dans `data/semrush-priorities.json[niche][market]` : clusters complets `{id, primaryKeyword, secondaryKeywords[], secondaryDetails[], totalVolume, avgKD, score, intent, status, bundle?}`.

### 4.2. Refill automatique dans `daily-content.yml`

Avant chaque génération, le workflow vérifie si la registry a des opportunities `pending` pour le couple (niche, market). Si la registry est vide, il appelle `semrush-prioritize.js --niche <n> --market <m> --longtail` — donc le pipeline reste autonome tant que `SEMRUSH_API_KEY` est présent dans les Secrets GitHub.

Pour pré-charger ou pour swap de preset, lancer manuellement :

```bash
node packages/scripts/semrush-prioritize.js --niche jardin-bricolage --market us --longtail
node packages/scripts/semrush-prioritize.js --niche jardin-bricolage --market gb --longtail
```

### 4.3. Boucle feedback GSC — non câblée

[`lib/gsc-feedback.js`](packages/scripts/lib/gsc-feedback.js) calcule un multiplicateur de score par opportunité à partir des perfs réelles GSC sur les URLs topiquement similaires déjà publiées. **Le module est en place mais n'est plus consommé** depuis le retrait de `dataforseo-keywords.js` ; à recâbler dans `semrush-prioritize.js` quand on voudra que les positions GSC influencent le scoring des clusters. `gsc-analytics.js` continue de persister `data/gsc-metrics.json` indépendamment, donc la donnée d'entrée est disponible.

---

## 5. Cadence anti-sandbox — [`lib/cadence.js`](packages/scripts/lib/cadence.js)

Le mécanisme central qui **fait que le site ne ressemble pas à du contenu programmatique** côté Google.

### 5.1. Maturity stages

Lus depuis le compte d'articles dans `data/published-urls.json` (donc ne peut pas être trichés sans dégrader le signal réel) :

| Stage | Articles publiés | Aff/jour | Guide/jour | Info/sem | Jours actifs/sem |
|---|---|---|---|---|---|
| sandbox | 0-9 | 1 | 0 | 0 | 4 |
| warming | 10-29 | 1 | 1 | 1 | 5 |
| ramping | 30-79 | 1 | 1 | 1 | 7 |
| mature | 80+ | 1 | 1 | 1 | 7 |

`MAX_ARTICLES_PER_RUN=1` est un plafond dur côté worker — la cadence ne peut que descendre, jamais monter.

### 5.2. Election déterministe

- **Jour actif** : `mix32(fnv1a(dateKey) ^ fnv1a(siteKey)) % 7 < activeDaysPerWeek`. Re-run le même jour = même verdict (pas de flapping).
- **Sites disjoints** : FR/US/GB d'une même niche obtiennent des patterns de jours skippés **disjoints** (~50%) — les trois marchés ne publient jamais en lockstep.
- **Slot horaire** : un seul des 4 crons par jour effectivement publie ; les 3 autres sortent au gate après ~30 s (sans `sleep` payé en minutes CI).

### 5.3. Cap cross-workflow 1/jour

[`cadence-cli.js:70-72`](packages/scripts/cadence-cli.js) : `publishedToday(niche, market) > 0` → skip dur, même si activeToday=true. Garantit qu'aucune combinaison de workflows ne peut empiler 2 articles le même jour sur le même site.

**Override manuel** : `workflow_dispatch` accepte `force_slot` (0-3) pour tests, et la CLI permet un dry-run "this site publish today?".

---

## 6. E-E-A-T enforced à la génération

### 6.1. Auteur (Person vs Organization)

[`ArticleLayout.astro`](packages/site-template/src/layouts/ArticleLayout.astro) lit `siteConfig.author` :
- **Si présent** (`{name, role, bio, linkedinUrl, photo}`) : JSON-LD passe en `author: Person` avec `sameAs: linkedinUrl`, et le composant [`AuthorBio.astro`](packages/site-template/src/components/AuthorBio.astro) est rendu.
- **Sinon** : `author: Organization` — fonctionne en pre-launch mais signal E-E-A-T faible.

**Responsabilité opérateur** (CLAUDE.md "Manual responsibilities") : si `linkedinUrl` est settée, le profil **doit** exister — les quality raters Google cliquent.

### 6.2. Transparence des sources

[`SourceList.astro`](packages/site-template/src/components/SourceList.astro) rend en bas de chaque article la liste des sources scrapées (`domain` + `scrapedAt`). Signal lisible à la fois pour le lecteur et pour les raters.

### 6.3. Disclosure affiliée

[`AffiliateDisclosure.astro`](packages/site-template/src/components/AffiliateDisclosure.astro) — rendu une seule fois par `ArticleLayout`, jamais par le modèle. Mention RGPD + Amazon/Awin TOS.

### 6.4. JSON-LD étendu

`ArticleLayout` génère selon l'intent :
- **Article** ou **Review** (avec `aggregateRating` issu de `finalScore`).
- **ItemList + Review[]** pour les comparatifs (chaque produit = Review rich result individuel).
- **BreadcrumbList** (Home → Section → Article).
- **FAQPage** extrait du `## FAQ` du body via [`lib/faq-extract.js`](packages/scripts/lib/faq-extract.js).

### 6.5. Variabilité structurelle anti-pattern

Outre les règles dans le prompt (§3.3), la diversité de structure vient aussi de :
- 4-6 critères de scoring (range, pas un nombre fixe).
- Sub-scores affichés en composants distincts (`<ScoreBlock>`), donc le DOM diffère d'un article à l'autre.
- 3-5 FAQ items.
- Longueur 1500-3200 mots.

L'objectif n'est pas de **tromper** un classifier (impossible à long terme) mais de **ressembler statistiquement** à un site éditorial type Les Numériques, pas à un farm de pages générées.

---

## 7. Indexation GSC — [`gsc-indexing.js`](packages/scripts/gsc-indexing.js)

- Lit `data/published-urls.json` filtré sur `indexationStatus='pending'`.
- Soumet à GSC Indexing API à 1 req/s.
- Cap quotidien 200 URLs (limite Google), tracking dans `data/indexation-requests.json`.
- Max 100 URLs par run.
- Scope optionnel `--niche`, `--market`, `--site` (utile car chaque marché est une **propriété GSC distincte** — domaines différents).
- Marque `'submitted'` après succès.

---

## 8. Tracking — [`UmamiAnalytics.astro`](packages/site-template/src/components/UmamiAnalytics.astro)

Self-hosted Umami (un Website ID par site, dans `site.config.js#umami`). Au-delà des pageviews :

- **`affiliate-click`** sur tout `<a data-affiliate="...">` (rendu par `<AffiliateButton>` / `<ProductCard>`). Payload : `program, product, target_host, target_url, source_path`.
- **`outbound-click`** sur tout lien externe (typiquement les sources de `SourceList`). Payload : `target_host, target_url, source_path`.

Wiring 100% client-side via délégation d'event, ne casse pas la statique.

---

## 9. Scraping anti-bot — [`lib/scrape.js`](packages/scripts/lib/scrape.js)

Routage **fetch-first, Playwright fallback** :

1. Fetch (1-2 s) — défaut.
2. Browser path (5-8 s) si `useBrowser: true` dans [`sources.config.js`](packages/config/sources.config.js), ou auto-retry si fetch < 2KB ou extraction < 300 chars.
3. Singleton Chromium ([`lib/browser.js`](packages/scripts/lib/browser.js)) avec tweaks stealth : `--disable-blink-features=AutomationControlled`, suppression `navigator.webdriver`, UA Chrome réel, locale FR.
4. 5xx (≠ 503) → reject dur, même en browser.

**Réalité prod** : sources qui marchent (Que Choisir, Les Numériques, Cdiscount via browser), sources cassées (Leroy Merlin, Mr Bricolage — Akamai Pro / PerimeterX). Pas de retry agressif sur ces dernières : ça coûte des minutes CI sans résultat. Soit on les drop, soit on passe sur un proxy résidentiel (non implémenté).

---

## 10. i18n & URLs

[`packages/config/i18n.js`](packages/config/i18n.js) est le **single source** pour les chrome strings + slugs localisés :

| Concept | FR | EN |
|---|---|---|
| Slug comparatifs | `comparatifs` | `comparisons` |
| Slug avis | `avis` | `reviews` |
| Slug guides | `guides` | `guides` |
| Slug légal | `mentions-legales` etc. | `legal-notice` etc. |

Une seule route dynamique [`src/pages/[type]/[slug].astro`](packages/site-template/src/pages/) map `data.intent` → `i18n(market).slug{...}`. Conséquence : **l'URL est calculée à partir de l'intent frontmatter, pas de l'intent cluster**. Permet la promotion d'intent (un cluster classifié `informational` peut shipper en `avis` si les sources le supportent) sans casser GSC.

---

## 11. Divergences avec CLAUDE.md (à reconcilier ou documenter)

1. **Workflows** : CLAUDE.md décrit `daily-articles.yml`, `daily-guides.yml`, `weekly-informational.yml` séparés. Réalité : **un seul `daily-content.yml` bundle-aware**.
2. **"Weekly informational"** : remplacé par le **slot pillar** dans le modèle de bundle topique.
3. **Tableau cadence worst-case** : la doc écrit "5/7/7 articles par semaine max" en warming/ramping/mature. La réalité (cap cross-workflow 1/jour) plafonne à `Jours actifs/sem` — soit 5/7/7 effectivement mais via un mécanisme différent. Le tableau de CLAUDE.md est exact en valeurs, imprécis en mécanique.
4. **Claude Code CLI vs SDK Anthropic** : CLAUDE.md section "brief" évoque `client.messages.create`. Réalité : **Claude Code CLI** spawn via `spawnSync` ([`lib/claude-retry.sh`](packages/scripts/lib/claude-retry.sh) + invocation dans le workflow). Cela hérite des outils Write/Bash/scrapers et du flag `--dangerously-skip-permissions`.

---

## 12. Questions ouvertes pour la revue

Liste des décisions architecturales qui méritent d'être challengées factuellement (le code répond au QUOI ; la revue doit répondre au POURQUOI / EST-CE OPTIMAL).

### 12.1. ~~Double source DataForSEO + Semrush~~ — résolu (2026-05-12)

DataForSEO supprimé comme source de keywords. Semrush est désormais la source unique alimentant à la fois le daily auto (`--bundle`) et le manuel (`--cluster`). DataForSEO reste utilisé uniquement pour l'enrichissement produit (Amazon DFS + Google Shopping fallback). Voir §4 pour le détail.

### 12.2. Stratégie bundle (comparatif → pillar → avis) — overhead vs gain ?

- 3 articles pour couvrir 1 produit phare = 3× le coût de génération.
- Hypothèse implicite : maillage interne hub-and-spoke fait gagner du rank vs 3 articles non liés.
- **À mesurer** : sur les bundles déjà livrés, est-ce que les positions GSC à J+30 / J+60 surperforment les articles standalone ?
- Si non, le bundle est un overhead de variabilité éditoriale (joli signal anti-pattern) mais pas un levier SEO.

### 12.3. Cadence sandbox 1 article/semaine — trop conservatrice ?

- Stage sandbox : 4 jours actifs × 1 article/jour mais cap cross-workflow 1/jour → effectivement **~4 articles/semaine**, pas 1.
- Sur jardin-bricolage-fr en production : combien de temps a-t-il fallu pour atteindre stage `warming` (10 articles) ? Si > 4 semaines, la sandbox a peut-être trop ralenti le ramp.
- **Alternative** : démarrer en `warming` direct si le site a un author bio crédible + backlinks initiaux ? La maturité numérique est un proxy, pas la vérité.

### 12.4. Anti-LLM-tics — utile ou superstition ?

- Les règles "pas de em-dash, pas de 'let's dive in'" sont basées sur l'idée que Google a un classifier stylométrique. **Aucune preuve publique** que c'est le cas — Google's scaled-content-abuse classifier est documenté comme behavioral, pas stylistique.
- **État actuel (2026-05-12)** : conformément à l'option 2 retenue, les instructions `ANTI_LLM_TICS_{FR,EN}` restent dans le prompt (coût nul, déjà présentes), mais le **validator est passé en warn-only** (`LLM_TICS_FAIL_THRESHOLD` supprimé) et `article-remediator.js` a été retiré. Plus aucun appel Claude supplémentaire dû aux tics.
- Le scan regex local (`scanLlmTics`) est conservé pour instrumentation : il log la dérive sans bloquer. Permettra un A/B futur si on veut retirer les blocs anti-tics du prompt.

### 12.5. Densité affiliée ≤3 CTAs — calibration

- Sur des sites concurrents qui rank (Les Numériques, Wirecutter), combien de CTAs par article comparatif ? Probablement bien plus (chaque produit = 1 CTA, et un comparatif a 6-10 produits).
- Le cap "3 CTAs" est défensif. Peut-être trop : sous-monétisation possible.
- **À mesurer** : revenue/article actuel vs revenue théorique si on autorisait 1 CTA par produit dans `<ProductCard>`.

### 12.6. Sources whitelist — robustesse vs couverture

- Whitelist stricte par marché = signal de qualité, mais sources cassées (Leroy Merlin etc.) descendent fréquemment sous le seuil de 3 sources → articles abortés.
- **Question** : est-ce que la qualité du whitelist vaut le coût d'articles non publiés ? Vs whitelist plus large + critère de qualité par scoring.

### 12.7. Scraper sans proxy résidentiel

- Akamai Pro / PerimeterX battent le stealth basique. Sources stratégiques (gros retailers) sont inaccessibles.
- DataForSEO On-Page API ou Bright Data résoudraient → ~$200/mois supplémentaires.
- **Arbitrage** : couverture de sources premium vs coût. Si les bundles ont besoin des prix Leroy Merlin pour ranker sur "leroy merlin tondeuse", le proxy devient ROI-positif.

### 12.8. JSON-LD Review individuelles dans les comparatifs — parsées ou code mort ?

Comparatifs → 1 `ItemList` avec N `Review` nestés (1 par produit, [`ArticleLayout.astro:67-88`](packages/site-template/src/layouts/ArticleLayout.astro)). Avis → l'article entier est un `Review` avec `reviewRating /10` ([`ArticleLayout.astro:58-62`](packages/site-template/src/layouts/ArticleLayout.astro)).

**Ce qui n'est PAS un risque** (à corriger dans la culture du repo) : Google n'interdit pas les Review de produits tiers publiées par un site éditorial. La règle anti-self-Reviews de 2019 vise les `LocalBusiness`/`Organization` qui se review eux-mêmes ou les `aggregateRating` fabriqués en interne sur leurs propres services. Notre cas (site éditorial, `itemReviewed` = produit tiers identifié par ASIN/marque externe) est exactement le pattern Wirecutter / Les Numériques — autorisé.

**Les vrais risques** :

1. **Rich snippets en chute libre depuis ~2020.** Google a massivement réduit la fréquence d'affichage des étoiles de Review en SERP, même pour du markup valide. Le JSON-LD passe la validation mais ne génère plus de visuel. → Probable code qui ne bouge aucune aiguille. **À mesurer** : GSC > Enhancements > "Review snippets" sur jardin-bricolage-fr — combien d'impressions de rich result effectif vs simple ligne bleue ?

2. **Bug `brand` fallback** ([`ArticleLayout.astro:59`](packages/site-template/src/layouts/ArticleLayout.astro#L59)) : `brand: { name: data.product.developer ?? data.product.name }`. Quand `developer` n'est pas extrait, la marque devient le nom complet du produit ("Bosch Rotak 40-37" devient à la fois `product.name` ET `brand.name`). JSON-LD sémantiquement malformé → Google peut silently drop le snippet entier. **Bug réel, indépendant de la politique** — à corriger même si la décision sur la suite du §12.8 va vers "supprimer le markup".

3. **Combo `ItemList` + `Review` nestés non-standard.** Supporté individuellement mais le rich result attendu pour un comparatif serait plutôt `Product` avec `offers` — ce qu'on ne peut pas émettre légitimement car on n'est pas le vendeur. À tester sur [Rich Results Test](https://search.google.com/test/rich-results) avec 3 URLs live pour voir ce que Google parse vs ignore.

4. **Intégrité `author.sameAs`.** Si `siteConfig.author.linkedinUrl` est set mais le profil n'existe pas, le `sameAs` du JSON-LD claim explicitement une identité fictive. Plus saillant pour les quality raters que le simple bio sur la page. Déjà tracké comme manual responsibility dans CLAUDE.md mais à re-souligner ici car le JSON-LD le rend "machine-checkable".

**Décision attendue** : garder le markup (si #1 montre qu'il génère encore des rich results) + fixer #2 ; ou supprimer Review/ItemList et garder uniquement Article + BreadcrumbList + FAQPage (qui eux marchent toujours bien). Sans la mesure GSC, on ne peut pas trancher.

### 12.9. Auto-ramp basé sur le count, pas sur GSC signal

- La cadence lit le count `published-urls.json`, **pas** les impressions/clics GSC.
- Conséquence : un site peut atteindre `mature` avec 80 articles dont 0 ranke. Le mécanisme suppose que la maturité numérique = maturité Google. Faux en pratique.
- **Évolution possible** : cadence-cli read GSC analytics ([`gsc-analytics.js`](packages/scripts/gsc-analytics.js) existe déjà) et conditionne le passage de stage à un seuil d'impressions/clics. Plus exigeant mais plus aligné avec la réalité Google.

### 12.10. Pas de stratégie off-page

- CLAUDE.md le mentionne explicitement comme manual operator responsibility.
- Aucun outil dans le repo pour : prospecter backlinks, monitorer mentions de marque, gérer comptes sociaux.
- **Décision** : c'est un gap conscient (focus on-page) ou à industrialiser ?

---

*Document à mettre à jour à chaque changement structurel du pipeline. Les divergences §11 sont prioritaires : soit le code revient à la doc, soit la doc rattrape le code.*
