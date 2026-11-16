// The look plan, in one place. A dusk container yard: deep blue-grey night air, warm
// amber floodlights, rusted steel. The same names are the CSS custom properties in
// index.html. Team colours are the only additions: amber for Vanguard, teal for Sentinel.
export const PALETTE = {
  canvas: '#10141c',
  surface: '#1a2029',
  hairline: '#2a323e',
  ink: '#ece8dd',
  muted: '#8b95a3',
  accent: '#f2a93b',
  vanguard: '#f2a93b',
  sentinel: '#3fb8a6',
  danger: '#e5484d',
  skyTop: '#0d1526',
  skyHorizon: '#e8803c',
  ground: '#3a3f46',
  containerA: '#a4522e',
  containerB: '#2e6d7a',
  containerC: '#6b7a3a',
  crateWood: '#8a6b45',
  wall: '#4a5058',
};

export function shade(name) {
  return PALETTE[name];
}
