import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { render, setApp } from '../../rendering/renderer.js';
import { createMockCharacter, createMockGameState } from '../utils/test-helpers.js';
import { setGameState } from '../../core/gameState.js';

const {
  renderBackgroundMock,
  renderLanesMock,
  renderCharactersMock,
  renderHandMock,
  renderTurnInfoMock,
  renderCardTooltipMock,
  renderStatusTooltipMock,
  renderCharacterTooltipMock,
  renderDevPanelMock,
  renderVictoryModalMock,
  renderPlayedCardsStackMock,
  renderPreFightModalMock,
  confirmPreFightLineupMock,
  getNoPreFightSetupSettingMock,
  pickRandomMapMock,
} = vi.hoisted(() => ({
  renderBackgroundMock: vi.fn(),
  renderLanesMock: vi.fn(),
  renderCharactersMock: vi.fn(),
  renderHandMock: vi.fn(),
  renderTurnInfoMock: vi.fn(),
  renderCardTooltipMock: vi.fn(),
  renderStatusTooltipMock: vi.fn(),
  renderCharacterTooltipMock: vi.fn(),
  renderDevPanelMock: vi.fn(),
  renderVictoryModalMock: vi.fn(),
  renderPlayedCardsStackMock: vi.fn(),
  renderPreFightModalMock: vi.fn(),
  confirmPreFightLineupMock: vi.fn(),
  getNoPreFightSetupSettingMock: vi.fn(() => false),
  pickRandomMapMock: vi.fn(() => 'test_map'),
}));

vi.mock('../../rendering/renderBackground.js', () => ({
  renderBackground: renderBackgroundMock,
  pickRandomMap: pickRandomMapMock,
}));
vi.mock('../../rendering/renderLanes.js', () => ({
  cleanupLaneAnimations: vi.fn(),
  renderLanes: renderLanesMock,
}));
vi.mock('../../rendering/renderCharacters.js', () => ({
  renderCharacters: renderCharactersMock,
}));
vi.mock('../../rendering/renderHand.js', () => ({
  renderHand: renderHandMock,
}));
vi.mock('../../rendering/renderUI.js', () => ({
  renderTurnInfo: renderTurnInfoMock,
}));
vi.mock('../../rendering/renderCardTooltip.js', () => ({
  renderCardTooltip: renderCardTooltipMock,
}));
vi.mock('../../rendering/renderStatusTooltip.js', () => ({
  renderStatusTooltip: renderStatusTooltipMock,
}));
vi.mock('../../rendering/renderCharacterTooltip.js', () => ({
  renderCharacterTooltip: renderCharacterTooltipMock,
}));
vi.mock('../../rendering/devPanel.js', () => ({
  renderDevPanel: renderDevPanelMock,
}));
vi.mock('../../rendering/renderVictoryModal.js', () => ({
  renderVictoryModal: renderVictoryModalMock,
}));
vi.mock('../../rendering/renderPlayedCards.js', () => ({
  renderPlayedCardsStack: renderPlayedCardsStackMock,
}));
vi.mock('../../rendering/renderPreFightModal.js', () => ({
  renderPreFightModal: renderPreFightModalMock,
}));
vi.mock('../../core/preFight.js', () => ({
  confirmPreFightLineup: confirmPreFightLineupMock,
}));
vi.mock('../../rendering/preFightDisplaySettings.js', () => ({
  getNoPreFightSetupSetting: () => getNoPreFightSetupSettingMock(),
}));
vi.mock('../../animations.js', () => ({
  renderActiveCardShowcases: vi.fn(),
  renderActiveSpriteSheetOverlays: vi.fn(),
}));
vi.mock('../../rendering/tooltipState.js', () => ({
  beginCardHoverFrame: vi.fn(),
  getHoveredCard: () => ({ cardId: null }),
  reconcileHoveredCardState: vi.fn(),
  reconcileHoveredCharacterState: vi.fn(),
  reconcileHoveredStatusState: vi.fn(),
  setCardHoverPointerPosition: vi.fn(),
}));

function createMockApp(): Application {
  return {
    stage: {
      removeChildren: vi.fn(),
      sortableChildren: false,
      addChild: vi.fn(),
    },
    renderer: {
      events: {
        pointer: null,
      },
    },
  } as unknown as Application;
}

describe('renderer integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const alivePlayer = createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100 });
    setGameState(
      createMockGameState({
        characters: [alivePlayer],
        currentPlayerId: 'ally_a',
        turnQueue: ['ally_a'],
        turnQueueIndex: 0,
      }),
    );
    setApp(createMockApp());
  });

  it('renders normal combat frame when pre-fight is inactive', () => {
    render();

    expect(renderBackgroundMock).toHaveBeenCalledTimes(1);
    expect(renderCharactersMock).toHaveBeenCalledTimes(1);
    expect(renderHandMock).toHaveBeenCalledTimes(1);
    expect(renderTurnInfoMock).toHaveBeenCalledTimes(1);
    expect(renderPreFightModalMock).not.toHaveBeenCalled();
    expect(confirmPreFightLineupMock).not.toHaveBeenCalled();
  });

  it('renders pre-fight modal and skips combat UI when pre-fight is active', () => {
    setGameState(
      createMockGameState({
        characters: [createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100 })],
        currentPlayerId: 'ally_a',
        turnQueue: ['ally_a'],
        turnQueueIndex: 0,
        preFight: {
          active: true,
          page: 'lineup',
          useDefaultCards: true,
          candidateAllyIds: ['ally_a'],
          selectedAllyIds: ['ally_a'],
          requiredLineupSize: 1,
          source: 'run_start',
          pendingThreatScore: null,
          activeCardEditorAllyId: 'ally_a',
          activeCardSlotIndex: 0,
          cardCatalogScroll: 0,
          cardPoolIds: [],
          cardsByAlly: { ally_a: [] },
          threatBudget: 0,
        },
      }),
    );

    render();

    expect(renderPreFightModalMock).toHaveBeenCalledTimes(1);
    expect(renderHandMock).not.toHaveBeenCalled();
    expect(renderTurnInfoMock).not.toHaveBeenCalled();
  });

  it('auto-confirms pre-fight when no-setup setting is enabled', () => {
    getNoPreFightSetupSettingMock.mockReturnValue(true);
    setGameState(
      createMockGameState({
        characters: [createMockCharacter({ id: 'ally_a', isPlayer: true, hp: 100 })],
        currentPlayerId: 'ally_a',
        turnQueue: ['ally_a'],
        turnQueueIndex: 0,
        preFight: {
          active: true,
          page: 'lineup',
          useDefaultCards: true,
          candidateAllyIds: ['ally_a'],
          selectedAllyIds: ['ally_a'],
          requiredLineupSize: 1,
          source: 'run_start',
          pendingThreatScore: null,
          activeCardEditorAllyId: 'ally_a',
          activeCardSlotIndex: 0,
          cardCatalogScroll: 0,
          cardPoolIds: [],
          cardsByAlly: { ally_a: [] },
          threatBudget: 0,
        },
      }),
    );

    render();

    expect(confirmPreFightLineupMock).toHaveBeenCalledTimes(1);
    expect(renderPreFightModalMock).not.toHaveBeenCalled();
  });
});
