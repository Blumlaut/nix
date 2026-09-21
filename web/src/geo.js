/**
 * Browser position for the nix form (#13).
 *
 * Recording is opt-out: a denied permission, an unavailable API or a slow
 * lookup all resolve to `null` and the nix is sent without a location. The
 * fix is cached briefly so a burst of nixes does not wait on the browser
 * each time.
 */
const CACHE_MS = 300_000;

let cached = null; // { at, fix }

function lookup() {
  return new Promise((resolve) => {
    try {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        () => resolve(null),
        { enableHighAccuracy: false, maximumAge: CACHE_MS, timeout: 2000 },
      );
    } catch {
      resolve(null);
    }
    return undefined;
  });
}

/** @returns {Promise<{lat: number, lon: number, accuracy: number}|null>} */
export async function currentFix() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.fix;
  const fix = await lookup();
  cached = { at: Date.now(), fix };
  return fix;
}
