// ============================================================
// MODULE: 19-diplomacy-ai.js
// Назначение: AI-решения: aiShould{ProposeAlliance,DeclarePeace,DeclareWar,BreakAlliance}, aiRespondToOffer
// Оригинальные строки IIFE: 8375-8543
// Порядок загрузки: 20/24
// ============================================================

        function evaluateThreat(fromFaction, toFaction) {
            const strength = evaluateFactionStrength(fromFaction);
            const myStrength = evaluateFactionStrength(toFaction);

            const theirShips = G.ships.filter(s => s.faction === fromFaction && s.active);
            const myPlanets = G.planets.filter(p => p.faction === toFaction);

            let nearbyThreat = 0;
            myPlanets.forEach(planet => {

                const nearbyShips = spatialGrid.query(planet.x, planet.y, 300, 'ship');
                nearbyShips.forEach(ship => {
                    if (ship.faction === fromFaction && ship.active) {
                        const d = MathUtils.distanceSquared(ship.x, ship.y, planet.x, planet.y);
                        if (d < 90000) {
                            nearbyThreat += ship.shipType === ShipType.BATTLESHIP ? 10 : 2;
                        }
                    }
                });
            });

            const fleetUpgrades = getFactionUpgrades(fromFaction);
            const planetUpgrades = getFactionPlanetUpgrades(fromFaction);
            const stars = getFactionStars(fromFaction);
            return {
                relativeStrength: strength / Math.max(1, myStrength),
                nearbyThreat: nearbyThreat,
                totalThreat: (strength / Math.max(1, myStrength)) * 50 + nearbyThreat
            };
        }

        function findCommonEnemies(f1, f2) {
            const enemies = [];
            G.factions.forEach(f => {
                if (f !== f1 && f !== f2 && f !== 'neutral') {
                    if (areAtWar(f1, f) && areAtWar(f2, f)) {
                        enemies.push(f);
                    }
                }
            });
            return enemies;
        }

        function countAllies(faction) {
            let count = 0;
            G.factions.forEach(f => {
                if (f !== faction && f !== 'neutral' && areAllies(faction, f)) {
                    count++;
                }
            });
            return count;
        }

        function aiShouldProposeAlliance(aiFaction, targetFaction) {
            const relation = getRelation(aiFaction, targetFaction);
            if (relation.status === DiploStatus.ALLIANCE) return false;
            if (G.time - relation.lastChange < 500) return false;

            const myStrength = evaluateFactionStrength(aiFaction);
            const theirStrength = evaluateFactionStrength(targetFaction);
            const commonEnemies = findCommonEnemies(aiFaction, targetFaction);

            let score = 0;

            commonEnemies.forEach(enemy => {
                const enemyStrength = evaluateFactionStrength(enemy);
                if (enemyStrength > myStrength * 0.8) score += 30;
            });

            if (myStrength < theirStrength * 0.7) score += 25;

            score += relation.trust * 0.3;

            score -= countAllies(aiFaction) * 15;

            return score > 40 && Math.random() < 0.3;
        }

        function aiShouldDeclarePeace(aiFaction, targetFaction) {
            const relation = getRelation(aiFaction, targetFaction);
            if (relation.status !== DiploStatus.WAR) return false;
            if (G.time - relation.lastChange < 400) return false;

            const myStrength = evaluateFactionStrength(aiFaction);
            const theirStrength = evaluateFactionStrength(targetFaction);
            const threat = evaluateThreat(targetFaction, aiFaction);

            let score = 0;

            if (myStrength < theirStrength * 0.5) score += 40;

            if (threat.nearbyThreat > 20) score += 30;

            const enemyCount = G.factions.filter(f => f !== aiFaction && f !== 'neutral' && areAtWar(aiFaction, f)).length;
            if (enemyCount > 2) score += 25;

            score += relation.trust * 0.2;

            return score > 50 && Math.random() < 0.2;
        }

        function aiShouldDeclareWar(aiFaction, targetFaction) {
            const relation = getRelation(aiFaction, targetFaction);
            if (relation.status === DiploStatus.WAR) return false;
            if (G.time - relation.lastChange < 600) return false;

            const myStrength = evaluateFactionStrength(aiFaction);
            const theirStrength = evaluateFactionStrength(targetFaction);

            let score = 0;

            if (myStrength > theirStrength * 1.8) score += 40;

            if (theirStrength < 200) score += 30;

            score -= relation.trust * 0.5;

            score += countAllies(aiFaction) * 10;

            if (relation.status === DiploStatus.ALLIANCE) score -= 50;

            return score > 60 && Math.random() < 0.15;
        }

        function aiShouldBreakAlliance(aiFaction, targetFaction) {
            const relation = getRelation(aiFaction, targetFaction);
            if (relation.status !== DiploStatus.ALLIANCE) return false;
            if (G.time - relation.lastChange < 800) return false;

            const myStrength = evaluateFactionStrength(aiFaction);
            const theirStrength = evaluateFactionStrength(targetFaction);

            let score = 0;

            if (myStrength > theirStrength * 2.5) score += 30;

            if (relation.trust < -50) score += 40;

            const theirPlanets = G.planets.filter(p => p.faction === targetFaction);
            theirPlanets.forEach(p => {
                if (p.type === 'resource' || p.type === 'industrial') score += 10;
            });

            return score > 50 && Math.random() < 0.1;
        }

        function aiRespondToOffer(aiFaction, fromFaction, offerType) {
            const relation = getRelation(aiFaction, fromFaction);
            const myStrength = evaluateFactionStrength(aiFaction);
            const theirStrength = evaluateFactionStrength(fromFaction);

            let acceptChance = 0.5;

            if (offerType === 'alliance') {
                const commonEnemies = findCommonEnemies(aiFaction, fromFaction);
                acceptChance += commonEnemies.length * 0.15;
                acceptChance += relation.trust * 0.005;
                if (myStrength < theirStrength) acceptChance += 0.2;
                acceptChance -= countAllies(aiFaction) * 0.1;
            } else if (offerType === 'peace') {
                acceptChance += relation.trust * 0.003;
                if (myStrength < theirStrength * 0.7) acceptChance += 0.3;
                const enemyCount = G.factions.filter(f => f !== aiFaction && areAtWar(aiFaction, f)).length;
                if (enemyCount > 2) acceptChance += 0.2;
            }

            return Math.random() < Math.max(0.1, Math.min(0.9, acceptChance));
        }

