<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useAppStore } from '../stores/app';
import { api } from '../api';
import type { Drawing } from '../api';

const store = useAppStore();
const color = ref('#ff0055');
const tool = ref<'pen' | 'erase' | 'picker'>('pen');
const drawingId = ref<string | null>(null);
const frameIndex = ref(0);
const sending = ref(false);
const nameInput = ref('');
const importInput = ref<HTMLInputElement | null>(null);
onMounted(() => store.fetchDrawings());

const currentDrawing = computed<Drawing | undefined>(() =>
  store.drawings.find((d) => d.id === drawingId.value)
);

const grid = computed(() => {
  const d = currentDrawing.value;
  if (!d) return { width: 0, height: 0, frame: [] as string[] };
  return {
    width: d.width,
    height: d.height,
    frame: d.frames[frameIndex.value] || d.frames[0] || [],
  };
});

let isMouseDown = false;

function pixelStyle(hex: string) {
  return { backgroundColor: hex };
}

function paint(index: number) {
  const d = currentDrawing.value;
  if (!d) return;
  const frame = d.frames[frameIndex.value];
  if (!frame) return;
  if (tool.value === 'picker') {
    color.value = frame[index];
    return;
  }
  const next = tool.value === 'erase' ? '#000000' : color.value;
  if (frame[index] === next) return;
  frame[index] = next;
  store.updateDrawing(d.id, { frames: d.frames });
}

function startPaint(i: number) {
  isMouseDown = true;
  paint(i);
}
function overPaint(i: number) {
  if (isMouseDown) paint(i);
}
function endPaint() {
  isMouseDown = false;
}

async function newDrawing() {
  const name = nameInput.value || 'Untitled';
  const size = store.gridSize.width;
  const d = await store.createDrawing(size, size, name, 200);
  drawingId.value = d.id;
  frameIndex.value = 0;
  nameInput.value = '';
}

async function addFrame() {
  if (!currentDrawing.value) return;
  await api.addDrawingFrame(currentDrawing.value.id);
  await store.fetchDrawings();
  frameIndex.value = currentDrawing.value.frames.length - 1;
}

async function deleteDrawing() {
  if (!currentDrawing.value) return;
  await store.deleteDrawing(currentDrawing.value.id);
  drawingId.value = null;
  frameIndex.value = 0;
}

async function sendFrame() {
  if (!currentDrawing.value) return;
  sending.value = true;
  try {
    await api.sendDrawing(currentDrawing.value.id, frameIndex.value);
  } finally {
    sending.value = false;
  }
}

function downloadBackup() {
  if (!currentDrawing.value) return;
  api.downloadDrawing(currentDrawing.value.id).then((res) => {
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDrawing.value!.name}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  });
}

function importBackup(event: Event) {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0];
  if (!file) return;
  api.importDrawings(file).then(() => store.fetchDrawings());
  el.value = '';
}

watch(
  () => store.drawings,
  () => {
    if (drawingId.value && !currentDrawing.value) drawingId.value = null;
  }
);
</script>

<template>
  <div class="editor">
    <h2>Draw</h2>
    <div class="row">
      <input v-model="nameInput" placeholder="New drawing name" />
      <button class="primary" @click="newDrawing">New {{ store.gridSize.width }}x{{ store.gridSize.height }}</button>
      <input ref="importInput" type="file" accept=".json" @change="importBackup" />
    </div>

    <div v-if="currentDrawing" class="workspace">
      <div class="toolbar">
        <div class="row">
          <input type="color" v-model="color" />
          <button :class="{ primary: tool === 'pen' }" @click="tool = 'pen'">Pen</button>
          <button :class="{ primary: tool === 'erase' }" @click="tool = 'erase'">Erase</button>
          <button :class="{ primary: tool === 'picker' }" @click="tool = 'picker'">Picker</button>
        </div>
        <div class="row" style="margin-top: 0.5rem">
          <button @click="frameIndex = Math.max(0, frameIndex - 1)">Prev</button>
          <span>Frame {{ frameIndex + 1 }} / {{ currentDrawing.frames.length }}</span>
          <button @click="frameIndex = Math.min(currentDrawing.frames.length - 1, frameIndex + 1)">Next</button>
          <button @click="addFrame">+ Frame</button>
        </div>
        <div class="row" style="margin-top: 0.5rem">
          <button class="primary" @click="sendFrame" :disabled="sending">Send to matrix</button>
          <button @click="downloadBackup">Download JSON</button>
          <button class="danger" @click="deleteDrawing">Delete</button>
        </div>
      </div>

      <div
        class="canvas preview-grid"
        :style="{
          gridTemplateColumns: `repeat(${grid.width}, 1fr)`,
          width: `${Math.min(600, grid.width * 16)}px`,
        }"
        @mouseleave="endPaint"
        @mouseup="endPaint"
      >
        <div
          v-for="(hex, i) in grid.frame"
          :key="i"
          class="pixel"
          :style="pixelStyle(hex)"
          @mousedown.prevent="startPaint(i)"
          @mouseenter="overPaint(i)"
        />
      </div>
    </div>

    <div v-else class="muted">Create or select a drawing to edit.</div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.workspace {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
}

.toolbar {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.canvas {
  background: #000;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  user-select: none;
  overflow: hidden;
}

.pixel {
  cursor: crosshair;
}
</style>
