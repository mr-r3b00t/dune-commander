// Map generation and rendering
class GameMap {
    constructor() {
        this.tiles = [];
        this.spiceAmount = [];
        this.occupied = [];
        this.buildReserved = []; // tiles reserved as building clearance (passable but not buildable)
        this.fogOfWar = [];
        this.explored = [];
        this._dirtyTiles = new Set();
        this._terrainCacheDirty = true; // full regeneration on first render
        this.generate();
    }

    generate() {
        const seed = Math.random() * 10000;
        const spiceSeed = Math.random() * 10000;

        for (let y = 0; y < MAP_HEIGHT; y++) {
            this.tiles[y] = [];
            this.spiceAmount[y] = [];
            this.occupied[y] = [];
            this.buildReserved[y] = [];
            this.fogOfWar[y] = [];
            this.explored[y] = [];
            for (let x = 0; x < MAP_WIDTH; x++) {
                const n = smoothNoise(x, y, seed, 8);
                const n2 = smoothNoise(x, y, seed, 16);
                const combined = n * 0.6 + n2 * 0.4;

                let terrain;
                if (combined > 0.75) {
                    terrain = TERRAIN.MOUNTAIN;
                } else if (combined > 0.6) {
                    terrain = TERRAIN.ROCK;
                } else if (combined > 0.35) {
                    terrain = TERRAIN.SAND;
                } else {
                    terrain = TERRAIN.DUNES;
                }

                // Spice fields
                const sn = smoothNoise(x, y, spiceSeed, 6);
                if (terrain === TERRAIN.SAND || terrain === TERRAIN.DUNES) {
                    if (sn > 0.7) {
                        terrain = TERRAIN.THICK_SPICE;
                        this.spiceAmount[y][x] = randomInt(300, 500);
                    } else if (sn > 0.55) {
                        terrain = TERRAIN.SPICE;
                        this.spiceAmount[y][x] = randomInt(100, 300);
                    } else {
                        this.spiceAmount[y][x] = 0;
                    }
                } else {
                    this.spiceAmount[y][x] = 0;
                }

                this.tiles[y][x] = terrain;
                this.occupied[y][x] = null;
                this.buildReserved[y][x] = null;
                this.fogOfWar[y][x] = false;
                this.explored[y][x] = false;
            }
        }

        // Player starting plateau (rock - safe from worms)
        this.placeRockPlateau(5, 5, 10, 10);
        // Enemy starting plateau
        this.placeRockPlateau(MAP_WIDTH - 15, MAP_HEIGHT - 15, 10, 10);

        // Expansion plateaus near player base
        this.placeRockPlateau(18, 5, 7, 6);
        this.placeRockPlateau(5, 18, 6, 7);
        this.placeRockPlateau(20, 18, 7, 6);

        // Expansion plateaus near enemy base
        this.placeRockPlateau(MAP_WIDTH - 25, MAP_HEIGHT - 11, 7, 6);
        this.placeRockPlateau(MAP_WIDTH - 11, MAP_HEIGHT - 25, 6, 7);
        this.placeRockPlateau(MAP_WIDTH - 27, MAP_HEIGHT - 24, 7, 6);

        // Mid-map contested plateaus
        this.placeRockPlateau(55, 55, 8, 8); // central plateau
        this.placeRockPlateau(40, 30, 6, 6);
        this.placeRockPlateau(30, 45, 6, 6);
        this.placeRockPlateau(MAP_WIDTH - 40, 35, 6, 6);
        this.placeRockPlateau(35, MAP_HEIGHT - 40, 6, 6);

        // Outlying expansion plateaus
        this.placeRockPlateau(70, 15, 6, 5);
        this.placeRockPlateau(15, 70, 5, 6);
        this.placeRockPlateau(MAP_WIDTH - 20, 50, 6, 5);
        this.placeRockPlateau(50, MAP_HEIGHT - 20, 5, 6);
        this.placeRockPlateau(85, 85, 6, 6);

        // Spice fields near player base
        this.placeSpiceField(22, 8, 5);
        this.placeSpiceField(10, 22, 5);
        this.placeSpiceField(30, 14, 4);

        // Spice fields near enemy base
        this.placeSpiceField(MAP_WIDTH - 23, MAP_HEIGHT - 9, 5);
        this.placeSpiceField(MAP_WIDTH - 11, MAP_HEIGHT - 23, 5);
        this.placeSpiceField(MAP_WIDTH - 31, MAP_HEIGHT - 15, 4);

        // Mid-map contested spice (rich fields worth fighting over)
        this.placeSpiceField(50, 40, 5);
        this.placeSpiceField(40, 55, 5);
        this.placeSpiceField(65, 65, 6);
        this.placeSpiceField(75, 45, 4);
        this.placeSpiceField(45, 80, 4);

        // Distant spice fields
        this.placeSpiceField(85, 20, 5);
        this.placeSpiceField(20, 90, 5);
        this.placeSpiceField(95, 70, 4);
        this.placeSpiceField(70, 100, 4);
        this.placeSpiceField(100, 100, 5);
    }

    placeSpiceField(cx, cy, radius) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (!isInBounds(nx, ny)) continue;
                if (dx * dx + dy * dy > radius * radius) continue;
                if (this.tiles[ny][nx] === TERRAIN.MOUNTAIN) continue;
                if (this.occupied[ny][nx]) continue;
                const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                if (distFromCenter < radius * 0.5) {
                    this.tiles[ny][nx] = TERRAIN.THICK_SPICE;
                    this.spiceAmount[ny][nx] = randomInt(300, 500);
                } else {
                    this.tiles[ny][nx] = TERRAIN.SPICE;
                    this.spiceAmount[ny][nx] = randomInt(100, 300);
                }
            }
        }
    }

    clearArea(sx, sy, w, h) {
        for (let y = sy; y < sy + h && y < MAP_HEIGHT; y++) {
            for (let x = sx; x < sx + w && x < MAP_WIDTH; x++) {
                if (isInBounds(x, y)) {
                    if (this.tiles[y][x] !== TERRAIN.SAND) {
                        this.tiles[y][x] = TERRAIN.SAND;
                        this._invalidateTerrainCache(x, y);
                    } else {
                        this.tiles[y][x] = TERRAIN.SAND;
                    }
                    this.spiceAmount[y][x] = 0;
                }
            }
        }
    }

    placeRockPlateau(sx, sy, w, h) {
        for (let y = sy; y < sy + h && y < MAP_HEIGHT; y++) {
            for (let x = sx; x < sx + w && x < MAP_WIDTH; x++) {
                if (isInBounds(x, y)) {
                    this.tiles[y][x] = TERRAIN.ROCK;
                    this.spiceAmount[y][x] = 0;
                }
            }
        }
    }

    isRock(tx, ty) {
        if (!isInBounds(tx, ty)) return false;
        const t = this.tiles[ty][tx];
        return t === TERRAIN.ROCK || t === TERRAIN.MOUNTAIN || t === TERRAIN.CONCRETE;
    }

    isPassable(tx, ty) {
        if (!isInBounds(tx, ty)) return false;
        if (this.tiles[ty][tx] === TERRAIN.MOUNTAIN) return false;
        if (this.occupied[ty][tx]) return false;
        return true;
    }

    isBuildable(tx, ty) {
        if (!isInBounds(tx, ty)) return false;
        const t = this.tiles[ty][tx];
        if (t === TERRAIN.MOUNTAIN) return false;
        if (this.occupied[ty][tx]) return false;
        if (this.buildReserved[ty][tx]) return false; // clearance zone — no building allowed
        return t === TERRAIN.ROCK || t === TERRAIN.CONCRETE;
    }

    canBuildAt(tx, ty, w, h) {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                if (!this.isBuildable(tx + dx, ty + dy)) return false;
            }
        }
        return true;
    }

    setOccupied(tx, ty, w, h, entityId) {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                if (isInBounds(tx + dx, ty + dy)) {
                    this.occupied[ty + dy][tx + dx] = entityId;
                }
            }
        }
    }

    clearOccupied(tx, ty, w, h) {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                if (isInBounds(tx + dx, ty + dy)) {
                    this.occupied[ty + dy][tx + dx] = null;
                }
            }
        }
    }

    // Set building clearance zone — row below the building becomes concrete pavement
    // that units can walk on but other buildings cannot be placed on
    setBuildingClearance(tx, ty, w, h, entityId) {
        const clearY = ty + h; // row below the building
        for (let dx = 0; dx < w; dx++) {
            const cx = tx + dx;
            if (isInBounds(cx, clearY)) {
                this.buildReserved[clearY][cx] = entityId;
                // Convert terrain to concrete so it's visually distinct and passable
                if (this.tiles[clearY][cx] !== TERRAIN.ROCK && this.tiles[clearY][cx] !== TERRAIN.CONCRETE) {
                    this.tiles[clearY][cx] = TERRAIN.CONCRETE;
                    this.spiceAmount[clearY][cx] = 0;
                    this._invalidateTerrainCache(cx, clearY);
                }
            }
        }
    }

    // Clear building clearance zone when a building is sold or destroyed
    clearBuildingClearance(entityId) {
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (this.buildReserved[y][x] === entityId) {
                    this.buildReserved[y][x] = null;
                }
            }
        }
    }

    revealArea(tx, ty, radius, owner) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = tx + dx;
                const ny = ty + dy;
                if (isInBounds(nx, ny) && dx * dx + dy * dy <= radius * radius) {
                    if (owner === 'player') {
                        this.fogOfWar[ny][nx] = true;
                        this.explored[ny][nx] = true;
                    }
                }
            }
        }
    }

    harvestSpice(tx, ty, amount) {
        if (!isInBounds(tx, ty)) return 0;
        const oldTerrain = this.tiles[ty][tx];
        const available = Math.min(this.spiceAmount[ty][tx], amount);
        this.spiceAmount[ty][tx] -= available;
        if (this.spiceAmount[ty][tx] <= 0) {
            this.spiceAmount[ty][tx] = 0;
            if (this.tiles[ty][tx] === TERRAIN.SPICE || this.tiles[ty][tx] === TERRAIN.THICK_SPICE) {
                this.tiles[ty][tx] = TERRAIN.SAND;
            }
        } else if (this.spiceAmount[ty][tx] < 150 && this.tiles[ty][tx] === TERRAIN.THICK_SPICE) {
            this.tiles[ty][tx] = TERRAIN.SPICE;
        }
        // Invalidate terrain cache if tile type changed
        if (this.tiles[ty][tx] !== oldTerrain) {
            this._invalidateTerrainCache(tx, ty);
        }
        return available;
    }

    findNearestSpice(tx, ty) {
        // Spiral outward search - finds nearest quickly without scanning entire map
        for (let r = 1; r < Math.max(MAP_WIDTH, MAP_HEIGHT); r++) {
            let best = null;
            let bestDist = Infinity;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only check ring edge
                    const nx = tx + dx;
                    const ny = ty + dy;
                    if (isInBounds(nx, ny) && this.spiceAmount[ny][nx] > 0) {
                        const d = distance(tx, ty, nx, ny);
                        if (d < bestDist) {
                            bestDist = d;
                            best = { tx: nx, ty: ny };
                        }
                    }
                }
            }
            if (best) return best;
        }
        return null;
    }

    _generateTerrainCache() {
        const cacheW = MAP_WIDTH * TILE_SIZE;
        const cacheH = MAP_HEIGHT * TILE_SIZE;
        if (!this._terrainCanvas) {
            this._terrainCanvas = document.createElement('canvas');
            this._terrainCanvas.width = cacheW;
            this._terrainCanvas.height = cacheH;
        }
        const tc = this._terrainCanvas.getContext('2d', { willReadFrequently: true });

        // Helper: parse hex color to RGB
        const hexToRgb = (hex) => {
            const v = parseInt(hex.slice(1), 16);
            return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
        };

        // Pre-parse terrain colors
        const terrainRgb = {};
        for (const key in TERRAIN_COLORS) {
            terrainRgb[key] = hexToRgb(TERRAIN_COLORS[key]);
        }

        // Use ImageData for pixel-level rendering (much faster than fillRect per pixel)
        const imgData = tc.createImageData(cacheW, cacheH);
        const pixels = imgData.data;

        for (let ty = 0; ty < MAP_HEIGHT; ty++) {
            for (let tx = 0; tx < MAP_WIDTH; tx++) {
                const terrain = this.tiles[ty][tx];
                const baseRgb = terrainRgb[terrain];

                for (let py = 0; py < TILE_SIZE; py++) {
                    for (let px = 0; px < TILE_SIZE; px++) {
                        const worldPx = tx * TILE_SIZE + px;
                        const worldPy = ty * TILE_SIZE + py;

                        // Start with base color
                        let r = baseRgb[0], g = baseRgb[1], b = baseRgb[2];

                        // Subtle pixel grain - very light so it doesn't overwhelm
                        const grain = (simpleNoise(worldPx, worldPy, 777) - 0.5) * 6;
                        r += grain; g += grain; b += grain;

                        // Terrain-specific detail
                        if (terrain === TERRAIN.SAND) {
                            // Gentle, large-scale sand color variation (like natural desert)
                            const largeNoise = smoothNoise(worldPx, worldPy, 100, 20);
                            const sandVar = (largeNoise - 0.5) * 10;
                            r += sandVar; g += sandVar * 0.9; b += sandVar * 0.6;
                            // Very subtle wind ripples - barely visible, large wavelength
                            const ripple = Math.sin(worldPx * 0.08 + worldPy * 0.04 + largeNoise * 6) * 3;
                            r += ripple; g += ripple * 0.9; b += ripple * 0.5;
                        } else if (terrain === TERRAIN.DUNES) {
                            // Smooth dune shading - gentle undulating brightness
                            const duneNoise = smoothNoise(worldPx, worldPy, 50, 24);
                            const duneShade = (duneNoise - 0.5) * 14;
                            r += duneShade; g += duneShade * 0.9; b += duneShade * 0.5;
                            // Soft directional shading (sun from upper-left)
                            const sunShade = smoothNoise(worldPx, worldPy, 55, 16);
                            r += (sunShade - 0.5) * 8; g += (sunShade - 0.5) * 6;
                        } else if (terrain === TERRAIN.ROCK) {
                            // Smooth rocky surface with gentle variation
                            const rockNoise = smoothNoise(worldPx, worldPy, 600, 10);
                            const rockDetail = (rockNoise - 0.5) * 12;
                            r += rockDetail; g += rockDetail; b += rockDetail;
                            // Subtle darker patches (not grid lines)
                            const rockPatch = smoothNoise(worldPx, worldPy, 650, 6);
                            if (rockPatch < 0.3) {
                                r -= 6; g -= 5; b -= 4;
                            }
                            // Very sparse, faint cracks
                            const crack = Math.abs(Math.sin(worldPx * 0.4 + smoothNoise(worldPx, worldPy, 444, 14) * 20));
                            if (crack < 0.015) {
                                r -= 10; g -= 9; b -= 7;
                            }
                        } else if (terrain === TERRAIN.MOUNTAIN) {
                            // Rocky mountain texture
                            const mtNoise = smoothNoise(worldPx, worldPy, 800, 6);
                            const mtDetail = (mtNoise - 0.5) * 18;
                            r += mtDetail; g += mtDetail; b += mtDetail;
                            // A few fissures
                            const fissure = Math.abs(Math.sin(worldPx * 0.5 + worldPy * 0.3 + smoothNoise(tx, ty, 900, 8) * 20));
                            if (fissure < 0.03) { r -= 15; g -= 14; b -= 10; }
                            // Elevation shading (top-left light)
                            const elevGrad = (px + py) / (TILE_SIZE * 2);
                            r -= elevGrad * 10; g -= elevGrad * 8; b -= elevGrad * 6;
                        } else if (terrain === TERRAIN.SPICE) {
                            // Spice: warm granular texture
                            const spiceNoise = smoothNoise(worldPx, worldPy, 1100, 8);
                            r += (spiceNoise - 0.5) * 14;
                            g += (spiceNoise - 0.5) * 7;
                            // Scattered bright granules
                            if (simpleNoise(worldPx, worldPy, 1150) > 0.92) {
                                r += 18; g += 8; b -= 5;
                            }
                        } else if (terrain === TERRAIN.THICK_SPICE) {
                            // Thick spice: richer, denser orange
                            const tNoise = smoothNoise(worldPx, worldPy, 1300, 6);
                            r += (tNoise - 0.5) * 18;
                            g += (tNoise - 0.5) * 9;
                            // Dense bright granules
                            if (simpleNoise(worldPx, worldPy, 1350) > 0.85) {
                                r += 22; g += 10; b -= 5;
                            }
                            // Darker veins
                            const vein = smoothNoise(worldPx, worldPy, 1400, 5);
                            if (vein < 0.25) {
                                r -= 10; g -= 8; b -= 3;
                            }
                        } else if (terrain === TERRAIN.CONCRETE) {
                            // Concrete: grid lines and surface wear
                            const edgeDist = Math.min(px, py, TILE_SIZE - 1 - px, TILE_SIZE - 1 - py);
                            if (edgeDist === 0) {
                                r -= 15; g -= 15; b -= 15;
                            }
                            const wear = simpleNoise(worldPx, worldPy, 1500);
                            r += (wear - 0.5) * 8; g += (wear - 0.5) * 8; b += (wear - 0.5) * 8;
                        }

                        // Clamp
                        r = r < 0 ? 0 : r > 255 ? 255 : r;
                        g = g < 0 ? 0 : g > 255 ? 255 : g;
                        b = b < 0 ? 0 : b > 255 ? 255 : b;

                        const idx = (worldPy * cacheW + worldPx) * 4;
                        pixels[idx] = r;
                        pixels[idx + 1] = g;
                        pixels[idx + 2] = b;
                        pixels[idx + 3] = 255;
                    }
                }
            }
        }

        // Terrain edge blending pass: dither borders between different terrain types
        // Work on a copy so we read original values while writing blended ones
        const blended = new Uint8ClampedArray(pixels);
        const blendRadius = 18; // pixels into each tile to blend (wider = smoother transitions)

        for (let ty = 0; ty < MAP_HEIGHT; ty++) {
            for (let tx = 0; tx < MAP_WIDTH; tx++) {
                const terrain = this.tiles[ty][tx];

                // Check all 8 neighbors for different terrain (including diagonals)
                const neighbors = [
                    { dx: 1, dy: 0 },
                    { dx: -1, dy: 0 },
                    { dx: 0, dy: 1 },
                    { dx: 0, dy: -1 },
                    { dx: 1, dy: 1 },
                    { dx: -1, dy: 1 },
                    { dx: 1, dy: -1 },
                    { dx: -1, dy: -1 }
                ];

                // Collect which neighbors are different
                const diffNeighbors = [];
                for (const nb of neighbors) {
                    const ntx = tx + nb.dx;
                    const nty = ty + nb.dy;
                    if (!isInBounds(ntx, nty)) continue;
                    if (this.tiles[nty][ntx] !== terrain) {
                        diffNeighbors.push(nb);
                    }
                }
                if (diffNeighbors.length === 0) continue;

                for (let py = 0; py < TILE_SIZE; py++) {
                    for (let px = 0; px < TILE_SIZE; px++) {
                        const worldPx2 = tx * TILE_SIZE + px;
                        const worldPy2 = ty * TILE_SIZE + py;

                        // Find the closest different-terrain neighbor and blend toward it
                        let bestFactor = 0;
                        let bestNbIdx = -1;

                        for (const nb of diffNeighbors) {
                            // Distance from this pixel to the edge toward this neighbor
                            let edgeDist;
                            if (nb.dx === 1 && nb.dy === 0) edgeDist = TILE_SIZE - 1 - px;
                            else if (nb.dx === -1 && nb.dy === 0) edgeDist = px;
                            else if (nb.dx === 0 && nb.dy === 1) edgeDist = TILE_SIZE - 1 - py;
                            else if (nb.dx === 0 && nb.dy === -1) edgeDist = py;
                            else {
                                // Diagonal: use the closer of the two axis distances
                                const dx2 = nb.dx === 1 ? TILE_SIZE - 1 - px : px;
                                const dy2 = nb.dy === 1 ? TILE_SIZE - 1 - py : py;
                                edgeDist = Math.max(dx2, dy2);
                            }

                            if (edgeDist >= blendRadius) continue;

                            // Smooth hermite interpolation instead of linear
                            const t = 1.0 - (edgeDist / blendRadius);
                            const smooth = t * t * t * (t * (t * 6 - 15) + 10); // smoother quintic interpolation
                            // Add noise-based dithering for natural look
                            const dither = (simpleNoise(worldPx2, worldPy2, 9999 + nb.dx * 7 + nb.dy * 13) - 0.5) * 0.25;
                            const factor = clamp(smooth * 0.65 + dither * smooth, 0, 0.7);

                            if (factor > bestFactor) {
                                bestFactor = factor;
                                // Sample the corresponding pixel from neighbor tile
                                const ntx = tx + nb.dx;
                                const nty = ty + nb.dy;
                                let npx2 = ntx * TILE_SIZE + px;
                                let npy2 = nty * TILE_SIZE + py;
                                npx2 = clamp(npx2, 0, cacheW - 1);
                                npy2 = clamp(npy2, 0, cacheH - 1);
                                bestNbIdx = (npy2 * cacheW + npx2) * 4;
                            }
                        }

                        if (bestFactor > 0 && bestNbIdx >= 0) {
                            const myIdx = (worldPy2 * cacheW + worldPx2) * 4;
                            blended[myIdx] = pixels[myIdx] * (1 - bestFactor) + pixels[bestNbIdx] * bestFactor;
                            blended[myIdx + 1] = pixels[myIdx + 1] * (1 - bestFactor) + pixels[bestNbIdx + 1] * bestFactor;
                            blended[myIdx + 2] = pixels[myIdx + 2] * (1 - bestFactor) + pixels[bestNbIdx + 2] * bestFactor;
                        }
                    }
                }
            }
        }

        imgData.data.set(blended);
        tc.putImageData(imgData, 0, 0);
    }

    _updateDirtyTiles() {
        if (this._dirtyTiles.size === 0) return;

        const cacheW = MAP_WIDTH * TILE_SIZE;
        const tc = this._terrainCanvas.getContext('2d', { willReadFrequently: true });

        // Helper: parse hex color to RGB
        const hexToRgb = (hex) => {
            const v = parseInt(hex.slice(1), 16);
            return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
        };
        const terrainRgb = {};
        for (const key in TERRAIN_COLORS) {
            terrainRgb[key] = hexToRgb(TERRAIN_COLORS[key]);
        }

        // Compute the bounding box of all dirty tiles (expanded by 1 for blend neighbors)
        let minTX = MAP_WIDTH, minTY = MAP_HEIGHT, maxTX = 0, maxTY = 0;
        for (const key of this._dirtyTiles) {
            const dty = (key / MAP_WIDTH) | 0;
            const dtx = key % MAP_WIDTH;
            if (dtx < minTX) minTX = dtx;
            if (dtx > maxTX) maxTX = dtx;
            if (dty < minTY) minTY = dty;
            if (dty > maxTY) maxTY = dty;
        }
        // Expand by 1 more tile for blend radius overlap
        minTX = Math.max(0, minTX - 1);
        minTY = Math.max(0, minTY - 1);
        maxTX = Math.min(MAP_WIDTH - 1, maxTX + 1);
        maxTY = Math.min(MAP_HEIGHT - 1, maxTY + 1);

        const regionPxX = minTX * TILE_SIZE;
        const regionPxY = minTY * TILE_SIZE;
        const regionW = (maxTX - minTX + 1) * TILE_SIZE;
        const regionH = (maxTY - minTY + 1) * TILE_SIZE;

        const imgData = tc.createImageData(regionW, regionH);
        const pixels = imgData.data;

        // First pass: render base terrain + detail for the affected region
        for (let ty = minTY; ty <= maxTY; ty++) {
            for (let tx = minTX; tx <= maxTX; tx++) {
                const terrain = this.tiles[ty][tx];
                const baseRgb = terrainRgb[terrain];

                for (let py = 0; py < TILE_SIZE; py++) {
                    for (let px = 0; px < TILE_SIZE; px++) {
                        const worldPx = tx * TILE_SIZE + px;
                        const worldPy = ty * TILE_SIZE + py;

                        let r = baseRgb[0], g = baseRgb[1], b = baseRgb[2];

                        const grain = (simpleNoise(worldPx, worldPy, 777) - 0.5) * 6;
                        r += grain; g += grain; b += grain;

                        if (terrain === TERRAIN.SAND) {
                            const largeNoise = smoothNoise(worldPx, worldPy, 100, 20);
                            const sandVar = (largeNoise - 0.5) * 10;
                            r += sandVar; g += sandVar * 0.9; b += sandVar * 0.6;
                            const ripple = Math.sin(worldPx * 0.08 + worldPy * 0.04 + largeNoise * 6) * 3;
                            r += ripple; g += ripple * 0.9; b += ripple * 0.5;
                        } else if (terrain === TERRAIN.DUNES) {
                            const duneNoise = smoothNoise(worldPx, worldPy, 50, 24);
                            const duneShade = (duneNoise - 0.5) * 14;
                            r += duneShade; g += duneShade * 0.9; b += duneShade * 0.5;
                            const sunShade = smoothNoise(worldPx, worldPy, 55, 16);
                            r += (sunShade - 0.5) * 8; g += (sunShade - 0.5) * 6;
                        } else if (terrain === TERRAIN.ROCK) {
                            const rockNoise = smoothNoise(worldPx, worldPy, 600, 10);
                            const rockDetail = (rockNoise - 0.5) * 12;
                            r += rockDetail; g += rockDetail; b += rockDetail;
                            const rockPatch = smoothNoise(worldPx, worldPy, 650, 6);
                            if (rockPatch < 0.3) { r -= 6; g -= 5; b -= 4; }
                            const crack = Math.abs(Math.sin(worldPx * 0.4 + smoothNoise(worldPx, worldPy, 444, 14) * 20));
                            if (crack < 0.015) { r -= 10; g -= 9; b -= 7; }
                        } else if (terrain === TERRAIN.MOUNTAIN) {
                            const mtNoise = smoothNoise(worldPx, worldPy, 800, 6);
                            const mtDetail = (mtNoise - 0.5) * 18;
                            r += mtDetail; g += mtDetail; b += mtDetail;
                            const fissure = Math.abs(Math.sin(worldPx * 0.5 + worldPy * 0.3 + smoothNoise(tx, ty, 900, 8) * 20));
                            if (fissure < 0.03) { r -= 15; g -= 14; b -= 10; }
                            const elevGrad = (px + py) / (TILE_SIZE * 2);
                            r -= elevGrad * 10; g -= elevGrad * 8; b -= elevGrad * 6;
                        } else if (terrain === TERRAIN.SPICE) {
                            const spiceNoise = smoothNoise(worldPx, worldPy, 1100, 8);
                            r += (spiceNoise - 0.5) * 14;
                            g += (spiceNoise - 0.5) * 7;
                            if (simpleNoise(worldPx, worldPy, 1150) > 0.92) { r += 18; g += 8; b -= 5; }
                        } else if (terrain === TERRAIN.THICK_SPICE) {
                            const tNoise = smoothNoise(worldPx, worldPy, 1300, 6);
                            r += (tNoise - 0.5) * 18;
                            g += (tNoise - 0.5) * 9;
                            if (simpleNoise(worldPx, worldPy, 1350) > 0.85) { r += 22; g += 10; b -= 5; }
                            const vein = smoothNoise(worldPx, worldPy, 1400, 5);
                            if (vein < 0.25) { r -= 10; g -= 8; b -= 3; }
                        } else if (terrain === TERRAIN.CONCRETE) {
                            const edgeDist = Math.min(px, py, TILE_SIZE - 1 - px, TILE_SIZE - 1 - py);
                            if (edgeDist === 0) { r -= 15; g -= 15; b -= 15; }
                            const wear = simpleNoise(worldPx, worldPy, 1500);
                            r += (wear - 0.5) * 8; g += (wear - 0.5) * 8; b += (wear - 0.5) * 8;
                        }

                        r = r < 0 ? 0 : r > 255 ? 255 : r;
                        g = g < 0 ? 0 : g > 255 ? 255 : g;
                        b = b < 0 ? 0 : b > 255 ? 255 : b;

                        // Local region coordinates
                        const localX = worldPx - regionPxX;
                        const localY = worldPy - regionPxY;
                        const idx = (localY * regionW + localX) * 4;
                        pixels[idx] = r;
                        pixels[idx + 1] = g;
                        pixels[idx + 2] = b;
                        pixels[idx + 3] = 255;
                    }
                }
            }
        }

        // Blending pass for the dirty region
        const blended = new Uint8ClampedArray(pixels);
        const blendRadius = 18;

        for (let ty = minTY; ty <= maxTY; ty++) {
            for (let tx = minTX; tx <= maxTX; tx++) {
                const terrain = this.tiles[ty][tx];

                const neighbors = [
                    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
                    { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
                    { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
                ];

                const diffNeighbors = [];
                for (const nb of neighbors) {
                    const ntx = tx + nb.dx;
                    const nty = ty + nb.dy;
                    if (!isInBounds(ntx, nty)) continue;
                    if (this.tiles[nty][ntx] !== terrain) {
                        diffNeighbors.push(nb);
                    }
                }
                if (diffNeighbors.length === 0) continue;

                for (let py = 0; py < TILE_SIZE; py++) {
                    for (let px = 0; px < TILE_SIZE; px++) {
                        const worldPx2 = tx * TILE_SIZE + px;
                        const worldPy2 = ty * TILE_SIZE + py;

                        let bestFactor = 0;
                        let bestNbLocalIdx = -1;

                        for (const nb of diffNeighbors) {
                            let edgeDist;
                            if (nb.dx === 1 && nb.dy === 0) edgeDist = TILE_SIZE - 1 - px;
                            else if (nb.dx === -1 && nb.dy === 0) edgeDist = px;
                            else if (nb.dx === 0 && nb.dy === 1) edgeDist = TILE_SIZE - 1 - py;
                            else if (nb.dx === 0 && nb.dy === -1) edgeDist = py;
                            else {
                                const dx2 = nb.dx === 1 ? TILE_SIZE - 1 - px : px;
                                const dy2 = nb.dy === 1 ? TILE_SIZE - 1 - py : py;
                                edgeDist = Math.max(dx2, dy2);
                            }

                            if (edgeDist >= blendRadius) continue;

                            const t = 1.0 - (edgeDist / blendRadius);
                            const smooth = t * t * t * (t * (t * 6 - 15) + 10); // quintic
                            const dither = (simpleNoise(worldPx2, worldPy2, 9999 + nb.dx * 7 + nb.dy * 13) - 0.5) * 0.25;
                            const factor = clamp(smooth * 0.65 + dither * smooth, 0, 0.7);

                            if (factor > bestFactor) {
                                bestFactor = factor;
                                const ntx = tx + nb.dx;
                                const nty = ty + nb.dy;
                                // Neighbor pixel - may be inside or outside our local region
                                let npx2 = ntx * TILE_SIZE + px;
                                let npy2 = nty * TILE_SIZE + py;
                                npx2 = clamp(npx2, 0, MAP_WIDTH * TILE_SIZE - 1);
                                npy2 = clamp(npy2, 0, MAP_HEIGHT * TILE_SIZE - 1);
                                const nlx = npx2 - regionPxX;
                                const nly = npy2 - regionPxY;
                                // Only blend if neighbor is within our local region
                                if (nlx >= 0 && nlx < regionW && nly >= 0 && nly < regionH) {
                                    bestNbLocalIdx = (nly * regionW + nlx) * 4;
                                }
                            }
                        }

                        if (bestFactor > 0 && bestNbLocalIdx >= 0) {
                            const localX = worldPx2 - regionPxX;
                            const localY = worldPy2 - regionPxY;
                            const myIdx = (localY * regionW + localX) * 4;
                            blended[myIdx] = pixels[myIdx] * (1 - bestFactor) + pixels[bestNbLocalIdx] * bestFactor;
                            blended[myIdx + 1] = pixels[myIdx + 1] * (1 - bestFactor) + pixels[bestNbLocalIdx + 1] * bestFactor;
                            blended[myIdx + 2] = pixels[myIdx + 2] * (1 - bestFactor) + pixels[bestNbLocalIdx + 2] * bestFactor;
                        }
                    }
                }
            }
        }

        // Write blended data back to the local ImageData and put it onto the cache canvas
        imgData.data.set(blended);
        tc.putImageData(imgData, regionPxX, regionPxY);

        this._dirtyTiles.clear();
    }

    _invalidateTerrainCache(tx, ty) {
        // Add this tile and its 8 neighbors to the dirty set (3x3 region for blend radius)
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ntx = tx + dx;
                const nty = ty + dy;
                if (isInBounds(ntx, nty)) {
                    this._dirtyTiles.add(nty * MAP_WIDTH + ntx);
                }
            }
        }
    }

    render(ctx, camera) {
        // Generate terrain cache on first load, then only update dirty tiles
        if (!this._terrainCanvas || this._terrainCacheDirty) {
            this._generateTerrainCache();
            this._terrainCacheDirty = false;
            this._dirtyTiles.clear();
        } else if (this._dirtyTiles.size > 0) {
            this._updateDirtyTiles();
        }

        const startTX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
        const startTY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
        const endTX = Math.min(MAP_WIDTH, Math.ceil((camera.x + camera.width) / TILE_SIZE));
        const endTY = Math.min(MAP_HEIGHT, Math.ceil((camera.y + camera.height) / TILE_SIZE));

        // Draw cached terrain for visible area in one drawImage call
        const srcX = startTX * TILE_SIZE;
        const srcY = startTY * TILE_SIZE;
        const srcW = (endTX - startTX) * TILE_SIZE;
        const srcH = (endTY - startTY) * TILE_SIZE;
        const destX = (startTX * TILE_SIZE - camera.x) | 0;
        const destY = (startTY * TILE_SIZE - camera.y) | 0;

        // First fill unexplored black, then draw cached terrain, then overlay dynamics
        // Draw the cached terrain for explored tiles
        ctx.drawImage(this._terrainCanvas, srcX, srcY, srcW, srcH, destX, destY, srcW, srcH);

        // Now overlay dynamic elements per tile
        const now = Date.now();
        for (let ty = startTY; ty < endTY; ty++) {
            for (let tx = startTX; tx < endTX; tx++) {
                const screenX = tx * TILE_SIZE - camera.x;
                const screenY = ty * TILE_SIZE - camera.y;

                // Unexplored: solid black
                if (!this.explored[ty][tx]) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                    continue;
                }

                const terrain = this.tiles[ty][tx];

                // Animated spice shimmer with crystal sparkle
                if (terrain === TERRAIN.SPICE || terrain === TERRAIN.THICK_SPICE) {
                    const shimmerBase = Math.sin(now / 500 + tx * 3 + ty * 7) * 0.08;
                    const shimmer2 = Math.sin(now / 300 + tx * 11 + ty * 5) * 0.04;
                    const alpha = 0.08 + shimmerBase + shimmer2;
                    if (terrain === TERRAIN.THICK_SPICE) {
                        ctx.fillStyle = `rgba(255, 180, 0, ${clamp(alpha + 0.05, 0, 0.3)})`;
                    } else {
                        ctx.fillStyle = `rgba(255, 210, 50, ${clamp(alpha, 0, 0.25)})`;
                    }
                    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

                    // Sparkling crystal highlights (a few pixels that flash)
                    const sparkCount = terrain === TERRAIN.THICK_SPICE ? 4 : 2;
                    for (let s = 0; s < sparkCount; s++) {
                        const sx2 = simpleNoise(tx, ty, 2000 + s) * TILE_SIZE;
                        const sy2 = simpleNoise(ty, tx, 2100 + s) * TILE_SIZE;
                        const sparkPhase = Math.sin(now / 200 + s * 2.5 + tx * 5 + ty * 3);
                        if (sparkPhase > 0.7) {
                            const sparkAlpha = (sparkPhase - 0.7) / 0.3;
                            ctx.fillStyle = `rgba(255, 255, 200, ${sparkAlpha * 0.8})`;
                            ctx.fillRect(screenX + sx2 - 1, screenY + sy2 - 1, 2, 2);
                        }
                    }
                }

                // Fog of war: explored but not currently visible
                if (!this.fogOfWar[ty][tx]) {
                    // Count visible neighbors to determine fog edge opacity
                    let visibleCount = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const ntx = tx + dx;
                            const nty = ty + dy;
                            if (isInBounds(ntx, nty) && this.fogOfWar[nty][ntx]) {
                                visibleCount++;
                            }
                        }
                    }

                    if (visibleCount > 0) {
                        // Edge tile: use semi-transparent overlay based on neighbor count
                        // More visible neighbors = lighter fog (closer to visible area)
                        // visibleCount ranges from 1-8, map to alpha 0.45 down to 0.15
                        const alpha = 0.5 - visibleCount * 0.045;
                        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                    } else {
                        // Interior fog tile: solid dark overlay
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    renderMinimap(ctx, camera, entities) {
        const scaleX = MINIMAP_WIDTH / MAP_WIDTH;
        const scaleY = MINIMAP_HEIGHT / MAP_HEIGHT;

        // Draw terrain
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (!this.explored[y][x]) {
                    // Completely black - never seen
                    ctx.fillStyle = '#000000';
                } else if (!this.fogOfWar[y][x]) {
                    // Explored but not currently visible - dark tint
                    const baseColor = TERRAIN_COLORS[this.tiles[y][x]];
                    ctx.fillStyle = '#111108';
                } else {
                    // Currently visible
                    ctx.fillStyle = TERRAIN_COLORS[this.tiles[y][x]];
                }
                ctx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
            }
        }

        // Draw entities on minimap
        for (const entity of entities) {
            // Enemy entities: only show if currently visible (in fog of war)
            if (entity.owner !== 'player') {
                if (!isInBounds(entity.tx, entity.ty)) continue;
                if (!this.fogOfWar[entity.ty][entity.tx]) continue;
            }
            // Player entities: always show on minimap
            const color = entity.owner === 'player'
                ? '#4a8ada'
                : entity.owner === 'fremen' ? '#d4b060'
                : entity.owner === 'sardaukar' ? '#8888aa'
                : entity.owner === 'enemy' ? '#ca4a4a' : '#888';
            ctx.fillStyle = color;
            const size = entity.isBuilding ? Math.max(entity.width, entity.height) * scaleX : 2;
            ctx.fillRect(entity.tx * scaleX, entity.ty * scaleY, Math.ceil(size), Math.ceil(size));
        }

        // Draw camera viewport
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            camera.x / TILE_SIZE * scaleX,
            camera.y / TILE_SIZE * scaleY,
            camera.width / TILE_SIZE * scaleX,
            camera.height / TILE_SIZE * scaleY
        );
    }

    resetFog() {
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                this.fogOfWar[y][x] = false;
            }
        }
    }
}
