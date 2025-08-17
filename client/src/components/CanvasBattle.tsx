import { Stage } from '@pixi/react';
import { useMemo } from 'react';
import { useBattleStore } from '../state/store';

const WIDTH = 900;
const HEIGHT = 360;

function UnitSprite({ x, y, name, isEnemy }: { x: number; y: number; name: string; isEnemy: boolean }) {
  return (
    <>
      <pixiGraphics
        x={x}
        y={y}
        draw={(g: any) => {
          g.clear();
          g.beginFill(isEnemy ? 0x8b0000 : 0x005f8b);
          g.drawRoundedRect(-40, -20, 80, 40, 8);
          g.endFill();
        }}
      />
      <pixiText text={name} x={x - 35} y={y - 34} style={{ fill: '#ccc', fontSize: 12 }} />
    </>
  );
}

export default function CanvasBattle() {
  const { state } = useBattleStore();

  const layout = useMemo(() => {
    const partyPositions = state.party
      .filter((c) => !c.isDefeated)
      .map((c, i) => ({ id: c.id, name: c.name, x: 160, y: 80 + i * 70, isEnemy: false }));
    const enemyPositions = state.enemies
      .filter((c) => !c.isDefeated)
      .map((c, i) => ({ id: c.id, name: c.name, x: WIDTH - 160, y: 80 + i * 70, isEnemy: true }));
    return [...partyPositions, ...enemyPositions];
  }, [state.party, state.enemies]);

  return (
    <Stage width={WIDTH} height={HEIGHT} options={{ background: 0x0b0b0b, antialias: true }}>
      <pixiGraphics
        draw={(g: any) => {
          g.clear();
          g.lineStyle(2, 0x1f2937, 1);
          g.drawRoundedRect(8, 8, WIDTH - 16, HEIGHT - 16, 12);
        }}
      />
      {layout.map((u) => (
        <UnitSprite key={u.id} x={u.x} y={u.y} name={u.name} isEnemy={u.isEnemy} />
      ))}
    </Stage>
  );
}


