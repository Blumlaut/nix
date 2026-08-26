/**
 * Colour theme management. The initial theme is set by the inline <head>
 * script (before paint); this module wires the toggle, persists the choice
 * and follows the OS preference until the user explicitly picks a theme.
 */
const KEY = 'theme';

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function storedTheme() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

// Follow the OS preference, but only until the user makes an explicit choice.
export function initTheme() {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (storedTheme() !== 'light' && storedTheme() !== 'dark') {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
      }
    });
  } catch { /* older browsers */ }
}
