// ============================================================
// MODULE: 01-core-constants.js
// Назначение: makeRNG, PLANET_TYPES, ShipState/Role/Type, стоимости, settings, глобальное состояние G
// Оригинальные строки IIFE: 1619-1699
// Порядок загрузки: 2/24
// ============================================================

        function makeRNG(seed) {
            let s = seed >>> 0;
            return function() {
                s += 0x6D2B79F5;
                let t = s;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        function getFactionColorMain(faction) {
            const c = COLORS[faction];
            return c ? c.main : COLORS.neutral.main;
        }

        const PLANET_TYPES = {
            normal: { name: 'Обычная', icon: '🌍', hpMult: 1, spawnMult: 1, shipMult: 1, captureBonus: 50 },
            industrial: { name: 'Промышленная', icon: '🏭', hpMult: 0.8, spawnMult: 0.5, shipMult: 1.5, captureBonus: 50 },
            fortress: { name: 'Крепость', icon: '🏰', hpMult: 2, spawnMult: 1.2, shipMult: 1, captureBonus: 75, hasTurrets: true },
            resource: { name: 'Ресурсная', icon: '💎', hpMult: 1.5, spawnMult: 1.3, shipMult: 0.8, captureBonus: 100 }
        };

        const ShipState = { PATROL: 0, INTERCEPT: 1, ATTACK: 2, FLEE: 3, TRAVEL: 4, ASSAULT: 5, GUARD: 6, WAYPOINT: 7, COLONIZE: 8, HAULING: 9 };
        const ShipRole = { DEFENDER: 0, ATTACKER: 1 };
        const ShipType = { FIGHTER: 0, BATTLESHIP: 1, COLONIZER: 2, CARGO: 3 };
        const FIGHTER_COST = 2;
        const BATTLESHIP_COST = 100;
        const COLONIZER_COST = 25;
        const CARGO_COST = 10;
        const CARGO_ETHERIUM_PER_DELIVERY = 10;
        const BATTLESHIP_ETHERIUM_COST = 20;
        const UPGRADE_ETHERIUM_THRESHOLD = 3; // upgrades above this level require etherium
        const UPGRADE_ETHERIUM_BASE = 5; // base etherium cost for level 4, +5 each level
        const COLONIZER_ESCORT_COST = 1;
        const COLONIZATION_TIME_TICKS = 40 * 60; // 40 секунд при 60 FPS

        let settings = {enemyCount: 3, mapSize: 2, planetCount: 20, gameSpeed: 2.5, aiModel: 'openai', spectatorMode: false };

        const G = {
            score: 0,
            etherium: 0,
            level: 1,
            shipUpgrades: { fighters: { speed: 1, attack: 1, armor: 1 }, defenders: { speed: 1, attack: 1, armor: 1 }, escorts: { speed: 1, attack: 1, armor: 1 }, battleships: { speed: 1, attack: 1, armor: 1 } },
            selectedFleetUpgradeClass: 'fighters',
            planetUpgrades: { attack: 1, defense: 1, economy: 1 },
            planets: [],
            ships: [],
            projectiles: [],
            particles: [],
            explosions: [],
            stars: [],
            waypoints: [],
            running: false,
            mapWidth: 2200,
            mapHeight: 2600,
            cam: { x: 0, y: 0, scale: 1, targetScale: 1 },
            factions: ['player'],
            factionData: {},
            planetHistory: [],
            powerHistory: [],
            time: 0,
            gameSpeed: 2.5,
            selectedPlanet: null,
            parasiteTimer: 0,
            parasiteSpawnInterval: 900,
            maxParasiteBattleships: 3,
            parasiteStartDelayMs: 180000,
            matchElapsedMs: 0,
            spectatorMode: false,
            playerDefeated: false,
            winnerFaction: null,
            diploInbox: [],
            diploInboxUnread: 0,
            allianceGroups: [],
            alliancePendingVotes: [],
            allianceNextId: 1,
            parasiteTributes: {},
            parasiteTributeTimer: 0
        };

