// Projectile system - Premium quality with multiple projectile types
class Projectile {
    constructor(x, y, target, damage, owner, sourceType) {
        this.x = x;
        this.y = y;
        this.originX = x;
        this.originY = y;
        this.target = target;
        this.damage = damage;
        this.owner = owner;
        this.alive = true;
        this.age = 0;

        // Trail history - store previous positions
        this.trail = [];
        this.maxTrailLength = 8;

        // Determine projectile type based on source unit or damage
        if (sourceType === 'commando') {
            // Sniper round - very fast, thin tracer, long trail
            this.type = 'sniper';
            this.speed = 14;
            this.size = 1;
            this.glowSize = 3;
            this.trailWidth = 0.8;
            this.maxTrailLength = 16;
            this.headColor = '#ffffff';
            this.glowColor = 'rgba(200, 220, 255, 0.4)';
            this.trailColors = ['rgba(200, 220, 255, 0.5)', 'rgba(150, 180, 255, 0.3)', 'rgba(100, 130, 200, 0.1)'];
            this.smokeTrail = false;
            this.arcHeight = 0;
        } else if (damage >= 40) {
            // Siege shell - heavy artillery
            this.type = 'siege';
            this.speed = 4;
            this.size = 4;
            this.glowSize = 12;
            this.trailWidth = 3;
            this.maxTrailLength = 14;
            this.headColor = '#ff4400';
            this.glowColor = 'rgba(255, 80, 0, 0.6)';
            this.trailColors = ['rgba(255, 100, 0, 0.5)', 'rgba(180, 60, 0, 0.3)', 'rgba(80, 40, 0, 0.1)'];
            this.smokeTrail = true;
            this.arcHeight = 30;
        } else if (damage >= 20) {
            // Rocket - medium-heavy
            this.type = 'rocket';
            this.speed = 5;
            this.size = 3;
            this.glowSize = 10;
            this.trailWidth = 2.5;
            this.maxTrailLength = 12;
            this.headColor = '#ff6622';
            this.glowColor = 'rgba(255, 100, 20, 0.5)';
            this.trailColors = ['rgba(255, 120, 20, 0.5)', 'rgba(200, 60, 0, 0.3)', 'rgba(100, 30, 0, 0.1)'];
            this.smokeTrail = true;
            this.arcHeight = 0;
        } else if (damage >= 10) {
            // Cannon shell - medium
            this.type = 'cannon';
            this.speed = 7;
            this.size = 2.5;
            this.glowSize = 7;
            this.trailWidth = 2;
            this.maxTrailLength = 10;
            this.headColor = '#ffaa00';
            this.glowColor = 'rgba(255, 170, 0, 0.4)';
            this.trailColors = ['rgba(255, 170, 0, 0.4)', 'rgba(200, 120, 0, 0.2)', 'rgba(120, 60, 0, 0.05)'];
            this.smokeTrail = false;
            this.arcHeight = 0;
        } else {
            // Bullet - light, fast
            this.type = 'bullet';
            this.speed = 9;
            this.size = 1.5;
            this.glowSize = 4;
            this.trailWidth = 1;
            this.maxTrailLength = 6;
            this.headColor = '#ffffcc';
            this.glowColor = 'rgba(255, 255, 180, 0.3)';
            this.trailColors = ['rgba(255, 255, 150, 0.3)', 'rgba(255, 220, 80, 0.15)', 'rgba(200, 160, 0, 0.05)'];
            this.smokeTrail = false;
            this.arcHeight = 0;
        }

        // Muzzle flash timer
        this.muzzleFlashTime = 80;
        this.muzzleFlashElapsed = 0;
        this.showMuzzleFlash = true;

        // Arc progress for siege shells
        this.distanceToTarget = 0;
        this.traveledDistance = 0;
        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            this.distanceToTarget = Math.sqrt(dx * dx + dy * dy);
        }

        // Smoke trail timer
        this.smokeTimer = 0;
        this.smokeInterval = 30;
    }

    update(game) {
        if (!this.target || this.target.hp <= 0) {
            this.alive = false;
            return;
        }

        const dt = game.deltaTime / 16;
        this.age += game.deltaTime;

        // Update muzzle flash
        if (this.showMuzzleFlash) {
            this.muzzleFlashElapsed += game.deltaTime;
            if (this.muzzleFlashElapsed >= this.muzzleFlashTime) {
                this.showMuzzleFlash = false;
            }
        }

        // Store current position in trail
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.pop();
        }

        const tx = this.target.x;
        const ty = this.target.y;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 8) {
            // Hit - play impact sound
            if (this.damage >= 20) {
                game.audio.play('hit_explosion');
            } else {
                game.audio.play('hit_small');
            }

            // Add impact sparks for all projectile types
            if (game.particles) {
                if (this.type === 'sniper') {
                    game.particles.addSparks(this.x, this.y, 4);
                } else if (this.type === 'bullet') {
                    game.particles.addSparks(this.x, this.y, 3);
                } else if (this.type === 'cannon') {
                    game.particles.addSparks(this.x, this.y, 6);
                }
            }

            const destroyed = this.target.takeDamage(this.damage, this.owner, game);
            if (destroyed) {
                game.addExplosion(this.target.x, this.target.y, this.target.isBuilding);
                // Play destruction sound based on what was destroyed
                if (this.target.isBuilding) {
                    game.audio.play('building_destroyed');
                } else if (this.target.isUnit) {
                    const t = this.target.type;
                    if (t === 'light_infantry' || t === 'heavy_trooper') {
                        game.audio.play('unit_killed');
                    } else {
                        game.audio.play('vehicle_destroyed');
                    }
                }
                game.removeEntity(this.target);
            }
            this.alive = false;
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        this.x += nx * this.speed * dt;
        this.y += ny * this.speed * dt;
        this.traveledDistance += this.speed * dt;

        // Emit smoke particles for rockets and siege shells
        if (this.smokeTrail && game.particles) {
            this.smokeTimer += game.deltaTime;
            if (this.smokeTimer >= this.smokeInterval) {
                this.smokeTimer = 0;
                const spreadX = randomFloat(-1.5, 1.5);
                const spreadY = randomFloat(-1.5, 1.5);
                game.particles.particles.push({
                    x: this.x + spreadX,
                    y: this.y + spreadY,
                    vx: -nx * 0.3 + randomFloat(-0.2, 0.2),
                    vy: -ny * 0.3 + randomFloat(-0.2, 0.2) - 0.3,
                    life: randomFloat(300, 600),
                    maxLife: 600,
                    size: randomFloat(2, 4),
                    type: 'smoke',
                    growRate: randomFloat(1.5, 3),
                    r: randomInt(60, 100),
                    g: randomInt(60, 100),
                    b: randomInt(60, 100)
                });
            }
        }
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // Calculate arc offset for siege shells
        let arcOffset = 0;
        if (this.arcHeight > 0 && this.distanceToTarget > 0) {
            const progress = this.traveledDistance / this.distanceToTarget;
            arcOffset = -Math.sin(progress * Math.PI) * this.arcHeight;
        }

        // Render muzzle flash at origin
        if (this.showMuzzleFlash) {
            const flashProgress = this.muzzleFlashElapsed / this.muzzleFlashTime;
            const flashAlpha = 1 - flashProgress;
            const flashSize = (this.type === 'siege' ? 14 : this.type === 'rocket' ? 10 : this.type === 'cannon' ? 8 : 5) * (1 - flashProgress * 0.5);
            const ox = this.originX - camera.x;
            const oy = this.originY - camera.y;

            ctx.save();
            // Glow: larger semi-transparent circle instead of shadowBlur
            ctx.globalAlpha = flashAlpha * 0.3;
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(ox, oy, flashSize + flashSize * 2, 0, Math.PI * 2);
            ctx.fill();
            // Core with gradient
            ctx.globalAlpha = flashAlpha;
            const flashGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, flashSize);
            flashGrad.addColorStop(0, `rgba(255, 255, 220, ${flashAlpha})`);
            flashGrad.addColorStop(0.3, `rgba(255, 200, 50, ${flashAlpha * 0.7})`);
            flashGrad.addColorStop(0.7, `rgba(255, 120, 0, ${flashAlpha * 0.3})`);
            flashGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');
            ctx.fillStyle = flashGrad;
            ctx.beginPath();
            ctx.arc(ox, oy, flashSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Render trail from stored positions
        if (this.trail.length > 1) {
            for (let i = 0; i < this.trail.length - 1; i++) {
                const t0 = this.trail[i];
                const t1 = this.trail[i + 1];
                const progress = i / this.trail.length;
                const alpha = (1 - progress) * 0.6;
                const width = this.trailWidth * (1 - progress * 0.7);

                // Calculate arc offsets for trail points
                let arc0 = 0, arc1 = 0;
                if (this.arcHeight > 0 && this.distanceToTarget > 0) {
                    const dist0 = Math.sqrt((t0.x - this.originX) ** 2 + (t0.y - this.originY) ** 2);
                    const dist1 = Math.sqrt((t1.x - this.originX) ** 2 + (t1.y - this.originY) ** 2);
                    const p0 = dist0 / this.distanceToTarget;
                    const p1 = dist1 / this.distanceToTarget;
                    arc0 = -Math.sin(Math.min(p0, 1) * Math.PI) * this.arcHeight;
                    arc1 = -Math.sin(Math.min(p1, 1) * Math.PI) * this.arcHeight;
                }

                // Pick trail color based on position in trail
                const colorIdx = Math.min(Math.floor(progress * this.trailColors.length), this.trailColors.length - 1);

                ctx.strokeStyle = this.trailColors[colorIdx];
                ctx.globalAlpha = alpha;
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(t0.x - camera.x, t0.y - camera.y + arc0);
                ctx.lineTo(t1.x - camera.x, t1.y - camera.y + arc1);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // Render projectile head with glow
        const drawY = screenY + arcOffset;

        ctx.save();

        // Outer glow: semi-transparent larger circle instead of shadowBlur
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = this.headColor;
        ctx.beginPath();
        ctx.arc(screenX, drawY, this.size + this.glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.glowColor;
        ctx.beginPath();
        ctx.arc(screenX, drawY, this.size + 1, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = this.headColor;
        ctx.beginPath();
        ctx.arc(screenX, drawY, this.size, 0, Math.PI * 2);
        ctx.fill();

        // White-hot center for larger projectiles
        if (this.type !== 'bullet') {
            ctx.fillStyle = 'rgba(255, 255, 240, 0.9)';
            ctx.beginPath();
            ctx.arc(screenX, drawY, this.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Rocket flame flicker
        if (this.type === 'rocket' || this.type === 'siege') {
            const dx = this.target ? this.target.x - this.x : 0;
            const dy = this.target ? this.target.y - this.y : 0;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = dx / dist;
            const ny = dy / dist;

            const flicker = Math.sin(this.age * 0.05) * 0.3 + 0.7;
            const flameLen = (this.type === 'siege' ? 8 : 6) * flicker;

            ctx.save();
            ctx.globalAlpha = 0.7 * flicker;
            const flameGrad = ctx.createRadialGradient(
                screenX - nx * flameLen * 0.5, drawY - ny * flameLen * 0.5, 0,
                screenX - nx * flameLen * 0.5, drawY - ny * flameLen * 0.5, flameLen
            );
            flameGrad.addColorStop(0, 'rgba(255, 200, 50, 0.8)');
            flameGrad.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
            flameGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
            ctx.fillStyle = flameGrad;
            ctx.beginPath();
            ctx.arc(screenX - nx * flameLen * 0.5, drawY - ny * flameLen * 0.5, flameLen, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}
