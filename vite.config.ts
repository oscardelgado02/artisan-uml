import { defineConfig } from 'vite';
import { cpSync, writeFileSync } from 'node:fs';

// Ship the docs site (docsify shell + markdown) inside the built app.
// Hosted at https://editor.artisan-uml.dev/ (custom domain, root base).
export default defineConfig({
  base: '/',
  plugins: [
    {
      name: 'copy-docs',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/docs') req.url = '/docs/';
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/docs') req.url = '/docs/';
          next();
        });
      },
      closeBundle() {
        cpSync('docs', 'dist/docs', { recursive: true });
        cpSync('assets/favicon.svg', 'dist/assets/favicon.svg', { recursive: true });
        writeFileSync('dist/.nojekyll', '');
      },
    },
  ],
});
