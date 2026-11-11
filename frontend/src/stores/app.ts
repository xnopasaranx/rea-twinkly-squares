import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, DeviceSettings, LibraryItem, Playlist, Drawing, SearchResult } from '../api';

export const useAppStore = defineStore('app', () => {
  const settings = ref<DeviceSettings | null>(null);
  const status = ref<any>(null);
  const library = ref<LibraryItem[]>([]);
  const playlists = ref<Playlist[]>([]);
  const drawings = ref<Drawing[]>([]);
  const searchResults = ref<SearchResult[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const activeRtId = ref<string | null>(null);

  const gridSize = computed(() => {
    const d = settings.value?.device;
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

  async function updateDevice(device: Partial<DeviceSettings['device']>) {
    try {
      await api.updateSettings(device);
      await fetchSettings();
    } catch (e: any) {
      error.value = e.message;
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
    loading,
    error,
    activeRtId,
    gridSize,
    fetchStatus,
    fetchSettings,
    updateDevice,
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
    init,
  };
});
