import { createApp } from 'vue'
import './style.css';
import App from './App.vue'
import { createLogger } from "vue-logger-plugin";

const app = createApp(App);

// Logger
const logger = createLogger({
  enabled: true,
  level: 'debug'
})

app.use(logger);
app.mount('#app');