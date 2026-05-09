export default {
  name: 'GardenGuide US',           // TODO: replace with the final brand name
  domain: 'TODO_US_DOMAIN',         // TODO: set once the .com is purchased at OVH
  niche: 'jardin-bricolage',
  market: 'us',
  locale: 'en-US',
  language: 'American English',
  currency: 'USD',
  location: 'United States',
  editorialReference: 'Wirecutter',
  shortDescription: 'Independent reviews and buying guides for garden tools and DIY equipment.',
  longDescription: 'GardenGuide is an independent buyer\'s guide that tests and compares the most popular garden tools and DIY equipment in the United States. All recommendations are grounded in verified sources (Wirecutter, Consumer Reports, Home Depot, Lowe\'s).',

  heroTitle: ['The independent buying guide', 'for garden and DIY tools'],
  heroBlurb: 'Hands-on reviews, opinionated roundups, and buying guides — every recommendation is grounded in verified sources (Wirecutter, Consumer Reports, Home Depot, Lowe\'s).',

  keywords: {
    minVolume: 1000,                // US has higher volume baseline than FR
    maxKD: 50,
    intents: ['informational', 'commercial'],
    seedKeywords: [
      // Head terms
      'robot lawn mower',
      'lawn mower',
      'pressure washer',
      'string trimmer',
      'cordless drill',
      'jigsaw',
      'hedge trimmer',
      'leaf blower',
      'chainsaw',
      // Commercial seeds
      'best robot lawn mower',
      'best cordless drill',
      'best pressure washer',
      'pressure washer comparison',
    ],
    topicTokens: [
      'lawn', 'mower', 'mowing', 'garden', 'gardening', 'yard', 'patio',
      'trimmer', 'edger', 'blower', 'chainsaw', 'saw', 'hedge',
      'pressure washer', 'power washer', 'sprayer',
      'drill', 'driver', 'wrench', 'sander', 'grinder', 'router', 'planer',
      'tool', 'tools', 'toolbox', 'workbench', 'ladder',
      'bosch', 'makita', 'husqvarna', 'stihl', 'dewalt', 'milwaukee', 'ryobi',
      'craftsman', 'black decker', 'ego', 'greenworks', 'kobalt',
    ],
  },

  theme: {
    primaryColor: '#2d6a4f',
    accentColor: '#74c69d',
    heroBackground: '#f0f7f4',
  },

  affiliatePrograms: ['amazon-us'],   // add CJ/Impact merchants when wired
};
