// UI Manager
class UIManager {
    constructor(game) {
        this.game = game;
        this.activeTab = 'structures';
        this.placingBuilding = null;
        this.placingGhost = null;
        this.statusMessage = '';
        this.statusTime = 0;

        this.setupTabs();
        this.updateBuildList();
    }

    setupTabs() {
        document.querySelectorAll('.build-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.build-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeTab = tab.dataset.tab;
                this.updateBuildList();
            });
        });
    }

    showStatus(msg) {
        this.statusMessage = msg;
        this.statusTime = Date.now();
    }

    getMissingRequirements(requires) {
        const missing = [];
        for (const req of requires) {
            if (!this.game.entities.some(e => e.type === req && e.owner === 'player')) {
                const def = BUILDING_DEFS[req];
                missing.push(def ? def.name : req);
            }
        }
        return missing;
    }

    updateBuildList() {
        const list = document.getElementById('build-list');
        list.innerHTML = '';

        if (this.activeTab === 'structures') {
            for (const [key, def] of Object.entries(BUILDING_DEFS)) {
                if (key === 'construction_yard') continue;
                const available = this.checkRequirements(def.requires);
                const affordable = this.game.credits >= def.cost;
                const canBuild = available && affordable;

                const item = document.createElement('div');
                item.className = 'build-item' + (!canBuild ? ' disabled' : '');

                // Build status text
                let statusText = `${def.cost} credits`;
                if (!available) {
                    const missing = this.getMissingRequirements(def.requires);
                    statusText = `Needs: ${missing.join(', ')}`;
                } else if (!affordable) {
                    statusText = `${def.cost} credits (insufficient)`;
                }

                item.innerHTML = `
                    <div class="build-item-icon">${def.icon}</div>
                    <div class="build-item-info">
                        <div class="build-item-name">${def.name}</div>
                        <div class="build-item-cost">${statusText}</div>
                    </div>
                `;
                item.title = def.description;

                if (canBuild) {
                    item.addEventListener('click', () => {
                        this.startPlacing(key);
                        this.showStatus(`Place ${def.name} - Right-click to cancel`);
                    });
                }

                list.appendChild(item);
            }
        } else {
            for (const [key, def] of Object.entries(UNIT_DEFS)) {
                const available = this.checkRequirements(def.requires);
                const affordable = this.game.credits >= def.cost;
                const hasFactory = this.game.entities.some(
                    e => e.type === def.buildAt && e.owner === 'player'
                );

                // Count how many of this unit are queued + building across all factories
                let queuedCount = 0;
                this.game.entities.forEach(e => {
                    if (!e.isBuilding || e.owner !== 'player') return;
                    if (e.currentBuild && e.currentBuild.type === key) queuedCount++;
                    if (e.buildQueue) {
                        e.buildQueue.forEach(q => { if (q.type === key) queuedCount++; });
                    }
                });

                // Count existing alive units of this type
                const aliveCount = this.game.entities.filter(
                    e => e.type === key && e.owner === 'player' && e.hp > 0
                ).length;

                // Determine max allowed in queue
                const maxQueue = def.unique ? 1 : 5;
                const totalCount = queuedCount + aliveCount;

                // Check unique unit limit
                let atLimit = false;
                if (def.unique) {
                    atLimit = totalCount >= 1;
                } else {
                    atLimit = queuedCount >= maxQueue;
                }
                const canBuild = available && affordable && hasFactory && !atLimit;

                let statusText = `${def.cost} credits`;
                if (def.unique && totalCount >= 1) {
                    statusText = 'LIMIT REACHED (1 max)';
                } else if (queuedCount >= maxQueue) {
                    statusText = 'QUEUE FULL (5 max)';
                } else if (!hasFactory && available) {
                    const factoryDef = BUILDING_DEFS[def.buildAt];
                    statusText = `Needs: ${factoryDef ? factoryDef.name : def.buildAt}`;
                } else if (!available) {
                    const missing = this.getMissingRequirements(def.requires);
                    statusText = `Needs: ${missing.join(', ')}`;
                } else if (!affordable) {
                    statusText = `${def.cost} credits (insufficient)`;
                }

                const item = document.createElement('div');
                item.className = 'build-item' + (!canBuild ? ' disabled' : '');

                const countBadge = queuedCount > 0
                    ? `<span class="build-queue-count">${queuedCount}</span>`
                    : '';

                item.innerHTML = `
                    <div class="build-item-icon">${def.icon}${countBadge}</div>
                    <div class="build-item-info">
                        <div class="build-item-name">${def.name}</div>
                        <div class="build-item-cost">${statusText}</div>
                    </div>
                `;
                item.title = def.description;

                if (canBuild) {
                    item.addEventListener('click', () => {
                        this.buildUnit(key);
                    });
                }

                list.appendChild(item);
            }
        }
    }

    checkRequirements(requires) {
        for (const req of requires) {
            if (!this.game.entities.some(e => e.type === req && e.owner === 'player')) {
                return false;
            }
        }
        return true;
    }

    startPlacing(buildingType) {
        this.placingBuilding = buildingType;
        this.game.canvas.style.cursor = 'cell';
    }

    cancelPlacing() {
        this.placingBuilding = null;
        this.game.canvas.style.cursor = 'crosshair';
        this.showStatus('');
    }

    buildUnit(unitType) {
        const def = UNIT_DEFS[unitType];
        const factory = this.game.entities.find(
            e => e.type === def.buildAt && e.owner === 'player'
        );

        // Count queued across all factories
        let queuedCount = 0;
        this.game.entities.forEach(e => {
            if (!e.isBuilding || e.owner !== 'player') return;
            if (e.currentBuild && e.currentBuild.type === unitType) queuedCount++;
            if (e.buildQueue) {
                e.buildQueue.forEach(q => { if (q.type === unitType) queuedCount++; });
            }
        });

        const aliveCount = this.game.entities.filter(
            e => e.type === unitType && e.owner === 'player' && e.hp > 0
        ).length;

        // Unique unit check (e.g. commando - only 1 allowed)
        if (def.unique && (aliveCount + queuedCount) >= 1) {
            this.showStatus(`Only one ${def.name} allowed at a time!`);
            this.game.audio.speak('Cannot comply');
            return;
        }

        // Queue limit: 5 per unit type
        if (!def.unique && queuedCount >= 5) {
            this.showStatus(`Queue full for ${def.name} (5 max)`);
            this.game.audio.speak('Cannot comply');
            return;
        }

        if (factory && this.game.credits >= def.cost) {
            factory.queueUnit(unitType);
            this.game.credits -= def.cost;
            this.game.audio.play('click');
            this.game.audio.speak(`Training ${def.name}`);
            this.showStatus(`Training ${def.name}...`);
            this.updateBuildList();
        }
    }

    placeBuilding(tx, ty) {
        if (!this.placingBuilding) return false;

        const buildingType = this.placingBuilding; // capture before async
        const def = BUILDING_DEFS[buildingType];
        if (this.game.credits < def.cost) {
            this.showStatus('Insufficient credits!');
            this.game.audio.speak('Insufficient funds');
            this.cancelPlacing();
            return false;
        }

        if (!this.game.map.canBuildAt(tx, ty, def.width, def.height)) {
            this.showStatus('Cannot build here - terrain blocked');
            this.game.audio.speak('Cannot deploy here');
            return false;
        }

        // Must build within 5 tiles of an existing building's boundary
        const nearExisting = this.game.entities.some(e => {
            if (!e.isBuilding || e.owner !== 'player') return false;
            // Calculate distance between closest edges of the two buildings
            const newLeft = tx, newRight = tx + def.width - 1;
            const newTop = ty, newBottom = ty + def.height - 1;
            const exLeft = e.tx, exRight = e.tx + e.width - 1;
            const exTop = e.ty, exBottom = e.ty + e.height - 1;
            // Axis-aligned gap between rectangles
            const gapX = Math.max(0, newLeft - exRight - 1, exLeft - newRight - 1);
            const gapY = Math.max(0, newTop - exBottom - 1, exTop - newBottom - 1);
            const edgeDist = Math.max(gapX, gapY);
            return edgeDist <= 5;
        });

        if (!nearExisting) {
            this.showStatus('Must build near existing structures');
            this.game.audio.speak('Cannot deploy here');
            return false;
        }

        const building = new Building(tx, ty, 'player', buildingType);
        building.isConstructing = true;
        building.constructionProgress = 0;

        this.game.addEntity(building);
        this.game.map.setOccupied(tx, ty, def.width, def.height, building.id);
        this.game.credits -= def.cost;

        // Animate construction
        const constructTime = def.buildTime;
        const startTime = Date.now();
        const gameRef = this.game;
        const animate = () => {
            if (building.hp <= 0) return; // destroyed during construction
            const elapsed = Date.now() - startTime;
            building.constructionProgress = Math.min(1, elapsed / constructTime);
            if (building.constructionProgress >= 1) {
                building.isConstructing = false;
                gameRef.audio.play('buildComplete');
                gameRef.audio.speak('Construction complete');
                // Spawn harvester with refinery
                if (buildingType === 'refinery' && def.givesUnit) {
                    const spawnPoints = [];
                    for (let dy = -1; dy <= def.height; dy++) {
                        for (let dx = -1; dx <= def.width; dx++) {
                            if (dy >= 0 && dy < def.height && dx >= 0 && dx < def.width) continue;
                            const sx = tx + dx;
                            const sy = ty + dy;
                            if (gameRef.map.isPassable(sx, sy)) {
                                spawnPoints.push({ tx: sx, ty: sy });
                            }
                        }
                    }
                    if (spawnPoints.length > 0) {
                        const sp = spawnPoints[0];
                        const harvester = new Unit(sp.tx, sp.ty, 'player', 'harvester');
                        harvester.state = 'harvesting';
                        gameRef.addEntity(harvester);
                    }
                }
            } else {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);

        this.cancelPlacing();
        this.game.audio.play('place');
        this.game.audio.speak(`Building ${def.name}`);
        this.showStatus(`${def.name} under construction`);
        this.updateBuildList();
        return true;
    }

    renderPlacementGhost(ctx, camera, mouseWorldX, mouseWorldY) {
        if (!this.placingBuilding) return;

        const def = BUILDING_DEFS[this.placingBuilding];
        const tx = Math.floor(mouseWorldX / TILE_SIZE);
        const ty = Math.floor(mouseWorldY / TILE_SIZE);

        const canBuild = this.game.map.canBuildAt(tx, ty, def.width, def.height);
        const nearExisting = this.game.entities.some(e => {
            if (!e.isBuilding || e.owner !== 'player') return false;
            const newLeft = tx, newRight = tx + def.width - 1;
            const newTop = ty, newBottom = ty + def.height - 1;
            const exLeft = e.tx, exRight = e.tx + e.width - 1;
            const exTop = e.ty, exBottom = e.ty + e.height - 1;
            const gapX = Math.max(0, newLeft - exRight - 1, exLeft - newRight - 1);
            const gapY = Math.max(0, newTop - exBottom - 1, exTop - newBottom - 1);
            const edgeDist = Math.max(gapX, gapY);
            return edgeDist <= 5;
        });

        const valid = canBuild && nearExisting;

        const screenX = tx * TILE_SIZE - camera.x;
        const screenY = ty * TILE_SIZE - camera.y;
        const w = def.width * TILE_SIZE;
        const h = def.height * TILE_SIZE;

        ctx.fillStyle = valid ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(screenX, screenY, w, h);
        ctx.strokeStyle = valid ? '#0f0' : '#f00';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX, screenY, w, h);

        // Show individual tile validity
        for (let dy = 0; dy < def.height; dy++) {
            for (let dx = 0; dx < def.width; dx++) {
                const ttx = tx + dx;
                const tty = ty + dy;
                const tileOk = this.game.map.isBuildable(ttx, tty);
                ctx.fillStyle = tileOk ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.4)';
                ctx.fillRect(screenX + dx * TILE_SIZE, screenY + dy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }

        // Label
        ctx.fillStyle = valid ? '#0f0' : '#f00';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.name, screenX + w / 2, screenY - 8);
    }

    renderStatusMessage(ctx, canvasWidth, canvasHeight) {
        if (!this.statusMessage) return;
        // Fade out after 3 seconds
        const elapsed = Date.now() - this.statusTime;
        if (elapsed > 3000) {
            this.statusMessage = '';
            return;
        }
        const alpha = elapsed > 2000 ? 1 - (elapsed - 2000) / 1000 : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(canvasWidth / 2 - 200, canvasHeight - 50, 400, 30);
        ctx.strokeStyle = '#aa8800';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvasWidth / 2 - 200, canvasHeight - 50, 400, 30);
        ctx.fillStyle = '#e0d5a0';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.statusMessage, canvasWidth / 2, canvasHeight - 35);
        ctx.globalAlpha = 1;
    }

    updateResourceDisplay() {
        document.getElementById('credits').textContent = Math.floor(this.game.credits);
        document.getElementById('spice-stored').textContent = Math.floor(this.game.spiceStored);

        // Calculate power
        let produced = 0;
        let consumed = 0;
        for (const e of this.game.entities) {
            if (e.isBuilding && e.owner === 'player') {
                if (e.power > 0) produced += e.power;
                else consumed -= e.power;
            }
        }
        const powerEl = document.getElementById('power');
        powerEl.textContent = `${produced - consumed} / ${produced}`;
        powerEl.style.color = produced >= consumed ? '#0a0' : '#a00';
    }

    updateSelectionInfo() {
        const info = document.getElementById('selection-info');
        const selected = this.game.entities.filter(e => e.selected);

        if (selected.length === 0) {
            info.innerHTML = '<span style="color: #555">No selection</span>';
        } else if (selected.length === 1) {
            const e = selected[0];
            let html = `<b>${e.name}</b><br>HP: ${Math.floor(e.hp)}/${e.maxHp}`;
            if (e.isUnit && e.type === 'harvester') {
                html += `<br>Spice: ${Math.floor(e.spiceCarried)}/${e.capacity}`;
                html += `<br>State: ${e.state}`;
            } else if (e.isUnit) {
                html += `<br>State: ${e.state}`;
            }
            if (e.isBuilding && e.currentBuild) {
                const pct = Math.floor((e.buildProgress / e.currentBuild.buildTime) * 100);
                html += `<br>Building: ${UNIT_DEFS[e.currentBuild.type].name} (${pct}%)`;
            }
            if (e.isBuilding && e.buildQueue.length > 0) {
                html += `<br>Queue: ${e.buildQueue.length}`;
            }
            info.innerHTML = html;
        } else {
            info.innerHTML = `<b>${selected.length} units selected</b>`;
        }
    }

    updateHouseBanner() {
        const banner = document.getElementById('house-banner');
        const name = document.getElementById('house-name');
        const colors = HOUSE_COLORS[this.game.playerHouse];
        banner.style.background = `linear-gradient(135deg, ${colors.primary}, ${colors.dark})`;
        banner.style.borderBottomColor = colors.secondary;
        name.textContent = `HOUSE ${this.game.playerHouse.toUpperCase()}`;
    }
}
