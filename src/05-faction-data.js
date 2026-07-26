// ============================================================
// MODULE: 05-faction-data.js
// Назначение: initFactionData, SHIP_UPGRADE_CLASSES, функции апгрейдов кораблей/планет фракций
// Оригинальные строки IIFE: 1955-2106
// Порядок загрузки: 6/24
// ============================================================

        function initFactionData(faction) {
            G.factionData[faction] = {
                stars: 0,
                etherium: 0,
                shipUpgrades: { fighters: { speed: 1, attack: 1, armor: 1 }, defenders: { speed: 1, attack: 1, armor: 1 }, escorts: { speed: 1, attack: 1, armor: 1 }, battleships: { speed: 1, attack: 1, armor: 1 } },
                            planetUpgrades: { attack: 1, defense: 1, economy: 1 }
            };
        }

        const SHIP_UPGRADE_CLASSES = [
    { key: 'fighters', label: 'Истребители' },
    { key: 'defenders', label: 'Защитники планет' },
    { key: 'escorts', label: 'Эскорты' },
    { key: 'battleships', label: 'Линкоры' }
];

function makeDefaultShipUpgrades() {
    return {
        fighters: { speed: 1, attack: 1, armor: 1 },
        defenders: { speed: 1, attack: 1, armor: 1 },
        escorts: { speed: 1, attack: 1, armor: 1 },
        battleships: { speed: 1, attack: 1, armor: 1 }
    };
}

function normalizeShipUpgradeBlock(block) {
    const b = (block && typeof block === 'object') ? block : {};
    const out = {
        speed: Math.max(1, Math.floor(Number(b.speed) || 1)),
        attack: Math.max(1, Math.floor(Number(b.attack) || 1)),
        armor: Math.max(1, Math.floor(Number(b.armor) || 1))
    };
    return out;
}

function normalizeShipUpgrades(obj) {
    const o = (obj && typeof obj === 'object') ? obj : {};
    const out = {};
    for (const c of SHIP_UPGRADE_CLASSES) {
        out[c.key] = normalizeShipUpgradeBlock(o[c.key]);
    }
    return out;
}

function getFactionShipUpgradesAll(faction) {
    if (faction === 'player') {
        if (!G.shipUpgrades || typeof G.shipUpgrades !== 'object') {
            G.shipUpgrades = makeDefaultShipUpgrades();
        } else {
            G.shipUpgrades = normalizeShipUpgrades(G.shipUpgrades);
        }
        if (!G.selectedFleetUpgradeClass) G.selectedFleetUpgradeClass = 'fighters';
        return G.shipUpgrades;
    }

    if (!G.factionData[faction]) initFactionData(faction);
    const data = G.factionData[faction];
    if (!data.shipUpgrades || typeof data.shipUpgrades !== 'object') {
        data.shipUpgrades = makeDefaultShipUpgrades();
    } else {
        data.shipUpgrades = normalizeShipUpgrades(data.shipUpgrades);
    }
    return data.shipUpgrades;
}

function getFactionShipUpgrades(faction, shipClassKey) {
    const all = getFactionShipUpgradesAll(faction);
    return all[shipClassKey] || all.fighters;
}

// Для расчётов/ИИ: "средние" апгрейды по всем классам флота.
// Игрок не может прокачать "всё сразу" — UI и экономика работают только через shipClassKey.
function getFactionUpgrades(faction) {
    const all = getFactionShipUpgradesAll(faction);
    let n = 0;
    let s = 0, a = 0, r = 0;
    for (const c of SHIP_UPGRADE_CLASSES) {
        const u = all[c.key];
        if (!u) continue;
        s += Number(u.speed) || 1;
        a += Number(u.attack) || 1;
        r += Number(u.armor) || 1;
        n++;
    }
    if (n <= 0) return { speed: 1, attack: 1, armor: 1 };
    return { speed: s / n, attack: a / n, armor: r / n };
}

function getShipUpgradeClass(ship) {
    if (!ship) return 'fighters';
    if (ship.shipType === ShipType.BATTLESHIP) return 'battleships';
    if (ship.shipType === ShipType.COLONIZER) return 'escorts';
    if (ship.shipType === ShipType.CARGO) return 'escorts'; // cargo uses escort upgrades
    if (typeof EscortShip !== 'undefined' && ship instanceof EscortShip) return 'escorts';
    if (ship.role === ShipRole.DEFENDER) return 'defenders';
    return 'fighters';
}

function applyUpgradesToFactionShipsByClass(faction, shipClassKey) {
    for (const s of G.ships) {
        if (!s || !s.active) continue;
        if (s.faction !== faction) continue;
        if (getShipUpgradeClass(s) !== shipClassKey) continue;
        if (typeof s.applyUpgrades === 'function') s.applyUpgrades();
    }
}

// "Инструменты" для программного апгрейда флота по классу (аналогично tryPlanetUpgrade / пер-планетной прокачке).
function getPlayerShipUpgradeCost(shipClassKey, stat) {
    const u = getFactionShipUpgrades('player', shipClassKey);
    const v = Math.max(1, Number(u[stat]) || 1);
    return v * 25;
}

function tryPlayerShipUpgrade(shipClassKey, stat) {
    if (G.spectatorMode || G.playerDefeated) return { ok: false, reason: 'player_unavailable' };

    const validClass = (SHIP_UPGRADE_CLASSES.some(c => c.key === shipClassKey)) ? shipClassKey : 'fighters';
    const validStat = (stat === 'speed' || stat === 'attack' || stat === 'armor') ? stat : null;
    if (!validStat) return { ok: false, reason: 'bad_stat' };

    const cost = getPlayerShipUpgradeCost(validClass, validStat);
    if (G.score < cost) return { ok: false, reason: 'not_enough_stars', cost };

    const u = getFactionShipUpgrades('player', validClass);
    G.score -= cost;
    u[validStat] = Math.max(1, Math.floor(Number(u[validStat]) || 1) + 1);

    applyUpgradesToFactionShipsByClass('player', validClass);
    return { ok: true, cost, newLevel: u[validStat], shipClassKey: validClass, stat: validStat };
}

        function getFactionPlanetUpgrades(faction) {
            if (faction === 'player') return G.planetUpgrades;
            if (!G.factionData[faction]) initFactionData(faction);
            if (!G.factionData[faction].planetUpgrades) G.factionData[faction].planetUpgrades = { attack: 1, defense: 1, economy: 1 };
            return G.factionData[faction].planetUpgrades;
        }

        // Per-planet upgrades (attack/defense/economy). Stored on the planet itself.
        function ensurePlanetUpgradeState(planet) {
            if (!planet) return { attack: 1, defense: 1, economy: 1 };
            if (!planet.upgrades || typeof planet.upgrades !== 'object') {
                planet.upgrades = { attack: 1, defense: 1, economy: 1 };
            } else {
                if (!Number.isFinite(planet.upgrades.attack) || planet.upgrades.attack < 1) planet.upgrades.attack = 1;
                if (!Number.isFinite(planet.upgrades.defense) || planet.upgrades.defense < 1) planet.upgrades.defense = 1;
                if (!Number.isFinite(planet.upgrades.economy) || planet.upgrades.economy < 1) planet.upgrades.economy = 1;
            }
            return planet.upgrades;
        }

