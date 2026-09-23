import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Where nixes happen (#13).
 *
 * One pin per aggregated cell: the tip sits on the cell, the number in the
 * head is how many nixes landed there, and the pin grows with it. The client
 * never sees a single position — the server only ever hands over cells.
 * Clicking a pin lists who nixed whom inside it. Thin data (down to a lone
 * fix) is published as a ~11 km area, which is why such pins are dashed.
 */

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Metres per degree of latitude — close enough to name a cell's size.
const METRES_PER_DEGREE = 111320;
const MIN_PIN = 26;
const MAX_PIN = 56;
// Density steps, styled in style.css off the theme's accent gradient.
const LEVELS = 5;
// The head is a square with three rounded corners, rotated 45°, so the sharp
// fourth corner becomes the tip: 1/√2 of the box sits below the head's centre.
const TIP_RATIO = Math.SQRT1_2;

function level(t) {
  return Math.min(LEVELS - 1, Math.max(0, Math.round(t * (LEVELS - 1))));
}

function pinPx(n, max) {
  return Math.round(MIN_PIN + Math.sqrt(n / max) * (MAX_PIN - MIN_PIN));
}

/**
 * Popup content as DOM nodes — names are user-supplied, so they must never be
 * interpolated into HTML.
 */
function popupNode(cell) {
  const wrap = document.createElement('div');
  wrap.className = 'nix-pop';

  const head = document.createElement('strong');
  const km = Math.round(cell.degrees * METRES_PER_DEGREE / 1000);
  head.textContent = `${cell.n} nix${cell.n === 1 ? '' : 'es'} · ${cell.nixers} nixer${cell.nixers === 1 ? '' : 's'} · ~${km} km area`;
  wrap.appendChild(head);

  const pairs = cell.pairs || [];
  if (pairs.length) {
    const list = document.createElement('ul');
    for (const p of pairs) {
      const li = document.createElement('li');
      const pair = document.createElement('span');
      pair.textContent = `${p.nixer} nixed ${p.target}`;
      const when = document.createElement('time');
      when.dateTime = p.at;
      when.textContent = p.at.slice(0, 10);
      li.append(pair, when);
      list.appendChild(li);
    }
    wrap.appendChild(list);
    if (cell.n > pairs.length) {
      const more = document.createElement('p');
      more.className = 'nix-pop-more';
      more.textContent = `Showing the latest ${pairs.length} of ${cell.n}.`;
      wrap.appendChild(more);
    }
  }

  return wrap;
}

export default function NixMap({ cells, cellDegrees = 0.01 }) {
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
    const bounds = L.latLngBounds([]);

    for (const cell of cells) {
      const size = pinPx(cell.n, max);
      const coarse = (cell.degrees || cellDegrees) > cellDegrees;
      const t = Math.sqrt(cell.n / max);
      const icon = L.divIcon({
        className: `nix-pin lvl-${level(t)}${coarse ? ' is-coarse' : ''}`,
        html: `<span style="width:${size}px;height:${size}px"><i>${cell.n}</i></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, Math.round(size / 2 + size * TIP_RATIO)],
      });
      L.marker([cell.lat, cell.lon], { icon, title: `${cell.n} nixes here` })
        .bindPopup(() => popupNode(cell), { minWidth: 200 })
        .addTo(group);
      bounds.extend([cell.lat, cell.lon]);
    }
    instance.fitBounds(bounds.pad(0.25), { maxZoom: 16 });
  }, [cells, cellDegrees]);

  return <div className="nix-map" ref={container} role="img" aria-label="Map of where nixes happen" />;
}
