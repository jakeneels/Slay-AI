/**
 * Combat animations for attack effects
 */

// Store character sprites for animation access
const characterSprites = new Map();

/**
 * Register a character sprite for animations
 */
export function registerCharacterSprite(characterId, sprite) {
  characterSprites.set(characterId, sprite);
}

/**
 * Animate attacker shaking when performing an attack
 */
export function animateAttackerShake(characterId) {
  const sprite = characterSprites.get(characterId);
  if (!sprite) return Promise.resolve();

  const originalX = sprite.x;
  const shakeIntensity = 5;
  const shakeDuration = 300;
  const shakeSteps = 5;
  const stepDuration = shakeDuration / shakeSteps;

  return new Promise((resolve) => {
    let step = 0;
    
    const shakeInterval = setInterval(() => {
      if (step >= shakeSteps) {
        sprite.x = originalX; // Reset to original position
        clearInterval(shakeInterval);
        resolve();
        return;
      }
      
      // Alternate between left and right shake
      const offset = (step % 2 === 0) ? shakeIntensity : -shakeIntensity;
      sprite.x = originalX + offset;
      step++;
    }, stepDuration);
  });
}

/**
 * Animate damage spark effect on target
 */
export function animateDamageSpark(characterId, app) {
  const sprite = characterSprites.get(characterId);
  if (!sprite) return Promise.resolve();

  // Create spark graphics
  const spark = new PIXI.Graphics();
  
  // Create multiple spark lines radiating outward
  const sparkLines = 8;
  const sparkLength = 30;
  
  for (let i = 0; i < sparkLines; i++) {
    const angle = (i / sparkLines) * Math.PI * 2;
    const startX = Math.cos(angle) * 10;
    const startY = Math.sin(angle) * 10;
    const endX = Math.cos(angle) * sparkLength;
    const endY = Math.sin(angle) * sparkLength;
    
    spark.moveTo(startX, startY)
         .lineTo(endX, endY)
         .stroke({ width: 3, color: 0xffff00 }); // Yellow spark
  }
  
  // Position spark at character center
  spark.x = sprite.x + sprite.width / 2;
  spark.y = sprite.y + sprite.height / 2;
  spark.alpha = 1;
  
  app.stage.addChild(spark);

  // Animate spark fade out
  return new Promise((resolve) => {
    const fadeStart = performance.now();
    const fadeDuration = 600;
    
    function animateFade() {
      const elapsed = performance.now() - fadeStart;
      const progress = elapsed / fadeDuration;
      
      if (progress >= 1) {
        app.stage.removeChild(spark);
        resolve();
        return;
      }
      
      spark.alpha = 1 - progress;
      requestAnimationFrame(animateFade);
    }
    
    requestAnimationFrame(animateFade);
  });
}

/**
 * Play complete attack animation sequence
 */
export async function playAttackAnimation(attackerId, targetId, app) {
  // First shake the attacker
  await animateAttackerShake(attackerId);
  
  // Then show damage spark on target (with slight delay)
  await new Promise(resolve => setTimeout(resolve, 100));
  await animateDamageSpark(targetId, app);
}
