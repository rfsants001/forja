import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const extensions = /\.(?:js|css|html|json|webp|woff2?|png|svg)$/;
/** Build inventory used to check the actual Cache Storage, not the network indicator. */
export function offlineManifest() {
  return {
    name: 'forja-offline-manifest',
    apply: 'build',
    // Read the final output: Vite removes empty CSS-only chunks after generateBundle.
    writeBundle(options) {
      const directory = resolve(options.dir);
      const assets = [];
      function visit(current) {
        for (const item of readdirSync(current, { withFileTypes: true })) {
          const file = resolve(current, item.name);
          if (item.isDirectory()) visit(file);
          else if (extensions.test(file) && item.name !== 'offline-assets.json'
            && !(current === directory && (item.name === 'sw.js' || item.name.startsWith('workbox-')))) {
            assets.push(['/' + relative(directory, file).replaceAll('\\', '/'), readFileSync(file)]);
          }
        }
      }
      visit(directory);
      assets.sort(([a], [b]) => a.localeCompare(b));
      const hash = createHash('sha256');
      assets.forEach(([path, body]) => { hash.update(path); hash.update(body); });
      writeFileSync(resolve(directory, 'offline-assets.json'), JSON.stringify({
        version: hash.digest('hex'), assets: assets.map(([path]) => path),
      }));
    },
  };
}

// SRI lets Workbox safely repair an evicted entry without mixing application versions.
export function precacheIntegrity(entries, directory) {
  const inventory = entries.find((entry) => entry.url === 'offline-assets.json');
  if (inventory) {
    const file = resolve(directory, inventory.url);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.cacheKeys = Object.fromEntries(entries.filter((entry) => entry !== inventory).map((entry) => [
      '/' + entry.url, '/' + entry.url + (entry.revision ? '?__WB_REVISION__=' + entry.revision : ''),
    ]));
    writeFileSync(file, JSON.stringify(data));
  }
  return { manifest: entries.map((entry) => {
    const bytes = readFileSync(resolve(directory, entry.url));
    return { ...entry,
      ...(entry === inventory ? { revision: createHash('sha256').update(bytes).digest('hex') } : {}),
      integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64'),
    };
  }), warnings: [] };
}
