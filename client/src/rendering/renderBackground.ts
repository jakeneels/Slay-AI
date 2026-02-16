// Background rendering

import type { Application, Texture } from 'pixi.js';
import { Assets, Graphics, Sprite } from 'pixi.js';
import { WIDTH, HEIGHT } from '../core/constants.js';
import { getGameState } from '../core/gameState.js';

/** Build-time discovery of map PNGs in /public/assets/game/maps. */
const MAP_FILE_MODULES = import.meta.glob('../../public/assets/game/maps/*.png', {
  eager: true,
});

/** All available battle maps (derived from discovered files). */
export const BATTLE_MAPS = Object.keys(MAP_FILE_MODULES)
  .map(path => path.split('/').pop())
  .filter((name): name is string => !!name);

/** Last-resort map if discovery fails in a given environment. */
const FALLBACK_MAP = 'ai-nexus.png';

/**
 * Returns the eligible map pool for a wave.
 * Future wave tiers/boss maps can branch here.
 */
export function getMapPoolForWave(_waveNumber?: number): string[] {
  return BATTLE_MAPS.length > 0 ? BATTLE_MAPS : [FALLBACK_MAP];
}

/** Pick a random map, optionally excluding the current one to avoid repeats. */
export function pickRandomMap(exclude?: string, waveNumber?: number): string {
  const availableMaps = getMapPoolForWave(waveNumber);
  const pool = exclude ? availableMaps.filter(m => m !== exclude) : availableMaps;
  if (pool.length === 0) {
    return availableMaps[0];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Render the game background using the current map from game state.
 */
export function renderBackground(app: Application): void {
  const mapFile = getGameState().currentMap || pickRandomMap();
  const base = import.meta.env.BASE_URL ?? '/';
  const mapPath = `${base}assets/game/maps/${mapFile}`;

  Assets.load(mapPath).then((texture: Texture) => {
    texture.source.scaleMode = 'nearest';
    const bgSprite = new Sprite(texture);
    // Keep map art aspect ratio to avoid horizontal squish.
    // Use "cover" behavior so the battlefield is fully filled.
    const scale = Math.max(WIDTH / texture.width, HEIGHT / texture.height);
    bgSprite.width = texture.width * scale;
    bgSprite.height = texture.height * scale;
    bgSprite.x = (WIDTH - bgSprite.width) / 2;
    bgSprite.y = (HEIGHT - bgSprite.height) / 2;
    bgSprite.zIndex = -1000;
    app.stage.addChildAt(bgSprite, 0);
  }).catch(err => {
    console.warn(`Failed to load background map (${mapPath}):`, err);
    const bg = new Graphics();
    bg.rect(0, 0, WIDTH, HEIGHT).fill(0x0f0f0f);
    app.stage.addChild(bg);
  });
}

