export const NICHES = ['jardin-bricolage', 'sport-fitness', 'cuisine', 'maison-elec'];

export function isValidNiche(niche) {
  return NICHES.includes(niche);
}
