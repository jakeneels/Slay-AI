import { describe, it, expect } from 'vitest';
import { shuffleArray } from '../../utils/shuffle.js';

describe('shuffleArray', () => {
  it('should preserve all elements', () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(original);
    
    expect(shuffled.length).toBe(original.length);
    expect(shuffled.sort()).toEqual(original.sort());
  });

  it('should not mutate the original array', () => {
    const original = [1, 2, 3, 4, 5];
    const originalCopy = [...original];
    shuffleArray(original);
    
    expect(original).toEqual(originalCopy);
  });

  it('should handle empty array', () => {
    const original: number[] = [];
    const shuffled = shuffleArray(original);
    
    expect(shuffled).toEqual([]);
    expect(shuffled.length).toBe(0);
  });

  it('should handle single element array', () => {
    const original = [42];
    const shuffled = shuffleArray(original);
    
    expect(shuffled).toEqual([42]);
  });

  it('should handle array with duplicate elements', () => {
    const original = [1, 2, 2, 3, 3, 3];
    const shuffled = shuffleArray(original);
    
    expect(shuffled.length).toBe(original.length);
    expect(shuffled.sort()).toEqual(original.sort());
  });

  it('should produce different orders on multiple shuffles (statistical test)', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results: string[] = [];
    
    // Shuffle multiple times and collect results
    for (let i = 0; i < 10; i++) {
      const shuffled = shuffleArray(original);
      results.push(JSON.stringify(shuffled));
    }
    
    // At least some shuffles should produce different orders
    // (unlikely all 10 would be identical)
    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBeGreaterThan(1);
  });

  it('should work with different data types', () => {
    const strings = ['a', 'b', 'c', 'd'];
    const shuffledStrings = shuffleArray(strings);
    expect(shuffledStrings.length).toBe(strings.length);
    expect(shuffledStrings.sort()).toEqual(strings.sort());
    
    const objects = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const shuffledObjects = shuffleArray(objects);
    expect(shuffledObjects.length).toBe(objects.length);
  });
});

