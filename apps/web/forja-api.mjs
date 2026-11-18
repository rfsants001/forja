import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createForjaServer } from '../server/src/index.mjs';

export function forjaApi() {
  return {
    name: 'forja-local-api',
    apply: 'serve',
    configureServer(vite) {
      const port = vite.config.server.port ?? 5577;
      const root = fileURLToPath(new URL('../..', import.meta.url));
      const backend = createForjaServer({
        origin: 'http://localhost:' + port,
        directory: resolve(root, process.env.FORJA_DATA_DIR ?? 'data/forja'),
        timeZone: process.env.FORJA_TIME_ZONE,
        env: process.env,
      });
      vite.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api/')) backend.emit('request', request, response);
        else next();
      });
      vite.httpServer?.once('close', () => backend.emit('close'));
    },
  };
}
