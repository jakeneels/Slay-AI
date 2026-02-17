// Tooltip hover state - module-level state that persists across re-renders
// Same pattern as selectedCardId in gameState.ts

// ── Card tooltip state ────────────────────────────────────────────────

let hoveredCardId: string | null = null;
let hoveredCardX: number = 0;
let hoveredCardY: number = 0;
type HoverRegion = {
  cardId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  anchorX: number;
  anchorY: number;
};
type CharacterHoverRegion = {
  characterId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};
type StatusHoverRegion = {
  statusId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};
let activeCardHoverRegions: HoverRegion[] = [];
let activeCharacterHoverRegions: CharacterHoverRegion[] = [];
let activeStatusHoverRegions: StatusHoverRegion[] = [];
let pointerCanvasX: number | null = null;
let pointerCanvasY: number | null = null;

/**
 * Set the currently hovered card (call from rarity icon pointerenter/pointerleave).
 * Returns true if the state actually changed (callers should only re-render on change).
 * @param cardId  Card template ID, or null to clear
 * @param x       X position of the rarity icon (for tooltip anchoring)
 * @param y       Y position of the rarity icon (for tooltip anchoring)
 */
export function setHoveredCard(cardId: string | null, x: number = 0, y: number = 0): boolean {
  if (hoveredCardId === cardId) {
    if (cardId !== null && (hoveredCardX !== x || hoveredCardY !== y)) {
      hoveredCardX = x;
      hoveredCardY = y;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-post2',hypothesisId:'N5',location:'tooltipState.ts:setHoveredCard',message:'setHoveredCard_same_id_anchor_update',data:{cardId,x,y},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return true;
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H3',location:'tooltipState.ts:setHoveredCard',message:'setHoveredCard_no_change',data:{cardId,x,y},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return false; // no change — prevent re-render loops
  }
  const prevCardId = hoveredCardId;
  hoveredCardId = cardId;
  hoveredCardX = x;
  hoveredCardY = y;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H3',location:'tooltipState.ts:setHoveredCard',message:'setHoveredCard_changed',data:{prevCardId,nextCardId:cardId,x,y},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return true;
}

/**
 * Get the currently hovered card info
 */
export function getHoveredCard(): { cardId: string | null; x: number; y: number } {
  return { cardId: hoveredCardId, x: hoveredCardX, y: hoveredCardY };
}

/**
 * Start a new render frame for card hover reconciliation.
 * Card renderers should register current rarity icon hover regions afterwards.
 */
export function beginCardHoverFrame(): void {
  activeCardHoverRegions = [];
  activeCharacterHoverRegions = [];
  activeStatusHoverRegions = [];
}

/**
 * Register a hoverable rarity icon region for the current frame.
 * Coordinates are in canvas space.
 */
export function registerCardHoverRegion(
  cardId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
): void {
  activeCardHoverRegions.push({
    cardId,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    anchorX,
    anchorY,
  });
  if (hoveredCardId && hoveredCardId === cardId) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H2',location:'tooltipState.ts:registerCardHoverRegion',message:'registered_region_for_hovered_card',data:{cardId,left:x,top:y,width,height,anchorX,anchorY},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }
}

export function registerCharacterHoverRegion(
  characterId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  activeCharacterHoverRegions.push({
    characterId,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  });
}

export function registerStatusHoverRegion(
  statusId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  activeStatusHoverRegions.push({
    statusId,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  });
}

/**
 * Track the current pointer position in canvas space.
 * Pass nulls when the pointer cannot be resolved this frame.
 */
export function setCardHoverPointerPosition(x: number | null, y: number | null): void {
  pointerCanvasX = x;
  pointerCanvasY = y;
}

/**
 * Clears stale hovered card state if the pointer is no longer on a valid rarity region.
 * Returns true if hover state changed.
 */
export function reconcileHoveredCardState(): boolean {
  if (!hoveredCardId) return false;

  const hoveredRegions = activeCardHoverRegions.filter(r => r.cardId === hoveredCardId);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H1',location:'tooltipState.ts:reconcileHoveredCardState',message:'reconcile_start',data:{hoveredCardId,pointerCanvasX,pointerCanvasY,matchingRegionCount:hoveredRegions.length,totalRegionCount:activeCardHoverRegions.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (hoveredRegions.length === 0) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H2',location:'tooltipState.ts:reconcileHoveredCardState',message:'reconcile_clear_no_regions',data:{hoveredCardId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return setHoveredCard(null);
  }

  if (pointerCanvasX === null || pointerCanvasY === null) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H1',location:'tooltipState.ts:reconcileHoveredCardState',message:'reconcile_pointer_missing',data:{hoveredCardId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return false;
  }
  const pointerX = pointerCanvasX;
  const pointerY = pointerCanvasY;

  const isInsideHoveredRegion = hoveredRegions.some(r =>
    pointerX >= r.left
    && pointerX <= r.right
    && pointerY >= r.top
    && pointerY <= r.bottom,
  );
  if (isInsideHoveredRegion) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H4',location:'tooltipState.ts:reconcileHoveredCardState',message:'reconcile_keep_inside_region',data:{hoveredCardId,pointerX,pointerY},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return false;
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre1',hypothesisId:'H4',location:'tooltipState.ts:reconcileHoveredCardState',message:'reconcile_clear_pointer_outside',data:{hoveredCardId,pointerX,pointerY},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return setHoveredCard(null);
}

export function reconcileHoveredCharacterState(): boolean {
  if (!hoveredCharacterId) return false;
  if (pointerCanvasX === null || pointerCanvasY === null) return false;
  const regions = activeCharacterHoverRegions.filter(r => r.characterId === hoveredCharacterId);
  if (regions.length === 0) return setHoveredCharacter(null, 0, 0);
  const pointerX = pointerCanvasX;
  const pointerY = pointerCanvasY;
  const isInside = regions.some(r =>
    pointerX >= r.left
    && pointerX <= r.right
    && pointerY >= r.top
    && pointerY <= r.bottom,
  );
  if (isInside) return false;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-post3',hypothesisId:'N10',location:'tooltipState.ts:reconcileHoveredCharacterState',message:'reconcile_clear_character_pointer_outside',data:{hoveredCharacterId,pointerX,pointerY,regionCount:regions.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return setHoveredCharacter(null, 0, 0);
}

export function reconcileHoveredStatusState(): boolean {
  if (!hoveredStatusId) return false;
  if (pointerCanvasX === null || pointerCanvasY === null) return false;
  const regions = activeStatusHoverRegions.filter(r => r.statusId === hoveredStatusId);
  if (regions.length === 0) return setHoveredStatus(null, 0, 0, 0);
  const pointerX = pointerCanvasX;
  const pointerY = pointerCanvasY;
  const isInside = regions.some(r =>
    pointerX >= r.left
    && pointerX <= r.right
    && pointerY >= r.top
    && pointerY <= r.bottom,
  );
  if (isInside) return false;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-post3',hypothesisId:'N11',location:'tooltipState.ts:reconcileHoveredStatusState',message:'reconcile_clear_status_pointer_outside',data:{hoveredStatusId,pointerX,pointerY,regionCount:regions.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return setHoveredStatus(null, 0, 0, 0);
}

// ── Status tooltip state ──────────────────────────────────────────────

let hoveredStatusId: string | null = null;
let hoveredStatusStacks: number = 0;
let hoveredStatusX: number = 0;
let hoveredStatusY: number = 0;

/**
 * Set the currently hovered status effect badge.
 * Returns true if the state actually changed.
 * @param statusId  Status ID, or null to clear
 * @param stacks    Current stack count / penalty value
 * @param x         X position of the badge center (for tooltip anchoring)
 * @param y         Y position of the badge top (for tooltip anchoring)
 */
export function setHoveredStatus(statusId: string | null, stacks: number = 0, x: number = 0, y: number = 0): boolean {
  if (hoveredStatusId === statusId) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N6',location:'tooltipState.ts:setHoveredStatus',message:'setHoveredStatus_no_change',data:{statusId,stacks,x,y},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return false;
  }
  hoveredStatusId = statusId;
  hoveredStatusStacks = stacks;
  hoveredStatusX = x;
  hoveredStatusY = y;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N6',location:'tooltipState.ts:setHoveredStatus',message:'setHoveredStatus_changed',data:{statusId,stacks,x,y},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return true;
}

/**
 * Get the currently hovered status info
 */
export function getHoveredStatus(): { statusId: string | null; stacks: number; x: number; y: number } {
  return { statusId: hoveredStatusId, stacks: hoveredStatusStacks, x: hoveredStatusX, y: hoveredStatusY };
}

// ── Character tooltip state ────────────────────────────────────────────

let hoveredCharacterId: string | null = null;
let hoveredCharacterX: number = 0;
let hoveredCharacterY: number = 0;

/**
 * Set the currently hovered character.
 * Returns true if the state actually changed.
 */
export function setHoveredCharacter(characterId: string | null, x: number = 0, y: number = 0): boolean {
  if (hoveredCharacterId === characterId) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N7',location:'tooltipState.ts:setHoveredCharacter',message:'setHoveredCharacter_no_change',data:{characterId,x,y},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return false;
  }
  hoveredCharacterId = characterId;
  hoveredCharacterX = x;
  hoveredCharacterY = y;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70be47a7-7d53-429c-b1ba-9ecb4592d85b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'hover-stuck-pre3',hypothesisId:'N7',location:'tooltipState.ts:setHoveredCharacter',message:'setHoveredCharacter_changed',data:{characterId,x,y},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return true;
}

/**
 * Get hovered character tooltip anchor.
 */
export function getHoveredCharacter(): { characterId: string | null; x: number; y: number } {
  return { characterId: hoveredCharacterId, x: hoveredCharacterX, y: hoveredCharacterY };
}

// ── Global clear ─────────────────────────────────────────────────────

/**
 * Clear all hover states at once (e.g. on window blur / visibility change).
 * Returns true if anything was actually cleared.
 */
export function clearAllHoverStates(): boolean {
  const hadCard = hoveredCardId !== null;
  const hadStatus = hoveredStatusId !== null;
  const hadCharacter = hoveredCharacterId !== null;

  hoveredCardId = null;
  hoveredCardX = 0;
  hoveredCardY = 0;
  activeCardHoverRegions = [];
  activeCharacterHoverRegions = [];
  activeStatusHoverRegions = [];
  pointerCanvasX = null;
  pointerCanvasY = null;

  hoveredStatusId = null;
  hoveredStatusStacks = 0;
  hoveredStatusX = 0;
  hoveredStatusY = 0;

  hoveredCharacterId = null;
  hoveredCharacterX = 0;
  hoveredCharacterY = 0;

  return hadCard || hadStatus || hadCharacter;
}
