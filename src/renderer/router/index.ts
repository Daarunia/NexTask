import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import Home from '../pages/Home.vue'
import Settings from '../pages/Settings.vue'
import Archives from '../pages/Archives.vue'
import Checklists from '../pages/Checklists.vue'
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
    // Modèles de checklist, l'id du modèle sélectionné dans l'URL (cf. Checklists.vue)
    path: '/checklists/:id?',
    name: 'Checklists',
    component: Checklists,
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
