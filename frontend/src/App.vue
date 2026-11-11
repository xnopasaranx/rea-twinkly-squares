<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppStore } from './stores/app';

const store = useAppStore();
onMounted(() => store.init());
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">◼</div>
        <h1>Twinkly Squares</h1>
      </div>
      <nav>
        <router-link to="/">Dashboard</router-link>
        <router-link to="/library">Library</router-link>
        <router-link to="/playlists">Playlists</router-link>
        <router-link to="/draw">Draw</router-link>
        <router-link to="/layout">Layout</router-link>
      </nav>
      <div class="status" v-if="store.status">
        <span class="dot" :class="store.status.mode?.data?.mode || 'unknown'"></span>
        <span>{{ store.status.mode?.data?.mode || 'offline' }}</span>
      </div>
    </aside>

    <main class="main">
      <div v-if="store.error" class="toast danger" @click="store.error = null">
        {{ store.error }}
      </div>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 220px;
  background: var(--panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}

.logo {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  display: grid;
  place-items: center;
  font-weight: bold;
}

.brand h1 {
  font-size: 1.05rem;
  margin: 0;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

nav a {
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius);
  color: var(--muted);
  transition: background 0.15s, color 0.15s;
}

nav a:hover,
nav a.router-link-active {
  background: var(--panel-2);
  color: var(--text);
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--muted);
}

.dot.rt {
  background: var(--accent-2);
}
.dot.movie,
.dot.playlist {
  background: var(--success);
}
.dot.off {
  background: var(--danger);
}

.main {
  flex: 1;
  padding: 1.25rem;
  overflow: auto;
  position: relative;
}

.toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 100;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--danger);
  color: #fff;
  cursor: pointer;
  max-width: 360px;
}
</style>
