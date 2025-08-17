import { useEffect, useRef } from 'react';
import { Application, Graphics, Text } from 'pixi.js';
import type { CardId, CharacterId, CharacterState } from '../domain/types';
import { useBattleStore } from '../state/store';

const WIDTH = 900;
const HEIGHT = 360;

export default function PixiCanvas({
  selectedCardId,
  onClickTarget,
}: {
  selectedCardId: CardId | null;
  onClickTarget: (id: CharacterId) => void;
}) {
  const { state } = useBattleStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const prevHpRef = useRef<Record<string, number>>({});
  const flashUntilRef = useRef<Record<string, number>>({});
  const lastPositionsRef = useRef<Record<string, { x: number; y: number; name: string; isEnemy: boolean }>>({});
  const fadingRef = useRef<Record<string, { x: number; y: number; name: string; isEnemy: boolean; alpha: number }>>({});
  const latestStateRef = useRef<{ party: CharacterState[]; enemies: CharacterState[] }>({ party: [], enemies: [] });
  const lastNowRef = useRef<number>(performance.now());

  // initialize once
  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!containerRef.current) return;
      const app = new Application();
      await app.init({
        width: WIDTH,
        height: HEIGHT,
        antialias: true,
        background: '#0b0b0b',
      });
      if (!isMounted) {
        app.destroy();
        return;
      }
      appRef.current = app;
      containerRef.current.appendChild(app.canvas as HTMLCanvasElement);

      // Ticker to animate flashes/fades and redraw
      app.ticker.add(() => {
        const now = performance.now();
        const dt = now - lastNowRef.current;
        lastNowRef.current = now;
        // expire flashes
        for (const [id, until] of Object.entries(flashUntilRef.current)) {
          if (now >= until) delete flashUntilRef.current[id];
        }
        // advance fades
        for (const id of Object.keys(fadingRef.current)) {
          const f = fadingRef.current[id];
          f.alpha = Math.max(0, f.alpha - dt / 1500); // 0.5s fade
          if (f.alpha <= 0) delete fadingRef.current[id];
        }
        renderScene();
      });
    })();
    return () => {
      isMounted = false;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  // On state change, detect damage/deaths and update latest state
  useEffect(() => {
    latestStateRef.current = { party: state.party, enemies: state.enemies };
    const all = [...state.party, ...state.enemies];
    const now = performance.now();
    // detect damage (hp drop)
    for (const c of all) {
      const prev = prevHpRef.current[c.id];
      if (prev !== undefined && c.currentHealth < prev) {
        flashUntilRef.current[c.id] = now + 180; // 180ms flash
      }
      prevHpRef.current[c.id] = c.currentHealth;
    }
    // detect deaths -> start fade from last known position
    for (const c of all) {
      if (c.isDefeated && !fadingRef.current[c.id]) {
        const last = lastPositionsRef.current[c.id];
        if (last) {
          fadingRef.current[c.id] = { ...last, alpha: 1 };
        }
      }
    }
    // also update immediately once
    renderScene();
  }, [state.party, state.enemies]);

  function renderScene() {
    const app = appRef.current;
    if (!app) return;
    const stage = app.stage;
    stage.removeChildren();

    // border
    const border = new Graphics();
    border.stroke({ width: 2, color: 0x1f2937, alpha: 1 });
    border.roundRect(8, 8, WIDTH - 16, HEIGHT - 16, 12);
    stage.addChild(border);

    const partyAlive = latestStateRef.current.party.filter((c) => !c.isDefeated);
    const enemiesAlive = latestStateRef.current.enemies.filter((c) => !c.isDefeated);

    // Draw party
    partyAlive.forEach((c, i) => {
      const pos = { x: 160, y: 80 + i * 70 };
      drawUnit(stage, c, pos.x, pos.y, false, flashUntilRef.current[c.id] !== undefined);
      lastPositionsRef.current[c.id] = { x: pos.x, y: pos.y, name: c.name, isEnemy: false };
    });
    // Draw enemies
    enemiesAlive.forEach((c, i) => {
      const pos = { x: WIDTH - 160, y: 80 + i * 70 };
      drawUnit(stage, c, pos.x, pos.y, true, flashUntilRef.current[c.id] !== undefined);
      lastPositionsRef.current[c.id] = { x: pos.x, y: pos.y, name: c.name, isEnemy: true };
    });

    // Draw fading defeated units
    for (const f of Object.values(fadingRef.current)) {
      drawFadingUnit(stage, f.x, f.y, f.name, f.isEnemy, f.alpha);
    }
  }

  function drawUnit(stage: any, c: CharacterState, x: number, y: number, isEnemy: boolean, flashing: boolean) {
    // body
    const body = new Graphics();
    body.fill({ color: isEnemy ? 0x8b0000 : 0x005f8b });
    body.roundRect(x - 40, y - 20, 80, 40, 8);
    // Make selectable when a card is selected and targeting allows it
    const selectable = isTargetSelectable(c.id);
    if (selectable) {
      body.eventMode = 'static';
      body.cursor = 'pointer';
      body.on('pointertap', () => onClickTarget(c.id));
    }
    stage.addChild(body);
    if (flashing) {
      const hl = new Graphics();
      hl.stroke({ width: 3, color: 0xffd166, alpha: 1 });
      hl.roundRect(x - 42, y - 22, 84, 44, 10);
      stage.addChild(hl);
    }
    if (selectable && selectedCardId) {
      const sel = new Graphics();
      sel.stroke({ width: 2, color: 0xf59e0b, alpha: 1 });
      sel.roundRect(x - 44, y - 24, 88, 48, 12);
      stage.addChild(sel);
    }
    // name
    const label = new Text({ text: c.name, style: { fill: 0xcccccc, fontSize: 12 } as any });
    label.x = x - 35;
    label.y = y - 34;
    stage.addChild(label);
    // HP bar
    const maxW = 60;
    const hpRatio = Math.max(0, Math.min(1, c.currentHealth / c.stats.maxHealth));
    const hpBg = new Graphics();
    hpBg.fill({ color: 0x2a2a2a });
    hpBg.roundRect(x - 30, y + 24, maxW, 6, 3);
    stage.addChild(hpBg);
    const hpFg = new Graphics();
    hpFg.fill({ color: 0xff4d4d });
    hpFg.roundRect(x - 30, y + 24, maxW * hpRatio, 6, 3);
    stage.addChild(hpFg);
    // Energy bar
    const enRatio = Math.max(0, Math.min(1, c.currentEnergy / c.stats.maxEnergy));
    const enBg = new Graphics();
    enBg.fill({ color: 0x2a2a2a });
    enBg.roundRect(x - 30, y + 32, maxW, 4, 2);
    stage.addChild(enBg);
    const enFg = new Graphics();
    enFg.fill({ color: 0x3aa7ff });
    enFg.roundRect(x - 30, y + 32, maxW * enRatio, 4, 2);
    stage.addChild(enFg);
  }

  function isTargetSelectable(targetId: CharacterId): boolean {
    if (!selectedCardId) return false;
    const card = state.cardLibrary[selectedCardId];
    if (!card) return false;
    const isEnemy = state.enemies.some((c) => c.id === targetId && !c.isDefeated);
    const isAlly = state.party.some((c) => c.id === targetId && !c.isDefeated);
    const activeId = state.activeCharacterId;
    if (card.targetSide === 'enemy') return isEnemy;
    if (card.targetSide === 'ally') return isAlly;
    if (card.targetSide === 'self') return targetId === activeId;
    return true;
  }

  function drawFadingUnit(stage: any, x: number, y: number, name: string, isEnemy: boolean, alpha: number) {
    const body = new Graphics();
    body.alpha = alpha;
    body.fill({ color: isEnemy ? 0x8b0000 : 0x005f8b });
    body.roundRect(x - 40, y - 20, 80, 40, 8);
    stage.addChild(body);
    const label = new Text({ text: name, style: { fill: 0x999999, fontSize: 12 } as any });
    label.alpha = alpha;
    label.x = x - 35;
    label.y = y - 34;
    stage.addChild(label);
  }

  return <div ref={containerRef} />;
}


