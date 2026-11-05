// How the table looks. The match decides and everyone at it sees the same theme;
// this device remembers the last one so the page paints in it before the state arrives
// (see the inline script in each page's <head>) and new matches start with it.
const KEY = 'domino.theme';

// Same ids as THEMES in server/match.js. `bar` colors the phone's status bar.
export const THEMES = {
  felt: { bar: '#0b3a2c' },
  pencil: { bar: '#f4f0e6' },
  neon: { bar: '#05070f' },
  minimal: { bar: '#f6f6f4' },
  dark: { bar: '#0b0b0c' },
  halloween: { bar: '#0b0612' },
  christmas: { bar: '#4d0a0d' },
};
const DEFAULT = 'felt';

export const saved = () => (THEMES[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : DEFAULT);

/** Paint the page in a theme. One this page doesn't know (a newer deploy's) falls back to the default. */
export function use(id) {
  if (!THEMES[id]) id = DEFAULT;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[id].bar);
  localStorage.setItem(KEY, id);
}
