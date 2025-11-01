// Background rendering

import type { Application, Texture } from 'pixi.js';
import { Assets, Graphics, Sprite } from 'pixi.js';
import { WIDTH, HEIGHT } from '../core/constants.js';

/**
 * Render the game background
 */
export function renderBackground(app: Application): void {
  // Load and display the map background
  Assets.load('/assets/game/maps/overtaken-city.png').then((texture: Texture) => {
    // Set texture to use nearest neighbor for crisp pixel art
    texture.source.scaleMode = 'nearest';
    const bgSprite = new Sprite(texture);
    bgSprite.x = 0;
    bgSprite.y = 0;
    bgSprite.width = WIDTH;
    bgSprite.height = HEIGHT;
    app.stage.addChildAt(bgSprite, 0); // Add at bottom layer
  }).catch(err => {
    console.warn('Failed to load background map:', err);
    // Fallback to solid color
    const bg = new Graphics();
    bg.rect(0, 0, WIDTH, HEIGHT).fill(0x0f0f0f);
    app.stage.addChild(bg);
  });
}

