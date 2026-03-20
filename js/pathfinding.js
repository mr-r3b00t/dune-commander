// A* Pathfinding with improved movement
class PathFinder {
    constructor(gameMap) {
        this.map = gameMap;
    }

    findPath(startX, startY, endX, endY, ignoreOccupied = false) {
        if (!isInBounds(endX, endY)) return null;

        // If destination is impassable, find nearest passable tile
        if (!ignoreOccupied && !this.map.isPassable(endX, endY)) {
            const nearest = this.findNearestPassable(endX, endY, startX, startY);
            if (!nearest) return null;
            endX = nearest.x;
            endY = nearest.y;
        }

        // Already there
        if (startX === endX && startY === endY) return [{ x: startX, y: startY }];

        const openSet = new MinHeap();
        const closedSet = new Set();
        const gScore = {};
        const cameFrom = {};

        const startKey = `${startX},${startY}`;

        gScore[startKey] = 0;
        openSet.push({
            x: startX, y: startY,
            f: this.heuristic(startX, startY, endX, endY)
        });

        let iterations = 0;
        const maxIterations = 5000; // Higher limit for large maps

        while (openSet.size > 0 && iterations < maxIterations) {
            iterations++;
            const current = openSet.pop();
            const currentKey = `${current.x},${current.y}`;

            if (current.x === endX && current.y === endY) {
                return this.reconstructPath(cameFrom, current);
            }

            if (closedSet.has(currentKey)) continue;
            closedSet.add(currentKey);

            for (const dir of DIRECTIONS) {
                const nx = current.x + dir.x;
                const ny = current.y + dir.y;
                const neighborKey = `${nx},${ny}`;

                if (closedSet.has(neighborKey)) continue;
                if (!isInBounds(nx, ny)) continue;

                // Mountains are always impassable
                if (this.map.tiles[ny][nx] === TERRAIN.MOUNTAIN) continue;

                // Allow moving to the exact destination even if occupied
                const isEnd = nx === endX && ny === endY;
                if (!isEnd && !ignoreOccupied && this.map.occupied[ny][nx]) continue;

                // Prevent diagonal corner-cutting through blocked tiles
                if (dir.x !== 0 && dir.y !== 0) {
                    const adj1Blocked = this._isBlocked(current.x + dir.x, current.y, ignoreOccupied, endX, endY);
                    const adj2Blocked = this._isBlocked(current.x, current.y + dir.y, ignoreOccupied, endX, endY);
                    if (adj1Blocked || adj2Blocked) continue;
                }

                // Movement cost
                const isDiagonal = dir.x !== 0 && dir.y !== 0;
                const moveCost = isDiagonal ? 1.414 : 1.0;

                // Terrain costs - prefer rock/concrete, avoid dunes
                const terrain = this.map.tiles[ny][nx];
                let terrainCost = 1.0;
                if (terrain === TERRAIN.DUNES) terrainCost = 1.3;
                else if (terrain === TERRAIN.ROCK || terrain === TERRAIN.CONCRETE) terrainCost = 0.8;

                // Slight penalty for passing close to occupied tiles (smoother paths)
                let proximityCost = 0;
                if (!ignoreOccupied) {
                    for (const adjDir of DIRECTIONS) {
                        const ax = nx + adjDir.x;
                        const ay = ny + adjDir.y;
                        if (isInBounds(ax, ay) && this.map.occupied[ay][ax]) {
                            proximityCost += 0.15;
                        }
                    }
                }

                const tentativeG = (gScore[currentKey] || 0) + moveCost * terrainCost + proximityCost;

                if (tentativeG < (gScore[neighborKey] || Infinity)) {
                    cameFrom[neighborKey] = current;
                    gScore[neighborKey] = tentativeG;
                    // Tie-breaking: slight preference for paths closer to straight line
                    const h = this.heuristic(nx, ny, endX, endY);
                    const cross = Math.abs((nx - endX) * (startY - endY) - (startX - endX) * (ny - endY));
                    const f = tentativeG + h + cross * 0.001;
                    openSet.push({ x: nx, y: ny, f: f });
                }
            }
        }

        // If full path not found, find partial path (get as close as possible)
        if (iterations >= maxIterations) {
            return this._bestPartialPath(cameFrom, gScore, closedSet, endX, endY);
        }

        return null; // No path found
    }

    _isBlocked(x, y, ignoreOccupied, endX, endY) {
        if (!isInBounds(x, y)) return true;
        if (this.map.tiles[y][x] === TERRAIN.MOUNTAIN) return true;
        if (!ignoreOccupied && !(x === endX && y === endY) && this.map.occupied[y][x]) return true;
        return false;
    }

    _bestPartialPath(cameFrom, gScore, closedSet, endX, endY) {
        // From all explored nodes, find the one closest to the goal
        let bestKey = null;
        let bestDist = Infinity;
        for (const key of closedSet) {
            const [x, y] = key.split(',').map(Number);
            const d = Math.abs(x - endX) + Math.abs(y - endY);
            if (d < bestDist) {
                bestDist = d;
                bestKey = key;
            }
        }
        if (bestKey) {
            const [bx, by] = bestKey.split(',').map(Number);
            return this.reconstructPath(cameFrom, { x: bx, y: by });
        }
        return null;
    }

    heuristic(x1, y1, x2, y2) {
        // Octile distance - more accurate for 8-directional movement
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    }

    reconstructPath(cameFrom, current) {
        const path = [{ x: current.x, y: current.y }];
        let key = `${current.x},${current.y}`;
        while (cameFrom[key]) {
            current = cameFrom[key];
            path.unshift({ x: current.x, y: current.y });
            key = `${current.x},${current.y}`;
        }
        return path;
    }

    findNearestPassable(tx, ty, fromX, fromY) {
        // Find nearest passable tile, preferring tiles closer to the requester
        let best = null;
        let bestScore = Infinity;
        for (let r = 1; r < 15; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = tx + dx;
                    const ny = ty + dy;
                    if (this.map.isPassable(nx, ny)) {
                        // Score by distance to destination + distance from requester
                        const distToDest = Math.abs(dx) + Math.abs(dy);
                        const distFromStart = fromX !== undefined
                            ? Math.abs(nx - fromX) + Math.abs(ny - fromY)
                            : 0;
                        const score = distToDest + distFromStart * 0.5;
                        if (score < bestScore) {
                            bestScore = score;
                            best = { x: nx, y: ny };
                        }
                    }
                }
            }
            if (best) return best;
        }
        return null;
    }
}

// Min-heap for A*
class MinHeap {
    constructor() {
        this.data = [];
    }

    get size() {
        return this.data.length;
    }

    push(item) {
        this.data.push(item);
        this._bubbleUp(this.data.length - 1);
    }

    pop() {
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (this.data[i].f < this.data[parent].f) {
                [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
            if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
            if (smallest !== i) {
                [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
                i = smallest;
            } else break;
        }
    }
}
