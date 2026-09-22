import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Where nixes happen (#13).
 *
 * Renders the aggregated cells the API hands back — the client never sees a
 * single position, so this is a cell heat map, not a scatter plot. Cells are
 * drawn as squares of the exact size they were aggregated at, so what is on
 * screen is what the server is willing to publish.
 *
 * Mostly those squares are ~1.1 km; a nixer without enough company is only
 * published as a ~11 km one, which is why the size travels per cell.
 */

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Metres per degree of latitude — close enough to size the halo circles.
const METRES_PER_DEGREE = 111320;

// Low → high density. Chosen to read on both themes.
const RAMP = ['#4a9eff', '#22d3ee', '#51cf66', '#fbbf24', '#ef4444'];

export function heatColor(t) {
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.floor(t * RAMP.length)));
  return RAMP[i];
}

export default function NixHeatmap({ cells, cellDegrees = 0.01 }) {
  const container = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    const instance = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(instance);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);

    // The card reflows with the viewport; Leaflet only knows the size it was
    // created with.
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    if (!cells.length) return;

    const max = Math.max(...cells.map((c) => c.n));
    // Normalised 0..1 density per cell; n/max squashes the ramp, sqrt spreads it.
    const normalized = cells.map((cell) => ({ ...cell, t: Math.sqrt(cell.n / max) }));
    const bounds = L.latLngBounds([]);

    // Halos first, then the crisp cells on top: the overlap washes the busy
    // part of the office warmer without blurring the cell boundaries. Only
    // the fine cells get one — a coarse halo would cover the whole city.
    for (const cell of normalized) {
      const degrees = cell.degrees || cellDegrees;
      if (degrees !== cellDegrees) continue;
      L.circle([cell.lat, cell.lon], {
        radius: degrees * METRES_PER_DEGREE * 0.8,
        stroke: false,
        fillColor: heatColor(cell.t),
        fillOpacity: 0.08 + 0.16 * cell.t,
        interactive: false,
      }).addTo(group);
    }

    for (const cell of normalized) {
      const degrees = cell.degrees || cellDegrees;
      const half = degrees / 2;
      const rect = L.rectangle(
        [[cell.lat - half, cell.lon - half], [cell.lat + half, cell.lon + half]],
        {
          stroke: false,
          fillColor: heatColor(cell.t),
          fillOpacity: 0.25 + 0.55 * cell.t,
        },
      );
      const km = Math.round(degrees * METRES_PER_DEGREE / 1000);
      rect.bindTooltip(
        `${cell.n} nix${cell.n === 1 ? '' : 'es'} · ${cell.nixers} nixer${cell.nixers === 1 ? '' : 's'} · ~${km} km cell`,
      );
      rect.addTo(group);
      bounds.extend(rect.getBounds());
    }
    instance.fitBounds(bounds.pad(0.25), { maxZoom: 16 });
  }, [cells, cellDegrees]);

  return <div className="nix-map" ref={container} role="img" aria-label="Map of where nixes happen" />;
}
