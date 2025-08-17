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

