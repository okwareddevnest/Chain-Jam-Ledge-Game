import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const simulatorRoot = dirname(fileURLToPath(import.meta.url));
const sdkSrc = resolve(simulatorRoot, '../src');

// `npm run local-node` writes the deployed addresses here; serving them lets
// the harness auto-fill the setup panel. 404s until the local node has run.
const DEPLOYED_CONTRACTS_PATH = resolve(simulatorRoot, 'local-node/deployed.json');

function localDeployedContracts(): Plugin {
  const serve = (_req: unknown, res: ServerResponse) => {
    try {
      const raw = readFileSync(DEPLOYED_CONTRACTS_PATH, 'utf8');
      res.setHeader('content-type', 'application/json');
      res.end(raw);
    } catch {
      res.statusCode = 404;
      res.end('{}');
    }
  };
  return {
    name: 'simulator-local-deployed-contracts',
    configureServer(server) {
      server.middlewares.use('/__local-contracts.json', serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__local-contracts.json', serve);
    },
  };
}

export default defineConfig({
  plugins: [viteReact(), tailwindcss(), localDeployedContracts()],
  resolve: {
    alias: {
      '@chain/casino-sdk/host': resolve(sdkSrc, 'host.ts'),
      '@chain/casino-sdk/guest': resolve(sdkSrc, 'guest.ts'),
      '@chain/casino-sdk': resolve(sdkSrc, 'index.ts'),
    },
  },
  server: { port: 3300, fs: { allow: [resolve(simulatorRoot, '..')] } },
  preview: { port: 3300 },
});
