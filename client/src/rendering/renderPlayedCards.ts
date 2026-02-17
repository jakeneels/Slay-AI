// Renders the played-cards stack on the right side of the screen.
// Shows the most recent cards played this combat, face-up.

import type { Application } from 'pixi.js';
import { Graphics, Text } from 'pixi.js';
import type { GameState } from '../core/types.js';
import { PLAYED_STACK_X, PLAYED_STACK_Y } from '../../animations.js';

const CARD_W = 100;
const CARD_H = 60;
const CARD_OVERLAP = 50;
const MAX_VISIBLE = 5;
const Z_PLAYED_STACK = 900;

/**
 * Render the played-cards stack on the right side of the screen.
 */
export function renderPlayedCardsStack(app: Application, gameState: GameState): void {
  const stack = gameState.playedCardsStack;
  if (stack.length === 0) return;

  const cardLibrary = gameState.cardLibrary;

  // Header label
  const header = new Text({
    text: 'Played',
    style: { fill: 0x9ca3af, fontSize: 11, fontWeight: 'bold' },
  });
  header.x = PLAYED_STACK_X;
  header.y = PLAYED_STACK_Y - 18;
  header.zIndex = Z_PLAYED_STACK;
  header.eventMode = 'none';
  app.stage.addChild(header);

  // Show only the most recent cards, oldest first (bottom of stack)
  const visible = stack.slice(-MAX_VISIBLE);

  visible.forEach((entry, i) => {
    const card = cardLibrary[entry.templateId];
    const cardName = card?.name ?? entry.templateId;
    const energyCost = card?.cost?.energy ?? 0;

    const x = PLAYED_STACK_X;
    const y = PLAYED_STACK_Y + i * CARD_OVERLAP;

    // Older cards fade slightly
    const ageFade = 0.5 + 0.5 * (i / Math.max(visible.length - 1, 1));

    const bg = new Graphics();
    bg.roundRect(0, 0, CARD_W, CARD_H, 6);
    bg.fill(0x1f2937);
    bg.stroke({ width: 1.5, color: entry.isPlayer ? 0x22c55e : 0xef4444 });
    bg.x = x;
    bg.y = y;
    bg.alpha = ageFade;
    bg.zIndex = Z_PLAYED_STACK + i;
    bg.eventMode = 'none';
    app.stage.addChild(bg);

    const name = new Text({
      text: cardName,
      style: { fill: 0xffffff, fontSize: 11, fontWeight: 'bold' },
    });
    name.x = x + 6;
    name.y = y + 6;
    name.alpha = ageFade;
    name.zIndex = Z_PLAYED_STACK + i;
    name.eventMode = 'none';
    app.stage.addChild(name);

    const cost = new Text({
      text: `${energyCost} energy`,
      style: { fill: 0x38bdf8, fontSize: 9 },
    });
    cost.x = x + 6;
    cost.y = y + 22;
    cost.alpha = ageFade;
    cost.zIndex = Z_PLAYED_STACK + i;
    cost.eventMode = 'none';
    app.stage.addChild(cost);

    const by = new Text({
      text: entry.playerName,
      style: { fill: entry.isPlayer ? 0x4ade80 : 0xff6b6b, fontSize: 9 },
    });
    by.x = x + 6;
    by.y = y + 36;
    by.alpha = ageFade;
    by.zIndex = Z_PLAYED_STACK + i;
    by.eventMode = 'none';
    app.stage.addChild(by);
  });
}
