export type Theme = 'light' | 'dark';

const themeKey = 'subsense_theme';
let selectedTheme: Theme | undefined;

// Appearance is a device preference, available before a wallet signs in.
export function readTheme(fallback: Theme = 'dark'): Theme {
  if (selectedTheme) return selectedTheme;
  try {
    const saved = localStorage.getItem(themeKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* The current page still remembers the choice without storage. */ }
  return fallback;
}

export function applyTheme(theme: Theme, remember = true) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  // A default login appearance must not replace an existing wallet preference.
  if (!remember) return;
  selectedTheme = theme;
  try { localStorage.setItem(themeKey, theme); }
  catch { /* Theme switching remains available when storage is blocked. */ }
}
