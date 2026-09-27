# Automatic deploy

Replaces the hand-made "public snapshot update" (build:web, copy index.html/sw.js to the repo root, commit) with a GitHub Actions workflow, `.github/workflows/deploy.yml`, on every push to `main`: `npm ci` → tests (`--retry=2`, for the few timing-sensitive tests) → `build:web` → copy `about.html`/`privacy.html`/Google verification file into `site/` → publish `site/` to Pages.

- Pages source switches from "branch main /" to "GitHub Actions", done before the first push so the root snapshot's removal never goes live under the old source.
- The root `index.html`, `sw.js`, `manifest.json`, `icons/` are deleted: `build:web` regenerates all of them. The three static pages stay at the root, same URLs.
- A failed test or build publishes nothing; the previous version stays live.
- The cache name is a hash of the bundle, so a rebuild with unchanged code serves the same cache — no spurious "有新版本" prompt.
