export default {
  name: 'JardinGuide',
  domain: 'jardinguide.fr',
  niche: 'jardin-bricolage',
  market: 'fr',
  locale: 'fr-FR',
  language: 'French',
  currency: 'EUR',
  location: 'France',
  editorialReference: 'Les Numériques',
  shortDescription: 'Tests, comparatifs et guides d\'achat pour le jardin et le bricolage.',
  longDescription: 'JardinGuide est un guide d\'achat indépendant qui teste et compare les outils de jardin et de bricolage les plus populaires en France. Tous nos avis sont étayés par des sources vérifiées (Que Choisir, Les Numériques, retailers officiels).',

  // Niche-specific marketing copy used on the homepage hero (line break = <br/>).
  heroTitle: ['Le guide d\'achat indépendant', 'du jardin et du bricolage'],
  heroBlurb: 'Le bon outil au bon prix, sans lire 40 fiches produit. Tests, comparatifs et guides d\'achat indépendants.',

  keywords: {
    minVolume: 500,
    maxKD: 50,                         // applied only when DataForSEO has KD data; FR long-tail often returns KD=0 (unknown)
    intents: ['informational', 'commercial'],
    // Seed keywords feed `keyword_ideas` (semantic, broad). Mix head terms
    // (high volume, semantic anchors) with explicit commercial phrasings
    // ("meilleur X", "comparatif X") to pull both buckets into the pool.
    seedKeywords: [
      // Head terms — for category-level guides on high-volume queries
      'robot tondeuse',
      'tondeuse gazon',
      'nettoyeur haute pression',
      'debroussailleuse',
      'perceuse visseuse',
      'scie sauteuse',
      'taille haie',
      'souffleur feuilles',
      'tronconneuse',
      // Commercial seeds — push the API toward "meilleur X" long-tail
      'meilleur robot tondeuse',
      'meilleure perceuse visseuse',
      'comparatif tronconneuse',
      'meilleur nettoyeur haute pression',
    ],
    // Topic whitelist — at least one of these tokens must appear in the keyword
    // for it to be retained. `keyword_ideas` returns semantic neighbors that
    // sometimes drift (e.g. "rideau thermique", "robot patissier"); this filters
    // them out cheaply without needing a second API call.
    topicTokens: [
      'jardin', 'bricolage', 'tondeuse', 'tondeuses', 'perceuse', 'visseuse',
      'tronconneuse', 'tronçonneuse', 'debroussailleuse', 'débroussailleuse',
      'nettoyeur', 'haute pression', 'karcher', 'taille haie', 'taille-haie',
      'scie', 'meule', 'meuleuse', 'ponceuse', 'rabot', 'cloueur', 'agrafeuse',
      'souffleur', 'feuilles', 'robot tondeuse', 'jardinage', 'arrosage',
      'tuyau', 'serre', 'brouette', 'tondre', 'jardin', 'echelle', 'échelle',
      'établi', 'etabli', 'outillage', 'outil', 'bricoler', 'bricolage',
      'bosch', 'makita', 'husqvarna', 'stihl', 'parkside', 'ryobi', 'einhell',
      'dewalt', 'metabo', 'gardena', 'flymo',
    ],
  },

  // Per-site visual identity injected as CSS variables in <head> by SiteLayout,
  // and consumed by the Logo component for the SVG archetype. Varying these
  // across (niche, market) breaks the shared-template fingerprint that
  // would otherwise let Google cluster all 12 sites as one network.
  theme: {
    palette: {
      primary:      '#2d6a4f',
      primaryDark:  '#1b4332',
      accent:       '#74c69d',
      accentLight:  '#b7e4c7',
      heroBg:       '#f0f7f4',
      text:         '#1f2937',
      textMuted:    '#4b5563',
      border:       '#e5e7eb',
    },
    typography: {
      headingFont:    'Crimson Pro',  // serif, garden-editorial feel
      bodyFont:       'Inter',
      headingWeight:  700,
      bodyWeight:     400,
    },
    density: {
      radius:           '0.5rem',     // comfortable, neither sharp nor pillowy
      spacingScale:     1.0,
      contentMaxWidth:  '72ch',
    },
    logo: {
      archetype:    'leaf',
      primaryFill:  '#2d6a4f',
      accentFill:   '#74c69d',
    },
  },

  affiliatePrograms: ['amazon-fr', 'awin-leroy-merlin', 'awin-mr-bricolage', 'awin-castorama'],

  // Publisher Organization sameAs — populates the JSON-LD social proof
  // graph rendered by ArticleLayout + index. Leave entries undefined until
  // each profile exists; the schema filters empty strings so partial
  // population is fine. NEVER ship a URL that 404s.
  social: {
    // facebook:  'https://www.facebook.com/jardinguide',
    // instagram: 'https://www.instagram.com/jardinguide',
    // twitter:   'https://twitter.com/jardinguide',
    // linkedin:  'https://www.linkedin.com/company/jardinguide',
  },

  // Editorial author. Drives the AuthorBio block + JSON-LD `author: Person`
  // (E-E-A-T signal — hands-on background backs the editorial voice). The
  // bio MUST stay aligned with the LinkedIn profile referenced below; if the
  // LinkedIn changes, update both.
  // TODO: see TODO.md "Author bios — real LinkedIn profile" before launch.
  // Until LinkedIn exists, keep `linkedinUrl` undefined so we don't ship a
  // 404 link.
  author: {
    name: 'Marc Lefèvre',
    role: "Rédacteur en chef — ancien paysagiste",
    bio: "15 ans comme paysagiste indépendant en Île-de-France — j'ai usé plus de tronçonneuses et de tondeuses que je ne peux en compter. Aujourd'hui je teste et je compare plutôt que de pelleter, mais j'apporte le même regard terrain : durabilité, SAV réel, zéro gadget inutile.",
    photo: '/images/team/marc-lefevre.jpg',
    // linkedinUrl: 'https://www.linkedin.com/in/marc-lefevre-paysagiste/',  // ← uncomment once the profile is live
  },

  // Umami analytics — leave host/websiteId empty to disable on this site.
  // host = base URL of your Umami instance (no trailing slash, no /script.js).
  umami: {
    host: 'https://vps-4db95b47.vps.ovh.net',
    websiteId: '48b02c61-0116-4b99-9202-4feeb1957cd9',
  },
};
