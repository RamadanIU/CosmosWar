// ============================================================
// MODULE: 09-ships.js
// Назначение: Классы сущностей: Battleship, EscortShip, CargoShip, Colonizer, Ship, Planet
// Оригинальные строки IIFE: 2511-4583
// Порядок загрузки: 10/24
// ============================================================

        class Battleship {
            constructor(x, y, faction, home) {
                this.x = x;
                this.y = y;
                this.vx = 0;
                this.vy = 0;
                this.faction = faction;
                this.home = home;
                this.targetPlanet = null;
                this.target = null;
                this.waypoint = null;
                this.active = true;
                this.shipType = ShipType.BATTLESHIP;
                this.role = ShipRole.ATTACKER;

                const upgrades = getFactionShipUpgrades(faction, 'battleships');

                this.maxHp = (25 + upgrades.armor * 5) * 10;
                this.hp = this.maxHp;
                this.atk = (3 + upgrades.attack * 1) * 5;
                this.maxSpd = 0.4 + upgrades.speed * 0.08;
                this.acc = 0.015;

                this.maxShield = this.maxHp * 0.1;
                this.shield = this.maxShield;
                this.shieldRegenDelay = 60;
                this.shieldRegenRate = this.maxShield * 0.005;
                this.lastDamageTime = 0;

                this.angle = Math.random() * Math.PI * 2;
                this.targetAngle = this.angle;
                this.state = ShipState.PATROL;

                this.patrolAngle = Math.random() * Math.PI * 2;
                this.patrolRadius = (home ? home.radius : 30) + 90 + Math.random() * 40;
                this.patrolSpeed = 0.004 + Math.random() * 0.003;

                // Автономный ИИ: планета, вокруг которой сейчас идёт патруль,
                // и точка отступления для ремонта (назначаются в updateBattleshipAI).
                this.patrolPlanet = null;
                this.patrolDwell = undefined;
                this.fleeHome = null;

                // Круговой маршрут патруля по всем планетам фракции.
                // patrolRoute — список планет (обновляется каждые 30 секунд),
                // patrolIndex — следующая планета в маршруте.
                this.patrolRoute = null;
                this.patrolIndex = 0;
                this.patrolRouteRefreshAt = 0;

                this.fireTimer = 0;
                this.sightRange = 250;

                this.turrets = [
                    { angle: 0, targetAngle: 0, x: 12, y: 0 },
                    { angle: Math.PI, targetAngle: Math.PI, x: -12, y: 0 },
                    { angle: 0, targetAngle: 0, x: 0, y: -8 }
                ];

                this.escorts = [];
                this.maxEscorts = 5;
                this.escortSpawnTimer = 0;
                this.escortSpawnRate = 200;
            }
            applyUpgrades() {
                const upgrades = getFactionShipUpgrades(this.faction, 'battleships');
                const hpPct = this.hp / this.maxHp;
                const shieldPct = this.maxShield ? (this.shield / this.maxShield) : 1;

                this.maxHp = (25 + upgrades.armor * 5) * 10;
                this.hp = this.maxHp * hpPct;
                this.atk = (3 + upgrades.attack * 1) * 5;
                this.maxSpd = 0.4 + upgrades.speed * 0.08;

                this.maxShield = this.maxHp * 0.1;
                this.shield = this.maxShield * shieldPct;
                this.shieldRegenRate = this.maxShield * 0.005;
            }

            update() {
                if (!this.active) return false;

                this.fireTimer = Math.max(0, this.fireTimer - 1);

                if (this.faction !== 'parasite') {
                    this.escortSpawnTimer++;
                    if (this.escortSpawnTimer >= this.escortSpawnRate && this.escorts.length < this.maxEscorts) {
                        this.spawnEscort();
                        this.escortSpawnTimer = 0;
                    }
                }

                this.escorts = this.escorts.filter(e => e.active);

                if (this.maxShield && this.shield < this.maxShield && G.time - this.lastDamageTime > this.shieldRegenDelay) {
                    this.shield = Math.min(this.maxShield, this.shield + this.shieldRegenRate);
                }

                this.updateTurrets();

                if (this.faction === 'parasite') {
                    updateParasiteBattleshipAI(this);
                    return this.hp > 0;
                }

                // Линкоры полностью автономны: единый ИИ ведёт бой и патруль.
                this.updateBattleshipAI();

                this.physics();
                return this.hp > 0;
            }

            updateTurrets() {
                let target = this.target;
                if (!this.isValidEnemyShip(target)) {

                    const nearbyShips = spatialGrid.query(this.x, this.y, this.sightRange, 'ship');
                    let minDist = this.sightRange * this.sightRange;

                    for (const ship of nearbyShips) {
                        if (this.isValidEnemyShip(ship)) {
                            const d = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                            if (d < minDist) {
                                minDist = d;
                                target = ship;
                            }
                        }
                    }
                }

                this.turrets.forEach(turret => {
                    if (target && target.active) {
                        const worldX = this.x + Math.cos(this.angle) * turret.x - Math.sin(this.angle) * turret.y;
                        const worldY = this.y + Math.sin(this.angle) * turret.x + Math.cos(this.angle) * turret.y;
                        turret.targetAngle = Math.atan2(target.y - worldY, target.x - worldX) - this.angle;
                    }

                    let diff = turret.targetAngle - turret.angle;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    turret.angle += diff * 0.1;
                });
            }

            // ============================================================
            // АВТОНОМНЫЙ ИИ ЛИНКОРА
            // Линкоры не подчиняются приказам игрока. Они сами ищут и
            // уничтожают врагов (враждебные планеты, корабли-паразитов и
            // прочие враждебные корабли), а в свободное от боя время
            // патрулируют галактику, перемещаясь от планеты к планете.
            // Никаких иных действий линкор не выполняет.
            // ============================================================

            // Квадрат дальности обнаружения врагов (расширенный поиск по карте).
            get huntRange() { return this.sightRange * 3; }

            // Валидный ли вражеский корабль-цель для этого линкора.
            isValidEnemyShip(ship) {
                if (!ship || !ship.active || ship === this) return false;
                if (ship.faction === this.faction) return false;
                // Паразитов уничтожаем всегда (даже если кто-то платит им дань),
                // прочие фракции — только когда реально состоим в войне.
                if (ship.faction === 'parasite') return true;
                return areAtWar(this.faction, ship.faction);
            }

            // Валидная ли враждебная планета-цель.
            isValidEnemyPlanet(planet) {
                if (!planet || !planet.active) return false;
                if (planet.faction === this.faction || planet.faction === 'neutral') return false;
                return areAtWar(this.faction, planet.faction);
            }

            // Поиск ближайшего вражеского корабля в расширенном радиусе охоты.
            findEnemyShip() {
                const range = this.huntRange;
                const nearbyShips = spatialGrid.query(this.x, this.y, range, 'ship');
                let best = null, bestDist = range * range;
                for (const ship of nearbyShips) {
                    if (!this.isValidEnemyShip(ship)) continue;
                    const d = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                    if (d < bestDist) { bestDist = d; best = ship; }
                }
                return best;
            }

            // Поиск ближайшей враждебной планеты в радиусе охоты.
            findEnemyPlanet() {
                const range = this.huntRange;
                const nearbyPlanets = spatialGrid.query(this.x, this.y, range, 'planet');
                let best = null, bestDist = range * range;
                for (const planet of nearbyPlanets) {
                    if (!this.isValidEnemyPlanet(planet)) continue;
                    const d = MathUtils.distanceSquared(this.x, this.y, planet.x, planet.y);
                    if (d < bestDist) { bestDist = d; best = planet; }
                }
                return best;
            }

            // Поиск враждебной планеты по всей карте (когда рядом никого нет).
            findAnyEnemyPlanet() {
                let best = null, bestDist = Infinity;
                for (const planet of G.planets) {
                    if (!this.isValidEnemyPlanet(planet)) continue;
                    const d = MathUtils.distanceSquared(this.x, this.y, planet.x, planet.y);
                    if (d < bestDist) { bestDist = d; best = planet; }
                }
                return best;
            }

            // Ближайшая дружественная планета (для ремонта при отступлении).
            findFriendlyPlanet() {
                let best = null, bestDist = Infinity;
                for (const planet of G.planets) {
                    if (!planet.active || planet.faction !== this.faction) continue;
                    const d = MathUtils.distanceSquared(this.x, this.y, planet.x, planet.y);
                    if (d < bestDist) { bestDist = d; best = planet; }
                }
                return best;
            }

            // Обновление кругового маршрута патруля по всем планетам фракции.
            // Вызывается раз в 30 секунд — линкор «знает» обо всех своих
            // планетах, включая самые дальние, и облетает их по кругу.
            // Если своих планет нет, патрулирует нейтральные, затем любые.
            refreshPatrolRoute() {
                let friendly = [];
                const neutral = [];
                for (const planet of G.planets) {
                    if (!planet.active) continue;
                    if (planet.faction === this.faction) friendly.push(planet);
                    else if (planet.faction === 'neutral') neutral.push(planet);
                }
                // Нет своих планет — патрулируем нейтральные; нет и тех — любые.
                if (friendly.length === 0) {
                    friendly = neutral.length > 0 ? neutral : G.planets.filter(p => p.active);
                }

                // Маршрут начинаем с планеты, ближайшей к текущему положению
                // линкора, затем обходим остальные по кругу.
                let start = 0;
                if (friendly.length > 1) {
                    let bestDist = Infinity;
                    for (let i = 0; i < friendly.length; i++) {
                        const d = MathUtils.distanceSquared(this.x, this.y, friendly[i].x, friendly[i].y);
                        if (d < bestDist) { bestDist = d; start = i; }
                    }
                }
                // Сдвигаем так, чтобы стартовая планета была первой.
                const route = [];
                for (let i = 0; i < friendly.length; i++) {
                    route.push(friendly[(start + i) % friendly.length]);
                }
                this.patrolRoute = route;
                this.patrolIndex = 0;
            }

            // Текущая планета маршрута (та, к которой летим/у которой патрулируем).
            currentPatrolPlanet() {
                if (!this.patrolRoute || this.patrolRoute.length === 0) return null;
                if (this.patrolIndex >= this.patrolRoute.length) this.patrolIndex = 0;
                const p = this.patrolRoute[this.patrolIndex];
                if (!p || !p.active) return null;
                return p;
            }

            // Переход к следующей планете маршрута (по кругу).
            advancePatrolPlanet() {
                this.patrolIndex++;
                if (!this.patrolRoute || this.patrolRoute.length === 0) { this.patrolIndex = 0; return; }
                if (this.patrolIndex >= this.patrolRoute.length) this.patrolIndex = 0;
            }

            // Точка патрулирования вокруг выбранной планеты.
            patrolTargetPoint() {
                const planet = this.patrolPlanet;
                if (!planet) return null;
                this.patrolAngle += this.patrolSpeed;
                const r = (planet.radius || 30) + 90 + Math.random() * 20;
                return {
                    x: planet.x + Math.cos(this.patrolAngle) * r,
                    y: planet.y + Math.sin(this.patrolAngle) * r
                };
            }

            // Сброс боевых целей, возврат к патрулированию.
            resumePatrol() {
                this.target = null;
                this.targetPlanet = null;
                this.state = ShipState.PATROL;
            }

            // Главный цикл автономного ИИ.
            updateBattleshipAI() {
                // 1. Отступление к дружественной планете при низком HP.
                if (this.hp < this.maxHp * 0.35) {
                    this.doAutonomousFlee();
                    return;
                }

                // 2. Обновление текущей цели-корабля (могла умереть/уйти).
                if (this.target) {
                    if (!this.isValidEnemyShip(this.target) || this.target.hp <= 0) {
                        this.target = null;
                    }
                }
                // Обновление цели-планеты (могла быть захвачена/уничтожена).
                if (this.targetPlanet) {
                    if (!this.isValidEnemyPlanet(this.targetPlanet)) {
                        this.targetPlanet = null;
                    }
                }

                // 3. Поиск врагов. Корабли имеют приоритет над планетами.
                //    Периодический поиск, чтобы линкор не «засиживался» на месте.
                const scanInterval = 30;
                if (G.time % scanInterval === 0 || !this.target) {
                    const enemyShip = this.findEnemyShip();
                    if (enemyShip) {
                        this.target = enemyShip;
                        this.targetPlanet = null;
                        this.state = ShipState.ATTACK;
                    } else if (this.targetPlanet) {
                        this.state = ShipState.ASSAULT;
                    } else {
                        const enemyPlanet = this.findEnemyPlanet();
                        if (enemyPlanet) {
                            this.targetPlanet = enemyPlanet;
                            this.state = ShipState.ASSAULT;
                        } else if (G.time % 120 === 0) {
                            // Рядом врагов нет — ищем по всей карте.
                            const distant = this.findAnyEnemyPlanet();
                            if (distant) {
                                this.targetPlanet = distant;
                                this.state = ShipState.TRAVEL;
                            }
                        }
                    }
                }

                // 4. Выполнение текущего состояния.
                switch (this.state) {
                    case ShipState.ATTACK: this.doAutonomousAttack(); break;
                    case ShipState.INTERCEPT: this.doAutonomousIntercept(); break;
                    case ShipState.ASSAULT: this.doAutonomousAssault(); break;
                    case ShipState.TRAVEL: this.doAutonomousTravel(); break;
                    case ShipState.FLEE: this.doAutonomousFlee(); break;
                    default: this.doAutonomousPatrol(); break;
                }
            }

            // Патрулирование: перемещение от планеты к планете по круговому
            // маршруту, охватывающему все планеты фракции (включая дальние).
            doAutonomousPatrol() {
                // Обновляем маршрут раз в 30 секунд (1800 кадров при 60 FPS).
                if (!this.patrolRoute || G.time >= this.patrolRouteRefreshAt) {
                    this.refreshPatrolRoute();
                    // Небольшой разброс по времени между линкорами, чтобы все
                    // не обновляли маршрут в один кадр.
                    this.patrolRouteRefreshAt = G.time + 1800 + Math.floor(Math.random() * 120);
                    this.patrolPlanet = this.currentPatrolPlanet();
                    this.patrolDwell = undefined;
                }

                this.patrolPlanet = this.currentPatrolPlanet();

                if (!this.patrolPlanet) {
                    // Планет нет — дрейф.
                    this.targetAngle += 0.01;
                    this.accelerate(0.2);
                    return;
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.patrolPlanet.x, this.patrolPlanet.y);

                // Достигли текущей планеты маршрута — задерживаемся, затем
                // переходим к следующей планете по кругу.
                if (d < (this.patrolPlanet.radius + 120) * (this.patrolPlanet.radius + 120)) {
                    if (this.patrolDwell === undefined) this.patrolDwell = 120 + Math.floor(Math.random() * 120);
                    this.patrolDwell--;
                    if (this.patrolDwell <= 0) {
                        this.advancePatrolPlanet();
                        this.patrolPlanet = this.currentPatrolPlanet();
                        this.patrolDwell = undefined;
                    }
                }

                if (!this.patrolPlanet) return;

                const pt = this.patrolTargetPoint();
                this.targetAngle = Math.atan2(pt.y - this.y, pt.x - this.x);
                this.accelerate(0.5);
            }

            // Сближение с целью-кораблём.
            doAutonomousIntercept() {
                if (!this.isValidEnemyShip(this.target)) { this.resumePatrol(); return; }

                const d = MathUtils.distanceSquared(this.x, this.y, this.target.x, this.target.y);
                if (d > this.huntRange * this.huntRange) { this.resumePatrol(); return; }
                if (d < 14400) { this.state = ShipState.ATTACK; return; }

                this.targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                this.accelerate(1);
            }

            // Атака цели-корабля.
            doAutonomousAttack() {
                if (!this.isValidEnemyShip(this.target)) { this.resumePatrol(); return; }

                const d = MathUtils.distanceSquared(this.x, this.y, this.target.x, this.target.y);
                if (d > 32400) { this.state = ShipState.INTERCEPT; return; }

                this.targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                this.accelerate(0.3);

                if (this.fireTimer <= 0 && d < 22500) this.fire(this.target);
            }

            // Движение к дальней враждебной планете.
            doAutonomousTravel() {
                if (!this.isValidEnemyPlanet(this.targetPlanet)) { this.resumePatrol(); return; }

                const d = MathUtils.distanceSquared(this.x, this.y, this.targetPlanet.x, this.targetPlanet.y);
                if (d < (this.targetPlanet.radius + 100) * (this.targetPlanet.radius + 100)) {
                    this.state = ShipState.ASSAULT;
                    return;
                }

                // По пути перехватываем замеченных вражеских кораблей.
                if (G.time % 15 === 0) {
                    const enemy = this.findEnemyShip();
                    if (enemy) {
                        this.target = enemy;
                        this.state = ShipState.ATTACK;
                        return;
                    }
                }

                this.targetAngle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                this.accelerate(1);
            }

            // Штурм враждебной планеты.
            doAutonomousAssault() {
                if (!this.isValidEnemyPlanet(this.targetPlanet)) { this.resumePatrol(); return; }

                const d = MathUtils.distanceSquared(this.x, this.y, this.targetPlanet.x, this.targetPlanet.y);
                if (d < (this.targetPlanet.radius + 100) * (this.targetPlanet.radius + 100)) {
                    const angle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                    this.targetAngle = angle + Math.PI / 2.5;
                    this.accelerate(0.35);
                    if (this.fireTimer <= 0) this.firePlanet(this.targetPlanet);
                } else {
                    this.targetAngle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                    this.accelerate(0.8);
                }
            }

            // Отступление к ближайшей дружественной планете для ремонта.
            doAutonomousFlee() {
                if (!this.fleeHome || !this.fleeHome.active || this.fleeHome.faction !== this.faction) {
                    this.fleeHome = this.findFriendlyPlanet();
                }
                if (!this.fleeHome) {
                    // Своих планет нет — чинимся на месте и возвращаемся к патрулю.
                    this.hp = Math.min(this.maxHp, this.hp + 0.05);
                    if (this.hp >= this.maxHp * 0.6) this.resumePatrol();
                    return;
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.fleeHome.x, this.fleeHome.y);
                if (d < (this.fleeHome.radius + 50) * (this.fleeHome.radius + 50)) {
                    this.hp = Math.min(this.maxHp, this.hp + 0.15);
                    if (this.hp > this.maxHp * 0.7) {
                        this.fleeHome = null;
                        this.resumePatrol();
                    }
                    return;
                }

                this.state = ShipState.FLEE;
                this.targetAngle = Math.atan2(this.fleeHome.y - this.y, this.fleeHome.x - this.x);
                this.accelerate(1);
            }

            fire(target) {
                this.turrets.forEach((turret, i) => {
                    const worldX = this.x + Math.cos(this.angle) * turret.x - Math.sin(this.angle) * turret.y;
                    const worldY = this.y + Math.sin(this.angle) * turret.x + Math.cos(this.angle) * turret.y;
                    const fireAngle = this.angle + turret.angle;

                    setTimeout(() => {
                        if (this.active) {
                            spawnProjectile(worldX, worldY, fireAngle + (Math.random() - 0.5) * 0.1, this.faction, this.atk, false, true);
                        }
                    }, i * 50);
                });
                this.fireTimer = 50;
            }

            firePlanet(planet) {
                this.turrets.forEach((turret, i) => {
                    const worldX = this.x + Math.cos(this.angle) * turret.x - Math.sin(this.angle) * turret.y;
                    const worldY = this.y + Math.sin(this.angle) * turret.x + Math.cos(this.angle) * turret.y;
                    const fireAngle = Math.atan2(planet.y - worldY, planet.x - worldX);

                    setTimeout(() => {
                        if (this.active) {
                            spawnProjectile(worldX, worldY, fireAngle, this.faction, this.atk, true, true);
                        }
                    }, i * 50);
                });
                this.fireTimer = 50;
            }

            accelerate(power) {
                let diff = MathUtils.angleDiff(this.angle, this.targetAngle);
                this.angle += diff * 0.04;
                this.vx += Math.cos(this.angle) * this.acc * power;
                this.vy += Math.sin(this.angle) * this.acc * power;
            }

            physics() {
                const spd = Math.hypot(this.vx, this.vy);
                let maxSpd = this.maxSpd;

                if (this.state === ShipState.FLEE) {
                    maxSpd *= 1.7;
                }
                if (spd > maxSpd) {
                    this.vx = (this.vx / spd) * maxSpd;
                    this.vy = (this.vy / spd) * maxSpd;
                }
                this.vx *= 0.98;
                this.vy *= 0.98;
                this.x += this.vx;
                this.y += this.vy;
                this.x = Math.max(30, Math.min(G.mapWidth - 30, this.x));
                this.y = Math.max(30, Math.min(G.mapHeight - 30, this.y));
            }

            takeDamage(dmg, attacker) {
                this.lastDamageTime = G.time || 0;

                let remaining = dmg;

                if (this.maxShield && this.shield > 0) {
                    const absorbed = Math.min(this.shield, remaining);
                    this.shield -= absorbed;
                    remaining -= absorbed;

                    if (absorbed > 0) {
                        spawnParticles(this.x, this.y, '#60a5fa', 1);
                    }
                }

                if (remaining > 0) {
                    this.hp -= remaining;
                    spawnParticles(this.x, this.y, '#ff0', 2);

                    if (this.hp <= 0) {
                        this.die(attacker);
                        return false;
                    }
                }

                // Автономный ИИ линкора сам выбирает цели; ручной перевод в ATTACK не нужен.
                return true;
            }

            die(killerFaction) {
                this.active = false;
                spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 25);
                if (killerFaction && killerFaction !== this.faction) {
                    addFactionStars(killerFaction, 15);
                }
            }

            spawnEscort() {
                if (getFactionStars(this.faction) < 1) return;
                spendFactionStars(this.faction, 1);

                const angle = Math.random() * Math.PI * 2;
                const dist = 40;
                const escort = new EscortShip(
                    this.x + Math.cos(angle) * dist,
                    this.y + Math.sin(angle) * dist,
                    this.faction,
                    this
                );
                this.escorts.push(escort);
                G.ships.push(escort);
            }
        }

        class EscortShip {
            constructor(x, y, faction, mothership) {
                this.x = x;
                this.y = y;
                this.vx = 0;
                this.vy = 0;
                this.faction = faction;
                this.mothership = mothership;
                this.guardPlanet = null; // set when mothership is gone (e.g., colonizer finished)
                this.active = true;
                this.shipType = ShipType.FIGHTER;

                const upgrades = getFactionShipUpgrades(faction, 'escorts');
                this.maxHp = (2 + upgrades.armor * 1.5) * 0.5;
                this.hp = this.maxHp;
                this.atk = (0.8 + upgrades.attack * 0.6) * 0.5;
                this.maxSpd = (0.8 + upgrades.speed * 0.25) * 1.5;
                this.acc = 0.06;

                this.angle = Math.random() * Math.PI * 2;
                this.targetAngle = this.angle;
                this.target = null;
                this.fireTimer = 0;
                this.sightRange = 150;
                this.orbitAngle = Math.random() * Math.PI * 2;
                this.orbitRadius = (50 + Math.random() * 30) * 2;
                this.orbitSpeed = 0.02;
            }

            applyUpgrades() {
                const upgrades = getFactionShipUpgrades(this.faction, 'escorts');
                const hpPct = this.hp / this.maxHp;
                this.maxHp = (2 + upgrades.armor * 1.5) * 0.5;
                this.hp = this.maxHp * hpPct;
                this.atk = (0.8 + upgrades.attack * 0.6) * 0.5;
                this.maxSpd = (0.8 + upgrades.speed * 0.25) * 1.5;
            }

            update() {
                if (!this.active) return false;

                const mothershipAlive = !!(this.mothership && this.mothership.active);
                const guarding = !!(this.guardPlanet && this.guardPlanet.active && this.guardPlanet.faction === this.faction);
                if (!mothershipAlive && !guarding) {
                    this.active = false;
                    return false;
                }

                this.fireTimer = Math.max(0, this.fireTimer - 1);

                if (!this.target || !this.target.active || this.target.hp <= 0 || !areAtWar(this.faction, this.target.faction)) {
                    this.target = null;

                    const nearbyShips = spatialGrid.query(this.x, this.y, this.sightRange, 'ship');
                    let minDist = this.sightRange * this.sightRange;

                    for (const ship of nearbyShips) {
                        if (ship.faction !== this.faction && ship.active && areAtWar(this.faction, ship.faction)) {
                            const d = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                            if (d < minDist) {
                                minDist = d;
                                this.target = ship;
                            }
                        }
                    }
                }

                if (this.target) {
                    this.attackTarget();
                } else {
                    if (mothershipAlive) this.orbitMothership(); else this.orbitGuardPlanet();
                }

                this.physics();
                return this.hp > 0;
            }

            orbitMothership() {
                this.orbitAngle += this.orbitSpeed;
                const tx = this.mothership.x + Math.cos(this.orbitAngle) * this.orbitRadius;
                const ty = this.mothership.y + Math.sin(this.orbitAngle) * this.orbitRadius;

                this.targetAngle = Math.atan2(ty - this.y, tx - this.x);
                this.accelerate(0.8);
            }

            orbitGuardPlanet() {
                if (!this.guardPlanet || !this.guardPlanet.active) return;
                this.orbitAngle += this.orbitSpeed;
                const r = (this.guardPlanet.radius || 30) + 110 + (this.orbitRadius % 25);
                const tx = this.guardPlanet.x + Math.cos(this.orbitAngle) * r;
                const ty = this.guardPlanet.y + Math.sin(this.orbitAngle) * r;

                this.targetAngle = Math.atan2(ty - this.y, tx - this.x);
                this.accelerate(0.8);
            }

            attackTarget() {
                const d = MathUtils.distanceSquared(this.x, this.y, this.target.x, this.target.y);

                if (d > this.sightRange * this.sightRange * 2) {
                    this.target = null;
                    return;
                }

                if (d < 10000) {
                    const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                    this.targetAngle = angle + Math.PI / 2.5;
                    this.accelerate(0.7);

                    if (this.fireTimer <= 0 && d < 8100) {
                        this.fire();
                    }
                } else {
                    this.targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                    this.accelerate(1);
                }
            }

            fire() {
                const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                spawnProjectile(
                    this.x + Math.cos(angle) * 5,
                    this.y + Math.sin(angle) * 5,
                    angle + (Math.random() - 0.5) * 0.2,
                    this.faction,
                    this.atk,
                    false,
                    false
                );
                this.fireTimer = 25;
            }

            accelerate(power) {
                let diff = MathUtils.angleDiff(this.angle, this.targetAngle);
                this.angle += diff * 0.1;
                this.vx += Math.cos(this.angle) * this.acc * power;
                this.vy += Math.sin(this.angle) * this.acc * power;
            }

            physics() {
                const spd = Math.hypot(this.vx, this.vy);
                if (spd > this.maxSpd) {
                    this.vx = (this.vx / spd) * this.maxSpd;
                    this.vy = (this.vy / spd) * this.maxSpd;
                }
                this.vx *= 0.96;
                this.vy *= 0.96;
                this.x += this.vx;
                this.y += this.vy;
                this.x = Math.max(15, Math.min(G.mapWidth - 15, this.x));
                this.y = Math.max(15, Math.min(G.mapHeight - 15, this.y));
            }

            takeDamage(dmg, attacker) {
                this.hp -= dmg;
                spawnParticles(this.x, this.y, '#ff0', 1);

                if (this.hp <= 0) {
                    this.die(attacker);
                    return false;
                }

                if (!this.target && attacker) {
                    this.target = attacker;
                }
                return true;
            }

            die(killerFaction) {
                this.active = false;
                spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 6);
                if (killerFaction && killerFaction !== this.faction) {
                    addFactionStars(killerFaction, 1);
                }
            }
        }

        // === CARGO SHIP (Грузовой корабль) ===
        // Hauls etherium from uninhabited planets to nearest inhabited planet
        class CargoShip {
            constructor(x, y, faction, sourcePlanet) {
                this.x = x;
                this.y = y;
                this.vx = 0;
                this.vy = 0;
                this.faction = faction;
                this.home = sourcePlanet;
                this.sourcePlanet = sourcePlanet; // uninhabited planet (mine)
                this.targetPlanet = null; // nearest inhabited planet (delivery)
                this.active = true;
                this.shipType = ShipType.CARGO;
                this.role = ShipRole.ATTACKER;

                this.maxHp = 12;
                this.hp = this.maxHp;
                this.atk = 0; // cargo ships don't fight
                this.maxSpd = 0.6;
                this.acc = 0.025;

                this.angle = Math.random() * Math.PI * 2;
                this.targetAngle = this.angle;
                this.state = ShipState.HAULING;

                this.loaded = false; // whether carrying etherium
                this.loadTimer = 0;
                this.loadTime = 180; // 3 seconds at 60fps to load/unload

                this.escorts = [];
                this.maxEscorts = 5;
                this.escortSpawnTimer = 0;
                this.escortSpawnRate = 150;

                this.lastNearestCheck = 0;
                this.nearestCheckInterval = 30 * 60; // 30 seconds at 60fps

                this.fireTimer = 0;
                this.sightRange = 100;

                // Find initial delivery target
                this._findNearestInhabited();
            }

            _findNearestInhabited() {
                let best = null;
                let bestDist = Infinity;
                for (const p of G.planets) {
                    if (!p.active || p.faction !== this.faction) continue;
                    if (!p.inhabited) continue;
                    const d = MathUtils.distanceSquared(this.sourcePlanet.x, this.sourcePlanet.y, p.x, p.y);
                    if (d < bestDist) {
                        bestDist = d;
                        best = p;
                    }
                }
                this.targetPlanet = best;
            }

            spawnEscort() {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30;
                const escort = new EscortShip(
                    this.x + Math.cos(angle) * dist,
                    this.y + Math.sin(angle) * dist,
                    this.faction,
                    this
                );
                this.escorts.push(escort);
                G.ships.push(escort);
            }

            update() {
                if (!this.active) return false;

                // Check if source planet still belongs to us
                if (!this.sourcePlanet || !this.sourcePlanet.active || this.sourcePlanet.faction !== this.faction) {
                    this.die('');
                    return false;
                }

                // Spawn escorts
                this.escortSpawnTimer++;
                if (this.escortSpawnTimer >= this.escortSpawnRate && this.escorts.length < this.maxEscorts) {
                    this.spawnEscort();
                    this.escortSpawnTimer = 0;
                }
                this.escorts = this.escorts.filter(e => e.active);

                // Periodically recheck nearest inhabited planet
                this.lastNearestCheck++;
                if (this.lastNearestCheck >= this.nearestCheckInterval) {
                    this.lastNearestCheck = 0;
                    this._findNearestInhabited();
                }

                // If no delivery target, just orbit source
                if (!this.targetPlanet || !this.targetPlanet.active || this.targetPlanet.faction !== this.faction || !this.targetPlanet.inhabited) {
                    this._findNearestInhabited();
                    if (!this.targetPlanet) {
                        // Orbit around source planet
                        this._orbitPlanet(this.sourcePlanet);
                        this.physics();
                        return this.hp > 0;
                    }
                }

                // State machine: go to source, load, go to target, unload, repeat
                if (!this.loaded) {
                    // Go to source planet to pick up
                    const dSrc = Math.hypot(this.sourcePlanet.x - this.x, this.sourcePlanet.y - this.y);
                    if (dSrc < this.sourcePlanet.radius + 25) {
                        // Loading
                        this.loadTimer++;
                        if (this.loadTimer >= this.loadTime) {
                            this.loaded = true;
                            this.loadTimer = 0;
                        }
                        // Stay near planet
                        this._orbitPlanet(this.sourcePlanet);
                    } else {
                        // Travel to source
                        this.targetAngle = Math.atan2(this.sourcePlanet.y - this.y, this.sourcePlanet.x - this.x);
                        this.accelerate(1);
                    }
                } else {
                    // Go to delivery planet
                    const dTgt = Math.hypot(this.targetPlanet.x - this.x, this.targetPlanet.y - this.y);
                    if (dTgt < this.targetPlanet.radius + 25) {
                        // Unloading
                        this.loadTimer++;
                        if (this.loadTimer >= this.loadTime) {
                            // Deliver etherium!
                            addFactionEtherium(this.faction, CARGO_ETHERIUM_PER_DELIVERY);
                            if (this.faction === 'player') {
                                // Optional: subtle notification
                            }
                            this.loaded = false;
                            this.loadTimer = 0;
                        }
                        this._orbitPlanet(this.targetPlanet);
                    } else {
                        // Travel to target
                        this.targetAngle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                        this.accelerate(1);
                    }
                }

                this.physics();
                return this.hp > 0;
            }

            _orbitPlanet(planet) {
                if (!this._orbitAngle) this._orbitAngle = Math.random() * Math.PI * 2;
                this._orbitAngle += 0.015;
                const r = planet.radius + 20;
                const tx = planet.x + Math.cos(this._orbitAngle) * r;
                const ty = planet.y + Math.sin(this._orbitAngle) * r;
                this.targetAngle = Math.atan2(ty - this.y, tx - this.x);
                this.accelerate(0.4);
            }

            accelerate(power) {
                let diff = MathUtils.angleDiff(this.angle, this.targetAngle);
                this.angle += diff * 0.08;
                this.vx += Math.cos(this.angle) * this.acc * power;
                this.vy += Math.sin(this.angle) * this.acc * power;
            }

            physics() {
                const spd = Math.hypot(this.vx, this.vy);
                if (spd > this.maxSpd) {
                    this.vx = (this.vx / spd) * this.maxSpd;
                    this.vy = (this.vy / spd) * this.maxSpd;
                }
                this.vx *= 0.97;
                this.vy *= 0.97;
                this.x += this.vx;
                this.y += this.vy;
                this.x = Math.max(15, Math.min(G.mapWidth - 15, this.x));
                this.y = Math.max(15, Math.min(G.mapHeight - 15, this.y));
            }

            takeDamage(dmg, attacker) {
                this.hp -= dmg;
                spawnParticles(this.x, this.y, '#a855f7', 1);
                if (this.hp <= 0) {
                    this.die(attacker);
                    return false;
                }
                return true;
            }

            die(killerFaction) {
                this.active = false;
                if (this.sourcePlanet) this.sourcePlanet.cargoShip = null;
                spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 12);
                // Kill escorts
                for (const e of this.escorts) {
                    if (e.active) {
                        e.active = false;
                        spawnExplosion(e.x, e.y, getFactionColorMain(e.faction), 6);
                    }
                }
                this.escorts = [];
                if (killerFaction && killerFaction !== this.faction && killerFaction !== 'parasite') {
                    addFactionStars(killerFaction, 5);
                }
            }
        }

        // Build cargo ship for a planet
        function buildCargoShip(faction, uninhabitedPlanet) {
            if (!uninhabitedPlanet || uninhabitedPlanet.inhabited) return null;
            if (uninhabitedPlanet.cargoShip && uninhabitedPlanet.cargoShip.active) return null; // already has one

            const angle = Math.random() * Math.PI * 2;
            const dist = uninhabitedPlanet.radius + 30;
            const cargo = new CargoShip(
                uninhabitedPlanet.x + Math.cos(angle) * dist,
                uninhabitedPlanet.y + Math.sin(angle) * dist,
                faction,
                uninhabitedPlanet
            );
            uninhabitedPlanet.cargoShip = cargo;
            G.ships.push(cargo);
            return cargo;
        }

        
        class Colonizer {
            constructor(x, y, faction, home) {
                this.x = x;
                this.y = y;
                this.vx = 0;
                this.vy = 0;
                this.angle = Math.random() * Math.PI * 2;
                this.targetAngle = this.angle;

                this.faction = faction;
                this.home = home || null;

                this.shipType = ShipType.COLONIZER;
                this.role = ShipRole.ATTACKER;

                this.active = true;

                this.maxHp = 260;
                this.hp = this.maxHp;

                this.acc = 0.012;
                this.maxSpd = 0.28;

                this.state = ShipState.TRAVEL;
                this.targetPlanet = null;

                this.patrolAngle = Math.random() * Math.PI * 2;
                this.patrolRadius = (this.home ? (this.home.radius + 120) : 90);
                this.patrolSpeed = 0.012;

                this.escorts = [];
                this.maxEscorts = 15;
                this.escortSpawnTimer = 30;

                this.colonizeTicksLeft = 0;

                this.applyUpgrades();
            }

            applyUpgrades() {
                const upgrades = getFactionShipUpgrades(this.faction, 'escorts');
                this.maxSpd = 0.28 + upgrades.speed * 0.05;
                this.maxHp = 240 + upgrades.armor * 35;
                this.hp = Math.min(this.hp, this.maxHp);
            }

            trySpawnEscort() {
                if (this.escorts.length >= this.maxEscorts) return;

                const funds = getFactionStars(this.faction);
                if (funds < COLONIZER_ESCORT_COST) return;

                spendFactionStars(this.faction, COLONIZER_ESCORT_COST);

                const escort = new EscortShip(this.x, this.y, this.faction, this);
                this.escorts.push(escort);
                G.ships.push(escort);

                this.escortSpawnTimer = 75;
            }

            update() {
                if (!this.active) return false;

                this.escorts = this.escorts.filter(e => e && e.active);
                if (this.escortSpawnTimer <= 0) this.trySpawnEscort();
                else this.escortSpawnTimer--;

                if (this.state === ShipState.COLONIZE) this.doColonize();
                else this.doTravelOrIdle();

                this.physics();
                return this.hp > 0 && this.active;
            }

            doTravelOrIdle() {
                if (this._returningHome) {
                    this._doReturnHome();
                    return;
                }

                if (!this.targetPlanet || !this.targetPlanet.active) {
                    this.targetPlanet = null;
                    this._findNewTargetOrGoHome();
                    return;
                }

                if (this.targetPlanet.faction !== 'neutral') {
                    this.targetPlanet = null;
                    this._findNewTargetOrGoHome();
                    return;
                }

                if (this.targetPlanet.colonizing && this.targetPlanet.colonizing.faction !== this.faction) {
                    const otherFaction = this.targetPlanet.colonizing.faction;
                    if (!areAtWar(this.faction, otherFaction)) {
                        const alt = this._findAlternativeTarget();
                        if (alt) {
                            this.targetPlanet = alt;
                        } else {
                            this.targetPlanet = null;
                            this._returningHome = true;
                            this._doReturnHome();
                            return;
                        }
                    }
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.targetPlanet.x, this.targetPlanet.y);
                const arriveR = (this.targetPlanet.radius + 60);
                if (d < arriveR * arriveR) {
                    if (this.targetPlanet.colonizing && this.targetPlanet.colonizing.faction !== this.faction) {
                        this.vx *= 0.95;
                        this.vy *= 0.95;
                        return;
                    }
                    this.beginColonize();
                    return;
                }

                this.targetAngle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                this.accelerate(1);
            }

            _findAlternativeTarget() {
                let bestPlanet = null;
                let bestDist = Infinity;
                for (let i = 0; i < G.planets.length; i++) {
                    const p = G.planets[i];
                    if (!p.active || p.faction !== 'neutral') continue;
                    if (p.colonizing) continue;
                    if (p === this.targetPlanet) continue;
                    const d = MathUtils.distanceSquared(this.x, this.y, p.x, p.y);
                    if (d < bestDist) { bestDist = d; bestPlanet = p; }
                }
                return bestPlanet;
            }

            _findNewTargetOrGoHome() {
                const alt = this._findAlternativeTarget();
                if (alt) {
                    this.targetPlanet = alt;
                } else {
                    this._returningHome = true;
                    this._doReturnHome();
                }
            }

            _doReturnHome() {
                if (!this.home || !this.home.active || this.home.faction !== this.faction) {
                    const friendly = G.planets.find(p => p.faction === this.faction);
                    if (friendly) this.home = friendly;
                }
                if (!this.home) {
                    addFactionStars(this.faction, 20);
                    this._disbandEscorts(null);
                    this.active = false;
                    spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 12);
                    return;
                }
                const d = MathUtils.distanceSquared(this.x, this.y, this.home.x, this.home.y);
                const arriveR = (this.home.radius + 60);
                if (d < arriveR * arriveR) {
                    addFactionStars(this.faction, 20);
                    if (this.faction === 'player') {
                        pushSystemInbox('🛰 Колонизатор вернулся: свободных планет нет. Возврат 20💲.');
                    }
                    this._disbandEscorts(this.home);
                    this.active = false;
                    spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 12);
                    return;
                }
                this.targetAngle = Math.atan2(this.home.y - this.y, this.home.x - this.x);
                this.accelerate(1);
            }

            _disbandEscorts(planet) {
                for (const e of this.escorts) {
                    if (!e || !e.active) continue;
                    if (planet) {
                        e.guardPlanet = planet;
                        e.mothership = null;
                        e.orbitRadius = (planet.radius || 30) + 110 + Math.random() * 25;
                    } else {
                        e.mothership = null;
                        e.active = false;
                    }
                }
                this.escorts = [];
            }

            doIdle() {
                this._findNewTargetOrGoHome();
            }

            beginColonize() {
                if (!this.targetPlanet || this.targetPlanet.faction !== 'neutral') return;

                // Prevent multiple colonizers on same planet
                if (this.targetPlanet.colonizing && this.targetPlanet.colonizing.colonizer && this.targetPlanet.colonizing.colonizer !== this) return;

                this.state = ShipState.COLONIZE;
                this.colonizeTicksLeft = COLONIZATION_TIME_TICKS;
                this.vx = 0;
                this.vy = 0;

                this.targetPlanet.colonizing = {
                    faction: this.faction,
                    startTime: G.time,
                    endTime: G.time + COLONIZATION_TIME_TICKS,
                    colonizer: this
                };
            }

            cancelColonize() {
                if (this.targetPlanet && this.targetPlanet.colonizing && this.targetPlanet.colonizing.colonizer === this) {
                    this.targetPlanet.colonizing = null;
                }
                this.state = ShipState.TRAVEL;
                this.colonizeTicksLeft = 0;
                this.targetPlanet = null;
            }

            doColonize() {
                if (!this.targetPlanet || !this.targetPlanet.active) { this.cancelColonize(); return; }
                if (this.targetPlanet.faction !== 'neutral') { this.cancelColonize(); return; }

                const col = this.targetPlanet.colonizing;
                if (!col || col.colonizer !== this) { this.cancelColonize(); return; }

                // Stay near the planet while colonizing
                const d = MathUtils.distanceSquared(this.x, this.y, this.targetPlanet.x, this.targetPlanet.y);
                const keepR = (this.targetPlanet.radius + 45);
                if (d > keepR * keepR) {
                    this.targetAngle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                    this.accelerate(0.8);
                } else {
                    this.vx *= 0.92;
                    this.vy *= 0.92;
                }

                this.colonizeTicksLeft--;

                if (this.colonizeTicksLeft <= 0 || G.time >= col.endTime) {
                    // Finish colonization
                    const p = this.targetPlanet;
                    try { if (p) p.colonize(this.faction); } catch (e) { console.error(e); }
                    if (p && p.colonizing && p.colonizing.colonizer === this) {
                        p.colonizing = null;
                    }

                    // Colonizer disappears, escorts stay to guard the new planet
                    if (p && this.escorts && this.escorts.length) {
                        for (const e of this.escorts) {
                            if (!e || !e.active) continue;
                            e.guardPlanet = p;
                            e.mothership = null;
                            e.orbitRadius = (p.radius || 30) + 110 + Math.random() * 25;
                        }
                    }
                    this.escorts = [];

                    if (this.faction === 'player') {
                        pushSystemInbox('✅ Планета колонизирована: ' + ((p && p.name) || ''));
                    }

                    this.active = false;
                    spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 12);
                }
            }

            takeDamage(dmg, attackerFaction) {
                if (this.faction === 'neutral') return;
                this.hp -= dmg;
                spawnParticles(this.x, this.y, '#9ca3af', 1);

                if (this.hp <= 0) {
                    this.die(attackerFaction);
                    return false;
                }
                return true;
            }

            die(killerFaction) {
                if (!this.active) return;
                this.active = false;

                // Cancel colonization if in progress
                if (this.state === ShipState.COLONIZE) {
                    this.cancelColonize();
                }

                spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 16);
                if (killerFaction && killerFaction !== this.faction && killerFaction !== 'parasite') {
                    addFactionStars(killerFaction, 1);
                }
            }

            accelerate(power) {
                let diff = MathUtils.angleDiff(this.angle, this.targetAngle);
                this.angle += diff * 0.07;
                this.vx += Math.cos(this.angle) * this.acc * power;
                this.vy += Math.sin(this.angle) * this.acc * power;
            }

            physics() {
                const spd = Math.hypot(this.vx, this.vy);
                if (spd > this.maxSpd) {
                    this.vx = (this.vx / spd) * this.maxSpd;
                    this.vy = (this.vy / spd) * this.maxSpd;
                }
                this.vx *= 0.975;
                this.vy *= 0.975;
                this.x += this.vx;
                this.y += this.vy;
                this.x = Math.max(20, Math.min(G.mapWidth - 20, this.x));
                this.y = Math.max(20, Math.min(G.mapHeight - 20, this.y));
            }
        }

class Ship {
            constructor(x, y, faction, home, role = ShipRole.ATTACKER) {
                this.x = x;
                this.y = y;
                this.vx = 0;
                this.vy = 0;
                this.faction = faction;
                this.home = home;
                this.role = role;
                this.targetPlanet = null;
                this.target = null;
                this.waypoint = null;
                this.active = true;
                this.shipType = ShipType.FIGHTER;

                const isDefender = role === ShipRole.DEFENDER;

                const upgrades = getFactionShipUpgrades(faction, isDefender ? 'defenders' : 'fighters');

                if (isDefender) {
                    this.maxHp = 3 + upgrades.armor * 1.5;
                    this.atk = 1 + upgrades.attack * 0.5;
                    this.maxSpd = 0.5 + upgrades.speed * 0.15;
                } else {
                    this.maxHp = 2 + upgrades.armor * 1.5;
                    this.atk = 0.8 + upgrades.attack * 0.6;
                    this.maxSpd = 0.8 + upgrades.speed * 0.25;
                }

                this.hp = this.maxHp;
                this.acc = 0.04;

                this.angle = Math.random() * Math.PI * 2;
                this.targetAngle = this.angle;
                this.state = isDefender ? ShipState.GUARD : ShipState.PATROL;

                this.patrolAngle = Math.random() * Math.PI * 2;
                this.patrolRadius = (home ? home.radius : 30) + (isDefender ? 45 + Math.random() * 20 : 70 + Math.random() * 40);
                this.patrolSpeed = 0.012 + Math.random() * 0.008;

                this.fireTimer = 0;
                this.sightRange = isDefender ? 120 : 180;
            }

            applyUpgrades() {
                const isDefender = this.role === ShipRole.DEFENDER;
                const upgrades = getFactionShipUpgrades(this.faction, isDefender ? 'defenders' : 'fighters');
                const hpPct = this.hp / this.maxHp;

                if (this.role === ShipRole.DEFENDER) {
                    this.maxHp = 3 + upgrades.armor * 1.5;
                    this.atk = 1 + upgrades.attack * 0.5;
                    this.maxSpd = 0.5 + upgrades.speed * 0.15;
                } else {
                    this.maxHp = 2 + upgrades.armor * 1.5;
                    this.atk = 0.8 + upgrades.attack * 0.6;
                    this.maxSpd = 0.8 + upgrades.speed * 0.25;
                }

                this.hp = this.maxHp * hpPct;
            }

            update() {
                if (!this.active) return false;

                this.fireTimer = Math.max(0, this.fireTimer - 1);

                switch (this.state) {
                    case ShipState.PATROL: this.doPatrol(); break;
                    case ShipState.GUARD: this.doGuard(); break;
                    case ShipState.INTERCEPT: this.doIntercept(); break;
                    case ShipState.ATTACK: this.doAttack(); break;
                    case ShipState.FLEE: this.doFlee(); break;
                    case ShipState.TRAVEL: this.doTravel(); break;
                    case ShipState.ASSAULT: this.doAssault(); break;
                    case ShipState.WAYPOINT: this.doWaypoint(); break;
                    case ShipState.COLONIZE: this.doColonize(); break;
                }

                if ((this.state === ShipState.PATROL || this.state === ShipState.GUARD) && G.time % 3 === 0) {
                    this.checkThreats();
                }

                if (this.hp < this.maxHp * 0.2 && this.state !== ShipState.FLEE && this.state !== ShipState.TRAVEL) {
                    this.state = ShipState.FLEE;
                    this.target = null;
                }

                this.physics();
                return this.hp > 0;
            }

            doGuard() {
                if (!this.home || !this.home.active || this.home.faction !== this.faction) {
                    const friendly = G.planets.find(p => p.faction === this.faction);
                    if (friendly) this.home = friendly;
                    return;
                }
                this.patrolAngle += this.patrolSpeed;
                const tx = this.home.x + Math.cos(this.patrolAngle) * this.patrolRadius;
                const ty = this.home.y + Math.sin(this.patrolAngle) * this.patrolRadius;
                this.targetAngle = Math.atan2(ty - this.y, tx - this.x);
                this.accelerate(0.4);

                if (G.time % 5 === 0) {

                    const nearbyShips = spatialGrid.query(this.x, this.y, this.sightRange, 'ship');
                    for (const ship of nearbyShips) {
                        if (ship.faction !== this.faction && ship.active && areAtWar(this.faction, ship.faction)) {
                            const d = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                            if (d < this.sightRange * this.sightRange) {
                                this.target = ship;
                                this.state = ShipState.INTERCEPT;
                                return;
                            }
                        }
                    }

                    const nearbyPlanets = spatialGrid.query(this.x, this.y, this.sightRange, 'planet');
                    for (const planet of nearbyPlanets) {
                        if (planet.faction !== this.faction && areAtWar(this.faction, planet.faction)) {
                            const d = MathUtils.distanceSquared(this.x, this.y, planet.x, planet.y);
                            if (d < this.sightRange * this.sightRange && this.role === ShipRole.DEFENDER) {
                                const homeD = MathUtils.distanceSquared(planet.x, planet.y, this.home.x, this.home.y);
                                if (homeD < 22500) {
                                    this.targetPlanet = planet;
                                    this.state = ShipState.ASSAULT;
                                    return;
                                }
                            }
                        }
                    }
                }
            }

            doPatrol() {
                if (!this.home || !this.home.active) {
                    const friendly = G.planets.find(p => p.faction === this.faction);
                    if (friendly) this.home = friendly;
                    return;
                }
                this.patrolAngle += this.patrolSpeed;
                const tx = this.home.x + Math.cos(this.patrolAngle) * this.patrolRadius;
                const ty = this.home.y + Math.sin(this.patrolAngle) * this.patrolRadius;
                this.targetAngle = Math.atan2(ty - this.y, tx - this.x);
                this.accelerate(0.5);
            }

            doWaypoint() {
                if (!this.waypoint) {
                    this.state = this.role === ShipRole.DEFENDER ? ShipState.GUARD : ShipState.PATROL;
                    return;
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.waypoint.x, this.waypoint.y);
                if (d < 2500) {
                    this.patrolAngle += this.patrolSpeed;
                    const tx = this.waypoint.x + Math.cos(this.patrolAngle) * 40;
                    const ty = this.waypoint.y + Math.sin(this.patrolAngle) * 40;
                    this.targetAngle = Math.atan2(ty - this.y, tx - this.x);
                    this.accelerate(0.4);
                } else {
                    this.targetAngle = Math.atan2(this.waypoint.y - this.y, this.waypoint.x - this.x);
                    this.accelerate(1);
                }

                const nearbyShips = spatialGrid.query(this.x, this.y, this.sightRange, 'ship');
                for (const ship of nearbyShips) {
                    if (ship.faction !== this.faction && ship.active && areAtWar(this.faction, ship.faction)) {
                        const sd = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                        if (sd < this.sightRange * this.sightRange) {
                            this.target = ship;
                            this.state = ShipState.ATTACK;
                            return;
                        }
                    }
                }

                const nearbyPlanets = spatialGrid.query(this.x, this.y, this.sightRange, 'planet');
                for (const planet of nearbyPlanets) {
                    if (planet.faction !== this.faction && areAtWar(this.faction, planet.faction)) {
                        const pd = MathUtils.distanceSquared(this.x, this.y, planet.x, planet.y);
                        if (pd < this.sightRange * this.sightRange) {
                            this.targetPlanet = planet;
                            this.state = ShipState.ASSAULT;
                            return;
                        }
                    }
                }
            }

            checkThreats() {
                let closest = null, closestDist = this.sightRange * this.sightRange;

                const nearbyShips = spatialGrid.query(this.x, this.y, this.sightRange, 'ship');
                for (const ship of nearbyShips) {
                    if (ship.faction !== this.faction && ship.active && areAtWar(this.faction, ship.faction)) {
                        const d = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                        if (d < closestDist) {
                            closestDist = d;
                            closest = ship;
                        }
                    }
                }

                if (closest) {
                    this.target = closest;
                    this.state = ShipState.INTERCEPT;
                    return;
                }

                if (this.role === ShipRole.DEFENDER) return;

                const nearbyPlanets = spatialGrid.query(this.x, this.y, this.sightRange * 1.2, 'planet');
                for (const planet of nearbyPlanets) {
                    if (planet.faction !== this.faction && areAtWar(this.faction, planet.faction)) {
                        const d = MathUtils.distanceSquared(this.x, this.y, planet.x, planet.y);
                        if (d < this.sightRange * this.sightRange * 1.44) {
                            this.targetPlanet = planet;
                            this.state = ShipState.ASSAULT;
                            return;
                        }
                    }
                }
            }

            doIntercept() {
                if (!this.target || !this.target.active || this.target.hp <= 0 || !areAtWar(this.faction, this.target.faction)) {
                    this.returnToBase();
                    return;
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.target.x, this.target.y);

                if (this.role === ShipRole.DEFENDER && this.home) {
                    const distFromHome = MathUtils.distanceSquared(this.x, this.y, this.home.x, this.home.y);
                    if (distFromHome > 40000) {
                        this.returnToBase();
                        return;
                    }
                }

                if (d > this.sightRange * this.sightRange * 3.24) {
                    this.returnToBase();
                    return;
                }
                if (d < 6400) {
                    this.state = ShipState.ATTACK;
                    return;
                }

                const px = this.target.x + this.target.vx * 12;
                const py = this.target.y + this.target.vy * 12;
                this.targetAngle = Math.atan2(py - this.y, px - this.x);
                this.accelerate(1);
            }

            doAttack() {
                if (!this.target || !this.target.active || this.target.hp <= 0 || !areAtWar(this.faction, this.target.faction)) {
                    this.returnToBase();
                    return;
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.target.x, this.target.y);

                if (this.role === ShipRole.DEFENDER && this.home) {
                    const distFromHome = MathUtils.distanceSquared(this.x, this.y, this.home.x, this.home.y);
                    if (distFromHome > 32400) {
                        this.returnToBase();
                        return;
                    }
                }

                if (d > 16900) {
                    this.state = ShipState.INTERCEPT;
                    return;
                }

                const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                this.targetAngle = angle + Math.PI / 2.2;
                this.accelerate(0.65);

                if (this.fireTimer <= 0 && d < 12100) this.fire(this.target);
            }

            returnToBase() {
                this.target = null;
                if (this.waypoint) {
                    this.state = ShipState.WAYPOINT;
                } else if (this.role === ShipRole.DEFENDER) {
                    this.state = ShipState.GUARD;
                } else {
                    this.state = ShipState.PATROL;
                }
            }

            doFlee() {
                if (!this.home || this.home.faction !== this.faction) {
                    const friendly = G.planets.find(p => p.faction === this.faction);
                    if (friendly) this.home = friendly;
                    else { this.returnToBase(); return; }
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.home.x, this.home.y);
                if (d < (this.home.radius + 30) * (this.home.radius + 30)) {
                    this.hp = Math.min(this.maxHp, this.hp + 0.08);
                    if (this.hp > this.maxHp * 0.65) this.returnToBase();
                }

                this.targetAngle = Math.atan2(this.home.y - this.y, this.home.x - this.x);
                this.accelerate(1);
            }

            doTravel() {
                // Parasites must never target planets
                if (this.faction === 'parasite') { this.targetPlanet = null; this.state = ShipState.PATROL; return; }

                if (!this.targetPlanet) { this.returnToBase(); return; }

                const d = MathUtils.distanceSquared(this.x, this.y, this.targetPlanet.x, this.targetPlanet.y);

                if (this.targetPlanet.faction === this.faction) {
                    if (d < (this.targetPlanet.radius + 60) * (this.targetPlanet.radius + 60)) {
                        this.patrolRadius = this.targetPlanet.radius + 90 + Math.random() * 40;
                        this.targetPlanet = null;
                        this.returnToBase();
                        return;
                    }
                }

                if (d < (this.targetPlanet.radius + 70) * (this.targetPlanet.radius + 70)) {
                    if (this.targetPlanet.faction !== this.faction) {
                        this.state = ShipState.ASSAULT;
                    } else {
                        this.targetPlanet = null;
                        this.returnToBase();
                    }
                    return;
                }

                const nearbyShips = spatialGrid.query(this.x, this.y, 70, 'ship');
                for (const ship of nearbyShips) {
                    if (ship.faction !== this.faction && ship.active && areAtWar(this.faction, ship.faction)) {
                        const sd = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                        if (sd < 4900) {
                            this.target = ship;
                            this.state = ShipState.ATTACK;
                            return;
                        }
                    }
                }

                this.targetAngle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                this.accelerate(1);
            }

            doAssault() {
                // Parasites must never assault planets
                if (this.faction === 'parasite') { this.targetPlanet = null; this.state = ShipState.PATROL; return; }

                if (!this.targetPlanet) { this.returnToBase(); return; }

                if (this.targetPlanet.faction === this.faction) {
                    this.targetPlanet = null;
                    this.returnToBase();
                    return;
                }

                if (!areAtWar(this.faction, this.targetPlanet.faction)) {
                    this.targetPlanet = null;
                    this.returnToBase();
                    return;
                }

                if (this.role === ShipRole.DEFENDER && this.home) {
                    const distFromHome = MathUtils.distanceSquared(this.x, this.y, this.home.x, this.home.y);
                    if (distFromHome > 32400) {
                        this.targetPlanet = null;
                        this.returnToBase();
                        return;
                    }
                }

                const nearbyShips = spatialGrid.query(this.x, this.y, 130, 'ship');
                for (const ship of nearbyShips) {
                    if (ship.faction === this.targetPlanet.faction && ship.active) {
                        const sd = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                        if (sd < 16900) {
                            this.target = ship;
                            this.state = ShipState.ATTACK;
                            return;
                        }
                    }
                }

                const d = MathUtils.distanceSquared(this.x, this.y, this.targetPlanet.x, this.targetPlanet.y);
                if (d < (this.targetPlanet.radius + 70) * (this.targetPlanet.radius + 70)) {
                    const angle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                    this.targetAngle = angle + Math.PI / 2.3;
                    this.accelerate(0.45);
                    if (this.fireTimer <= 0) this.firePlanet(this.targetPlanet);
                } else {
                    this.targetAngle = Math.atan2(this.targetPlanet.y - this.y, this.targetPlanet.x - this.x);
                    this.accelerate(0.85);
                }
            }

            fire(target) {
                const angle = Math.atan2(target.y - this.y, target.x - this.x);
                spawnProjectile(this.x + Math.cos(angle) * 8, this.y + Math.sin(angle) * 8, angle + (Math.random() - 0.5) * 0.15, this.faction, this.atk, false, false);
                this.fireTimer = 30;
            }

            firePlanet(planet) {
                const angle = Math.atan2(planet.y - this.y, planet.x - this.x);
                spawnProjectile(this.x + Math.cos(angle) * 8, this.y + Math.sin(angle) * 8, angle, this.faction, this.atk, true, false);
                this.fireTimer = 30;
            }

            accelerate(power) {
                let diff = MathUtils.angleDiff(this.angle, this.targetAngle);
                this.angle += diff * 0.08;
                this.vx += Math.cos(this.angle) * this.acc * power;
                this.vy += Math.sin(this.angle) * this.acc * power;
            }

            physics() {
                const spd = Math.hypot(this.vx, this.vy);
                if (spd > this.maxSpd) {
                    this.vx = (this.vx / spd) * this.maxSpd;
                    this.vy = (this.vy / spd) * this.maxSpd;
                }
                this.vx *= 0.97;
                this.vy *= 0.97;
                this.x += this.vx;
                this.y += this.vy;
                this.x = Math.max(20, Math.min(G.mapWidth - 20, this.x));
                this.y = Math.max(20, Math.min(G.mapHeight - 20, this.y));
            }

            takeDamage(dmg, attacker) {
                this.hp -= dmg;
                spawnParticles(this.x, this.y, '#ff0', 1);

                if (this.hp <= 0) {
                    this.die(attacker);
                    return false;
                }

                if ((this.state === ShipState.PATROL || this.state === ShipState.GUARD) && attacker) {
                    this.target = attacker;
                    this.state = ShipState.ATTACK;
                }
                return true;
            }

            die(killerFaction) {
                if (!this.active) return;

                // УЛУЧШЕННАЯ КОНВЕРСИЯ: работает если убийца - паразит ИЛИ рядом есть паразит
                if (this.faction !== 'parasite') {
                    const host = getNearestParasiteBattleship(this.x, this.y);
                    
                    // Конвертировать если убийца - паразит ИЛИ паразит близко (в радиусе 200)
                    if (host && (killerFaction === 'parasite' || 
                        MathUtils.distanceSquared(this.x, this.y, host.x, host.y) < 40000)) {
                        const escort = new EscortShip(this.x, this.y, 'parasite', host);
                        host.escorts.push(escort);
                        G.ships.push(escort);
                    }
                }

                this.active = false;
                spawnExplosion(this.x, this.y, getFactionColorMain(this.faction), 10);
                if (killerFaction && killerFaction !== this.faction && killerFaction !== 'parasite') {
                    addFactionStars(killerFaction, 1);
                }
            }
        }

        class Planet {
            constructor(x, y, radius, faction, type = 'normal') {
                this.x = x;
                this.y = y;
                this.radius = radius;
                this.faction = faction;
                this.type = type;
                this.name = '';
                this.active = true;
                this.inhabited = true; // default, changed for neutral planets in generation
                this.cargoShip = null; // reference to cargo ship assigned to this uninhabited planet

                const typeData = PLANET_TYPES[type];
                this.baseMaxHp = radius * 2 * typeData.hpMult;
                this.maxHp = this.baseMaxHp;
                this.hp = this.maxHp;
                this.hitTimer = 0;
                this.lastAttacker = null;
                this.colonizing = null;

                this.spawnTimer = 0;
                this.baseSpawnRate = 100;
                this.spawnRate = this.baseSpawnRate * typeData.spawnMult;
                this.baseMaxDefenders = Math.floor((radius / 12 + 2) * typeData.shipMult);
                this.baseMaxAttackers = Math.floor((radius / 8 + 2) * typeData.shipMult);
                this.maxDefenders = this.baseMaxDefenders;
                this.maxAttackers = this.baseMaxAttackers;
                this.pulse = Math.random() * Math.PI * 2;

                this.lastIncomeAt = performance.now();

                ensurePlanetUpgradeState(this);



                applyPlanetUpgradesToPlanet(this);
                this.turrets = [];
                if (type === 'fortress') {
                    const turretCount = 3;
                    for (let i = 0; i < turretCount; i++) {
                        this.turrets.push({
                            angle: (Math.PI * 2 / turretCount) * i,
                            targetAngle: 0,
                            fireTimer: Math.random() * 60
                        });
                    }
                }

                this.craters = [];
                for (let i = 0; i < 3 + Math.random() * 3; i++) {
                    this.craters.push({
                        a: Math.random() * Math.PI * 2,
                        d: Math.random() * 0.6,
                        s: 0.1 + Math.random() * 0.2
                    });
                }

                // Procedural planet terrain (Earth-like)
                const terrainSeed = Math.floor(Math.random() * 0xFFFFFF) + 1;
                this.terrainSeed = terrainSeed;
                const rng = makeRNG(terrainSeed);

                // Continents: irregular blob polygons in normalized [-1,1] space
                this.continents = [];
                const numContinents = 2 + Math.floor(rng() * 4);
                for (let ci = 0; ci < numContinents; ci++) {
                    const cx = (rng() - 0.5) * 1.5;
                    const cy = (rng() - 0.5) * 1.5;
                    const baseSize = 0.18 + rng() * 0.30;
                    const nPts = 9 + Math.floor(rng() * 7);
                    const pts = [];
                    for (let pi = 0; pi < nPts; pi++) {
                        const angle = (pi / nPts) * Math.PI * 2;
                        const r = baseSize * (0.5 + rng() * 0.8);
                        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
                    }
                    const ctype = rng() > 0.25 ? 'land' : 'arid';
                    this.continents.push({ pts, ctype });
                }

                // Cloud patches
                this.cloudPatches = [];
                const numClouds = 4 + Math.floor(rng() * 5);
                for (let cli = 0; cli < numClouds; cli++) {
                    this.cloudPatches.push({
                        nx: (rng() - 0.5) * 1.7,
                        ny: (rng() - 0.5) * 1.7,
                        rx: 0.12 + rng() * 0.25,
                        ry: 0.05 + rng() * 0.12,
                        rot: rng() * Math.PI
                    });
                }
                this.cloudDrift = (rng() - 0.5) * 0.0004;
            }

            update() {
                this.pulse += 0.025;
                this.hitTimer = Math.max(0, this.hitTimer - 1);

                // Колонизация нейтральных планет (таймер + отмена при уничтожении колонизатора)
                if (this.faction === 'neutral' && this.colonizing) {
                    const col = this.colonizing;
                    if (!col || !col.colonizer || !col.colonizer.active || col.colonizer.targetPlanet !== this) {
                        this.colonizing = null;
                    } else if (G.time >= col.endTime) {
                        const f = col.faction;
                        const cz = col.colonizer;
                        this.colonizing = null;
                        this.colonize(f);

                        // After colonization: colonizer disappears, its escorts remain to guard this new planet
                        if (cz && cz.active && cz.shipType === ShipType.COLONIZER) {
                            if (cz.escorts && cz.escorts.length) {
                                for (const e of cz.escorts) {
                                    if (!e || !e.active) continue;
                                    e.guardPlanet = this;
                                    e.mothership = null;
                                    e.orbitRadius = (this.radius || 30) + 110 + Math.random() * 25;
                                }
                            }
                            cz.escorts = [];
                            if (cz.faction === 'player') {
                                pushSystemInbox('✅ Планета колонизирована: ' + (this.name || ''));
                            }
                            cz.active = false;
                            spawnExplosion(cz.x, cz.y, getFactionColorMain(cz.faction), 12);
                        }
                    }
                }

                // Применяем апгрейды планеты (лимиты/HP) динамически по фракции
                if (this.faction !== 'neutral') {
                    applyPlanetUpgradesToPlanet(this);
                }

                if (this.hp < this.maxHp && this.faction !== 'neutral') {
                    this.hp += 0.015;
                }                // Экономика: доход раз в реальную секунду (1000 мс). Только обитаемые планеты дают $.
                if (this.faction !== 'neutral' && this.inhabited) {
                    const now = performance.now();
                    if (this.lastIncomeAt == null) this.lastIncomeAt = now;

                    const elapsed = now - this.lastIncomeAt;
                    if (elapsed >= 1000) {
                        const ticks = Math.floor(elapsed / 1000);
                        const baseIncome = this.type === 'resource' ? 3 : 1;
                        const econLvl = Math.max(1, (ensurePlanetUpgradeState(this).economy || 1));
                        const incomePerSec = baseIncome + (econLvl - 1);
                        addFactionStars(this.faction, incomePerSec * ticks);
                        this.lastIncomeAt += ticks * 1000;
                    }
                } else {
                    // чтобы при захвате/смене владельца не начислялось "за прошлое время"
                    this.lastIncomeAt = performance.now();
                }

if (this.type === 'fortress' && this.faction !== 'neutral') {
                    this.updateTurrets();
                }

                if (this.faction !== 'neutral') {
                    this.spawnTimer++;

                    let myDefenders = 0;
                    let myAttackers = 0;
                    for (const ship of G.ships) {
                        if (!ship.active || ship.home !== this || ship.shipType !== ShipType.FIGHTER) continue;
                        if (ship.role === ShipRole.DEFENDER) myDefenders++;
                        else if (ship.role === ShipRole.ATTACKER) myAttackers++;
                    }

                    if (this.spawnTimer >= this.spawnRate) {
                        if (myDefenders < this.maxDefenders) {
                            this.spawnShip(ShipRole.DEFENDER);
                        } else if (this.faction !== 'parasite' && myAttackers < this.maxAttackers) {
                            this.spawnShip(ShipRole.ATTACKER);
                        }
                        this.spawnTimer = 0;
                    }
                }
            }

            updateTurrets() {
                this.turrets.forEach(turret => {
                    turret.fireTimer = Math.max(0, turret.fireTimer - 1);

                    let target = null;
                    let minDist = 150 * 150;

                    const nearbyShips = spatialGrid.query(this.x, this.y, 150, 'ship');
                    for (const ship of nearbyShips) {
                        if (ship.faction !== this.faction && ship.active && areAtWar(this.faction, ship.faction)) {
                            const d = MathUtils.distanceSquared(this.x, this.y, ship.x, ship.y);
                            if (d < minDist) {
                                minDist = d;
                                target = ship;
                            }
                        }
                    }

                    if (target) {
                        turret.targetAngle = Math.atan2(target.y - this.y, target.x - this.x);

                        let diff = turret.targetAngle - turret.angle;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        turret.angle += diff * 0.1;

                        if (turret.fireTimer <= 0 && Math.abs(diff) < 0.3) {
                            const tx = this.x + Math.cos(turret.angle) * (this.radius + 5);
                            const ty = this.y + Math.sin(turret.angle) * (this.radius + 5);
                            spawnProjectile(tx, ty, turret.angle, this.faction, 1.5, false, false);
                            turret.fireTimer = 40;
                        }
                    }
                });
            }

            spawnShip(role = ShipRole.ATTACKER, free = false) {
                const faction = this.faction;
                if (!free) {
                    if (getFactionStars(faction) < FIGHTER_COST) return;
                    spendFactionStars(faction, FIGHTER_COST);
                }

                const angle = Math.random() * Math.PI * 2;
                const dist = this.radius + 90;
                const ship = new Ship(
                    this.x + Math.cos(angle) * dist,
                    this.y + Math.sin(angle) * dist,
                    this.faction,
                    this,
                    role
                );
                ship.patrolRadius = role === ShipRole.DEFENDER ? this.radius + 45 + Math.random() * 20 : this.radius + 70 + Math.random() * 40;
                ship.patrolAngle = angle;
                G.ships.push(ship);
            }

            spawnBattleship() {
                if (this.type !== 'industrial') return false;

                const angle = Math.random() * Math.PI * 2;
                const dist = this.radius + 110;
                const ship = new Battleship(
                    this.x + Math.cos(angle) * dist,
                    this.y + Math.sin(angle) * dist,
                    this.faction,
                    this
                );
                ship.patrolRadius = this.radius + 110 + Math.random() * 60;
                ship.patrolAngle = angle;
                G.ships.push(ship);
                return true;
            }

            getDefenderCount() {
                return this._cachedDefenders || 0;
            }

            getAttackerCount() {
                return this._cachedAttackers || 0;
            }

            getBattleshipCount() {
                return this._cachedBattleships || 0;
            }

            
            colonize(newFaction) {
                if (this.faction !== 'neutral') return false;

                this.faction = newFaction;
                invalidatePlanetCache(this);
                applyPlanetUpgradesToPlanet(this);
                this.hp = this.maxHp;
                this.lastAttacker = null;
                this.colonizing = null;

                const expColor = (COLORS[newFaction] || COLORS.neutral).main;
                spawnExplosion(this.x, this.y, expColor, 18);

                checkGameEnd();
                return true;
            }

takeDamage(dmg, attackerFaction) {
                if (this.faction === 'neutral') return;
                this.hp -= dmg;
                this.hitTimer = 10;
                this.lastAttacker = attackerFaction;
                spawnParticles(this.x, this.y, (COLORS[this.faction] || COLORS.neutral).light, 1);

                if (this.hp <= 0) this.capture(attackerFaction);
            }

            capture(attackerFaction) {
                const oldFaction = this.faction;
                if (oldFaction === 'neutral') return;

                // Planet is destroyed -> becomes neutral (no instant ownership transfer)
                this.colonizing = null;
                this.faction = 'neutral';
                invalidatePlanetCache(this);
                this.maxHp = this.baseMaxHp;
                this.maxDefenders = this.baseMaxDefenders;
                this.maxAttackers = this.baseMaxAttackers;
                this.hp = this.maxHp;
                this.lastAttacker = null;
                this.lastIncomeAt = performance.now();

                // Remove ships that were based on this planet (they die with the planet)
                G.ships.forEach(ship => {
                    if (!ship.active) return;
                    if (ship.home === this && ship.faction === oldFaction) {
                        ship.active = false;
                        spawnExplosion(ship.x, ship.y, (COLORS[oldFaction] || COLORS.neutral).light, 8);
                    }
                });

                // Cancel assaults on this planet so attackers don't get stuck
                G.ships.forEach(ship => {
                    if (!ship.active) return;
                    if (ship.targetPlanet === this && ship.state === ShipState.ASSAULT) {
                        ship.targetPlanet = null;
                        ship.returnToBase();
                    }
                });

                spawnExplosion(this.x, this.y, COLORS.neutral.main, 20);
                checkGameEnd();
            }
        }

