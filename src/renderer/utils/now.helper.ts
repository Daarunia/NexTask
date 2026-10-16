import { onBeforeUnmount, onMounted, readonly, ref, type Ref } from 'vue'
import { MINUTE } from '../constants/time.constants'

/** Heure courante partagée, avancée chaque minute tant qu'un composant l'utilise. */
const now = ref(new Date())

// Composants montés qui lisent l'heure, et minuterie commune
let users = 0
let timer: ReturnType<typeof setInterval> | undefined

/**
 * Heure courante réactive, pour les libellés relatifs au jour (« Aujourd'hui »,
 * « Demain ») qui doivent changer passé minuit, même si le tableau reste
 * ouvert. Une seule minuterie pour tous les composants, arrêtée quand le
 * dernier est démonté. À appeler dans le setup d'un composant.
 */
export function useNow(): Readonly<Ref<Date>> {
  onMounted(() => {
    if (users++ > 0) return
    now.value = new Date()
    timer = setInterval(() => (now.value = new Date()), MINUTE)
  })

  onBeforeUnmount(() => {
    if (--users > 0) return
    clearInterval(timer)
    timer = undefined
  })

  return readonly(now)
}
