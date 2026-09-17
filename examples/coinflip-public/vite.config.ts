import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';

// The game runs inside the host's iframe on a different origin, and the host
// fetches /game.manifest.json cross-origin — CORS must stay open.
export default defineConfig({
  plugins: [viteReact()],
  server: { port: 3100, cors: true },
  preview: { port: 3100, cors: true },
});
