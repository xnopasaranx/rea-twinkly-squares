import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, DeviceSettings, MatrixConfig, MqttSettings, LibraryItem, Playlist, Drawing, SearchResult } from '../api';

export const useAppStore = defineStore('app', () => {
  const settings = ref<DeviceSettings | null>(null);
  const status = ref<any>(null);
  const library = ref<LibraryItem[]>([]);
  const playlists = ref<Playlist[]>([]);
  const drawings = ref<Drawing[]>([]);
  const searchResults = ref<SearchResult[]>([]);
  const composerStatus = ref<Record<string, any>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);
  const activeRtId = ref<string | null>(null);

  const activeMatrix = computed((): MatrixConfig | undefined => {
    if (!settings.value) return undefined;
    return settings.value.matrices.find((m) => m.id === settings.value?.activeMatrixId) || settings.value.matrices[0];
  });

  const gridSize = computed(() => {
    const d = activeMatrix.value?.device;
    if (!d) return { width: 32, height: 32 };
    return {
      width: d.gridCols * d.panelCols,
      height: d.gridRows * d.panelRows,
    };
  });

  async function fetchStatus() {
    try {
      const res = await api.getStatus();
      status.value = res.data;
    } catch (e: any) {
      status.value = null;
      error.value = e.message;
    }
  }

  async function fetchSettings() {
    try {
      const res = await api.getSettings();
      settings.value = res.data;
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function updateDevice(device: Partial<MatrixConfig['device']>) {
    try {
      const active = activeMatrix.value;
      if (!active) return;
      const matrices = settings.value!.matrices.map((m) =>
        m.id === active.id ? { ...m, device: { ...m.device, ...device } } : m
      );
      await api.updateSettings({ matrices });
      await fetchSettings();
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function updateMatrices(matrices: MatrixConfig[]) {
    try {
      await api.updateSettings({ matrices });
      await fetchSettings();
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function setActiveMatrix(id: string) {
    try {
      await api.setActiveMatrix(id);
      await fetchSettings();
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function updateMqtt(mqtt: Partial<MqttSettings>) {
    try {
      await api.setMqttConfig(mqtt);
      await fetchSettings();
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function pushOverlay(matrixId: string, areaId: string, payload: { text: string; color?: string; bg?: string; speed?: number; loop?: boolean; count?: number }) {
    try {
      await api.pushOverlay(matrixId, areaId, payload);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  async function startComposer(matrixId: string, base?: { type: string; id?: string }) {
    try {
      await api.startComposer(matrixId, base);
      await fetchComposerStatus(matrixId);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  async function stopComposer(matrixId: string) {
    try {
      await api.stopComposer(matrixId);
      await fetchComposerStatus(matrixId);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  async function fetchComposerStatus(matrixId: string) {
    try {
      const res = await api.getComposerStatus(matrixId);
      composerStatus.value[matrixId] = res.data;
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function clearOverlays(matrixId: string, areaId?: string) {
    try {
      await api.clearOverlays(matrixId, areaId);
      await fetchComposerStatus(matrixId);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  async function fetchLibrary() {
    try {
      const res = await api.listLibrary();
      library.value = res.data;
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function addLibraryUrl(url: string, name: string, type: 'gif' | 'pixelart') {
    try {
      const res = await api.addLibraryUrl(url, name, type);
      await fetchLibrary();
      return res.data;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  async function uploadLibraryFile(file: File, type: 'gif' | 'pixelart', name?: string) {
    try {
      const res = await api.uploadLibraryFile(file, type, name);
      await fetchLibrary();
      return res.data;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  async function deleteLibraryItem(id: string) {
    try {
      await api.deleteLibraryItem(id);
      await fetchLibrary();
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function search(query: string, type: 'gif' | 'pixelart', limit = 20, exactSize = false) {
    loading.value = true;
    try {
      const res = await api.searchLibrary(query, type, limit, exactSize);
      searchResults.value = res.data;
    } catch (e: any) {
      searchResults.value = [];
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function playRt(id: string) {
    try {
      await api.playRt(id);
      activeRtId.value = id;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  async function stopRt() {
    try {
      await api.stopRt();
      activeRtId.value = null;
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function uploadMovie(id: string) {
    return await api.uploadMovie(id);
  }

  async function uploadRawMovie(file: File, name?: string) {
    return await api.uploadRawMovie(file, name);
  }

  async function fetchPlaylists() {
    try {
      const res = await api.listPlaylists();
      playlists.value = res.data;
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function createPlaylist(name: string) {
    await api.createPlaylist(name);
    await fetchPlaylists();
  }

  async function updatePlaylist(id: string, data: Partial<Playlist>) {
    await api.updatePlaylist(id, data);
    await fetchPlaylists();
  }

  async function deletePlaylist(id: string) {
    await api.deletePlaylist(id);
    await fetchPlaylists();
  }

  async function applyPlaylist(id: string) {
    return await api.applyPlaylist(id);
  }

  async function fetchDrawings() {
    try {
      const res = await api.listDrawings();
      drawings.value = res.data;
    } catch (e: any) {
      error.value = e.message;
    }
  }

  async function createDrawing(width: number, height: number, name: string, frameDelay: number) {
    const res = await api.createDrawing(width, height, name, frameDelay);
    await fetchDrawings();
    return res.data;
  }

  async function updateDrawing(id: string, data: Partial<Drawing>) {
    await api.updateDrawing(id, data);
    await fetchDrawings();
  }

  async function deleteDrawing(id: string) {
    await api.deleteDrawing(id);
    await fetchDrawings();
  }

  async function init() {
    await fetchSettings();
    await fetchStatus();
    await fetchLibrary();
    await fetchPlaylists();
    await fetchDrawings();
  }

  return {
    settings,
    status,
    library,
    playlists,
    drawings,
    searchResults,
    composerStatus,
    loading,
    error,
    activeRtId,
    activeMatrix,
    gridSize,
    fetchStatus,
    fetchSettings,
    updateDevice,
    updateMatrices,
    setActiveMatrix,
    updateMqtt,
    fetchLibrary,
    addLibraryUrl,
    uploadLibraryFile,
    deleteLibraryItem,
    search,
    playRt,
    stopRt,
    uploadMovie,
    uploadRawMovie,
    fetchPlaylists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    applyPlaylist,
    fetchDrawings,
    createDrawing,
    updateDrawing,
    deleteDrawing,
    pushOverlay,
    startComposer,
    stopComposer,
    fetchComposerStatus,
    clearOverlays,
    init,
  };
});
