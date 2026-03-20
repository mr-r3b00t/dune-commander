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
        const isInfantry = (type === 'light_infantry' || type === 'heavy_trooper' || type === 'rocket_infantry' || type === 'commando');
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

        // Aircraft specific (ornithopter)
        this.isAircraft = def.isAircraft || false;
        if (this.isAircraft) {
            this.gunAmmo = def.gunAmmo || 0;
            this.maxGunAmmo = def.gunAmmo || 0;
            this.missileAmmo = def.missileAmmo || 0;
            this.maxMissileAmmo = def.missileAmmo || 0;
            this.missileDamage = def.missileDamage || 0;
            this.homeHelipad = null; // assigned helipad
            this.flyHeight = 0; // visual offset for flying
            this.rearming = false;
            this.rearmTimer = 0;
            this.useMissile = false; // alternate between gun and missile
        }

        // Set initial occupied
        this.prevTX = tx;
        this.prevTY = ty;
    }

    update(game) {
        // Reveal fog (Fremen reveal for player if player is Atreides, Sardaukar reveal for player if player is Harkonnen)
        const fogOwner = (this.owner === 'fremen' && game.playerHouse === 'atreides') ? 'player'
            : (this.owner === 'sardaukar' && game.playerHouse === 'harkonnen') ? 'player'
            : this.owner;
        game.map.revealArea(this.tx, this.ty, this.isAircraft ? 6 : 4, fogOwner);

        // Aircraft use direct flight, not pathfinding
        if (this.isAircraft) {
            this._updateAircraft(game);
            return;
        }

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
            case 'moving_to_repair':
                // Moving toward repair bay — check if arrived
                if (!this.path || this.pathIndex >= this.path.length) {
                    this.moving = false;
                    if (this.repairBayTarget && this.repairBayTarget.hp > 0) {
                        this.state = 'waiting_for_repair';
                        if (this.owner === 'player') {
                            game.audio.speak('Awaiting repairs');
                        }
                    } else {
                        this.state = 'idle';
                    }
                }
                break;
            case 'waiting_for_repair':
                // Stay put until fully repaired by the repair bay
                this.path = null;
                this.moving = false;
                if (this.hp >= this.maxHp) {
                    this.repairBayTarget = null;
                    this.state = 'idle';
                    if (this.owner === 'player') {
                        game.audio.speak('Repairs complete');
                        game.ui.showStatus('Vehicle repaired — resuming duties');
                    }
                }
                break;
            case 'moving_to_heal':
                // Moving toward hospital — check if arrived
                if (!this.path || this.pathIndex >= this.path.length) {
                    this.moving = false;
                    if (this.healTarget && this.healTarget.hp > 0) {
                        this.state = 'waiting_for_heal';
                        if (this.owner === 'player') {
                            game.audio.speak('Awaiting medical attention');
                        }
                    } else {
                        this.state = 'idle';
                    }
                }
                break;
            case 'waiting_for_heal':
                // Stay put until fully healed by the hospital
                this.path = null;
                this.moving = false;
                if (this.hp >= this.maxHp) {
                    this.healTarget = null;
                    this.state = 'idle';
                    if (this.owner === 'player') {
                        game.audio.speak('Fully healed');
                        game.ui.showStatus(`${this.name} healed — ready for action`);
                    }
                }
                break;
            case 'moving_to_c4':
                // Moving toward enemy building to plant C4
                if (this.c4Target && this.c4Target.hp <= 0) {
                    // Target already destroyed
                    this.c4Target = null;
                    this.state = 'idle';
                    this.path = null;
                    this.moving = false;
                    break;
                }
                if (!this.path || this.pathIndex >= this.path.length) {
                    this.moving = false;
                    // Check if close enough to the building (adjacent)
                    if (this.c4Target && this.c4Target.hp > 0) {
                        const bldg = this.c4Target;
                        const distX = Math.max(0, bldg.tx - this.tx, this.tx - (bldg.tx + bldg.width - 1));
                        const distY = Math.max(0, bldg.ty - this.ty, this.ty - (bldg.ty + bldg.height - 1));
                        if (distX <= 1 && distY <= 1) {
                            // Close enough — start planting
                            this.state = 'planting_c4';
                            this.c4PlantStart = Date.now();
                            this.c4PlantDuration = 2000; // 2 seconds to plant
                            game.audio.play('c4_plant');
                            if (this.owner === 'player') {
                                game.audio.speak('Planting C4');
                            }
                        } else {
                            // Try to get closer
                            const bx = bldg.tx + Math.floor(bldg.width / 2);
                            const by = bldg.ty + Math.floor(bldg.height / 2);
                            if (!this.startPath(bx, by, game)) {
                                this.state = 'idle';
                                this.c4Target = null;
                            }
                        }
                    } else {
                        this.state = 'idle';
                        this.c4Target = null;
                    }
                }
                break;
            case 'planting_c4':
                // Commando is planting C4 — stand still and wait
                this.path = null;
                this.moving = false;
                if (this.c4Target && this.c4Target.hp <= 0) {
                    this.c4Target = null;
                    this.state = 'idle';
                    break;
                }
                if (Date.now() - this.c4PlantStart >= this.c4PlantDuration) {
                    // C4 planted — register it and flee
                    game.plantC4(this.c4Target, this);
                    if (this.owner === 'player') {
                        game.audio.speak('C4 planted — get clear!');
                        game.ui.showStatus('C4 planted! 5 seconds to detonation!');
                    }
                    // Flee away from the building
                    const bldg = this.c4Target;
                    const dx = this.tx - (bldg.tx + bldg.width / 2);
                    const dy = this.ty - (bldg.ty + bldg.height / 2);
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const fleeX = Math.round(this.tx + (dx / len) * 6);
                    const fleeY = Math.round(this.ty + (dy / len) * 6);
                    // Clamp to map bounds
                    const fx = Math.max(1, Math.min(MAP_WIDTH - 2, fleeX));
                    const fy = Math.max(1, Math.min(MAP_HEIGHT - 2, fleeY));
                    this.c4Target = null;
                    this.state = 'fleeing_c4';
                    this.startPath(fx, fy, game);
                }
                break;
            case 'fleeing_c4':
                // Running away from planted C4
                if (!this.path || this.pathIndex >= this.path.length) {
                    this.moving = false;
                    this.state = 'idle';
                }
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
        if (this.isAircraft) {
            this._flyTarget = { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
            this.state = 'moving';
            this.target = null;
            return;
        }
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
                game.addProjectile(this.x, this.y, this.target, this.attackDamage, this.owner, this.type);
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

    _updateAircraft(game) {
        // Bobbing flight height — descend when rearming or approaching helipad, ascend when flying
        let targetHeight = 8 + Math.sin(Date.now() / 400) * 2;
        if (this.state === 'rearming') {
            targetHeight = 0;
        } else if (this.state === 'returning_to_helipad' && this.homeHelipad && this.homeHelipad.hp > 0) {
            const hDist = Math.sqrt((this.x - this.homeHelipad.x) ** 2 + (this.y - this.homeHelipad.y) ** 2);
            if (hDist < TILE_SIZE * 3) {
                // Descend as we approach
                targetHeight = Math.max(0, (hDist / (TILE_SIZE * 3)) * 8);
            }
        }
        const heightSpeed = 12 * (game.deltaTime / 1000);
        if (this.flyHeight < targetHeight) {
            this.flyHeight = Math.min(targetHeight, this.flyHeight + heightSpeed);
        } else if (this.flyHeight > targetHeight) {
            this.flyHeight = Math.max(targetHeight, this.flyHeight - heightSpeed);
        }

        // Aircraft don't occupy ground tiles
        if (game.map.occupied[this.ty] && game.map.occupied[this.ty][this.tx] === this.id) {
            game.map.occupied[this.ty][this.tx] = null;
        }

        switch (this.state) {
            case 'idle':
                // If out of ammo, return to rearm
                if (this.gunAmmo <= 0 && this.missileAmmo <= 0) {
                    this._returnToHelipad(game);
                    break;
                }
                // Auto-attack nearby enemies
                if (this.attackRange > 0) {
                    const enemy = this.findNearestEnemy(game);
                    if (enemy && tileDistance(this.tx, this.ty, enemy.tx, enemy.ty) <= this.attackRange + 3) {
                        this.target = enemy;
                        this.state = 'attacking';
                    }
                }
                // Circle near home helipad when idle
                if (!this.target && this.homeHelipad && this.homeHelipad.hp > 0) {
                    const hx = this.homeHelipad.x;
                    const hy = this.homeHelipad.y;
                    const dist = Math.sqrt((this.x - hx) ** 2 + (this.y - hy) ** 2);
                    if (dist > TILE_SIZE * 4) {
                        this._flyToward(hx, hy, game);
                    } else {
                        // Orbit
                        this.direction += 1.5 * (game.deltaTime / 1000);
                        const orbitR = TILE_SIZE * 2.5;
                        const ox = hx + Math.cos(Date.now() / 2000) * orbitR;
                        const oy = hy + Math.sin(Date.now() / 2000) * orbitR;
                        this._flyToward(ox, oy, game);
                    }
                }
                break;

            case 'attacking':
                if (!this.target || this.target.hp <= 0) {
                    this.target = null;
                    // Return to patrol if we were patrolling before
                    if (this._returnToPatrolAfterAttack && this._patrolCenter) {
                        this._returnToPatrolAfterAttack = false;
                        this.state = 'patrolling';
                    } else {
                        this.state = 'idle';
                    }
                    break;
                }
                // Out of all ammo — must return
                if (this.gunAmmo <= 0 && this.missileAmmo <= 0) {
                    this.target = null;
                    this._returnToPatrolAfterAttack = false;
                    this._patrolCenter = null;
                    this._returnToHelipad(game);
                    break;
                }
                const etx = this.target.isBuilding ? this.target.tx + Math.floor(this.target.width / 2) : this.target.tx;
                const ety = this.target.isBuilding ? this.target.ty + Math.floor(this.target.height / 2) : this.target.ty;
                const targetX = etx * TILE_SIZE + TILE_SIZE / 2;
                const targetY = ety * TILE_SIZE + TILE_SIZE / 2;
                const dist = tileDistance(this.tx, this.ty, etx, ety);

                if (dist > this.attackRange) {
                    this._flyToward(targetX, targetY, game);
                } else {
                    // In range — face and fire
                    const tdx = targetX - this.x;
                    const tdy = targetY - this.y;
                    if (tdx !== 0 || tdy !== 0) {
                        this.targetDirection = Math.atan2(tdy, tdx) + Math.PI / 2;
                    }
                    this._smoothTurnBody(game.deltaTime);

                    const now = Date.now();
                    if (now - this.lastAttackTime >= this.attackSpeed) {
                        this.lastAttackTime = now;
                        // Alternate: use missile if available and target is big, otherwise gun
                        if (this.missileAmmo > 0 && (this.target.isBuilding || (this.target.maxHp && this.target.maxHp >= 150))) {
                            this.missileAmmo--;
                            game.addProjectile(this.x, this.y, this.target, this.missileDamage, this.owner, 'ornithopter_missile');
                            game.audio.play('shoot_rocket');
                        } else if (this.gunAmmo > 0) {
                            this.gunAmmo--;
                            game.addProjectile(this.x, this.y, this.target, this.attackDamage, this.owner, 'ornithopter_gun');
                            game.audio.play('shoot_machinegun');
                        } else {
                            // All out
                            this.target = null;
                            this._returnToHelipad(game);
                        }
                    }
                    // Slight strafing movement while attacking
                    const strafeX = this.x + Math.sin(Date.now() / 300) * TILE_SIZE * 0.3;
                    const strafeY = this.y + Math.cos(Date.now() / 350) * TILE_SIZE * 0.3;
                    this._flyToward(strafeX, strafeY, game, 0.3);
                }
                break;

            case 'moving':
                if (this._flyTarget) {
                    const dx = this._flyTarget.x - this.x;
                    const dy = this._flyTarget.y - this.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < TILE_SIZE) {
                        // Arrived — patrol this area
                        this._patrolCenter = { x: this._flyTarget.x, y: this._flyTarget.y };
                        this._flyTarget = null;
                        this.state = 'patrolling';
                        if (this.owner === 'player') {
                            game.ui.showStatus('Ornithopter patrolling area');
                        }
                    } else {
                        this._flyToward(this._flyTarget.x, this._flyTarget.y, game);
                    }
                } else {
                    this.state = 'idle';
                }
                break;

            case 'patrolling':
                // Out of ammo — head back
                if (this.gunAmmo <= 0 && this.missileAmmo <= 0) {
                    this._patrolCenter = null;
                    this._returnToHelipad(game);
                    break;
                }
                // Auto-attack nearby enemies while patrolling
                if (this.attackRange > 0) {
                    const patrolEnemy = this.findNearestEnemy(game);
                    if (patrolEnemy && tileDistance(this.tx, this.ty, patrolEnemy.tx, patrolEnemy.ty) <= this.attackRange + 3) {
                        this.target = patrolEnemy;
                        this.state = 'attacking';
                        this._returnToPatrolAfterAttack = true;
                        break;
                    }
                }
                // Circle the patrol point
                if (this._patrolCenter) {
                    const orbitR = TILE_SIZE * 3;
                    const angle = Date.now() / 2500;
                    const ox = this._patrolCenter.x + Math.cos(angle) * orbitR;
                    const oy = this._patrolCenter.y + Math.sin(angle) * orbitR;
                    this._flyToward(ox, oy, game);
                } else {
                    this.state = 'idle';
                }
                break;

            case 'returning_to_helipad':
                if (!this.homeHelipad || this.homeHelipad.hp <= 0) {
                    // Helipad destroyed — find another
                    this._findNewHelipad(game);
                    if (!this.homeHelipad) {
                        this.state = 'idle';
                        break;
                    }
                }
                const hx = this.homeHelipad.x;
                const hy = this.homeHelipad.y;
                const hDist = Math.sqrt((this.x - hx) ** 2 + (this.y - hy) ** 2);
                if (hDist < TILE_SIZE) {
                    // Landed — start rearming
                    this.state = 'rearming';
                    this.rearmTimer = 0;
                    this.x = hx;
                    this.y = hy;
                    this.tx = this.homeHelipad.tx + Math.floor(this.homeHelipad.width / 2);
                    this.ty = this.homeHelipad.ty + Math.floor(this.homeHelipad.height / 2);
                    if (this.owner === 'player') {
                        game.audio.speak('Rearming');
                    }
                } else {
                    this._flyToward(hx, hy, game);
                }
                break;

            case 'rearming':
                this.rearmTimer += game.deltaTime;
                const rearmDuration = 4000; // 4 seconds to rearm
                if (this.rearmTimer >= rearmDuration) {
                    this.gunAmmo = this.maxGunAmmo;
                    this.missileAmmo = this.maxMissileAmmo;
                    this.rearming = false;
                    this.state = 'idle';
                    if (this.owner === 'player') {
                        game.audio.speak('Ornithopter re-armed');
                        game.ui.showStatus('Ornithopter re-armed — assign new target');
                    }
                }
                break;
        }

        // Clamp to map bounds
        const mapPxW = MAP_WIDTH * TILE_SIZE;
        const mapPxH = MAP_HEIGHT * TILE_SIZE;
        this.x = Math.max(TILE_SIZE, Math.min(mapPxW - TILE_SIZE, this.x));
        this.y = Math.max(TILE_SIZE, Math.min(mapPxH - TILE_SIZE, this.y));

        // Update tile position based on pixel position
        this.tx = Math.floor(this.x / TILE_SIZE);
        this.ty = Math.floor(this.y / TILE_SIZE);
    }

    _flyToward(targetX, targetY, game, speedMul) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return;

        const spd = this.speed * (game.deltaTime / 1000) * TILE_SIZE * 1.5 * (speedMul || 1);
        let nx = dx / dist;
        let ny = dy / dist;

        // Separation from other ornithopters — push apart if too close
        const separationDist = TILE_SIZE * 2;
        let sepX = 0, sepY = 0;
        for (const e of game.entities) {
            if (e === this || !e.isAircraft || e.hp <= 0) continue;
            const sx = this.x - e.x;
            const sy = this.y - e.y;
            const sd = Math.sqrt(sx * sx + sy * sy);
            if (sd < separationDist && sd > 0) {
                const force = (separationDist - sd) / separationDist;
                sepX += (sx / sd) * force;
                sepY += (sy / sd) * force;
            }
        }
        // Blend separation into movement direction
        if (sepX !== 0 || sepY !== 0) {
            const sepLen = Math.sqrt(sepX * sepX + sepY * sepY);
            nx = nx * 0.6 + (sepX / sepLen) * 0.4;
            ny = ny * 0.6 + (sepY / sepLen) * 0.4;
            const nLen = Math.sqrt(nx * nx + ny * ny);
            if (nLen > 0) { nx /= nLen; ny /= nLen; }
        }

        this.x += nx * spd;
        this.y += ny * spd;

        // Face direction of travel
        if (dx !== 0 || dy !== 0) {
            this.targetDirection = Math.atan2(dy, dx) + Math.PI / 2;
        }
        this._smoothTurnBody(game.deltaTime);
        this.moving = true;
    }

    _returnToHelipad(game) {
        if (!this.homeHelipad || this.homeHelipad.hp <= 0) {
            this._findNewHelipad(game);
        }
        if (this.homeHelipad) {
            this.state = 'returning_to_helipad';
            this.target = null;
            if (this.owner === 'player') {
                game.audio.speak('Returning to re-arm');
            }
        }
    }

    _findNewHelipad(game) {
        let best = null;
        let bestDist = Infinity;
        for (const e of game.entities) {
            if (e.type === 'helipad' && e.owner === this.owner && e.hp > 0) {
                const d = Math.sqrt((this.x - e.x) ** 2 + (this.y - e.y) ** 2);
                if (d < bestDist) {
                    bestDist = d;
                    best = e;
                }
            }
        }
        this.homeHelipad = best;
    }

    _getWeaponSound() {
        switch (this.type) {
            case 'light_infantry': return 'shoot_rifle';
            case 'heavy_trooper': return 'shoot_rocket';
            case 'rocket_infantry': return 'shoot_rocket';
            case 'commando': return 'shoot_sniper';
            case 'ornithopter': return 'shoot_machinegun';
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
            case 'rocket_infantry':
                SpriteRenderer.drawRocketInfantry(ctx, screenX, screenY, this.direction, colors);
                break;
            case 'commando':
                SpriteRenderer.drawCommando(ctx, screenX, screenY, this.direction, colors);
                break;
            case 'ornithopter':
                const landed = this.state === 'rearming' && this.flyHeight < 1;
                SpriteRenderer.drawOrnithopter(ctx, screenX, screenY - (this.flyHeight || 0), this.direction, colors, landed);
                break;
            default:
                // Fallback for any unknown unit types
                ctx.fillStyle = colors.primary;
                ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
                break;
        }

        // Damage overlay - infantry get blood/wounds, vehicles get fire/smoke
        const hpRatio = this.hp / this.maxHp;
        const isInfantryType = (this.type === 'light_infantry' || this.type === 'heavy_trooper' || this.type === 'rocket_infantry' || this.type === 'commando');
        if (isInfantryType) {
            SpriteRenderer._infantryDamageOverlay(ctx, screenX, screenY, size, size, hpRatio);
        } else {
            SpriteRenderer._damageOverlay(ctx, screenX, screenY, size, size, hpRatio);
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
            } else if (this.state === 'moving_to_repair') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#0f0';
                ctx.textAlign = 'center';
                ctx.fillText('TO REPAIR', screenX, barY + barH + 9);
            } else if (this.state === 'waiting_for_repair') {
                ctx.font = '9px monospace';
                const pulse = Math.sin(Date.now() / 300) > 0 ? '#0f0' : '#0a0';
                ctx.fillStyle = pulse;
                ctx.textAlign = 'center';
                ctx.fillText('REPAIRING', screenX, barY + barH + 9);
            }
        }

        // Heal/repair state labels for non-harvester units
        if (this.type !== 'harvester' && this.type !== 'ornithopter') {
            const labelY = screenY + TILE_SIZE / 2 + 8;
            if (this.state === 'moving_to_heal') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#0f0';
                ctx.textAlign = 'center';
                ctx.fillText('TO HOSPITAL', screenX, labelY);
            } else if (this.state === 'waiting_for_heal') {
                ctx.font = '9px monospace';
                const pulse = Math.sin(Date.now() / 300) > 0 ? '#0f0' : '#0a0';
                ctx.fillStyle = pulse;
                ctx.textAlign = 'center';
                ctx.fillText('HEALING', screenX, labelY);
            } else if (this.state === 'moving_to_repair') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#0f0';
                ctx.textAlign = 'center';
                ctx.fillText('TO REPAIR', screenX, labelY);
            } else if (this.state === 'waiting_for_repair') {
                ctx.font = '9px monospace';
                const pulse = Math.sin(Date.now() / 300) > 0 ? '#0f0' : '#0a0';
                ctx.fillStyle = pulse;
                ctx.textAlign = 'center';
                ctx.fillText('REPAIRING', screenX, labelY);
            } else if (this.state === 'moving_to_c4') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#f80';
                ctx.textAlign = 'center';
                ctx.fillText('C4 MOVE', screenX, labelY);
            } else if (this.state === 'planting_c4') {
                ctx.font = '9px monospace';
                const pulse = Math.sin(Date.now() / 200) > 0 ? '#f00' : '#f80';
                ctx.fillStyle = pulse;
                ctx.textAlign = 'center';
                const pct = Math.floor(((Date.now() - this.c4PlantStart) / this.c4PlantDuration) * 100);
                ctx.fillText(`PLANTING ${Math.min(pct, 100)}%`, screenX, labelY);
            } else if (this.state === 'fleeing_c4') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#ff4444';
                ctx.textAlign = 'center';
                ctx.fillText('GET CLEAR!', screenX, labelY);
            }
        }

        // Ornithopter ammo and state display
        if (this.type === 'ornithopter') {
            const ammoY = screenY + TILE_SIZE / 2 + 3 - (this.flyHeight || 8);
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';

            // Ammo counts
            const gunColor = this.gunAmmo > 0 ? '#ff0' : '#555';
            const missileColor = this.missileAmmo > 0 ? '#f80' : '#555';
            ctx.fillStyle = gunColor;
            ctx.fillText(`G:${this.gunAmmo}`, screenX - 10, ammoY);
            ctx.fillStyle = missileColor;
            ctx.fillText(`M:${this.missileAmmo}`, screenX + 10, ammoY);

            // State label
            if (this.state === 'patrolling') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#aaf';
                ctx.fillText('PATROL', screenX, ammoY + 10);
            } else if (this.state === 'returning_to_helipad') {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#8cf';
                ctx.fillText('RTB', screenX, ammoY + 10);
            } else if (this.state === 'rearming') {
                ctx.font = '9px monospace';
                const pulse = Math.sin(Date.now() / 300) > 0 ? '#0f0' : '#0a0';
                ctx.fillStyle = pulse;
                const pct = Math.floor((this.rearmTimer / 4000) * 100);
                ctx.fillText(`REARM ${pct}%`, screenX, ammoY + 10);
            }
        }
    }
}
