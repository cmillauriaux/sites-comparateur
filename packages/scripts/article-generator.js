#!/usr/bin/env node
/**
 * Generate a grounded article for the next pending keyword.
 *
 * Flow:
 *   1. Pick highest-score pending keyword for the site
 *   2. Mark "writing" → scrape sources from sources.config.js
 *   3. Abort if < 2 sources reachable (anti-plagiarism: forces synthesis)
 *   4. Resolve affiliate links from affiliate.config.js
 *   5. Spawn Claude Code CLI with a grounded prompt; CLI writes the .md
 *   6. Validate output exists, update queue → "published", append to published-urls.json
 *
 * Usage:
 *   node packages/scripts/article-generator.js --site jardin-bricolage
 *   MAX_ARTICLES_PER_RUN=3 node packages/scripts/article-generator.js --site cuisine
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import slugger from 'github-slugger';

import { REPO_ROOT, SITES_DIR, requireEnv } from './lib/env.js';
import { readQueue, writeQueue, appendPublished } from './lib/queue.js';
import { loadSiteConfig, parseArgs, resolveSiteArg } from './lib/site-config.js';
import { scrapeSourcesForKeyword } from './lib/scrape.js';
import { fetchProductImages, injectImagePaths, injectAffiliateAsins, injectPrices } from './lib/product-images.js';
import sourcesConfig from '@comparateur/config/sources';

const MAX_ARTICLES_PER_RUN = parseInt(process.env.MAX_ARTICLES_PER_RUN || '2', 10);
const MIN_SOURCES = 2;
const slug = new slugger();

function pickNextPending(queue, niche) {
  const siteQueue = queue[niche] || [];
  return siteQueue
    .filter(k => k.status === 'pending' && (k.errorCount || 0) < 3)
    .sort((a, b) => b.score - a.score)[0];
}

function buildPrompt({ keyword, intent, scrapedSources, siteConfig, articleSlug, outputPath }) {
  const sourcesBlock = scrapedSources
    .map((s, i) => `### SOURCE ${i + 1} — ${s.name} (trust: ${s.trust})\nURL: ${s.url}\n\n${s.content}`)
    .join('\n\n---\n\n');

  const today = new Date().toISOString();

  const intentBrief = intent === 'comparatif'
    ? `INTENT = COMPARATIF (multi-produit). Structure REQUISE:
1. H1 contenant le keyword
2. Introduction (2-3 phrases) — qui doit acheter ce type de produit, ce qu'on a retenu d'essentiel
3. ## Comment choisir un [produit] — 4-6 critères de choix CONCRETS et mesurables. C'est la section qui rank et qui apporte le plus de valeur. Pas de citation de source ici, on EXPLIQUE.
4. ## Notre sélection [année] — un H3 par produit (4-6 produits). Pour chacun :
   - Une <ProductCard name="Marque Modèle" image="auto:Marque Modèle" score={8.5} description="..." pros={["...", "..."]} cons={["..."]} /> — le placeholder image="auto:..." sera remplacé automatiquement par l'image Amazon (ne mets PAS d'URL d'image manuelle)
   - 3-5 lignes de prose qui présentent le produit avec verdict
5. ## Tableau comparatif — <ComparisonTable products={[{name: "Marque Modèle", image: "auto:Marque Modèle", score: 8.5, criteria: {performance: 9, ergonomie: 8, rapportQualitePrix: 8}}, ...]} criteria={["performance", "ergonomie", "rapportQualitePrix"]} criteriaLabels={{performance: "Performance", ergonomie: "Ergonomie", rapportQualitePrix: "Rapport qualité-prix"}} />
   IMPORTANT : chaque produit dans la table DOIT avoir un \`image: "auto:Marque Modèle"\` avec EXACTEMENT la même string que celle utilisée dans la <ProductCard> correspondante. Le pipeline remplace ces placeholders par les chemins locaux après génération.
6. ## FAQ — 3-5 questions/réponses
7. ## Notre verdict — recommandation finale claire ("Notre choix" / "Meilleur rapport qualité-prix" / "Le moins cher") avec un dernier <AffiliateButton product="..." />`
    : `INTENT = TEST (un seul produit). Structure REQUISE:
1. H1 (souvent "[Produit] : notre test et avis")
2. Introduction (3-4 phrases) — public cible, prix indicatif, verdict en une phrase
3. <ProductCard name="Marque Modèle" image="auto:Marque Modèle" score={X.X} pros={[...]} cons={[...]} /> juste après l'intro pour montrer le produit visuellement
4. ## Caractéristiques techniques — bullet list factuelle
5. ## Notre test en détail — un H3 PAR CRITÈRE (4-6 critères : Performance, Ergonomie, Bruit/Autonomie, Qualité de fabrication, Rapport qualité-prix). Chaque H3 conclut par "**Note : X/10**".
6. ## Verdict — note finale /10 = MOYENNE PONDÉRÉE des notes intermédiaires (poids déclarés en frontmatter, somme = 1). Calcule-la précisément.
7. <AffiliateButton product="Marque Modèle" /> dans le verdict
8. ## Points forts / Points faibles — listes pros/cons
9. ## FAQ — 3 questions/réponses
10. ## Conclusion avec un dernier <AffiliateButton product="Marque Modèle" />
=> AU MINIMUM 3 occurrences de <AffiliateButton> dans la page.`;

  // Available hero images (already downloaded to /public/images/ for this site).
  // Pick the one that matches your topic; fall back to hero.jpg.
  const availableHeros = [
    '/images/hero.jpg',
    '/images/category-tondeuse.jpg',
    '/images/category-perceuse.jpg',
    '/images/category-nettoyeur.jpg',
    '/images/category-debroussailleuse.jpg',
  ];

  const frontmatterTemplate = intent === 'comparatif'
    ? `---
title: "[titre SEO ≤60 chars avec keyword]"
description: "[meta description 150-160 chars contenant keyword]"
keyword: "${keyword}"
intent: "comparatif"
publishedAt: "${today}"
updatedAt: "${today}"
heroImage: "[choisir parmi : ${availableHeros.join(', ')}]"
heroImageAlt: "[alt descriptif de l'image]"
products:
  - { name: "Marque Modèle 1", score: 8.5, program: "amazon", criteria: { performance: 9, ergonomie: 8, rapportQualitePrix: 8 } }
  - { name: "Marque Modèle 2", score: 8.0, program: "amazon", criteria: { performance: 8, ergonomie: 8, rapportQualitePrix: 9 } }
  # ... etc, 4-6 produits
sources:
  - { name: "...", url: "...", domain: "...", scrapedAt: "..." }
  # toutes les sources fournies plus bas
affiliateLinks: []
groundingScore: "${scrapedSources.length}/${scrapedSources.length}"
draft: false
---`
    : `---
title: "[titre SEO ≤60 chars avec keyword]"
description: "[meta description 150-160 chars contenant keyword]"
keyword: "${keyword}"
intent: "avis"
publishedAt: "${today}"
updatedAt: "${today}"
heroImage: "[choisir parmi : ${availableHeros.join(', ')}]"
heroImageAlt: "[alt descriptif]"
product:
  name: "Marque Modèle"
  developer: "Marque"
subscores:
  performance: 8
  ergonomie: 7
  qualiteFabrication: 8
  rapportQualitePrix: 7
weights:
  performance: 0.35
  ergonomie: 0.25
  qualiteFabrication: 0.15
  rapportQualitePrix: 0.25
finalScore: [moyenne pondérée de subscores avec weights — calcule-la précisément]
pros: ["...", "...", "..."]
cons: ["...", "..."]
sources:
  - { name: "...", url: "...", domain: "...", scrapedAt: "..." }
affiliateLinks: []
groundingScore: "${scrapedSources.length}/${scrapedSources.length}"
draft: false
---`;

  return `Tu rédiges un article pour ${siteConfig.name} (${siteConfig.domain}), niche ${siteConfig.niche}.

==========================================
LIGNE ÉDITORIALE — TRÈS IMPORTANT
==========================================
TU ES L'AUTEUR. C'EST L'AVIS DU SITE. Pas une compilation de citations.

✅ FAIS :
- "Notre verdict : c'est le meilleur choix pour les jardins de moins de 800m²."
- "L'autonomie de 90 minutes suffit largement pour la plupart des terrains."
- "À ce prix, on attend mieux niveau finitions."
- Première personne du pluriel ("nous avons retenu", "notre choix", "à notre sens")
- Style Les Numériques : expert, tranché, factuel, phrases courtes
- Vocabulaire technique précis, pas de marketing ("révolutionnaire", "incroyable" → JAMAIS)

❌ NE FAIS PAS :
- "Selon Que Choisir, le X est performant" → trop de citations alourdissent
- "D'après Les Numériques, ce modèle..." → idem
- "Maniaques.fr précise que..." → idem
- → NE CITE PAS les sites sources dans le corps de l'article. Ils apparaissent automatiquement en bas via <SourceList />, c'est suffisant pour la transparence.

EXCEPTION RARE : tu peux nommer une source UNIQUEMENT si deux sources se contredisent franchement et qu'il faut signaler la divergence ("Que Choisir lui attribue 4/5 contre 3/5 chez Les Numériques sur la longévité de la batterie."). C'est le seul cas.

==========================================
PRIX — NE PAS INVENTER
==========================================
N'écris AUCUN prix dans le corps de l'article. Le pipeline injecte
automatiquement le prix Amazon en temps réel sur les <ProductCard> et dans
le tableau comparatif via l'attribut \`price="..."\`. Ces prix sont vérifiés
au moment du build, ceux que tu pourrais écrire seraient déjà périmés.
Si tu veux discuter du positionnement tarifaire, parle de gammes ("entrée
de gamme", "milieu de gamme", "premium") ou d'écarts relatifs ("environ
deux fois plus cher que X"), jamais de prix absolus en euros.

==========================================
RÈGLE GROUNDING — INTANGIBLE
==========================================
Toutes les infos factuelles (prix, specs, performances, classements, noms de modèles) doivent venir des ${scrapedSources.length} sources fournies plus bas. Ne JAMAIS inventer un chiffre. Si une info manque, évite la mention sans le dire au lecteur — choisis simplement les produits + critères que tes sources te permettent de défendre solidement.

==========================================
KEYWORD CIBLE
==========================================
"${keyword}"

==========================================
STRUCTURE
==========================================
${intentBrief}

==========================================
COMPOSANTS ASTRO À UTILISER
==========================================
- <AffiliateButton product="Marque Modèle">Texte du bouton</AffiliateButton>
   → href est construit AUTOMATIQUEMENT vers Amazon avec le tag d'affiliation. NE JAMAIS passer href.
   → product="..." doit être le nom EXACT du produit ; ce nom sert pour la recherche Amazon.
   → NE JAMAIS passer asin="..." — l'ASIN est injecté automatiquement par le pipeline (recherche Amazon du \`product\`). Inventer un ASIN crée des liens cassés.

- <ProductCard
     name="Marque Modèle"
     image="auto:Marque Modèle"
     score={8.5}
     description="Phrase courte qui présente le produit"
     pros={["point fort 1", "point fort 2"]}
     cons={["point faible 1"]}
   />
   → image="auto:..." est OBLIGATOIRE. Le contenu après "auto:" sert de query Amazon. Le pipeline remplace par un chemin local après génération. NE JAMAIS mettre une URL externe ni omettre l'attribut.
   → ProductCard intègre déjà son propre <AffiliateButton>, pas besoin d'en ajouter un autre juste après.
   → NE JAMAIS passer asin="..." — l'ASIN est récupéré et injecté automatiquement (même requête Amazon que pour l'image).

- <ComparisonTable products={[{name, score, criteria: {perf:8, ergo:9}}, ...]} criteria={["perf", "ergo"]} criteriaLabels={{perf: "Performance", ergo: "Ergonomie"}} />

- <SourceList /> — NE PAS l'écrire toi-même, le layout l'ajoute automatiquement.

==========================================
LONGUEUR
==========================================
1200-2000 mots de corps (hors frontmatter, hors composants).

==========================================
FRONTMATTER YAML
==========================================
${frontmatterTemplate}

==========================================
SOURCES VÉRIFIÉES (${scrapedSources.length} disponibles)
==========================================
${sourcesBlock}

==========================================
TÂCHE
==========================================
Écris l'article COMPLET (frontmatter + corps Markdown + composants Astro inline) et SAUVE-LE avec l'outil Write au chemin EXACT :
${outputPath}

Slug fixé : "${articleSlug}". Ne le modifie pas.
Si les sources sont insuffisantes, écris UNIQUEMENT le mot ERROR_INSUFFICIENT_SOURCES sans rien d'autre et n'utilise PAS Write.`;
}

async function generateOne(siteConfig) {
  const queue = readQueue();
  const niche = siteConfig.niche;
  const next = pickNextPending(queue, niche);

  if (!next) {
    console.log(`ℹ️  ${niche}: no pending keyword (queue empty or all errored). Run dataforseo-keywords or content-updater.`);
    return null;
  }

  console.log(`\n✍️  ${niche}: "${next.keyword}" (vol=${next.volume}, kd=${next.kd}, score=${next.score}, intent=${next.intent})`);

  // Reserve the slot to prevent parallel duplication.
  next.status = 'writing';
  writeQueue(queue);

  try {
    // 1. Scrape niche sources
    const sources = sourcesConfig[niche] || [];
    console.log(`  🔍 Scraping ${sources.filter(s => s.scrape).length} sources…`);
    const { sources: scraped, failed, enough } = await scrapeSourcesForKeyword(sources, next.keyword, { minSuccess: MIN_SOURCES });
    console.log(`  📥 ${scraped.length} sources collected (${failed.length} failed)`);

    if (!enough) {
      throw new Error(`only ${scraped.length} sources collected, need ${MIN_SOURCES} minimum (anti-plagiarism)`);
    }

    // 2. Compute slug + output path. Articles are written as .mdx so they can
    // embed Astro components (<ProductCard />, <ComparisonTable />, ...).
    const articleSlug = slug.slug(next.keyword);
    const outputDir = resolve(SITES_DIR, niche, 'src/content/articles');
    mkdirSync(outputDir, { recursive: true });
    const outputPath = join(outputDir, `${articleSlug}.mdx`);

    if (existsSync(outputPath)) {
      throw new Error(`output already exists: ${outputPath}`);
    }

    // 3. Build prompt and invoke Claude Code CLI
    const prompt = buildPrompt({
      keyword: next.keyword,
      intent: next.intent,
      scrapedSources: scraped,
      siteConfig,
      articleSlug,
      outputPath,
    });

    console.log(`  🤖 Invoking Claude Code CLI…`);
    const oauthToken = requireEnv('CLAUDE_CODE_OAUTH_TOKEN');
    const result = spawnSync('claude', ['-p', '--dangerously-skip-permissions', prompt], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken },
      cwd: REPO_ROOT,
    });

    if (result.status !== 0) {
      throw new Error(`claude CLI exited with status ${result.status}`);
    }

    // 5. Verify output
    if (!existsSync(outputPath)) {
      throw new Error(`Claude finished but did not write ${outputPath} (possible ERROR_INSUFFICIENT_SOURCES)`);
    }
    const written = readFileSync(outputPath, 'utf-8');
    if (written.includes('ERROR_INSUFFICIENT_SOURCES')) {
      throw new Error('Claude reported ERROR_INSUFFICIENT_SOURCES in the article body');
    }
    if (!written.startsWith('---')) {
      throw new Error('Generated file is missing YAML frontmatter');
    }

    // 5b. Post-pass: fetch images + ASINs from Amazon and inject them.
    //   - `image="auto:..."` placeholders get replaced with local /images paths.
    //   - <AffiliateButton>, <ProductCard>, <ComparisonTable> entries get the
    //     ASIN injected so links go to amazon.fr/dp/<asin> instead of search.
    const productNames = new Set();
    for (const m of written.matchAll(/\bimage\s*[:=]\s*(["'])auto:([^"']+)\1/g)) productNames.add(m[2].trim());
    for (const m of written.matchAll(/<AffiliateButton\b[\s\S]*?\bproduct\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());
    for (const m of written.matchAll(/<ProductCard\b[\s\S]*?\bname\s*=\s*(["'])([^"']+)\1/g)) productNames.add(m[2].trim());

    if (productNames.size > 0) {
      const productList = [...productNames];
      console.log(`  🛒 Fetching ${productList.length} product images + ASINs + prices from Amazon…`);
      const { imageMap, asinMap, priceMap } = await fetchProductImages({ niche, articleSlug, products: productList });
      let updated = injectImagePaths(written, imageMap);
      updated = injectAffiliateAsins(updated, asinMap);
      updated = injectPrices(updated, priceMap);
      writeFileSync(outputPath, updated);
      const imgs = Object.values(imageMap).filter(Boolean).length;
      const asins = Object.values(asinMap).filter(Boolean).length;
      const prices = Object.values(priceMap).filter(Boolean).length;
      console.log(`  🖼  ${imgs}/${productList.length} images · 🔗 ${asins}/${productList.length} ASINs · 💶 ${prices}/${productList.length} prices`);
    }

    // 6. Promote in queue + register published URL
    const subdir = next.intent === 'comparatif' ? 'comparatifs' : next.intent === 'avis' ? 'avis' : 'guides';
    const publishedUrl = `https://${siteConfig.domain}/${subdir}/${articleSlug}/`;

    const fresh = readQueue();
    const idx = fresh[niche].findIndex(k => k.keyword === next.keyword);
    if (idx !== -1) {
      fresh[niche][idx].status = 'published';
      fresh[niche][idx].publishedUrl = publishedUrl;
      fresh[niche][idx].publishedAt = new Date().toISOString();
      writeQueue(fresh);
    }

    appendPublished({
      url: publishedUrl,
      site: niche,
      keyword: next.keyword,
      publishedAt: new Date().toISOString(),
      indexationStatus: 'pending',
    });

    console.log(`  ✅ Published: ${publishedUrl}`);
    return publishedUrl;
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    const fresh = readQueue();
    const idx = (fresh[niche] || []).findIndex(k => k.keyword === next.keyword);
    if (idx !== -1) {
      fresh[niche][idx].status = 'pending';
      fresh[niche][idx].errorCount = (fresh[niche][idx].errorCount || 0) + 1;
      fresh[niche][idx].lastError = err.message;
      writeQueue(fresh);
    }
    return null;
  }
}

async function run(targets) {
  for (const niche of targets) {
    const siteConfig = await loadSiteConfig(niche);
    let written = 0;
    for (let i = 0; i < MAX_ARTICLES_PER_RUN; i++) {
      const url = await generateOne(siteConfig);
      if (url) written++;
      else break;
    }
    console.log(`\n📊 ${niche}: ${written}/${MAX_ARTICLES_PER_RUN} articles generated`);
  }
}

const args = parseArgs(process.argv.slice(2));
const targets = resolveSiteArg(args.site);
run(targets).catch(err => {
  console.error(err);
  process.exit(1);
});
