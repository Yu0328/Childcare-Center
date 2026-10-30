import { describe, it, expect } from 'vitest';
import {
  ARRANGEMENTS, validCaptionGroups, joinCaption, captionFields, arrangeCaption,
  captionGroupsAfterRemovingPhoto, groupPhotoLabels,
} from '../src/domain/highlightCaptions.js';

const photos = n => Array.from({ length: n }, () => ({}));

describe('validCaptionGroups', () => {
  it('returns the groups when their sizes add up to the photos', () => {
    const groups = [{ size: 2, text: 'a' }, { size: 1, text: 'b' }];
    expect(validCaptionGroups({ photos: photos(3), captionGroups: groups })).toBe(groups);
  });

  it('returns null for no groups, one group, a size mismatch or a malformed group', () => {
    expect(validCaptionGroups({ photos: photos(3) })).toBeNull();
    expect(validCaptionGroups({ photos: photos(3), captionGroups: [{ size: 3, text: 'a' }] })).toBeNull();
    // A photo that couldn't be read is dropped from the list, so the sizes no longer fit.
    expect(validCaptionGroups({ photos: photos(2), captionGroups: [{ size: 2, text: 'a' }, { size: 1, text: 'b' }] })).toBeNull();
    expect(validCaptionGroups({ photos: photos(2), captionGroups: [{ size: 0, text: 'a' }, { size: 2, text: 'b' }] })).toBeNull();
    expect(validCaptionGroups({ photos: photos(2), captionGroups: [{ size: 1 }, { size: 1, text: 'b' }] })).toBeNull();
  });
});

describe('captionFields', () => {
  it('one group is a plain caption with no captionGroups key', () => {
    expect(captionFields([{ size: 3, text: '蓋城堡' }])).toEqual({ caption: '蓋城堡' });
  });

  it('two or more groups keep the parts and a joined caption, skipping blank parts', () => {
    const groups = [{ size: 1, text: '畫畫' }, { size: 1, text: ' ' }, { size: 1, text: '唱歌' }];
    expect(captionFields(groups)).toEqual({ caption: '畫畫\n唱歌', captionGroups: groups });
    expect(joinCaption(groups)).toBe('畫畫\n唱歌');
  });
});

describe('arrangeCaption', () => {
  it('keeps each text in the box at the same position', () => {
    expect(arrangeCaption(['甲', '乙'], [1, 2])).toEqual([{ size: 1, text: '甲' }, { size: 2, text: '乙' }]);
    expect(arrangeCaption(['甲'], [1, 1, 1])).toEqual([{ size: 1, text: '甲' }, { size: 1, text: '' }, { size: 1, text: '' }]);
  });

  it('folds texts with no box left into the last box', () => {
    expect(arrangeCaption(['甲', '乙', '丙'], [2, 1])).toEqual([{ size: 2, text: '甲' }, { size: 1, text: '乙\n丙' }]);
  });
});

describe('captionGroupsAfterRemovingPhoto', () => {
  const groups = [{ size: 2, text: '前兩張' }, { size: 1, text: '第三張' }];

  it('shrinks the group that held the photo', () => {
    expect(captionGroupsAfterRemovingPhoto(groups, 1)).toEqual([{ size: 1, text: '前兩張' }, { size: 1, text: '第三張' }]);
  });

  it('an emptied group hands its text to the previous group', () => {
    expect(captionGroupsAfterRemovingPhoto(groups, 2)).toEqual([{ size: 2, text: '前兩張\n第三張' }]);
  });

  it('an emptied first group hands its text to the next group, ahead of it', () => {
    const three = [{ size: 1, text: '一' }, { size: 1, text: '二' }, { size: 1, text: '三' }];
    expect(captionGroupsAfterRemovingPhoto(three, 0)).toEqual([{ size: 1, text: '一\n二' }, { size: 1, text: '三' }]);
  });
});

describe('labels and arrangements', () => {
  it('names each group by its photos', () => {
    expect(groupPhotoLabels([2, 1])).toEqual(['第 1、2 張', '第 3 張']);
    expect(groupPhotoLabels([1, 1, 1])).toEqual(['第 1 張', '第 2 張', '第 3 張']);
  });

  it('offers one split for two photos and three for three', () => {
    expect(ARRANGEMENTS[2]).toEqual([[1, 1]]);
    expect(ARRANGEMENTS[3]).toEqual([[2, 1], [1, 2], [1, 1, 1]]);
  });
});
