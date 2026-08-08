import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions } from '../src/media/imagePreprocess.js';

describe('calculateTargetDimensions', () => {
  it('leaves an image untouched if already within maxEdge', () => {
    expect(calculateTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales down a landscape image so the longer edge equals maxEdge, preserving aspect ratio', () => {
    expect(calculateTargetDimensions(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('scales down a portrait image so the longer edge equals maxEdge, preserving aspect ratio', () => {
    expect(calculateTargetDimensions(2400, 3200, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never upscales a smaller image', () => {
    expect(calculateTargetDimensions(400, 300, 1600)).toEqual({ width: 400, height: 300 });
  });

  it('rounds to whole pixels', () => {
    expect(calculateTargetDimensions(3000, 1999, 1600)).toEqual({ width: 1600, height: 1066 });
  });
});
