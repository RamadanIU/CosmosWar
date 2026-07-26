// ============================================================
// MODULE: 23-ui-parasites.js
// Назначение: showNotification, панель апгрейдов, паразиты-линкоры, diplomacyAI, финальный код IIFE
// Оригинальные строки IIFE: 11896-12152
// Порядок загрузки: 24/24
// ============================================================

        const notificationHistory = new Set();

        function showNotification(text, color) {
            // All notifications now go through the inbox system
            if (typeof pushSystemInbox === 'function') {
                pushSystemInbox(text);
            }
        }


        // Old notification animation removed — all notifications now go through inbox

        
        document.getElementById('diplomacyBtn').addEventListener('click', showDiplomacyPanel);
        document.getElementById('closeDiplomacy').addEventListener('click', closeDiplomacyPanel);

        // Inbox button handlers
        document.getElementById('inboxBtn').addEventListener('click', showInboxPanel);
        document.getElementById('closeInbox').addEventListener('click', closeInboxPanel);
        document.getElementById('diploInboxPanel').addEventListener('click', (e) => {
            if (e.target.id === 'diploInboxPanel') closeInboxPanel();
        });

        // ===== Upgrades Panel =====
        function showUpgradePanel() {
            if (G.spectatorMode || G.playerDefeated) return;
            gamePausedForDiplomacy = true;
            const panel = document.getElementById('upgradePanel');
            if (panel) panel.classList.remove('hidden');
            updateHUD();
        }

        function closeUpgradePanel() {
            const panel = document.getElementById('upgradePanel');
            if (panel) panel.classList.add('hidden');

            const offerModal = document.getElementById('diploOfferModal');
            const offerOpen = offerModal && !offerModal.classList.contains('hidden');

            const diploPanel = document.getElementById('diplomacyPanel');
            const diploOpen = diploPanel && !diploPanel.classList.contains('hidden');

            const upgPanel = document.getElementById('upgradePanel');
            const upgOpen = upgPanel && !upgPanel.classList.contains('hidden');

            const inboxPanel = document.getElementById('diploInboxPanel');
            const inboxOpen = inboxPanel && !inboxPanel.classList.contains('hidden');

            gamePausedForDiplomacy = !!(offerOpen || diploOpen || upgOpen || inboxOpen);
        }

        const upgradeBtn = document.getElementById('upgradeBtn');
        if (upgradeBtn) upgradeBtn.addEventListener('click', showUpgradePanel);

        const closeUpgrade = document.getElementById('closeUpgrade');
        if (closeUpgrade) closeUpgrade.addEventListener('click', closeUpgradePanel);

        const upgradePanel = document.getElementById('upgradePanel');
        if (upgradePanel) {
            upgradePanel.addEventListener('click', (e) => {
                if (e.target === upgradePanel) closeUpgradePanel();
            });
        }

        function getNearestParasiteBattleship(x, y) {
            let best = null;
            let bestDist = Infinity;
            for (let i = 0; i < G.ships.length; i++) {
                const s = G.ships[i];
                if (!s.active) continue;
                if (s.shipType !== ShipType.BATTLESHIP) continue;
                if (s.faction !== 'parasite') continue;
                const d = MathUtils.distanceSquared(x, y, s.x, s.y);
                if (d < bestDist) {
                    bestDist = d;
                    best = s;
                }
            }
            return best;
        }

        function findWeakPlanetForParasites() {
            const candidates = [];
            for (let i = 0; i < G.planets.length; i++) {
                const planet = G.planets[i];
                if (!planet.active) continue;
                if (planet.faction === 'neutral' || planet.faction === 'parasite') continue;

                let defenseScore = 0;
                const nearbyShips = spatialGrid.query(planet.x, planet.y, 260, 'ship');
                for (let j = 0; j < nearbyShips.length; j++) {
                    const ship = nearbyShips[j];
                    if (!ship.active) continue;
                    if (ship.faction !== planet.faction) continue;
                    defenseScore += ship.shipType === ShipType.BATTLESHIP ? 4 : 1;
                }

                if (defenseScore <= 3) {
                    candidates.push(planet);
                }
            }

            if (candidates.length === 0) return null;
            const idx = Math.floor(Math.random() * candidates.length);
            return candidates[idx];
        }

        function updateParasiteBattleshipAI(ship) {
            // Таймер стрельбы
            ship.fireTimer = Math.max(0, ship.fireTimer - 1);

            // Паразиты никогда не выбирают планеты как цели
            ship.targetPlanet = null;

            // Отступление при низком HP
            if (ship.hp < ship.maxHp * 0.4) {
                const cx = G.mapWidth * 0.5;
                const cy = G.mapHeight * 0.5;
                ship.targetAngle = Math.atan2(ship.y - cy, ship.x - cx);
                ship.accelerate(1);
                ship.physics();
                return;
            }

            // Поиск ближайшего вражеского корабля
            let bestEnemy = null;
            let bestDist = Infinity;
            const nearbyShips = spatialGrid.query(ship.x, ship.y, ship.sightRange, 'ship');

            for (const other of nearbyShips) {
                if (!other.active) continue;
                if (other === ship) continue;
                if (other.faction === 'parasite') continue;
                if (isPayingTribute(other.faction)) continue;

                const d = MathUtils.distanceSquared(ship.x, ship.y, other.x, other.y);
                if (d < bestDist && d < ship.sightRange * ship.sightRange) {
                    bestDist = d;
                    bestEnemy = other;
                }
            }

            ship.target = bestEnemy;

            // Атака корабля если он в радиусе
            if (ship.target && ship.target.active) {
                const distToTarget = MathUtils.distanceSquared(ship.x, ship.y, ship.target.x, ship.target.y);

                // Если близко - стрелять
                if (distToTarget < 22500 && ship.fireTimer <= 0) { // 150^2
                    ship.fire(ship.target);
                }

                ship.targetAngle = Math.atan2(ship.target.y - ship.y, ship.target.x - ship.x);
                ship.accelerate(0.7);
            }
            // Бродить случайно
            else {
                if (typeof ship.roamAngle !== 'number' || (G.time % 180 === 0)) {
                    ship.roamAngle = Math.random() * Math.PI * 2;
                }
                ship.targetAngle = ship.roamAngle;
                ship.accelerate(0.3);
            }

            ship.physics();
        }

        function spawnParasiteBattleship() {
            const margin = 50;
            let x, y;
            const side = Math.floor(Math.random() * 4);
            if (side === 0) {
                x = margin;
                y = Math.random() * G.mapHeight;
            } else if (side === 1) {
                x = G.mapWidth - margin;
                y = Math.random() * G.mapHeight;
            } else if (side === 2) {
                x = Math.random() * G.mapWidth;
                y = margin;
            } else {
                x = Math.random() * G.mapWidth;
                y = G.mapHeight - margin;
            }

            const ship = new Battleship(x, y, 'parasite', null);
            ship.state = ShipState.PATROL;
            G.ships.push(ship);
        }

        function updateParasites() {

            if ((G.matchElapsedMs || 0) < (G.parasiteStartDelayMs || 180000)) return;

            let count = 0;
            for (let i = 0; i < G.ships.length; i++) {
                const s = G.ships[i];
                if (!s.active) continue;
                if (s.shipType === ShipType.BATTLESHIP && s.faction === 'parasite') {
                    count++;
                }
            }

            if (count < (G.maxParasiteBattleships || 0)) {
                G.parasiteTimer++;
                if (G.parasiteTimer >= (G.parasiteSpawnInterval || 900)) {
                    G.parasiteTimer = 0;
                    spawnParasiteBattleship();
                }
            }
        }

        
        function diplomacyAI() {
            if (G.time % 30 !== 0) return;
            if (gamePausedForDiplomacy) return;

            if (G.time % 120 === 0) {
                syncAllianceRelations();
                cleanAllianceVotes();
            }

            const period = 600;

            G.factions.forEach((faction, idx) => {
                if (faction === 'player' || faction === 'neutral') return;

                // Паразиты требуют дань АВТОМАТИЧЕСКИ (не через LLM)
                if (faction === 'parasite') {
                    if ((G.matchElapsedMs || 0) < (G.parasiteStartDelayMs || 180000)) return;
                    const hasShips = G.ships.some(s => s.faction === 'parasite' && s.active);
                    if (!hasShips) return;
                    // Первый запрос сразу после появления, затем каждые 3 минуты
                    if (!G._parasiteFirstDemandDone) {
                        G._parasiteFirstDemandDone = true;
                        parasiteAutoDemandTribute();
                    } else if ((G.time % 10800) === 0) {
                        parasiteAutoDemandTribute();
                    }
                    return;
                }

                const exists = G.planets.some(p => p.faction === faction) ||
                              G.ships.some(s => s.faction === faction && s.active);
                if (!exists) return;

                const offset = (idx * 60) % period;
                if (((G.time + offset) % period) === 0) {
                    startProactiveLLMDiplomacy(faction);
                }
            });
        }




