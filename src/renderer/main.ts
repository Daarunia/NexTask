import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css';
import App from './App.vue'
import { createLogger } from "vue-logger-plugin";
import PrimeVue from 'primevue/config';
import Button from "primevue/button"

const app = createApp(App);
const pinia = createPinia()

// Logger
const logger = createLogger({
  enabled: true,
  level: import.meta.env.VITE_LOG_LEVEL
})

app.use(pinia);
app.use(logger);
app.use(PrimeVue);
app.component('Button', Button);
app.mount('#app');