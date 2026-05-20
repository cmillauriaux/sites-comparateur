export const IMAGE_SOURCES = {
  unsplash: {
    baseUrl: 'https://api.unsplash.com/search/photos',
    apiKey: process.env.UNSPLASH_ACCESS_KEY,
    license: 'Unsplash License (commercial OK, no attribution)',
    commercial: true,
  },
  pexels: {
    baseUrl: 'https://api.pexels.com/v1/search',
    apiKey: process.env.PEXELS_API_KEY,
    license: 'Pexels License (commercial OK)',
    commercial: true,
  },
  pixabay: {
    baseUrl: 'https://pixabay.com/api/',
    apiKey: process.env.PIXABAY_API_KEY,
    license: 'Pixabay License (commercial OK, no attribution)',
    commercial: true,
  },
};

export const IMAGE_QUERIES = {
  'jardin-bricolage': {
    hero: ['garden tools', 'bricolage tools', 'green garden'],
    categories: {
      tondeuse:   ['lawn mower garden', 'grass cutting'],
      perceuse:   ['drill tools workshop', 'power tools'],
      nettoyeur:  ['pressure washer cleaning', 'garden cleaning'],
      debroussailleuse: ['trimmer garden', 'grass trimmer'],
    },
  },
  'sport-fitness': {
    hero: ['fitness workout', 'sport equipment gym', 'running training'],
    categories: {
      'velo-elliptique': ['elliptical bike fitness', 'cardio gym'],
      'tapis-course':    ['treadmill running gym'],
      trottinette:       ['electric scooter urban', 'scooter city'],
      musculation:       ['weights gym dumbbell'],
    },
  },
  cuisine: {
    hero: ['kitchen cooking appliances', 'modern kitchen', 'cooking food'],
    categories: {
      'air-fryer':    ['air fryer cooking', 'fryer kitchen'],
      'robot-cuisine': ['kitchen robot food processor', 'cooking machine'],
      cafetiere:      ['coffee machine espresso', 'coffee kitchen'],
      blender:        ['blender smoothie kitchen'],
    },
  },
  'maison-elec': {
    hero: ['home appliances modern', 'smart home electronics', 'vacuum cleaner home'],
    categories: {
      aspirateur:     ['vacuum cleaner robot home', 'cleaning robot'],
      'radio-reveil': ['alarm clock bedroom', 'digital clock'],
      purificateur:   ['air purifier home', 'clean air home'],
      ventilateur:    ['fan home cooling'],
    },
  },
  solaire: {
    hero: ['solar panels house roof', 'solar energy home', 'photovoltaic panels'],
    categories: {
      solaire:           ['rooftop solar panels installation', 'solar panel home'],
      exterieur:         ['solar garden lights', 'outdoor garden lighting'],
      'volet-store':     ['house roller shutters facade', 'window shutters house'],
      materiaux:         ['wood panels workshop diy', 'plywood boards stack'],
      signalisation:     ['road traffic signs', 'construction safety signs'],
      'prix-renovation': ['house energy renovation', 'home insulation work'],
    },
  },
};
