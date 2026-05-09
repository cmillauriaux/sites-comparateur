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
      { name: 'Maniaques.fr',     url: 'https://maniaques.fr',                 scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Leroy Merlin',     url: 'https://www.leroymerlin.fr',           scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Castorama',        url: 'https://www.castorama.fr',             scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Mr Bricolage',     url: 'https://www.mr-bricolage.fr',          scrape: true,  useBrowser: true, trust: 'high',   type: 'specs' },
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
      { name: 'Popular Mechanics',    url: 'https://www.popularmechanics.com',    scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Family Handyman',      url: 'https://www.familyhandyman.com',      scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'The Spruce',           url: 'https://www.thespruce.com',           scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Home Depot',           url: 'https://www.homedepot.com',           scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Lowe\'s',              url: 'https://www.lowes.com',               scrape: true,  useBrowser: true, trust: 'high',   type: 'specs+avis' },
      { name: 'Husqvarna',            url: 'https://www.husqvarna.com/us',        scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'DeWalt',               url: 'https://www.dewalt.com',              scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'Milwaukee Tool',       url: 'https://www.milwaukeetool.com',       scrape: false, trust: 'high',  type: 'brand-specs' },
      { name: 'Amazon US',            url: 'https://www.amazon.com',              scrape: true,  trust: 'high',  type: 'price+avis' },
    ],
    gb: [
      { name: 'Which?',              url: 'https://www.which.co.uk',             scrape: true,  useBrowser: true, trust: 'high',   type: 'reviews' },
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
      { name: 'Que Choisir',                  url: 'https://www.quechoisir.org',           scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Les Numériques Cuisine',       url: 'https://www.lesnumeriques.com/cuisine', scrape: true,  trust: 'high',   type: 'reviews' },
      { name: '60 Millions de Consommateurs', url: 'https://www.60millions-mag.com',       scrape: true,  trust: 'high',   type: 'reviews' },
      { name: 'Cuisine Actuelle',             url: 'https://www.cuisineactuelle.fr',       scrape: true,  trust: 'medium', type: 'reviews' },
      { name: 'Darty',                        url: 'https://www.darty.com',                scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Boulanger',                    url: 'https://www.boulanger.com',            scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Fnac',                         url: 'https://www.fnac.com',                 scrape: true,  trust: 'high',   type: 'specs+avis' },
      { name: 'Amazon FR',                    url: 'https://www.amazon.fr',                scrape: true,  trust: 'high',   type: 'price+avis' },
      { name: 'Thermomix / Vorwerk',          url: 'https://www.vorwerk.com/fr-fr/produits/thermomix', scrape: false, trust: 'high', type: 'brand-specs' },
      { name: 'Kenwood',                      url: 'https://www.kenwoodworld.com/fr-fr',   scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Tefal',                        url: 'https://www.tefal.fr',                 scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Ninja Kitchen',                url: 'https://www.ninjakitchen.fr',          scrape: false, trust: 'high',   type: 'brand-specs' },
      { name: 'Instant Pot',                  url: 'https://www.instantpot.fr',            scrape: false, trust: 'high',   type: 'brand-specs' },
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
};

export function getSourcesFor(niche, market) {
  return sources?.[niche]?.[market] ?? [];
}

export default sources;
