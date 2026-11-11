import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from '../views/Dashboard.vue';
import Library from '../views/Library.vue';
import Playlists from '../views/Playlists.vue';
import Editor from '../views/Editor.vue';
import LayoutSetup from '../views/LayoutSetup.vue';
import MQTT from '../views/MQTT.vue';

const routes = [
  { path: '/', component: Dashboard },
  { path: '/library', component: Library },
  { path: '/playlists', component: Playlists },
  { path: '/draw', component: Editor },
  { path: '/layout', component: LayoutSetup },
  { path: '/mqtt', component: MQTT },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
