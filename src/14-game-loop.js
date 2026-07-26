// ============================================================
// MODULE: 14-game-loop.js
// Назначение: update() — симуляция, gameLoop, фиксированный шаг FIXED_DT
// Оригинальные строки IIFE: 6556-6778
// Порядок загрузки: 15/24
// ============================================================

        function update() {
            G.time++;

            if (G.time % 60 === 0) {
                if (!G.planetHistory) G.planetHistory = [];
                const snapshot = { t: G.time / 60, planets: {} };
                G.factions.forEach(f => { snapshot.planets[f] = 0; });
                G.planets.forEach(p => {
                    if (!snapshot.planets[p.faction]) snapshot.planets[p.faction] = 0;
                    snapshot.planets[p.faction]++;
                });
                G.planetHistory.push(snapshot);

                // Military power history (planets + ships + upgrades)
                if (!G.powerHistory) G.powerHistory = [];
                try {
                    const ps = { t: G.time / 60, power: {} };
                    const totals = computeMilitaryPowerTotals();
                    for (const k in totals) {
                        if (!Object.prototype.hasOwnProperty.call(totals, k)) continue;
                        ps.power[k] = totals[k];
                    }
                    G.powerHistory.push(ps);
                } catch (e) {
                    // no-op
                }
            }

            for (let i = 0; i < G.planets.length; i++) G.planets[i].update();

            G.waypoints = G.waypoints.filter(wp => G.time - wp.time < 350);

            spatialGrid.clear();
            spatialGrid.clearCache();

            for (let i = 0; i < G.ships.length; i++) {
                const ship = G.ships[i];
                if (ship.active) spatialGrid.insert(ship, 'ship');
            }

            for (let i = 0; i < G.planets.length; i++) {
                spatialGrid.insert(G.planets[i], 'planet');
            }

            // Cache ship counts per planet (avoids O(ships) filter per call)
            for (let i = 0; i < G.planets.length; i++) { const p = G.planets[i]; p._cachedDefenders = 0; p._cachedAttackers = 0; p._cachedBattleships = 0; }
            for (let i = 0; i < G.ships.length; i++) {
                const s = G.ships[i];
                if (!s.active || !s.home) continue;
                if (s.shipType === ShipType.BATTLESHIP) s.home._cachedBattleships = (s.home._cachedBattleships || 0) + 1;
                else if (s.role === ShipRole.DEFENDER) s.home._cachedDefenders = (s.home._cachedDefenders || 0) + 1;
                else if (s.role === ShipRole.ATTACKER) s.home._cachedAttackers = (s.home._cachedAttackers || 0) + 1;
            }

            // Compact projectiles (O(n) instead of O(n²) splice)
            let projWriteIdx = 0;
            for (let i = 0; i < G.projectiles.length; i++) {
                const p = G.projectiles[i];
                if (!p.active) {
                    projectilePool.release(p);
                    continue;
                }

                p.x += p.vx;
                p.y += p.vy;
                p.life--;

                if (p.life <= 0) {
                    p.active = false;
                    projectilePool.release(p);
                    continue;
                }

                if (!p.isPlanetTarget) {

                    const nearbyShips = spatialGrid.query(p.x, p.y, 20, 'ship');

                    for (const ship of nearbyShips) {

                        if (ship.faction !== p.faction && ship.active && areAtWar(p.faction, ship.faction)) {
                            const hitRadius = ship.shipType === ShipType.BATTLESHIP ? 20 : (ship.shipType === ShipType.COLONIZER ? 18 : 10);
                            const hitRadiusSq = hitRadius * hitRadius;
                            if (MathUtils.distanceSquared(p.x, p.y, ship.x, ship.y) < hitRadiusSq) {
                                ship.takeDamage(p.damage, p.faction);
                                p.active = false;
                                modifyTrust(p.faction, ship.faction, -1);
                                break;
                            }
                        }
                    }
                }

                if (p.active && p.isPlanetTarget) {

                    const nearbyPlanets = spatialGrid.query(p.x, p.y, 60, 'planet');
                    for (const planet of nearbyPlanets) {

                        if (planet.faction !== p.faction && areAtWar(p.faction, planet.faction)) {
                            const radiusSq = (planet.radius + 5) * (planet.radius + 5);
                            if (MathUtils.distanceSquared(p.x, p.y, planet.x, planet.y) < radiusSq) {
                                planet.takeDamage(p.damage, p.faction);
                                p.active = false;
                                modifyTrust(p.faction, planet.faction, -2);
                                break;
                            }
                        }
                    }
                }

                if (p.active) {
                    G.projectiles[projWriteIdx++] = p;
                } else {
                    projectilePool.release(p);
                }
            }
            G.projectiles.length = projWriteIdx;

            // Remove dead ships (O(n) instead of O(n²) splice)
            let writeIdx = 0;
            for (let i = 0; i < G.ships.length; i++) {
                if (G.ships[i].update()) {
                    G.ships[writeIdx++] = G.ships[i];
                }
            }
            G.ships.length = writeIdx;

            // Compact particles (O(n) instead of O(n²))
            writeIdx = 0;
            for (let i = 0; i < G.particles.length; i++) {
                const p = G.particles[i];
                if (!p.active) {
                    particlePool.release(p);
                    continue;
                }
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.96;
                p.vy *= 0.96;
                p.life--;
                if (p.life <= 0) { p.active = false; particlePool.release(p); continue; }
                G.particles[writeIdx++] = p;
            }
            G.particles.length = writeIdx;

            // Compact explosions
            writeIdx = 0;
            for (let i = 0; i < G.explosions.length; i++) {
                const e = G.explosions[i];
                e.radius += (e.maxRadius - e.radius) * 0.25;
                e.life -= 0.06;
                if (e.life > 0) G.explosions[writeIdx++] = e;
            }
            G.explosions.length = writeIdx;

            enemyAI();
            updateParasites();
            collectTributes();
            if (!(G.spectatorMode || G.playerDefeated)) diplomacyAI();

            if (G.time % 40 === 0) {
                checkGameEnd();
                updateHUD();
            }
        }

        let lastTime = 0;
        let accumulator = 0;
        // меню-пауза: деньги не должны начисляться "задним числом" после закрытия меню
        let wasPausedForMenu = false;
        const FIXED_DT = 1000 / 60;

        function gameLoop(time) {
            if (!G.running) return;

            let delta = time - lastTime;
            lastTime = time;

            if (delta > 200) delta = FIXED_DT;

            // Если только что вышли из меню-паузы — сбросить таймеры дохода планет,
            // чтобы не начислялось за время, пока игра стояла на паузе.
            if (wasPausedForMenu && !gamePausedForDiplomacy) {
                const nowReal = time; // тот же таймстамп, что и performance.now()
                for (let i = 0; i < G.planets.length; i++) {
                    const p = G.planets[i];
                    if (p) p.lastIncomeAt = nowReal;
                }
            }
            wasPausedForMenu = !!gamePausedForDiplomacy;

            if (!gamePausedForDiplomacy) {
                G.matchElapsedMs = (G.matchElapsedMs || 0) + delta;
                accumulator += delta * G.gameSpeed;

                while (accumulator >= FIXED_DT) {
                    update();
                    accumulator -= FIXED_DT;
                }
            }

            render();
            requestAnimationFrame(gameLoop);
        }

        document.getElementById('enemyCount').addEventListener('input', (e) => {
            settings.enemyCount = parseInt(e.target.value);
            document.getElementById('enemyCountValue').textContent = settings.enemyCount;
        });

        document.getElementById('mapSize').addEventListener('input', (e) => {
            settings.mapSize = parseInt(e.target.value);
            document.getElementById('mapSizeValue').textContent = MAP_SIZES[settings.mapSize].name;
        });

        document.getElementById('gameSpeed').addEventListener('input', (e) => {
            settings.gameSpeed = parseFloat(e.target.value);
            document.getElementById('gameSpeedValue').textContent = '×' + settings.gameSpeed.toFixed(1);
        });

        document.getElementById('planetCount').addEventListener('input', (e) => {
            settings.planetCount = parseInt(e.target.value);
            document.getElementById('planetCountValue').textContent = settings.planetCount;
        });
