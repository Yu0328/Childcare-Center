import { describe, it, expect } from 'vitest';
import { applyTapOrder, finalChildIds } from '../src/domain/childOrder.js';

describe('applyTapOrder', () => {
  it('puts tapped children first and keeps the rest in their old order', () => {
    expect(applyTapOrder([1, 2, 3, 4], [3])).toEqual([3, 1, 2, 4]);
    expect(applyTapOrder([1, 2, 3, 4], [4, 2, 1, 3])).toEqual([4, 2, 1, 3]);
    expect(applyTapOrder([1, 2, 3], [])).toEqual([1, 2, 3]);
  });
});

describe('finalChildIds', () => {
  it('keeps the ordered list, appends newly checked, drops unchecked', () => {
    expect(finalChildIds([3, 1, 2], [1, 2, 3])).toEqual([3, 1, 2]);
    expect(finalChildIds([3, 1, 2], [1, 2, 3, 5])).toEqual([3, 1, 2, 5]);
    expect(finalChildIds([3, 1, 2], [2, 3])).toEqual([3, 2]);
  });
});
