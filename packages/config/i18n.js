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
    // ProductCard / ComparisonTable
    pros:           'Points forts',
    cons:           'Points faibles',
    scoreLabel:     'Note',
    scoreAria:      (n) => `Note : ${n} sur 10`,
    viewOffer:      "Voir l'offre",
    viewPrice:      'Voir le prix',
    viewOnAmazon:   'Voir sur Amazon',

    // ArticleLayout
    publishedOn:    'Publié le',
    updatedOn:      'Mis à jour le',
    weightedAvg:    'Moyenne pondérée des notes par critère.',

    // SourceList
    sourcesHeading: 'Sources consultées',
    sourcesBlurb:   (n, score) =>
      `Cet article s'appuie sur ${n} sources vérifiées${score ? ` (couverture : ${score})` : ''}. Toutes les informations factuelles (prix, specs, classements) en proviennent.`,

    // AffiliateDisclosure
    disclosureLabel: "Liens d'affiliation",
    disclosureBody:  "cette page contient des liens d'affiliation. Si vous achetez via ces liens, nous percevons une commission sans surcoût pour vous. Notre éditorial reste indépendant.",

    // Header / Footer / nav
    navComparisons:  'Comparatifs',
    navReviews:      'Avis',
    navGuides:       'Guides',
    legalNotice:     'Mentions légales',
    privacyPolicy:   'Politique de confidentialité',
    affiliatePolicy: "Politique d'affiliation",
    footerTagline:   "Guide d'achat indépendant.",

    // Index + list pages
    ctaComparisons:  'Voir les comparatifs',
    ctaReviews:      'Voir les tests',
    sectionGuides:   "Guides d'achat",
    noArticles:      'Aucun article publié pour le moment.',
    allComparisons:  'Tous les comparatifs',
    allReviews:      'Tous les tests',
    allGuides:       "Guides d'achat",
    pageComparisonsIntro:
      "Chaque comparatif commence par les critères de choix, présente brièvement chaque produit retenu, et se conclut par un tableau récapitulatif assorti d'une recommandation finale.",
    pageReviewsIntro:
      'Chaque test est appuyé par au minimum 2 sources vérifiées. Note finale = moyenne pondérée des notes par critère.',
    noComparisons:   'Aucun comparatif publié pour le moment.',
    noReviews:       'Aucun test publié pour le moment.',
    noGuides:        'Aucun guide publié pour le moment.',
  },

  us: {
    pros:            'Pros',
    cons:            'Cons',
    scoreLabel:      'Score',
    scoreAria:       (n) => `Score: ${n} out of 10`,
    viewOffer:       'See the deal',
    viewPrice:       'Check price',
    viewOnAmazon:    'View on Amazon',

    publishedOn:     'Published',
    updatedOn:       'Updated',
    weightedAvg:     'Weighted average of per-criterion scores.',

    sourcesHeading:  'Sources consulted',
    sourcesBlurb:    (n, score) =>
      `This article draws on ${n} verified sources${score ? ` (coverage: ${score})` : ''}. All factual claims (prices, specs, rankings) come from them.`,

    disclosureLabel: 'Affiliate disclosure',
    disclosureBody:  'this page contains affiliate links. If you purchase through these links we earn a commission at no extra cost to you. Our editorial coverage stays independent.',

    navComparisons:  'Roundups',
    navReviews:      'Reviews',
    navGuides:       'Guides',
    legalNotice:     'Legal notice',
    privacyPolicy:   'Privacy policy',
    affiliatePolicy: 'Affiliate disclosure',
    footerTagline:   'Independent buying guide.',

    ctaComparisons:  'See the roundups',
    ctaReviews:      'See the reviews',
    sectionGuides:   'Buying guides',
    noArticles:      'No articles published yet.',
    allComparisons:  'All roundups',
    allReviews:      'All reviews',
    allGuides:       'Buying guides',
    pageComparisonsIntro:
      'Each roundup opens with the buying criteria, briefly presents every product we kept, and closes with a summary table and our final pick.',
    pageReviewsIntro:
      'Every review is backed by at least 2 verified sources. The final score is a weighted average of per-criterion scores.',
    noComparisons:   'No roundups published yet.',
    noReviews:       'No reviews published yet.',
    noGuides:        'No guides published yet.',
  },

  gb: {
    pros:            'Pros',
    cons:            'Cons',
    scoreLabel:      'Score',
    scoreAria:       (n) => `Score: ${n} out of 10`,
    viewOffer:       'See the offer',
    viewPrice:       'Check price',
    viewOnAmazon:    'View on Amazon',

    publishedOn:     'Published',
    updatedOn:       'Updated',
    weightedAvg:     'Weighted average of per-criterion scores.',

    sourcesHeading:  'Sources consulted',
    sourcesBlurb:    (n, score) =>
      `This article draws on ${n} verified sources${score ? ` (coverage: ${score})` : ''}. All factual claims (prices, specs, rankings) come from them.`,

    disclosureLabel: 'Affiliate disclosure',
    disclosureBody:  'this page contains affiliate links. If you buy through these links we earn a commission at no extra cost to you. Our editorial coverage remains independent.',

    navComparisons:  'Comparisons',
    navReviews:      'Reviews',
    navGuides:       'Guides',
    legalNotice:     'Legal notice',
    privacyPolicy:   'Privacy policy',
    affiliatePolicy: 'Affiliate disclosure',
    footerTagline:   'Independent buying guide.',

    ctaComparisons:  'See the comparisons',
    ctaReviews:      'See the reviews',
    sectionGuides:   'Buying guides',
    noArticles:      'No articles published yet.',
    allComparisons:  'All comparisons',
    allReviews:      'All reviews',
    allGuides:       'Buying guides',
    pageComparisonsIntro:
      'Each comparison opens with the buying criteria, briefly presents every product we kept, and closes with a summary table and our final pick.',
    pageReviewsIntro:
      'Every review is backed by at least 2 verified sources. The final score is a weighted average of per-criterion scores.',
    noComparisons:   'No comparisons published yet.',
    noReviews:       'No reviews published yet.',
    noGuides:        'No guides published yet.',
  },
};

export function t(market) {
  return strings[market] || strings.fr;
}

export default strings;
