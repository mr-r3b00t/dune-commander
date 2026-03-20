// Base entity class
class Entity {
    constructor(tx, ty, owner, type) {
        this.id = generateId();
        this.tx = tx;
        this.ty = ty;
        this.x = tx * TILE_SIZE + TILE_SIZE / 2;
        this.y = ty * TILE_SIZE + TILE_SIZE / 2;
        this.owner = owner;
        this.type = type;
        this.selected = false;
        this.hp = 100;
        this.maxHp = 100;
        this.isBuilding = false;
        this.isUnit = false;
        this.lastAttackTime = 0;
    }

    takeDamage(amount, attackerOwner, game) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            return true; // destroyed
        }

        // Voice alert when player's buildings/units take damage
        if (game && this.owner === 'player') {
            const now = Date.now();
            if (!this._lastDamageVoice || now - this._lastDamageVoice > 8000) {
                this._lastDamageVoice = now;
                if (this.isBuilding) {
                    game.audio.speak('Our base is under attack!', true);
                } else if (this.isUnit && this.hp < this.maxHp * 0.3) {
                    game.audio.speak('Unit under heavy fire!', true);
                }
            }
        }

        // Counter-attack: if this is a unit that's idle or moving (not already fighting),
        // and it has attack capability, fight back
        if (game && this.isUnit && this.attackRange > 0 && attackerOwner) {
            if (this.state === 'idle' || this.state === 'moving') {
                // Find the nearest enemy unit/building owned by the attacker
                const attacker = this._findNearestAttacker(game, attackerOwner);
                if (attacker) {
                    this.target = attacker;
                    this.state = 'attacking';
                }
            }
        }

        return false;
    }

    _findNearestAttacker(game, attackerOwner) {
        let best = null;
        let bestDist = Infinity;
        for (const e of game.entities) {
            if (e.owner !== attackerOwner) continue;
            if (e.hp <= 0) continue;
            const etx = e.isBuilding ? e.tx + Math.floor(e.width / 2) : e.tx;
            const ety = e.isBuilding ? e.ty + Math.floor(e.height / 2) : e.ty;
            const d = tileDistance(this.tx, this.ty, etx, ety);
            if (d < bestDist) {
                bestDist = d;
                best = e;
            }
        }
        return best;
    }

    getHpPercent() {
        return this.hp / this.maxHp;
    }

    renderHealthBar(ctx, screenX, screenY, width) {
        if (this.hp >= this.maxHp) return;
        const barWidth = width;
        const barHeight = 3;
        const bx = screenX - barWidth / 2;
        const by = screenY - (this.isBuilding ? this.height * TILE_SIZE / 2 + 6 : TILE_SIZE / 2 + 6);

        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barWidth, barHeight);

        const pct = this.getHpPercent();
        ctx.fillStyle = pct > 0.5 ? '#0a0' : pct > 0.25 ? '#aa0' : '#a00';
        ctx.fillRect(bx, by, barWidth * pct, barHeight);
    }
}
