// ============================================================
// MODULE: 10-level-ai.js
// Назначение: generateLevel, оценка целей, апгрейды AI-фракций, enemyAI, checkGameEnd
// Оригинальные строки IIFE: 4584-5006
// Порядок загрузки: 11/24
// ============================================================

        function generateLevel() {
            const mapConfig = MAP_SIZES[settings.mapSize];
            G.mapWidth = mapConfig.width;
            G.mapHeight = mapConfig.height;
            resizeMinimap();

            // Clear rendering caches from previous game
            gradientCache.clear();
            renderCache.clear();
            _glowSpriteCache.clear();
            _planetBodyCache.clear();
            _starCanvas = null;

            G.planets = [];
            G.ships = [];
            G.projectiles = [];
            G.particles = [];
            G.explosions = [];
            G.waypoints = [];
            G.factionData = {};
            G.planetHistory = [];
            G.powerHistory = [];
            G.score = 0;
            G.shipUpgrades = makeDefaultShipUpgrades();
            G.selectedFleetUpgradeClass = 'fighters';
            G.time = 0;
            G.parasiteTimer = 0;
            G.parasiteTributes = {};
            G.parasiteTributeTimer = 0;
            G._parasiteFirstDemandDone = false;
            G.matchElapsedMs = 0;
            G.cam.scale = 1;
            G.cam.targetScale = 1;

            G.diploChats = {};
            G.activeDiploChatFaction = null;

            G.factions = ['player'];
            for (let i = 1; i <= settings.enemyCount; i++) {
                G.factions.push('enemy' + i);
                initFactionData('enemy' + i);
            }
            G.factions.push('parasite');

            // === Randomize names (per new game) ===
            initRandomFactionNames();
            const _planetNameUsed = new Set();
            const _planetNames = [];
            for (let k = 0; k < settings.planetCount; k++) {
                _planetNames.push(generateUniquePlanetName(_planetNameUsed));
            }
            let _planetNameIdx = 0;

            initDiplomacy();
            gamePausedForDiplomacy = false;
            pendingOffer = null;

            const margin = 100, minDist = 150;
            const planetTypes = ['normal', 'normal', 'normal', 'industrial', 'fortress', 'resource'];

            for (let i = 0; i < settings.planetCount; i++) {
                let x, y, valid, attempts = 0;

                do {
                    x = margin + Math.random() * (G.mapWidth - margin * 2);
                    y = margin + Math.random() * (G.mapHeight - margin * 2);
                    valid = true;

                    for (const planet of G.planets) {
                        if (MathUtils.distanceSquared(planet.x, planet.y, x, y) < minDist * minDist) {
                            valid = false;
                            break;
                        }
                    }
                    attempts++;
                } while (!valid && attempts < 100);

                if (valid) {
                    const radius = (22 + Math.random() * 25) * 2;
                    let faction = 'neutral';
                    let type = planetTypes[Math.floor(Math.random() * planetTypes.length)];

                    if (i === 0) {
                        faction = 'player';
                        type = 'industrial';
                    } else if (i <= settings.enemyCount) {
                        faction = 'enemy' + i;
                        type = 'industrial';
                    }

                    const planet = new Planet(x, y, radius, faction, type);
                    planet.name = _planetNames[_planetNameIdx++] || generateUniquePlanetName(_planetNameUsed);

                    // Set inhabited status: starting planets are always inhabited
                    // Neutral planets: 80% uninhabited, 20% inhabited
                    if (faction !== 'neutral') {
                        planet.inhabited = true;
                    } else {
                        planet.inhabited = Math.random() < 0.2; // 20% chance inhabited
                    }

                    G.planets.push(planet);

                    // Neutral planets have no ships
                    if (faction !== 'neutral') {
                        for (let j = 0; j < 2; j++) planet.spawnShip(ShipRole.DEFENDER, true);
                        for (let j = 0; j < 2; j++) planet.spawnShip(ShipRole.ATTACKER, true);
                    }
                }
            }

            const playerPlanet = G.planets.find(p => p.faction === 'player');
            if (playerPlanet) {
                G.cam.x = playerPlanet.x;
                G.cam.y = playerPlanet.y;
            }

            initStars();
            updateHUD();
        }

        function evaluateTarget(faction, targetPlanet) {
            const myPlanets = G.planets.filter(p => p.faction === faction);

            const defenders = G.ships.filter(s => s.home === targetPlanet && s.active).length;

            let minDist = Infinity;
            myPlanets.forEach(p => {
                const d = MathUtils.distanceSquared(p.x, p.y, targetPlanet.x, targetPlanet.y);
                if (d < minDist) minDist = d;
            });

            let score = 100;
            score -= defenders * 15;
            score -= minDist * 0.00002;
            score += targetPlanet.faction === 'neutral' ? 30 : 0;
            score += (1 - targetPlanet.hp / targetPlanet.maxHp) * 40;
            score += targetPlanet.type === 'resource' ? 20 : 0;
            score += targetPlanet.type === 'industrial' ? 15 : 0;
            score -= targetPlanet.type === 'fortress' ? 20 : 0;

            return {
                planet: targetPlanet,
                score: score,
                defenders: defenders,
                neededShips: Math.max(3, defenders + 2)
            };
        }

        function factionNeedsDefense(faction) {
            const myPlanets = G.planets.filter(p => p.faction === faction);

            for (const planet of myPlanets) {
                const defenders = planet.getDefenderCount();

                const nearbyShips = spatialGrid.query(planet.x, planet.y, 200, 'ship');
                const nearbyEnemies = nearbyShips.filter(s =>
                    s.faction !== faction &&
                    s.active &&
                    areAtWar(faction, s.faction)
                ).length;

                if (nearbyEnemies > defenders + 1) {
                    return { planet, threat: nearbyEnemies };
                }
            }
            return null;
        }

        function tryFactionUpgrade(faction) {
    const isPlayer = (faction === 'player');
    if (isPlayer) {
        if (!(G.spectatorMode || G.playerDefeated)) return;
    } else {
        if (!G.factionData[faction]) return;
    }

    const stars = isPlayer ? G.score : G.factionData[faction].stars;
    const allUpgrades = getFactionShipUpgradesAll(faction);

    // Выбираем класс флота, который реально есть у фракции (иначе апгрейд бессмысленный)
    const eligibleClasses = [];
    for (const c of SHIP_UPGRADE_CLASSES) {
        let cnt = 0;
        for (const s of G.ships) {
            if (!s || !s.active) continue;
            if (s.faction !== faction) continue;
            if (getShipUpgradeClass(s) === c.key) cnt++;
        }
        if (cnt > 0) eligibleClasses.push(c.key);
    }
    if (eligibleClasses.length === 0) return;

    const shipClassKey = eligibleClasses[Math.floor(Math.random() * eligibleClasses.length)];
    const upgrades = allUpgrades[shipClassKey] || allUpgrades.fighters;

    const choices = [];
    const speedCost = upgrades.speed * 100;
    const attackCost = upgrades.attack * 100;
    const armorCost = upgrades.armor * 100;

    if (stars >= speedCost) choices.push('speed');
    if (stars >= attackCost) choices.push('attack');
    if (stars >= armorCost) choices.push('armor');

    if (choices.length > 0 && Math.random() < 0.3) {
        const choice = choices[Math.floor(Math.random() * choices.length)];
        const cost = (choice === 'speed' ? speedCost : choice === 'attack' ? attackCost : armorCost);

        if (isPlayer) {
            if (G.score >= cost) {
                G.score -= cost;
                upgrades[choice]++;
                applyUpgradesToFactionShipsByClass('player', shipClassKey);
            }
        } else {
            if (G.factionData[faction].stars >= cost) {
                G.factionData[faction].stars -= cost;
                upgrades[choice]++;
                applyUpgradesToFactionShipsByClass(faction, shipClassKey);
            }
        }
    }
}function tryFactionBuildBattleship(faction) {
            const stars = getFactionStars(faction);
            if (stars < BATTLESHIP_COST) return;

            const industrialPlanets = G.planets.filter(p => p.faction === faction && p.type === 'industrial');
            if (industrialPlanets.length === 0) return;

            const battleships = G.ships.filter(s => s.faction === faction && s.shipType === ShipType.BATTLESHIP && s.active).length;
            if (battleships >= industrialPlanets.length * 2) return;

            if (Math.random() < 0.2) {
                const planet = industrialPlanets[Math.floor(Math.random() * industrialPlanets.length)];
                if (planet.spawnBattleship()) {
                    spendFactionStars(faction, BATTLESHIP_COST);
                }
            }
        }

        function enemyAI() {
            if (G.time % 60 !== 0) return;

            G.factions.forEach(faction => {
                if ((faction === 'player' && !(G.spectatorMode || G.playerDefeated)) || faction === 'neutral' || faction === 'parasite') return;

                const myPlanets = G.planets.filter(p => p.faction === faction);
                if (myPlanets.length === 0) return;

                tryFactionUpgrade(faction);

                tryFactionBuildBattleship(faction);

                // Auto-build cargo ships for uninhabited planets
                if (G.time % 120 === 0) {
                    const myUninhabited = G.planets.filter(p => p.faction === faction && !p.inhabited && (!p.cargoShip || !p.cargoShip.active));
                    for (const uPlanet of myUninhabited) {
                        const funds = getFactionStars(faction);
                        if (funds >= CARGO_COST) {
                            const cargo = buildCargoShip(faction, uPlanet);
                            if (cargo) {
                                spendFactionStars(faction, CARGO_COST);
                            }
                        }
                    }
                }
                if (Math.random() < 0.18) {
                    const funds = getFactionStars(faction);
                    if (funds >= COLONIZER_COST) {
                        const neutralTargets = G.planets.filter(p => p.active && p.faction === 'neutral' && !p.colonizing);
                        if (neutralTargets.length) {
                            // Выбираем нейтральную планету, ближайшую к любым нашим планетам
                            let best = null;
                            let bestD = Infinity;
                            for (const t of neutralTargets) {
                                let md = Infinity;
                                for (const mp of myPlanets) {
                                    const d = MathUtils.distanceSquared(mp.x, mp.y, t.x, t.y);
                                    if (d < md) md = d;
                                }
                                if (md < bestD) { bestD = md; best = t; }
                            }
                            if (best) {
                                buildAndSendColonizer(faction, best, { source: 'ai' });
                                return;
                            }
                        }
                    }
                }

                const defenseNeed = factionNeedsDefense(faction);
                if (defenseNeed) {
                    const nearbyAttackers = G.ships.filter(s =>
                        s.faction === faction &&
                        s.active &&
                        s.role === ShipRole.ATTACKER &&
                        (s.state === ShipState.PATROL || s.state === ShipState.TRAVEL)
                    );

                    const nearbyShips = spatialGrid.query(defenseNeed.planet.x, defenseNeed.planet.y, 400, 'ship');
                    const eligibleShips = nearbyShips.filter(s =>
                        s.faction === faction &&
                        s.active &&
                        s.role === ShipRole.ATTACKER &&
                        (s.state === ShipState.PATROL || s.state === ShipState.TRAVEL)
                    );

                    eligibleShips.slice(0, 4).forEach(ship => {
                        ship.targetPlanet = defenseNeed.planet;
                        ship.state = ShipState.TRAVEL;
                    });
                    return;
                }

                if (Math.random() > 0.35) return;

                const availableAttackers = G.ships.filter(s =>
                    s.faction === faction &&
                    s.active &&
                    s.role === ShipRole.ATTACKER &&
                    s.state === ShipState.PATROL
                );

                if (availableAttackers.length < 3) return;

                const targets = G.planets.filter(p => p.faction !== faction && areAtWar(faction, p.faction));
                if (targets.length === 0) return;

                const evaluations = targets.map(t => evaluateTarget(faction, t));
                evaluations.sort((a, b) => b.score - a.score);

                const bestTarget = evaluations[0];

                if (availableAttackers.length >= bestTarget.neededShips) {
                    const attackForce = availableAttackers.slice(0, Math.min(availableAttackers.length - 1, bestTarget.neededShips + 2));
                    attackForce.forEach(ship => {
                        ship.targetPlanet = bestTarget.planet;
                        ship.state = ShipState.TRAVEL;
                    });
                }
            });
        }

        function checkGameEnd() {
            const isSpectating = !!G.spectatorMode || !!G.playerDefeated;

            // Winner = one faction owns every planet (ignoring "neutral" as a winner)
            let winner = null;
            if (G.planets.length > 0) {
                const f = G.planets[0].faction;
                if (f && f !== 'neutral' && G.planets.every(p => p.faction === f)) {
                    winner = f;
                }
            }

            // Normal mode: show defeat screen when player is eliminated (with option to keep watching)
            if (!isSpectating) {
                const playerPlanets = G.planets.filter(p => p.faction === 'player');
                const playerShips = G.ships.filter(s => s.faction === 'player' && s.active);

                if (playerPlanets.length === 0 && playerShips.length === 0) {
                    // If the game already has a winner, skip defeat screen and show the winner instead.
                    if (!winner) {
                        G.running = false;
                        const loseSpan = document.getElementById('finalScoreLose');
                        if (loseSpan) loseSpan.textContent = G.score;
                        const loseCanvas = document.getElementById('statsCanvasLose');
                        if (loseCanvas) {
                            try { drawPlanetStats(loseCanvas); } catch (e) { console.error(e); }
                            try {
                                const pc = document.getElementById('powerCanvasLose');
                                if (pc) drawPowerStats(pc);
                                const ps = document.getElementById('powerSummaryLose');
                                if (ps) renderPowerSummary(ps);
                            } catch (e) { console.error(e); }
                            try { setEndScreenTab('lose', 'planets'); } catch (e) {}

                        }
                        const sub = document.getElementById('gameOverSubtitle');
                        if (sub) sub.textContent = 'Ваша империя уничтожена! (Можно продолжить наблюдение)';
                        document.getElementById('gameOverScreen').classList.remove('hidden');
                        return;
                    }
                }
            }

            // Any mode: end when someone controls the entire galaxy
            if (winner) {
                G.running = false;
                G.winnerFaction = winner;

                const winSpan = document.getElementById('finalScoreWin');
                if (winSpan) winSpan.textContent = G.score;
                const winCanvas = document.getElementById('statsCanvasWin');
                if (winCanvas) {
                    try { drawPlanetStats(winCanvas); } catch (e) { console.error(e); }
                    try {
                        const pc = document.getElementById('powerCanvasWin');
                        if (pc) drawPowerStats(pc);
                        const ps = document.getElementById('powerSummaryWin');
                        if (ps) renderPowerSummary(ps);
                    } catch (e) { console.error(e); }
                    try { setEndScreenTab('win', 'planets'); } catch (e) {}

                }

                const title = document.getElementById('victoryTitle');
                const sub = document.getElementById('victorySubtitle');

                if (!isSpectating && winner === 'player') {
                    if (title) title.textContent = 'ПОБЕДА!';
                    if (sub) sub.textContent = 'Галактика под вашим контролем!';
                } else {
                    if (title) title.textContent = 'КОНЕЦ ИГРЫ';
                    const name = (typeof FACTION_NAMES !== 'undefined' && FACTION_NAMES[winner]) ? FACTION_NAMES[winner] : winner;
                    if (sub) sub.textContent = 'Победила фракция: ' + name;
                }

                document.getElementById('victoryScreen').classList.remove('hidden');
            }
        }

