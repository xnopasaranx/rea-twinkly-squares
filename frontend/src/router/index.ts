import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from '../views/Dashboard.vue';
import Library from '../views/Library.vue';
import Playlists from '../views/Playlists.vue';
import Editor from '../views/Editor.vue';
import LayoutSetup from '../views/LayoutSetup.vue';

const routes = [
  { path: '/', component: Dashboard },
  { path: '/library', component: Library },
  { path: '/playlists', component: Playlists },
  { path: '/draw', component: Editor },
  { path: '/layout', component: LayoutSetup },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
