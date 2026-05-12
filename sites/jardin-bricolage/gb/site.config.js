export default {
  name: 'GardenGuide UK',           // TODO: replace with the final brand name
  domain: 'TODO_GB_DOMAIN',         // TODO: set once the .co.uk is purchased at OVH
  niche: 'jardin-bricolage',
  market: 'gb',
  locale: 'en-GB',
  language: 'British English',
  currency: 'GBP',
  location: 'United Kingdom',
  editorialReference: 'Which?',
  shortDescription: 'Independent reviews and buying guides for garden tools and DIY equipment.',
  longDescription: 'GardenGuide UK is an independent buyer\'s guide that tests and compares the most popular garden tools and DIY equipment in the United Kingdom. All recommendations are grounded in verified sources (Which?, Trusted Reviews, B&Q, Screwfix).',

  heroTitle: ['The independent buying guide', 'for garden and DIY tools'],
  heroBlurb: 'Hands-on reviews, opinionated comparisons, and buying guides — every recommendation is grounded in verified sources (Which?, Trusted Reviews, B&Q, Screwfix).',

  keywords: {
    minVolume: 500,
    maxKD: 50,
    intents: ['informational', 'commercial'],
    seedKeywords: [
      // Head terms — note British spelling/usage where relevant
      'robotic lawn mower',
      'lawn mower',
      'pressure washer',
      'strimmer',                   // UK term for string trimmer
      'cordless drill',
      'jigsaw',
      'hedge trimmer',
      'leaf blower',
      'chainsaw',
      // Commercial seeds
      'best robotic lawn mower',
      'best cordless drill',
      'best pressure washer',
      'pressure washer review',
    ],
    topicTokens: [
      'lawn', 'mower', 'garden', 'gardening',
      'strimmer', 'trimmer', 'blower', 'chainsaw', 'saw', 'hedge',
      'pressure washer', 'jet washer',
      'drill', 'driver', 'sander', 'grinder', 'router', 'planer',
      'tool', 'tools', 'workbench', 'ladder',
      'bosch', 'makita', 'husqvarna', 'stihl', 'dewalt', 'milwaukee', 'ryobi',
      'flymo', 'mountfield', 'einhell', 'parkside', 'ferrex', 'titan',
    ],
  },

  // Same archetype + font pair as the FR/US siblings; GB leans cooler/mossy
  // so the three jardin-bricolage markets don't read as identical triplets.
  theme: {
    palette: {
      primary:      '#3e6b54',
      primaryDark:  '#284838',
      accent:       '#8db58c',
      accentLight:  '#bfd6be',
      heroBg:       '#eef4ee',
      text:         '#1f2937',
      textMuted:    '#4b5563',
      border:       '#e5e7eb',
    },
    typography: {
      headingFont:    'Crimson Pro',
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
      archetype:    'leaf',
      primaryFill:  '#3e6b54',
      accentFill:   '#8db58c',
    },
  },

  affiliatePrograms: ['amazon-gb'],   // add Awin UK merchants when wired

  // Umami analytics — see jardin-bricolage/fr/site.config.js for the contract.
  umami: {
    host: '',                          // TODO: shared Umami host
    websiteId: '',                     // TODO: UUID from Umami for the GB site
  },
};
