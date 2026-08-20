#!/usr/bin/env node
/**
 * Guard for the local-only dev scripts.
 *
 * `npm run dev` starts two watch-mode compilers (nest --watch + next dev) side
 * by side. That is right on a laptop and wrong on a host: on Render's 512Mi
 * starter the pair exhausts memory before either finishes booting, and
 * `next dev -p 3000` pins port 3000 instead of the $PORT the platform assigns,
 * so the health check never sees an open socket. The deploy dies as
 * "Out of memory" + "No open HTTP ports detected" rather than as a config error.
 *
 * Failing fast here turns that into a message that names the fix.
 */
const isProduction = process.env.NODE_ENV === 'production';
// Render, Heroku, Fly and Railway each announce themselves; any of them means
// this is a deploy, not a workstation.
const platform =
  (process.env.RENDER && 'Render') ||
  (process.env.DYNO && 'Heroku') ||
  (process.env.FLY_APP_NAME && 'Fly.io') ||
  (process.env.RAILWAY_ENVIRONMENT && 'Railway') ||
  null;

if (!isProduction && !platform) process.exit(0);

const where = platform ?? 'a NODE_ENV=production environment';

console.error(`
✖ Refusing to run the dev servers on ${where}.

  "npm run dev" is for local development only. It runs "nest start --watch" and
  "next dev" together, which needs far more memory than a small instance has and
  binds a hardcoded port instead of $PORT.

  Deploy the API and the web client as two separate services:

    API service    Build  npm ci && npm run build:api
                   Start  npm run start:api

    Web service    Build  npm ci && npm run build:web
                   Start  npm run start:web

  render.yaml in the repo root already declares both services with these
  commands. On Render, prefer New -> Blueprint over a hand-made service so the
  build and start commands stay in sync with the repo.

  To run the dev servers locally, unset NODE_ENV first.
`);
process.exit(1);
