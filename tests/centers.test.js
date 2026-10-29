import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CENTERS, CENTER } from '../src/centers.js';

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
    }
  });
});
