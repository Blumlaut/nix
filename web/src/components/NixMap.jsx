import { useCallback, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Where nixes happen (#13).
 *
 * One pin per aggregated cell: a map pin whose tip sits on the cell, with the
 * count in the head, growing with the number of nixes. The client never sees a
 * single position — the server only ever hands over cells. Clicking a pin
 * lists who nixed whom inside it. Thin data (down to a lone fix) is published
 * as a ~11 km area, which is why such pins carry a dashed outline.
 *
 * Cells whose pins would sit within a pin's width of each other are drawn as
 * one merged pin while zoomed out and split apart again as you zoom in.
 * Merging only ever groups cells the server already published, so it cannot
 * reveal anything finer than the cells themselves do.
 */

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Metres per degree of latitude — close enough to name a cell's size.
const METRES_PER_DEGREE = 111320;
// Pin box in px (the mask in style.css is 14:20, so a pin is taller than it is
// wide and reads as a pin rather than a dot).
const MIN_PIN = 24;
const MAX_PIN = 40;
const PIN_RATIO = 0.7;
// Cells closer than this on screen are drawn as one pin.
const MERGE_PX = 44;
// How far past a single pin a merged one may grow, at most.
const MERGE_BOOST = 1.25;
// Density steps, styled in style.css off the theme's accent gradient.
const LEVELS = 5;

function level(t) {
  return Math.min(LEVELS - 1, Math.max(0, Math.round(t * (LEVELS - 1))));
}

/**
 * The pin for a count: height grows with the count relative to the busiest
 * cell on screen, width follows the mask's ratio.
 */
function pinIcon(n, max, { coarse = false, merged = false } = {}) {
  const t = Math.min(merged ? MERGE_BOOST : 1, Math.sqrt(n / max));
  const h = Math.round(MIN_PIN + t * (MAX_PIN - MIN_PIN));
  const w = Math.round(h * PIN_RATIO);
  return L.divIcon({
    className: `nix-pin lvl-${level(t)}${coarse ? ' is-coarse' : ''}${merged ? ' is-cluster' : ''}`,
    html: `<span style="width:${w}px;height:${h}px;--pin-h:${h}px"><i>${n}</i>${merged ? '<b></b>' : ''}</span>`,
    iconSize: [w, h],
    // The mask's tip is the bottom centre of the box, which is the cell.
    iconAnchor: [Math.round(w / 2), h],
  });
}

/** Screen distance between two cells at a zoom level, in px. */
function pixelGap(instance, a, b, zoom) {
  return instance.project([a.lat, a.lon], zoom)
    .distanceTo(instance.project([b.lat, b.lon], zoom));
}

/**
 * Greedy grouping by screen distance: a cell joins the first group it lands
 * within a pin's width of, so the same zoom always yields the same pins.
 */
function groupCells(instance, cells, zoom) {
  const groups = [];
  for (const cell of cells) {
    const near = groups.find((g) => pixelGap(instance, g.anchor, cell, zoom) < MERGE_PX);
    if (near) near.cells.push(cell);
    else groups.push({ anchor: cell, cells: [cell] });
  }
  return groups;
}

/**
 * The zoom at which a group's cells stand far enough apart to be drawn on
 * their own, or null when no zoom can split them (they share a centre).
 */
function splitZoom(instance, group) {
  for (let zoom = instance.getZoom() + 1; zoom <= instance.getMaxZoom(); zoom++) {
    // The anchor is at zero distance from itself, so it never counts.
    const apart = group.cells.every((cell) => cell === group.anchor
      || pixelGap(instance, group.anchor, cell, zoom) >= MERGE_PX);
    if (apart) return zoom;
  }
  return null;
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

/** Merged pin that no zoom can split: its popup lists each area in turn. */
function mergedPopupNode(cells) {
  const wrap = document.createElement('div');
  for (const cell of cells) {
    const block = document.createElement('div');
    block.className = 'nix-pop-area';
    block.appendChild(popupNode(cell));
    wrap.appendChild(block);
  }
  return wrap;
}

/** One published cell, as a pin sitting on it. */
function addCellMarker(pins, cell, max, cellDegrees) {
  const coarse = (cell.degrees || cellDegrees) > cellDegrees;
  L.marker([cell.lat, cell.lon], {
    icon: pinIcon(cell.n, max, { coarse }),
    title: `${cell.n} nixes here`,
  })
    .bindPopup(() => popupNode(cell), { minWidth: 200 })
    .addTo(pins);
}

/**
 * One pin for several cells sitting too close to tell apart. `split` is the
 * zoom that separates them — clicking zooms there; a null `split` (they share
 * a centre) has nowhere to zoom, so it opens a popup listing each area.
 */
function addMergedMarker(instance, pins, group, max, cellDegrees, split) {
  const cells = group.cells;
  const n = cells.reduce((sum, c) => sum + c.n, 0);
  const bounds = L.latLngBounds(cells.map((c) => [c.lat, c.lon]));
  const areas = `${n} nixes in ${cells.length} areas`;
  const coarse = cells.every((c) => (c.degrees || cellDegrees) > cellDegrees);
  const marker = L.marker(bounds.getCenter(), {
    icon: pinIcon(n, max, { coarse, merged: true }),
    title: split === null ? areas : `${areas} — click to zoom in`,
  });
  if (split === null) marker.bindPopup(() => mergedPopupNode(cells), { minWidth: 200 });
  else marker.on('click', () => instance.fitBounds(bounds.pad(0.1), { maxZoom: split }));
  marker.addTo(pins);
}

export default function NixMap({ cells, cellDegrees = 0.01 }) {
  const container = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const data = useRef([]);
  const cellSize = useRef(cellDegrees);
  const painting = useRef(false);

  /**
   * Paint the pins for the cells at the current zoom. `fit` is only set when
   * the data changed — zooming in and out must not re-frame the map.
   */
  const draw = useCallback((fit = false) => {
    const instance = map.current;
    const pins = layer.current;
    // fitBounds can fire zoomend synchronously, right before it animates: that
    // redraw would paint on top of the pins the caller is about to add, and it
    // would only repeat the same zoom anyway.
    if (!instance || !pins || painting.current) return;
    painting.current = true;
    try {
      pins.clearLayers();

      const list = data.current;
      if (!list.length) return;

      const bounds = L.latLngBounds(list.map((c) => [c.lat, c.lon]));
      if (fit) instance.fitBounds(bounds.pad(0.25), { maxZoom: 16 });

      const max = Math.max(...list.map((c) => c.n));
      for (const group of groupCells(instance, list, instance.getZoom())) {
        if (group.cells.length === 1) {
          addCellMarker(pins, group.cells[0], max, cellSize.current);
          continue;
        }
        // A ~1 km cell can sit exactly on the ~11 km cell around it, which no
        // zoom can separate (splitZoom is then null and the popup lists the
        // areas instead of a zoom that would go nowhere).
        addMergedMarker(instance, pins, group, max, cellSize.current, splitZoom(instance, group));
      }
    } finally {
      painting.current = false;
    }
  }, []);

  useEffect(() => {
    // The wheel zooms the map it points at rather than the page behind it
    // (#19); the +/− control and keyboard keep working alongside it.
    const instance = L.map(container.current, { scrollWheelZoom: true });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(instance);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);

    // Merging is a screen-space decision, so it is redone on every zoom step;
    // panning changes nothing about it.
    const onZoom = () => draw(false);
    instance.on('zoomend', onZoom);

    // The card reflows with the viewport; Leaflet only knows the size it was
    // created with.
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.off('zoomend', onZoom);
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, [draw]);

  useEffect(() => {
    data.current = cells || [];
    cellSize.current = cellDegrees;
    draw(true);
  }, [cells, cellDegrees, draw]);

  return <div className="nix-map" ref={container} role="img" aria-label="Map of where nixes happen" />;
}
