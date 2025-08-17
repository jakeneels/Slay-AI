import seedrandom from 'seedrandom';

export class DeterministicRng {
  private rng: seedrandom.PRNG;

  constructor(seed: string) {
    this.rng = seedrandom(seed);
  }

  /** Returns a float in [0,1) */
  next(): number {
    return this.rng();
  }

  /** Returns integer in [0, maxExclusive) */
  nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  shuffleInPlace<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}


