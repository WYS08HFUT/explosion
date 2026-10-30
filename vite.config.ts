import { defineConfig } from 'vite';

const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const isUserSite = Boolean(owner && repository === `${owner}.github.io`);
const pagesBase =
  process.env.GITHUB_ACTIONS && repository && !isUserSite ? `/${repository}/` : '/';

export default defineConfig({
  // A project site lives under https://<owner>.github.io/<repo>/, so all
  // absolute asset URLs need that prefix. A user site (<owner>.github.io)
  // is served from the domain root instead.
  base: pagesBase,
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
});
