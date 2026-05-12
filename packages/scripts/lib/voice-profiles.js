/**
 * Per-niche editorial voice profiles consumed by prompts.js.
 *
 * The market filter (FR vs EN, isFrMarket branching) handles spelling and
 * the reference outlet. THIS file overlays a niche-specific fingerprint on
 * top: sentence rhythm, opening patterns, technical level, lexical
 * preferences, and section ordering. Goal: make jardin-bricolage articles
 * read differently from sport-fitness articles in a measurable way (not
 * just colour/typo difference — actual prose difference) so the 12 sites
 * don't share a prose fingerprint that Google can cluster.
 *
 * Adding a niche: copy an existing block, change every field. Generic
 * defaults are NOT provided — silently falling back is worse than failing
 * loud when a new niche ships without an explicit profile.
 */

export const VOICE_PROFILES = {
  'jardin-bricolage': {
    sentenceRhythm: 'long-and-considered',
    rhythmHint: "phrases d'inspection : 15-30 mots dominantes, parsemées de 5-8 mots brèves pour trancher",
    preferredOpenings: [
      'Choisir un {KEYWORD}, ce n\'est pas seulement comparer des watts ou des centimètres.',
      'Sur le marché actuel du {KEYWORD}, deux familles cohabitent et chacune répond à un usage distinct.',
      'Pour qui veut un {KEYWORD} qui tient dix ans plutôt que deux, le tri commence avant la marque.',
    ],
    forbiddenOpenings: [
      'Dans cet article',
      "Aujourd'hui",
      'Vous cherchez',
      'Si vous êtes à la recherche',
    ],
    technicalLevel: 'expert-pragmatic',
    technicalHint: 'jargon technique autorisé (couple en N·m, autonomie en m² par charge, niveau IPX) mais explicité en passant',
    structuralPreferences: {
      openWith: 'criteria',           // criteria | products | context
      verdictPlacement: 'after-table',
    },
    lexicalAvoid: ['révolutionnaire', 'incroyable', 'magique', 'game-changer', 'bluffant', 'innovant'],
    lexicalPreferred: ['fiable', 'éprouvé', 'durable', 'solide', 'cohérent', 'pertinent', 'défendable'],
  },

  'sport-fitness': {
    sentenceRhythm: 'short-and-energetic',
    rhythmHint: 'phrases courtes 6-15 mots majoritaires, longues 20-25 réservées aux passages techniques',
    preferredOpenings: [
      'Performance avant tout.',
      'Les chiffres parlent : pour un {KEYWORD}, trois métriques font le tri.',
      'On a confronté les modèles de {KEYWORD} aux usages réels — voici ce qui tient debout.',
    ],
    forbiddenOpenings: [
      'Dans cet article',
      'Si vous voulez vous mettre au sport',
      'Le sport est',
    ],
    technicalLevel: 'metric-driven',
    technicalHint: 'omniprésence des chiffres mesurables (VO₂max, BPM zone, watts, ratio poids/puissance), peu d\'adjectifs subjectifs',
    structuralPreferences: {
      openWith: 'products',
      verdictPlacement: 'end',
    },
    lexicalAvoid: ['confortable', 'agréable', 'plaisant', 'ludique'],
    lexicalPreferred: ['mesuré', 'chronométré', 'validé en condition', 'reproductible', 'quantifiable'],
  },

  'cuisine': {
    sentenceRhythm: 'descriptive-sensory',
    rhythmHint: 'phrases moyennes 12-22 mots, ponctuées d\'incises descriptives ; éviter le télégraphique',
    preferredOpenings: [
      'En cuisine, un {KEYWORD} qui fait son travail discrètement vaut mieux qu\'un modèle vedette posé sur le plan de travail.',
      'Le bon {KEYWORD} se reconnaît à ce qu\'on l\'oublie pendant qu\'on cuisine.',
      'Acheter un {KEYWORD}, c\'est arbitrer entre la place qu\'il prendra et la fréquence à laquelle on l\'utilisera vraiment.',
    ],
    forbiddenOpenings: [
      'Dans cet article',
      'Vous êtes passionné de cuisine',
      'La cuisine est un art',
    ],
    technicalLevel: 'sensory-precise',
    technicalHint: 'références sensorielles concrètes (texture, montée en température, brunissage Maillard) liées à des grandeurs mesurables (°C, secondes, watts)',
    structuralPreferences: {
      openWith: 'context',
      verdictPlacement: 'after-products',
    },
    lexicalAvoid: ['délicieux', 'savoureux', 'gourmand', 'irrésistible', 'extraordinaire'],
    lexicalPreferred: ['homogène', 'régulier', 'précis', 'maîtrisé', 'reproductible', 'net'],
  },

  'maison-elec': {
    sentenceRhythm: 'lab-bench-clinical',
    rhythmHint: 'phrases denses 18-30 mots, structure sujet-verbe-complément stricte ; pas de digressions',
    preferredOpenings: [
      'Sur le papier, les {KEYWORD} se ressemblent ; à l\'usage, deux ou trois critères séparent l\'utile du superflu.',
      'Un {KEYWORD} se juge moins à sa fiche technique qu\'à la cohérence de ses choix d\'ingénierie.',
      'Les écarts entre {KEYWORD} se logent rarement dans la puissance affichée — plutôt dans la consommation réelle et le bruit mesuré.',
    ],
    forbiddenOpenings: [
      'Dans cet article',
      "Aujourd'hui",
      'L\'électroménager moderne',
    ],
    technicalLevel: 'lab-bench',
    technicalHint: 'spec sheet pure : dB(A), kWh/an, classe énergétique, watts crête vs nominaux ; pas d\'analogie domestique',
    structuralPreferences: {
      openWith: 'criteria',
      verdictPlacement: 'after-table',
    },
    lexicalAvoid: ['silencieux comme un chuchotement', 'comme à la maison', 'design élégant'],
    lexicalPreferred: ['mesurable', 'documenté', 'conforme', 'reproductible', 'pondéré'],
  },
};

/**
 * Deterministic pick from an array given a seed string (typically the
 * article slug). Same input → same output, so re-runs of the generator
 * don't produce different openings for the same article. Different slugs
 * spread across the array so the first 'preferredOpening' isn't injected
 * into 90% of articles.
 */
export function pickByHash(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

/**
 * Build the prompt block injected after the editorial-voice section. The
 * block is intentionally formatted like the other ==== sections of
 * prompts.js so the LLM treats it with the same weight. Pass `keyword`
 * so {KEYWORD} placeholders in openings get substituted; pass `slug` so
 * the opening selection is stable across re-runs.
 */
export function buildVoiceBlock({ niche, keyword, slug, lang = 'fr' }) {
  const profile = VOICE_PROFILES[niche];
  if (!profile) return '';

  const opening = pickByHash(profile.preferredOpenings, slug)?.replace(/{KEYWORD}/g, keyword) ?? '';
  const forbidden = profile.forbiddenOpenings.map(s => `"${s}"`).join(', ');
  const avoid = profile.lexicalAvoid.map(s => `"${s}"`).join(', ');
  const prefer = profile.lexicalPreferred.map(s => `"${s}"`).join(', ');

  if (lang === 'fr') {
    return `\
==========================================
VOIX SPÉCIFIQUE À LA NICHE — APPLIQUER STRICTEMENT
==========================================
RYTHME : ${profile.rhythmHint}
NIVEAU TECHNIQUE : ${profile.technicalHint}

OUVERTURE — inspire-toi du modèle suivant (ton et structure d'attaque, pas
copier mot pour mot) :
  « ${opening} »
N'OUVRE JAMAIS l'article par : ${forbidden}.

LEXIQUE :
  - À ÉVITER (mots vides ou marketing pour cette niche) : ${avoid}
  - À PRIVILÉGIER (vocabulaire qui ancre l'expertise) : ${prefer}

STRUCTURE — préférence pour cette niche :
  - Ouvre la partie analytique par : ${profile.structuralPreferences.openWith}
    (criteria = liste des critères d'achat avant les produits ; products =
    produits d'abord, critères en regard ; context = mise en contexte de
    l'usage avant tout).
  - Place le verdict : ${profile.structuralPreferences.verdictPlacement}.
Cette structure se superpose à STRUCTURE plus haut ; en cas d'ambiguïté,
elle l'emporte.
`;
  }

  return `\
==========================================
NICHE-SPECIFIC VOICE — APPLY STRICTLY
==========================================
RHYTHM: ${profile.rhythmHint}
TECHNICAL LEVEL: ${profile.technicalHint}

OPENING — model the tone and attack of this example (don't copy verbatim):
  "${opening}"
NEVER open the article with: ${forbidden}.

LEXICON:
  - AVOID (empty or marketing words for this niche): ${avoid}
  - PREFER (expertise-anchoring vocabulary): ${prefer}

STRUCTURE — niche preference:
  - Open the analytical section with: ${profile.structuralPreferences.openWith}
    (criteria = list buying criteria before products; products = products
    first, criteria alongside; context = situate the use case first).
  - Place the verdict: ${profile.structuralPreferences.verdictPlacement}.
This overrides STRUCTURE above when they conflict.
`;
}
