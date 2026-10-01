import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import Home from '../pages/Home.vue'
import Settings from '../pages/Settings.vue'
import Archives from '../pages/Archives.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
  },
  {
    // Tâches archivées, ouvertes depuis la page Paramètres
    path: '/archives',
    name: 'Archives',
    component: Archives,
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
