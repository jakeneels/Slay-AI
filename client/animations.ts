/**
 * Combat animations for attack effects
 */

import type { Application, Sprite, Container } from 'pixi.js';
import { Graphics, Text } from 'pixi.js';

// Store character sprites for animation access
const characterSprites = new Map<string, Sprite>();

// Store card containers for animation (cardId -> Container)
const cardContainers = new Map<string, any>();

// Animation configuration interface
export interface AnimationConfig {
  damage?: {
    projectileColor?: number;
    projectileSpeed?: number;
    impactSize?: number;
  };
  heal?: {
    particleColor?: number;
    glowIntensity?: number;
  };
}

/**
 * Register a character sprite for animations
 */
export function registerCharacterSprite(characterId: string, sprite: Sprite): void {
  characterSprites.set(characterId, sprite);
}

/**
 * Animate attacker shaking when performing an attack
 */
export function animateAttackerShake(characterId: string): Promise<void> {
  const sprite = characterSprites.get(characterId);
  if (!sprite) return Promise.resolve();

  const originalX = sprite.x;
  const shakeIntensity = 5;
  const shakeDuration = 300;
  const shakeSteps = 1;
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
export function animateCharachterSpark(characterId: string, type: 'damage' | 'heal' | 'buff' | 'energy', app: Application): Promise<void> {
  const sprite = characterSprites.get(characterId);
  if (!sprite) return Promise.resolve();

  // Create spark graphics
  const spark = new Graphics();
  
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
    .lineTo(endX, endY);

    switch (type){
        case 'damage':
            spark.stroke({ width: 3, color: 0xffff00 }); // Yellow spark
            break;
        case 'heal':
            spark.stroke({ width: 3, color: 0x22c55e }); // Green spark
            break;
        case 'buff':
            spark.stroke({ width: 3, color: 0xa855f7 }); // Purple spark
            break;
        case 'energy':
            spark.stroke({ width: 3, color: 0x3b82f6 }); // Blue spark
            break;
    }
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
 * Animate projectile trail from attacker to target
 */
export function animateProjectileTrail(
  attackerId: string,
  targetId: string,
  app: Application,
  config?: AnimationConfig['damage']
): Promise<void> {
  const attackerSprite = characterSprites.get(attackerId);
  const targetSprite = characterSprites.get(targetId);
  
  if (!attackerSprite || !targetSprite) return Promise.resolve();
  
  const projectileColor = config?.projectileColor ?? 0xff4444; // Default red
  const speed = config?.projectileSpeed ?? 1200; // pixels per second (faster)
  
  // Calculate positions
  const startX = attackerSprite.x + attackerSprite.width / 2;
  const startY = attackerSprite.y + attackerSprite.height / 2;
  const endX = targetSprite.x + targetSprite.width / 2;
  const endY = targetSprite.y + targetSprite.height / 2;
  
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const duration = (distance / speed) * 1000; // Convert to milliseconds
  
  // Create projectile with glow effect
  const projectileContainer = new Graphics();
  
  // Outer glow
  projectileContainer.circle(0, 0, 14)
    .fill({ color: projectileColor, alpha: 0.3 });
  
  // Core projectile
  projectileContainer.circle(0, 0, 10)
    .fill(projectileColor);
  
  // Bright center
  projectileContainer.circle(0, 0, 4)
    .fill(0xffffff);
  
  projectileContainer.x = startX;
  projectileContainer.y = startY;
  app.stage.addChild(projectileContainer);
  
  // Create trail container (will be redrawn each frame)
  const trailContainer = new Graphics();
  app.stage.addChild(trailContainer);
  
  // Store trail points for fading effect
  const trailPoints: Array<{ x: number; y: number; age: number }> = [];
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const trailLength = 15; // Number of trail segments to keep
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update projectile position
      const currentX = startX + dx * progress;
      const currentY = startY + dy * progress;
      projectileContainer.x = currentX;
      projectileContainer.y = currentY;
      
      // Add current position to trail
      trailPoints.push({ x: currentX, y: currentY, age: 0 });
      
      // Age all trail points
      trailPoints.forEach(point => point.age += 16); // ~60fps assumption
      
      // Remove old trail points
      while (trailPoints.length > trailLength) {
        trailPoints.shift();
      }
      
      // Redraw trail each frame (clear and redraw)
      trailContainer.clear();
      
      // Draw trail segments with fading
      for (let i = 0; i < trailPoints.length - 1; i++) {
        const point = trailPoints[i];
        const nextPoint = trailPoints[i + 1];
        
        // Fade based on age (older = more faded)
        const ageProgress = Math.min(point.age / 200, 1);
        const alpha = (1 - ageProgress) * 0.8;
        const width = 6 * (1 - ageProgress * 0.5); // Thinner as it fades
        
        if (alpha > 0.1) {
          trailContainer.moveTo(point.x, point.y)
            .lineTo(nextPoint.x, nextPoint.y)
            .stroke({ width: width, color: projectileColor, alpha: alpha });
        }
      }
      
      if (progress >= 1) {
        // Remove projectile
        app.stage.removeChild(projectileContainer);
        
        // Fade out remaining trail
        const trailFadeStart = performance.now();
        const trailFadeDuration = 300;
        
        function fadeTrail() {
          const trailElapsed = performance.now() - trailFadeStart;
          const trailProgress = Math.min(trailElapsed / trailFadeDuration, 1);
          
          trailContainer.clear();
          
          // Draw fading trail
          for (let i = 0; i < trailPoints.length - 1; i++) {
            const point = trailPoints[i];
            const nextPoint = trailPoints[i + 1];
            
            const ageProgress = Math.min(point.age / 200, 1);
            const alpha = (1 - ageProgress) * (1 - trailProgress) * 0.8;
            const width = 6 * (1 - ageProgress * 0.5);
            
            if (alpha > 0.05) {
              trailContainer.moveTo(point.x, point.y)
                .lineTo(nextPoint.x, nextPoint.y)
                .stroke({ width: width, color: projectileColor, alpha: alpha });
            }
          }
          
          if (trailProgress >= 1) {
            app.stage.removeChild(trailContainer);
            resolve();
          } else {
            requestAnimationFrame(fadeTrail);
          }
        }
        requestAnimationFrame(fadeTrail);
      } else {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate impact burst explosion on target
 */
export function animateImpactBurst(
  targetId: string,
  app: Application,
  config?: AnimationConfig['damage']
): Promise<void> {
  const targetSprite = characterSprites.get(targetId);
  if (!targetSprite) return Promise.resolve();
  
  const impactSize = config?.impactSize ?? 50;
  const burstColor = 0xff6600; // Brighter orange
  const centerX = targetSprite.x + targetSprite.width / 2;
  const centerY = targetSprite.y + targetSprite.height / 2;
  
  // Create initial flash/ring effect
  const flash = new Graphics();
  flash.circle(0, 0, 20)
    .fill({ color: 0xffffff, alpha: 0.8 });
  flash.x = centerX;
  flash.y = centerY;
  app.stage.addChild(flash);
  
  const particles: Array<{ graphics: Graphics; vx: number; vy: number; size: number }> = [];
  const particleCount = 16;
  
  // Create particles with varying sizes
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const speed = 4 + Math.random() * 3;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const size = 3 + Math.random() * 3;
    
    const particle = new Graphics();
    // Outer glow
    particle.circle(0, 0, size + 2)
      .fill({ color: burstColor, alpha: 0.3 });
    // Core particle
    particle.circle(0, 0, size)
      .fill(burstColor);
    
    particle.x = centerX;
    particle.y = centerY;
    particle.alpha = 1;
    
    app.stage.addChild(particle);
    particles.push({ graphics: particle, vx, vy, size });
  }
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const flashDuration = 100;
    const particleDuration = 500;
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const flashProgress = Math.min(elapsed / flashDuration, 1);
      const particleProgress = Math.min(elapsed / particleDuration, 1);
      
      // Animate flash (quick fade out)
      if (flashProgress < 1) {
        flash.alpha = (1 - flashProgress) * 0.8;
        flash.scale.set(1 + flashProgress * 2);
      } else if (flashProgress >= 1 && flash.alpha > 0) {
        app.stage.removeChild(flash);
      }
      
      // Animate particles
      particles.forEach((particle) => {
        particle.graphics.x += particle.vx;
        particle.graphics.y += particle.vy;
        particle.graphics.alpha = 1 - particleProgress;
        particle.graphics.scale.set(1 + particleProgress * 0.5); // Slight growth before fade
        // Apply friction
        particle.vx *= 0.92;
        particle.vy *= 0.92;
      });
      
      if (particleProgress >= 1) {
        particles.forEach(({ graphics }) => {
          app.stage.removeChild(graphics);
        });
        if (flash.parent) {
          app.stage.removeChild(flash);
        }
        resolve();
      } else {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate floating number text above target
 */
export function animateFloatingNumber(
  targetId: string,
  value: number,
  color: number,
  app: Application
): Promise<void> {
  const targetSprite = characterSprites.get(targetId);
  if (!targetSprite) return Promise.resolve();
  
  const numberText = new Text({
    text: value.toString(),
    style: {
      fill: color,
      fontSize: 24,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 2 }
    }
  });
  
  const startX = targetSprite.x + targetSprite.width / 2;
  const startY = targetSprite.y + targetSprite.height / 4;
  
  numberText.x = startX - numberText.width / 2;
  numberText.y = startY;
  numberText.alpha = 1;
  numberText.anchor.set(0.5);
  
  app.stage.addChild(numberText);
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const duration = 1000;
    const floatDistance = 60;
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        app.stage.removeChild(numberText);
        resolve();
        return;
      }
      
      // Float upward with ease-out
      const easeOut = 1 - Math.pow(1 - progress, 3);
      numberText.y = startY - easeOut * floatDistance;
      numberText.alpha = 1 - progress;
      numberText.scale.set(1 + progress * 0.3);
      
      requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate subtle screen shake
 */
export function animateScreenShake(app: Application, intensity: number = 5, duration: number = 300): Promise<void> {
  const originalX = app.stage.x;
  const originalY = app.stage.y;
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        app.stage.x = originalX;
        app.stage.y = originalY;
        resolve();
        return;
      }
      
      // Random shake with decreasing intensity
      const shakeAmount = intensity * (1 - progress);
      app.stage.x = originalX + (Math.random() - 0.5) * shakeAmount * 2;
      app.stage.y = originalY + (Math.random() - 0.5) * shakeAmount * 2;
      
      requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate character flash (brief red flash for damage)
 */
export function animateCharacterFlash(characterId: string, color: number = 0xff0000, duration: number = 250): Promise<void> {
  const sprite = characterSprites.get(characterId);
  if (!sprite) return Promise.resolve();
  
  // Store original tint (default is 0xffffff which means no tinting)
  const originalTint = sprite.tint || 0xffffff;
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        sprite.tint = originalTint;
        resolve();
        return;
      }
      
      // Flash effect: quick bright flash then fade
      if (progress < 0.3) {
        // Bright flash phase - full color tint
        sprite.tint = color;
      } else {
        // Fade back to original tint
        const fadeProgress = (progress - 0.3) / 0.7;
        
        // Blend between flash color and original (white = no tint)
        // For PixiJS, tint is multiplicative, so we need to interpolate in RGB space
        const r1 = (color >> 16) & 0xFF;
        const g1 = (color >> 8) & 0xFF;
        const b1 = color & 0xFF;
        
        const r2 = (originalTint >> 16) & 0xFF;
        const g2 = (originalTint >> 8) & 0xFF;
        const b2 = originalTint & 0xFF;
        
        // Linear interpolation
        const r = Math.round(r1 * (1 - fadeProgress) + r2 * fadeProgress);
        const g = Math.round(g1 * (1 - fadeProgress) + g2 * fadeProgress);
        const b = Math.round(b1 * (1 - fadeProgress) + b2 * fadeProgress);
        
        sprite.tint = (r << 16) | (g << 8) | b;
      }
      
      requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate healing particles flowing upward
 */
export function animateHealingParticles(
  targetId: string,
  app: Application,
  config?: AnimationConfig['heal']
): Promise<void> {
  const targetSprite = characterSprites.get(targetId);
  if (!targetSprite) return Promise.resolve();
  
  const particleColor = config?.particleColor ?? 0x22c55e; // Green
  const particleCount = 15;
  
  const particles: Array<{ graphics: Graphics; vy: number; vx: number; startX: number; startY: number }> = [];
  
  const centerX = targetSprite.x + targetSprite.width / 2;
  const centerY = targetSprite.y + targetSprite.height / 2;
  
  // Create particles
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.random() - 0.5) * Math.PI * 0.5; // Upward angles
    const speed = 1 + Math.random() * 1.5;
    const vy = -Math.cos(angle) * speed;
    const vx = Math.sin(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
    
    const particle = new Graphics();
    particle.circle(0, 0, 3 + Math.random() * 2).fill(particleColor);
    const offsetX = (Math.random() - 0.5) * targetSprite.width * 0.6;
    const offsetY = (Math.random() - 0.5) * targetSprite.height * 0.6;
    particle.x = centerX + offsetX;
    particle.y = centerY + offsetY;
    particle.alpha = 0.8 + Math.random() * 0.2;
    
    app.stage.addChild(particle);
    particles.push({ graphics: particle, vy, vx, startX: particle.x, startY: particle.y });
  }
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const duration = 800;
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      particles.forEach((particle) => {
        particle.graphics.y += particle.vy;
        particle.graphics.x += particle.vx * 0.3; // Slight horizontal drift
        particle.graphics.alpha = (1 - progress) * 0.8;
      });
      
      if (progress >= 1) {
        particles.forEach(({ graphics }) => {
          app.stage.removeChild(graphics);
        });
        resolve();
      } else {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate pulsing glow aura around character
 */
export function animateGlowAura(
  targetId: string,
  app: Application,
  config?: AnimationConfig['heal']
): Promise<void> {
  const targetSprite = characterSprites.get(targetId);
  if (!targetSprite) return Promise.resolve();
  
  const glowIntensity = config?.glowIntensity ?? 0.3;
  const glowColor = 0x22c55e; // Green
  const centerX = targetSprite.x + targetSprite.width / 2;
  const centerY = targetSprite.y + targetSprite.height / 2;
  
  const glow = new Graphics();
  const radius = Math.max(targetSprite.width, targetSprite.height) * 0.6;
  
  glow.circle(0, 0, radius)
      .fill({ color: glowColor, alpha: glowIntensity });
  glow.x = centerX;
  glow.y = centerY;
  
  app.stage.addChild(glow);
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const duration = 600;
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      // Pulse effect (pulsing in and out)
      const pulse = (Math.sin(progress * Math.PI * 4) + 1) * 0.5;
      glow.alpha = glowIntensity * (1 - progress) * (0.5 + pulse * 0.5);
      glow.scale.set(1 + Math.sin(progress * Math.PI * 2) * 0.2);
      
      if (progress >= 1) {
        app.stage.removeChild(glow);
        resolve();
      } else {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate melee slash effect - creates a sweeping blade strike animation
 */
export function animateMeleeSlash(
  attackerId: string,
  targetId: string,
  app: Application,
  config?: AnimationConfig['damage']
): Promise<void> {
  const attackerSprite = characterSprites.get(attackerId);
  const targetSprite = characterSprites.get(targetId);
  
  if (!attackerSprite || !targetSprite) return Promise.resolve();
  
  const slashColor = config?.projectileColor ?? 0xffdd44; // Yellow/orange slash
  const attackerCenterX = attackerSprite.x + attackerSprite.width / 2;
  const attackerCenterY = attackerSprite.y + attackerSprite.height / 2;
  const targetCenterX = targetSprite.x + targetSprite.width / 2;
  const targetCenterY = targetSprite.y + targetSprite.height / 2;
  
  // Calculate angle from attacker to target
  const dx = targetCenterX - attackerCenterX;
  const dy = targetCenterY - attackerCenterY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  
  // Create slash graphics container
  const slashGraphics = new Graphics();
  app.stage.addChild(slashGraphics);
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const duration = 300; // Quick, snappy slash
    const slashLength = Math.min(distance * 1.2, 150); // Limit slash length
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      slashGraphics.clear();
      
      // Create arc of slash lines that sweep from attacker to target
      const numLines = 7;
      const sweepAngle = Math.PI / 3; // 60 degree sweep
      
      for (let i = 0; i < numLines; i++) {
        const lineProgress = Math.max(0, Math.min(1, progress * 1.3 - (i * 0.15)));
        if (lineProgress <= 0) continue;
        
        // Angle for this line (spread in an arc)
        const offset = (i / (numLines - 1) - 0.5) * sweepAngle;
        const lineAngle = angle + offset;
        
        // Start from attacker
        const startX = attackerCenterX + Math.cos(lineAngle) * 20;
        const startY = attackerCenterY + Math.sin(lineAngle) * 20;
        
        // End point sweeps toward target
        const endProgress = lineProgress;
        const endX = startX + Math.cos(lineAngle) * slashLength * endProgress;
        const endY = startY + Math.sin(lineAngle) * slashLength * endProgress;
        
        // Alpha based on progress (fade in then fade out)
        const alpha = lineProgress < 0.7 
          ? lineProgress / 0.7 
          : (1 - (lineProgress - 0.7) / 0.3);
        
        // Outer glow (wider, more transparent)
        slashGraphics.moveTo(startX, startY)
            .lineTo(endX, endY)
            .stroke({ width: 10, color: slashColor, alpha: alpha * 0.3 });
        
        // Main slash line
        slashGraphics.moveTo(startX, startY)
            .lineTo(endX, endY)
            .stroke({ width: 6, color: slashColor, alpha: alpha * 0.9 });
        
        // Bright core
        slashGraphics.moveTo(startX, startY)
            .lineTo(endX, endY)
            .stroke({ width: 2, color: 0xffffff, alpha: alpha });
      }
      
      if (progress >= 1) {
        app.stage.removeChild(slashGraphics);
        resolve();
      } else {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Play complete damage animation sequence
 */
export async function playDamageAnimation(
  attackerId: string,
  targetId: string,
  damageAmount: number,
  app: Application,
  targeting: 'single' | 'aoe' | 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies',
  config?: AnimationConfig,
  cardType?: 'attack' | 'skill' | 'power' | 'summon'
): Promise<void> {
  // For self-targeting, animate at the character itself
  if (targeting === 'self') {
    await animateAttackerShake(attackerId);
    await new Promise(resolve => setTimeout(resolve, 100));
    await Promise.all([
      animateImpactBurst(targetId, app, config?.damage),
      animateCharacterFlash(targetId, 0xff0000),
      animateFloatingNumber(targetId, damageAmount, 0xff4444, app)
    ]);
    return;
  }
  
  // For enemy/ally targeting, choose animation based on card type and config
  if (targeting === 'enemy' || targeting === 'ally') {
    // Shake attacker
    await animateAttackerShake(attackerId);
    
    // If projectileColor is set in config, it's a ranged attack (even for attack type cards)
    // Otherwise, attack type cards use melee slash, skill/power use projectile
    if (config?.damage?.projectileColor !== undefined) {
      // Ranged attack - show projectile with custom color
      const projectilePromise = animateProjectileTrail(attackerId, targetId, app, config?.damage);
      await projectilePromise;
    } else if (cardType === 'attack') {
      // Melee attack - show slash
      await animateMeleeSlash(attackerId, targetId, app, config?.damage);
      // Small delay for slash to be visible
      await new Promise(resolve => setTimeout(resolve, 50));
    } else {
      // Ranged/skill attack - show projectile (default red)
      const projectilePromise = animateProjectileTrail(attackerId, targetId, app, config?.damage);
      await projectilePromise;
    }
    
    // Impact effects
    await Promise.all([
      animateImpactBurst(targetId, app, config?.damage),
      animateCharacterFlash(targetId, 0xff0000),
      animateFloatingNumber(targetId, damageAmount, 0xff4444, app)
    ]);
    
    // Screen shake for significant damage
    if (damageAmount >= 10) {
      await animateScreenShake(app, 3);
    }
    
    return;
  }
  
  // For AOE, just show impact on target (projectile animation skipped for simplicity)
  await animateAttackerShake(attackerId);
  await new Promise(resolve => setTimeout(resolve, 100));
  await Promise.all([
    animateImpactBurst(targetId, app, config?.damage),
    animateCharacterFlash(targetId, 0xff0000),
    animateFloatingNumber(targetId, damageAmount, 0xff4444, app)
  ]);
}

/**
 * Play complete heal animation sequence
 */
export async function playHealAnimation(
  targetId: string,
  healAmount: number,
  app: Application,
  targeting: 'single' | 'aoe' | 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies',
  config?: AnimationConfig
): Promise<void> {
  // Healing particles, glow, and floating number
  await Promise.all([
    animateHealingParticles(targetId, app, config?.heal),
    animateGlowAura(targetId, app, config?.heal),
    animateFloatingNumber(targetId, healAmount, 0x22c55e, app)
  ]);
}

/**
 * Play complete attack animation sequence (legacy - kept for compatibility)
 */
export async function playAttackAnimation(attackerId: string, _targetId: string, _app: Application): Promise<void> {
  // First shake the attacker
  await animateAttackerShake(attackerId);
  
  // Then show damage spark on target (with slight delay)
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Register a card container for animation access
 */
export function registerCardContainer(cardId: string, container: Container): void {
  cardContainers.set(cardId, container);
}

/**
 * Animate card flying from hand to target, then to discard
 */
export async function animateCardPlay(
  cardId: string,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  discardX: number,
  discardY: number,
  app: Application,
  isExhaust: boolean = false
): Promise<void> {
  const cardContainer = cardContainers.get(cardId);
  if (!cardContainer) {
    // If card container not found, create a temporary visual
    return Promise.resolve();
  }
  
  const originalX = cardContainer.x;
  const originalY = cardContainer.y;
  const originalScale = cardContainer.scale?.x || 1;
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const flyDuration = 400; // Time to fly to target
    const pauseDuration = 200; // Pause at target
    const discardDuration = 300; // Time to fly to discard
    
    // Phase 1: Fly to target
    function animateToTarget() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / flyDuration, 1);
      
      if (progress >= 1) {
        // Start pause at target
        setTimeout(() => {
          animateToDiscard();
        }, pauseDuration);
        return;
      }
      
      // Ease out curve
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate position
      cardContainer.x = fromX + (targetX - fromX) * easeOut;
      cardContainer.y = fromY + (targetY - fromY) * easeOut;
      
      // Scale up during flight, slight rotation
      const scale = 1 + easeOut * 0.3;
      cardContainer.scale?.set(scale);
      cardContainer.rotation = easeOut * Math.PI * 0.3;
      cardContainer.alpha = 1;
      
      requestAnimationFrame(animateToTarget);
    }
    
    // Phase 2: Fly to discard/exhaust
    function animateToDiscard() {
      const discardStartTime = performance.now();
      
      function animate() {
        const elapsed = performance.now() - discardStartTime;
        const progress = Math.min(elapsed / discardDuration, 1);
        
        if (progress >= 1) {
          // Restore original position (card will be removed from hand in render)
          cardContainer.x = originalX;
          cardContainer.y = originalY;
          cardContainer.scale?.set(originalScale);
          cardContainer.rotation = 0;
          cardContainer.alpha = 1;
          
          if (isExhaust) {
            // Fade out for exhaust
            cardContainer.alpha = 0;
          }
          
          resolve();
          return;
        }
        
        const easeIn = Math.pow(progress, 2);
        
        // Interpolate to discard position
        cardContainer.x = targetX + (discardX - targetX) * easeIn;
        cardContainer.y = targetY + (discardY - targetY) * easeIn;
        
        // Scale down and fade
        cardContainer.scale?.set(1 - easeIn * 0.5);
        cardContainer.alpha = 1 - easeIn;
        cardContainer.rotation = Math.PI * 0.3 * (1 - easeIn);
        
        requestAnimationFrame(animate);
      }
      
      requestAnimationFrame(animate);
    }
    
    animateToTarget();
  });
}

/**
 * Enhanced screen shake with damage-based scaling
 */
export function animateEnhancedScreenShake(
  app: Application, 
  damageAmount: number,
  duration: number = 300
): Promise<void> {
  // Scale intensity based on damage (more damage = more shake)
  const baseIntensity = 5;
  const maxIntensity = 15;
  const intensity = Math.min(baseIntensity + (damageAmount / 5), maxIntensity);
  
  return animateScreenShake(app, intensity, duration);
}

/**
 * Damage flash overlay - red tint on screen for big hits
 */
export function animateDamageFlash(
  app: Application,
  damageAmount: number,
  duration: number = 150
): Promise<void> {
  // Only flash for significant damage
  if (damageAmount < 5) return Promise.resolve();
  
  const overlay = new Graphics();
  overlay.rect(0, 0, app.screen.width, app.screen.height);
  overlay.fill({ color: 0xff0000, alpha: 0.15 + (damageAmount / 100) * 0.2 }); // Scale opacity with damage
  overlay.zIndex = 9999; // On top
  app.stage.addChild(overlay);
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        app.stage.removeChild(overlay);
        resolve();
        return;
      }
      
      // Fade out quickly
      overlay.alpha = 1 - Math.pow(progress, 2);
      requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Camera zoom effect on big hits or important moments
 */
// Camera state (not currently exported but available for future use)
// let cameraZoom = 1;
// let cameraTargetZoom = 1;

export function animateCameraZoom(
  app: Application,
  targetZoom: number = 1.1,
  duration: number = 300,
  holdDuration: number = 200
): Promise<void> {
  const originalScale = app.stage.scale.x;
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const zoomDuration = duration;
    const totalDuration = duration * 2 + holdDuration;
    
    function animate() {
      const elapsed = performance.now() - startTime;
      const totalProgress = elapsed / totalDuration;
      
      if (totalProgress >= 1) {
        // Reset zoom
        app.stage.scale.set(originalScale);
        resolve();
        return;
      }
      
      let zoom: number;
      if (elapsed < zoomDuration) {
        // Zoom in
        const progress = elapsed / zoomDuration;
        const easeOut = 1 - Math.pow(1 - progress, 3);
        zoom = 1 + (targetZoom - 1) * easeOut;
      } else if (elapsed < zoomDuration + holdDuration) {
        // Hold zoomed
        zoom = targetZoom;
      } else {
        // Zoom out
        const outProgress = (elapsed - zoomDuration - holdDuration) / zoomDuration;
        const easeIn = Math.pow(outProgress, 2);
        zoom = targetZoom - (targetZoom - 1) * easeIn;
      }
      
      app.stage.scale.set(originalScale * zoom);
      
      requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Particle system with variety (fire, ice, lightning, shadow)
 */
export interface ParticleType {
  color: number[];
  speed: number;
  lifetime: number;
  gravity?: number;
  size: number;
}

const PARTICLE_TYPES: Record<string, ParticleType> = {
  fire: {
    color: [0xff6600, 0xff9900, 0xffff00],
    speed: 2,
    lifetime: 800,
    gravity: -0.3, // Upward drift
    size: 4
  },
  ice: {
    color: [0x00ffff, 0x88ddff, 0xffffff],
    speed: 1.5,
    lifetime: 1000,
    gravity: 0.2, // Slow fall
    size: 5
  },
  lightning: {
    color: [0xffff00, 0xffffff, 0x00ffff],
    speed: 3,
    lifetime: 400,
    gravity: 0,
    size: 3
  },
  shadow: {
    color: [0x000000, 0x333333, 0x666666],
    speed: 1,
    lifetime: 1200,
    gravity: 0.1,
    size: 6
  },
  healing: {
    color: [0x22c55e, 0x86efac, 0xd1fae5],
    speed: 1.5,
    lifetime: 1000,
    gravity: -0.2,
    size: 4
  }
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  lifetime: number;
  maxLifetime: number;
}

export function animateParticles(
  targetId: string,
  particleType: string,
  count: number,
  app: Application
): Promise<void> {
  const targetSprite = characterSprites.get(targetId);
  if (!targetSprite) return Promise.resolve();
  
  const type = PARTICLE_TYPES[particleType] || PARTICLE_TYPES.fire;
  const particles: Particle[] = [];
  const centerX = targetSprite.x + targetSprite.width / 2;
  const centerY = targetSprite.y + targetSprite.height / 2;
  
  // Create particles
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = type.speed + (Math.random() - 0.5) * 0.5;
    
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: type.color[Math.floor(Math.random() * type.color.length)],
      size: type.size + (Math.random() - 0.5) * 2,
      lifetime: 0,
      maxLifetime: type.lifetime + (Math.random() - 0.5) * 200
    });
  }
  
  const container = new Graphics();
  app.stage.addChild(container);
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    
    function animate() {
      container.clear();
      
      let aliveCount = 0;
      
      for (const particle of particles) {
        if (particle.lifetime < particle.maxLifetime) {
          aliveCount++;
          
          // Update position
          particle.x += particle.vx;
          particle.y += particle.vy;
          
          // Apply gravity
          if (type.gravity !== undefined) {
            particle.vy += type.gravity;
          }
          
          // Fade based on lifetime
          particle.lifetime += 16; // ~60fps
          const alpha = 1 - (particle.lifetime / particle.maxLifetime);
          
          // Draw particle
          if (alpha > 0.1) {
            container.circle(particle.x, particle.y, particle.size * alpha)
              .fill({ color: particle.color, alpha: alpha * 0.8 });
          }
        }
      }
      
      if (aliveCount === 0) {
        app.stage.removeChild(container);
        resolve();
        return;
      }
      
      requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Multi-hit/combo animation with sequential hits
 */
export async function animateMultiHit(
  attackerId: string,
  targetId: string,
  hitCount: number,
  totalDamage: number,
  app: Application,
  delayBetweenHits: number = 80
): Promise<void> {
  // Shake attacker
  await animateAttackerShake(attackerId);
  
  const damagePerHit = Math.floor(totalDamage / hitCount);
  const animations: Promise<void>[] = [];
  
  for (let i = 0; i < hitCount; i++) {
    const delay = i * delayBetweenHits;
    
    animations.push(
      new Promise(async (resolve) => {
        await new Promise(r => setTimeout(r, delay));
        
        // Small impact per hit
        await animateImpactBurst(targetId, app, { impactSize: 30 + i * 5 });
        await animateCharacterFlash(targetId, 0xff0000, 100);
        
        // Show damage number for each hit (stacked slightly)
        await animateFloatingNumber(
          targetId,
          damagePerHit,
          0xff4444,
          app
        );
        
        resolve();
      })
    );
  }
  
  // Final cumulative number
  await Promise.all(animations);
  await new Promise(r => setTimeout(r, 100));
  
  // Show total damage with larger number
  await animateFloatingNumber(
    targetId,
    totalDamage,
    0xff0000, // Brighter red for total
    app
  );
}

