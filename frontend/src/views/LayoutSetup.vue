<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { useAppStore } from '../stores/app';
import { api, PanelOrientation } from '../api';

const store = useAppStore();
const ip = ref('');
const mac = ref('');
const panelCols = ref(8);
const panelRows = ref(8);
const gridCols = ref(4);
const gridRows = ref(4);
const saved = ref(false);
const detected = ref<{ width: number; height: number } | null>(null);
const busy = ref(false);

// logical grid position -> physical panel index in the cable chain
const panelChain = ref<number[]>([]);
// physical panel index -> orientation the user sees on the matrix
const visualOrientations = ref<PanelOrientation[]>([]);
const selectedCable = ref<number | null>(null);
const draggedPos = ref<number | null>(null);
const justDragged = ref(false);
const testBusy = ref(false);
const uploadBusy = ref(false);

let previewTimer: ReturnType<typeof setTimeout> | null = null;

const dims = computed(() => ({
  width: gridCols.value * panelCols.value,
  height: gridRows.value * panelRows.value,
}));

const panelCount = computed(() => gridCols.value * gridRows.value);

onMounted(async () => {
  await store.fetchSettings();
  const d = store.settings?.device;
  if (d) {
    ip.value = d.ip ?? '';
    mac.value = d.mac ?? '';
    panelCols.value = d.panelCols ?? 8;
    panelRows.value = d.panelRows ?? 8;
    gridCols.value = d.gridCols ?? 4;
    gridRows.value = d.gridRows ?? 4;
  }
  resetAll();
});

onUnmounted(() => {
  if (previewTimer) clearTimeout(previewTimer);
});

function identityOrientation(): PanelOrientation {
  return { rotate: 0, flipH: false, flipV: false };
}

function inverseOrientation(o: PanelOrientation): PanelOrientation {
  let r = (-o.rotate) % 360;
  if (r < 0) r += 360;
  return { rotate: r as PanelOrientation['rotate'], flipH: o.flipH, flipV: o.flipV };
}

function resetAll() {
  const count = panelCount.value;
  const savedChain = store.settings?.device?.panelChain;
  const savedCorr = store.settings?.device?.panelOrientations;

  panelChain.value = Array.from({ length: count }, (_, i) => savedChain?.[i] ?? i);
  visualOrientations.value = Array.from({ length: count }, (_, i) => {
    const corr = savedCorr?.[i] || identityOrientation();
    return inverseOrientation(corr);
  });
  selectedCable.value = null;
  draggedPos.value = null;
  justDragged.value = false;
}

watch(panelCount, resetAll);

async function save() {
  await store.updateDevice({
    ip: ip.value,
    mac: mac.value,
    panelCols: panelCols.value,
    panelRows: panelRows.value,
    gridCols: gridCols.value,
    gridRows: gridRows.value,
  });
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

async function detectGrid() {
  busy.value = true;
  try {
    const res = await api.detectGrid();
    if (res.data?.dims) {
      detected.value = { width: res.data.dims.width, height: res.data.dims.height };
      gridCols.value = Math.round(res.data.dims.width / panelCols.value);
      gridRows.value = Math.round(res.data.dims.height / panelRows.value);
    }
  } finally {
    busy.value = false;
  }
}

async function uploadLayout() {
  await api.setLayout();
  await store.fetchStatus();
}

async function deleteLayout() {
  await api.deleteLayout();
  await store.fetchStatus();
}

function correctionOrientations(): PanelOrientation[] {
  return visualOrientations.value.map(inverseOrientation);
}

async function sendTestPattern() {
  testBusy.value = true;
  try {
    await api.sendTestPattern(correctionOrientations(), panelChain.value);
  } finally {
    testBusy.value = false;
  }
}

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    sendTestPattern().catch((e) => console.error('Live preview failed:', e));
  }, 150);
}

async function saveLayoutAndUpload() {
  uploadBusy.value = true;
  try {
    await store.updateDevice({
      panelOrientations: correctionOrientations(),
      panelChain: panelChain.value,
    });
    await api.setLayout();
    await store.fetchStatus();
    await sendTestPattern();
    saved.value = true;
    setTimeout(() => (saved.value = false), 2000);
  } finally {
    uploadBusy.value = false;
  }
}

function cableAt(pos: number): number {
  return panelChain.value[pos] ?? pos;
}

function visualForCable(cableIdx: number): PanelOrientation {
  return visualOrientations.value[cableIdx] || identityOrientation();
}

function rotateCable(cableIdx: number, delta: 1 | -1) {
  const o = { ...visualForCable(cableIdx) };
  let r = o.rotate + (delta === 1 ? 90 : -90);
  if (r >= 360) r -= 360;
  if (r < 0) r += 360;
  o.rotate = r as PanelOrientation['rotate'];
  visualOrientations.value = visualOrientations.value.map((x, i) => (i === cableIdx ? o : x));
  schedulePreview();
}

function toggleFlipH(cableIdx: number) {
  const o = { ...visualForCable(cableIdx) };
  o.flipH = !o.flipH;
  visualOrientations.value = visualOrientations.value.map((x, i) => (i === cableIdx ? o : x));
  schedulePreview();
}

function toggleFlipV(cableIdx: number) {
  const o = { ...visualForCable(cableIdx) };
  o.flipV = !o.flipV;
  visualOrientations.value = visualOrientations.value.map((x, i) => (i === cableIdx ? o : x));
  schedulePreview();
}

function panelClick(pos: number) {
  if (justDragged.value) return;
  const cable = cableAt(pos);
  if (selectedCable.value !== cable) {
    selectedCable.value = cable;
    return;
  }
  rotateCable(cable, 1);
}

function dragStart(pos: number, e: DragEvent) {
  draggedPos.value = pos;
  e.dataTransfer?.setData('text/plain', String(pos));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function drop(targetPos: number, e: DragEvent) {
  e.preventDefault();
  const src = draggedPos.value;
  if (src !== null && src !== targetPos) {
    const chain = [...panelChain.value];
    const tmp = chain[src];
    chain[src] = chain[targetPos];
    chain[targetPos] = tmp;
    panelChain.value = chain;
    selectedCable.value = chain[targetPos] ?? null;
    schedulePreview();
  }
}

function dragEnd() {
  draggedPos.value = null;
  justDragged.value = true;
  setTimeout(() => (justDragged.value = false), 50);
}

function panelRowCol(i: number) {
  return { row: Math.floor(i / gridCols.value), col: i % gridCols.value };
}

function transformCoord(
  x: number,
  y: number,
  w: number,
  h: number,
  orient: PanelOrientation
) {
  let tx = x;
  let ty = y;
  if (orient.flipH) tx = w - 1 - tx;
  if (orient.flipV) ty = h - 1 - ty;
  switch (orient.rotate) {
    case 90:
      return { x: h - 1 - ty, y: tx };
    case 180:
      return { x: w - 1 - tx, y: h - 1 - ty };
    case 270:
      return { x: ty, y: w - 1 - tx };
    default:
      return { x: tx, y: ty };
  }
}

function panelCells(orient: PanelOrientation) {
  const w = panelCols.value;
  const h = panelRows.value;
  const cells = Array.from({ length: w * h }, () => [0, 0, 0] as [number, number, number]);
  for (let x = 0; x < w; x++) {
    const p = transformCoord(x, 0, w, h, orient);
    const idx = p.y * w + p.x;
    cells[idx][0] = 255;
  }
  for (let y = 0; y < h; y++) {
    const p = transformCoord(0, y, w, h, orient);
    const idx = p.y * w + p.x;
    cells[idx][0] = cells[idx][0] ? 255 : 0;
    cells[idx][1] = 255;
  }
  return cells;
}
</script>

<template>
  <div class="layout">
    <h2>Layout & Device</h2>
    <div class="cards">
      <div class="card">
        <h3>Controller settings</h3>
        <div class="col">
          <label>IP address</label>
          <input v-model="ip" />
          <label>MAC address (optional, for challenge validation)</label>
          <input v-model="mac" />
          <label>Panel LED size</label>
          <div class="row">
            <input type="number" min="1" v-model.number="panelCols" /> x
            <input type="number" min="1" v-model.number="panelRows" />
          </div>
          <label>Panel grid (columns x rows)</label>
          <div class="row">
            <input type="number" min="1" v-model.number="gridCols" /> x
            <input type="number" min="1" v-model.number="gridRows" />
          </div>
          <div class="row" style="margin-top: 0.5rem">
            <button class="primary" @click="save">Save</button>
            <span v-if="saved" style="color: var(--success)">Saved</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Matrix init</h3>
        <p class="muted">
          Upload a synthetic 2D layout for a rectangular {{ gridCols }}x{{ gridRows }} panel grid.
          Resulting virtual resolution: {{ dims.width }}x{{ dims.height }} LEDs.
        </p>
        <div v-if="detected" style="color: var(--success); margin-top: 0.25rem">
          Detected from device: {{ detected.width }}x{{ detected.height }}
        </div>
        <div class="row" style="margin-top: 1rem">
          <button class="primary" @click="uploadLayout">Upload layout</button>
          <button @click="detectGrid" :disabled="busy">Detect grid</button>
          <button class="danger" @click="deleteLayout">Delete layout</button>
        </div>
      </div>

      <div class="card">
        <h3>Current device info</h3>
        <pre v-if="store.status?.gestalt?.ok">{{ JSON.stringify(store.status?.gestalt?.data, null, 2) }}</pre>
        <div v-else class="muted">No device data yet.</div>
      </div>

      <div class="card wide">
        <h3>Matrix layout</h3>
        <p class="muted">
          The large number in each tile is the panel’s cable index (the order in which the LED
          string visits the physical panels). Drag tiles to match the physical panel positions.
          Click a tile once to select it; click the selected tile again to rotate it. Use the
          flip/rotate buttons below for fine control. The matrix refreshes live as you change
          orientation or drag tiles.
        </p>

        <div class="legend">
          <div class="legend-tile">
            <div class="led-grid" :style="{ gridTemplateColumns: `repeat(${panelCols}, 1fr)` }">
              <div
                v-for="(color, ci) in panelCells({ rotate: 0, flipH: false, flipV: false })"
                :key="ci"
                class="led"
                :style="{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]}` }"
              />
            </div>
            <span>Target</span>
          </div>
        </div>

        <div class="panel-matrix" :style="{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }">
          <div
            v-for="pos in panelCount"
            :key="`${pos}-${cableAt(pos - 1)}`"
            class="panel"
            :class="{
              selected: selectedCable === cableAt(pos - 1),
              dragging: draggedPos === pos - 1,
            }"
            :title="`Panel ${cableAt(pos - 1) + 1} at col ${panelRowCol(pos - 1).col + 1}, row ${panelRowCol(pos - 1).row + 1}`"
            draggable="true"
            @click="panelClick(pos - 1)"
            @dragstart="dragStart(pos - 1, $event)"
            @dragover.prevent
            @drop="drop(pos - 1, $event)"
            @dragend="dragEnd"
          >
            <div class="panel-index">{{ cableAt(pos - 1) + 1 }}</div>
            <div
              class="led-grid"
              :style="{ gridTemplateColumns: `repeat(${panelCols}, 1fr)` }"
            >
              <div
                v-for="(color, ci) in panelCells(visualForCable(cableAt(pos - 1)))"
                :key="ci"
                class="led"
                :style="{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]}` }"
              />
            </div>
          </div>
        </div>

        <div v-if="selectedCable !== null" class="controls">
          <span class="panel-info">
            Panel #{{ selectedCable + 1 }}
          </span>
          <div class="row">
            <button @click="rotateCable(selectedCable, -1)">↺ 90°</button>
            <button @click="rotateCable(selectedCable, 1)">↻ 90°</button>
            <button :class="{ active: visualForCable(selectedCable).flipH }" @click="toggleFlipH(selectedCable)">Flip H</button>
            <button :class="{ active: visualForCable(selectedCable).flipV }" @click="toggleFlipV(selectedCable)">Flip V</button>
          </div>
        </div>

        <div class="row actions">
          <button class="primary" @click="sendTestPattern" :disabled="testBusy">
            {{ testBusy ? 'Sending…' : 'Send test pattern to matrix' }}
          </button>
          <button class="primary" @click="saveLayoutAndUpload" :disabled="uploadBusy">
            {{ uploadBusy ? 'Saving…' : 'Save layout & upload' }}
          </button>
          <button @click="resetAll">Reset tiles</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  align-items: start;
}

.card.wide {
  grid-column: 1 / -1;
}

.col input {
  width: 100%;
}

pre {
  background: var(--bg);
  padding: 0.75rem;
  border-radius: var(--radius);
  font-size: 0.8rem;
  overflow: auto;
}

.legend {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0 1rem;
}

.legend-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--muted);
}

.legend-tile .led-grid {
  width: 48px;
  height: 48px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2px;
}

.panel-matrix {
  display: grid;
  gap: 0.5rem;
  margin: 1rem 0;
  max-width: fit-content;
}

.panel {
  position: relative;
  width: 96px;
  height: 96px;
  background: #000;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  user-select: none;
}

.panel:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}

.panel.selected {
  border-color: var(--accent-2);
  transform: scale(1.04);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-2) 30%, transparent);
}

.panel.dragging {
  opacity: 0.5;
}

.panel-index {
  position: absolute;
  top: 2px;
  left: 5px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.led-grid {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 1px;
}

.led {
  width: 100%;
  height: 100%;
  border-radius: 1px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.panel-info {
  font-weight: 600;
}

.actions {
  gap: 0.75rem;
  flex-wrap: wrap;
}

button.active {
  background: var(--accent);
  color: #fff;
}
</style>
