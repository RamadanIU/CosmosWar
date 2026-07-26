// ============================================================
// MODULE: 12-hud.js
// Назначение: updateHUD (верхний HUD), drawMinimap
// Оригинальные строки IIFE: 5295-5632
// Порядок загрузки: 13/24
// ============================================================

        function updateHUD() {
            document.getElementById('score').textContent = G.score;
            const ethEl = document.getElementById('etheriumDisplay');
            if (ethEl) ethEl.textContent = Math.floor(G.etherium || 0);
            document.getElementById('playerPlanets').textContent = G.planets.filter(p => p.faction === 'player').length;
            document.getElementById('totalPlanets').textContent = G.planets.length;

            const fleetSel = document.getElementById('upgradeFleetTypeSelect');
let fleetClass = (fleetSel && fleetSel.value) ? fleetSel.value : (G.selectedFleetUpgradeClass || 'fighters');
if (fleetSel && fleetSel.value !== fleetClass) fleetSel.value = fleetClass;
G.selectedFleetUpgradeClass = fleetClass;

const fleetU = getFactionShipUpgrades('player', fleetClass);
document.getElementById('speedLvl').textContent = fleetU.speed;
document.getElementById('attackLvl').textContent = fleetU.attack;
document.getElementById('armorLvl').textContent = fleetU.armor;

// Planet upgrades are per-planet now (selected in upgrade panel)
const sc = fleetU.speed * 25, ac = fleetU.attack * 25, rc = fleetU.armor * 25;

            const sel = document.getElementById('upgradePlanetSelect');

            // Populate selector only when needed (avoid rebuilding every frame)
            let selectedPlanet = null;
            if (sel) {
                const myPlanets = (G.planets || []).filter(p => p && p.active !== false && p.faction === 'player');
                const key = myPlanets.map(p => p.name).join('|');
                if (G._upgradePlanetSelectKey !== key) {
                    G._upgradePlanetSelectKey = key;
                    const prev = sel.value;
                    sel.innerHTML = '';
                    if (!myPlanets.length) {
                        const opt = document.createElement('option');
                        opt.value = '';
                        opt.textContent = '(нет планет)';
                        sel.appendChild(opt);
                    } else {
                        for (let i = 0; i < myPlanets.length; i++) {
                            const p = myPlanets[i];
                            const opt = document.createElement('option');
                            opt.value = p.name;
                            opt.textContent = p.name;
                            sel.appendChild(opt);
                        }
                    }
                    if (prev && myPlanets.some(p => p.name === prev)) sel.value = prev;
                    else if (myPlanets.length) sel.value = myPlanets[0].name;
                }

                selectedPlanet = getPlanetByName(sel.value);
                if (!selectedPlanet) {
                    const myPlanets = (G.planets || []).filter(p => p && p.active !== false && p.faction === 'player');
                    if (myPlanets.length) {
                        sel.value = myPlanets[0].name;
                        selectedPlanet = myPlanets[0];
                    }
                }
            }

            let pac = 1000000000, pdc = 1000000000, pec = 1000000000;
            if (selectedPlanet) {
                const pu = ensurePlanetUpgradeState(selectedPlanet);
                document.getElementById('pAttackLvl').textContent = pu.attack;
                document.getElementById('pDefenseLvl').textContent = pu.defense;
                document.getElementById('pEconomyLvl').textContent = pu.economy;
                pac = Math.max(1, pu.attack || 1) * 50;
                pdc = Math.max(1, pu.defense || 1) * 50;
                pec = Math.max(1, pu.economy || 1) * 50;
            } else {
                document.getElementById('pAttackLvl').textContent = '-';
                document.getElementById('pDefenseLvl').textContent = '-';
                document.getElementById('pEconomyLvl').textContent = '-';
            }

            const ethSpeed = getUpgradeEtheriumCost(fleetU.speed);
            const ethAttack = getUpgradeEtheriumCost(fleetU.attack);
            const ethArmor = getUpgradeEtheriumCost(fleetU.armor);

            document.getElementById('speedCost').textContent = sc + (ethSpeed > 0 ? ` + ${ethSpeed}⟠` : '');
            document.getElementById('attackCost').textContent = ac + (ethAttack > 0 ? ` + ${ethAttack}⟠` : '');
            document.getElementById('armorCost').textContent = rc + (ethArmor > 0 ? ` + ${ethArmor}⟠` : '');

            document.getElementById('pAttackCost').textContent = (pac >= 1000000000) ? '-' : pac;
            document.getElementById('pDefenseCost').textContent = (pdc >= 1000000000) ? '-' : pdc;
            document.getElementById('pEconomyCost').textContent = (pec >= 1000000000) ? '-' : pec;
            document.getElementById('upgradeSpeed').disabled = G.score < sc || (G.etherium || 0) < ethSpeed;
            document.getElementById('upgradeAttack').disabled = G.score < ac || (G.etherium || 0) < ethAttack;
            document.getElementById('upgradeArmor').disabled = G.score < rc || (G.etherium || 0) < ethArmor;


            document.getElementById('upgradePlanetAttack').disabled = G.score < pac;
            document.getElementById('upgradePlanetDefense').disabled = G.score < pdc;
            document.getElementById('upgradePlanetEconomy').disabled = G.score < pec;
            const hasIndustrial = G.planets.some(p => p.faction === 'player' && p.type === 'industrial');
            document.getElementById('buildBattleship').disabled = G.score < BATTLESHIP_COST || (G.etherium || 0) < BATTLESHIP_ETHERIUM_COST || !hasIndustrial;
            const hasUninhabited = G.planets.some(p => p.faction === 'player' && !p.inhabited && (!p.cargoShip || !p.cargoShip.active));
            const cargoBtn = document.getElementById('buildCargoShip');
            if (cargoBtn) cargoBtn.disabled = G.score < CARGO_COST || !hasUninhabited;

            if (G.spectatorMode || G.playerDefeated) {
                document.getElementById('upgradeSpeed').disabled = true;
                document.getElementById('upgradeAttack').disabled = true;
                document.getElementById('upgradeArmor').disabled = true;

                document.getElementById('upgradePlanetAttack').disabled = true;
                document.getElementById('upgradePlanetDefense').disabled = true;
                document.getElementById('upgradePlanetEconomy').disabled = true;

                document.getElementById('buildBattleship').disabled = true;
            }

            // Refresh colonization modal state (money/availability)
            try { updateColonizeModal(); } catch (e) {}
        }
        document.getElementById('upgradeSpeed').addEventListener('click', () => {
    if (G.spectatorMode || G.playerDefeated) return;

    const sel = document.getElementById('upgradeFleetTypeSelect');
    const shipClassKey = (sel && sel.value) ? sel.value : (G.selectedFleetUpgradeClass || 'fighters');
    if (sel && sel.value !== shipClassKey) sel.value = shipClassKey;
    G.selectedFleetUpgradeClass = shipClassKey;

    const u = getFactionShipUpgrades('player', shipClassKey);
    const cost = u.speed * 25;
    const ethCost = getUpgradeEtheriumCost(u.speed);
    if (G.score >= cost && (G.etherium || 0) >= ethCost) {
        G.score -= cost;
        if (ethCost > 0) G.etherium -= ethCost;
        u.speed++;
        applyUpgradesToFactionShipsByClass('player', shipClassKey);
        updateHUD();
    }
});

        document.getElementById('upgradeAttack').addEventListener('click', () => {
    if (G.spectatorMode || G.playerDefeated) return;

    const sel = document.getElementById('upgradeFleetTypeSelect');
    const shipClassKey = (sel && sel.value) ? sel.value : (G.selectedFleetUpgradeClass || 'fighters');
    if (sel && sel.value !== shipClassKey) sel.value = shipClassKey;
    G.selectedFleetUpgradeClass = shipClassKey;

    const u = getFactionShipUpgrades('player', shipClassKey);
    const cost = u.attack * 25;
    const ethCost = getUpgradeEtheriumCost(u.attack);
    if (G.score >= cost && (G.etherium || 0) >= ethCost) {
        G.score -= cost;
        if (ethCost > 0) G.etherium -= ethCost;
        u.attack++;
        applyUpgradesToFactionShipsByClass('player', shipClassKey);
        updateHUD();
    }
});

        document.getElementById('upgradeArmor').addEventListener('click', () => {
    if (G.spectatorMode || G.playerDefeated) return;

    const sel = document.getElementById('upgradeFleetTypeSelect');
    const shipClassKey = (sel && sel.value) ? sel.value : (G.selectedFleetUpgradeClass || 'fighters');
    if (sel && sel.value !== shipClassKey) sel.value = shipClassKey;
    G.selectedFleetUpgradeClass = shipClassKey;

    const u = getFactionShipUpgrades('player', shipClassKey);
    const cost = u.armor * 25;
    const ethCost = getUpgradeEtheriumCost(u.armor);
    if (G.score >= cost && (G.etherium || 0) >= ethCost) {
        G.score -= cost;
        if (ethCost > 0) G.etherium -= ethCost;
        u.armor++;
        applyUpgradesToFactionShipsByClass('player', shipClassKey);
        updateHUD();
    }
});

const fleetUpgradeSelect = document.getElementById('upgradeFleetTypeSelect');
if (fleetUpgradeSelect) {
    fleetUpgradeSelect.addEventListener('change', () => {
        G.selectedFleetUpgradeClass = fleetUpgradeSelect.value || 'fighters';
        updateHUD();
    });
}


        document.getElementById('upgradePlanetAttack').addEventListener('click', () => {
            if (G.spectatorMode || G.playerDefeated) return;

            const sel = document.getElementById('upgradePlanetSelect');
            const planetName = sel ? String(sel.value || '').trim() : '';
            const p = getPlanetByName(planetName) || (G.planets || []).find(pp => pp && pp.active !== false && pp.faction === 'player');
            if (!p || p.faction !== 'player') return;

            const pu = ensurePlanetUpgradeState(p);
            const lvl = Math.max(1, pu.attack || 1);
            const cost = lvl * 50;
            if (G.score < cost) return;

            G.score -= cost;
            pu.attack = lvl + 1;

            if ('attack' !== 'economy') {
                applyPlanetUpgradesToPlanet(p);
            }

            spawnExplosion(p.x, p.y, '#a855f7', 18);
            pushSystemInbox(`Апгрейд планеты "${p.name}": Атака ур.${pu.attack}`);
            updateHUD();
        });

        document.getElementById('upgradePlanetDefense').addEventListener('click', () => {
            if (G.spectatorMode || G.playerDefeated) return;

            const sel = document.getElementById('upgradePlanetSelect');
            const planetName = sel ? String(sel.value || '').trim() : '';
            const p = getPlanetByName(planetName) || (G.planets || []).find(pp => pp && pp.active !== false && pp.faction === 'player');
            if (!p || p.faction !== 'player') return;

            const pu = ensurePlanetUpgradeState(p);
            const lvl = Math.max(1, pu.defense || 1);
            const cost = lvl * 50;
            if (G.score < cost) return;

            G.score -= cost;
            pu.defense = lvl + 1;

            if ('defense' !== 'economy') {
                applyPlanetUpgradesToPlanet(p);
            }

            spawnExplosion(p.x, p.y, '#a855f7', 18);
            pushSystemInbox(`Апгрейд планеты "${p.name}": Оборона ур.${pu.defense}`);
            updateHUD();
        });

        document.getElementById('upgradePlanetEconomy').addEventListener('click', () => {
            if (G.spectatorMode || G.playerDefeated) return;

            const sel = document.getElementById('upgradePlanetSelect');
            const planetName = sel ? String(sel.value || '').trim() : '';
            const p = getPlanetByName(planetName) || (G.planets || []).find(pp => pp && pp.active !== false && pp.faction === 'player');
            if (!p || p.faction !== 'player') return;

            const pu = ensurePlanetUpgradeState(p);
            const lvl = Math.max(1, pu.economy || 1);
            const cost = lvl * 50;
            if (G.score < cost) return;

            G.score -= cost;
            pu.economy = lvl + 1;

            if ('economy' !== 'economy') {
                applyPlanetUpgradesToPlanet(p);
            }

            spawnExplosion(p.x, p.y, '#a855f7', 18);
            pushSystemInbox(`Апгрейд планеты "${p.name}": Экономика ур.${pu.economy}`);
            updateHUD();
        });

        // Update planet upgrade view when selecting a different planet
        try {
            const sel = document.getElementById('upgradePlanetSelect');
            if (sel && !sel._boundUpgradePlanetSelect) {
                sel._boundUpgradePlanetSelect = true;
                sel.addEventListener('change', () => {
                    try { updateHUD(); } catch (e) {}
                });
            }
        } catch (e) {}

        document.getElementById('buildBattleship').addEventListener('click', () => {
            if (G.spectatorMode || G.playerDefeated) return;
            if (G.score < BATTLESHIP_COST) return;
            if ((G.etherium || 0) < BATTLESHIP_ETHERIUM_COST) return;

            const industrialPlanet = G.planets.find(p => p.faction === 'player' && p.type === 'industrial');
            if (!industrialPlanet) return;

            if (industrialPlanet.spawnBattleship()) {
                G.score -= BATTLESHIP_COST;
                G.etherium = (G.etherium || 0) - BATTLESHIP_ETHERIUM_COST;
                spawnExplosion(industrialPlanet.x, industrialPlanet.y, '#a855f7', 20);
                updateHUD();
            }
        });

        // Build Cargo Ship button handler
        document.getElementById('buildCargoShip').addEventListener('click', () => {
            if (G.spectatorMode || G.playerDefeated) return;
            if (G.score < CARGO_COST) return;

            // Find player's uninhabited planets that don't have a cargo ship
            const uninhabited = G.planets.filter(p => p.faction === 'player' && !p.inhabited && (!p.cargoShip || !p.cargoShip.active));
            if (uninhabited.length === 0) return;

            const planet = uninhabited[0]; // auto-select first available
            const cargo = buildCargoShip('player', planet);
            if (cargo) {
                G.score -= CARGO_COST;
                spawnExplosion(planet.x, planet.y, '#a855f7', 15);
                pushSystemInbox(`📦 Грузовик построен для планеты "${planet.name}"`);
                updateHUD();
            }
        });

        function drawMinimap() {
            const mw = minimapCanvas.width, mh = minimapCanvas.height;
            minimapCtx.fillStyle = '#0a0a1a';
            minimapCtx.fillRect(0, 0, mw, mh);

            minimapCtx.strokeStyle = 'rgba(100,100,255,0.3)';
            minimapCtx.lineWidth = 1;
            minimapCtx.strokeRect(0, 0, mw, mh);

            G.waypoints.forEach(wp => {
                minimapCtx.fillStyle = 'rgba(96, 165, 250, 0.6)';
                minimapCtx.beginPath();
                minimapCtx.arc((wp.x / G.mapWidth) * mw, (wp.y / G.mapHeight) * mh, 2, 0, Math.PI * 2);
                minimapCtx.fill();
            });

            G.planets.forEach(p => {
                minimapCtx.fillStyle = getFactionColorMain(p.faction);
                minimapCtx.beginPath();
                minimapCtx.arc((p.x / G.mapWidth) * mw, (p.y / G.mapHeight) * mh, 3, 0, Math.PI * 2);
                minimapCtx.fill();
            });

            const scale = G.cam.scale;
            const vw = canvas.width / scale / G.mapWidth * mw;
            const vh = canvas.height / scale / G.mapHeight * mh;
            const vx = (G.cam.x / G.mapWidth) * mw - vw / 2;
            const vy = (G.cam.y / G.mapHeight) * mh - vh / 2;

            minimapCtx.strokeStyle = '#fff';
            minimapCtx.lineWidth = 1;
            minimapCtx.strokeRect(vx, vy, vw, vh);
        }

