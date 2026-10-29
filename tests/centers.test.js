import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { CENTERS, CENTER } from '../src/centers.js';
import { DB_NAME } from '../src/storage/dbCore.js';
import { SYNC_MODE_KEY, SYNC_NAME_KEY, RELOAD_TOKEN_KEY } from '../src/sync/googleAuth.js';
import { SYNC_FOLDER_KEY } from '../src/storage/syncStateDb.js';
import { FOLDER_NAME } from '../src/sync/driveClient.js';
import { HEADER_ICON_BASE64 } from '../src/export/docxShared.js';

describe('centers', () => {
  it('defaults to 育英 when no build passes __CENTER_ID__ (offline build, tests)', () => {
    expect(CENTER.id).toBe('yuying');
  });

  it('keeps 育英 on its pre-move names so existing data and sign-ins survive the move', () => {
    const yuying = CENTERS.find(c => c.id === 'yuying');
    expect(yuying.dbName).toBe('c-form-db');
    expect(yuying.storagePrefix).toBe('c-form');
    expect(yuying.driveFolderName).toBe('育英公托填表系統');
    expect(yuying.institution).toBe('屏東縣內埔鄉育英公設民營托嬰中心');
    expect(yuying.monthlyPlanInstitution).toBe('屏東縣內埔鄉育英公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理');
  });

  it('gives every centre its own url folder, storage and Drive folder', () => {
    for (const field of ['id', 'dbName', 'storagePrefix', 'driveFolderName', 'title', 'shortName']) {
      const values = CENTERS.map(c => c[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it('has a url-safe id, every text field and both logo sizes for each centre', () => {
    for (const c of CENTERS) {
      expect(c.id).toMatch(/^[a-z0-9]+$/);
      for (const field of ['title', 'shortName', 'institution', 'monthlyPlanInstitution', 'driveFolderName', 'dbName', 'storagePrefix']) {
        expect(c[field], `${c.id}.${field}`).toBeTruthy();
      }
      expect(existsSync(`assets/centers/${c.id}/icon-192.png`)).toBe(true);
      expect(existsSync(`assets/centers/${c.id}/icon-512.png`)).toBe(true);
      expect(existsSync(`assets/centers/${c.id}/apple-touch-icon.png`)).toBe(true);
      expect(existsSync(`assets/centers/${c.id}/word-badge.png`)).toBe(true);
    }
  });
});

describe('storage names read from CENTER', () => {
  it('resolve to the exact pre-move names for 育英', () => {
    expect(DB_NAME).toBe('c-form-db');
    expect(SYNC_MODE_KEY).toBe('c-form-sync-mode');
    expect(SYNC_NAME_KEY).toBe('c-form-sync-name');
    expect(RELOAD_TOKEN_KEY).toBe('c-form-reload-token');
    expect(SYNC_FOLDER_KEY).toBe('c-form-sync-folder-id');
    expect(FOLDER_NAME).toBe('育英公托填表系統');
  });
});

describe('Word header badge', () => {
  it("is 育英's original round badge when no build passes one (offline build, tests)", () => {
    expect(readFileSync('assets/centers/yuying/word-badge.png').toString('base64')).toBe(HEADER_ICON_BASE64);
  });
});
