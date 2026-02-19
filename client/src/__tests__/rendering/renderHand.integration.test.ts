import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { renderHand } from '../../rendering/renderHand.js';
import { getGameState, setGameState, setSelectedCardId } from '../../core/gameState.js';
import { createMockCard, createMockCharacter, createMockGameState } from '../utils/test-helpers.js';

const renderCardTileMock = vi.fn();
const playCardMock = vi.fn().mockResolvedValue(undefined);
const renderCallbackMock = vi.fn();

vi.mock('../../rendering/cardTileRenderer.js', () => ({
  renderCardTile: (...args: unknown[]) => renderCardTileMock(...args),
}));

vi.mock('../../core/combat.js', () => ({
  playCard: (...args: unknown[]) => playCardMock(...args),
  getSuppressionCostPenalty: () => 0,
}));

vi.mock('../../rendering/renderer.js', () => ({
  render: () => renderCallbackMock(),
}));

function createMockApp(): Application {
  return {
    stage: {
      addChild: vi.fn(),
      removeChildren: vi.fn(),
      sortableChildren: false,
    },
    renderer: {
      events: {
        pointer: null,
      },
    },
  } as unknown as Application;
}

describe('renderHand integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSelectedCardId(null);
    setGameState(createMockGameState());
  });

  it('renders player cards through cardTileRenderer with interactive options', () => {
    const player = createMockCharacter({
      id: 'player_1',
      isPlayer: true,
      hand: ['instance_1'],
      energy: 3,
    });
    const card = createMockCard({
      id: 'strike',
      targeting: 'enemy',
      targetSide: 'enemy',
      cost: { energy: 1 },
    });
    const state = getGameState();
    state.characters = [player];
    state.currentPlayerId = 'player_1';
    state.cardLibrary = { strike: card };
    state.cardInstances = {
      instance_1: { ...card, instanceId: 'instance_1', templateId: 'strike' },
    };

    renderHand(createMockApp(), state);

    expect(renderCardTileMock).toHaveBeenCalledTimes(1);
    const [, renderedCard, , , options] = renderCardTileMock.mock.calls[0];
    expect(renderedCard.id).toBe('strike');
    expect(options.interactive).toBe(true);
    expect(options.dimmed).toBe(false);
    expect(typeof options.onClick).toBe('function');
  });

  it('plays self-targeted selected card immediately on click', async () => {
    const player = createMockCharacter({
      id: 'player_1',
      isPlayer: true,
      hand: ['instance_1'],
      energy: 3,
    });
    const card = createMockCard({
      id: 'self_heal',
      targeting: 'self',
      targetSide: 'self',
      cost: { energy: 1 },
      effects: [{ kind: 'heal', amount: 5 }],
    });
    const state = getGameState();
    state.characters = [player];
    state.currentPlayerId = 'player_1';
    state.cardLibrary = { self_heal: card };
    state.cardInstances = {
      instance_1: { ...card, instanceId: 'instance_1', templateId: 'self_heal' },
    };
    setSelectedCardId('instance_1');

    renderHand(createMockApp(), state);

    const [, , , , options] = renderCardTileMock.mock.calls[0];
    await options.onClick();

    expect(playCardMock).toHaveBeenCalledWith('instance_1', undefined, expect.any(Function));
    expect(getGameState().selectedCardId).toBeNull();
  });
});
