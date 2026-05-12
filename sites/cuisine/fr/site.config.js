export default {
  name: 'CuisineExpert',
  domain: 'cuisineexpert.fr',
  niche: 'cuisine',
  market: 'fr',
  locale: 'fr-FR',
  language: 'French',
  currency: 'EUR',
  location: 'France',
  editorialReference: 'Les Numériques',
  shortDescription: "Tests, comparatifs et guides d'achat indépendants pour le petit électroménager et les ustensiles de cuisine.",
  longDescription: "CuisineExpert est un guide d'achat indépendant qui teste et compare le petit électroménager et les ustensiles de cuisine vendus en France. Toutes nos sélections s'appuient sur des sources vérifiées (Que Choisir, Les Numériques, Labo Maison, retailers officiels).",

  heroTitle: ["Le guide d'achat indépendant", 'du petit électroménager de cuisine'],
  heroBlurb: "Le bon robot, la bonne friteuse, la bonne machine à café — sans lire 40 fiches produit. Tests, comparatifs et guides d'achat indépendants.",

  keywords: {
    minVolume: 500,
    maxKD: 50,
    intents: ['informational', 'commercial'],
    seedKeywords: [
      // Head terms — high-volume category queries
      'robot cuisine',
      'robot multifonction',
      'robot patissier',
      'friteuse sans huile',
      'air fryer',
      'machine a cafe',
      'machine a cafe a grain',
      'cafetiere',
      'blender chauffant',
      'mixeur plongeant',
      'extracteur de jus',
      'autocuiseur',
      'multicuiseur',
      // Commercial seeds — push the API toward "meilleur X" long-tail
      'meilleur robot cuisine',
      'meilleure friteuse sans huile',
      'meilleure machine a cafe',
      'comparatif air fryer',
      'meilleur robot patissier',
    ],
    topicTokens: [
      'cuisine', 'cuisson', 'cuiseur', 'robot', 'patissier', 'pâtissier',
      'multifonction', 'multicuiseur', 'autocuiseur',
      'friteuse', 'air fryer', 'airfryer',
      'machine', 'cafe', 'café', 'expresso', 'espresso', 'cafetiere', 'cafetière',
      'broyeur', 'grain', 'grains',
      'blender', 'chauffant', 'mixeur', 'plongeant', 'mixeur plongeant',
      'hachoir', 'centrifugeuse', 'extracteur', 'jus',
      'gaufrier', 'grille pain', 'grille-pain', 'toaster',
      'four', 'mini four', 'mini-four', 'micro ondes', 'micro-ondes',
      'plancha', 'crepiere', 'crêpière', 'raclette', 'fondue',
      'mixer', 'kitchenaid', 'magimix', 'moulinex', 'kenwood', 'tefal',
      'ninja', 'philips', 'seb', 'krups', 'thermomix', 'companion',
      'cookeo', 'monsieur cuisine', 'instant pot', 'delonghi', 'de longhi',
      'jura', 'siemens', 'bosch',
      'poele', 'poêle', 'casserole', 'cocotte', 'autocuiseur',
      'couteau', 'couteaux', 'planche', 'ustensile',
    ],
  },

  // Per-site visual identity — cuisine = warmer palette + softer serif
  theme: {
    palette: {
      primary:      '#b8451f',  // warm copper
      primaryDark:  '#8a2f12',
      accent:       '#e8a87c',
      accentLight:  '#f5d5b8',
      heroBg:       '#fbf3ec',
      text:         '#1f2937',
      textMuted:    '#4b5563',
      border:       '#e5e7eb',
    },
    typography: {
      headingFont:    'Fraunces',     // soft modern serif, editorial cookbook feel
      bodyFont:       'Inter',
      headingWeight:  600,
      bodyWeight:     400,
    },
    density: {
      radius:           '0.625rem',
      spacingScale:     1.0,
      contentMaxWidth:  '72ch',
    },
    logo: {
      archetype:    'pot',
      primaryFill:  '#b8451f',
      accentFill:   '#e8a87c',
    },
  },

  affiliatePrograms: ['amazon-fr', 'awin-darty', 'awin-boulanger', 'awin-fnac'],

  social: {},

  author: {
    name: 'Claire Vasseur',
    role: 'Rédactrice en chef — ancienne cheffe pâtissière',
    bio: "Dix ans en cuisine professionnelle (pâtisserie de restaurant étoilé puis chef pâtissière indépendante) avant de passer côté presse spécialisée. Spécialisée dans le petit électroménager qui travaille — robots pâtissiers, mixeurs, machines à café à grain. Ses sélections privilégient la durabilité, la disponibilité des pièces détachées et le rendement réel plutôt que les modes.",
    photo: '/images/team/claire-vasseur.jpg',
    // linkedinUrl: 'https://www.linkedin.com/in/claire-vasseur-patissiere/',
  },

  umami: {
    host: 'https://vps-4db95b47.vps.ovh.net',
    websiteId: 'a3a987b6-f8c3-4f6b-9ad0-838d195c4627',
  },
};
