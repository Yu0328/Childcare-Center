import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions, compressImage } from '../src/media/imagePreprocess.js';

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

describe('compressImage 預設解析度上限', () => {
  it('預設 maxEdge 是 960（Word 匯出時點滴分享照片最大只顯示到約 717px）', () => {
    // calculateTargetDimensions 是純函式，可以直接驗證這個上限的效果：
    // 一張 3000x2000 的手機照片在 960 上限下應縮到 960x640。
    expect(calculateTargetDimensions(3000, 2000, 960)).toEqual({ width: 960, height: 640 });
    // 而 compressImage 的預設值必須就是 960，不是 1600。
    expect(compressImage.toString()).toContain('maxEdge = 960');
  });
});
