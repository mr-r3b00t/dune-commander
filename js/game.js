// Main Game class
class Game {
    constructor(playerHouse) {
        this.playerHouse = playerHouse;
        // Pick enemy house (different from player)
        const houses = ['atreides', 'harkonnen', 'ordos'];
        const enemyHouses = houses.filter(h => h !== playerHouse);
        this.enemyHouse = enemyHouses[Math.floor(Math.random() * enemyHouses.length)];

        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.ctx.imageSmoothingEnabled = false;
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        // Sizing
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Game state
        this.entities = [];
        this.projectiles = [];
        this.credits = 1500;
        this.spiceStored = 0;
        this.enemyCredits = 1500;
        this.running = true;
        this.paused = false;
        this.deltaTime = 0;
        this.lastTime = 0;
        this.gameOver = false;
        this.lastAutoSave = 0;
        this.autoSaveInterval = 30000; // autosave every 30 seconds

        // Camera
        this.camera = {
            x: 0, y: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };

        // Systems
        this.map = new GameMap();
        this.pathfinder = new PathFinder(this.map);
        this.particles = new ParticleSystem();
        this.audio = new AudioManager();
        this.audio.init();

        // Input state
        this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
        this.keys = {};
        this.selecting = false;
        this.selectStart = { x: 0, y: 0 };
        this.scrollSpeed = 12;

        // Sandworm
        this.sandworms = [];
        this.gameStartTime = Date.now();
        this.lastWormSpawn = Date.now();
        this.wormInterval = 90000; // 90 seconds between worms

        // Fremen patrols
        this.lastFremenSpawn = Date.now();
        this.fremenSpawnInterval = 60000 + Math.random() * 60000; // 60-120 seconds

        // Sardaukar patrols
        this.lastSardaukarSpawn = Date.now();
        this.sardaukarSpawnInterval = 70000 + Math.random() * 60000; // 70-130 seconds

        // Setup
        this.setupEntities();
        this.ui = new UIManager(this);
        this.ai = new AIPlayer(this);
        this.setupInput();
        this.ui.updateHouseBanner();

        // Center camera on player base
        this.camera.x = 3 * TILE_SIZE - this.camera.width / 2 + 5 * TILE_SIZE;
        this.camera.y = 3 * TILE_SIZE - this.camera.height / 2 + 5 * TILE_SIZE;
        this.clampCamera();
    }

    resize() {
        const sidebarWidth = 202; // 200px + 2px border
        this.canvas.width = window.innerWidth - sidebarWidth;
        this.canvas.height = window.innerHeight;
        // Re-apply after resize (canvas resize resets context state)
        this.ctx.imageSmoothingEnabled = false;
        this.minimapCanvas.width = MINIMAP_WIDTH;
        this.minimapCanvas.height = MINIMAP_HEIGHT;
        if (this.camera) {
            this.camera.width = this.canvas.width;
            this.camera.height = this.canvas.height;
        }
    }

    setupEntities() {
        // Player base (on rock plateau at 5,5)
        const pCY = new Building(6, 6, 'player', 'construction_yard');
        this.addEntity(pCY);
        this.map.setOccupied(6, 6, 3, 3, pCY.id);

        // Player starting wind trap
        const pWT = new Building(6, 10, 'player', 'wind_trap');
        this.addEntity(pWT);
        this.map.setOccupied(6, 10, 2, 2, pWT.id);

        // Player starting refinery
        const pRef = new Building(10, 6, 'player', 'refinery');
        this.addEntity(pRef);
        this.map.setOccupied(10, 6, 3, 2, pRef.id);

        // Player starting harvester (auto-harvests immediately)
        const pHarv = new Unit(10, 9, 'player', 'harvester');
        pHarv.state = 'harvesting';
        this.addEntity(pHarv);

        // Enemy base (on rock plateau at top-right)
        const eCY = new Building(MAP_WIDTH - 10, MAP_HEIGHT - 10, 'enemy', 'construction_yard');
        this.addEntity(eCY);
        this.map.setOccupied(MAP_WIDTH - 10, MAP_HEIGHT - 10, 3, 3, eCY.id);

        // Enemy starting buildings
        const eWT = new Building(MAP_WIDTH - 10, MAP_HEIGHT - 7, 'enemy', 'wind_trap');
        this.addEntity(eWT);
        this.map.setOccupied(MAP_WIDTH - 10, MAP_HEIGHT - 7, 2, 2, eWT.id);

        const eRef = new Building(MAP_WIDTH - 7, MAP_HEIGHT - 10, 'enemy', 'refinery');
        this.addEntity(eRef);
        this.map.setOccupied(MAP_WIDTH - 7, MAP_HEIGHT - 10, 3, 2, eRef.id);

        // Enemy starting harvester
        const eHarv = new Unit(MAP_WIDTH - 7, MAP_HEIGHT - 7, 'enemy', 'harvester');
        eHarv.state = 'harvesting';
        this.addEntity(eHarv);
    }

    setupInput() {
        // Mouse events on canvas
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
            this.mouse.worldX = this.mouse.x + this.camera.x;
            this.mouse.worldY = this.mouse.y + this.camera.y;
            this.mouse.onCanvas = true;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.onCanvas = false;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (e.button === 0) { // Left click
                if (this.ui.placingBuilding) {
                    const tx = Math.floor(this.mouse.worldX / TILE_SIZE);
                    const ty = Math.floor(this.mouse.worldY / TILE_SIZE);
                    this.ui.placeBuilding(tx, ty);
                } else {
                    this.selecting = true;
                    this.selectStart = { x: this.mouse.x, y: this.mouse.y };
                }
            } else if (e.button === 2) { // Right click
                if (this.ui.placingBuilding) {
                    this.ui.cancelPlacing();
                } else {
                    this.handleRightClick();
                }
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0 && this.selecting) {
                this.handleSelection();
                this.selecting = false;
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key === 'Escape') {
                this.ui.cancelPlacing();
                this.deselectAll();
            }
            if (e.key === 's' || e.key === 'S') {
                // Stop selected units
                this.entities.filter(e => e.selected && e.isUnit).forEach(u => {
                    u.state = 'idle';
                    u.path = null;
                    u.target = null;
                    u.moving = false;
                });
            }
            if (e.key === 'm' || e.key === 'M') {
                const playing = this.audio.toggleMusic();
                this.ui.showStatus(playing ? '🎵 Music ON' : '🔇 Music OFF');
            }
            if (e.key === 'p' || e.key === 'P') {
                this.togglePause();
            }
            if (e.key === 'F5') {
                e.preventDefault();
                this.saveGame();
                this.ui.showStatus('💾 Game saved!');
            }
            if (e.key === 'F9') {
                e.preventDefault();
                if (this.loadGame()) {
                    this.ui.showStatus('📂 Game loaded!');
                } else {
                    this.ui.showStatus('No saved game found');
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Minimap click-and-hold to scroll (single click does nothing)
        this.minimapCanvas.addEventListener('mousedown', (e) => {
            this._minimapHolding = true;
            this._minimapHoldTimer = setTimeout(() => {
                if (this._minimapHolding) {
                    this._minimapDragging = true;
                    this.handleMinimapClick(e);
                }
            }, 150); // start scrolling after 150ms hold
        });

        this.minimapCanvas.addEventListener('mousemove', (e) => {
            if (this._minimapHolding && e.buttons === 1) {
                this._minimapDragging = true;
                this.handleMinimapClick(e);
            }
        });

        document.addEventListener('mouseup', () => {
            this._minimapHolding = false;
            this._minimapDragging = false;
            if (this._minimapHoldTimer) {
                clearTimeout(this._minimapHoldTimer);
                this._minimapHoldTimer = null;
            }
        });
    }

    handleMinimapClick(e) {
        const rect = this.minimapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const tileX = (mx / MINIMAP_WIDTH) * MAP_WIDTH;
        const tileY = (my / MINIMAP_HEIGHT) * MAP_HEIGHT;
        this.camera.x = tileX * TILE_SIZE - this.camera.width / 2;
        this.camera.y = tileY * TILE_SIZE - this.camera.height / 2;
        this.clampCamera();
    }

    handleSelection() {
        const x1 = Math.min(this.selectStart.x, this.mouse.x) + this.camera.x;
        const y1 = Math.min(this.selectStart.y, this.mouse.y) + this.camera.y;
        const x2 = Math.max(this.selectStart.x, this.mouse.x) + this.camera.x;
        const y2 = Math.max(this.selectStart.y, this.mouse.y) + this.camera.y;
        const isClick = Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5;

        if (!this.keys['shift']) {
            this.deselectAll();
        }

        if (isClick) {
            // Click selection
            let closest = null;
            let closestDist = Infinity;
            for (const e of this.entities) {
                if (e.owner !== 'player') continue;
                const d = distance(x1, y1, e.x, e.y);
                const radius = e.isBuilding ? Math.max(e.width, e.height) * TILE_SIZE / 2 : TILE_SIZE / 2;
                if (d < radius && d < closestDist) {
                    closestDist = d;
                    closest = e;
                }
            }
            if (closest) {
                closest.selected = true;
                this.audio.play('select');
            }
        } else {
            // Box selection (prefer units)
            let selectedAny = false;
            for (const e of this.entities) {
                if (e.owner !== 'player' || !e.isUnit) continue;
                if (e.x >= x1 && e.x <= x2 && e.y >= y1 && e.y <= y2) {
                    e.selected = true;
                    selectedAny = true;
                }
            }
            if (selectedAny) {
                this.audio.play('select');
                const units = this.entities.filter(e => e.selected && e.isUnit);
                if (units.length > 1) {
                    this.audio.speak('Units selected');
                } else if (units.length === 1) {
                    const def = UNIT_DEFS[units[0].type];
                    if (def) this.audio.speak(`${def.name} reporting`);
                } else {
                    const bldgs = this.entities.filter(e => e.selected && e.isBuilding);
                    if (bldgs.length === 1) {
                        this.audio.speak(bldgs[0].name);
                    }
                }
            }
        }

        this.ui.updateSelectionInfo();
    }

    handleRightClick() {
        const worldX = this.mouse.worldX;
        const worldY = this.mouse.worldY;
        const tx = Math.floor(worldX / TILE_SIZE);
        const ty = Math.floor(worldY / TILE_SIZE);

        // Check if right-clicked on a damaged friendly building (repair)
        const damagedBuilding = this.entities.find(e => {
            if (!e.isBuilding || e.owner !== 'player') return false;
            if (e.hp >= e.maxHp) return false;
            return tx >= e.tx && tx < e.tx + e.width && ty >= e.ty && ty < e.ty + e.height;
        });
        if (damagedBuilding && !damagedBuilding.repairing) {
            damagedBuilding.startRepair(this);
            this.ui.showStatus(`Repairing ${damagedBuilding.name}...`);
            this.audio.speak('Repairing');
            return;
        }

        const selected = this.entities.filter(e => e.selected && e.isUnit && e.owner === 'player');
        if (selected.length === 0) return;

        // Check if right-clicked on an enemy (Fremen are not targetable if player is Atreides)
        const target = this.entities.find(e => {
            if (e.owner === 'player' || e.hp <= 0) return false;
            if (e.owner === 'fremen' && this.playerHouse === 'atreides') return false;
            if (e.owner === 'sardaukar' && this.playerHouse === 'harkonnen') return false;
            if (e.isBuilding) {
                return tx >= e.tx && tx < e.tx + e.width && ty >= e.ty && ty < e.ty + e.height;
            }
            return e.tx === tx && e.ty === ty;
        });

        // Check if right-clicked on a friendly refinery
        const clickedRefinery = this.entities.find(e => {
            if (e.type !== 'refinery' || e.owner !== 'player') return false;
            return tx >= e.tx && tx < e.tx + e.width && ty >= e.ty && ty < e.ty + e.height;
        });

        // Generate spread positions for group movement
        const spreadPositions = this._getFormationPositions(tx, ty, selected.length);

        for (let i = 0; i < selected.length; i++) {
            const unit = selected[i];
            const dest = spreadPositions[i];

            if (target && unit.attackRange > 0) {
                unit.attackTarget(target, this);
            } else if (unit.type === 'harvester') {
                // Harvesters: right-click on refinery = return to unload
                if (clickedRefinery && unit.spiceCarried > 0) {
                    const dropX = clickedRefinery.tx + 1;
                    const dropY = clickedRefinery.ty + 1;
                    unit.startPath(dropX, dropY, this);
                    unit.state = 'returning';
                }
                // Right-click on spice = harvest there
                else if (this.map.tiles[ty] && (this.map.tiles[ty][tx] === TERRAIN.SPICE || this.map.tiles[ty][tx] === TERRAIN.THICK_SPICE)) {
                    unit.startPath(tx, ty, this);
                    unit.state = 'harvesting';
                }
                // Otherwise just move
                else {
                    unit.moveTo(dest.x, dest.y, this);
                }
            } else {
                unit.moveTo(dest.x, dest.y, this);
            }
        }

        this.audio.play('move');

        // Voice for move/attack/harvest
        if (target) {
            this.audio.speak('Engaging target');
        } else if (clickedRefinery) {
            this.audio.speak('Returning to base');
        } else {
            const phrases = ['Acknowledged', 'Moving out', 'Yes commander', 'On my way', 'Affirmative'];
            this.audio.speak(phrases[Math.floor(Math.random() * phrases.length)]);
        }

        // Move command particle
        this.particles.addSandPuff(worldX, worldY);
    }

    _getFormationPositions(tx, ty, count) {
        if (count <= 1) return [{ x: tx, y: ty }];

        const positions = [];
        const taken = new Set();
        taken.add(`${tx},${ty}`);
        positions.push({ x: tx, y: ty });

        // Spiral outward from center to find passable tiles
        for (let r = 1; positions.length < count && r < 10; r++) {
            for (let dy = -r; dy <= r && positions.length < count; dy++) {
                for (let dx = -r; dx <= r && positions.length < count; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = tx + dx;
                    const ny = ty + dy;
                    const key = `${nx},${ny}`;
                    if (taken.has(key)) continue;
                    if (!isInBounds(nx, ny)) continue;
                    if (this.map.tiles[ny][nx] === TERRAIN.MOUNTAIN) continue;
                    // Don't place on buildings
                    const occ = this.map.occupied[ny][nx];
                    if (occ) {
                        const ent = this.entities.find(e => e.id === occ);
                        if (ent && ent.isBuilding) continue;
                    }
                    taken.add(key);
                    positions.push({ x: nx, y: ny });
                }
            }
        }

        // Sort positions by distance to each unit's current position would be ideal,
        // but simple assignment works well enough for most cases
        return positions;
    }

    deselectAll() {
        for (const e of this.entities) {
            e.selected = false;
        }
    }

    addEntity(entity) {
        this.entities.push(entity);
        if (entity.isUnit) {
            this.map.occupied[entity.ty][entity.tx] = entity.id;
        }
    }

    removeEntity(entity) {
        const idx = this.entities.indexOf(entity);
        if (idx >= 0) {
            this.entities.splice(idx, 1);
        }

        if (entity.isBuilding) {
            this.map.clearOccupied(entity.tx, entity.ty, entity.width, entity.height);
        } else if (entity.isUnit) {
            if (this.map.occupied[entity.ty] && this.map.occupied[entity.ty][entity.tx] === entity.id) {
                this.map.occupied[entity.ty][entity.tx] = null;
            }
        }

        // Check game over
        const playerBuildings = this.entities.filter(e => e.isBuilding && e.owner === 'player');
        const enemyBuildings = this.entities.filter(e => e.isBuilding && e.owner === 'enemy');

        if (playerBuildings.length === 0 && !this.gameOver) {
            this.gameOver = true;
            this.audio.speak('Mission failed. Your base has been destroyed.', true);
            setTimeout(() => alert('DEFEAT! Your base has been destroyed.'), 2000);
        } else if (enemyBuildings.length === 0 && !this.gameOver) {
            this.gameOver = true;
            this.audio.speak('Mission accomplished. The enemy has been vanquished.', true);
            setTimeout(() => alert('VICTORY! The enemy has been vanquished!'), 2000);
        }
    }

    addProjectile(x, y, target, damage, owner) {
        this.projectiles.push(new Projectile(x, y, target, damage, owner));
    }

    addExplosion(x, y, large) {
        this.particles.addExplosion(x, y, large);
    }

    updateCamera() {
        const edge = 15;
        const rightEdge = 40; // larger dead zone on right side near sidebar
        const mouseScroll = this.mouse.onCanvas === true; // only edge-scroll when mouse is confirmed on canvas
        if ((mouseScroll && this.mouse.x < edge) || this.keys['arrowleft'] || this.keys['a']) {
            this.camera.x -= this.scrollSpeed;
        }
        if ((mouseScroll && this.mouse.x > this.canvas.width - rightEdge) || this.keys['arrowright'] || this.keys['d']) {
            this.camera.x += this.scrollSpeed;
        }
        if ((mouseScroll && this.mouse.y < edge) || this.keys['arrowup'] || this.keys['w']) {
            this.camera.y -= this.scrollSpeed;
        }
        if ((mouseScroll && this.mouse.y > this.canvas.height - edge) || this.keys['arrowdown']) {
            this.camera.y += this.scrollSpeed;
        }
        this.clampCamera();
    }

    clampCamera() {
        this.camera.x = Math.round(clamp(this.camera.x, 0, MAP_WIDTH * TILE_SIZE - this.camera.width));
        this.camera.y = Math.round(clamp(this.camera.y, 0, MAP_HEIGHT * TILE_SIZE - this.camera.height));
    }

    updateSandworms() {
        const now = Date.now();
        const gameAge = now - this.gameStartTime;

        // No worms for first 3 minutes
        if (gameAge < 180000) return;

        // Spawn new worm
        if (now - this.lastWormSpawn > this.wormInterval && this.sandworms.length < 2) {
            // Spawn on sand, away from player base
            let wx, wy;
            for (let attempt = 0; attempt < 30; attempt++) {
                wx = randomInt(10, MAP_WIDTH - 10);
                wy = randomInt(10, MAP_HEIGHT - 10);
                // Must be on sand, not rock
                if (this.map.isRock(wx, wy)) continue;
                // Don't spawn right on top of the player base area
                const playerBuildings = this.entities.filter(e => e.isBuilding && e.owner === 'player');
                const tooClose = playerBuildings.some(b =>
                    tileDistance(wx, wy, b.tx, b.ty) < 15
                );
                if (!tooClose) break;
            }
            this.sandworms.push({
                x: wx * TILE_SIZE,
                y: wy * TILE_SIZE,
                tx: wx, ty: wy,
                targetX: wx * TILE_SIZE,
                targetY: wy * TILE_SIZE,
                speed: 1.2,
                lifetime: 25000,
                born: now,
                trail: [],
                lastEat: 0
            });
            this.lastWormSpawn = now;
            this.audio.play('worm');
            this.ui.showStatus('⚠ WORMSIGN! A sandworm has been detected!');
            this.audio.speak('Wormsign! A sandworm has been detected!', true);
        }

        // Update worms
        for (let i = this.sandworms.length - 1; i >= 0; i--) {
            const worm = this.sandworms[i];

            // Lifetime
            if (now - worm.born > worm.lifetime) {
                this.sandworms.splice(i, 1);
                continue;
            }

            // Find target (nearest ground unit on sand - worms can't reach rock)
            if (distance(worm.x, worm.y, worm.targetX, worm.targetY) < TILE_SIZE) {
                const groundUnits = this.entities.filter(e => {
                    if (!e.isUnit) return false;
                    if (e.type === 'light_infantry' || e.type === 'heavy_trooper') return false;
                    // Only target units on sand/dunes/spice (not on rock)
                    return !this.map.isRock(e.tx, e.ty);
                });
                if (groundUnits.length > 0) {
                    const nearest = groundUnits.reduce((a, b) =>
                        distance(worm.x, worm.y, a.x, a.y) < distance(worm.x, worm.y, b.x, b.y) ? a : b
                    );
                    worm.targetX = nearest.x;
                    worm.targetY = nearest.y;
                } else {
                    // Wander on sand only
                    let wx, wy;
                    do {
                        wx = randomInt(5, MAP_WIDTH - 5);
                        wy = randomInt(5, MAP_HEIGHT - 5);
                    } while (this.map.isRock(wx, wy));
                    worm.targetX = wx * TILE_SIZE;
                    worm.targetY = wy * TILE_SIZE;
                }
            }

            // Move towards target
            const dx = worm.targetX - worm.x;
            const dy = worm.targetY - worm.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const newX = worm.x + (dx / dist) * worm.speed * (this.deltaTime / 16);
            const newY = worm.y + (dy / dist) * worm.speed * (this.deltaTime / 16);
            const newTX = Math.floor(newX / TILE_SIZE);
            const newTY = Math.floor(newY / TILE_SIZE);

            // Worms cannot enter rock or mountain tiles
            if (isInBounds(newTX, newTY) && !this.map.isRock(newTX, newTY)) {
                worm.x = newX;
                worm.y = newY;
                worm.tx = newTX;
                worm.ty = newTY;
            } else {
                // Deflect - pick a new random sand target
                let wx, wy;
                for (let attempt = 0; attempt < 10; attempt++) {
                    wx = randomInt(5, MAP_WIDTH - 5);
                    wy = randomInt(5, MAP_HEIGHT - 5);
                    if (!this.map.isRock(wx, wy)) break;
                }
                worm.targetX = wx * TILE_SIZE;
                worm.targetY = wy * TILE_SIZE;
            }

            // Trail
            worm.trail.push({ x: worm.x, y: worm.y });
            if (worm.trail.length > 30) worm.trail.shift();

            // Eat units it touches (only on sand - units on rock are safe)
            if (now - worm.lastEat > 2000) {
                for (const e of this.entities) {
                    if (!e.isUnit) continue;
                    if (e.type === 'light_infantry' || e.type === 'heavy_trooper') continue;
                    // Units on rock are safe from worms
                    if (this.map.isRock(e.tx, e.ty)) continue;
                    if (distance(worm.x, worm.y, e.x, e.y) < TILE_SIZE * 1.5) {
                        this.addExplosion(e.x, e.y, false);
                        const wasPlayer = e.owner === 'player';
                        const unitName = UNIT_DEFS[e.type] ? UNIT_DEFS[e.type].name : 'Unit';
                        this.removeEntity(e);
                        worm.lastEat = now;
                        this.audio.play('worm');
                        this.audio.play('vehicle_destroyed');
                        if (wasPlayer) {
                            this.audio.speak(`${unitName} lost to sandworm!`, true);
                        }
                        break;
                    }
                }
            }
        }
    }

    updateFremen() {
        const now = Date.now();

        // Despawn expired fremen units
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const e = this.entities[i];
            if (e.owner === 'fremen' && e._fremenDespawnTime && now >= e._fremenDespawnTime) {
                // Remove from occupied map
                if (this.map.occupied[e.ty] && this.map.occupied[e.ty][e.tx] === e.id) {
                    this.map.occupied[e.ty][e.tx] = null;
                }
                this.entities.splice(i, 1);
            }
        }

        // Spawn new fremen patrol squad
        if (now - this.lastFremenSpawn >= this.fremenSpawnInterval) {
            this.lastFremenSpawn = now;
            this.fremenSpawnInterval = 60000 + Math.random() * 60000; // next interval 60-120s

            const squadSize = 2 + Math.floor(Math.random() * 3); // 2-4 units
            const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left

            for (let i = 0; i < squadSize; i++) {
                let tx, ty;
                switch (edge) {
                    case 0: // top
                        tx = randomInt(2, MAP_WIDTH - 2);
                        ty = 1 + i;
                        break;
                    case 1: // right
                        tx = MAP_WIDTH - 2 - i;
                        ty = randomInt(2, MAP_HEIGHT - 2);
                        break;
                    case 2: // bottom
                        tx = randomInt(2, MAP_WIDTH - 2);
                        ty = MAP_HEIGHT - 2 - i;
                        break;
                    case 3: // left
                        tx = 1 + i;
                        ty = randomInt(2, MAP_HEIGHT - 2);
                        break;
                }

                // Make sure the tile is passable
                if (!isInBounds(tx, ty) || this.map.tiles[ty][tx] === TERRAIN.MOUNTAIN || this.map.occupied[ty][tx]) {
                    continue;
                }

                const unit = new Unit(tx, ty, 'fremen', 'light_infantry');
                // Fremen lifespan: 60-90 seconds
                unit._fremenDespawnTime = now + 60000 + Math.random() * 30000;
                this.addEntity(unit);
            }

            // Announce arrival
            this.ui.showStatus('⚔ FREMEN PATROL: Desert warriors have been spotted!');
            this.audio.speak('Fremen patrol detected on the battlefield');
        }
    }

    updateSardaukar() {
        const now = Date.now();

        // Despawn expired sardaukar units
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const e = this.entities[i];
            if (e.owner === 'sardaukar' && e._sardaukarDespawnTime && now >= e._sardaukarDespawnTime) {
                // Remove from occupied map
                if (this.map.occupied[e.ty] && this.map.occupied[e.ty][e.tx] === e.id) {
                    this.map.occupied[e.ty][e.tx] = null;
                }
                this.entities.splice(i, 1);
            }
        }

        // Spawn new sardaukar patrol squad
        if (now - this.lastSardaukarSpawn >= this.sardaukarSpawnInterval) {
            this.lastSardaukarSpawn = now;
            this.sardaukarSpawnInterval = 70000 + Math.random() * 60000; // next interval 70-130s

            const squadSize = 2 + Math.floor(Math.random() * 3); // 2-4 units
            const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left

            for (let i = 0; i < squadSize; i++) {
                let tx, ty;
                switch (edge) {
                    case 0: // top
                        tx = randomInt(2, MAP_WIDTH - 2);
                        ty = 1 + i;
                        break;
                    case 1: // right
                        tx = MAP_WIDTH - 2 - i;
                        ty = randomInt(2, MAP_HEIGHT - 2);
                        break;
                    case 2: // bottom
                        tx = randomInt(2, MAP_WIDTH - 2);
                        ty = MAP_HEIGHT - 2 - i;
                        break;
                    case 3: // left
                        tx = 1 + i;
                        ty = randomInt(2, MAP_HEIGHT - 2);
                        break;
                }

                // Make sure the tile is passable
                if (!isInBounds(tx, ty) || this.map.tiles[ty][tx] === TERRAIN.MOUNTAIN || this.map.occupied[ty][tx]) {
                    continue;
                }

                const unit = new Unit(tx, ty, 'sardaukar', 'heavy_trooper');
                // Sardaukar lifespan: 70-100 seconds (they stick around longer)
                unit._sardaukarDespawnTime = now + 70000 + Math.random() * 30000;
                this.addEntity(unit);
            }

            // Announce arrival
            this.ui.showStatus('⚠ SARDAUKAR DEPLOYED: Imperial troops have arrived!');
            this.audio.speak('Warning! Sardaukar imperial guard detected');
        }
    }

    renderSandworms(ctx) {
        for (const worm of this.sandworms) {
            // Only render worms in visible area (not fog)
            const wormTX = Math.floor(worm.x / TILE_SIZE);
            const wormTY = Math.floor(worm.y / TILE_SIZE);
            if (!isInBounds(wormTX, wormTY) || !this.map.fogOfWar[wormTY][wormTX]) continue;

            // Trail
            for (let i = 0; i < worm.trail.length; i++) {
                const t = worm.trail[i];
                const sx = t.x - this.camera.x;
                const sy = t.y - this.camera.y;
                const alpha = i / worm.trail.length * 0.3;
                ctx.fillStyle = `rgba(139, 90, 43, ${alpha})`;
                ctx.beginPath();
                ctx.arc(sx, sy, 8 + (i / worm.trail.length) * 10, 0, Math.PI * 2);
                ctx.fill();
            }

            // Worm head
            const sx = worm.x - this.camera.x;
            const sy = worm.y - this.camera.y;

            ctx.fillStyle = '#8B5A2B';
            ctx.beginPath();
            ctx.arc(sx, sy, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#654321';
            ctx.beginPath();
            ctx.arc(sx, sy, 12, 0, Math.PI * 2);
            ctx.fill();

            // Mouth
            ctx.fillStyle = '#2a1a0a';
            ctx.beginPath();
            ctx.arc(sx, sy, 6, 0, Math.PI * 2);
            ctx.fill();

            // Eyes
            const wobble = Math.sin(Date.now() / 200) * 2;
            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.arc(sx - 8, sy - 4 + wobble, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(sx + 8, sy - 4 + wobble, 3, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = '#ff6600';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('SANDWORM', sx, sy - 25);
        }
    }

    update(timestamp) {
        this.deltaTime = Math.min(timestamp - this.lastTime, 50);
        this.lastTime = timestamp;

        if (this.gameOver) return;

        // Camera
        this.updateCamera();

        // Reset fog of war (recalculate each frame)
        this.map.resetFog();

        // Update entities
        for (const entity of this.entities) {
            entity.update(this);
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update(this);
            if (!this.projectiles[i].alive) {
                this.projectiles.splice(i, 1);
            }
        }

        // Dust trails for moving vehicles & smoke for damaged buildings
        for (const entity of this.entities) {
            if (entity.isUnit && entity.moving && entity.type !== 'light_infantry' && entity.type !== 'heavy_trooper') {
                if (Math.random() < 0.3) {
                    this.particles.addDustTrail(entity.x, entity.y);
                }
            }
            if (entity.isBuilding && entity.hp < entity.maxHp * 0.5 && entity.hp > 0) {
                if (Math.random() < 0.08) {
                    this.particles.addBuildingSmoke(entity.x, entity.y - entity.height * TILE_SIZE * 0.3);
                }
            }
        }

        // Update particles
        this.particles.update(this.deltaTime);

        // Update sandworms
        this.updateSandworms();

        // Update Fremen patrols
        this.updateFremen();

        // Update Sardaukar patrols
        this.updateSardaukar();

        // AI
        this.ai.update();

        // UI updates
        this.ui.updateResourceDisplay();
        this.ui.updateSelectionInfo();

        // Refresh build list every second
        if (Math.floor(timestamp / 1000) !== Math.floor((timestamp - this.deltaTime) / 1000)) {
            this.ui.updateBuildList();
        }

        // Autosave
        const now = Date.now();
        if (now - this.lastAutoSave > this.autoSaveInterval) {
            this.lastAutoSave = now;
            this.saveGame();
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Screen shake
        const shake = this.particles.getScreenShake ? this.particles.getScreenShake() : 0;
        if (shake > 0.5) {
            ctx.save();
            const sx = (Math.random() - 0.5) * shake * 2;
            const sy = (Math.random() - 0.5) * shake * 2;
            ctx.translate(sx, sy);
        }

        // Render map
        this.map.render(ctx, this.camera);

        // Render entities (buildings first, then units)
        const buildings = [];
        const units = [];
        for (const e of this.entities) {
            if (e.isBuilding) buildings.push(e);
            else if (e.isUnit) units.push(e);
        }

        for (const b of buildings) {
            if (!this.isInView(b)) continue;
            // Enemy buildings: only show if any tile is currently visible or was explored
            if (b.owner !== 'player') {
                let visible = false;
                for (let dy = 0; dy < b.height; dy++) {
                    for (let dx = 0; dx < b.width; dx++) {
                        const bx = b.tx + dx;
                        const by = b.ty + dy;
                        if (isInBounds(bx, by) && this.map.explored[by][bx]) {
                            visible = true;
                            break;
                        }
                    }
                    if (visible) break;
                }
                if (!visible) continue;
                // If explored but not currently visible, render dimmed (last known position)
                let currentlyVisible = false;
                for (let dy = 0; dy < b.height; dy++) {
                    for (let dx = 0; dx < b.width; dx++) {
                        const bx = b.tx + dx;
                        const by = b.ty + dy;
                        if (isInBounds(bx, by) && this.map.fogOfWar[by][bx]) {
                            currentlyVisible = true;
                            break;
                        }
                    }
                    if (currentlyVisible) break;
                }
                if (!currentlyVisible) {
                    ctx.globalAlpha = 0.4;
                }
            }
            b.render(ctx, this.camera);
            ctx.globalAlpha = 1.0;
        }

        for (const u of units) {
            if (!this.isInView(u)) continue;
            // Enemy units: only show if tile is currently visible (not just explored)
            if (u.owner !== 'player') {
                if (!isInBounds(u.tx, u.ty) || !this.map.fogOfWar[u.ty][u.tx]) continue;
            }
            u.render(ctx, this.camera);
        }

        // Render sandworms
        this.renderSandworms(ctx);

        // Render projectiles
        for (const p of this.projectiles) {
            p.render(ctx, this.camera);
        }

        // Render particles
        this.particles.render(ctx, this.camera);

        // Selection box
        if (this.selecting) {
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            const x = Math.min(this.selectStart.x, this.mouse.x);
            const y = Math.min(this.selectStart.y, this.mouse.y);
            const w = Math.abs(this.mouse.x - this.selectStart.x);
            const h = Math.abs(this.mouse.y - this.selectStart.y);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        }

        // Building placement ghost
        this.ui.renderPlacementGhost(ctx, this.camera, this.mouse.worldX, this.mouse.worldY);

        // Status message
        this.ui.renderStatusMessage(ctx, this.canvas.width, this.canvas.height);

        // Pause overlay
        if (this.paused) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = '#e0a030';
            ctx.font = 'bold 48px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2 - 20);
            ctx.font = '16px monospace';
            ctx.fillStyle = '#ccc';
            ctx.fillText('Press P to resume', this.canvas.width / 2, this.canvas.height / 2 + 20);
            ctx.fillText('F5 = Save  |  F9 = Load', this.canvas.width / 2, this.canvas.height / 2 + 45);
        }

        // End screen shake
        if (shake > 0.5) {
            ctx.restore();
        }

        // Minimap
        this.minimapCtx.fillStyle = '#0a0a0a';
        this.minimapCtx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
        this.map.renderMinimap(this.minimapCtx, this.camera, this.entities);
    }

    isInView(entity) {
        const margin = TILE_SIZE * 3;
        return entity.x > this.camera.x - margin &&
               entity.x < this.camera.x + this.camera.width + margin &&
               entity.y > this.camera.y - margin &&
               entity.y < this.camera.y + this.camera.height + margin;
    }

    togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            this.ui.showStatus('⏸ PAUSED - Press P to resume');
            this.audio.speak('Game paused');
        } else {
            this.lastTime = performance.now(); // reset delta so no huge jump
            this.ui.showStatus('▶ RESUMED');
            this.audio.speak('Game resumed');
        }
    }

    gameLoop(timestamp) {
        if (!this.running) return;
        if (!this.paused) {
            this.update(timestamp);
        } else {
            this.lastTime = timestamp; // keep lastTime current so no spike on unpause
        }
        this.render();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
        // Start background music immediately (called from user click context)
        this.audio.startMusic();
    }

    // ---- SAVE / LOAD ----

    saveGame() {
        try {
            const state = {
                version: 2,
                playerHouse: this.playerHouse,
                enemyHouse: this.enemyHouse,
                credits: this.credits,
                spiceStored: this.spiceStored,
                enemyCredits: this.enemyCredits,
                gameOver: this.gameOver,
                camera: { x: this.camera.x, y: this.camera.y },
                gameStartTime: this.gameStartTime,
                lastWormSpawn: this.lastWormSpawn,
                lastFremenSpawn: this.lastFremenSpawn,
                lastSardaukarSpawn: this.lastSardaukarSpawn,
                map: {
                    tiles: this.map.tiles,
                    spiceAmount: this.map.spiceAmount
                },
                entities: this.entities.map(e => this._serializeEntity(e)),
                sandworms: this.sandworms.map(w => ({
                    x: w.x, y: w.y, tx: w.tx, ty: w.ty,
                    targetX: w.targetX, targetY: w.targetY,
                    speed: w.speed, alive: w.alive, spawnTime: w.spawnTime
                })),
                aiState: {
                    buildIndex: this.ai.buildIndex,
                    unitBuildIndex: this.ai.unitBuildIndex,
                    lastBuildTime: this.ai.lastBuildTime,
                    lastAttackTime: this.ai.lastAttackTime
                }
            };
            localStorage.setItem('dune_commander_save', JSON.stringify(state));
            return true;
        } catch (e) {
            console.warn('Save failed:', e);
            return false;
        }
    }

    _serializeEntity(e) {
        const data = {
            cls: e.isBuilding ? 'building' : 'unit',
            type: e.type,
            tx: e.tx,
            ty: e.ty,
            owner: e.owner,
            hp: e.hp,
            id: e.id
        };

        if (e.isUnit) {
            data.state = e.state;
            data.direction = e.direction;
            data.targetDirection = e.targetDirection;
            data.turretDirection = e.turretDirection || e.direction;
            data.spiceCarried = e.spiceCarried || 0;
            data.moving = e.moving;
            data.targetTX = e.targetTX;
            data.targetTY = e.targetTY;
        }

        if (e.isBuilding) {
            data.isConstructing = e.isConstructing;
            data.constructionProgress = e.constructionProgress;
            data.repairing = e.repairing;
            data.buildQueue = e.buildQueue.map(q => ({ type: q.type, buildTime: q.buildTime }));
            data.buildProgress = e.buildProgress;
            if (e.currentBuild) {
                data.currentBuild = { type: e.currentBuild.type, buildTime: e.currentBuild.buildTime };
            }
        }

        return data;
    }

    loadGame() {
        try {
            const json = localStorage.getItem('dune_commander_save');
            if (!json) return false;
            const state = JSON.parse(json);
            if (!state || !state.version) return false;

            // Restore basic game state
            this.credits = state.credits;
            this.spiceStored = state.spiceStored;
            this.enemyCredits = state.enemyCredits;
            this.gameOver = state.gameOver;
            this.camera.x = state.camera.x;
            this.camera.y = state.camera.y;
            this.gameStartTime = state.gameStartTime;
            this.lastWormSpawn = state.lastWormSpawn;
            this.lastFremenSpawn = state.lastFremenSpawn;
            this.lastSardaukarSpawn = state.lastSardaukarSpawn;

            // Restore map
            this.map.tiles = state.map.tiles;
            this.map.spiceAmount = state.map.spiceAmount;
            this.map._terrainCacheDirty = true; // force terrain redraw

            // Clear occupied grid
            for (let y = 0; y < MAP_HEIGHT; y++) {
                for (let x = 0; x < MAP_WIDTH; x++) {
                    this.map.occupied[y][x] = null;
                }
            }

            // Restore entities
            this.entities = [];
            this.projectiles = [];
            for (const data of state.entities) {
                let entity;
                if (data.cls === 'building') {
                    entity = new Building(data.tx, data.ty, data.owner, data.type);
                    entity.isConstructing = data.isConstructing;
                    entity.constructionProgress = data.constructionProgress;
                    entity.repairing = data.repairing;
                    entity.buildQueue = data.buildQueue || [];
                    entity.buildProgress = data.buildProgress || 0;
                    if (data.currentBuild) {
                        entity.currentBuild = data.currentBuild;
                    }
                    this.map.setOccupied(data.tx, data.ty, entity.width, entity.height, entity.id);
                } else {
                    entity = new Unit(data.tx, data.ty, data.owner, data.type);
                    entity.state = data.state;
                    entity.direction = data.direction;
                    entity.targetDirection = data.targetDirection;
                    entity.turretDirection = data.turretDirection;
                    entity.spiceCarried = data.spiceCarried;
                    entity.moving = data.moving || false;
                    entity.targetTX = data.targetTX;
                    entity.targetTY = data.targetTY;
                    if (this.map.occupied[entity.ty]) {
                        this.map.occupied[entity.ty][entity.tx] = entity.id;
                    }
                }
                entity.hp = data.hp;
                entity.id = data.id;
                this.entities.push(entity);
            }

            // Restore sandworms
            this.sandworms = state.sandworms || [];

            // Restore AI state
            if (state.aiState) {
                this.ai.buildIndex = state.aiState.buildIndex;
                this.ai.unitBuildIndex = state.aiState.unitBuildIndex;
                this.ai.lastBuildTime = state.aiState.lastBuildTime;
                this.ai.lastAttackTime = state.aiState.lastAttackTime;
            }

            // Force UI refresh
            this.ui.updateBuildList();
            this.ui.updateResourceDisplay();
            this.ui.updateSelectionInfo();
            this.clampCamera();

            return true;
        } catch (e) {
            console.warn('Load failed:', e);
            return false;
        }
    }
}
