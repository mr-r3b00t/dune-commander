// AI opponent
class AIPlayer {
    constructor(game) {
        this.game = game;
        this.lastBuildTime = 0;
        this.lastAttackTime = Date.now(); // start timer from game start
        this.buildInterval = 8000;
        this.attackInterval = 90000; // 90 seconds between attacks
        this.state = 'building'; // building, attacking
        this.buildOrder = [
            'wind_trap', 'refinery', 'barracks', 'wind_trap',
            'light_factory', 'refinery', 'heavy_factory', 'mg_turret', 'turret', 'turret',
            'helipad', 'mg_turret'
        ];
        this.buildIndex = 0;
        // Harkonnen AI gets devastators in their build order
        if (game.enemyHouse === 'harkonnen') {
            this.unitBuildOrder = ['light_infantry', 'light_infantry', 'trike', 'rocket_infantry', 'devastator', 'tank', 'heavy_trooper', 'devastator', 'tank', 'siege_tank', 'rocket_infantry', 'commando', 'ornithopter', 'devastator'];
        } else {
            this.unitBuildOrder = ['light_infantry', 'light_infantry', 'trike', 'rocket_infantry', 'tank', 'heavy_trooper', 'tank', 'siege_tank', 'rocket_infantry', 'commando', 'ornithopter'];
        }
        this.unitBuildIndex = 0;
    }

    update() {
        const now = Date.now();

        // Build structures
        if (now - this.lastBuildTime > this.buildInterval && this.buildIndex < this.buildOrder.length) {
            this.tryBuildStructure();
        }

        // Build units
        this.tryBuildUnits();

        // Attack
        if (now - this.lastAttackTime > this.attackInterval) {
            this.tryAttack();
        }

        // Air strikes — send idle ornithopters with ammo to attack player base
        this.tryAirStrike();

        // Manage harvesters
        this.manageHarvesters();
    }

    tryBuildStructure() {
        if (this.buildIndex >= this.buildOrder.length) return;

        const type = this.buildOrder[this.buildIndex];
        const def = BUILDING_DEFS[type];

        if (this.game.enemyCredits < def.cost) return;

        // Find a place to build near existing buildings
        const enemyBuildings = this.game.entities.filter(e => e.isBuilding && e.owner === 'enemy');
        if (enemyBuildings.length === 0) return;

        const base = enemyBuildings[0];
        let placed = false;

        for (let attempts = 0; attempts < 50; attempts++) {
            const tx = base.tx + randomInt(-8, 8);
            const ty = base.ty + randomInt(-8, 8);

            if (this.game.map.canBuildAt(tx, ty, def.width, def.height)) {
                // Must be within 5 tiles of an existing enemy building boundary
                const nearOwn = enemyBuildings.some(eb => {
                    const gapX = Math.max(0, tx - (eb.tx + eb.width - 1) - 1, eb.tx - (tx + def.width - 1) - 1);
                    const gapY = Math.max(0, ty - (eb.ty + eb.height - 1) - 1, eb.ty - (ty + def.height - 1) - 1);
                    return Math.max(gapX, gapY) <= 5;
                });
                if (!nearOwn) continue;
                const building = new Building(tx, ty, 'enemy', type);
                this.game.addEntity(building);
                this.game.map.setOccupied(tx, ty, def.width, def.height, building.id);
                this.game.map.setBuildingClearance(tx, ty, def.width, def.height, building.id, type);
                this.game.enemyCredits -= def.cost;
                this.buildIndex++;
                this.lastBuildTime = Date.now();
                placed = true;

                // Spawn free unit with building
                if (type === 'refinery') {
                    this.spawnUnit('harvester', building);
                } else if (type === 'helipad') {
                    const ornithopter = this.spawnUnit('ornithopter', building);
                    if (ornithopter) ornithopter.homeHelipad = building;
                }
                break;
            }
        }
    }

    tryBuildUnits() {
        // Find production buildings
        const barracks = this.game.entities.find(e => e.type === 'barracks' && e.owner === 'enemy' && !e.currentBuild);
        const lightFactory = this.game.entities.find(e => e.type === 'light_factory' && e.owner === 'enemy' && !e.currentBuild);
        const heavyFactory = this.game.entities.find(e => e.type === 'heavy_factory' && e.owner === 'enemy' && !e.currentBuild);

        const enemyUnits = this.game.entities.filter(e => e.isUnit && e.owner === 'enemy' && e.type !== 'harvester');
        if (enemyUnits.length >= 20) return;

        let unitType = this.unitBuildOrder[this.unitBuildIndex % this.unitBuildOrder.length];
        const def = UNIT_DEFS[unitType];

        // Unique unit limit for AI too
        if (def.unique) {
            const alreadyHas = this.game.entities.some(e => e.type === unitType && e.owner === 'enemy' && e.hp > 0);
            if (alreadyHas) {
                this.unitBuildIndex++;
                return;
            }
        }

        if (this.game.enemyCredits < def.cost) return;

        let factory = null;
        if (def.buildAt === 'barracks') factory = barracks;
        else if (def.buildAt === 'light_factory') factory = lightFactory;
        else if (def.buildAt === 'heavy_factory') factory = heavyFactory;
        else if (def.buildAt === 'helipad') factory = this.game.entities.find(e => e.type === 'helipad' && e.owner === 'enemy' && !e.currentBuild);

        if (factory) {
            factory.queueUnit(unitType);
            this.game.enemyCredits -= def.cost;
            this.unitBuildIndex++;
        }
    }

    spawnUnit(type, nearBuilding) {
        const spawnPoints = [];
        for (let dy = -1; dy <= nearBuilding.height; dy++) {
            for (let dx = -1; dx <= nearBuilding.width; dx++) {
                if (dy >= 0 && dy < nearBuilding.height && dx >= 0 && dx < nearBuilding.width) continue;
                const sx = nearBuilding.tx + dx;
                const sy = nearBuilding.ty + dy;
                if (this.game.map.isPassable(sx, sy)) {
                    spawnPoints.push({ tx: sx, ty: sy });
                }
            }
        }
        if (spawnPoints.length > 0) {
            const sp = spawnPoints[0];
            const unit = new Unit(sp.tx, sp.ty, 'enemy', type);
            if (type === 'harvester') unit.state = 'harvesting';
            this.game.addEntity(unit);
            return unit;
        }
        return null;
    }

    tryAttack() {
        const combatUnits = this.game.entities.filter(
            e => e.isUnit && e.owner === 'enemy' && e.type !== 'harvester' && e.type !== 'ornithopter' && e.state === 'idle'
        );

        if (combatUnits.length < 5) return;

        // Find player base
        const playerBuildings = this.game.entities.filter(e => e.isBuilding && e.owner === 'player');
        if (playerBuildings.length === 0) return;

        const target = playerBuildings[Math.floor(Math.random() * playerBuildings.length)];
        const targetTX = target.tx + Math.floor(target.width / 2);
        const targetTY = target.ty + Math.floor(target.height / 2);

        for (const unit of combatUnits) {
            unit.target = target;
            unit.state = 'attacking';
            unit.moveTo(targetTX + randomInt(-3, 3), targetTY + randomInt(-3, 3), this.game);
            if (unit.state === 'moving') unit.state = 'attacking';
        }

        this.lastAttackTime = Date.now();
    }

    tryAirStrike() {
        // Find idle ornithopters with ammo
        const ornithopters = this.game.entities.filter(
            e => e.isUnit && e.owner === 'enemy' && e.type === 'ornithopter' &&
                 (e.state === 'idle' || e.state === 'patrolling') &&
                 (e.gunAmmo > 0 || e.missileAmmo > 0)
        );
        if (ornithopters.length === 0) return;

        // Find player buildings and units to attack
        const playerTargets = this.game.entities.filter(e => e.owner === 'player' && e.hp > 0);
        if (playerTargets.length === 0) return;

        // Prioritize: buildings first (turrets, then production, then others)
        const turrets = playerTargets.filter(e => e.type === 'turret' || e.type === 'rocket_turret' || e.type === 'mg_turret');
        const buildings = playerTargets.filter(e => e.isBuilding && e.type !== 'turret' && e.type !== 'rocket_turret');
        const units = playerTargets.filter(e => e.isUnit);

        for (const orni of ornithopters) {
            // Pick a target — prioritize turrets, then buildings, then units
            let target;
            if (turrets.length > 0) {
                target = turrets[Math.floor(Math.random() * turrets.length)];
            } else if (buildings.length > 0) {
                target = buildings[Math.floor(Math.random() * buildings.length)];
            } else if (units.length > 0) {
                target = units[Math.floor(Math.random() * units.length)];
            }
            if (!target) continue;

            // Send ornithopter to attack
            orni.target = target;
            orni.state = 'attacking';
        }
    }

    manageHarvesters() {
        const harvesters = this.game.entities.filter(e => e.type === 'harvester' && e.owner === 'enemy');
        for (const h of harvesters) {
            if (h.state === 'idle') {
                h.state = 'harvesting';
            }
        }
    }
}
