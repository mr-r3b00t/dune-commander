// Building class
class Building extends Entity {
    constructor(tx, ty, owner, type) {
        super(tx, ty, owner, type);
        const def = BUILDING_DEFS[type];
        this.isBuilding = true;
        this.name = def.name;
        this.width = def.width;
        this.height = def.height;
        this.maxHp = def.hp;
        this.hp = def.hp;
        this.power = def.power;
        this.icon = def.icon;

        // Center position
        this.x = tx * TILE_SIZE + (this.width * TILE_SIZE) / 2;
        this.y = ty * TILE_SIZE + (this.height * TILE_SIZE) / 2;

        // Attack capability (turrets)
        this.attackRange = def.attackRange || 0;
        this.attackDamage = def.attackDamage || 0;
        this.attackSpeed = def.attackSpeed || 0;
        this.target = null;

        // Build queue (for production buildings)
        this.buildQueue = [];
        this.buildProgress = 0;
        this.currentBuild = null;

        // Refinery specific
        this.rallyPoint = null;

        // Radar
        this.radarRadius = def.radarRadius || 0;

        // Construction animation
        this.constructionProgress = 1;
        this.isConstructing = false;

        // Repair
        this.repairing = false;
        this.repairCostPerHp = 0.3; // credits per HP restored

        // Repair Bay / Hospital healing
        this.lastHealTick = 0;
        this.activelyHealing = false;
    }

    startRepair(game) {
        if (this.hp >= this.maxHp) return;
        if (this.repairing) {
            // Toggle off if already repairing
            this.repairing = false;
            return;
        }
        this.repairing = true;
    }

    update(game) {
        // Turret behavior
        if (this.attackRange > 0 && this.owner) {
            this.updateTurret(game);
        }

        // Repair logic
        if (this.repairing) {
            this.updateRepair(game);
        }

        // Repair Bay: heal nearby vehicles
        if (this.type === 'repair_bay') {
            this.updateRepairBay(game);
        }

        // Hospital: heal nearby infantry
        if (this.type === 'hospital') {
            this.updateHospital(game);
        }

        // Production
        if (this.currentBuild) {
            this.buildProgress += game.deltaTime;
            if (this.buildProgress >= this.currentBuild.buildTime) {
                this.finishProduction(game);
            }
        } else if (this.buildQueue.length > 0) {
            this.currentBuild = this.buildQueue.shift();
            this.buildProgress = 0;
        }

        // Reveal fog - radar buildings reveal a much larger area
        const cx = this.tx + Math.floor(this.width / 2);
        const cy = this.ty + Math.floor(this.height / 2);
        const revealRadius = this.radarRadius > 0 ? this.radarRadius : 6;
        game.map.revealArea(cx, cy, revealRadius, this.owner);
    }

    updateRepair(game) {
        if (this.hp >= this.maxHp) {
            this.hp = this.maxHp;
            this.repairing = false;
            if (this.owner === 'player') {
                game.ui.showStatus(`${this.name} fully repaired!`);
                game.audio.speak('Repair complete');
            }
            return;
        }

        // Repair rate: restore HP gradually (about 5 seconds for a full repair)
        const repairRate = this.maxHp / 5000; // HP per ms
        const hpToRestore = repairRate * game.deltaTime;
        const cost = hpToRestore * this.repairCostPerHp;

        // Check if owner can afford it
        if (this.owner === 'player') {
            if (game.credits < cost) {
                this.repairing = false;
                game.ui.showStatus('Not enough credits to repair!');
                game.audio.speak('Insufficient funds', true);
                return;
            }
            game.credits -= cost;
        } else {
            if (game.enemyCredits < cost) {
                this.repairing = false;
                return;
            }
            game.enemyCredits -= cost;
        }

        this.hp = Math.min(this.maxHp, this.hp + hpToRestore);
        if (this.owner === 'player') {
            game.audio.play('repair');
        }
    }

    updateRepairBay(game) {
        const now = Date.now();
        if (now - this.lastHealTick < 500) return;
        this.lastHealTick = now;
        this.activelyHealing = false;

        const cx = this.tx + Math.floor(this.width / 2);
        const cy = this.ty + Math.floor(this.height / 2);
        const infantryTypes = ['light_infantry', 'heavy_trooper'];

        for (const entity of game.entities) {
            if (!entity.isUnit) continue;
            if (entity.owner !== this.owner) continue;
            if (infantryTypes.includes(entity.type)) continue; // only vehicles
            if (entity.hp >= entity.maxHp) continue;
            if (tileDistance(cx, cy, entity.tx, entity.ty) > 2) continue;

            // Check if player can afford the repair cost
            const cost = 2;
            if (this.owner === 'player') {
                if (game.credits < cost) continue;
                game.credits -= cost;
            } else {
                if (game.enemyCredits < cost) continue;
                game.enemyCredits -= cost;
            }

            entity.hp = Math.min(entity.maxHp, entity.hp + 5);
            this.activelyHealing = true;
        }
    }

    updateHospital(game) {
        const now = Date.now();
        if (now - this.lastHealTick < 500) return;
        this.lastHealTick = now;
        this.activelyHealing = false;

        const cx = this.tx + Math.floor(this.width / 2);
        const cy = this.ty + Math.floor(this.height / 2);
        const infantryTypes = ['light_infantry', 'heavy_trooper'];

        for (const entity of game.entities) {
            if (!entity.isUnit) continue;
            if (entity.owner !== this.owner) continue;
            if (!infantryTypes.includes(entity.type)) continue; // only infantry
            if (entity.hp >= entity.maxHp) continue;
            if (tileDistance(cx, cy, entity.tx, entity.ty) > 2) continue;

            entity.hp = Math.min(entity.maxHp, entity.hp + 3);
            this.activelyHealing = true;
        }
    }

    updateTurret(game) {
        const now = Date.now();
        const cx = this.tx + this.width / 2;
        const cy = this.ty + this.height / 2;

        // Check if current target is still valid
        if (this.target) {
            if (this.target.isWorm) {
                // Check if worm is still alive
                if (!game.sandworms.includes(this.target)) {
                    this.target = null;
                }
            } else if (this.target.hp <= 0) {
                this.target = null;
            }
        }

        // Find target - prioritize sandworms (they're the biggest threat)
        if (!this.target) {
            // Check for sandworms first
            for (const worm of game.sandworms) {
                const wormTX = Math.floor(worm.x / TILE_SIZE);
                const wormTY = Math.floor(worm.y / TILE_SIZE);
                if (tileDistance(cx, cy, wormTX, wormTY) <= this.attackRange) {
                    this.target = worm;
                    this.target.isWorm = true;
                    this.target.hp = this.target.hp || 500; // Worms are tough
                    break;
                }
            }

            // Then check enemy units/buildings
            if (!this.target) {
                for (const entity of game.entities) {
                    if (entity.owner === this.owner) continue;
                    if (entity.hp <= 0) continue;
                    // Alliance checks: Atreides turrets don't target Fremen (and vice versa),
                    // Harkonnen turrets don't target Sardaukar (and vice versa)
                    const turretHouse = this.owner === 'player' ? game.playerHouse : (this.owner === 'enemy' ? game.enemyHouse : this.owner);
                    const targetHouse = entity.owner === 'fremen' ? 'fremen' : (entity.owner === 'sardaukar' ? 'sardaukar' : (entity.owner === 'player' ? game.playerHouse : game.enemyHouse));
                    if ((turretHouse === 'atreides' && targetHouse === 'fremen') ||
                        (turretHouse === 'fremen' && targetHouse === 'atreides')) continue;
                    if ((turretHouse === 'harkonnen' && targetHouse === 'sardaukar') ||
                        (turretHouse === 'sardaukar' && targetHouse === 'harkonnen')) continue;
                    const etx = entity.isBuilding ? entity.tx + entity.width / 2 : entity.tx;
                    const ety = entity.isBuilding ? entity.ty + entity.height / 2 : entity.ty;
                    if (tileDistance(cx, cy, etx, ety) <= this.attackRange) {
                        this.target = entity;
                        break;
                    }
                }
            }
        }

        // Attack
        if (this.target && now - this.lastAttackTime >= this.attackSpeed) {
            let etx, ety, targetX, targetY;
            if (this.target.isWorm) {
                targetX = this.target.x;
                targetY = this.target.y;
                etx = Math.floor(targetX / TILE_SIZE);
                ety = Math.floor(targetY / TILE_SIZE);
            } else {
                etx = this.target.isBuilding ? this.target.tx + this.target.width / 2 : this.target.tx;
                ety = this.target.isBuilding ? this.target.ty + this.target.height / 2 : this.target.ty;
            }

            if (tileDistance(cx, cy, etx, ety) <= this.attackRange) {
                this.lastAttackTime = now;
                if (this.target.isWorm) {
                    // Direct damage to worm
                    this.target.hp -= this.attackDamage;
                    game.addExplosion(this.target.x, this.target.y, true);
                    game.audio.play(this.type === 'rocket_turret' ? 'shoot_rocket' : 'shoot_turret');
                    // Kill worm if hp depleted
                    if (this.target.hp <= 0) {
                        const idx = game.sandworms.indexOf(this.target);
                        if (idx >= 0) {
                            game.sandworms.splice(idx, 1);
                            game.ui.showStatus('🎉 Sandworm destroyed!');
                            game.audio.speak('Sandworm eliminated!', true);
                        }
                        this.target = null;
                    }
                } else {
                    game.addProjectile(this.x, this.y, this.target, this.attackDamage, this.owner);
                    game.audio.play(this.type === 'rocket_turret' ? 'shoot_rocket' : 'shoot_turret');
                }
            } else {
                this.target = null;
            }
        }
    }

    finishProduction(game) {
        const unitType = this.currentBuild.type;
        // Find spawn point
        const spawnPoints = [];
        for (let dy = -1; dy <= this.height; dy++) {
            for (let dx = -1; dx <= this.width; dx++) {
                if (dy >= 0 && dy < this.height && dx >= 0 && dx < this.width) continue;
                const sx = this.tx + dx;
                const sy = this.ty + dy;
                if (game.map.isPassable(sx, sy)) {
                    spawnPoints.push({ tx: sx, ty: sy });
                }
            }
        }

        if (spawnPoints.length > 0) {
            const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            const unit = new Unit(sp.tx, sp.ty, this.owner, unitType);
            game.addEntity(unit);

            // Auto-harvest for harvesters
            if (unitType === 'harvester') {
                unit.state = 'harvesting';
            }

            game.audio.play('unitReady');
            if (this.owner === 'player') {
                const def = UNIT_DEFS[unitType];
                game.audio.speak(`${def.name} ready`);
            }
        }

        this.currentBuild = null;
        this.buildProgress = 0;
    }

    queueUnit(unitType) {
        const def = UNIT_DEFS[unitType];
        this.buildQueue.push({ type: unitType, buildTime: def.buildTime });
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        const w = this.width * TILE_SIZE;
        const h = this.height * TILE_SIZE;

        const colors = HOUSE_COLORS[this.owner === 'player' ? game.playerHouse : (game.enemyHouse || 'harkonnen')];

        // Draw isometric building sprite based on type
        switch (this.type) {
            case 'construction_yard':
                SpriteRenderer.drawConstructionYard(ctx, screenX, screenY, w, h, colors);
                break;
            case 'wind_trap':
                SpriteRenderer.drawWindTrap(ctx, screenX, screenY, w, h, colors);
                break;
            case 'refinery':
                SpriteRenderer.drawRefinery(ctx, screenX, screenY, w, h, colors);
                break;
            case 'silo':
                SpriteRenderer.drawSilo(ctx, screenX, screenY, w, h, colors);
                break;
            case 'barracks':
                SpriteRenderer.drawBarracks(ctx, screenX, screenY, w, h, colors);
                break;
            case 'light_factory':
                SpriteRenderer.drawLightFactory(ctx, screenX, screenY, w, h, colors);
                break;
            case 'heavy_factory':
                SpriteRenderer.drawHeavyFactory(ctx, screenX, screenY, w, h, colors);
                break;
            case 'turret':
                SpriteRenderer.drawTurret(ctx, screenX, screenY, w, h, colors, this.target);
                break;
            case 'rocket_turret':
                SpriteRenderer.drawRocketTurret(ctx, screenX, screenY, w, h, colors, this.target);
                break;
            case 'radar':
                SpriteRenderer.drawRadar(ctx, screenX, screenY, w, h, colors);
                break;
            case 'wall':
                SpriteRenderer.drawWall(ctx, screenX, screenY, w, h, colors);
                break;
            case 'repair_bay':
                SpriteRenderer.drawRepairBay(ctx, screenX, screenY, w, h, colors);
                break;
            case 'hospital':
                SpriteRenderer.drawHospital(ctx, screenX, screenY, w, h, colors);
                break;
            default:
                // Fallback
                ctx.fillStyle = colors.primary;
                ctx.fillRect(screenX - w / 2, screenY - h / 2, w, h);
                ctx.strokeStyle = colors.secondary;
                ctx.lineWidth = 2;
                ctx.strokeRect(screenX - w / 2, screenY - h / 2, w, h);
                break;
        }

        // Construction progress overlay
        if (this.isConstructing) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * (1 - this.constructionProgress)})`;
            ctx.fillRect(screenX - w / 2, screenY - h / 2, w, h);
        }

        // Selection outline
        if (this.selected) {
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX - w / 2 - 2, screenY - h / 2 - 2, w + 4, h + 4);
        }

        // Health bar
        this.renderHealthBar(ctx, screenX, screenY, w);

        // Build progress
        if (this.currentBuild) {
            const pct = this.buildProgress / this.currentBuild.buildTime;
            ctx.fillStyle = '#333';
            ctx.fillRect(screenX - w / 2, screenY + h / 2 + 2, w, 4);
            ctx.fillStyle = '#aa8800';
            ctx.fillRect(screenX - w / 2, screenY + h / 2 + 2, w * pct, 4);
        }

        // Repair progress bar
        if (this.repairing) {
            const repairPct = this.hp / this.maxHp;
            const barY = screenY + h / 2 + 8;
            const barW = w;
            const barH = 5;
            ctx.fillStyle = '#222';
            ctx.fillRect(screenX - barW / 2, barY, barW, barH);
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(screenX - barW / 2, barY, barW, barH);
            const pulse = Math.sin(Date.now() / 300) * 20;
            ctx.fillStyle = `rgb(${40 + pulse}, ${180 + pulse}, ${40 + pulse})`;
            ctx.fillRect(screenX - barW / 2 + 0.5, barY + 0.5, (barW - 1) * repairPct, barH - 1);
            ctx.font = '9px monospace';
            ctx.fillStyle = '#0f0';
            ctx.textAlign = 'center';
            ctx.fillText(`REPAIRING ${Math.floor(repairPct * 100)}%`, screenX, barY + barH + 10);
        }

        // Healing indicator for repair bay and hospital
        if (this.activelyHealing && (this.type === 'repair_bay' || this.type === 'hospital')) {
            const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
            const healColor = this.type === 'repair_bay' ? `rgba(255, 200, 0, ${pulse * 0.4})` : `rgba(0, 255, 100, ${pulse * 0.4})`;
            ctx.fillStyle = healColor;
            ctx.beginPath();
            ctx.arc(screenX, screenY, w * 0.6, 0, Math.PI * 2);
            ctx.fill();

            // Draw + symbol
            const symbolColor = this.type === 'repair_bay' ? '#ffcc00' : '#00ff66';
            ctx.fillStyle = symbolColor;
            ctx.globalAlpha = pulse;
            ctx.fillRect(screenX - 6, screenY - 2, 12, 4);
            ctx.fillRect(screenX - 2, screenY - 6, 4, 12);
            ctx.globalAlpha = 1;

            // Label
            ctx.font = '9px monospace';
            ctx.fillStyle = symbolColor;
            ctx.textAlign = 'center';
            const label = this.type === 'repair_bay' ? 'REPAIRING' : 'HEALING';
            ctx.fillText(label, screenX, screenY + h / 2 + 14);
        }

        // Turret range indicator when selected
        if (this.selected && this.attackRange > 0) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.attackRange * TILE_SIZE, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Radar range indicator when selected
        if (this.selected && this.radarRadius > 0) {
            ctx.strokeStyle = 'rgba(0, 200, 255, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.radarRadius * TILE_SIZE, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(0, 200, 255, 0.03)';
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.radarRadius * TILE_SIZE, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
