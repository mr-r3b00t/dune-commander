// Unit class
class Unit extends Entity {
    constructor(tx, ty, owner, type) {
        super(tx, ty, owner, type);
        const def = UNIT_DEFS[type];
        this.isUnit = true;
        this.name = def.name;
        this.width = 1;
        this.height = 1;
        this.maxHp = def.hp;
        this.hp = def.hp;
        this.speed = def.speed;
        this.icon = def.icon;
        this.attackRange = def.attackRange;
        this.attackDamage = def.attackDamage;
        this.attackSpeed = def.attackSpeed;

        // Movement
        this.path = null;
        this.pathIndex = 0;
        this.moveProgress = 0;
        this.targetTX = tx;
        this.targetTY = ty;
        this.moving = false;
        this.direction = Math.PI; // radians, 0 = north (up), PI = south (down), clockwise positive
        this.targetDirection = Math.PI;
        this.turretDirection = Math.PI; // independent turret facing (for tanks)
        this.turretTargetDir = Math.PI;
        // Turn speed varies by unit type (infantry fast, heavy tanks slow)
        const isInfantry = (type === 'light_infantry' || type === 'heavy_trooper');
        const isHeavy = (type === 'siege_tank' || type === 'harvester' || type === 'mcv');
        this.turnSpeed = isInfantry ? 10 : isHeavy ? 4 : 6; // radians per second (body)
        this.turretTurnSpeed = 8; // turret rotates faster than body
        this.hasTurret = (type === 'tank' || type === 'combat_tank' || type === 'siege_tank' || type === 'rocket_tank' || type === 'missile_tank');

        // Combat
        this.target = null;
        this.state = 'idle'; // idle, moving, attacking, harvesting, returning

        // Harvester specific
        this.spiceCarried = 0;
        this.spiceAtDock = 0; // how much we had when we started unloading
        this.capacity = def.capacity || 0;
        this.harvestTimer = 0;
        this.unloadTimer = 0;

        // Set initial occupied
        this.prevTX = tx;
        this.prevTY = ty;
    }

    update(game) {
        // Reveal fog (Fremen reveal for player if player is Atreides, Sardaukar reveal for player if player is Harkonnen)
        const fogOwner = (this.owner === 'fremen' && game.playerHouse === 'atreides') ? 'player'
            : (this.owner === 'sardaukar' && game.playerHouse === 'harkonnen') ? 'player'
            : this.owner;
        game.map.revealArea(this.tx, this.ty, 4, fogOwner);

        // Always process movement if we have a path
        if (this.path && this.pathIndex < this.path.length) {
            this.processMovement(game);
        }

        // Update turret tracking (independent of body)
        this._updateTurretTracking(game);

        switch (this.state) {
            case 'idle':
                this.updateIdle(game);
                break;
            case 'moving':
                // Check if path is done
                if (!this.path || this.pathIndex >= this.path.length) {
                    this.state = 'idle';
                    this.moving = false;
                }
                break;
            case 'attacking':
                this.updateAttack(game);
                this._faceTarget(game); // non-turret units face their target
                break;
            case 'harvesting':
                this.updateHarvesting(game);
                break;
            case 'returning':
                this.updateReturning(game);
                break;
            case 'unloading':
                this.updateUnloading(game);
                break;
        }
    }

    updateIdle(game) {
        // Auto-attack nearby enemies
        if (this.attackRange > 0) {
            const enemy = this.findNearestEnemy(game);
            if (enemy && tileDistance(this.tx, this.ty, enemy.tx, enemy.ty) <= this.attackRange + 2) {
                this.target = enemy;
                this.state = 'attacking';
            }
        }

        // Fremen/Sardaukar patrol: when idle with no enemies, pick a random waypoint
        if ((this.owner === 'fremen' || this.owner === 'sardaukar') && !this.target) {
            if (!this._fremenPatrolCooldown || Date.now() > this._fremenPatrolCooldown) {
                // Pick a random passable tile on the map
                for (let attempt = 0; attempt < 20; attempt++) {
                    const rx = randomInt(2, MAP_WIDTH - 2);
                    const ry = randomInt(2, MAP_HEIGHT - 2);
                    if (game.map.tiles[ry][rx] !== TERRAIN.MOUNTAIN && !game.map.occupied[ry][rx]) {
                        this.moveTo(rx, ry, game);
                        break;
                    }
                }
                // Don't try again for a few seconds even if moveTo failed
                this._fremenPatrolCooldown = Date.now() + 3000 + Math.random() * 4000;
            }
        }

        // Harvesters auto-harvest
        if (this.type === 'harvester' && this.spiceCarried < this.capacity) {
            this.state = 'harvesting';
        }
    }

    startPath(tx, ty, game) {
        // First try a path that respects occupied tiles
        let path = game.pathfinder.findPath(this.tx, this.ty, tx, ty, false);
        // Fall back to ignoring occupied if no path (e.g. destination is a building tile)
        if (!path || path.length <= 1) {
            path = game.pathfinder.findPath(this.tx, this.ty, tx, ty, true);
        }
        if (path && path.length > 1) {
            this.path = path;
            this.pathIndex = 1;
            this.moveProgress = 0;
            this.moving = true;
            this.finalDestX = tx;
            this.finalDestY = ty;
            this.repathRetryCount = 0;
            return true;
        }
        return false;
    }

    moveTo(tx, ty, game) {
        if (this.startPath(tx, ty, game)) {
            this.state = 'moving';
            this.target = null;
        }
    }

    attackTarget(target, game) {
        this.target = target;
        this.state = 'attacking';
    }

    processMovement(game) {
        if (!this.path || this.pathIndex >= this.path.length) {
            this.path = null;
            this.moving = false;
            return;
        }

        const next = this.path[this.pathIndex];
        this.moving = true;

        // Check if next tile is blocked by another unit or building
        const occupant = game.map.occupied[next.y] && game.map.occupied[next.y][next.x];
        if (occupant && occupant !== this.id) {
            // Is it a unit or a building blocking us?
            const blocker = game.entities.find(e => e.id === occupant);
            const isBlockerMoving = blocker && blocker.isUnit && blocker.moving;

            // If blocker is a moving unit, wait briefly then repath
            if (isBlockerMoving && (!this._waitStart || Date.now() - this._waitStart < 500)) {
                if (!this._waitStart) this._waitStart = Date.now();
                return; // Wait for them to move
            }
            this._waitStart = null;

            // Repath around the obstacle (max 3 retries to avoid infinite loops)
            this.repathRetryCount = (this.repathRetryCount || 0) + 1;
            if (this.repathRetryCount > 3) {
                // Give up, stop moving
                this.path = null;
                this.moving = false;
                this.repathRetryCount = 0;
                return;
            }

            const destX = this.finalDestX !== undefined ? this.finalDestX : this.path[this.path.length - 1].x;
            const destY = this.finalDestY !== undefined ? this.finalDestY : this.path[this.path.length - 1].y;

            // Try path respecting occupied tiles first
            let newPath = game.pathfinder.findPath(this.tx, this.ty, destX, destY, false);
            if (!newPath || newPath.length <= 1) {
                // Try ignoring occupied as fallback
                newPath = game.pathfinder.findPath(this.tx, this.ty, destX, destY, true);
            }

            if (newPath && newPath.length > 1) {
                this.path = newPath;
                this.pathIndex = 1;
                this.moveProgress = 0;
            } else {
                // Try to find nearest passable tile to destination
                const nearest = game.pathfinder.findNearestPassable(destX, destY, this.tx, this.ty);
                if (nearest) {
                    newPath = game.pathfinder.findPath(this.tx, this.ty, nearest.x, nearest.y, false);
                    if (newPath && newPath.length > 1) {
                        this.path = newPath;
                        this.pathIndex = 1;
                        this.moveProgress = 0;
                    } else {
                        this.path = null;
                        this.moving = false;
                    }
                } else {
                    this.path = null;
                    this.moving = false;
                }
            }
            return;
        }

        // Reset repath counter on successful step
        this.repathRetryCount = 0;
        this._waitStart = null;

        // Calculate target direction (continuous radians)
        // atan2(dy, dx) gives angle from positive X axis. We want 0 = north (up), clockwise positive.
        const dx = next.x - this.tx;
        const dy = next.y - this.ty;
        if (dx !== 0 || dy !== 0) {
            // Look-ahead: if we're close to arriving and there's a next waypoint, blend toward it
            let lookAheadDir = Math.atan2(dy, dx) + Math.PI / 2;
            if (this.moveProgress > 0.6 && this.pathIndex + 1 < this.path.length) {
                const nextNext = this.path[this.pathIndex + 1];
                const dx2 = nextNext.x - next.x;
                const dy2 = nextNext.y - next.y;
                if (dx2 !== 0 || dy2 !== 0) {
                    const futureDir = Math.atan2(dy2, dx2) + Math.PI / 2;
                    // Blend: as moveProgress goes from 0.6 to 1.0, blend from current to future dir
                    const blendT = (this.moveProgress - 0.6) / 0.4;
                    let diff = futureDir - lookAheadDir;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    lookAheadDir = lookAheadDir + diff * blendT * 0.5;
                }
            }
            this.targetDirection = lookAheadDir;
        }

        // Smooth turning - interpolate toward target direction
        this._smoothTurnBody(game.deltaTime);

        // Move towards next tile
        const moveAmount = this.speed * (game.deltaTime / 1000) * 1.8;
        this.moveProgress += moveAmount;

        if (this.moveProgress >= 1) {
            // Clear old position
            if (game.map.occupied[this.ty][this.tx] === this.id) {
                game.map.occupied[this.ty][this.tx] = null;
            }

            // Arrive at next tile
            this.tx = next.x;
            this.ty = next.y;
            this.x = this.tx * TILE_SIZE + TILE_SIZE / 2;
            this.y = this.ty * TILE_SIZE + TILE_SIZE / 2;
            game.map.occupied[this.ty][this.tx] = this.id;
            this.prevTX = this.tx;
            this.prevTY = this.ty;

            this.moveProgress = 0;
            this.pathIndex++;

            // Check if path is complete
            if (this.pathIndex >= this.path.length) {
                this.path = null;
                this.moving = false;
            }
        } else {
            // Interpolate position
            const fromX = this.tx * TILE_SIZE + TILE_SIZE / 2;
            const fromY = this.ty * TILE_SIZE + TILE_SIZE / 2;
            const toX = next.x * TILE_SIZE + TILE_SIZE / 2;
            const toY = next.y * TILE_SIZE + TILE_SIZE / 2;
            this.x = lerp(fromX, toX, this.moveProgress);
            this.y = lerp(fromY, toY, this.moveProgress);
        }
    }

    updateAttack(game) {
        if (!this.target || this.target.hp <= 0) {
            this.target = null;
            this.state = 'idle';
            return;
        }

        const etx = this.target.isBuilding ? this.target.tx + Math.floor(this.target.width / 2) : this.target.tx;
        const ety = this.target.isBuilding ? this.target.ty + Math.floor(this.target.height / 2) : this.target.ty;
        const dist = tileDistance(this.tx, this.ty, etx, ety);

        if (dist > this.attackRange) {
            // Move closer - keep attacking state, movement is handled by processMovement
            if (!this.moving) {
                const savedTarget = this.target;
                this.startPath(etx, ety, game);
                this.target = savedTarget; // startPath doesn't clear target, but be safe
            }
        } else {
            // In range - stop moving and attack
            this.path = null;
            this.moving = false;
            const now = Date.now();
            if (now - this.lastAttackTime >= this.attackSpeed) {
                this.lastAttackTime = now;
                game.addProjectile(this.x, this.y, this.target, this.attackDamage, this.owner);
                // Weapon-specific firing sound
                game.audio.play(this._getWeaponSound());
            }
        }
    }

    updateHarvesting(game) {
        if (this.type !== 'harvester') {
            this.state = 'idle';
            return;
        }

        if (this.spiceCarried >= this.capacity) {
            this.path = null;
            this.moving = false;
            this.state = 'returning';
            if (this.owner === 'player') {
                game.audio.speak('Harvester full, returning to base');
            }
            return;
        }

        // Check current tile and adjacent tiles for spice
        const terrain = game.map.tiles[this.ty][this.tx];
        const onSpice = terrain === TERRAIN.SPICE || terrain === TERRAIN.THICK_SPICE;

        if (onSpice) {
            // Harvest current tile
            this.harvestTimer += game.deltaTime;
            if (this.harvestTimer >= 250) { // harvest every 250ms
                this.harvestTimer = 0;
                const harvested = game.map.harvestSpice(this.tx, this.ty, 50);
                this.spiceCarried += harvested;
                if (harvested === 0) {
                    // Tile depleted, look for adjacent spice
                    this._findNextSpice(game);
                }
            }
            this.moving = false;
            this.path = null;
        } else if (!this.moving) {
            // Not on spice and not already walking - find some
            this._findNextSpice(game);
        }
        // If moving, processMovement() handles it - we stay in 'harvesting' state
    }

    _findNextSpice(game) {
        // Check adjacent tiles first for quick harvest continuation
        for (const dir of DIRECTIONS) {
            const nx = this.tx + dir.x;
            const ny = this.ty + dir.y;
            if (isInBounds(nx, ny) && game.map.spiceAmount[ny][nx] > 0) {
                this.startPath(nx, ny, game);
                return;
            }
        }
        // No adjacent spice, find nearest field
        const spice = game.map.findNearestSpice(this.tx, this.ty);
        if (spice) {
            this.startPath(spice.tx, spice.ty, game);
        } else {
            this.state = 'idle';
        }
    }

    updateReturning(game) {
        // Find nearest refinery (drop-off point)
        const refinery = this.findNearestRefinery(game);
        if (!refinery) {
            this.state = 'idle';
            return;
        }

        const dropX = refinery.tx + 1;
        const dropY = refinery.ty + 1;
        const dist = tileDistance(this.tx, this.ty, dropX, dropY);

        if (dist <= 2) {
            // Arrived at refinery - start unloading
            this.path = null;
            this.moving = false;
            this.spiceAtDock = this.spiceCarried;
            this.unloadTimer = 0;
            this.state = 'unloading';
        } else if (!this.moving) {
            // Not at refinery and not already moving - head there
            this.startPath(dropX, dropY, game);
            // Stay in 'returning' state
        }
        // If moving, processMovement() handles it
    }

    updateUnloading(game) {
        if (this.type !== 'harvester') {
            this.state = 'idle';
            return;
        }

        // Gradually unload spice over ~3 seconds
        const unloadDuration = 3000;
        const unloadRate = this.spiceAtDock / unloadDuration; // spice per ms
        this.unloadTimer += game.deltaTime;

        const spiceToRemove = unloadRate * game.deltaTime;
        const creditsToAdd = Math.floor(spiceToRemove * 1.5);

        if (this.spiceCarried > 0) {
            this.spiceCarried = Math.max(0, this.spiceCarried - spiceToRemove);
            if (this.owner === 'player') {
                game.credits += creditsToAdd;
                game.spiceStored += spiceToRemove;
            } else {
                game.enemyCredits += creditsToAdd;
            }
        }

        // Done unloading
        if (this.spiceCarried <= 0 || this.unloadTimer >= unloadDuration) {
            // Deposit any remainder
            if (this.spiceCarried > 0) {
                const remaining = Math.floor(this.spiceCarried * 1.5);
                if (this.owner === 'player') {
                    game.credits += remaining;
                    game.spiceStored += this.spiceCarried;
                } else {
                    game.enemyCredits += remaining;
                }
            }
            this.spiceCarried = 0;
            this.spiceAtDock = 0;
            this.state = 'harvesting';
            game.audio.play('cash');
            if (this.owner === 'player') {
                game.audio.speak('Spice delivered');
            }
        }
    }

    findNearestRefinery(game) {
        let best = null;
        let bestDist = Infinity;
        for (const e of game.entities) {
            if (e.type === 'refinery' && e.owner === this.owner) {
                const d = tileDistance(this.tx, this.ty, e.tx, e.ty);
                if (d < bestDist) {
                    bestDist = d;
                    best = e;
                }
            }
        }
        return best;
    }

    findNearestEnemy(game) {
        let best = null;
        let bestDist = Infinity;
        for (const e of game.entities) {
            if (e.owner !== this.owner && e.owner !== null && e.hp > 0) {
                // Fremen alliance: Fremen and Atreides (player if atreides, or enemy if atreides) don't target each other
                if (this._areAllied(this.owner, e.owner, game)) continue;
                const etx = e.isBuilding ? e.tx + Math.floor(e.width / 2) : e.tx;
                const ety = e.isBuilding ? e.ty + Math.floor(e.height / 2) : e.ty;
                const d = tileDistance(this.tx, this.ty, etx, ety);
                if (d < bestDist && d <= this.attackRange + 5) {
                    bestDist = d;
                    best = e;
                }
            }
        }
        return best;
    }

    _areAllied(owner1, owner2, game) {
        // Fremen are allied with Atreides, Sardaukar are allied with Harkonnen
        const getHouse = (owner) => {
            if (owner === 'fremen') return 'fremen';
            if (owner === 'sardaukar') return 'sardaukar';
            if (owner === 'player') return game.playerHouse;
            if (owner === 'enemy') return game.enemyHouse;
            return owner;
        };
        const house1 = getHouse(owner1);
        const house2 = getHouse(owner2);
        // Fremen + Atreides = allied
        if ((house1 === 'fremen' && house2 === 'atreides') ||
            (house1 === 'atreides' && house2 === 'fremen')) {
            return true;
        }
        // Sardaukar + Harkonnen = allied
        if ((house1 === 'sardaukar' && house2 === 'harkonnen') ||
            (house1 === 'harkonnen' && house2 === 'sardaukar')) {
            return true;
        }
        return false;
    }

    _smoothTurnBody(deltaTime) {
        let angleDiff = this.targetDirection - this.direction;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxTurn = this.turnSpeed * (deltaTime / 1000);
        if (Math.abs(angleDiff) <= maxTurn) {
            this.direction = this.targetDirection;
        } else {
            this.direction += Math.sign(angleDiff) * maxTurn;
        }
        while (this.direction > Math.PI) this.direction -= Math.PI * 2;
        while (this.direction < -Math.PI) this.direction += Math.PI * 2;
    }

    _smoothTurnTurret(deltaTime) {
        let angleDiff = this.turretTargetDir - this.turretDirection;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxTurn = this.turretTurnSpeed * (deltaTime / 1000);
        if (Math.abs(angleDiff) <= maxTurn) {
            this.turretDirection = this.turretTargetDir;
        } else {
            this.turretDirection += Math.sign(angleDiff) * maxTurn;
        }
        while (this.turretDirection > Math.PI) this.turretDirection -= Math.PI * 2;
        while (this.turretDirection < -Math.PI) this.turretDirection += Math.PI * 2;
    }

    _updateTurretTracking(game) {
        if (!this.hasTurret) return;

        if (this.target && this.target.hp > 0) {
            // Track the attack target
            const etx = this.target.isBuilding ? this.target.tx + Math.floor(this.target.width / 2) : this.target.tx;
            const ety = this.target.isBuilding ? this.target.ty + Math.floor(this.target.height / 2) : this.target.ty;
            const tdx = etx * TILE_SIZE + TILE_SIZE / 2 - this.x;
            const tdy = ety * TILE_SIZE + TILE_SIZE / 2 - this.y;
            if (tdx !== 0 || tdy !== 0) {
                this.turretTargetDir = Math.atan2(tdy, tdx) + Math.PI / 2;
            }
        } else {
            // No target: turret follows body direction
            this.turretTargetDir = this.direction;
        }
        this._smoothTurnTurret(game.deltaTime);
    }

    _faceTarget(game) {
        // Non-turret units: face the attack target when in range and not moving
        if (this.hasTurret) return; // turret units handle this differently
        if (!this.target || this.target.hp <= 0) return;
        if (this.moving) return;

        const etx = this.target.isBuilding ? this.target.tx + Math.floor(this.target.width / 2) : this.target.tx;
        const ety = this.target.isBuilding ? this.target.ty + Math.floor(this.target.height / 2) : this.target.ty;
        const tdx = etx - this.tx;
        const tdy = ety - this.ty;
        if (tdx !== 0 || tdy !== 0) {
            this.targetDirection = Math.atan2(tdy, tdx) + Math.PI / 2;
        }
        this._smoothTurnBody(game.deltaTime);
    }

    _getWeaponSound() {
        switch (this.type) {
            case 'light_infantry': return 'shoot_rifle';
            case 'heavy_trooper': return 'shoot_rocket';
            case 'trike': return 'shoot_machinegun';
            case 'quad': return 'shoot_machinegun';
            case 'tank':
            case 'combat_tank': return 'shoot_cannon';
            case 'siege_tank': return 'shoot_siege';
            case 'rocket_tank':
            case 'missile_tank': return 'shoot_rocket';
            default: return 'shoot';
        }
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        const colors = this.owner === 'fremen'
            ? HOUSE_COLORS.fremen
            : this.owner === 'sardaukar'
            ? HOUSE_COLORS.sardaukar
            : HOUSE_COLORS[this.owner === 'player' ? game.playerHouse : (game.enemyHouse || 'harkonnen')];
        const size = TILE_SIZE - 4;

        // Draw isometric sprite based on unit type
        switch (this.type) {
            case 'light_infantry':
                SpriteRenderer.drawInfantry(ctx, screenX, screenY, this.direction, colors, 'light_infantry');
                break;
            case 'heavy_trooper':
                SpriteRenderer.drawInfantry(ctx, screenX, screenY, this.direction, colors, 'heavy_trooper');
                break;
            case 'trike':
                SpriteRenderer.drawTrike(ctx, screenX, screenY, this.direction, colors);
                break;
            case 'quad':
                SpriteRenderer.drawQuad(ctx, screenX, screenY, this.direction, colors);
                break;
            case 'tank':
            case 'combat_tank':
                SpriteRenderer.drawCombatTank(ctx, screenX, screenY, this.direction, colors, this.turretDirection);
                break;
            case 'siege_tank':
                SpriteRenderer.drawSiegeTank(ctx, screenX, screenY, this.direction, colors, this.turretDirection);
                break;
            case 'rocket_tank':
            case 'missile_tank':
                SpriteRenderer.drawMissileTank(ctx, screenX, screenY, this.direction, colors, this.turretDirection);
                break;
            case 'harvester':
                const spicePct = this.capacity > 0 ? this.spiceCarried / this.capacity : 0;
                SpriteRenderer.drawHarvester(ctx, screenX, screenY, this.direction, colors, spicePct);
                break;
            case 'mcv':
                SpriteRenderer.drawMCV(ctx, screenX, screenY, this.direction, colors);
                break;
            default:
                // Fallback for any unknown unit types
                ctx.fillStyle = colors.primary;
                ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
                break;
        }

        // Selection circle
        if (this.selected) {
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, size / 2 + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Health bar
        this.renderHealthBar(ctx, screenX, screenY, TILE_SIZE);

        // Spice carried indicator for harvesters (always visible)
        if (this.type === 'harvester') {
            const pct = this.spiceCarried / this.capacity;
            const barY = screenY + TILE_SIZE / 2 + 3;
            const barW = TILE_SIZE + 4;
            const barH = 4;
            // Background
            ctx.fillStyle = '#222';
            ctx.fillRect(screenX - barW / 2, barY, barW, barH);
            // Border
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(screenX - barW / 2, barY, barW, barH);
            // Fill
            if (pct > 0) {
                const color = this.state === 'unloading'
                    ? `rgb(${224 - Math.floor(Math.sin(Date.now() / 200) * 30)}, 128, 48)`
                    : '#e08030';
                ctx.fillStyle = color;
                ctx.fillRect(screenX - barW / 2 + 0.5, barY + 0.5, (barW - 1) * pct, barH - 1);
            }
            // State label
            if (this.state === 'unloading') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#ff0';
                ctx.textAlign = 'center';
                ctx.fillText('UNLOADING', screenX, barY + barH + 9);
            } else if (this.state === 'harvesting' && this.moving) {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#aaa';
                ctx.textAlign = 'center';
                ctx.fillText('HARVESTING', screenX, barY + barH + 9);
            } else if (this.state === 'returning') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#8cf';
                ctx.textAlign = 'center';
                ctx.fillText('RETURNING', screenX, barY + barH + 9);
            }
        }
    }
}
