import { createApp } from "vue";
import App from "./App.vue";
import { createPinia } from "pinia";
import "./style.css";
import { createLogger } from "vue-logger-plugin";
import PrimeVue from "primevue/config";
import Aura from "@primeuix/themes/aura";
import router from './router'

const app = createApp(App);
const pinia = createPinia();

// Logger
const logger = createLogger({
  enabled: true,
  level: import.meta.env.VITE_LOG_LEVEL,
});

app.use(pinia);
app.use(logger);
app.use(router)
app.use(PrimeVue, {
  theme: { preset: Aura, options: { darkModeSelector: ".app-dark" } },
});
app.mount("#app");
