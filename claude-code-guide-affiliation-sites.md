# Guide Claude Code — Architecture Sites Guide d'Achat Affiliation

> **Document de référence pour Claude Code**
> Objectif : construire 4 sites guides d'achat SEO automatisés avec pipeline DataForSEO → GitHub Actions → Astro → Affiliation Amazon/Awin

---

## 0. Vue d'ensemble du projet

### 4 sites à créer

| Site | Niche | Domaine cible | Thème Astro |
|------|-------|---------------|-------------|
| **JardinGuide** | Jardin & Bricolage | `jardinguide.fr` | Polyglow (commun) |
| **SportMachine** | Sport & Fitness | `sportmachine.fr` | Polyglow (commun) |
| **CuisineExpert** | Cuisine & Électroménager cuisine | `cuisineexpert.fr` | Polyglow (commun) |
| **GuideElectromenager** | Maison & Électroménager | `guideelectromenager.fr` | Polyglow (commun) |

> **Note domaines** : vérifier la disponibilité sur OVH (https://www.ovhcloud.com/fr/domains/domain-name-checker/) avant enregistrement. Tarif indicatif .fr : 5,59 €/an chez OVH. Alternatives si pris : `.com`, `-guide.fr`, `le-[niche].fr`.

### Principe ABSOLUMENT non négociable — Grounding des informations

**Toutes les informations publiées (specs produits, prix, avis, classements) DOIVENT provenir de sources vérifiées.**
- Aucune information inventée ou hallucination tolérée
- Claude Code doit systématiquement scraper les sources de référence listées ci-dessous AVANT de rédiger
- Chaque article doit inclure en commentaire YAML frontmatter la liste des URLs sources utilisées
- Si une information n'est pas trouvée dans les sources, elle ne doit PAS être écrite


> **Domaines vérifiés et confirmés libres** via AFNIC RDAP le 07/05/2026 :
> - `jardinguide.fr` — Jardin & Bricolage
> - `sportmachine.fr` — Sport & Fitness  
> - `cuisineexpert.fr` — Cuisine
> - `guideelectromenager.fr` — Maison & Électroménager
> 
> Alternatives libres en backup : `guideoutils.fr`, `leguidefit.fr`, `cuisinecomparatif.fr`, `guideelectro.fr`, `maison-elec.fr`


---

## 0b. Thème Polyglow — Configuration et images

### Installation (identique pour les 4 sites)

```bash
# Dans chaque dossier sites/[nom-site]/
npm create astro@latest -- --template realriplab/Polyglow
# ou
git clone https://github.com/realriplab/Polyglow.git sites/[nom-site]
cd sites/[nom-site] && npm install
```

### Caractéristiques de Polyglow utiles pour ce projet

- **Collections typées** pour `posts`, `pages`, `authors` — compatible avec le frontmatter généré par `article-generator.js`
- **SEO intégré** : Canonical URLs, Open Graph, Twitter Cards, JSON-LD — zéro config supplémentaire
- **i18n** : prévu pour le français (`fr` locale)
- **`lastModified` automatique** depuis l'historique Git — parfait pour les articles mis à jour par GitHub Actions
- **RSS intégré** — génération automatique du flux pour chaque site
- **Pagination, catégories, tags** — à utiliser pour organiser par type de produit

### Différenciation visuelle entre les 4 sites

Polyglow est commun mais chaque site DOIT avoir une identité visuelle distincte via les tokens CSS. Claude Code doit modifier `src/styles/theme.css` (ou équivalent) pour chaque site :

```css
/* sites/jardin-bricolage/src/styles/custom.css */
:root {
  --color-primary: #2d6a4f;      /* Vert foncé — jardin */
  --color-accent:  #74c69d;      /* Vert menthe */
  --color-hero-bg: #f0f7f4;      /* Fond très légèrement vert */
}

/* sites/sport-fitness/src/styles/custom.css */
:root {
  --color-primary: #e63946;      /* Rouge dynamique — sport */
  --color-accent:  #f4a261;      /* Orange énergie */
  --color-hero-bg: #fff5f5;
}

/* sites/cuisine/src/styles/custom.css */
:root {
  --color-primary: #c77dff;      /* Violet chaleureux — cuisine */
  --color-accent:  #e9c46a;      /* Jaune doré */
  --color-hero-bg: #fdf6ec;
}

/* sites/maison-elec/src/styles/custom.css */
:root {
  --color-primary: #0077b6;      /* Bleu électrique — électroménager */
  --color-accent:  #00b4d8;      /* Cyan */
  --color-hero-bg: #f0f8ff;
}
```

### Images libres de droits — Sources et stratégie

**RÈGLE** : toutes les images doivent être libres de droits commerciaux, sans attribution obligatoire. Claude Code doit piocher dans ces sources pour illustrer les **pages piliers** (homepage hero, pages catégories, en-têtes d'articles).

#### Sources d'images libres de droits (licence CC0 ou Unsplash/Pexels)

```javascript
// packages/config/images.config.js
export const IMAGE_SOURCES = {
  // CC0 — aucune attribution requise, usage commercial OK
  unsplash: {
    baseUrl: "https://api.unsplash.com/search/photos",
    apiKey: process.env.UNSPLASH_ACCESS_KEY,  // Gratuit : 50 req/h
    license: "CC0-equivalent (Unsplash License)",
    commercial: true,
  },
  pexels: {
    baseUrl: "https://api.pexels.com/v1/search",
    apiKey: process.env.PEXELS_API_KEY,       // Gratuit, sans limite raisonnable
    license: "Pexels License (commercial OK)",
    commercial: true,
  },
  pixabay: {
    baseUrl: "https://pixabay.com/api/",
    apiKey: process.env.PIXABAY_API_KEY,      // Gratuit
    license: "Pixabay License (commercial OK, no attribution)",
    commercial: true,
  },
};

// Mapping niche → mots-clés de recherche d'images
export const IMAGE_QUERIES = {
  "jardin-bricolage": {
    hero: ["garden tools", "bricolage tools", "green garden"],
    categories: {
      "tondeuse": ["lawn mower garden", "grass cutting"],
      "perceuse": ["drill tools workshop", "power tools"],
      "nettoyeur": ["pressure washer cleaning", "garden cleaning"],
    }
  },
  "sport-fitness": {
    hero: ["fitness workout", "sport equipment gym", "running training"],
    categories: {
      "velo-elliptique": ["elliptical bike fitness", "cardio gym"],
      "tapis-course": ["treadmill running gym"],
      "trottinette": ["electric scooter urban", "scooter city"],
    }
  },
  "cuisine": {
    hero: ["kitchen cooking appliances", "modern kitchen", "cooking food"],
    categories: {
      "air-fryer": ["air fryer cooking", "fryer kitchen"],
      "robot-cuisine": ["kitchen robot food processor", "cooking machine"],
      "cafetiere": ["coffee machine espresso", "coffee kitchen"],
    }
  },
  "maison-elec": {
    hero: ["home appliances modern", "smart home electronics", "vacuum cleaner home"],
    categories: {
      "aspirateur": ["vacuum cleaner robot home", "cleaning robot"],
      "radio-reveil": ["alarm clock bedroom", "digital clock"],
      "purificateur": ["air purifier home", "clean air home"],
    }
  },
};
```

#### Script d'import d'images pour les pages piliers

```javascript
// packages/scripts/fetch-pillar-images.js
/**
 * Télécharge et optimise les images pour les pages piliers de chaque site
 * Usage: node fetch-pillar-images.js --site jardin-bricolage
 */
import fetch from 'node-fetch';
import { createWriteStream, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { IMAGE_SOURCES, IMAGE_QUERIES } from '../config/images.config.js';

async function fetchImagesForSite(niche) {
  const queries = IMAGE_QUERIES[niche];
  if (!queries) throw new Error(`Niche inconnue: ${niche}`);

  const outputDir = resolve(`./sites/${niche}/public/images`);
  mkdirSync(outputDir, { recursive: true });

  // Image hero
  await downloadImage(
    await searchPexels(queries.hero[0]),
    join(outputDir, 'hero.jpg')
  );

  // Images par catégorie
  for (const [category, searchTerms] of Object.entries(queries.categories)) {
    const imageUrl = await searchPexels(searchTerms[0]);
    await downloadImage(imageUrl, join(outputDir, `category-${category}.jpg`));
  }

  console.log(`✅ Images téléchargées pour ${niche}`);
}

async function searchPexels(query) {
  const response = await fetch(
    `${IMAGE_SOURCES.pexels.baseUrl}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
    { headers: { Authorization: IMAGE_SOURCES.pexels.apiKey } }
  );
  const data = await response.json();
  return data.photos?.[0]?.src?.large2x || data.photos?.[0]?.src?.large;
}

async function downloadImage(url, outputPath) {
  if (!url) return;
  const response = await fetch(url);
  const stream = createWriteStream(outputPath);
  response.body.pipe(stream);
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
```

### Variables d'environnement supplémentaires (images)

Ajouter à `.env` et aux GitHub Secrets :

```env
# APIs images libres de droits
UNSPLASH_ACCESS_KEY=...   # https://unsplash.com/developers (gratuit)
PEXELS_API_KEY=...        # https://www.pexels.com/api/ (gratuit)
PIXABAY_API_KEY=...       # https://pixabay.com/api/docs/ (gratuit)
```


## 1. Structure du monorepo

```
/
├── packages/
│   ├── scripts/                    # Scripts partagés (DataForSEO, GSC, affiliation)
│   │   ├── dataforseo-keywords.js  # Extraction keywords + scoring
│   │   ├── article-generator.js    # Appel Claude API pour rédaction grounded
│   │   ├── gsc-indexing.js         # Demandes d'indexation Google Search Console
│   │   ├── affiliate-links.js      # Résolution liens affiliés
│   │   └── content-updater.js      # Mise à jour articles existants
│   └── config/
│       ├── sources.config.js       # Sources fiables par niche (voir section 3)
│       └── affiliate.config.js     # Programmes d'affiliation + mapping produits
│
├── sites/
│   ├── jardin-bricolage/           # Site Jardin & Bricolage
│   ├── sport-fitness/              # Site Sport & Fitness
│   ├── cuisine/                    # Site Cuisine
│   └── maison-elec/                # Site Maison & Électroménager
│
├── .github/
│   └── workflows/
│       ├── daily-articles.yml      # Rédaction articles quotidienne
│       ├── update-articles.yml     # Mise à jour contenu existant
│       └── gsc-indexing.yml        # Demandes indexation GSC
│
└── data/
    ├── keywords-queue.json         # File d'articles à écrire (par site)
    ├── published-urls.json         # URLs publiées (pour suivi indexation)
    └── indexation-requests.json    # Historique demandes GSC
```

### Structure de chaque site (identique pour les 4)

```
sites/[nom-site]/
├── astro.config.mjs
├── package.json
├── src/
│   ├── pages/
│   │   ├── index.astro             # Accueil
│   │   ├── comparatifs/            # Pages comparatifs (générées)
│   │   ├── guides/                 # Guides d'achat (générés)
│   │   └── avis/                   # Avis produits (générés)
│   ├── content/
│   │   ├── articles/               # .md générés par GitHub Actions
│   │   └── config.ts               # Schéma Zod pour validation frontmatter
│   ├── components/
│   │   ├── AffiliateButton.astro   # Bouton CTA avec lien affilié
│   │   ├── ProductCard.astro       # Carte produit avec prix + lien
│   │   ├── ComparisonTable.astro   # Tableau comparatif
│   │   └── SourceList.astro        # Liste sources (transparence)
│   └── layouts/
│       └── ArticleLayout.astro
├── public/
└── content-queue/
    └── keywords.json               # Queue locale (symlink vers data/)
```

---

## 2. Configuration par site

### `sites/[nom-site]/site.config.js`

Chaque site a un fichier de config unique. Exemple pour Jardin & Bricolage :

```javascript
// sites/jardin-bricolage/site.config.js
export default {
  name: "JardinGuide",
  domain: "jardinguide.fr",
  niche: "jardin-bricolage",
  locale: "fr-FR",
  language: "French",
  location: "France",
  
  // DataForSEO — critères de sélection des keywords
  keywords: {
    minVolume: 1000,
    maxKD: 35,
    intents: ["informational", "commercial"],   // Type d'intention de recherche
    seedKeywords: [
      "meilleur robot tondeuse",
      "comparatif tondeuse gazon",
      "meilleur nettoyeur haute pression",
      "meilleure débroussailleuse",
      "comparatif perceuse visseuse",
      "meilleur scie sauteuse",
      "guide achat jardin",
      "comparatif outillage jardin",
    ]
  },

  // Thème Astro
  theme: {
    url: "https://github.com/realriplab/Polyglow",  // Thème commun aux 4 sites
    primaryColor: "#2d6a4f",         // Vert jardin
    accentColor: "#74c69d",
  },

  // Programmes affiliation (voir affiliate.config.js)
  affiliatePrograms: ["amazon", "awin-leroy-merlin", "awin-mr-bricolage", "awin-castorama"],

  // Sources fiables — voir section 3
  sourcesKey: "jardin-bricolage",
}
```

---

## 3. Sources fiables par niche

### PRINCIPE FONDAMENTAL
Claude Code doit scraper ces sources AVANT toute rédaction. Les informations extraites (specs, prix, avis, classements) sont les seules autorisées dans les articles. Si une information contradictoire existe entre sources, mentionner la divergence dans l'article.

### 3.1 — Jardin & Bricolage

```javascript
// packages/config/sources.config.js → section "jardin-bricolage"
sources: {
  "jardin-bricolage": [
    // Tests & comparatifs indépendants
    { name: "Que Choisir", url: "https://www.quechoisir.org", scrape: true, trust: "high" },
    { name: "Les Numériques", url: "https://www.lesnumeriques.com", scrape: true, trust: "high" },
    { name: "Maniaques.fr", url: "https://maniaques.fr", scrape: true, trust: "medium" },
    // Retailers avec fiches techniques officielles
    { name: "Leroy Merlin", url: "https://www.leroymerlin.fr", scrape: true, trust: "high", type: "specs" },
    { name: "Castorama", url: "https://www.castorama.fr", scrape: true, trust: "high", type: "specs" },
    { name: "Mr Bricolage", url: "https://www.mr-bricolage.fr", scrape: true, trust: "high", type: "specs" },
    { name: "Boulanger", url: "https://www.boulanger.com", scrape: true, trust: "high", type: "specs" },
    // Marques — specs officielles
    { name: "Bosch Pro", url: "https://www.bosch-professional.com/fr", scrape: false, type: "brand-specs" },
    { name: "Makita", url: "https://www.makita.fr", scrape: false, type: "brand-specs" },
    { name: "Husqvarna", url: "https://www.husqvarna.com/fr", scrape: false, type: "brand-specs" },
    { name: "Karcher", url: "https://www.kaercher.com/fr", scrape: false, type: "brand-specs" },
    // Prix Amazon (affiliation + référence prix)
    { name: "Amazon FR", url: "https://www.amazon.fr", scrape: true, trust: "high", type: "price+avis" },
  ]
}
```

### 3.2 — Sport & Fitness

```javascript
"sport-fitness": [
  // Tests & comparatifs indépendants
  { name: "Que Choisir", url: "https://www.quechoisir.org", scrape: true, trust: "high" },
  { name: "Les Numériques", url: "https://www.lesnumeriques.com/sport", scrape: true, trust: "high" },
  { name: "Sport Passion", url: "https://www.sport-passion.fr/test-materiel", scrape: true, trust: "high" },
  { name: "Running Heroes", url: "https://runningheroes.com/fr", scrape: true, trust: "medium" },
  // Retailers spécialisés
  { name: "Décathlon", url: "https://www.decathlon.fr", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Fitness Boutique", url: "https://www.fitnessboutique.fr", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Sport 2000", url: "https://www.sport2000.fr", scrape: true, trust: "high", type: "specs" },
  { name: "Go Sport", url: "https://www.go-sport.com", scrape: true, trust: "high", type: "specs" },
  { name: "Fitness Digital", url: "https://www.fitnessdigital.fr", scrape: true, trust: "medium", type: "specs+guide" },
  // Marques — specs officielles
  { name: "NordicTrack", url: "https://www.nordictrack.fr", scrape: false, type: "brand-specs" },
  { name: "Domyos (Décathlon)", url: "https://www.decathlon.fr/sport/cardio-fitness/c0-5067/", scrape: false, type: "brand-specs" },
  { name: "Garmin", url: "https://www.garmin.com/fr-FR", scrape: false, type: "brand-specs" },
  { name: "Polar", url: "https://www.polar.com/fr", scrape: false, type: "brand-specs" },
  // Prix et avis
  { name: "Amazon FR", url: "https://www.amazon.fr", scrape: true, trust: "high", type: "price+avis" },
]
```

### 3.3 — Cuisine & Électroménager Cuisine

```javascript
"cuisine": [
  // Tests & comparatifs indépendants
  { name: "Que Choisir", url: "https://www.quechoisir.org", scrape: true, trust: "high" },
  { name: "Les Numériques", url: "https://www.lesnumeriques.com/cuisine", scrape: true, trust: "high" },
  { name: "60 Millions de Consommateurs", url: "https://www.60millions-mag.com", scrape: true, trust: "high" },
  { name: "Cuisine Actuelle", url: "https://www.cuisineactuelle.fr", scrape: true, trust: "medium" },
  // Retailers avec fiches techniques complètes
  { name: "Darty", url: "https://www.darty.com", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Boulanger", url: "https://www.boulanger.com", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Fnac", url: "https://www.fnac.com", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Amazon FR", url: "https://www.amazon.fr", scrape: true, trust: "high", type: "price+avis" },
  // Marques — specs officielles
  { name: "Thermomix / Vorwerk", url: "https://www.vorwerk.com/fr-fr/produits/thermomix", scrape: false, type: "brand-specs" },
  { name: "Kenwood", url: "https://www.kenwoodworld.com/fr-fr", scrape: false, type: "brand-specs" },
  { name: "Tefal", url: "https://www.tefal.fr", scrape: false, type: "brand-specs" },
  { name: "Ninja Kitchen", url: "https://www.ninjakitchen.fr", scrape: false, type: "brand-specs" },
  { name: "Instant Pot", url: "https://www.instantpot.fr", scrape: false, type: "brand-specs" },
]
```

### 3.4 — Maison & Électroménager

```javascript
"maison-elec": [
  // Tests & comparatifs indépendants — les plus fiables en France
  { name: "Que Choisir", url: "https://www.quechoisir.org", scrape: true, trust: "high" },
  { name: "Les Numériques", url: "https://www.lesnumeriques.com", scrape: true, trust: "high" },
  { name: "60 Millions de Consommateurs", url: "https://www.60millions-mag.com", scrape: true, trust: "high" },
  { name: "LaboMaison", url: "https://labomaison.com/comparatifs", scrape: true, trust: "medium" },
  { name: "Electroguide", url: "https://www.electroguide.com", scrape: true, trust: "medium" },
  // Retailers avec fiches techniques complètes
  { name: "Darty", url: "https://www.darty.com", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Boulanger", url: "https://www.boulanger.com", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Fnac", url: "https://www.fnac.com", scrape: true, trust: "high", type: "specs+avis" },
  { name: "Amazon FR", url: "https://www.amazon.fr", scrape: true, trust: "high", type: "price+avis" },
  // Marques — specs officielles
  { name: "Dyson", url: "https://www.dyson.fr", scrape: false, type: "brand-specs" },
  { name: "Philips", url: "https://www.philips.fr", scrape: false, type: "brand-specs" },
  { name: "Rowenta", url: "https://www.rowenta.fr", scrape: false, type: "brand-specs" },
  { name: "iRobot", url: "https://www.irobot.fr", scrape: false, type: "brand-specs" },
]
```

---

## 4. Script DataForSEO — Génération de la queue d'articles

### `packages/scripts/dataforseo-keywords.js`

```javascript
#!/usr/bin/env node
/**
 * dataforseo-keywords.js
 * Interroge DataForSEO pour trouver les meilleures opportunités de keywords
 * et alimente data/keywords-queue.json
 * 
 * Usage: node dataforseo-keywords.js --site jardin-bricolage
 *        node dataforseo-keywords.js --site all
 */

import { config } from 'dotenv';
import fetch from 'node-fetch';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
config();

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;
const BASE_URL = 'https://api.dataforseo.com/v3';

async function callDataForSEO(endpoint, payload) {
  const credentials = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function getKeywordsForSite(siteConfig) {
  const { niche, keywords: kwConfig } = siteConfig;
  console.log(`\n📊 Analyse keywords pour: ${niche}`);

  const payload = kwConfig.seedKeywords.map(keyword => ({
    keyword,
    location_name: 'France',
    language_name: 'French',
    limit: 30,
    filters: [
      ['keyword_data.keyword_info.search_volume', '>', kwConfig.minVolume],
      'and',
      ['keyword_data.keyword_properties.keyword_difficulty', '<', kwConfig.maxKD],
    ],
    order_by: ['keyword_data.keyword_info.search_volume,desc'],
  }));

  const data = await callDataForSEO(
    '/dataforseo_labs/google/keyword_suggestions/live',
    payload
  );

  if (data.status_code !== 20000) {
    console.error('Erreur DataForSEO:', data.status_message);
    return [];
  }

  const results = [];
  const seen = new Set();

  for (const task of data.tasks || []) {
    if (task.status_code !== 20000) continue;
    for (const result of task.result || []) {
      for (const item of result.items || []) {
        const kw = item.keyword_data?.keyword;
        const volume = item.keyword_data?.keyword_info?.search_volume;
        const kd = item.keyword_data?.keyword_properties?.keyword_difficulty;
        const cpc = item.keyword_data?.keyword_info?.cpc;

        if (!kw || seen.has(kw)) continue;
        seen.add(kw);

        // Score priorité = volume / (KD + 1) * log(cpc + 1)
        const score = (volume / (kd + 1)) * Math.log(cpc + 1);

        results.push({
          keyword: kw,
          volume,
          kd,
          cpc,
          score: Math.round(score),
          intent: detectIntent(kw),
          status: 'pending',        // pending | writing | published | updating
          site: niche,
          createdAt: new Date().toISOString(),
          publishedUrl: null,
          lastUpdated: null,
        });
      }
    }
  }

  // Trier par score décroissant
  results.sort((a, b) => b.score - a.score);
  console.log(`  ✅ ${results.length} keywords trouvés`);
  return results;
}

function detectIntent(keyword) {
  const comparatifPatterns = ['meilleur', 'comparatif', 'top ', 'classement', 'versus', ' vs '];
  const guidePatterns = ['comment', 'guide', 'choisir', 'quelle', 'quel'];
  const avisPatterns = ['avis', 'test ', 'review', 'opinion'];
  
  const kw = keyword.toLowerCase();
  if (comparatifPatterns.some(p => kw.includes(p))) return 'comparatif';
  if (guidePatterns.some(p => kw.includes(p))) return 'guide';
  if (avisPatterns.some(p => kw.includes(p))) return 'avis';
  return 'informational';
}

async function updateQueue(siteName = 'all') {
  // Charger la config du/des site(s)
  const siteConfigs = await loadSiteConfigs(siteName);
  
  // Charger la queue existante
  const queuePath = resolve('./data/keywords-queue.json');
  let queue = {};
  try {
    queue = JSON.parse(readFileSync(queuePath, 'utf-8'));
  } catch {
    queue = {};
  }

  for (const siteConfig of siteConfigs) {
    const newKeywords = await getKeywordsForSite(siteConfig);
    
    if (!queue[siteConfig.niche]) queue[siteConfig.niche] = [];
    
    // Ajouter uniquement les nouveaux keywords (pas déjà dans la queue)
    const existingKws = new Set(queue[siteConfig.niche].map(k => k.keyword));
    const toAdd = newKeywords.filter(k => !existingKws.has(k.keyword));
    
    queue[siteConfig.niche].push(...toAdd);
    console.log(`  ➕ ${toAdd.length} nouveaux keywords ajoutés à la queue ${siteConfig.niche}`);
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  console.log('\n✅ Queue mise à jour:', queuePath);
}

async function loadSiteConfigs(siteName) {
  // Importe les configs des sites concernés
  const allNiches = ['jardin-bricolage', 'sport-fitness', 'cuisine', 'maison-elec'];
  const niches = siteName === 'all' ? allNiches : [siteName];
  
  const configs = [];
  for (const niche of niches) {
    const { default: siteConfig } = await import(`../../sites/${niche}/site.config.js`);
    configs.push(siteConfig);
  }
  return configs;
}

// Point d'entrée
const args = process.argv.slice(2);
const siteArg = args[args.indexOf('--site') + 1] || 'all';
updateQueue(siteArg).catch(console.error);
```

---

## 5. Script de rédaction grounded — `article-generator.js`

```javascript
/**
 * article-generator.js
 * PRINCIPE FONDAMENTAL : chaque information publiée doit être vérifiée
 * dans les sources de référence avant d'être écrite.
 * 
 * Flux :
 * 1. Récupérer le prochain keyword "pending" dans la queue
 * 2. Scraper les sources de référence pour ce keyword
 * 3. Extraire les informations factuelles vérifiées
 * 4. Envoyer à Claude API avec les données scrapées (pas d'invention autorisée)
 * 5. Écrire le fichier .md dans le bon site
 * 6. Mettre à jour la queue (status: published)
 */

import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { slug } from 'github-slugger';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Nombre max d'articles à rédiger par exécution (GitHub Actions)
const MAX_ARTICLES_PER_RUN = parseInt(process.env.MAX_ARTICLES_PER_RUN || '2');

async function scrapeSource(url, keyword) {
  try {
    console.log(`    🔍 Scraping: ${url}`);
    // Chercher la page de résultats de recherche interne ou la page comparatif
    const searchUrl = buildSearchUrl(url, keyword);
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuideBot/1.0)' },
      timeout: 10000,
    });
    if (!response.ok) return null;
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extraire le texte principal (articles, tableaux, specs)
    // Supprimer nav, footer, pubs
    $('nav, footer, aside, script, style, .ad, .pub, .cookie').remove();
    const text = $('main, article, .content, body').first().text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000); // Limite à 3000 chars par source
    
    return {
      url: searchUrl,
      domain: new URL(url).hostname,
      content: text,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`    ⚠️ Échec scraping ${url}: ${err.message}`);
    return null;
  }
}

function buildSearchUrl(baseUrl, keyword) {
  // Construire l'URL de recherche selon le site
  const urlMap = {
    'www.quechoisir.org': `https://www.quechoisir.org/recherche/?query=${encodeURIComponent(keyword)}`,
    'www.lesnumeriques.com': `https://www.lesnumeriques.com/recherche.html?q=${encodeURIComponent(keyword)}`,
    'www.darty.com': `https://www.darty.com/nav/recherche/search?text=${encodeURIComponent(keyword)}`,
    'www.amazon.fr': `https://www.amazon.fr/s?k=${encodeURIComponent(keyword)}`,
    'www.boulanger.com': `https://www.boulanger.com/recherche/result?text=${encodeURIComponent(keyword)}`,
    // Ajouter les autres sites...
  };
  const hostname = new URL(baseUrl).hostname;
  return urlMap[hostname] || `${baseUrl}/recherche?q=${encodeURIComponent(keyword)}`;
}

async function generateGroundedArticle(keyword, intent, sources, siteConfig, affiliateLinks) {
  const sourceTexts = sources
    .filter(Boolean)
    .map(s => `\n--- SOURCE: ${s.domain} (${s.url}) ---\n${s.content}`)
    .join('\n');

  const systemPrompt = `Tu es un rédacteur expert en guides d'achat pour le site ${siteConfig.name} (niche: ${siteConfig.niche}).

RÈGLE ABSOLUE ET NON NÉGOCIABLE :
- Tu NE dois JAMAIS inventer d'informations, de chiffres, de prix, de specs ou d'avis.
- TOUTES les informations dans ton article DOIVENT provenir des sources ci-dessous.
- Si une information n'est pas dans les sources, écris "données non disponibles" ou ne mentionne pas ce point.
- Si les sources se contredisent, mentionne la divergence : "Selon [source A] : X, selon [source B] : Y".
- Cite systématiquement tes sources dans l'article sous forme de liens ou de mentions.

OBJECTIF SEO :
- Keyword principal : "${keyword}"
- Intent : ${intent} (comparatif | guide | avis)
- Le keyword doit apparaître dans H1, 2-3 fois dans le texte, dans la meta description
- Structure : H1 > Introduction > (Tableau comparatif si comparatif) > Sections H2 > Conclusion

FORMAT DE SORTIE :
- Fichier Markdown avec frontmatter YAML complet
- Longueur : 1200-2000 mots
- Liens affiliés intégrés via le composant Astro <AffiliateButton>`;

  const userPrompt = `Rédige un article optimisé pour le keyword "${keyword}".

SOURCES VÉRIFIÉES (utilise UNIQUEMENT ces informations) :
${sourceTexts || "ATTENTION : Aucune source disponible. N'écris PAS cet article, retourne ERROR_NO_SOURCES."}

LIENS AFFILIÉS DISPONIBLES (à intégrer dans l'article) :
${JSON.stringify(affiliateLinks.slice(0, 5), null, 2)}

FORMAT FRONTMATTER REQUIS :
---
title: "[Titre SEO avec keyword]"
description: "[Meta description 150-160 chars avec keyword]"
keyword: "${keyword}"
intent: "${intent}"
publishedAt: "${new Date().toISOString()}"
updatedAt: "${new Date().toISOString()}"
sources:
  - url: "[URL source 1]"
    domain: "[domaine]"
    scrapedAt: "[date]"
  # ... toutes les sources utilisées
affiliateLinks:
  - product: "[nom produit]"
    url: "[lien affilié]"
groundingScore: "[nombre de sources utilisées]/[nombre de sources disponibles]"
---`;

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const content = response.content[0].text;
  
  // Vérifier que l'article n'a pas retourné une erreur de grounding
  if (content.includes('ERROR_NO_SOURCES')) {
    throw new Error(`Pas de sources disponibles pour: ${keyword}`);
  }
  
  return content;
}

async function processNextArticle(siteConfig) {
  const queuePath = resolve('./data/keywords-queue.json');
  const queue = JSON.parse(readFileSync(queuePath, 'utf-8'));
  const siteQueue = queue[siteConfig.niche] || [];
  
  // Trouver le prochain article pending avec le meilleur score
  const next = siteQueue
    .filter(k => k.status === 'pending')
    .sort((a, b) => b.score - a.score)[0];
    
  if (!next) {
    console.log(`ℹ️ Plus d'articles pending pour ${siteConfig.niche} — passage en mode mise à jour`);
    return null; // Déclenche le mode update dans content-updater.js
  }
  
  console.log(`\n✍️ Rédaction: "${next.keyword}" (vol: ${next.volume}, KD: ${next.kd})`);
  
  // 1. Marquer comme "writing" pour éviter les doublons
  next.status = 'writing';
  writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  
  try {
    // 2. Charger les sources de la niche
    const { default: sourcesConfig } = await import('../config/sources.config.js');
    const sources = sourcesConfig[siteConfig.niche];
    
    // 3. Scraper les sources (en parallèle, max 5)
    const scrapedSources = await Promise.all(
      sources
        .filter(s => s.scrape)
        .slice(0, 5)
        .map(s => scrapeSource(s.url, next.keyword))
    );
    
    // 4. Charger les liens affiliés pertinents
    const { default: affiliateConfig } = await import('../config/affiliate.config.js');
    const affiliateLinks = findAffiliateLinks(next.keyword, affiliateConfig, siteConfig);
    
    // 5. Générer l'article avec Claude
    const articleContent = await generateGroundedArticle(
      next.keyword,
      next.intent,
      scrapedSources,
      siteConfig,
      affiliateLinks
    );
    
    // 6. Sauvegarder le fichier
    const articleSlug = slug(next.keyword);
    const outputDir = resolve(`./sites/${siteConfig.niche}/src/content/articles`);
    mkdirSync(outputDir, { recursive: true });
    const outputPath = join(outputDir, `${articleSlug}.md`);
    writeFileSync(outputPath, articleContent);
    
    // 7. Mettre à jour la queue
    const publishedUrl = `https://${siteConfig.domain}/${next.intent}/${articleSlug}/`;
    next.status = 'published';
    next.publishedUrl = publishedUrl;
    next.publishedAt = new Date().toISOString();
    writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    
    // 8. Enregistrer l'URL pour indexation GSC
    const urlsPath = resolve('./data/published-urls.json');
    const urls = JSON.parse(readFileSync(urlsPath, 'utf-8').catch(() => '[]'));
    urls.push({
      url: publishedUrl,
      site: siteConfig.niche,
      keyword: next.keyword,
      publishedAt: new Date().toISOString(),
      indexationStatus: 'pending',
    });
    writeFileSync(urlsPath, JSON.stringify(urls, null, 2));
    
    console.log(`  ✅ Article publié: ${publishedUrl}`);
    return publishedUrl;
    
  } catch (err) {
    // En cas d'erreur, remettre en pending
    next.status = 'pending';
    next.errorCount = (next.errorCount || 0) + 1;
    writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    console.error(`  ❌ Erreur rédaction: ${err.message}`);
    return null;
  }
}

function findAffiliateLinks(keyword, affiliateConfig, siteConfig) {
  // Chercher les produits affiliés pertinents pour ce keyword
  // Basé sur le mapping keyword → ASIN/URL dans affiliate.config.js
  const keywordLower = keyword.toLowerCase();
  return Object.entries(affiliateConfig.products)
    .filter(([productName]) => keywordLower.includes(productName.toLowerCase()))
    .map(([productName, data]) => ({
      product: productName,
      url: buildAffiliateUrl(data, siteConfig.affiliatePrograms),
    }))
    .slice(0, 10);
}

// Point d'entrée
const siteArg = process.argv[process.argv.indexOf('--site') + 1];
// ...charger siteConfig et lancer le traitement
```

---

## 6. Configuration Affiliation — `affiliate.config.js`

```javascript
// packages/config/affiliate.config.js

export default {
  // IDs de tracking à configurer dans les variables d'environnement
  programs: {
    amazon: {
      trackingId: process.env.AMAZON_AFFILIATE_ID, // ex: "monsite-21"
      baseUrl: "https://www.amazon.fr/dp/",
      tagParam: "tag",
      commission: "3-5%",
      cookieDays: 1,
    },
    "awin-leroy-merlin": {
      advertiserId: process.env.AWIN_LEROY_MERLIN_ID,
      baseUrl: "https://www.awin1.com/cread.php",
      commission: "2-4%",
      cookieDays: 30,
    },
    "awin-boulanger": {
      advertiserId: process.env.AWIN_BOULANGER_ID,
      baseUrl: "https://www.awin1.com/cread.php",
      commission: "2-3%",
      cookieDays: 30,
    },
    "awin-decathlon": {
      advertiserId: process.env.AWIN_DECATHLON_ID,
      commission: "5%",
      cookieDays: 30,
    },
  },

  // Mapping produit → ASIN Amazon (à compléter au fur et à mesure)
  // Format: "terme de recherche" → { asin, program, fallbackUrl }
  products: {
    "robot tondeuse husqvarna": {
      asin: "B07XXXX", // ASIN Amazon France
      program: "amazon",
      fallbackUrl: "https://www.leroy-merlin.fr/recherche?q=robot+tondeuse+husqvarna",
    },
    "nettoyeur haute pression karcher": {
      asin: "B08XXXX",
      program: "amazon",
    },
    "vélo elliptique domyos": {
      asin: "B09XXXX",
      program: "awin-decathlon",
      fallbackUrl: "https://www.decathlon.fr/sport/cardio-fitness/velo-elliptique/",
    },
    "air fryer ninja": {
      asin: "B0AXXXX",
      program: "amazon",
    },
    // ... à compléter via script de discovery automatique
  },
};

export function buildAffiliateUrl(productData, availablePrograms) {
  const { program, asin, fallbackUrl } = productData;
  const programConfig = availablePrograms[program];
  if (!programConfig) return fallbackUrl;
  
  if (program === 'amazon' && asin) {
    const tag = process.env.AMAZON_AFFILIATE_ID;
    return `${programConfig.baseUrl}${asin}?tag=${tag}`;
  }
  // Awin
  return `${programConfig.baseUrl}?awinaffid=${process.env.AWIN_PUBLISHER_ID}&awinmid=${programConfig.advertiserId}&ued=${encodeURIComponent(fallbackUrl)}`;
}
```

---

## 7. GitHub Actions

### 7.1 — Rédaction quotidienne d'articles

**`.github/workflows/daily-articles.yml`**

```yaml
name: Daily Article Generation

on:
  schedule:
    - cron: '0 7 * * *'    # 7h UTC = 8h ou 9h heure française
  workflow_dispatch:        # Déclenchement manuel possible

jobs:
  generate-articles:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        site: [jardin-bricolage, sport-fitness, cuisine, maison-elec]
      max-parallel: 1       # Éviter les conflits sur keywords-queue.json
    
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_TOKEN }}
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Generate articles for ${{ matrix.site }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          DATAFORSEO_LOGIN: ${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: ${{ secrets.DATAFORSEO_PASSWORD }}
          AMAZON_AFFILIATE_ID: ${{ secrets.AMAZON_AFFILIATE_ID }}
          AWIN_PUBLISHER_ID: ${{ secrets.AWIN_PUBLISHER_ID }}
          AWIN_LEROY_MERLIN_ID: ${{ secrets.AWIN_LEROY_MERLIN_ID }}
          AWIN_BOULANGER_ID: ${{ secrets.AWIN_BOULANGER_ID }}
          AWIN_DECATHLON_ID: ${{ secrets.AWIN_DECATHLON_ID }}
          MAX_ARTICLES_PER_RUN: '2'
        run: |
          node packages/scripts/article-generator.js --site ${{ matrix.site }}
      
      - name: Build Astro site ${{ matrix.site }}
        run: |
          cd sites/${{ matrix.site }}
          npm run build
      
      - name: Deploy to hosting
        # Adapter selon ton hébergeur (OVH, Cloudflare Pages, Netlify...)
        run: |
          echo "Deploy ${{ matrix.site }} — configurer selon hébergeur"
      
      - name: Commit queue updates
        run: |
          git config --global user.name 'GitHub Actions'
          git config --global user.email 'actions@github.com'
          git add data/keywords-queue.json data/published-urls.json
          git diff --staged --quiet || git commit -m "chore: update keyword queue [${{ matrix.site }}] $(date +%Y-%m-%d)"
          git push
```

### 7.2 — Mise à jour du contenu existant

**`.github/workflows/update-articles.yml`**

```yaml
name: Content Refresh (when queue is empty)

on:
  schedule:
    - cron: '0 9 * * 1'    # Lundi matin — vérification hebdomadaire
  workflow_dispatch:

jobs:
  check-and-update:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        site: [jardin-bricolage, sport-fitness, cuisine, maison-elec]
    
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_TOKEN }}
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check queue and update if empty
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          DATAFORSEO_LOGIN: ${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: ${{ secrets.DATAFORSEO_PASSWORD }}
        run: |
          node packages/scripts/content-updater.js --site ${{ matrix.site }}
          # Ce script :
          # 1. Vérifie si queue vide → si oui, déclenche dataforseo-keywords.js pour la refill
          # 2. Si queue toujours vide après refill → passe en mode "update"
          # 3. Mode update : prend les articles publiés les plus anciens,
          #    re-scrape les sources, et met à jour avec Claude si changements détectés
      
      - name: Rebuild and deploy if changes
        run: |
          cd sites/${{ matrix.site }}
          git diff --quiet HEAD -- src/content/ || npm run build
      
      - name: Commit updates
        run: |
          git config --global user.name 'GitHub Actions'
          git config --global user.email 'actions@github.com'
          git add .
          git diff --staged --quiet || git commit -m "chore: content refresh [${{ matrix.site }}] $(date +%Y-%m-%d)"
          git push
```

### 7.3 — Indexation Google Search Console

**`.github/workflows/gsc-indexing.yml`**

```yaml
name: GSC Indexation Requests

on:
  schedule:
    - cron: '30 8 * * *'   # 8h30 UTC, après le build daily
  workflow_dispatch:

jobs:
  request-indexing:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Submit URLs to GSC
        env:
          GSC_SERVICE_ACCOUNT_KEY: ${{ secrets.GSC_SERVICE_ACCOUNT_KEY }}
        run: |
          node packages/scripts/gsc-indexing.js
```

### `packages/scripts/gsc-indexing.js`

```javascript
/**
 * gsc-indexing.js
 * Soumet les nouvelles URLs à l'API Google Search Console Indexing API
 * Lit data/published-urls.json, soumet celles avec indexationStatus: "pending"
 * 
 * Prérequis : 
 * - Service Account Google avec accès à la GSC Indexing API
 * - GSC_SERVICE_ACCOUNT_KEY en secret GitHub (JSON de la clé de service)
 */

import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const MAX_URLS_PER_RUN = 100; // Limite API GSC
const DAILY_QUOTA = 200;      // Quota journalier de l'Indexing API

async function submitUrlsToGSC() {
  // Authentification via Service Account
  const credentials = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/indexing'],
  });
  const indexing = google.indexing({ version: 'v3', auth });
  
  // Lire les URLs en attente
  const urlsPath = resolve('./data/published-urls.json');
  const urls = JSON.parse(readFileSync(urlsPath, 'utf-8'));
  
  // Lire le fichier de suivi des demandes
  const requestsPath = resolve('./data/indexation-requests.json');
  let requests = {};
  try {
    requests = JSON.parse(readFileSync(requestsPath, 'utf-8'));
  } catch { requests = {}; }
  
  // Calculer le nombre de requêtes envoyées aujourd'hui
  const today = new Date().toISOString().split('T')[0];
  const todayCount = requests[today]?.count || 0;
  const remaining = DAILY_QUOTA - todayCount;
  
  const pendingUrls = urls
    .filter(u => u.indexationStatus === 'pending')
    .slice(0, Math.min(MAX_URLS_PER_RUN, remaining));
  
  if (pendingUrls.length === 0) {
    console.log('ℹ️ Aucune URL en attente d\'indexation');
    return;
  }
  
  console.log(`📡 Soumission de ${pendingUrls.length} URLs à la GSC...`);
  let successCount = 0;
  
  for (const urlEntry of pendingUrls) {
    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url: urlEntry.url,
          type: 'URL_UPDATED',
        },
      });
      
      // Marquer comme soumis
      const idx = urls.findIndex(u => u.url === urlEntry.url);
      if (idx !== -1) {
        urls[idx].indexationStatus = 'submitted';
        urls[idx].submittedAt = new Date().toISOString();
      }
      
      successCount++;
      console.log(`  ✅ Soumis: ${urlEntry.url}`);
      
      // Respecter le rate limit (1 req/s)
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (err) {
      console.error(`  ❌ Erreur GSC pour ${urlEntry.url}: ${err.message}`);
    }
  }
  
  // Sauvegarder les mises à jour
  writeFileSync(urlsPath, JSON.stringify(urls, null, 2));
  
  // Mettre à jour le compteur quotidien
  if (!requests[today]) requests[today] = { count: 0, urls: [] };
  requests[today].count += successCount;
  requests[today].urls.push(...pendingUrls.map(u => u.url));
  writeFileSync(requestsPath, JSON.stringify(requests, null, 2));
  
  console.log(`\n✅ ${successCount}/${pendingUrls.length} URLs soumises à la GSC`);
  console.log(`📊 Quota utilisé aujourd'hui: ${todayCount + successCount}/${DAILY_QUOTA}`);
}

submitUrlsToGSC().catch(console.error);
```

---

## 8. Variables d'environnement requises

### Fichier `.env` local (ne jamais committer)

```env
# DataForSEO
DATAFORSEO_LOGIN=ton_login
DATAFORSEO_PASSWORD=ton_password

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Affiliation Amazon
AMAZON_AFFILIATE_ID=monsite-21    # Format: identifiant-21

# Affiliation Awin (s'inscrire sur awin.com)
AWIN_PUBLISHER_ID=xxxxxxx
AWIN_LEROY_MERLIN_ID=xxxxxxx
AWIN_BOULANGER_ID=xxxxxxx
AWIN_DECATHLON_ID=xxxxxxx
AWIN_FNAC_ID=xxxxxxx
AWIN_DARTY_ID=xxxxxxx

# Google Search Console (Indexing API)
# Valeur = JSON complet de la clé de service (sur une seule ligne ou multiline)
GSC_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}

# GitHub Token (pour les push depuis GitHub Actions)
GH_TOKEN=ghp_...
```

### GitHub Secrets à configurer (Settings → Secrets → Actions)

```
ANTHROPIC_API_KEY
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
AMAZON_AFFILIATE_ID
AWIN_PUBLISHER_ID
AWIN_LEROY_MERLIN_ID
AWIN_BOULANGER_ID
AWIN_DECATHLON_ID
AWIN_FNAC_ID
AWIN_DARTY_ID
GSC_SERVICE_ACCOUNT_KEY
GH_TOKEN
```

---

## 9. Checklist de démarrage pour Claude Code

### Phase 1 — Infrastructure (à faire en premier)
- [ ] Initialiser le monorepo avec `npm init -w packages/scripts -w sites/jardin-bricolage ...`
- [ ] Créer le squelette de tous les fichiers listés dans la section 1
- [ ] Configurer `data/keywords-queue.json` avec la structure `{ "jardin-bricolage": [], ... }`
- [ ] Configurer `data/published-urls.json` avec `[]`
- [ ] Configurer `data/indexation-requests.json` avec `{}`

### Phase 2 — Un site pilote (jardin-bricolage)
- [ ] Installer Polyglow : `git clone https://github.com/realriplab/Polyglow.git` ou `npm create astro@latest -- --template realriplab/Polyglow`
- [ ] Créer `site.config.js` pour jardin-bricolage
- [ ] Créer `packages/config/sources.config.js` avec la section jardin-bricolage
- [ ] Créer `packages/config/affiliate.config.js` avec les premiers ASINs
- [ ] Tester `dataforseo-keywords.js --site jardin-bricolage` en local
- [ ] Vérifier que la queue se remplit correctement
- [ ] Tester `article-generator.js --site jardin-bricolage` en local sur 1 article
- [ ] Vérifier le grounding : toutes les infos de l'article sont-elles dans les sources ?
- [ ] Build Astro et vérifier le rendu

### Phase 3 — GitHub Actions
- [ ] Configurer tous les secrets dans GitHub
- [ ] Déployer les 3 workflows
- [ ] Déclencher manuellement `daily-articles.yml` pour le premier test
- [ ] Vérifier les logs et corriger les erreurs

### Phase 4 — Réplication sur les 3 autres sites
- [ ] Répéter Phase 2 pour sport-fitness, cuisine, maison-elec
- [ ] Adapter `site.config.js` et les sources pour chaque niche
- [ ] Vérifier que les 4 sites buildent sans erreur

### Phase 5 — Affiliation et GSC
- [ ] S'inscrire sur Amazon Partenaires (amazon.fr/associates)
- [ ] S'inscrire sur Awin (awin.com) et rejoindre les programmes pertinents
- [ ] Configurer la Google Search Console pour chaque domaine
- [ ] Créer le Service Account Google et télécharger la clé JSON
- [ ] Tester `gsc-indexing.js` en local sur 1-2 URLs test

---

## 10. Informations à fournir par Cédric

Claude Code ne peut pas démarrer sans ces informations :

| Information | Site concerné | Format attendu |
|-------------|---------------|----------------|
| Thème Astro | Tous les sites | `https://github.com/realriplab/Polyglow` ✅ |
| Domaines validés : CONFIRMÉS LIBRES (AFNIC RDAP, 07/05/2026) | Tous | `jardinguide.fr`, `sportmachine.fr`, `cuisineexpert.fr`, `guideelectromenager.fr` |
| AMAZON_AFFILIATE_ID | Tous | Format `identifiant-21` |
| AWIN_PUBLISHER_ID | Tous | Numérique |
| IDs programmes Awin par enseigne | Tous | Numérique par programme |
| Clé Service Account GSC | Tous | Fichier JSON |

---

## 11. Notes légales et éthiques

- **Transparence affiliation** : chaque page doit contenir une mention "Ce site contient des liens d'affiliation. Si vous achetez via ces liens, nous percevons une commission sans surcoût pour vous." — **obligatoire RGPD et conforme aux CGU des programmes d'affiliation**
- **Mentions légales** : créer une page `/mentions-legales` sur chaque site avec éditeur, hébergeur, responsable de publication
- **Politique de confidentialité + cookies** : obligatoire pour les sites français (RGPD / CNIL) — utiliser un bandeau cookie si Google Analytics ou autre outil de tracking
- **Copyright des sources** : le scraping est utilisé uniquement pour extraction de faits (prix, specs), pas pour reproduction de texte. Les articles sont toujours rédigés de façon originale par Claude.
- **Mise à jour des prix** : les prix d'affiliation changent — ajouter une mention "Prix vérifiés le [date], susceptibles de changer" sur chaque carte produit

