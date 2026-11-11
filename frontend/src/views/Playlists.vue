<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '../stores/app';
import type { Playlist } from '../api';

const store = useAppStore();
const newName = ref('');
const selectedId = ref<string | null>(null);
const addItemId = ref('');
const durationSeconds = ref(5);
const applying = ref(false);
const feedback = ref<{ type: 'success' | 'error'; text: string } | null>(null);

onMounted(() => store.fetchPlaylists());

const selected = computed(() => store.playlists.find((p) => p.id === selectedId.value));

const totalDurationSec = computed(() => {
  if (!selected.value) return 0;
  return selected.value.entries.reduce((sum, e) => sum + (e.durationMs || 0), 0) / 1000;
});

function setFeedback(type: 'success' | 'error', text: string) {
  feedback.value = { type, text };
  setTimeout(() => {
    feedback.value = null;
  }, 4000);
}

function create() {
  if (!newName.value) return;
  store.createPlaylist(newName.value);
  newName.value = '';
}

function addItem(playlist: Playlist) {
  if (!addItemId.value) return;
  const entries = [...playlist.entries, { itemId: addItemId.value, durationMs: Math.max(1000, durationSeconds.value * 1000) }];
  store.updatePlaylist(playlist.id, { entries });
  addItemId.value = '';
}

function removeItem(playlist: Playlist, index: number) {
  const entries = playlist.entries.slice();
  entries.splice(index, 1);
  store.updatePlaylist(playlist.id, { entries });
}

async function apply(playlist: Playlist) {
  applying.value = true;
  feedback.value = null;
  try {
    const res = await store.applyPlaylist(playlist.id);
    const count = (res as any)?.data?.applied ?? 0;
    setFeedback('success', `Applied ${count} item(s) to the device.`);
  } catch (e: any) {
    setFeedback('error', e?.message || 'Failed to apply playlist.');
  } finally {
    applying.value = false;
  }
}

function itemName(id: string) {
  return store.library.find((i) => i.id === id)?.name || id.slice(0, 8);
}

function formatDuration(ms: number) {
  return `${ms / 1000}s`;
}
</script>

<template>
  <div class="playlists">
    <h2>Playlists</h2>
    <div class="cards">
      <div class="card">
        <h3>Your playlists</h3>
        <div class="row">
          <input v-model="newName" placeholder="New playlist name" />
          <button class="primary" @click="create">Create</button>
        </div>
        <ul class="playlist-list">
          <li
            v-for="p in store.playlists"
            :key="p.id"
            :class="{ active: selectedId === p.id }"
            @click="selectedId = p.id"
          >
            {{ p.name }}
            <button class="danger small" @click.stop="store.deletePlaylist(p.id)">Delete</button>
          </li>
        </ul>
      </div>

      <div class="card" v-if="selected">
        <h3>{{ selected.name }}</h3>
        <div class="entries">
          <div v-for="(entry, idx) in selected.entries" :key="idx" class="entry row">
            <div class="entry-info">
              <strong>{{ itemName(entry.itemId) }}</strong>
              <span class="muted small">{{ formatDuration(entry.durationMs) }}</span>
            </div>
            <input type="number" v-model.number="entry.durationMs" min="1000" step="1000" title="Duration in milliseconds" />
            <button class="danger small" @click="removeItem(selected, idx)">Remove</button>
          </div>
          <div v-if="!selected.entries.length" class="muted">No entries yet.</div>
          <div v-else class="total">Total: {{ totalDurationSec }}s</div>
        </div>
        <div class="row" style="margin-top: 1rem; flex-wrap: wrap;">
          <label>Add:</label>
          <select v-model="addItemId">
            <option value="">Choose library item</option>
            <option v-for="item in store.library" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <input type="number" v-model.number="durationSeconds" min="1" style="width: 70px" title="Seconds" />
          <span class="muted">s</span>
          <button class="primary" @click="addItem(selected)" :disabled="!addItemId">Add</button>
        </div>
        <div class="row" style="margin-top: 1rem">
          <button class="primary" @click="apply(selected)" :disabled="applying || !selected.entries.length">Run on device</button>
          <span v-if="applying" class="muted">Uploading…</span>
        </div>
        <div v-if="feedback" class="feedback" :class="feedback.type">
          {{ feedback.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playlists {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
  align-items: start;
}

.playlist-list {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
}

.playlist-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0.7rem;
  border-radius: var(--radius);
  cursor: pointer;
  background: var(--panel-2);
  margin-bottom: 0.35rem;
}

.playlist-list li.active {
  outline: 1px solid var(--accent);
}

.playlist-list li button {
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.entry {
  background: var(--panel-2);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius);
}

.entry input {
  width: 80px;
}

.entry-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.entry-info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.total {
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 0.3rem;
}

.feedback {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  font-size: 0.9rem;
}

.feedback.success {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
}

.feedback.error {
  background: rgba(244, 67, 54, 0.2);
  color: #f44336;
}

.small {
  font-size: 0.8rem;
}
</style>
