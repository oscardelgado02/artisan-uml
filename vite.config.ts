import { defineConfig } from 'vite';
import { cpSync, writeFileSync } from 'node:fs';

// Ship the docs site (docsify shell + markdown) inside the built app.
// Hosted at https://artisan-uml.dev (GitHub Pages custom domain).
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
        writeFileSync('dist/.nojekyll', '');
        writeFileSync('dist/CNAME', 'artisan-uml.dev');
      },
    },
  ],
});
