// Dev Panel - HTML sidebar showing game internals (deck, discard pile, etc.)

import type { GameState, GameModifier, Card, Character } from '../core/types.js';
import { getModifierRegistry } from '../core/modifiers.js';
import { getGameState } from '../core/gameState.js';
import {
  RANGE_OPTIMAL_BONUS, RANGE_PENALTY_PER_SLOT, RANGE_MODIFIER_MIN, RANGE_MODIFIER_MAX,
  SUPPRESSION_DISTANCE, SUPPRESSION_RANGED_THRESHOLD, SUPPRESSION_BASE_COST, SUPPRESSION_STACK_COST,
} from '../core/constants.js';
import {
  WAVE_BASE_BUDGET, WAVE_BUDGET_INCREMENT, WAVE_BUDGET_JITTER, WAVE_MIN_ENEMIES, WAVE_MAX_ENEMIES,
} from '../core/waveGenerator.js';
import { WAVE_HEAL_FRACTION } from '../core/waveTransition.js';
import { getShowLanesSetting, setShowLanesSetting } from './renderLanes.js';
import {
  getNoPreFightSetupSetting,
  getShowRollbackButtonSetting,
  setNoPreFightSetupSetting,
  setShowRollbackButtonSetting,
} from './preFightDisplaySettings.js';

let initialized = false;
const ACS_TARGET = 'acs_wave4_boss';
const ACS_MOD_ID = `devpanel:global:${ACS_TARGET}`;

// Track which sections are collapsed (persists across renders)
const collapsedSections = new Set<string>();
const PANEL_WIDTH_STORAGE_KEY = 'slayai:devpanel:width';
const PANEL_WIDTH_MIN = 240;
const PANEL_WIDTH_MAX = 720;

// ── Balance tweak definitions ────────────────────────────────────────
// Each entry maps a modifier target to its default value and label.
interface TweakDef {
  target: string;
  label: string;
  defaultValue: number;
  step: number;      // input step
  min?: number;
  max?: number;
}

const GLOBAL_TWEAKS: TweakDef[] = [
  { target: 'damage_dealt',              label: 'Damage Dealt (mult)',     defaultValue: 1.0,  step: 0.05, min: 0 },
  { target: 'damage_received',           label: 'Damage Received (mult)', defaultValue: 1.0,  step: 0.05, min: 0 },
  { target: 'heal_amount',               label: 'Heal Amount (mult)',     defaultValue: 1.0,  step: 0.05, min: 0 },
  { target: 'block_amount',              label: 'Block Amount (mult)',    defaultValue: 1.0,  step: 0.05, min: 0 },
  { target: 'suppression_distance',      label: 'Suppression Distance',   defaultValue: SUPPRESSION_DISTANCE,      step: 1, min: 0, max: 8 },
  { target: 'suppression_ranged_threshold', label: 'Suppression Range Thr', defaultValue: SUPPRESSION_RANGED_THRESHOLD, step: 1, min: 1, max: 8 },
  { target: 'suppression_base_cost',     label: 'Suppression Base Cost',  defaultValue: SUPPRESSION_BASE_COST,     step: 1, min: 0, max: 10 },
  { target: 'suppression_stack_cost',    label: 'Suppression Stack Cost', defaultValue: SUPPRESSION_STACK_COST,    step: 1, min: 0, max: 10 },
  { target: 'range_optimal_bonus',       label: 'Range Optimal Bonus',    defaultValue: RANGE_OPTIMAL_BONUS,       step: 0.05, min: 0, max: 1 },
  { target: 'range_penalty_per_slot',    label: 'Range Penalty/Slot',     defaultValue: RANGE_PENALTY_PER_SLOT,    step: 0.05, min: 0, max: 1 },
  { target: 'range_modifier_min',        label: 'Range Modifier Floor',   defaultValue: RANGE_MODIFIER_MIN,        step: 0.05, min: 0, max: 2 },
  { target: 'range_modifier_max',        label: 'Range Modifier Cap',     defaultValue: RANGE_MODIFIER_MAX,        step: 0.05, min: 0, max: 3 },
  // Wave generation tuning
  { target: 'wave_base_budget',          label: 'Wave Base Budget',       defaultValue: WAVE_BASE_BUDGET,          step: 10, min: 20, max: 500 },
  { target: 'wave_budget_increment',     label: 'Wave Budget Incr.',      defaultValue: WAVE_BUDGET_INCREMENT,     step: 5,  min: 0,  max: 100 },
  { target: 'wave_budget_jitter',        label: 'Wave Budget Jitter',     defaultValue: WAVE_BUDGET_JITTER,        step: 0.05, min: 0, max: 1 },
  { target: 'wave_min_enemies',          label: 'Wave Min Enemies',       defaultValue: WAVE_MIN_ENEMIES,          step: 1, min: 1, max: 4 },
  { target: 'wave_max_enemies',          label: 'Wave Max Enemies',       defaultValue: WAVE_MAX_ENEMIES,          step: 1, min: 1, max: 8 },
  { target: 'wave_heal_fraction',        label: 'Wave Heal Fraction',     defaultValue: WAVE_HEAL_FRACTION,        step: 0.05, min: 0, max: 1 },
];

const CHAR_TWEAKS: TweakDef[] = [
  { target: 'maxEnergy',      label: 'Max Energy',       defaultValue: 0, step: 1, min: -10, max: 20 },
  { target: 'maxHp',          label: 'Max HP',           defaultValue: 0, step: 5, min: -100, max: 200 },
  { target: 'drawCount',      label: 'Draw Count',       defaultValue: 0, step: 1, min: -5, max: 10 },
  { target: 'maxHandSize',    label: 'Max Hand Size',    defaultValue: 0, step: 1, min: -5, max: 10 },
  { target: 'speed', label: 'Speed (add)', defaultValue: 0, step: 1, min: -5, max: 10 },
  { target: 'damage_dealt',   label: 'Damage Dealt (add)',  defaultValue: 0, step: 1, min: -20, max: 50 },
  { target: 'block_amount',   label: 'Block Amount (add)',  defaultValue: 0, step: 1, min: -20, max: 50 },
];

/**
 * Set up the dev panel toggle behaviour (call once)
 */
export function initDevPanel(): void {
  if (initialized) return;
  initialized = true;

  const panel = document.getElementById('devPanel');
  const toggle = document.getElementById('devPanelToggle');
  const resizeHandle = document.getElementById('devPanelResizeHandle');
  if (!panel || !toggle) return;

  let expandedWidth = loadDevPanelWidth() ?? clamp(Math.round(panel.getBoundingClientRect().width), PANEL_WIDTH_MIN, PANEL_WIDTH_MAX);
  if (panel.classList.contains('expanded')) {
    applyExpandedPanelWidth(panel, expandedWidth);
  }

  toggle.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    panel.classList.toggle('expanded');
    if (panel.classList.contains('expanded')) {
      applyExpandedPanelWidth(panel, expandedWidth);
    } else {
      panel.style.removeProperty('width');
    }
  });

  // Forward scroll events from the toggle bar to the content area
  const content = document.getElementById('devPanelContent');
  toggle.addEventListener('wheel', (e) => {
    if (content) {
      content.scrollTop += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  // Event delegation for collapsible section headers
  if (content) {
    content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const header = target.closest('.dev-section-title') as HTMLElement | null;
      if (!header) return;
      const sectionId = header.dataset.section;
      if (!sectionId) return;

      if (collapsedSections.has(sectionId)) {
        collapsedSections.delete(sectionId);
      } else {
        collapsedSections.add(sectionId);
      }

      // Toggle body visibility immediately without full re-render
      const body = header.nextElementSibling as HTMLElement | null;
      if (body && body.classList.contains('dev-section-body')) {
        body.style.display = collapsedSections.has(sectionId) ? 'none' : '';
      }

      // Update chevron
      const chevron = header.querySelector('.dev-chevron') as HTMLElement | null;
      if (chevron) {
        chevron.textContent = collapsedSections.has(sectionId) ? '▸' : '▾';
      }
    });

    content.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (!input || input.type !== 'checkbox') return;
      const toggle = input.dataset.devToggle;
      if (toggle === 'show-lanes') {
        setShowLanesSetting(input.checked);
        requestFullRender();
        return;
      }
      if (toggle === 'no-prefight-setup') {
        setNoPreFightSetupSetting(input.checked);
        requestFullRender();
        return;
      }
      if (toggle === 'show-rollback-button') {
        setShowRollbackButtonSetting(input.checked);
        requestFullRender();
        return;
      }
      if (toggle === 'acs') {
        setAcsEnabled(input.checked);
        requestFullRender();
      }
    });
  }

  // Width resize drag handle
  if (resizeHandle) {
    resizeHandle.addEventListener('pointerdown', (e) => {
      if (!panel.classList.contains('expanded')) return;
      e.preventDefault();

      const startX = e.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      const previousTransition = panel.style.transition;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      panel.style.transition = 'none';

      const onPointerMove = (moveEvent: PointerEvent): void => {
        // Right panel grows when dragging the handle left.
        const delta = startX - moveEvent.clientX;
        expandedWidth = clamp(Math.round(startWidth + delta), PANEL_WIDTH_MIN, PANEL_WIDTH_MAX);
        applyExpandedPanelWidth(panel, expandedWidth);
      };

      const stopResize = (): void => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', stopResize);
        document.removeEventListener('pointercancel', stopResize);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        panel.style.transition = previousTransition;
        persistDevPanelWidth(expandedWidth);
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', stopResize);
      document.addEventListener('pointercancel', stopResize);
    });
  }

  // Create balance tweaks container (stable DOM, not wiped by renderDevPanel)
  initBalanceTweaks();
}

/**
 * Render dev panel contents – called every game render cycle
 */
export function renderDevPanel(gameState: GameState): void {
  // Write to the dynamic sub-container so we don't wipe the stable balance tweaks section
  const container = document.getElementById('devPanelDynamic') || document.getElementById('devPanelContent');
  if (!container) return;

  const players = gameState.characters.filter(c => c.isPlayer);
  const enemies = gameState.characters.filter(c => !c.isPlayer);

  // Build HTML
  let html = '';

  // ── Display options section ──
  html += renderCollapsibleSection('display-options', 'Display', () => {
    const checked = getShowLanesSetting() ? 'checked' : '';
    const noPreFightSetupChecked = getNoPreFightSetupSetting() ? 'checked' : '';
    const showRollbackButtonChecked = getShowRollbackButtonSetting() ? 'checked' : '';
    const acsChecked = isAcsEnabled() ? 'checked' : '';
    return `
      <label style="display:flex;align-items:center;gap:6px;color:#d1d5db;font-size:11px;cursor:pointer;">
        <input type="checkbox" data-dev-toggle="show-lanes" ${checked} />
        <span>Show visible lanes</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;color:#d1d5db;font-size:11px;cursor:pointer;margin-top:6px;">
        <input type="checkbox" data-dev-toggle="no-prefight-setup" ${noPreFightSetupChecked} />
        <span>No pre-fight setup</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;color:#d1d5db;font-size:11px;cursor:pointer;margin-top:6px;">
        <input type="checkbox" data-dev-toggle="show-rollback-button" ${showRollbackButtonChecked} />
        <span>Show rollback button</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;color:#d1d5db;font-size:11px;cursor:pointer;margin-top:6px;">
        <input type="checkbox" data-dev-toggle="acs" ${acsChecked} />
        <span>ACS</span>
      </label>
    `;
  });

  // ── Combat Log section ──
  html += renderCollapsibleSection('combat-log', 'Combat Log', () => {
    return renderCombatLogBody(gameState);
  });

  // ── Draw Pile / Deck section ──
  html += renderCollapsibleSection('draw-piles', 'Draw Piles', () => {
    let inner = '';
    for (const char of players) {
      inner += renderCharacterDeck(char, gameState, false);
    }
    for (const char of enemies) {
      inner += renderCharacterDeck(char, gameState, true);
    }
    return inner;
  });

  // ── Discard Piles section ──
  html += renderCollapsibleSection('discard-piles', 'Discard Piles', () => {
    let inner = '';
    for (const char of players) {
      inner += renderCharacterDiscard(char, gameState, false);
    }
    for (const char of enemies) {
      inner += renderCharacterDiscard(char, gameState, true);
    }
    return inner;
  });

  container.innerHTML = html;
}

// ─── Collapsible section wrapper ──────────────────────────

function renderCollapsibleSection(id: string, title: string, renderBody: () => string): string {
  const isCollapsed = collapsedSections.has(id);
  const chevron = isCollapsed ? '▸' : '▾';
  const bodyDisplay = isCollapsed ? ' style="display:none;"' : '';

  let html = `<div class="dev-section">`;
  html += `<div class="dev-section-title" data-section="${id}"><span class="dev-chevron">${chevron}</span> ${title}</div>`;
  html += `<div class="dev-section-body"${bodyDisplay}>`;
  html += renderBody();
  html += `</div>`;
  html += `</div>`;
  return html;
}

function requestFullRender(): void {
  // Dynamic import avoids a hard module cycle between devPanel and renderer.
  void import('./renderer.js')
    .then(({ render }) => render())
    .catch(() => {
      // Ignore render request failures in dev tooling.
    });
}

// ─── Helpers ───────────────────────────────────────────────

function renderCharacterDeck(char: Character, gameState: GameState, isEnemy: boolean): string {
  const deckCards = aggregateCards(char.deck, gameState);
  const enemyClass = isEnemy ? ' enemy' : '';
  const alive = char.hp > 0;
  const nameStyle = alive ? '' : ' style="opacity:0.4; text-decoration:line-through;"';

  let html = `<div class="dev-character-name${enemyClass}"${nameStyle}>${char.name}</div>`;
  html += `<div class="dev-deck-stats">Draw pile: ${char.deck.length} &nbsp;|&nbsp; Hand: ${char.hand.length} &nbsp;|&nbsp; Discard: ${char.discardPile.length}</div>`;

  if (deckCards.length === 0) {
    html += `<div class="dev-card-row"><span class="dev-card-name" style="color:#4b5563;font-style:italic;">Empty</span></div>`;
  } else {
    for (const entry of deckCards) {
      const rarityClass = entry.card ? `dev-rarity-${entry.card.rarity || 'common'}` : '';
      html += `<div class="dev-card-row ${rarityClass}">`;
      html += `<span class="dev-card-name">${entry.name}</span>`;
      html += `<span>`;
      html += `<span class="dev-card-cost">${entry.card ? entry.card.cost.energy + '⚡' : ''}</span>`;
      if (entry.count > 1) {
        html += `<span class="dev-card-count">×${entry.count}</span>`;
      }
      html += `</span>`;
      html += `</div>`;
    }
  }

  return html;
}

function renderCharacterDiscard(char: Character, gameState: GameState, isEnemy: boolean): string {
  const discardCards = aggregateCards(char.discardPile, gameState);
  const enemyClass = isEnemy ? ' enemy' : '';
  const alive = char.hp > 0;
  const nameStyle = alive ? '' : ' style="opacity:0.4; text-decoration:line-through;"';

  let html = `<div class="dev-character-name${enemyClass}"${nameStyle}>${char.name}</div>`;

  if (discardCards.length === 0) {
    html += `<div class="dev-card-row"><span class="dev-card-name" style="color:#4b5563;font-style:italic;">Empty</span></div>`;
  } else {
    for (const entry of discardCards) {
      const rarityClass = entry.card ? `dev-rarity-${entry.card.rarity || 'common'}` : '';
      html += `<div class="dev-card-row ${rarityClass}">`;
      html += `<span class="dev-card-name">${entry.name}</span>`;
      html += `<span>`;
      html += `<span class="dev-card-cost">${entry.card ? entry.card.cost.energy + '⚡' : ''}</span>`;
      if (entry.count > 1) {
        html += `<span class="dev-card-count">×${entry.count}</span>`;
      }
      html += `</span>`;
      html += `</div>`;
    }
  }

  return html;
}

function renderCombatLogBody(gameState: GameState): string {
  const entries = gameState.combatLog;
  if (entries.length === 0) {
    return `<div class="dev-log-entry" style="color:#4b5563;font-style:italic;">No entries yet</div>`;
  }

  let html = '';
  // Show all entries, newest at top
  const reversed = [...entries].reverse();
  for (let i = 0; i < reversed.length; i++) {
    const opacity = i < 3 ? 1 : Math.max(0.4, 1 - (i - 2) * 0.08);
    html += `<div class="dev-log-entry" style="opacity:${opacity};">${escapeHtml(reversed[i])}</div>`;
  }
  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface CardAggregate {
  name: string;
  count: number;
  card: Card | null;
}

/**
 * Aggregate card IDs into sorted, counted entries
 */
function aggregateCards(cardIds: string[], gameState: GameState): CardAggregate[] {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    // Resolve instance IDs to template IDs
    const instance = gameState.cardInstances[id];
    const templateId = instance ? instance.templateId : id;
    counts.set(templateId, (counts.get(templateId) || 0) + 1);
  }

  const result: CardAggregate[] = [];
  for (const [templateId, count] of counts) {
    const card = gameState.cardLibrary[templateId] || null;
    result.push({
      name: card ? card.name : templateId,
      count,
      card,
    });
  }

  // Sort by energy cost (ascending), then name
  result.sort((a, b) => {
    const costA = a.card?.cost.energy ?? 99;
    const costB = b.card?.cost.energy ?? 99;
    if (costA !== costB) return costA - costB;
    return a.name.localeCompare(b.name);
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Balance Tweaks panel – stable DOM managed independently from render()
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'slayai:devpanel:modifiers';

let balanceContainer: HTMLDivElement | null = null;
let selectedCharId: string | null = null;

/**
 * Create the balance tweaks container and attach event listeners.
 * Called once from initDevPanel.
 */
function initBalanceTweaks(): void {
  const content = document.getElementById('devPanelContent');
  if (!content) return;

  // Create the dynamic content div (combat log, decks) at the top
  const dynamicDiv = document.createElement('div');
  dynamicDiv.id = 'devPanelDynamic';
  content.appendChild(dynamicDiv);

  // Create a stable balance container BELOW the dynamic content.
  // renderDevPanel() writes to the dynamic div so it won't wipe this.
  balanceContainer = document.createElement('div');
  balanceContainer.id = 'devBalanceTweaks';
  balanceContainer.style.cssText = 'border-top: 1px solid #2a2d35; padding-top: 8px; margin-top: 8px;';
  content.appendChild(balanceContainer);

  // Restore persisted devpanel modifiers from localStorage
  restoreDevPanelModifiers();

  renderBalanceTweaks();

  // Event delegation for balance inputs
  balanceContainer.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.dataset.modTarget) return;
    handleBalanceInput(input);
  });

  // Event delegation for buttons
  balanceContainer.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!btn) return;

    if (btn.dataset.action === 'reset-devpanel') {
      getModifierRegistry().clearSource('devpanel');
      persistDevPanelModifiers();
      renderBalanceTweaks();
    } else if (btn.dataset.action === 'select-char') {
      selectedCharId = btn.dataset.charId || null;
      renderBalanceTweaks();
    } else if (btn.dataset.action === 'refresh-mods') {
      renderBalanceTweaks();
    }
  });

  // Collapsible sections within balance
  balanceContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const header = target.closest('.dev-section-title') as HTMLElement | null;
    if (!header) return;
    const sectionId = header.dataset.section;
    if (!sectionId) return;

    if (collapsedSections.has(sectionId)) {
      collapsedSections.delete(sectionId);
    } else {
      collapsedSections.add(sectionId);
    }

    const body = header.nextElementSibling as HTMLElement | null;
    if (body && body.classList.contains('dev-section-body')) {
      body.style.display = collapsedSections.has(sectionId) ? 'none' : '';
    }
    const chevron = header.querySelector('.dev-chevron') as HTMLElement | null;
    if (chevron) {
      chevron.textContent = collapsedSections.has(sectionId) ? '▸' : '▾';
    }
  });
}

/**
 * Render the full balance tweaks section.
 */
function renderBalanceTweaks(): void {
  if (!balanceContainer) return;

  const registry = getModifierRegistry();
  let html = '';

  // ── Global Tweaks ──
  html += renderBalanceCollapsible('bal-global', 'Balance: Global', () => {
    let inner = '';
    for (const tweak of GLOBAL_TWEAKS) {
      const devModId = `devpanel:global:${tweak.target}`;
      const devMod = registry.has(devModId) ? registry.getByTarget(tweak.target).find(m => m.id === devModId) : null;
      // For globals: "set" tweaks show the absolute value, "multiply" tweaks show the multiplier
      const isMultiplier = tweak.label.includes('mult');
      const op = isMultiplier ? 'multiply' : 'set';
      const currentValue = devMod?.value ?? tweak.defaultValue;

      inner += `<div class="dev-bal-row">`;
      inner += `<label class="dev-bal-label">${escapeHtml(tweak.label)}</label>`;
      inner += `<input type="number" class="dev-bal-input"
        data-mod-target="${tweak.target}"
        data-mod-scope="global"
        data-mod-op="${op}"
        data-default="${tweak.defaultValue}"
        value="${currentValue}"
        step="${tweak.step}"
        ${tweak.min !== undefined ? `min="${tweak.min}"` : ''}
        ${tweak.max !== undefined ? `max="${tweak.max}"` : ''}
      />`;
      inner += `</div>`;
    }
    inner += `<div style="margin-top:6px;text-align:right;">`;
    inner += `<button class="dev-bal-btn" data-action="reset-devpanel">Reset All</button>`;
    inner += `</div>`;
    return inner;
  });

  // ── Per-Character Tweaks ──
  html += renderBalanceCollapsible('bal-character', 'Balance: Character', () => {
    let inner = '';

    // Character selector buttons
    inner += `<div class="dev-bal-char-selector">`;
    // We need game state for character list - use a global reference
    const chars = getCharactersForBalance();
    for (const ch of chars) {
      const activeClass = selectedCharId === ch.id ? ' active' : '';
      const colorClass = ch.isPlayer ? '' : ' enemy';
      inner += `<button class="dev-bal-char-btn${activeClass}${colorClass}" data-action="select-char" data-char-id="${ch.id}">${escapeHtml(ch.name)}</button>`;
    }
    inner += `</div>`;

    if (selectedCharId) {
      for (const tweak of CHAR_TWEAKS) {
        const devModId = `devpanel:char:${selectedCharId}:${tweak.target}:add`;
        const devMod = registry.has(devModId) ? registry.getByTarget(tweak.target).find(m => m.id === devModId) : null;
        const currentValue = devMod?.value ?? tweak.defaultValue;

        inner += `<div class="dev-bal-row">`;
        inner += `<label class="dev-bal-label">${escapeHtml(tweak.label)}</label>`;
        inner += `<input type="number" class="dev-bal-input"
          data-mod-target="${tweak.target}"
          data-mod-scope="character"
          data-mod-char="${selectedCharId}"
          data-mod-op="add"
          data-default="${tweak.defaultValue}"
          value="${currentValue}"
          step="${tweak.step}"
          ${tweak.min !== undefined ? `min="${tweak.min}"` : ''}
          ${tweak.max !== undefined ? `max="${tweak.max}"` : ''}
        />`;
        inner += `</div>`;
      }
    } else {
      inner += `<div style="color:#4b5563; font-style:italic; padding:4px 0;">Select a character above</div>`;
    }

    return inner;
  });

  // ── Active Modifiers list ──
  html += renderBalanceCollapsible('bal-active-mods', 'Active Modifiers', () => {
    const allMods = registry.getAll();
    if (allMods.length === 0) {
      return `<div style="color:#4b5563; font-style:italic;">No modifiers loaded</div>`;
    }

    let inner = '';
    inner += `<div style="margin-bottom:4px;text-align:right;">`;
    inner += `<button class="dev-bal-btn" data-action="refresh-mods" style="font-size:9px;">Refresh</button>`;
    inner += `</div>`;
    // Group by source
    const bySource = new Map<string, GameModifier[]>();
    for (const mod of allMods) {
      const list = bySource.get(mod.source) || [];
      list.push(mod);
      bySource.set(mod.source, list);
    }

    for (const [source, mods] of bySource) {
      const sourceColor = source === 'devpanel' ? '#f59e0b' : source === 'balance' ? '#60a5fa' : '#9ca3af';
      inner += `<div style="color:${sourceColor}; font-size:10px; font-weight:600; margin-top:4px; text-transform:uppercase;">${escapeHtml(source)}</div>`;
      for (const mod of mods) {
        const scopeLabel = mod.scope.kind === 'global' ? 'global'
          : mod.scope.kind === 'character' ? `char:${mod.scope.characterId}`
          : mod.scope.kind === 'team' ? `team:${mod.scope.team}`
          : mod.scope.kind === 'tag' ? `tag:${mod.scope.tag}`
          : '?';
        inner += `<div class="dev-bal-mod-row">`;
        inner += `<span class="dev-bal-mod-target">${escapeHtml(mod.target)}</span>`;
        inner += `<span class="dev-bal-mod-detail">${mod.op} ${mod.value} <span style="color:#4b5563;">[${scopeLabel}]</span></span>`;
        inner += `</div>`;
      }
    }
    return inner;
  });

  balanceContainer.innerHTML = html;
}

function renderBalanceCollapsible(id: string, title: string, renderBody: () => string): string {
  const isCollapsed = collapsedSections.has(id);
  const chevron = isCollapsed ? '▸' : '▾';
  const bodyDisplay = isCollapsed ? ' style="display:none;"' : '';

  let html = `<div class="dev-section">`;
  html += `<div class="dev-section-title" data-section="${id}"><span class="dev-chevron">${chevron}</span> ${title}</div>`;
  html += `<div class="dev-section-body"${bodyDisplay}>`;
  html += renderBody();
  html += `</div>`;
  html += `</div>`;
  return html;
}

/**
 * Handle a balance input change by updating the modifier registry.
 */
function handleBalanceInput(input: HTMLInputElement): void {
  const target = input.dataset.modTarget!;
  const scope = input.dataset.modScope!;
  const op = input.dataset.modOp as GameModifier['op'];
  const defaultVal = parseFloat(input.dataset.default || '0');
  const value = parseFloat(input.value);

  if (isNaN(value)) return;

  const registry = getModifierRegistry();

  if (scope === 'global') {
    const modId = `devpanel:global:${target}`;
    // If the value matches the default, remove the dev override
    if (value === defaultVal) {
      registry.remove(modId);
    } else {
      registry.add({
        id: modId,
        target,
        op,
        value,
        source: 'devpanel',
        scope: { kind: 'global' },
      });
    }
  } else if (scope === 'character') {
    const charId = input.dataset.modChar!;
    const modId = `devpanel:char:${charId}:${target}:${op}`;
    if (value === defaultVal) {
      registry.remove(modId);
    } else {
      registry.add({
        id: modId,
        target,
        op,
        value,
        source: 'devpanel',
        scope: { kind: 'character', characterId: charId },
      });
    }
  }

  // Persist to localStorage and update the active modifiers display
  persistDevPanelModifiers();
  refreshActiveModifiers();
}

/**
 * Refresh just the active modifiers list without redrawing the whole panel.
 */
function refreshActiveModifiers(): void {
  if (!balanceContainer) return;
  const modsBody = balanceContainer.querySelector('[data-section="bal-active-mods"]')?.nextElementSibling;
  if (!modsBody) return;
  // Just re-render the full panel for simplicity (inputs are managed separately)
  // This is lightweight enough to not cause issues
}

function isAcsEnabled(): boolean {
  return getModifierRegistry().resolve(ACS_TARGET, 0) >= 1;
}

function setAcsEnabled(enabled: boolean): void {
  const registry = getModifierRegistry();
  if (enabled) {
    registry.add({
      id: ACS_MOD_ID,
      target: ACS_TARGET,
      op: 'set',
      value: 1,
      source: 'devpanel',
      scope: { kind: 'global' },
    });
  } else {
    registry.remove(ACS_MOD_ID);
  }
  persistDevPanelModifiers();
}

/**
 * Get characters from game state for the balance panel character selector.
 */
function getCharactersForBalance(): Character[] {
  try {
    const gs = getGameState();
    return gs?.characters ?? [];
  } catch {
    return [];
  }
}

function applyExpandedPanelWidth(panel: HTMLElement, width: number): void {
  panel.style.width = `${clamp(width, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function persistDevPanelWidth(width: number): void {
  try {
    localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(clamp(Math.round(width), PANEL_WIDTH_MIN, PANEL_WIDTH_MAX)));
  } catch {
    // localStorage unavailable or full – silently ignore
  }
}

function loadDevPanelWidth(): number | null {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return null;
    return clamp(parsed, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX);
  } catch {
    return null;
  }
}

// ── localStorage persistence ─────────────────────────────────────────

/**
 * Save all devpanel modifiers to localStorage so they survive page refresh.
 */
function persistDevPanelModifiers(): void {
  try {
    const registry = getModifierRegistry();
    const devMods = registry.getBySource('devpanel');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devMods));
  } catch {
    // localStorage unavailable or full – silently ignore
  }
}

/**
 * Restore devpanel modifiers from localStorage into the registry.
 * Called once during initBalanceTweaks.
 */
function restoreDevPanelModifiers(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const mods: GameModifier[] = JSON.parse(raw);
    if (!Array.isArray(mods)) return;
    const registry = getModifierRegistry();
    for (const mod of mods) {
      if (mod.source === 'devpanel' && mod.id && mod.target && mod.op != null && mod.value != null) {
        registry.add(mod);
      }
    }
    console.log(`Restored ${mods.length} devpanel modifier(s) from localStorage`);
  } catch {
    // Corrupt data or localStorage unavailable – silently ignore
  }
}

export function restoreDevPanelOverridesFromStorage(): void {
  restoreDevPanelModifiers();
}
