import { useMemo, useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from './muiTheme';
import { currentTheme } from './theme';

/**
 * Supplies the MUI theme, kept in sync with the app's theme toggle by
 * observing `documentElement[data-theme]`.
 */
export default function MuiProvider({ children }) {
  const [mode, setMode] = useState(() => currentTheme());

  useEffect(() => {
    const sync = () => setMode(currentTheme());
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
