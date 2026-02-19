// Templated card tooltip text generation
// Pure logic — no PIXI dependency. Generates structured tooltip data from a Card object.

import type { Card, CardEffect, BaseCardEffect, BlockEffect, StatusEffect, StatusModifyEffect, StatusSpreadEffect, ThornsEffect, KnockbackEffect, DeckInjectEffect, ModifierEffect, LaneHazardEffect } from '../core/types.js';
import { RANGE_OPTIMAL_BONUS, RANGE_PENALTY_PER_SLOT, RANGE_MODIFIER_MIN } from '../core/constants.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TooltipEffectLine {
  /** Icon key matching the icon factory names: 'damage' | 'heal' | 'energy' | 'speed' | 'shield' | 'exhaust' | 'range' | 'lane_hazard' */
  icon: string | null;
  /** Primary text, e.g. "Deals 8 damage" */
  text: string;
  /** Optional sub-lines explaining the mechanic in detail */
  subLines: string[];
  /** Targeting annotation when effectTarget differs from card default, e.g. "Self" */
  targetLabel: string | null;
}

export interface TooltipPropertyLine {
  icon: string | null;
  label: string;
  description: string;
}

export interface TooltipData {
  header: {
    name: string;
    rarity: string;
    type: string | null;
  };
  cost: number;
  targeting: {
    label: string;
    detail: string | null;
  };
  effects: TooltipEffectLine[];
  range: {
    lines: string[];
  };
  properties: TooltipPropertyLine[];
  tags: string[];
  flavor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function targetingLabel(card: Card): { label: string; detail: string | null } {
  switch (card.targeting) {
    case 'self':
      return { label: 'Self', detail: 'Targets the caster' };
    case 'ally':
      return { label: 'Single Ally', detail: null };
    case 'enemy':
      return { label: 'Single Enemy', detail: null };
    case 'aoe': {
      const slots = card.aoeSlots ?? 3;
      return { label: `AOE (${slots} slots)`, detail: `Hits ${slots} adjacent enemy slots` };
    }
    case 'allEnemies':
      return { label: 'All Enemies', detail: 'Hits every living enemy' };
    case 'allAllies':
      return { label: 'All Allies', detail: 'Hits every living ally' };
    case 'single':
      return { label: 'Single Target', detail: null };
    case 'slot':
      return { label: 'Empty Slot', detail: 'Choose any unoccupied slot to reposition' };
    default:
      return { label: capitalise(card.targeting), detail: null };
  }
}

function effectTargetAnnotation(effect: CardEffect, card: Card): string | null {
  if (effect.kind === 'modifier' || effect.kind === 'deck_inject') return null;
  const et = (effect as BaseCardEffect).effectTarget;
  if (!et || et === 'target') return null; // inherits card targeting — no annotation needed
  switch (et) {
    case 'self': return 'Self';
    case 'allAllies': return 'All Allies';
    case 'allEnemies': return 'All Enemies';
    case 'aoe': {
      const slots = (effect as BaseCardEffect).aoeSlots ?? card.aoeSlots ?? 3;
      return `AOE (${slots} slots)`;
    }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Effect templates
// ---------------------------------------------------------------------------

function describeEffect(effect: CardEffect, card: Card): TooltipEffectLine {
  const targetLabel = effectTargetAnnotation(effect, card);

  switch (effect.kind) {
    case 'damage': {
      return {
        icon: 'damage',
        text: `Deals ${effect.amount} damage`,
        subLines: [],
        targetLabel,
      };
    }

    case 'heal': {
      return {
        icon: 'heal',
        text: `Restores ${effect.amount} HP`,
        subLines: [],
        targetLabel,
      };
    }

    case 'energy': {
      return {
        icon: 'energy',
        text: `Grants ${effect.amount} energy`,
        subLines: [],
        targetLabel,
      };
    }

    case 'speed': {
      const absAmount = Math.abs(effect.amount);
      const text = effect.amount >= 0
        ? `Grants ${effect.amount} speed`
        : `Reduces speed by ${absAmount}`;
      return {
        icon: 'speed',
        text,
        subLines: [],
        targetLabel,
      };
    }

    case 'aoe_damage': {
      return {
        icon: 'damage',
        text: `Deals ${effect.amount} area damage`,
        subLines: [],
        targetLabel,
      };
    }

    case 'grant_block_layer': {
      const blockEffect = effect as BlockEffect;
      const subLines = [
        'Absorbs damage before HP',
      ];
      if (blockEffect.decay_percent !== undefined) {
        subLines.push(`Decays ${blockEffect.decay_percent}% of base per turn`);
      }
      return {
        icon: 'shield',
        text: `Grants ${blockEffect.amount} Block`,
        subLines,
        targetLabel,
      };
    }

    case 'knockback': {
      const kb = effect as KnockbackEffect;
      const absAmount = Math.abs(kb.amount);
      const slotWord = absAmount !== 1 ? 'slots' : 'slot';
      if (kb.amount < 0) {
        return {
          icon: 'pull',
          text: `Pulls target ${absAmount} ${slotWord}`,
          subLines: ['Drags toward caster'],
          targetLabel,
        };
      }
      return {
        icon: 'knockback',
        text: `Pushes target back ${absAmount} ${slotWord}`,
        subLines: ['Pushes away from caster'],
        targetLabel,
      };
    }

    case 'jump': {
      const rangeText = effect.rangeLimit ? `up to ${effect.rangeLimit} slots` : 'to any distance';
      const perEnemy = effect.energyPerEnemyJumped ?? effect.energyPerOccupiedSlot ?? 1;
      return {
        icon: 'speed',
        text: 'Jump to an empty slot',
        subLines: [
          `Reposition ${rangeText}`,
          `Costs standard movement +${perEnemy} energy per enemy crossed`
        ],
        targetLabel,
      };
    }

    case 'status': {
      const se = effect as StatusEffect;
      const stacks = se.stacks ?? 1;
      const subLines: string[] = [];

      // Add mechanic explanations for known statuses
      switch (se.status.toLowerCase()) {
        case 'bleed':
          subLines.push(`${stacks} damage/turn (reduced by Block)`);
          break;
        case 'shock':
          subLines.push(`${stacks} damage/turn (reduced by Block)`);
          break;
        case 'radiation':
          subLines.push(`${stacks} dmg/side, halves each tick. Ignores Block. Requires 0 Block to apply.`);
          break;
        case 'fortify':
          subLines.push('Reduces Block decay by 10% per stack');
          break;
        case 'regeneration':
          subLines.push(`${stacks} healing/turn, stacks decay per status config`);
          break;
        case 'disrupt':
          subLines.push('Disrupts the target');
          break;
        default:
          break;
      }

      return {
        icon: null,
        text: `Applies ${stacks} ${capitalise(se.status)}`,
        subLines,
        targetLabel,
      };
    }

    case 'status_modify': {
      const sm = effect as StatusModifyEffect;
      const statusName = capitalise(sm.status);
      let opText: string;
      switch (sm.op) {
        case 'multiply':
          opText = `×${sm.amount} ${statusName} stacks`;
          break;
        case 'add':
          opText = sm.amount >= 0
            ? `+${sm.amount} ${statusName} stacks`
            : `${sm.amount} ${statusName} stacks`;
          break;
        case 'set':
          opText = `Set ${statusName} to ${sm.amount} stacks`;
          break;
      }
      return {
        icon: null,
        text: opText,
        subLines: ['Only affects targets that already have the status'],
        targetLabel,
      };
    }

    case 'status_spread': {
      const ss = effect as StatusSpreadEffect;
      const statusName = capitalise(ss.status);
      const pct = Math.round(ss.fraction * 100);
      const spreadRange = Math.max(0, Math.floor(ss.spreadRange ?? 1));
      const spreadSide = ss.spreadSide ?? 'same';
      const sideLabel = spreadSide === 'same'
        ? 'same side'
        : spreadSide === 'opposing'
          ? 'opposing side'
          : 'both sides';
      return {
        icon: null,
        text: `Spreads ${pct}% ${statusName} (${spreadRange} slot${spreadRange !== 1 ? 's' : ''}, ${sideLabel})`,
        subLines: ['Reads stacks from target, applies fraction to nearby units'],
        targetLabel,
      };
    }

    case 'thorns': {
      const th = effect as ThornsEffect;
      const stacks = Math.max(1, Math.floor(th.stacks ?? 1));
      const reflectAmount = Math.max(0, Math.floor(th.reflectDamage ?? 0));
      const reflectPerStack = th.reflectPerStack !== false;
      const debuffStacks = th.debuffStacks ?? 1;
      const subLines = [
        reflectPerStack
          ? `On unblocked hit: reflect ${reflectAmount} x stacks damage to attacker`
          : `On unblocked hit: reflect ${reflectAmount} damage to attacker`
      ];
      if (th.debuffStatus) {
        subLines.push(`Also applies ${debuffStacks} ${capitalise(th.debuffStatus)} to attacker`);
      }
      if (th.duration !== undefined) {
        subLines.push(`Lasts ${th.duration} turn${th.duration !== 1 ? 's' : ''}`);
      }
      return {
        icon: 'thorns',
        text: `Grants ${stacks} Thorns`,
        subLines,
        targetLabel,
      };
    }

    case 'modifier': {
      const mod = effect as ModifierEffect;
      let condText = 'Conditional';
      if (mod.when?.target_has_tag) {
        condText = `If target has "${mod.when.target_has_tag}"`;
      }
      const applyTexts = mod.apply.map(e => describeEffect(e, card).text);
      return {
        icon: null,
        text: condText,
        subLines: applyTexts,
        targetLabel: null,
      };
    }

    case 'deck_inject': {
      const di = effect as DeckInjectEffect;
      const copies = di.copies ?? 1;
      return {
        icon: null,
        text: `Adds ${copies} ${capitalise(di.card)} to ${di.target}'s deck`,
        subLines: [],
        targetLabel: null,
      };
    }

    case 'lane_hazard': {
      const lh = effect as LaneHazardEffect;
      const slots = Math.max(1, Math.floor((lh as BaseCardEffect).aoeSlots ?? card.aoeSlots ?? 1));
      const laneLabel = slots > 1 ? ` (${slots} slots)` : '';
      return {
        icon: 'lane_hazard',
        text: `Ignites lane${laneLabel}: ${lh.damage} damage/turn for ${lh.duration_turns} turn${lh.duration_turns !== 1 ? 's' : ''}`,
        subLines: ['Creates a hazard on the target\'s lane. Enemies in that lane take damage each turn.'],
        targetLabel,
      };
    }

    default: {
      const e = effect as { kind: string };
      return {
        icon: null,
        text: `${e.kind}`,
        subLines: [],
        targetLabel,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Range section
// ---------------------------------------------------------------------------

function describeRange(card: Card): string[] {
  const lines: string[] = [];

  if (!card.maxRange && !card.minRange && card.optimalRange === undefined) {
    lines.push('No range limit');
    return lines;
  }

  if (card.minRange) {
    lines.push(`Min range: ${card.minRange} slot${card.minRange !== 1 ? 's' : ''}`);
  }

  if (card.maxRange) {
    lines.push(`Max range: ${card.maxRange} slot${card.maxRange !== 1 ? 's' : ''}`);
  }

  if (card.optimalRange !== undefined) {
    const bonusPct = Math.round(RANGE_OPTIMAL_BONUS * 100);
    const penaltyPct = Math.round(RANGE_PENALTY_PER_SLOT * 100);
    const minPct = Math.round(RANGE_MODIFIER_MIN * 100);
    lines.push(`Optimal: ${card.optimalRange} (+${bonusPct}% damage)`);
    lines.push(`-${penaltyPct}% per slot from optimal, min ${minPct}%`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Properties (exhaust, expires, etc.)
// ---------------------------------------------------------------------------

function describeProperties(card: Card): TooltipPropertyLine[] {
  const props: TooltipPropertyLine[] = [];

  if (card.exhaust) {
    props.push({
      icon: 'exhaust',
      label: 'Exhaust',
      description: 'Removed from deck after playing',
    });
  }

  if (card.expires_after_turns && card.expires_after_turns > 0) {
    props.push({
      icon: null,
      label: 'Expires',
      description: `Disappears after ${card.expires_after_turns} turn${card.expires_after_turns !== 1 ? 's' : ''}`,
    });
  }

  return props;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate structured tooltip data from a Card object.
 * Pure function — no side effects, no PIXI dependency.
 */
export function generateTooltipData(card: Card): TooltipData {
  return {
    header: {
      name: card.name,
      rarity: card.rarity ?? 'common',
      type: card.type ?? null,
    },
    cost: card.cost.energy,
    targeting: targetingLabel(card),
    effects: card.effects.map(e => describeEffect(e, card)),
    range: { lines: describeRange(card) },
    properties: describeProperties(card),
    tags: card.tags ?? [],
    flavor: card.description ?? null,
  };
}
