<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '../stores/app';
import { api } from '../api';

const store = useAppStore();
const brightness = ref(50);
const color = ref('#ffffff');
const busy = ref(false);

const info = computed(() => store.status?.gestalt?.data);
const offline = computed(() => !store.status?.gestalt?.ok);
const configured = computed(() => store.status?.configured);
const ledMismatch = computed(() => {
  const deviceLeds = info.value?.number_of_led;
  const cfgLeds = configured.value?.leds;
  if (deviceLeds === undefined || cfgLeds === undefined) return null;
  return deviceLeds !== cfgLeds ? { device: deviceLeds, configured: cfgLeds } : null;
});

onMounted(() => store.fetchStatus());

async function setBrightness() {
  busy.value = true;
  try {
    await api.setBrightness(brightness.value);
    await store.fetchStatus();
  } finally {
    busy.value = false;
  }
}

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
</script>

<template>
  <div class="dashboard">
    <h2>Dashboard</h2>
    <div v-if="offline" class="card" style="border-color: var(--danger)">
      <strong>Device offline</strong>
      <p>Could not reach the controller. Check the IP on the Layout page.</p>
    </div>

    <div v-if="ledMismatch" class="card" style="border-color: var(--warning); color: var(--warning)">
      <strong>LED count mismatch</strong>
      <p>
        Device reports <strong>{{ ledMismatch.device }}</strong> LEDs, but current layout is configured for
        <strong>{{ ledMismatch.configured }}</strong>. Update panel grid settings on the Layout page.
      </p>
    </div>

    <div class="cards">
      <div class="card" v-if="info">
        <h3>{{ info.product_name }}</h3>
        <p class="muted">{{ info.product_code }} &middot; {{ info.fw_family || 'unknown' }} family</p>
        <ul class="specs">
          <li>LEDs: {{ info.number_of_led }}</li>
          <li>Configured grid: {{ configured?.width }} × {{ configured?.height }} ({{ configured?.leds }} LEDs)</li>
          <li>Profile: {{ info.led_profile }}</li>
          <li>FPS: {{ info.frame_rate }}</li>
          <li>Movie capacity: {{ info.movie_capacity }} frames</li>
          <li>Uptime: {{ info.uptime }} ms</li>
        </ul>
      </div>

      <div class="card controls">
        <h3>Quick controls</h3>
        <div class="row">
          <label>Mode:</label>
          <button @click="api.setMode('movie')">Movie</button>
          <button @click="api.setMode('rt')">RT</button>
          <button @click="api.setMode('off')">Off</button>
        </div>
        <div class="row" style="margin-top: 0.75rem">
          <label>Brightness:</label>
          <input type="range" min="0" max="100" v-model.number="brightness" />
          <span>{{ brightness }}%</span>
          <button class="primary" @click="setBrightness" :disabled="busy">Set</button>
        </div>
        <div class="row" style="margin-top: 0.75rem">
          <label>Color:</label>
          <input type="color" v-model="color" />
          <button
            class="primary"
            :disabled="busy"
            @click="api.setStaticColor(hexToRgb(color).r, hexToRgb(color).g, hexToRgb(color).b)"
          >
            Fill
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.specs {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  color: var(--muted);
}

.specs li {
  padding: 0.2rem 0;
}

.controls .row {
  justify-content: flex-start;
  flex-wrap: wrap;
}

input[type='range'] {
  width: 140px;
}
</style>
