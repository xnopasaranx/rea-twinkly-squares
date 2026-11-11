<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAppStore } from '../stores/app';
import { v4 as uuidv4 } from 'uuid';

const store = useAppStore();

const mqttEnabled = ref(false);
const brokerHost = ref('');
const brokerPort = ref(1883);
const username = ref('');
const password = ref('');
const baseTopic = ref('twinkly-squares');

const selectedMatrixId = ref<string>('');
const newMatrixName = ref('');
const overlayMsg = ref<Record<string, { text: string; color?: string; bg?: string; speed: number; loop: boolean; count: number }>>({});
const toast = ref('');
const refreshTimer = ref<number | null>(null);

const baseType = ref<'off' | 'color' | 'library' | 'drawing'>('off');
const baseLibraryId = ref('');
const baseDrawingId = ref('');
const baseColor = ref('#220000');

onMounted(() => {
  refreshFormValues();
  store.fetchLibrary();
  store.fetchDrawings();
  refreshTimer.value = window.setInterval(() => refreshQueues(), 2000);
});

onUnmounted(() => {
  if (refreshTimer.value) clearInterval(refreshTimer.value);
});

function refreshFormValues() {
  const s = store.settings;
  if (!s) return;
  mqttEnabled.value = s.mqtt?.enabled ?? false;
  brokerHost.value = s.mqtt?.brokerHost ?? '';
  brokerPort.value = s.mqtt?.brokerPort ?? 1883;
  username.value = s.mqtt?.username ?? '';
  password.value = s.mqtt?.password ?? '';
  baseTopic.value = s.mqtt?.baseTopic ?? 'twinkly-squares';
  if (!selectedMatrixId.value && s.matrices?.length) selectedMatrixId.value = s.activeMatrixId || s.matrices[0].id;
}

const selectedMatrix = computed(() => store.settings?.matrices.find((m) => m.id === selectedMatrixId.value));

function showToast(text: string) {
  toast.value = text;
  setTimeout(() => (toast.value = ''), 3000);
}

async function saveMqtt() {
  await store.updateMqtt({
    enabled: mqttEnabled.value,
    brokerHost: brokerHost.value,
    brokerPort: brokerPort.value,
    username: username.value,
    password: password.value,
    baseTopic: baseTopic.value,
  });
  showToast('MQTT config saved');
}

async function addMatrix() {
  if (!newMatrixName.value) return;
  const active = store.activeMatrix?.device;
  if (!active || !store.settings) return;
  const id = uuidv4();
  const overlays = store.activeMatrix?.overlays?.length
    ? store.activeMatrix.overlays
    : [{ id: 'main', x: 0, y: 0, width: active.gridCols * active.panelCols, height: active.gridRows * active.panelRows, maxQueueSize: 10 }];
  const matrices = [
    ...store.settings.matrices,
    { id, name: newMatrixName.value, device: { ...active }, topicSuffix: id, overlays },
  ];
  await store.updateMatrices(matrices);
  selectedMatrixId.value = id;
  newMatrixName.value = '';
}

async function saveMatrices() {
  if (!store.settings) return;
  await store.updateMatrices(store.settings.matrices);
  showToast('Matrices saved');
}

function updateMatrixName(id: string, name: string) {
  if (!store.settings) return;
  store.settings.matrices = store.settings.matrices.map((m) => (m.id === id ? { ...m, name } : m));
}

function updateTopicSuffix(id: string, suffix: string) {
  if (!store.settings) return;
  store.settings.matrices = store.settings.matrices.map((m) => (m.id === id ? { ...m, topicSuffix: suffix } : m));
}

function addOverlay(matrix: any) {
  const area = { id: uuidv4(), x: 0, y: 0, width: Math.min(matrix.device.gridCols * matrix.device.panelCols, 32), height: 8, maxQueueSize: 10, defaultColor: '#ffffff', defaultBg: '', defaultSpeed: 8 };
  matrix.overlays.push(area);
}

function removeOverlay(matrix: any, idx: number) {
  matrix.overlays.splice(idx, 1);
}

function defaultTopic(area: any, matrix: any) {
  return `${baseTopic.value}/${matrix.topicSuffix || matrix.id}/overlay/${area.id}/set`;
}

async function refreshQueues() {
  if (!selectedMatrixId.value) return;
  await store.fetchComposerStatus(selectedMatrixId.value);
}

function buildBasePayload() {
  switch (baseType.value) {
    case 'color':
      const n = parseInt(baseColor.value.replace('#', ''), 16);
      return { type: 'color', r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
    case 'library':
      return { type: 'library', id: baseLibraryId.value };
    case 'drawing':
      return { type: 'drawing', id: baseDrawingId.value };
    default:
      return { type: 'off' };
  }
}

async function startOverlay(matrix: any) {
  await store.startComposer(matrix.id, buildBasePayload());
  await refreshQueues();
}

async function stopOverlay(matrix: any) {
  await store.stopComposer(matrix.id);
  await refreshQueues();
}

function areaMsg(area: any) {
  let m = overlayMsg.value[area.id];
  if (!m) {
    m = {
      text: '',
      color: area.defaultColor || '#ffffff',
      bg: area.defaultBg || '',
      speed: area.defaultSpeed ?? 8,
      loop: false,
      count: 1,
    };
    overlayMsg.value[area.id] = m;
  }
  return m;
}

async function sendOverlay(matrix: any, area: any) {
  const payload = areaMsg(area);
  if (!payload.text) return;
  await store.pushOverlay(matrix.id, area.id, payload);
  payload.text = '';
  await refreshQueues();
}

async function clearArea(matrix: any, area: any) {
  await store.clearOverlays(matrix.id, area.id);
  await refreshQueues();
}

function statusFor(matrixId: string) {
  return store.composerStatus[matrixId] || { running: false, queues: [] };
}
</script>

<template>
  <div class="mqtt">
    <h2>MQTT & Overlays</h2>
    <div v-if="toast" class="toast success" @click="toast = ''">{{ toast }}</div>

    <div class="cards">
      <div class="card">
        <h3>MQTT Broker</h3>
        <div class="field">
          <label><input type="checkbox" v-model="mqttEnabled" /> Enabled</label>
        </div>
        <div class="row">
          <div class="field">
            <label>Host</label>
            <input v-model="brokerHost" placeholder="192.168.1.10" />
          </div>
          <div class="field">
            <label>Port</label>
            <input type="number" v-model.number="brokerPort" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Username</label>
            <input v-model="username" />
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" v-model="password" />
          </div>
        </div>
        <div class="field">
          <label>Base topic</label>
          <input v-model="baseTopic" />
        </div>
        <button class="primary" @click="saveMqtt">Save MQTT config</button>
      </div>

      <div class="card">
        <h3>Matrices</h3>
        <div class="row">
          <input v-model="newMatrixName" placeholder="New matrix name" />
          <button class="primary" @click="addMatrix" :disabled="!newMatrixName">Add</button>
        </div>
        <ul class="matrix-list">
          <li v-for="m in store.settings?.matrices" :key="m.id" :class="{ active: selectedMatrixId === m.id }" @click="selectedMatrixId = m.id">
            {{ m.name }}
            <span v-if="m.id === store.settings?.activeMatrixId" class="muted small">(active)</span>
          </li>
        </ul>
        <button class="primary" @click="saveMatrices" v-if="store.settings?.matrices.length">Save matrices</button>
        <button class="primary" @click="store.setActiveMatrix(selectedMatrixId)" :disabled="!selectedMatrixId" style="margin-top: 0.5rem">Set as active</button>
      </div>
    </div>

    <div v-if="selectedMatrix" class="card" style="margin-top: 1rem">
      <h3>Matrix: {{ selectedMatrix.name }}</h3>
      <div class="row">
        <div class="field">
          <label>Name</label>
          <input :value="selectedMatrix.name" @input="(e: any) => updateMatrixName(selectedMatrix.id, e.target.value)" />
        </div>
        <div class="field">
          <label>Topic suffix</label>
          <input :value="selectedMatrix.topicSuffix || selectedMatrix.id" @input="(e: any) => updateTopicSuffix(selectedMatrix.id, e.target.value)" />
        </div>
      </div>

      <h4 style="margin-top: 1rem">Overlay areas</h4>
      <div class="overlay-list">
        <div v-for="(area, idx) in selectedMatrix.overlays" :key="area.id" class="overlay-card">
          <div class="row">
            <strong>Area {{ idx + 1 }}: {{ area.id.slice(0, 6) }}</strong>
            <button class="danger small" @click="removeOverlay(selectedMatrix, idx)">Remove</button>
          </div>
          <div class="row small-fields">
            <div class="field"><label>x</label><input type="number" v-model.number="area.x" /></div>
            <div class="field"><label>y</label><input type="number" v-model.number="area.y" /></div>
            <div class="field"><label>w</label><input type="number" v-model.number="area.width" /></div>
            <div class="field"><label>h</label><input type="number" v-model.number="area.height" /></div>
            <div class="field"><label>max</label><input type="number" v-model.number="area.maxQueueSize" title="Max queue size" /></div>
            <div class="field"><label>speed</label><input type="number" v-model.number="area.defaultSpeed" /></div>
          </div>
          <div class="row">
            <div class="field"><label>color</label><input type="color" v-model="area.defaultColor" /></div>
            <div class="field"><label>bg</label><input v-model="area.defaultBg" placeholder="#rrggbb or empty" /></div>
          </div>
          <div class="topic">MQTT: <code>{{ defaultTopic(area, selectedMatrix) }}</code></div>
          <div class="row" style="margin-top: 0.5rem">
            <input :value="overlayMsg[area.id]?.text" @input="(e: any) => areaMsg(area).text = e.target.value" placeholder="Test message" :style="{ flex: 1 }" />
            <input type="color" :value="overlayMsg[area.id]?.color || area.defaultColor || '#ffffff'" @input="(e: any) => areaMsg(area).color = e.target.value" />
            <button class="primary" @click="sendOverlay(selectedMatrix, area)">Send test</button>
            <button @click="clearArea(selectedMatrix, area)">Clear</button>
          </div>
          <div v-for="(q, qidx) in statusFor(selectedMatrix.id).queues.filter((x: any) => x.areaId === area.id)" :key="qidx" class="queue-status">
            <span v-if="q.current" class="current">Now playing: {{ q.current.text }}</span>
            <span class="muted small">{{ q.queued }} queued</span>
          </div>
        </div>
        <button @click="addOverlay(selectedMatrix)">+ Add overlay area</button>
      </div>

      <div class="card" style="margin-top: 1rem">
        <h4>Base source for realtime composer</h4>
        <div class="row">
          <select v-model="baseType">
            <option value="off">Black / off</option>
            <option value="color">Solid color</option>
            <option value="library">Library item</option>
            <option value="drawing">Drawing</option>
          </select>
          <input v-if="baseType === 'color'" type="color" v-model="baseColor" />
          <select v-if="baseType === 'library'" v-model="baseLibraryId">
            <option value="">-- choose --</option>
            <option v-for="item in store.library" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <select v-if="baseType === 'drawing'" v-model="baseDrawingId">
            <option value="">-- choose --</option>
            <option v-for="d in store.drawings" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
      </div>

      <div class="row" style="margin-top: 1rem">
        <button class="primary" @click="startOverlay(selectedMatrix)">Start RT composer</button>
        <button class="danger" @click="stopOverlay(selectedMatrix)">Stop composer</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mqtt {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}
.field label {
  font-size: 0.8rem;
  color: var(--muted);
}
.matrix-list {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0;
}
.matrix-list li {
  padding: 0.5rem;
  background: var(--panel-2);
  border-radius: var(--radius);
  margin-bottom: 0.35rem;
  cursor: pointer;
}
.matrix-list li.active {
  outline: 1px solid var(--accent);
}
.overlay-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.overlay-card {
  background: var(--panel-2);
  padding: 0.75rem;
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.small-fields {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.5rem;
}
.topic {
  font-size: 0.8rem;
  font-family: monospace;
  color: var(--muted);
}
.queue-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}
.current {
  color: var(--accent-2);
}
.success {
  position: fixed;
  top: 1rem;
  right: 1rem;
  background: var(--success);
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: var(--radius);
  z-index: 100;
}
</style>
