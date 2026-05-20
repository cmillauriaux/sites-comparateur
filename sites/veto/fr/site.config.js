export default {
  name: 'ToutVéto',
  domain: 'toutveto.fr',
  niche: 'veto',
  market: 'fr',
  locale: 'fr-FR',
  language: 'French',
  currency: 'EUR',
  location: 'France',
  editorialReference: 'Les Numériques',
  shortDescription: "Comparateur d'assurances santé animale, tarifs vétérinaires et guides santé pour chien, chat et NAC.",
  longDescription: "ToutVéto est un guide éditorial indépendant dédié à l'assurance santé animale, aux tarifs vétérinaires et à la santé du chien, du chat et des NAC. Nos contenus s'appuient exclusivement sur des sources vérifiables (SNVEL, Ordre des Vétérinaires, écoles vétérinaires, ANSES, FACCO, Légifrance) et nos pages assurance affichent une méthodologie transparente. Site éditorial non immatriculé ORIAS.",

  heroTitle: ["Assurance santé animale", "et tarifs vétérinaires expliqués"],
  heroBlurb: "Comparez les assurances, anticipez les frais vétérinaires et protégez la santé de votre animal — avec des informations sourcées et une méthodologie transparente.",

  // Hub-and-spoke navigation. Each entry maps to a /<slug>/ pillar page backed
  // by src/content/hubs/<slug>.mdx, with satellites under /<slug>/<satellite>/.
  // Slugs MUST NOT collide with the i18n intent slugs (comparatifs/avis/guides).
  hubs: [
    { slug: 'assurance',     label: 'Assurance santé',  blurb: "Comparatif des assurances chien, chat et NAC : garanties, plafonds, délais de carence, avis." },
    { slug: 'tarifs-veto',   label: 'Tarifs vétérinaires', blurb: "Prix moyens par acte : consultation, vaccins, stérilisation, détartrage, urgences." },
    { slug: 'sante-animale', label: 'Santé animale',    blurb: "Maladies, prévention, calendrier vaccinal, parasites et alimentation du chien et du chat." },
    { slug: 'accessoires',   label: 'Accessoires',      blurb: "Guides d'achat croquettes, paniers, arbres à chat, harnais et accessoires testés." },
  ],

  keywords: {
    minVolume: 200,
    maxKD: 40,
    intents: ['informational', 'commercial'],
    seedKeywords: [
      'assurance chien',
      'mutuelle chien',
      'assurance chat',
      'prix vaccin chat',
      'prix consultation vétérinaire',
      'castrer chien prix',
      'assurance chien comparatif',
      'meilleure assurance chien',
      'santevet avis',
      'lassie avis',
      'calendrier vaccinal chien',
      'meilleures croquettes chien',
    ],
    topicTokens: [
      'assurance', 'assurances', 'mutuelle', 'mutuelles', 'sante', 'santé', 'animale', 'animaux',
      'chien', 'chiot', 'chat', 'chaton', 'nac', 'lapin', 'furet',
      'veterinaire', 'vétérinaire', 'veto', 'véto', 'consultation', 'tarif', 'tarifs', 'prix', 'cout', 'coût',
      'vaccin', 'vaccination', 'sterilisation', 'stérilisation', 'castration', 'detartrage', 'détartrage',
      'euthanasie', 'puce', 'identification', 'operation', 'opération', 'toilettage', 'urgence',
      'garantie', 'plafond', 'franchise', 'carence', 'remboursement', 'formule', 'devis',
      'santevet', 'lassie', 'acheel', 'dalma', 'goodflair', 'kozoo', 'bulle bleue', 'fidanimo',
      'maladie', 'symptomes', 'symptômes', 'prevention', 'prévention', 'parasites', 'vermifuge',
      'croquettes', 'alimentation', 'panier', 'arbre a chat', 'arbre à chat', 'harnais', 'litiere', 'litière',
    ],
  },

  // Veterinary/pet identity — calm teal palette + "paw" logo archetype.
  theme: {
    palette: {
      primary:      '#0d9488',
      primaryDark:  '#115e59',
      accent:       '#5eead4',
      accentLight:  '#ccfbf1',
      heroBg:       '#f0fdfa',
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
      archetype:    'paw',
      primaryFill:  '#0d9488',
      accentFill:   '#5eead4',
    },
  },

  // Hub 1 monetisation = lead-gen (SantéVet/Lassie/Acheel/Dalma/Goodflair).
  // Hub 4 cross-sell = Amazon + Zooplus + Wanimo + alimentation premium.
  // All insurance links are CPA lead-gen (kind:'lead') — never sponsored deeplinks.
  affiliatePrograms: [
    'amazon-fr',
    'santevet', 'lassie', 'acheel', 'dalma', 'goodflair',
    'awin-zooplus', 'wanimo', 'animigo', 'la-ferme-des-animaux', 'homycat',
  ],

  social: {
    // facebook:  'https://www.facebook.com/toutveto',
    // instagram: 'https://www.instagram.com/toutveto',
  },

  // Editorial author — drives AuthorBio + JSON-LD `author: Person` (E-E-A-T).
  // YMYL santé : tout article santé doit aussi être revu médicalement par un
  // vétérinaire identifié (voir brief). TODO: créer le profil LinkedIn réel
  // avant lancement, puis décommenter `linkedinUrl` (jamais d'URL en 404).
  author: {
    name: 'Camille Royer',
    role: 'Rédactrice en chef — spécialiste assurance et santé animale',
    bio: "Propriétaire de deux chiens et d'un chat, je décrypte depuis des années les contrats d'assurance santé animale et les grilles tarifaires vétérinaires. J'écris ici pour aider les propriétaires à anticiper les frais et choisir une couverture adaptée, sans jamais inventer un chiffre ni remplacer l'avis d'un vétérinaire.",
    photo: '/images/team/camille-royer.jpg',
    // linkedinUrl: 'https://www.linkedin.com/in/camille-royer-veto/',
  },

  // Umami analytics — laisser vide tant que le "Website" Umami n'est pas créé.
  umami: {
    host: '',
    websiteId: '',
  },
};
