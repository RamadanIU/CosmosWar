// ============================================================
// MODULE: 06-planets.js
// Назначение: getPlanetByName, applyPlanetUpgradesToPlanet
// Оригинальные строки IIFE: 2107-2140
// Порядок загрузки: 7/24
// ============================================================

        function getPlanetByName(name) {
            const n = String(name || '').trim();
            if (!n) return null;
            const arr = G.planets || [];
            for (let i = 0; i < arr.length; i++) {
                const p = arr[i];
                if (p && p.active !== false && p.name === n) return p;
            }
            return null;
        }


        function applyPlanetUpgradesToPlanet(planet) {
            if (!planet || planet.faction === 'neutral') return;
            const pu = ensurePlanetUpgradeState(planet);
            const atkLvl = Math.max(1, pu.attack || 1);
            const defLvl = Math.max(1, pu.defense || 1);

            if (planet.baseMaxHp == null) planet.baseMaxHp = planet.maxHp;
            if (planet.baseMaxDefenders == null) planet.baseMaxDefenders = planet.maxDefenders;
            if (planet.baseMaxAttackers == null) planet.baseMaxAttackers = planet.maxAttackers;

            const oldMaxHp = planet.maxHp || planet.baseMaxHp;
            const newMaxHp = planet.baseMaxHp + (defLvl - 1) * 10;
            if (newMaxHp !== oldMaxHp) {
                planet.maxHp = newMaxHp;
                if (newMaxHp > oldMaxHp) planet.hp = Math.min(newMaxHp, (planet.hp || 0) + (newMaxHp - oldMaxHp));
                else planet.hp = Math.min(planet.hp || 0, newMaxHp);
            }

            planet.maxDefenders = planet.baseMaxDefenders + (defLvl - 1);
            planet.maxAttackers = planet.baseMaxAttackers + (atkLvl - 1);
        }

