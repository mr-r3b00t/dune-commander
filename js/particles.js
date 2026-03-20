// Particle and explosion system - Premium quality with multi-phase effects
class ParticleSystem {
    constructor() {
        this.particles = [];
        this.explosions = [];
        this.screenShake = 0;
        this.screenShakeDecay = 0.9;
    }

    // Returns current screen shake intensity and decays it
    getScreenShake() {
        const shake = this.screenShake;
        return shake;
    }

    addExplosion(x, y, large = false) {
        const count = large ? 45 : 20;
        const size = large ? 50 : 25;

        // Screen shake
        this.screenShake = large ? 8 : 3;

        // Phase 1: Initial white flash (very brief)
        this.explosions.push({
            x, y,
            radius: 0,
            maxRadius: size * 0.6,
            alpha: 1,
            duration: 80,
            elapsed: 0,
            phase: 'flash',
            innerColor: { r: 255, g: 255, b: 240 },
            outerColor: { r: 255, g: 220, b: 100 }
        });

        // Phase 2: Fireball (expanding orange/red)
        this.explosions.push({
            x, y,
            radius: 0,
            maxRadius: size,
            alpha: 1,
            duration: large ? 500 : 300,
            elapsed: 0,
            phase: 'fireball',
            delay: 40,
            innerColor: { r: 255, g: 180, b: 0 },
            outerColor: { r: 200, g: 50, b: 0 }
        });

        // Phase 3: Lingering smoke cloud
        this.explosions.push({
            x, y,
            radius: 0,
            maxRadius: size * 1.3,
            alpha: 0.6,
            duration: large ? 1200 : 700,
            elapsed: 0,
            phase: 'smoke_cloud',
            delay: 150,
            innerColor: { r: 80, g: 70, b: 60 },
            outerColor: { r: 50, g: 45, b: 40 }
        });

        // Fire/ember particles
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randomFloat(0.8, 4);
            const life = randomFloat(300, 900);
            const isEmber = Math.random() > 0.6;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life,
                maxLife: life,
                size: isEmber ? randomFloat(1, 2.5) : randomFloat(2, 6),
                type: isEmber ? 'ember' : 'fire',
                r: isEmber ? randomInt(255, 255) : randomInt(200, 255),
                g: isEmber ? randomInt(150, 220) : randomInt(60, 180),
                b: isEmber ? randomInt(0, 50) : 0
            });
        }

        // Smoke particles that billow upward (dark to light)
        const smokeCount = large ? 20 : 10;
        for (let i = 0; i < smokeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randomFloat(0.2, 1.2);
            const life = randomFloat(800, 2000);
            const darkness = randomInt(40, 90);
            this.particles.push({
                x: x + randomFloat(-8, 8),
                y: y + randomFloat(-8, 8),
                vx: Math.cos(angle) * speed + randomFloat(-0.3, 0.3),
                vy: -randomFloat(0.4, 1.2),
                life,
                maxLife: life,
                size: randomFloat(5, 12),
                type: 'smoke',
                growRate: randomFloat(2, 4),
                r: darkness,
                g: darkness,
                b: darkness
            });
        }

        // Debris particles with gravity
        const debrisCount = large ? 12 : 6;
        for (let i = 0; i < debrisCount; i++) {
            const angle = randomFloat(-Math.PI, 0);
            const speed = randomFloat(2, 5);
            const life = randomFloat(600, 1400);
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - randomFloat(1, 3),
                life,
                maxLife: life,
                size: randomFloat(1.5, 3.5),
                type: 'debris',
                gravity: 0.08,
                r: randomInt(60, 120),
                g: randomInt(40, 80),
                b: randomInt(20, 40),
                rotation: randomFloat(0, Math.PI * 2),
                rotSpeed: randomFloat(-0.1, 0.1)
            });
        }

        // Sparks that scatter outward
        this.addSparks(x, y, large ? 15 : 8);
    }

    addSandPuff(x, y) {
        const count = 8;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randomFloat(0.2, 0.8);
            const life = randomFloat(350, 600);
            const shade = randomInt(170, 210);
            this.particles.push({
                x: x + randomFloat(-3, 3),
                y: y + randomFloat(-3, 3),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - randomFloat(0.1, 0.4),
                life,
                maxLife: life,
                size: randomFloat(2, 5),
                type: 'sand',
                growRate: randomFloat(0.8, 1.5),
                r: shade,
                g: Math.floor(shade * 0.82),
                b: Math.floor(shade * 0.45)
            });
        }
    }

    addMuzzleFlash(x, y, angle) {
        // Bright core flash
        const flashLife = 60;
        this.particles.push({
            x, y,
            vx: Math.cos(angle) * 1.5,
            vy: Math.sin(angle) * 1.5,
            life: flashLife,
            maxLife: flashLife,
            size: 6,
            type: 'muzzle_flash'
        });

        // Side sparks from muzzle
        for (let i = 0; i < 4; i++) {
            const spreadAngle = angle + randomFloat(-0.6, 0.6);
            const speed = randomFloat(1.5, 4);
            const life = randomFloat(40, 120);
            this.particles.push({
                x, y,
                vx: Math.cos(spreadAngle) * speed,
                vy: Math.sin(spreadAngle) * speed,
                life,
                maxLife: life,
                size: randomFloat(1, 2),
                type: 'ember',
                r: 255,
                g: randomInt(180, 255),
                b: randomInt(50, 100)
            });
        }

        // Tiny smoke puffs from muzzle
        for (let i = 0; i < 3; i++) {
            const life = randomFloat(150, 350);
            this.particles.push({
                x: x + randomFloat(-2, 2),
                y: y + randomFloat(-2, 2),
                vx: Math.cos(angle) * randomFloat(0.3, 0.8) + randomFloat(-0.2, 0.2),
                vy: Math.sin(angle) * randomFloat(0.3, 0.8) - randomFloat(0.2, 0.5),
                life,
                maxLife: life,
                size: randomFloat(2, 4),
                type: 'smoke',
                growRate: randomFloat(1, 2),
                r: randomInt(120, 160),
                g: randomInt(120, 160),
                b: randomInt(120, 160)
            });
        }
    }

    addDustTrail(x, y) {
        // For vehicles moving on sand - kicked up dust behind
        for (let i = 0; i < 3; i++) {
            const life = randomFloat(300, 600);
            const shade = randomInt(160, 200);
            this.particles.push({
                x: x + randomFloat(-4, 4),
                y: y + randomFloat(-2, 2),
                vx: randomFloat(-0.3, 0.3),
                vy: -randomFloat(0.2, 0.6),
                life,
                maxLife: life,
                size: randomFloat(3, 6),
                type: 'sand',
                growRate: randomFloat(1.5, 3),
                r: shade,
                g: Math.floor(shade * 0.82),
                b: Math.floor(shade * 0.45)
            });
        }
    }

    addSparks(x, y, count = 8) {
        for (let i = 0; i < count; i++) {
            const angle = randomFloat(-Math.PI, Math.PI);
            const speed = randomFloat(2, 6);
            const life = randomFloat(200, 600);
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - randomFloat(0.5, 2),
                life,
                maxLife: life,
                size: randomFloat(1, 2),
                type: 'spark',
                gravity: 0.06,
                bounceCount: 0,
                maxBounces: randomInt(1, 3),
                groundY: y + randomFloat(5, 20),
                r: 255,
                g: randomInt(180, 255),
                b: randomInt(30, 100)
            });
        }
    }

    addBuildingSmoke(x, y) {
        // Continuous smoke for damaged buildings
        const life = randomFloat(800, 1500);
        const darkness = randomInt(50, 80);
        this.particles.push({
            x: x + randomFloat(-8, 8),
            y: y + randomFloat(-5, 0),
            vx: randomFloat(-0.2, 0.2),
            vy: -randomFloat(0.3, 0.8),
            life,
            maxLife: life,
            size: randomFloat(3, 7),
            type: 'smoke',
            growRate: randomFloat(2, 4),
            r: darkness,
            g: darkness,
            b: darkness
        });

        // Occasional embers from damaged building
        if (Math.random() > 0.7) {
            this.particles.push({
                x: x + randomFloat(-6, 6),
                y: y + randomFloat(-3, 3),
                vx: randomFloat(-0.3, 0.3),
                vy: -randomFloat(0.5, 1.5),
                life: randomFloat(200, 500),
                maxLife: 500,
                size: randomFloat(1, 1.5),
                type: 'ember',
                r: 255,
                g: randomInt(120, 200),
                b: 0
            });
        }
    }

    update(deltaTime) {
        const dt = deltaTime / 16;

        // Decay screen shake
        if (this.screenShake > 0.1) {
            this.screenShake *= this.screenShakeDecay;
        } else {
            this.screenShake = 0;
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= deltaTime;

            // Apply gravity to debris and sparks
            if (p.gravity) {
                p.vy += p.gravity * dt;
            }

            // Debris rotation
            if (p.rotation !== undefined && p.rotSpeed) {
                p.rotation += p.rotSpeed * dt;
            }

            // Smoke grows over time
            if (p.type === 'smoke' && p.growRate) {
                p.size += p.growRate * dt * 0.05;
                // Smoke lightens as it ages
                const agePct = 1 - (p.life / p.maxLife);
                const lighten = agePct * 80;
                p.r = Math.min(180, (p.r || 60) + lighten * 0.02);
                p.g = Math.min(180, (p.g || 60) + lighten * 0.02);
                p.b = Math.min(180, (p.b || 60) + lighten * 0.02);
            }

            // Sand particles grow slightly
            if (p.type === 'sand' && p.growRate) {
                p.size += p.growRate * dt * 0.03;
            }

            // Spark bouncing
            if (p.type === 'spark' && p.groundY !== undefined) {
                if (p.y >= p.groundY && p.bounceCount < p.maxBounces) {
                    p.y = p.groundY;
                    p.vy = -Math.abs(p.vy) * 0.4;
                    p.vx *= 0.7;
                    p.bounceCount++;
                }
            }

            if (p.life <= 0) {
                this.particles[i] = this.particles[this.particles.length - 1];
                this.particles.pop();
            }
        }

        // Update explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const e = this.explosions[i];

            // Handle delay
            if (e.delay && e.delay > 0) {
                e.delay -= deltaTime;
                continue;
            }

            e.elapsed += deltaTime;
            const t = Math.min(e.elapsed / e.duration, 1);

            if (e.phase === 'flash') {
                // Flash expands fast then fades
                e.radius = e.maxRadius * Math.pow(t, 0.3);
                e.alpha = 1 - Math.pow(t, 0.5);
            } else if (e.phase === 'fireball') {
                // Fireball expands with easing then shrinks slightly
                const expand = t < 0.4 ? t / 0.4 : 1;
                const fade = t > 0.3 ? (t - 0.3) / 0.7 : 0;
                e.radius = e.maxRadius * Math.pow(expand, 0.5);
                e.alpha = (1 - Math.pow(fade, 1.5)) * 0.9;
            } else if (e.phase === 'smoke_cloud') {
                // Smoke expands slowly and drifts
                e.radius = e.maxRadius * Math.pow(t, 0.7);
                e.alpha = (1 - t) * 0.35;
                e.y -= 0.15 * dt;
            }

            if (e.elapsed >= e.duration) {
                this.explosions[i] = this.explosions[this.explosions.length - 1];
                this.explosions.pop();
            }
        }
    }

    render(ctx, camera) {
        // Render explosions (back to front by phase)
        const phaseOrder = ['smoke_cloud', 'fireball', 'flash'];
        for (const phase of phaseOrder) {
            for (const e of this.explosions) {
                if (e.phase !== phase) continue;
                if (e.delay && e.delay > 0) continue;
                if (e.radius <= 0 || e.alpha <= 0) continue;

                const sx = e.x - camera.x;
                const sy = e.y - camera.y;

                if (e.phase === 'flash') {
                    // Bright white-yellow flash
                    ctx.save();
                    ctx.globalAlpha = e.alpha;
                    ctx.shadowBlur = e.radius * 2;
                    ctx.shadowColor = `rgb(${e.innerColor.r}, ${e.innerColor.g}, ${e.innerColor.b})`;
                    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, e.radius);
                    grad.addColorStop(0, `rgba(${e.innerColor.r}, ${e.innerColor.g}, ${e.innerColor.b}, ${e.alpha})`);
                    grad.addColorStop(0.5, `rgba(${e.outerColor.r}, ${e.outerColor.g}, ${e.outerColor.b}, ${e.alpha * 0.6})`);
                    grad.addColorStop(1, `rgba(${e.outerColor.r}, ${e.outerColor.g}, ${e.outerColor.b}, 0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(sx, sy, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (e.phase === 'fireball') {
                    // Multi-layered fireball
                    ctx.save();
                    ctx.globalAlpha = e.alpha;
                    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, e.radius);
                    grad.addColorStop(0, `rgba(255, 240, 180, ${e.alpha * 0.8})`);
                    grad.addColorStop(0.2, `rgba(${e.innerColor.r}, ${e.innerColor.g}, ${e.innerColor.b}, ${e.alpha * 0.7})`);
                    grad.addColorStop(0.6, `rgba(${e.outerColor.r}, ${e.outerColor.g}, ${e.outerColor.b}, ${e.alpha * 0.4})`);
                    grad.addColorStop(1, `rgba(${e.outerColor.r}, ${e.outerColor.g}, 0, 0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(sx, sy, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (e.phase === 'smoke_cloud') {
                    // Soft smoke cloud
                    ctx.save();
                    ctx.globalAlpha = e.alpha;
                    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, e.radius);
                    grad.addColorStop(0, `rgba(${e.innerColor.r}, ${e.innerColor.g}, ${e.innerColor.b}, ${e.alpha * 0.6})`);
                    grad.addColorStop(0.6, `rgba(${e.outerColor.r}, ${e.outerColor.g}, ${e.outerColor.b}, ${e.alpha * 0.3})`);
                    grad.addColorStop(1, `rgba(${e.outerColor.r}, ${e.outerColor.g}, ${e.outerColor.b}, 0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(sx, sy, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }

        // Render particles grouped by type for efficient state changes
        ctx.save();

        for (const p of this.particles) {
            const sx = p.x - camera.x;
            const sy = p.y - camera.y;
            const alpha = Math.max(0, p.life / p.maxLife);

            if (p.type === 'fire') {
                const fireRadius = p.size * (0.3 + alpha * 0.7);
                // Glow: larger semi-transparent circle instead of shadowBlur
                ctx.globalAlpha = alpha * 0.25;
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, 0)`;
                ctx.beginPath();
                ctx.arc(sx, sy, fireRadius + p.size * 2, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.globalAlpha = alpha * 0.9;
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                ctx.beginPath();
                ctx.arc(sx, sy, fireRadius, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'ember') {
                const emberRadius = p.size * alpha;
                // Glow: larger semi-transparent circle instead of shadowBlur
                ctx.globalAlpha = alpha * 0.3;
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                ctx.beginPath();
                ctx.arc(sx, sy, emberRadius + 3, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.globalAlpha = alpha;
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                ctx.beginPath();
                ctx.arc(sx, sy, emberRadius, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'smoke') {
                const smokeAlpha = alpha * 0.45;
                ctx.globalAlpha = smokeAlpha;
                ctx.shadowBlur = 0;
                const r = Math.floor(p.r || 80);
                const g = Math.floor(p.g || 80);
                const b = Math.floor(p.b || 80);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.beginPath();
                ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'debris') {
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 0;
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                ctx.save();
                ctx.translate(sx, sy);
                if (p.rotation !== undefined) {
                    ctx.rotate(p.rotation);
                }
                ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
                ctx.restore();
            } else if (p.type === 'spark') {
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                // Draw spark as a small bright line in direction of motion
                const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (speed > 0.5) {
                    const nx = p.vx / speed;
                    const ny = p.vy / speed;
                    const len = Math.min(speed * 2, 5);
                    // Glow: semi-transparent circle behind instead of shadowBlur
                    ctx.globalAlpha = alpha * 0.3;
                    ctx.beginPath();
                    ctx.arc(sx, sy, p.size + 2, 0, Math.PI * 2);
                    ctx.fill();
                    // Core line
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                    ctx.lineWidth = p.size * 0.8;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(sx - nx * len, sy - ny * len);
                    ctx.lineTo(sx, sy);
                    ctx.stroke();
                } else {
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    ctx.arc(sx, sy, p.size * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (p.type === 'sand') {
                ctx.globalAlpha = alpha * 0.5;
                ctx.shadowBlur = 0;
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                ctx.beginPath();
                ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'muzzle_flash') {
                const mfRadius = p.size * (0.5 + alpha * 0.5);
                // Glow: larger semi-transparent circle instead of shadowBlur
                ctx.globalAlpha = alpha * 0.3;
                ctx.fillStyle = '#ffcc44';
                ctx.beginPath();
                ctx.arc(sx, sy, mfRadius + p.size * 3, 0, Math.PI * 2);
                ctx.fill();
                // Core with gradient
                ctx.globalAlpha = alpha;
                const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.size * alpha);
                grad.addColorStop(0, `rgba(255, 255, 230, ${alpha})`);
                grad.addColorStop(0.4, `rgba(255, 200, 60, ${alpha * 0.6})`);
                grad.addColorStop(1, 'rgba(255, 120, 0, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(sx, sy, mfRadius, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Fallback for any generic particles
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 0;
                ctx.fillStyle = p.color || '#fff';
                ctx.beginPath();
                ctx.arc(sx, sy, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}
