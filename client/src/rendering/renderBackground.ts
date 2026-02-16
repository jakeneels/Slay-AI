// Background rendering

import type { Application, Texture } from 'pixi.js';
import { Assets, Graphics, Sprite } from 'pixi.js';
import { WIDTH, HEIGHT } from '../core/constants.js';
import { getGameState } from '../core/gameState.js';

/** All available battle maps — filenames in /assets/game/maps/ */
export const BATTLE_MAPS = [
  'overtaken-city.png',
  'ai-factory.png',
  'ai-nexus.png',
  'glowing-rift.png',
];

/** Pick a random map, optionally excluding the current one to avoid repeats. */
export function pickRandomMap(exclude?: string): string {
  const pool = exclude ? BATTLE_MAPS.filter(m => m !== exclude) : BATTLE_MAPS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Render the game background using the current map from game state.
 */
export function renderBackground(app: Application): void {
  const mapFile = getGameState().currentMap || BATTLE_MAPS[0];
  const mapPath = `/assets/game/maps/${mapFile}`;

  Assets.load(mapPath).then((texture: Texture) => {
    texture.source.scaleMode = 'nearest';
    const bgSprite = new Sprite(texture);
    bgSprite.x = 0;
    bgSprite.y = 0;
    bgSprite.width = WIDTH;
    bgSprite.height = HEIGHT;
    bgSprite.zIndex = -1000;
    app.stage.addChildAt(bgSprite, 0);
  }).catch(err => {
    console.warn(`Failed to load background map (${mapPath}):`, err);
    const bg = new Graphics();
    bg.rect(0, 0, WIDTH, HEIGHT).fill(0x0f0f0f);
    app.stage.addChild(bg);
  });
}

