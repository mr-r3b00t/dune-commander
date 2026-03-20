// Utility functions
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function tileDistance(tx1, ty1, tx2, ty2) {
    return Math.max(Math.abs(tx2 - tx1), Math.abs(ty2 - ty1));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function worldToTile(x, y) {
    return {
        tx: Math.floor(x / TILE_SIZE),
        ty: Math.floor(y / TILE_SIZE)
    };
}

function tileToWorld(tx, ty) {
    return {
        x: tx * TILE_SIZE + TILE_SIZE / 2,
        y: ty * TILE_SIZE + TILE_SIZE / 2
    };
}

function isInBounds(tx, ty) {
    return tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT;
}

// Simple noise for terrain generation
function simpleNoise(x, y, seed) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
}

function smoothNoise(x, y, seed, scale) {
    const sx = x / scale;
    const sy = y / scale;
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);
    const fx = sx - ix;
    const fy = sy - iy;

    const a = simpleNoise(ix, iy, seed);
    const b = simpleNoise(ix + 1, iy, seed);
    const c = simpleNoise(ix, iy + 1, seed);
    const d = simpleNoise(ix + 1, iy + 1, seed);

    const ab = lerp(a, b, fx);
    const cd = lerp(c, d, fx);
    return lerp(ab, cd, fy);
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}
