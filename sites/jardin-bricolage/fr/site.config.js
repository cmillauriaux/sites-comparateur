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

  theme: {
    primaryColor: '#2d6a4f',
    accentColor: '#74c69d',
    heroBackground: '#f0f7f4',
  },

  affiliatePrograms: ['amazon-fr', 'awin-leroy-merlin', 'awin-mr-bricolage', 'awin-castorama'],
};
