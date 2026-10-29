import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { CENTERS } from '../src/centers.js';

// Runs the real web build once — the per-centre pages and the old-URL page are plain text, so
// checking the written files is the honest test.
describe('build-web', () => {
  beforeAll(() => {
    execFileSync('node', ['scripts/build-web.mjs'], { stdio: 'pipe' });
  }, 120000);

  it('writes one self-contained folder per centre with its own name and logo', () => {
    for (const c of CENTERS) {
      const html = readFileSync(`site/${c.id}/index.html`, 'utf-8');
      expect(html).toContain(`<title>${c.title}</title>`);
      expect(html).toContain(`content="${c.shortName}"`);
      const manifest = JSON.parse(readFileSync(`site/${c.id}/manifest.json`, 'utf-8'));
      expect(manifest.name).toBe(c.title);
      expect(manifest.short_name).toBe(c.shortName);
      expect(manifest.scope).toBe('./');
      expect(existsSync(`site/${c.id}/icons/icon-512.png`)).toBe(true);
      // iPhone rounds its home-screen icon itself and fills transparent corners black, so it gets a square one.
      expect(html).toContain('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">');
      expect(existsSync(`site/${c.id}/icons/apple-touch-icon.png`)).toBe(true);
      expect(html).toContain(readFileSync(`assets/centers/${c.id}/word-badge.png`).toString('base64'));
    }
  });

  it("names each centre's cache by its id and only clears that centre's old caches", () => {
    for (const c of CENTERS) {
      const sw = readFileSync(`site/${c.id}/sw.js`, 'utf-8');
      expect(sw).toMatch(new RegExp(`const CACHE_NAME = 'c-form-site-${c.id}-[0-9a-f]{12}'`));
      expect(sw).toContain(`key.startsWith('c-form-site-${c.id}-')`);
      expect(sw).toContain("cache: 'reload'");
    }
  });

  it('puts the move notice at the old URL, sending people on to 育英', () => {
    const html = readFileSync('site/index.html', 'utf-8');
    expect(html).toContain("'yuying/'");
    expect(html).toContain('c-form-moved-seen');
    const sw = readFileSync('site/sw.js', 'utf-8');
    expect(sw).toMatch(/const CACHE_NAME = 'c-form-root-[0-9a-f]{12}'/);
    expect(sw).toContain("key.startsWith('c-form-cache-')");
    // Opens offline before yuying's own service worker ever installed, and never stores a stale HTTP-cache copy.
    expect(sw).toContain("'yuying/index.html'");
    expect(sw).toContain("'yuying/icons/icon-512.png'");
    expect(sw).toContain("cache: 'reload'");
  });
});
