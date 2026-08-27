import { Avatar } from '@mui/material';

/**
 * User avatar: the Discord CDN image when available, otherwise a
 * letter-initial fallback styled like the rest of the app.
 *
 * @param {string} name   display name (drives the letter fallback)
 * @param {string} src    avatar image URL, or null/undefined for the fallback
 * @param {number} size   square size in px
 */
export default function UserAvatar({ name, src, size = 34, sx }) {
  const base = { width: size, height: size, flexShrink: 0, ...sx };
  if (src) {
    return <Avatar src={src} alt={`${name || 'user'} avatar`} sx={base} />;
  }
  return (
    <Avatar sx={{ ...base, bgcolor: 'primary.main', fontSize: size * 0.47, fontWeight: 700 }}>
      {(name || '?')[0].toUpperCase()}
    </Avatar>
  );
}
