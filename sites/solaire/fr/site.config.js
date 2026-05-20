export default {
  name: 'ToutSolaire',
  domain: 'toutsolaire.fr',
  niche: 'solaire',
  market: 'fr',
  locale: 'fr-FR',
  language: 'French',
  currency: 'EUR',
  location: 'France',
  editorialReference: 'Les Numériques',
  shortDescription: "Guides d'achat solaire, bricolage et matériaux : kits solaires, éclairage extérieur, volets, panneaux et signalisation.",
  longDescription: "ToutSolaire est un guide d'achat indépendant dédié à l'énergie solaire grand public, à l'éclairage extérieur, aux volets, aux matériaux de bricolage et à la signalisation. Toutes nos sélections s'appuient sur des sources vérifiées (ADEME, Photovoltaïque.info, Que Choisir, 60 Millions, fiches techniques officielles).",

  heroTitle: ["Le guide d'achat indépendant", "du solaire et du bricolage"],
  heroBlurb: "Kits solaires, éclairage extérieur, volets, panneaux et signalisation : le bon produit au bon prix, avec des informations sourcées.",

  // Hub-and-spoke navigation. Each entry maps to a /<slug>/ pillar page backed
  // by src/content/hubs/<slug>.mdx, with satellites under /<slug>/<satellite>/.
  // Consumed by Header.astro (nav), index.astro (mega-pillar) and the [type]
  // routes (hub/satellite resolution). Slugs MUST NOT collide with the i18n
  // intent slugs (comparatifs/avis/guides) — guarded at build time.
  hubs: [
    { slug: 'solaire',         label: 'Énergie solaire',     blurb: "Kits solaires, batteries, panneaux autoconsommation, carports et pergolas." },
    { slug: 'exterieur',       label: 'Éclairage extérieur', blurb: "Lampes, lanternes, spots, guirlandes, douches et pompes solaires." },
    { slug: 'volet-store',     label: 'Volets & stores',     blurb: "Volets roulants solaires et électriques, stores bannes motorisés." },
    { slug: 'materiaux',       label: 'Matériaux',           blurb: "Panneaux bois, OSB, MDF, acoustiques, sandwich toiture et muraux." },
    { slug: 'signalisation',   label: 'Signalisation',       blurb: "Panneaux de chantier, dibond, publicitaires et réglementaires." },
    { slug: 'prix-renovation', label: 'Prix rénovation',     blurb: "Coûts d'installation solaire, pompe à chaleur, isolation et volets." },
  ],

  keywords: {
    minVolume: 500,
    maxKD: 50,
    intents: ['informational', 'commercial'],
    seedKeywords: [
      'kit solaire',
      'panneau solaire autoconsommation',
      'batterie solaire',
      'lampe solaire extérieur',
      'volet roulant solaire',
      'panneau bois',
      'panneau acoustique',
      'douche solaire',
      'panneau de signalisation',
      'meilleur kit solaire',
      'comparatif batterie solaire',
      'meilleure lampe solaire extérieur',
    ],
    topicTokens: [
      'solaire', 'solaires', 'photovoltaique', 'photovoltaïque', 'panneau', 'panneaux',
      'kit', 'batterie', 'autoconsommation', 'onduleur', 'carport', 'pergola',
      'lampe', 'lanterne', 'spot', 'guirlande', 'douche', 'pompe', 'bassin',
      'eclairage', 'éclairage', 'exterieur', 'extérieur', 'lampadaire', 'applique',
      'volet', 'volets', 'roulant', 'store', 'banne', 'somfy', 'bubendorff', 'velux',
      'osb', 'mdf', 'bois', 'acoustique', 'sandwich', 'toiture', 'mural', 'cloture', 'clôture', 'tasseau',
      'signalisation', 'chantier', 'dibond', 'publicitaire', 'panneau stop', 'attention',
      'chauffe eau', 'chauffe-eau', 'beem', 'ecoflow', 'bluetti', 'sunology', 'allpowers',
    ],
  },

  // Solar-energy visual identity — warm amber palette + "bolt" logo archetype.
  theme: {
    palette: {
      primary:      '#d97706',
      primaryDark:  '#92400e',
      accent:       '#fbbf24',
      accentLight:  '#fde68a',
      heroBg:       '#fff8ed',
      text:         '#1f2937',
      textMuted:    '#4b5563',
      border:       '#e5e7eb',
    },
    typography: {
      headingFont:    'Sora',
      bodyFont:       'Inter',
      headingWeight:  700,
      bodyWeight:     400,
    },
    density: {
      radius:           '0.5rem',
      spacingScale:     1.0,
      contentMaxWidth:  '72ch',
    },
    logo: {
      archetype:    'bolt',
      primaryFill:  '#d97706',
      accentFill:   '#fbbf24',
    },
  },

  affiliatePrograms: ['amazon-fr', 'awin-manomano', 'awin-leroy-merlin', 'awin-cdiscount', 'awin-ecoflow', 'awin-beem-energy'],

  social: {
    // facebook:  'https://www.facebook.com/toutsolaire',
    // instagram: 'https://www.instagram.com/toutsolaire',
  },

  // Editorial author — drives AuthorBio + JSON-LD `author: Person` (E-E-A-T).
  // TODO: créer le profil LinkedIn réel avant lancement, puis décommenter
  // `linkedinUrl` (ne jamais publier une URL qui renvoie un 404).
  author: {
    name: 'Julien Maret',
    role: 'Rédacteur en chef — installateur photovoltaïque de formation',
    bio: "Formé à l'installation photovoltaïque et passionné de bricolage, j'ai posé des kits solaires, des volets motorisés et monté des dizaines de mètres carrés de panneaux. J'apporte ici un regard terrain : rendement réel, durabilité, et zéro promesse marketing non sourcée.",
    photo: '/images/team/julien-maret.jpg',
    // linkedinUrl: 'https://www.linkedin.com/in/julien-maret-solaire/',
  },

  // Umami analytics — laisser vide tant que le "Website" Umami n'est pas créé.
  umami: {
    host: '',
    websiteId: '',
  },
};
