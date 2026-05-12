/**
 * Per-market UI strings for Astro components and pages.
 *
 * Components read their site's market from the colocated `site.config.js` and
 * pick the matching bundle via `t(market)`. This keeps the .astro files thin
 * (no per-locale ternaries) and makes adding a new market a one-place edit
 * here rather than touching every component across every site.
 *
 * Niche-specific copy (hero subtitle, niche labels) lives in each site's
 * `site.config.js`, not here — those drift independently per site.
 */

const strings = {
  fr: {
    // URL slugs for the article subdirectories. The pipeline (article-
    // generator.js) and the Astro routes (sites/<niche>/<market>/src/pages/
    // <slug>/[...slug].astro) MUST stay in sync with these — search the
    // codebase for `slugComparisons` to see every spot that consumes them.
    slugComparisons: 'comparatifs',
    slugReviews:     'avis',
    slugGuides:      'guides',

    // ProductCard / ComparisonTable
    pros:           'Points forts',
    cons:           'Points faibles',
    scoreLabel:     'Note',
    scoreAria:      (n) => `Note : ${n} sur 10`,
    viewOffer:      "Voir l'offre",
    viewPrice:      'Voir le prix',
    viewOnAmazon:   'Voir sur Amazon',
    productHeading:           'Produit',
    priceHeading:             'Prix',
    productImageUnavailable:  'Image produit indisponible',
    amazonPriceLabel:         'Prix Amazon',

    // ArticleLayout
    publishedOn:    'Publié le',
    updatedOn:      'Mis à jour le',
    weightedAvg:    'Note pondérée selon nos critères de sélection.',
    sourcesLabel:    'sources vérifiées',
    finalScoreLabel: 'Note éditoriale',
    intentLabels:    { avis: 'Notre sélection', comparatif: 'Sélection comparée', guide: "Guide d'achat", informational: 'Article' },
    relatedArticlesLabel: 'Articles liés',
    bundleSlotLabels: { comparatif: 'Comparatif', pillar: 'Guide', avis: 'Avis' },
    methodologyNote: 'Méthodologie : sélection éditoriale fondée sur la synthèse de sources vérifiées, sans prise en main physique des produits.',
    methodologyReadMore: 'Lire notre méthodologie complète →',

    // SourceList
    sourcesHeading: 'Sources consultées',
    consultedOn:    'consulté le',
    sourcesBlurb:   (n) =>
      `Cet article s'appuie sur ${n} sources vérifiées. Toutes les informations factuelles (prix, specs, classements) en proviennent.`,

    // AuthorBio
    authorByline:   'Rédigé par',

    // AffiliateDisclosure
    disclosureLabel: "Liens d'affiliation",
    disclosureBody:  "cette page contient des liens d'affiliation. Si vous achetez via ces liens, nous percevons une commission sans surcoût pour vous. C'est notre seul modèle de financement : nous ne vendons pas d'espace publicitaire aux fabricants et ne facturons aucun test, ce qui garantit notre indépendance éditoriale.",

    // Header / Footer / nav
    home:            'Accueil',
    navigation:      'Navigation',
    information:     'Informations',
    navComparisons:  'Comparatifs',
    navReviews:      'Avis',
    navGuides:       'Guides',
    legalNotice:     'Mentions légales',
    privacyPolicy:   'Politique de confidentialité',
    affiliatePolicy: "Politique d'affiliation",
    methodologyLink: 'Méthodologie',
    footerTagline:   "Guide d'achat indépendant.",
    legalSlugs:      { legal: 'mentions-legales', privacy: 'politique-confidentialite', affiliate: 'affiliation', methodology: 'methodologie' },

    // Index + list pages
    ctaComparisons:  'Voir les comparatifs',
    ctaReviews:      'Voir les tests',
    sectionGuides:   "Guides d'achat",
    noArticles:      'Aucun article publié pour le moment.',
    allComparisons:  'Tous les comparatifs',
    allReviews:      'Tous les tests',
    allGuides:       "Guides d'achat",
    latestPrefix:     'Derniers',
    homeTitleSuffix: "Tests, comparatifs et guides d'achat",
    pageComparisonsIntro:
      "Les critères qui comptent, une sélection resserrée, un tableau pour comparer en un coup d'œil et une recommandation argumentée.",
    pageReviewsIntro:
      'Chaque sélection est appuyée par au minimum 3 sources vérifiées. La note éditoriale est une moyenne pondérée selon nos critères de sélection.',
    noComparisons:   'Aucun comparatif publié pour le moment.',
    noReviews:       'Aucun test publié pour le moment.',
    noGuides:        'Aucun guide publié pour le moment.',
  },

  us: {
    slugComparisons: 'comparisons',
    slugReviews:     'reviews',
    slugGuides:      'guides',

    pros:            'Pros',
    cons:            'Cons',
    scoreLabel:      'Score',
    scoreAria:       (n) => `Score: ${n} out of 10`,
    viewOffer:       'See the deal',
    viewPrice:       'Check price',
    viewOnAmazon:    'View on Amazon',
    productHeading:           'Product',
    priceHeading:             'Price',
    productImageUnavailable:  'Product image unavailable',
    amazonPriceLabel:         'Amazon price',

    publishedOn:     'Published',
    updatedOn:       'Updated',
    weightedAvg:     'Weighted average across our selection criteria.',
    sourcesLabel:    'verified sources',
    finalScoreLabel: 'Editorial score',
    intentLabels:    { avis: "Editor's pick", comparatif: 'Roundup', guide: 'Buying guide', informational: 'Article' },
    relatedArticlesLabel: 'Related articles',
    bundleSlotLabels: { comparatif: 'Roundup', pillar: 'Buying guide', avis: 'Editor\'s pick' },
    methodologyNote: 'Methodology: editorial pick synthesised from verified sources, without hands-on physical testing of the products.',
    methodologyReadMore: 'Read our full methodology →',

    sourcesHeading:  'Sources consulted',
    consultedOn:     'consulted on',
    sourcesBlurb:    (n) =>
      `This article draws on ${n} verified sources. All factual claims (prices, specs, rankings) come from them.`,

    authorByline:    'Written by',

    disclosureLabel: 'Affiliate disclosure',
    disclosureBody:  "this page contains affiliate links. If you purchase through these links we earn a commission at no extra cost to you. This is our only revenue model: we don't sell ad space to manufacturers and we don't charge for reviews, which is what guarantees our editorial independence.",

    home:            'Home',
    navigation:      'Navigation',
    information:     'Information',
    navComparisons:  'Roundups',
    navReviews:      'Reviews',
    navGuides:       'Guides',
    legalNotice:     'Legal notice',
    privacyPolicy:   'Privacy policy',
    affiliatePolicy: 'Affiliate disclosure',
    methodologyLink: 'Methodology',
    footerTagline:   'Independent buying guide.',
    legalSlugs:      { legal: 'legal-notice', privacy: 'privacy-policy', affiliate: 'affiliate-disclosure', methodology: 'methodology' },

    ctaComparisons:  'See the roundups',
    ctaReviews:      'See the reviews',
    sectionGuides:   'Buying guides',
    noArticles:      'No articles published yet.',
    allComparisons:  'All roundups',
    allReviews:      'All reviews',
    allGuides:       'Buying guides',
    latestPrefix:     'Latest',
    homeTitleSuffix: 'Reviews, roundups, and buying guides',
    pageComparisonsIntro:
      'Each roundup opens with the buying criteria, briefly presents every product we kept, and closes with a summary table and our final pick.',
    pageReviewsIntro:
      'Every editor’s pick is backed by at least 3 verified sources. The editorial score is a weighted average across our selection criteria.',
    noComparisons:   'No roundups published yet.',
    noReviews:       'No reviews published yet.',
    noGuides:        'No guides published yet.',
  },

  gb: {
    slugComparisons: 'comparisons',
    slugReviews:     'reviews',
    slugGuides:      'guides',

    pros:            'Pros',
    cons:            'Cons',
    scoreLabel:      'Score',
    scoreAria:       (n) => `Score: ${n} out of 10`,
    viewOffer:       'See the offer',
    viewPrice:       'Check price',
    viewOnAmazon:    'View on Amazon',
    productHeading:           'Product',
    priceHeading:             'Price',
    productImageUnavailable:  'Product image unavailable',
    amazonPriceLabel:         'Amazon price',

    publishedOn:     'Published',
    updatedOn:       'Updated',
    weightedAvg:     'Weighted average across our selection criteria.',
    sourcesLabel:    'verified sources',
    finalScoreLabel: 'Editorial score',
    intentLabels:    { avis: "Editor's pick", comparatif: 'Comparison', guide: 'Buying guide', informational: 'Article' },
    relatedArticlesLabel: 'Related articles',
    bundleSlotLabels: { comparatif: 'Comparison', pillar: 'Buying guide', avis: 'Editor\'s pick' },
    methodologyNote: 'Methodology: editorial pick synthesised from verified sources, without hands-on physical testing of the products.',
    methodologyReadMore: 'Read our full methodology →',

    sourcesHeading:  'Sources consulted',
    consultedOn:     'consulted on',
    sourcesBlurb:    (n) =>
      `This article draws on ${n} verified sources. All factual claims (prices, specs, rankings) come from them.`,

    authorByline:    'Written by',

    disclosureLabel: 'Affiliate disclosure',
    disclosureBody:  "this page contains affiliate links. If you buy through these links we earn a commission at no extra cost to you. This is our only revenue model: we don't sell ad space to manufacturers and we don't charge for reviews, which is what guarantees our editorial independence.",

    home:            'Home',
    navigation:      'Navigation',
    information:     'Information',
    navComparisons:  'Comparisons',
    navReviews:      'Reviews',
    navGuides:       'Guides',
    legalNotice:     'Legal notice',
    privacyPolicy:   'Privacy policy',
    affiliatePolicy: 'Affiliate disclosure',
    methodologyLink: 'Methodology',
    footerTagline:   'Independent buying guide.',
    legalSlugs:      { legal: 'legal-notice', privacy: 'privacy-policy', affiliate: 'affiliate-disclosure', methodology: 'methodology' },

    ctaComparisons:  'See the comparisons',
    ctaReviews:      'See the reviews',
    sectionGuides:   'Buying guides',
    noArticles:      'No articles published yet.',
    allComparisons:  'All comparisons',
    allReviews:      'All reviews',
    allGuides:       'Buying guides',
    latestPrefix:     'Latest',
    homeTitleSuffix: 'Reviews, comparisons, and buying guides',
    pageComparisonsIntro:
      'Each comparison opens with the buying criteria, briefly presents every product we kept, and closes with a summary table and our final pick.',
    pageReviewsIntro:
      'Every editor’s pick is backed by at least 3 verified sources. The editorial score is a weighted average across our selection criteria.',
    noComparisons:   'No comparisons published yet.',
    noReviews:       'No reviews published yet.',
    noGuides:        'No guides published yet.',
  },
};

/**
 * Return the i18n bundle for a market, optionally merging per-site overrides.
 *
 * The second arg is the site's full siteConfig (NOT just the overrides) so
 * call sites can pass `i18n(siteConfig.market, siteConfig)` without
 * destructuring; absent → returns the default bundle.
 *
 * Currently the only overridable key is `legalSlugs` (used to vary the URL
 * of the legal pages across niches so the 12 sites don't share the same
 * /mentions-legales pattern). Extend here when more overrides are needed
 * — never inline a merge at call sites.
 */
export function t(market, siteConfig) {
  const base = strings[market] || strings.fr;
  const overrides = siteConfig && siteConfig.legalSlugs;
  if (!overrides) return base;
  return { ...base, legalSlugs: { ...base.legalSlugs, ...overrides } };
}

export default strings;
