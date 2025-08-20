# Core Mechanics Synopsis

## Party & Characters
- Players control a party of 4 characters.
- Each character is distinct (human, mechanical, hybrid, mutant, etc.).
- Characters can be collectible, found as the game is played.
- Each character has unique stats: Health, Speed, Energy Pool, and Energy Regen Rate.

## Combat Flow
- Turn-based system with **Speed** determining turn order (faster characters act earlier).
- Each turn, characters draw cards from their ability deck.
- Default draw: 3 cards per turn, upgradeable through progression.
- Players spend Energy to play cards; Energy is unique per character and regenerates differently across the roster.
- Some cards can restore Energy, accelerate regen, or manipulate turn order.
- When charachter health reaches zero they are removed from the board.
- enemy turns are automatically executed, the cards are chosen in order and executed until out of energy.

## Ability & Rarity System
- Each character builds a deck of ~10 abilities.  
- Abilities appear as cards in combat and are weighted by rarity via duplicate copies:  
  - **Common** → 3–4 copies (cheap, spammable, bread-and-butter).  
  - **Rare** → 1–2 copies (stronger, situational).  
  - **Mythic** → 1 copy (powerful, condition-gated, often exhausts).  
- Typical deck size: ~20–22 cards.  
- This ensures variety while preventing over-saturation of powerful abilities.  
- Commons form the character’s repeatable combat loop, rares add tactical depth, and mythics create high-impact moments.

## Progression & Loot
- Abilities are unlocked/found through progression, loot, or events.
- Players can expand character kits over time, but are limited to selecting a subset (≈10) for active use.
- Deck composition choices impact playstyle: aggressive spam builds, rare-based combos, or mythic-focused strategies.

## Design Goals
- Maintain balance through rarity weighting rather than bloated deck sizes.
- Encourage situational play by keeping draws semi-random but controlled.
- Create meaningful differences between characters through Energy, Speed, and kit selection.
- Allow powerful plays without overwhelming balance by restricting frequency (via rarity + energy cost).


# ✅ Core Decisions (Locked)

- **Combat model:** Turn-based (speed/initiative determines order).
- **Energy:** Baseline **3** per character; per-char regen rates allowed; cards can grant/steal energy.
- **Deck model:** Cards are **infinite-use** with **reshuffle**; some cards **Exhaust** (one-and-done) or **expire after X turns**.
- **Rarity weighting:** Implemented by **adding copies** per rarity (e.g., Common×3–4, Rare×1–2, Mythic×1).
- **Data format:** **YAML** for cards/abilities (data-driven).
- **Mode:** Single-player first.
- **Platforms:** Web + **Desktop (Steam)**. Target a Tauri/Electron wrapper for Steam build.

---

## Engine Rules (golden numbers)
- 1 energy ≈ **6–8 damage** or **5–7 block** baseline.
- Hand: start with **3 drawn/turn**, cap 5–7; upgrade via relics/loot.
- Block resets each round unless a status like **plating/fortify** says otherwise.

---

## Tech Notes for Steam
- **Desktop wrapper:** Prefer **Tauri** (tiny, fast). Electron is fine if you need Node APIs.
- **Build flow:** Vite → `dist/` → Tauri/Electron → Steam package.
- **Saves:** local filesystem (Tauri `appDir`) for Steam; localStorage/IndexedDB for web.

---

## Short Checklist
- [ ] Speed/initiative algorithm finalized (additive CTB or fixed rounds).
- [ ] Energy regen per-character defined (+ items/cards that alter it).
- [ ] YAML loaders + validation (zod/yup schema).
- [ ] Rarity→copies pipeline in deckbuilder.
- [ ] Exhaust + expires_after_turns implemented in resolver.
- [ ] Tauri scaffold points to web `dist/`; Steamworks prep (app id later).

## YAML Card Schema (minimal)
```yaml
# /content/cards/emp_cleaver.yaml
id: emp_cleaver
name: "EMP Cleaver"
type: attack            # attack | skill | power | summon
rarity: common          # common | rare | mythic
cost: 1
copies: 3               # rarity-weighted draw via duplicate copies
tags: [tech, emp]
targeting: enemy        # self | ally | enemy | allEnemies | allAllies
exhaust: false
expires_after_turns: 0  # 0 = never expires
effects:
  - kind: damage
    amount: 8
  - kind: modifier       # conditional bonus vs machines
    when:
      target_has_tag: machine
    apply:
      - kind: damage
        amount: 8
      - kind: status
        status: disrupt
        stacks: 1
```

### Another example (power card with exhaust + duration)
```yaml
# /content/cards/blue_cascade.yaml
id: blue_cascade
name: "Blue Cascade"
type: power
rarity: mythic
cost: 3
copies: 1
tags: [psychic]
targeting: allEnemies
exhaust: true
expires_after_turns: 0
effects:
  - kind: aoe_damage
    amount: 22
  - kind: deck_inject
    target: allies
    card: corruption
    copies: 1
```

---

## Status Schema (optional)
```yaml
# /content/statuses/disrupt.yaml
id: disrupt
name: "Disrupt"
stacking: add
on_apply:
  - kind: intent_modifier
    enemy_damage_mult: 0.9
decay:
  per_turn: 1
```



# Combat Spec — Block Persistence, Fortify, and DoTs (Update)

## Block Persistence (Per-Card % Decay, Ceiling)
- **Each Block source is a layer** with its own `decay_percent` defined by the **card that created it**.
- **End of turn**: each layer loses `ceil(current_amount * effective_decay_percent)`.
- **Rounding:** decay uses **round up (ceiling)** before subtracting.
- **Effective decay** = card’s `decay_percent` **minus** any Fortify reductions on the unit (see below), floored by a global minimum (e.g., **min 5–10%** unless an effect explicitly sets 0%).

### Fortify (Decay Reduction)
- **Fortify** is a status on the character that **reduces the decay %** of *all* their Block layers.
- Stacking: reductions are **additive**; **duration refreshes** on reapply (no additive duration unless a card says “extend”).
- Apply Fortify after reading the layer’s base `decay_percent`, then clamp to the global min decay floor.

### Example (YAML-style content)
```yaml
# Card that grants Block with its own decay rate
id: dawn_aegis
name: "Dawn Aegis"
type: skill
effects:
  - kind: grant_block_layer
    amount: 12
    decay_percent: 20        # per-card decay before Fortify reductions
```

```yaml
# Fortify that reduces decay for all layers on the unit
id: fortify_minor
name: "Fortify (Minor)"
type: status
duration_turns: 2
stacking: add_reduction
effects:
  - kind: reduce_block_decay_percent
    amount: 10               # -10% to effective decay
meta:
  min_decay_floor_percent: 5
```

---

## Interactions

### Multi-Hit
- **Yes** — resolve each hit sequentially; Block absorbs per hit from the unit’s current layers.

### DoTs (Damage over Time)
- **Bleed**: ticks at end of turn; **does not bypass Block** (Block reduces tick).
- **Shock**: ticks at end of turn; **does not bypass Block** (Block reduces tick). (Optional side-effect: accuracy/Speed debuff.)
- **Radiation**: ticks at end of turn; **bypasses Block** (direct HP damage).
- DoTs **stack additively**; each tick resolves **after Block decay** at end of turn.
- Tooltip examples:
  - *“Bleed 3 — deals 3 at end of turn (reduced by Block).”*
  - *“Radiation 2 — deals 2 at end of turn (ignores Block).”*

### Suggested Order of Operations (Hit)
1) Pre-mitigation (Vulnerable/Weakened, resists)  
2) Block absorb from current layers  
3) Piercing/true portions (if modeled separately)  
4) On-hit triggers (Thorns, on-break)  
5) HP loss

### End-of-Turn Order
1) **Block decay** per layer using **ceil** and Fortify reductions  
2) **DoT ticks** (Bleed/Shock reduced by remaining Block; Radiation ignores Block)  
3) Duration decay for statuses

---

## Notes & Guardrails
- Keep a **global min decay floor** (e.g., 5–10%) to avoid “infinite Block” when Fortify stacks.
- Document rounding: **ceil** for decay, **floor** for damage math, and surface this in tooltips.
- Keep Fortify taxonomy small (e.g., Minor/Major/Plating) to avoid near-duplicate effects.

---



#todo 

- add damage and heal done to the animations.
- game state can track the median hit and adjust size and color and impact traits based on that to account for hard hitting satistaction
reroll play order every turn, take speed updates into account
- need to add reshuffle

- refactor to TS LOL