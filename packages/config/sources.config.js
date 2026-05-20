/**
 * Whitelisted sources per (niche, market). The article-generator scrapes ONLY
 * these domains for the matching market; anything else is treated as an
 * external link, not a fact source.
 *
 * Keys:
 *   trust:      high | medium | low
 *   scrape:     true | false       (false = brand specs reserved for manual reference)
 *   useBrowser: true               (skip fetch, go directly via Playwright — for
 *                                   sites with WAFs that 403 on plain HTTP)
 *   type:       reviews | specs | price+avis | brand-specs | specs+avis | specs+guide
 */

const sources = {
  'jardin-bricolage': {
    fr: [
      { name: 'Que Choisir',      url: 'https://www.quechoisir.org',           scrape: true,  useBrowser: true, trust: 'high',   type: 'reviews' },
      { name: 'Les Numériques',   url: 'https://www.lesnumeriques.com',        scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Maniaques.fr',     url: 'https://maniaques.fr',                 scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Zone Outillage',   url: 'https://www.zone-outillage.fr',        scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Le Bricoleur',     url: 'https://le-bricoleur.fr',              scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Futura Sciences',  url: 'https://www.futura-sciences.com',      scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Jardinage Media',  url: 'https://www.jardinage-media.com',      scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Castorama',        url: 'https://www.castorama.fr',             scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Cdiscount',        url: 'https://www.cdiscount.com',            scrape: true,  useBrowser: true, trust: 'medium', type: 'specs+avis' },
      { name: 'Bosch Pro',        url: 'https://www.bosch-professional.com/fr', scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'Makita',           url: 'https://www.makita.fr',                scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Husqvarna',        url: 'https://www.husqvarna.com/fr',         scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Karcher',          url: 'https://www.kaercher.com/fr',          scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Amazon FR',        url: 'https://www.amazon.fr',                scrape: true,  trust: 'high',   type: 'price+avis' },
    ],
    us: [
      { name: 'Wirecutter',           url: 'https://www.nytimes.com/wirecutter',  scrape: true,  useBrowser: true, trust: 'high',   type: 'reviews' },
      { name: 'Consumer Reports',     url: 'https://www.consumerreports.org',     scrape: true,  useBrowser: true, trust: 'high',   type: 'reviews' },
      { name: 'Bob Vila',             url: 'https://www.bobvila.com',             scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'This Old House',       url: 'https://www.thisoldhouse.com',        scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Popular Mechanics',    url: 'https://www.popularmechanics.com',    scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Family Handyman',      url: 'https://www.familyhandyman.com',      scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'The Spruce',           url: 'https://www.thespruce.com',           scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Home Depot',           url: 'https://www.homedepot.com',           scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Lowe\'s',              url: 'https://www.lowes.com',               scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Husqvarna',            url: 'https://www.husqvarna.com/us',        scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'DeWalt',               url: 'https://www.dewalt.com',              scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'Milwaukee Tool',       url: 'https://www.milwaukeetool.com',       scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'Amazon US',            url: 'https://www.amazon.com',              scrape: true,  trust: 'high',  type: 'price+avis' },
    ],
    gb: [
      { name: 'Which?',              url: 'https://www.which.co.uk',             scrape: true,  useBrowser: true, trust: 'high',   type: 'reviews' },
      { name: 'Gardeners\' World',   url: 'https://www.gardenersworld.com',      scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'My Green Shed',       url: 'https://www.mygreenshed.co.uk',       scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Trusted Reviews',     url: 'https://www.trustedreviews.com',      scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Expert Reviews',      url: 'https://www.expertreviews.co.uk',     scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'TechRadar',           url: 'https://www.techradar.com',           scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'B&Q',                 url: 'https://www.diy.com',                 scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Screwfix',            url: 'https://www.screwfix.com',            scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Wickes',              url: 'https://www.wickes.co.uk',            scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Husqvarna UK',        url: 'https://www.husqvarna.com/uk',        scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'DeWalt UK',           url: 'https://www.dewalt.co.uk',            scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'Bosch DIY UK',        url: 'https://www.bosch-diy.com/gb',        scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'Amazon UK',           url: 'https://www.amazon.co.uk',            scrape: true,  trust: 'high',  type: 'price+avis' },
    ],
  },

  'sport-fitness': {
    fr: [
      { name: 'Que Choisir',           url: 'https://www.quechoisir.org',                  scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Les Numériques Sport',  url: 'https://www.lesnumeriques.com/sport',         scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Sport Passion',         url: 'https://www.sport-passion.fr/test-materiel',  scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Running Heroes',        url: 'https://runningheroes.com/fr',                scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Décathlon',             url: 'https://www.decathlon.fr',                    scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Fitness Boutique',      url: 'https://www.fitnessboutique.fr',              scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Sport 2000',            url: 'https://www.sport2000.fr',                    scrape: true,  trust: 'high',   type: 'specs' },
      { name: 'Go Sport',              url: 'https://www.go-sport.com',                    scrape: true,  trust: 'high',   type: 'specs' },
      { name: 'Fitness Digital',       url: 'https://www.fitnessdigital.fr',               scrape: true,  trust: 'medium', type: 'specs+guide' },
      { name: 'NordicTrack',           url: 'https://www.nordictrack.fr',                  scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Garmin',                url: 'https://www.garmin.com/fr-FR',                scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Polar',                 url: 'https://www.polar.com/fr',                    scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Amazon FR',             url: 'https://www.amazon.fr',                       scrape: true,  trust: 'high',   type: 'price+avis' },
    ],
    us: [],
    gb: [],
  },

  cuisine: {
    fr: [
      { name: 'Que Choisir',                  url: 'https://www.quechoisir.org',                 scrape: true,  useBrowser: true, trust: 'high',   type: 'reviews' },
      { name: 'Les Numériques Cuisine',       url: 'https://www.lesnumeriques.com/cuisine',      scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Labo Maison',                  url: 'https://labomaison.com',                     scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Meilleurs.fr',                 url: 'https://www.meilleurs.fr',                   scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Le Monde Accessoires',         url: 'https://www.lemonde.fr/accessoires',         scrape: true,  trust: 'high',   type: 'reviews' },
      { name: '60 Millions de Consommateurs', url: 'https://www.60millions-mag.com',             scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Cuisine Actuelle',             url: 'https://www.cuisineactuelle.fr',             scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Electroménager Compare',       url: 'https://www.electromenager-compare.com',     scrape: true,  trust: 'medium', type: 'specs' },
      { name: 'Darty',                        url: 'https://www.darty.com',                      scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Boulanger',                    url: 'https://www.boulanger.com',                  scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Fnac',                         url: 'https://www.fnac.com',                       scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Amazon FR',                    url: 'https://www.amazon.fr',                      scrape: true,  trust: 'high',   type: 'price+avis' },
      { name: 'Thermomix / Vorwerk',          url: 'https://www.vorwerk.com/fr-fr/produits/thermomix', scrape: false, trust: 'high', type: 'brand-specs' },
      { name: 'Kenwood',                      url: 'https://www.kenwoodworld.com/fr-fr',         scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Tefal',                        url: 'https://www.tefal.fr',                       scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Ninja Kitchen',                url: 'https://www.ninjakitchen.fr',                scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Instant Pot',                  url: 'https://www.instantpot.fr',                  scrape: false, trust: 'high',   type: 'brand-specs' },
    ],
    us: [],
    gb: [],
  },

  'maison-elec': {
    fr: [
      { name: 'Que Choisir',                  url: 'https://www.quechoisir.org',         scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Les Numériques',               url: 'https://www.lesnumeriques.com',      scrape: true,  trust: 'high',   type: 'reviews' },
      { name: '60 Millions de Consommateurs', url: 'https://www.60millions-mag.com',     scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'LaboMaison',                   url: 'https://labomaison.com/comparatifs', scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Electroguide',                 url: 'https://www.electroguide.com',       scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Darty',                        url: 'https://www.darty.com',              scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Boulanger',                    url: 'https://www.boulanger.com',          scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Fnac',                         url: 'https://www.fnac.com',               scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Amazon FR',                    url: 'https://www.amazon.fr',              scrape: true,  trust: 'high',   type: 'price+avis' },
      { name: 'Dyson',                        url: 'https://www.dyson.fr',               scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Philips',                      url: 'https://www.philips.fr',             scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Rowenta',                      url: 'https://www.rowenta.fr',             scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'iRobot',                       url: 'https://www.irobot.fr',              scrape: false, trust: 'high',   type: 'brand-specs' },
    ],
    us: [],
    gb: [],
  },

  // toutsolaire.fr — solaire grand public, matériaux bricolage, signalisation.
  // Editorial/institutional sources are the grounding floor (ADEME, France
  // Rénov', photovoltaique.info/Hespul, Que Choisir, 60M); retailers add
  // price/specs. Brand sites are reference-only (scrape:false).
  solaire: {
    fr: [
      { name: 'Que Choisir',          url: 'https://www.quechoisir.org',                       scrape: true,  useBrowser: true, trust: 'high',   type: 'reviews' },
      { name: 'Les Numériques',       url: 'https://www.lesnumeriques.com',                    scrape: true,  trust: 'high',   type: 'reviews' },
      { name: '60 Millions de Consommateurs', url: 'https://www.60millions-mag.com',           scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Photovoltaïque.info',  url: 'https://www.photovoltaique.info',                  scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'ADEME',                url: 'https://www.ademe.fr',                             scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'France Rénov\'',       url: 'https://www.france-renov.gouv.fr',                 scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'Actu-Environnement',   url: 'https://www.actu-environnement.com',               scrape: true,  trust: 'high',   type: 'reviews' },
      // Broad editorial publications (fetch-first, default /?s= search). These
      // cover the long-tail blog topics that the energy/renovation institutions
      // above don't — garden lighting, DIY panels, deco — so a cluster like
      // "guirlande solaire jardin" reaches enough relevant grounding.
      // type:'reviews' is REQUIRED to enable the 2-hop SERP→article fetch in
      // scrape.js — without it the scraper only reads the search-results
      // listing (thin/irrelevant) instead of the actual article prose.
      { name: 'Futura',               url: 'https://www.futura-sciences.com',                  scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Système D',            url: 'https://www.systeme-d.fr',                         scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Gerbeaud',             url: 'https://www.gerbeaud.com',                         scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Révolution Énergétique', url: 'https://www.revolution-energetique.com',         scrape: true,  trust: 'medium', type: 'reviews' },
      { name: '18h39 (Leroy Merlin)', url: 'https://www.18h39.fr',                             scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'ManoMano',             url: 'https://www.manomano.fr',                          scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Leroy Merlin',         url: 'https://www.leroymerlin.fr',                       scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Cdiscount',            url: 'https://www.cdiscount.com',                        scrape: true,  useBrowser: true, trust: 'medium', type: 'specs+avis' },
      { name: 'Amazon FR',            url: 'https://www.amazon.fr',                            scrape: true,  trust: 'high',   type: 'price+avis' },
      { name: 'Beem Energy',          url: 'https://beemenergy.fr',                            scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'EcoFlow',              url: 'https://www.ecoflow.com/fr',                       scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Bluetti',              url: 'https://www.bluetti.fr',                           scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Somfy',                url: 'https://www.somfy.fr',                             scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Sunology',             url: 'https://sunology.eu',                              scrape: false, trust: 'high',   type: 'brand-specs' },
    ],
    us: [],
    gb: [],
  },

  // toutveto.fr — assurance santé animale + tarifs vétérinaires + santé animale.
  // YMYL/santé : la grounding floor repose sur les sources institutionnelles
  // et professionnelles (SNVEL, ONV, écoles vétérinaires, ANSES, Légifrance,
  // FACCO) — aucun chiffre/tarif/fait médical ne doit être inventé. Les sites
  // d'assureurs sont reference-only (scrape:false) : à consulter pour les CG,
  // jamais comme source factuelle neutre.
  veto: {
    fr: [
      // Institutionnel & professionnel (priorité 1 — grounding floor santé)
      { name: 'SNVEL',                url: 'https://www.snvel.fr',                  scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'Ordre des Vétérinaires', url: 'https://www.veterinaire.fr',          scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'AFVAC',                url: 'https://www.afvac.com',                 scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'ANSES',                url: 'https://www.anses.fr',                  scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'Ministère Agriculture', url: 'https://agriculture.gouv.fr',          scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'I-CAD',                url: 'https://www.i-cad.fr',                  scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'Légifrance',           url: 'https://www.legifrance.gouv.fr',        scrape: true,  trust: 'high',   type: 'specs+guide' },
      // Écoles nationales vétérinaires (dispensaires, tarifs, publications)
      { name: 'ENVA Maisons-Alfort',  url: 'https://www.vet-alfort.fr',             scrape: true,  trust: 'high',   type: 'specs+guide' },
      { name: 'Oniris Nantes',        url: 'https://www.oniris-nantes.fr',          scrape: true,  trust: 'high',   type: 'specs+guide' },
      // Données marché & presse (priorité 2-3)
      { name: 'FACCO',                url: 'https://www.facco.fr',                  scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'France Assureurs',     url: 'https://www.franceassureurs.fr',        scrape: true,  trust: 'high',   type: 'reviews' },
      { name: '60 Millions de Consommateurs', url: 'https://www.60millions-mag.com', scrape: true, trust: 'high',  type: 'reviews' },
      { name: 'Que Choisir',          url: 'https://www.quechoisir.org',            scrape: true,  useBrowser: true, trust: 'high', type: 'reviews' },
      { name: '30 Millions d\'Amis',  url: 'https://www.30millionsdamis.fr',        scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Wamiz',                url: 'https://wamiz.com',                     scrape: true,  trust: 'medium', type: 'reviews' },
      // Cross-sell accessoires/alimentation (Hub 4)
      { name: 'Zooplus',              url: 'https://www.zooplus.fr',                scrape: true,  useBrowser: true, trust: 'medium', type: 'specs+avis' },
      { name: 'Wanimo',               url: 'https://www.wanimo.com',                scrape: true,  trust: 'medium', type: 'specs+avis' },
      { name: 'Amazon FR',            url: 'https://www.amazon.fr',                 scrape: true,  trust: 'high',   type: 'price+avis' },
      // Assureurs — reference-only (CG, formules) — NE PAS traiter comme neutre
      { name: 'SantéVet',             url: 'https://www.santevet.com',              scrape: false, trust: 'medium', type: 'brand-specs' },
      { name: 'Lassie',               url: 'https://fr.lassie.co',                  scrape: false, trust: 'medium', type: 'brand-specs' },
      { name: 'Acheel',               url: 'https://www.acheel.com',                scrape: false, trust: 'medium', type: 'brand-specs' },
      { name: 'Dalma',                url: 'https://www.dalma.co',                  scrape: false, trust: 'medium', type: 'brand-specs' },
      { name: 'Goodflair',            url: 'https://www.goodflair.com',             scrape: false, trust: 'medium', type: 'brand-specs' },
    ],
    us: [],
    gb: [],
  },
};

export function getSourcesFor(niche, market) {
  return sources?.[niche]?.[market] ?? [];
}

export default sources;
