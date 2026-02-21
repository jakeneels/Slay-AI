// Gear reward rarity drop weights – configurable via dev panel, persisted to localStorage.

export const GEAR_RARITY_KEYS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type GearRarityKey = (typeof GEAR_RARITY_KEYS)[number];

export const DEFAULT_GEAR_RARITY_DROP_WEIGHTS: Record<string, number> = {
  common: 35,
  rare: 20,
  epic: 15,
  legendary: 12,
  mythic: 10,
};

const STORAGE_KEY = 'slayai:devpanel:gear-rarity-weights';

function loadFromStorage(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(weights: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
  } catch {
    // localStorage unavailable – silently ignore
  }
}

/**
 * Get the drop weight for a given rarity.
 * Higher weight = more likely to be selected.
 */
export function getGearRarityDropWeight(rarity: string | undefined): number {
  if (!rarity) return 1;
  const key = rarity.toLowerCase();
  const stored = loadFromStorage();
  if (stored && typeof stored[key] === 'number') {
    return Math.max(0, stored[key]);
  }
  return DEFAULT_GEAR_RARITY_DROP_WEIGHTS[key] ?? 1;
}

/**
 * Get all rarity weights (custom + defaults merged).
 */
export function getGearRarityDropWeights(): Record<string, number> {
  const stored = loadFromStorage();
  const result = { ...DEFAULT_GEAR_RARITY_DROP_WEIGHTS };
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      if (typeof v === 'number') result[k] = Math.max(0, v);
    }
  }
  return result;
}

/**
 * Set the drop weight for a rarity. Persists to localStorage.
 */
export function setGearRarityDropWeight(rarity: string, value: number): void {
  const stored = loadFromStorage() ?? {};
  const key = rarity.toLowerCase();
  const num = Math.max(0, Number(value));
  if (num === (DEFAULT_GEAR_RARITY_DROP_WEIGHTS[key] ?? 1)) {
    delete stored[key];
  } else {
    stored[key] = num;
  }
  saveToStorage(stored);
}

/**
 * Reset all weights to defaults (clears dev panel overrides).
 */
export function resetGearRarityDropWeights(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
