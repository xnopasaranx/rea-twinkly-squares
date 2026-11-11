import { LayoutCoord, PanelOrientation } from '../types';

const DEFAULT_ORIENTATION: PanelOrientation = { rotate: 0, flipH: false, flipV: false };

export function defaultPanelOrientations(count: number): PanelOrientation[] {
  return Array.from({ length: count }, () => ({ ...DEFAULT_ORIENTATION }));
}

export function defaultPanelChain(gridCols: number, gridRows: number): number[] {
  return Array.from({ length: gridCols * gridRows }, (_, i) => i);
}

function baseLocalCoord(
  led: number,
  panelCols: number,
  panelRows: number
): { x: number; y: number } {
  let x = led % panelCols;
  const y = Math.floor(led / panelCols);
  // Default wiring is a serpentine starting at the top-left LED.
  if (y % 2 === 1) {
    x = panelCols - 1 - x;
  }
  return { x, y };
}

function applyOrientation(
  x: number,
  y: number,
  panelCols: number,
  panelRows: number,
  orient: PanelOrientation
): { x: number; y: number } {
  let tx = x;
  let ty = y;

  if (orient.flipH) tx = panelCols - 1 - tx;
  if (orient.flipV) ty = panelRows - 1 - ty;

  const r = orient.rotate % 360;
  switch (r) {
    case 90:
      return { x: panelRows - 1 - ty, y: tx };
    case 180:
      return { x: panelCols - 1 - tx, y: panelRows - 1 - ty };
    case 270:
      return { x: ty, y: panelCols - 1 - tx };
    default:
      return { x: tx, y: ty };
  }
}

/**
 * Build a 2D layout for a rectangular grid of panels.
 *
 * Each panel is `panelCols` × `panelRows` LEDs. The overall grid is
 * `gridCols` × `gridRows` panels.
 *
 * The data cable visits the physical panels in order 0, 1, …, totalPanels-1.
 * `panelChain` maps each logical grid position to the physical panel index
 * that sits there. The LEDs inside each panel are in serpentine order and can
 * be rotated/flipped with `panelOrientations` (indexed by physical panel).
 */
export function buildRectLayout(
  gridCols: number,
  gridRows: number,
  panelCols = 8,
  panelRows = 8,
  panelOrientations: PanelOrientation[] = [],
  panelChain: number[] = []
): LayoutCoord[] {
  const coords: LayoutCoord[] = [];
  const totalPanels = gridCols * gridRows;
  const chain = panelChain.length ? panelChain : defaultPanelChain(gridCols, gridRows);
  const orientations = panelOrientations.length
    ? panelOrientations
    : defaultPanelOrientations(totalPanels);

  // logical position -> physical panel index is chain[pos];
  // we need the inverse: physical panel index -> logical position
  const cableToPos: number[] = new Array(totalPanels).fill(-1);
  for (let pos = 0; pos < totalPanels; pos++) {
    const cableIdx = chain[pos];
    if (cableIdx >= 0 && cableIdx < totalPanels) cableToPos[cableIdx] = pos;
  }

  for (let cableIdx = 0; cableIdx < totalPanels; cableIdx++) {
    const pos = cableToPos[cableIdx] >= 0 ? cableToPos[cableIdx]! : cableIdx;
    const panelCol = pos % gridCols;
    const panelRow = Math.floor(pos / gridCols);
    const orient = orientations[cableIdx] || DEFAULT_ORIENTATION;

    for (let led = 0; led < panelCols * panelRows; led++) {
      const local = baseLocalCoord(led, panelCols, panelRows);
      const transformed = applyOrientation(local.x, local.y, panelCols, panelRows, orient);

      const gx = panelCol * panelCols + transformed.x;
      const gy = panelRow * panelRows + transformed.y;
      coords.push({ x: gx, y: gy, z: 0 });
    }
  }

  return coords;
}

/**
 * Normalize coordinates to the range expected by the Twinkly layout endpoint.
 * The raw values are multiplied by 1000 to match the documented response scale.
 */
export function normalizeCoords(coords: LayoutCoord[]): LayoutCoord[] {
  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = maxX === minX ? 1 : maxX - minX;
  const scaleY = maxY === minY ? 1 : maxY - minY;

  return coords.map((c) => ({
    x: Math.round(((c.x - minX) / scaleX) * 4095),
    y: Math.round(((c.y - minY) / scaleY) * 4095),
    z: 0,
  }));
}

/**
 * Create a layout payload for a rectangular grid of panels.
 */
export function rectLayoutPayload(
  gridCols: number,
  gridRows: number,
  panelCols = 8,
  panelRows = 8,
  panelOrientations: PanelOrientation[] = [],
  panelChain: number[] = []
) {
  const coords = buildRectLayout(gridCols, gridRows, panelCols, panelRows, panelOrientations, panelChain);
  return {
    source: '2d' as const,
    synthesized: true,
    coordinates: normalizeCoords(coords),
    aspectXY: 1,
    aspectXZ: 0,
    uuid: '00000000-0000-0000-0000-000000000000',
  };
}
