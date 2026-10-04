import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import Home from '../pages/Home.vue'
import Settings from '../pages/Settings.vue'
import Archives from '../pages/Archives.vue'
import QuickAdd from '../pages/QuickAdd.vue'
import { QUICK_ADD_ROUTE } from '../../main/shared/quickAdd.constants'

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
  {
    // Fenêtre d'ajout rapide, ouverte par le raccourci global : page seule
    path: QUICK_ADD_ROUTE,
    name: 'QuickAdd',
    component: QuickAdd,
    meta: { bare: true },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
