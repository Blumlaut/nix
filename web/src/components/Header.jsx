import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { IconButton, Tooltip, Menu, MenuItem, Divider, Box, Typography } from '@mui/material';
import { api } from '../api';
import { currentTheme, toggleTheme } from '../theme';
import UserAvatar from './UserAvatar';

const NAV = [
  { to: '/', label: 'Board', end: true },
  { to: '/stats', label: 'Stats' },
  { to: '/rules', label: 'Rules' },
  { to: '/changelog', label: 'Changelog' },
];

export default function Header() {
  const [me, setMe] = useState(null);
  const [level, setLevel] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    api('/api/me').then((r) => {
      if (r && r.data.name) {
        setMe(r.data);
        api('/api/xp').then((x) => x && setLevel(x.data.level));
      }
    });
  }, []);

  const open = Boolean(anchorEl);

  return (
    <header>
      <Link className="brand" to="/">NIX<span>.scoreboard</span></Link>
      <nav className="nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
        ))}
      </nav>
      <Box className="hdr-right" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title="Toggle theme">
          <IconButton
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {currentTheme() === 'dark' ? <SunIcon /> : <MoonIcon />}
          </IconButton>
        </Tooltip>
        <Box>
          <Tooltip title="Account">
            <IconButton
              aria-label="Account"
              aria-haspopup="true"
              aria-expanded={open}
              onClick={(e) => setAnchorEl(e.currentTarget)}
            >
              <UserAvatar name={me ? me.name : null} src={me ? me.avatar : null} size={34} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={() => setAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem disabled>
              <Box>
                <Typography variant="subtitle2">{me ? me.name : '…'}</Typography>
                {level && <Typography variant="caption" color="text.secondary">Lvl {level}</Typography>}
              </Box>
            </MenuItem>
            {me && <MenuItem component={Link} to={`/user/${me.id}`} onClick={() => setAnchorEl(null)}>Profile</MenuItem>}
            <MenuItem component={Link} to="/settings" onClick={() => setAnchorEl(null)}>Settings</MenuItem>
            <Divider />
            <MenuItem component="a" href="/logout">Logout</MenuItem>
          </Menu>
        </Box>
      </Box>
    </header>
  );
}

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
