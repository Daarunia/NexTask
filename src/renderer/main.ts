import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import './style.css'
import { createLogger } from 'vue-logger-plugin'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

// Logger
const logger = createLogger({
  enabled: true,
  level: import.meta.env.VITE_LOG_LEVEL,
})

app.use(pinia)
app.use(logger)
app.use(router)
app.use(PrimeVue, {
  license:
    'eyJpZCI6IjQ4MzgxMDQzLTY2MjctNGQ0ZC04M2MwLTkzNTEwMTg2NjM0ZSIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODQyMjkwNTAsImV4cCI6MTgxNTc2NTA1MH0.qVJvuNXG7ABnceENJ-N-CyWTFqegDmNA23La3zNAEVxL81AI-TJYx6gOrPJigHBaltNNnMhuW28uCSElaglrDA',
  theme: { preset: Aura, options: { darkModeSelector: '.app-dark' } },
})
app.mount('#app')
