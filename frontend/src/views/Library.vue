<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAppStore } from '../stores/app';
import type { SearchResult } from '../api';

const store = useAppStore();
const activeTab = ref<'search' | 'local'>('search');
const query = ref('pixel art');
const searchType = ref<'gif' | 'pixelart'>('pixelart');
const exactSize = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

onMounted(() => store.fetchLibrary());

async function search() {
  await store.search(query.value, searchType.value, 20, exactSize.value);
}

function formatDimensions(r: SearchResult) {
  if (!r.width || !r.height) return '';
  return `${r.width}x${r.height}`;
}

async function addResult(r: SearchResult) {
  await store.addLibraryUrl(r.image, r.title, searchType.value);
}

async function uploadFile(e: Event) {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  if (!file) return;
  const type: 'gif' | 'pixelart' = file.type === 'image/gif' ? 'gif' : 'pixelart';
  await store.uploadLibraryFile(file, type, file.name);
  if (fileInput.value) fileInput.value.value = '';
}

async function stop() {
  await store.stopRt();
}
</script>

<template>
  <div class="library">
    <h2>Library</h2>
    <div class="tabs">
      <button :class="{ primary: activeTab === 'search' }" @click="activeTab = 'search'">Search online</button>
      <button :class="{ primary: activeTab === 'local' }" @click="activeTab = 'local'">Local</button>
    </div>

    <div v-if="activeTab === 'search'" class="card">
      <div class="row">
        <select v-model="searchType">
          <option value="gif">GIF</option>
          <option value="pixelart">Pixel art</option>
        </select>
        <input v-model="query" @keydown.enter="search" placeholder="Search..." />
        <button class="primary" @click="search" :disabled="store.loading">Search</button>
      </div>
      <div class="row" style="margin-top: 0.5rem; align-items: center;">
        <label class="toggle">
          <input type="checkbox" v-model="exactSize" />
          Exact matrix size ({{ store.gridSize.width }}x{{ store.gridSize.height }})
        </label>
        <span v-if="exactSize" class="muted small">Only showing results that already match your LED matrix.</span>
      </div>
      <div v-if="store.loading" class="muted" style="margin-top: 0.75rem">Searching...</div>
      <div class="search-grid">
        <div v-for="(r, i) in store.searchResults" :key="i" class="result-card">
          <img :src="r.thumbnail || r.image" />
          <div class="meta">
            <div class="result-title">{{ r.title }}</div>
            <span v-if="formatDimensions(r)" class="dim-badge">{{ formatDimensions(r) }}</span>
            <div class="actions">
              <button class="primary" @click="addResult(r)">Cache</button>
              <a :href="r.image" target="_blank" class="muted">source</a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="card">
      <div class="row" style="margin-bottom: 1rem">
        <input ref="fileInput" type="file" accept="image/*,.gif" @change="uploadFile" />
      </div>
      <div class="grid-list">
        <div v-for="item in store.library" :key="item.id" class="item-card">
          <img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" />
          <div class="meta">
            <strong>{{ item.name }}</strong>
            <span class="muted">{{ item.width }}x{{ item.height }} &middot; {{ item.type }}</span>
            <div class="actions">
              <button class="primary" @click="store.playRt(item.id)" :disabled="store.activeRtId === item.id">
                {{ store.activeRtId === item.id ? 'Playing' : 'Stream' }}
              </button>
              <button @click="store.uploadMovie(item.id)">Upload</button>
              <button class="danger" @click="store.deleteLibraryItem(item.id)">Delete</button>
            </div>
          </div>
        </div>
      </div>
      <button v-if="store.activeRtId" class="danger" style="margin-top: 1rem" @click="stop">Stop streaming</button>
    </div>
  </div>
</template>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
}

.search-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.result-card, .item-card {
  background: var(--panel-2);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.result-card img, .item-card img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: #000;
}

.meta {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.85rem;
}

.actions {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.actions button {
  padding: 0.35rem 0.55rem;
  font-size: 0.8rem;
}

.result-title {
  font-size: 0.75rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dim-badge {
  display: inline-block;
  font-size: 0.7rem;
  background: var(--accent);
  color: #fff;
  padding: 0.15rem 0.35rem;
  border-radius: 999px;
  width: fit-content;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.small {
  font-size: 0.8rem;
}
</style>
