import { createTheme } from '@mui/material/styles';

/**
 * MUI theme that mirrors the app's custom design system (see style.css
 * `:root` variables) so library components blend with the existing look.
 * Built per theme-mode; the mode is derived from `documentElement[data-theme]`.
 */
export function buildTheme(mode) {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#7c9aff' : '#3d5afe' },
      secondary: { main: dark ? '#b39dff' : '#8250ff' },
      background: {
        default: dark ? '#141822' : '#f3f5fa',
        paper: dark ? '#1c2230' : '#ffffff',
      },
      divider: dark ? '#303a50' : '#e1e6ef',
      text: {
        primary: dark ? '#eef1f7' : '#161a21',
        secondary: dark ? '#a6b0c5' : '#5b6575',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 14 },
        },
      },
    },
  });
}
