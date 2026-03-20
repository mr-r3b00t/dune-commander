// Game constants
const TILE_SIZE = 32;
const MAP_WIDTH = 64;
const MAP_HEIGHT = 64;
const MINIMAP_WIDTH = 184;
const MINIMAP_HEIGHT = 140;

// Terrain types
const TERRAIN = {
    SAND: 0,
    ROCK: 1,
    DUNES: 2,
    SPICE: 3,
    THICK_SPICE: 4,
    MOUNTAIN: 5,
    CONCRETE: 6
};

// Terrain colors
const TERRAIN_COLORS = {
    [TERRAIN.SAND]: '#c8a850',
    [TERRAIN.ROCK]: '#8a7a5e',
    [TERRAIN.DUNES]: '#d0b058',
    [TERRAIN.SPICE]: '#c49040',
    [TERRAIN.THICK_SPICE]: '#b07030',
    [TERRAIN.MOUNTAIN]: '#5a4a3a',
    [TERRAIN.CONCRETE]: '#888888'
};

// House colors
const HOUSE_COLORS = {
    atreides: { primary: '#2a5a9a', secondary: '#4a8ada', dark: '#1a3a6a', light: '#6aaafa' },
    harkonnen: { primary: '#8a2a2a', secondary: '#ca4a4a', dark: '#5a1a1a', light: '#ea6a6a' },
    ordos: { primary: '#2a7a3a', secondary: '#4aca5a', dark: '#1a5a2a', light: '#6aea7a' },
    fremen: { primary: '#b8953a', secondary: '#d4b060', dark: '#8a6a20', light: '#e8d080' },
    sardaukar: { primary: '#555566', secondary: '#8888aa', dark: '#333344', light: '#aaaacc' }
};

// Building definitions
const BUILDING_DEFS = {
    construction_yard: {
        name: 'Construction Yard',
        icon: '🏗',
        width: 3,
        height: 3,
        cost: 0,
        buildTime: 0,
        hp: 1000,
        power: 0,
        requires: [],
        description: 'Base building. Required for all construction.'
    },
    wind_trap: {
        name: 'Wind Trap',
        icon: '💨',
        width: 2,
        height: 2,
        cost: 300,
        buildTime: 3000,
        hp: 400,
        power: 100,
        requires: ['construction_yard'],
        description: 'Provides power to your base.'
    },
    refinery: {
        name: 'Spice Refinery',
        icon: '⚙',
        width: 3,
        height: 2,
        cost: 400,
        buildTime: 5000,
        hp: 600,
        power: -30,
        requires: ['wind_trap'],
        description: 'Processes spice into credits. Comes with a Harvester.',
        givesUnit: 'harvester'
    },
    silo: {
        name: 'Spice Silo',
        icon: '🏪',
        width: 2,
        height: 2,
        cost: 150,
        buildTime: 2000,
        hp: 300,
        power: -5,
        requires: ['refinery'],
        description: 'Stores extra spice. +500 capacity.',
        storageCapacity: 500
    },
    barracks: {
        name: 'Barracks',
        icon: '⚔',
        width: 2,
        height: 2,
        cost: 400,
        buildTime: 5000,
        hp: 500,
        power: -20,
        requires: ['wind_trap'],
        description: 'Trains infantry units.'
    },
    light_factory: {
        name: 'Light Factory',
        icon: '🔧',
        width: 3,
        height: 2,
        cost: 600,
        buildTime: 6000,
        hp: 600,
        power: -30,
        requires: ['refinery'],
        description: 'Builds light vehicles.'
    },
    heavy_factory: {
        name: 'Heavy Factory',
        icon: '🏭',
        width: 3,
        height: 3,
        cost: 800,
        buildTime: 8000,
        hp: 800,
        power: -40,
        requires: ['light_factory'],
        description: 'Builds heavy vehicles and tanks.'
    },
    turret: {
        name: 'Gun Turret',
        icon: '🗼',
        width: 1,
        height: 1,
        cost: 250,
        buildTime: 4000,
        hp: 500,
        power: -10,
        requires: ['barracks'],
        description: 'Defensive gun turret.',
        attackRange: 5,
        attackDamage: 15,
        attackSpeed: 1500
    },
    rocket_turret: {
        name: 'Rocket Turret',
        icon: '🚀',
        width: 1,
        height: 1,
        cost: 400,
        buildTime: 5000,
        hp: 500,
        power: -20,
        requires: ['heavy_factory'],
        description: 'Long-range rocket turret.',
        attackRange: 8,
        attackDamage: 30,
        attackSpeed: 2500
    },
    radar: {
        name: 'Outpost (Radar)',
        icon: '📡',
        width: 2,
        height: 2,
        cost: 400,
        buildTime: 4000,
        hp: 400,
        power: -30,
        requires: ['refinery'],
        radarRadius: 20,
        description: 'Reveals a large area of the map (radius 20).'
    },
    wall: {
        name: 'Wall',
        icon: '🧱',
        width: 1,
        height: 1,
        cost: 50,
        buildTime: 500,
        hp: 300,
        power: 0,
        requires: ['barracks'],
        description: 'Defensive wall segment.'
    },
    repair_bay: {
        name: 'Repair Bay',
        icon: '🔧',
        width: 2,
        height: 2,
        cost: 500,
        buildTime: 6000,
        hp: 600,
        power: -20,
        requires: ['heavy_factory'],
        description: 'Repairs damaged vehicles.'
    },
    hospital: {
        name: 'Hospital',
        icon: '🏥',
        width: 2,
        height: 2,
        cost: 400,
        buildTime: 5000,
        hp: 500,
        power: -15,
        requires: ['barracks'],
        description: 'Heals wounded infantry.'
    },
    helipad: {
        name: 'Helipad',
        icon: '🚁',
        width: 2,
        height: 2,
        cost: 700,
        buildTime: 7000,
        hp: 600,
        power: -25,
        requires: ['heavy_factory'],
        description: 'Builds and re-arms Ornithopters. Holds one aircraft.',
        givesUnit: 'ornithopter'
    }
};

// Unit definitions
const UNIT_DEFS = {
    light_infantry: {
        name: 'Light Infantry',
        icon: '🚶',
        cost: 60,
        buildTime: 3000,
        hp: 50,
        speed: 1.2,
        attackRange: 3,
        attackDamage: 5,
        attackSpeed: 1200,
        buildAt: 'barracks',
        requires: ['barracks'],
        description: 'Basic infantry unit.'
    },
    heavy_trooper: {
        name: 'Heavy Trooper',
        icon: '💂',
        cost: 100,
        buildTime: 4000,
        hp: 80,
        speed: 0.8,
        attackRange: 4,
        attackDamage: 12,
        attackSpeed: 1800,
        buildAt: 'barracks',
        requires: ['barracks'],
        description: 'Armored trooper with rockets.'
    },
    trike: {
        name: 'Trike',
        icon: '🏎',
        cost: 200,
        buildTime: 4000,
        hp: 100,
        speed: 3.0,
        attackRange: 4,
        attackDamage: 8,
        attackSpeed: 800,
        buildAt: 'light_factory',
        requires: ['light_factory'],
        description: 'Fast scout vehicle.'
    },
    quad: {
        name: 'Quad',
        icon: '🚙',
        cost: 250,
        buildTime: 4500,
        hp: 130,
        speed: 2.5,
        attackRange: 4,
        attackDamage: 10,
        attackSpeed: 1000,
        buildAt: 'light_factory',
        requires: ['light_factory'],
        description: 'Rocket-armed quad bike.'
    },
    harvester: {
        name: 'Harvester',
        icon: '🚜',
        cost: 400,
        buildTime: 6000,
        hp: 500,
        speed: 0.5,
        attackRange: 0,
        attackDamage: 0,
        attackSpeed: 0,
        buildAt: 'heavy_factory',
        requires: ['refinery'],
        capacity: 700,
        description: 'Harvests spice from the desert. Auto-harvests and returns to refinery.'
    },
    tank: {
        name: 'Combat Tank',
        icon: '🔫',
        cost: 400,
        buildTime: 6000,
        hp: 250,
        speed: 1.5,
        attackRange: 5,
        attackDamage: 20,
        attackSpeed: 2000,
        buildAt: 'heavy_factory',
        requires: ['heavy_factory'],
        description: 'Main battle tank.'
    },
    siege_tank: {
        name: 'Siege Tank',
        icon: '💣',
        cost: 600,
        buildTime: 8000,
        hp: 400,
        speed: 1.0,
        attackRange: 7,
        attackDamage: 35,
        attackSpeed: 3000,
        buildAt: 'heavy_factory',
        requires: ['heavy_factory'],
        description: 'Heavy siege tank. Splash damage.'
    },
    rocket_tank: {
        name: 'Rocket Launcher',
        icon: '🚀',
        cost: 500,
        buildTime: 7000,
        hp: 180,
        speed: 1.2,
        attackRange: 8,
        attackDamage: 25,
        attackSpeed: 2500,
        buildAt: 'heavy_factory',
        requires: ['heavy_factory'],
        description: 'Long-range rocket launcher.'
    },
    mcv: {
        name: 'MCV',
        icon: '🚛',
        cost: 1000,
        buildTime: 10000,
        hp: 500,
        speed: 0.6,
        attackRange: 0,
        attackDamage: 0,
        attackSpeed: 0,
        buildAt: 'heavy_factory',
        requires: ['heavy_factory'],
        description: 'Deploys into a Construction Yard.'
    },
    rocket_infantry: {
        name: 'Rocket Infantry',
        icon: '🚀',
        cost: 80,
        buildTime: 3500,
        hp: 40,
        speed: 1.0,
        attackRange: 5,
        attackDamage: 18,
        attackSpeed: 2200,
        buildAt: 'barracks',
        requires: ['barracks'],
        description: 'Anti-vehicle infantry with shoulder-mounted rocket launcher.'
    },
    commando: {
        name: 'Commando',
        icon: '🎯',
        cost: 1200,
        buildTime: 12000,
        hp: 120,
        speed: 1.8,
        attackRange: 9,
        attackDamage: 65,
        attackSpeed: 2500,
        buildAt: 'barracks',
        requires: ['barracks', 'heavy_factory'],
        unique: true,
        description: 'Elite sniper commando. Devastating long-range shots. Only one allowed.'
    },
    ornithopter: {
        name: 'Ornithopter',
        icon: '🚁',
        cost: 600,
        buildTime: 8000,
        hp: 150,
        speed: 3.5,
        attackRange: 6,
        attackDamage: 22,
        attackSpeed: 1200,
        buildAt: 'helipad',
        requires: ['helipad'],
        isAircraft: true,
        gunAmmo: 12,
        missileAmmo: 4,
        missileDamage: 35,
        description: 'Fast attack aircraft. Limited ammo — must return to helipad to re-arm.'
    }
};

// Directions for movement
const DIRECTIONS = [
    { x: 0, y: -1 },  // N
    { x: 1, y: -1 },  // NE
    { x: 1, y: 0 },   // E
    { x: 1, y: 1 },   // SE
    { x: 0, y: 1 },   // S
    { x: -1, y: 1 },  // SW
    { x: -1, y: 0 },  // W
    { x: -1, y: -1 }  // NW
];
