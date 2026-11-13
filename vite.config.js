import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// WebXR needs a secure origin. The self-signed certificate lets a Quest on the
// same Wi-Fi open https://<your-pc-ip>:5173 (accept the certificate warning once).
// Set NO_SSL=1 to serve plain http (fine for localhost / adb reverse).
export default defineConfig({
  base: './',
  plugins: process.env.NO_SSL ? [] : [basicSsl()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
