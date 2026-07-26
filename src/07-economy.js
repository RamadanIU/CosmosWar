// ============================================================
// MODULE: 07-economy.js
// Назначение: Звёзды/эфириум фракций, трансферы (звёзды/флот/планеты/эфириум), dispatchTroops, initStars
// Оригинальные строки IIFE: 2141-2470
// Порядок загрузки: 8/24
// ============================================================

        function getFactionStars(faction) {
            if (faction === 'player') return G.score;
            if (!G.factionData[faction]) initFactionData(faction);
            return G.factionData[faction].stars;
        }

        function addFactionStars(faction, amount) {
            if (faction === 'player') {
                G.score += amount;
            } else {
                if (!G.factionData[faction]) initFactionData(faction);
                G.factionData[faction].stars += amount;
            }
        }

        function spendFactionStars(faction, amount) {
            if (faction === 'player') {
                G.score -= amount;
            } else {
                if (!G.factionData[faction]) initFactionData(faction);
                G.factionData[faction].stars -= amount;
            }
        }

        function getFactionEtherium(faction) {
            if (faction === 'player') return G.etherium;
            if (!G.factionData[faction]) initFactionData(faction);
            return G.factionData[faction].etherium || 0;
        }

        function addFactionEtherium(faction, amount) {
            if (faction === 'player') {
                G.etherium = (G.etherium || 0) + amount;
            } else {
                if (!G.factionData[faction]) initFactionData(faction);
                G.factionData[faction].etherium = (G.factionData[faction].etherium || 0) + amount;
            }
        }

        function spendFactionEtherium(faction, amount) {
            if (faction === 'player') {
                G.etherium = (G.etherium || 0) - amount;
            } else {
                if (!G.factionData[faction]) initFactionData(faction);
                G.factionData[faction].etherium = (G.factionData[faction].etherium || 0) - amount;
            }
        }

        function getUpgradeEtheriumCost(level) {
            if (level <= UPGRADE_ETHERIUM_THRESHOLD) return 0;
            return UPGRADE_ETHERIUM_BASE + (level - UPGRADE_ETHERIUM_THRESHOLD - 1) * 5;
        }

        // === Resource transfers (stars + fleet) ===

        function transferStars(fromFaction, toFaction, amount, meta) {
            const amt = Math.floor(Number(amount || 0));
            if (!amt || amt <= 0) return { success: false, error: 'invalid_amount' };

            // Validation
            if (fromFaction === toFaction) return { success: false, error: 'same_faction' };
            if (fromFaction === 'neutral' || toFaction === 'neutral') return { success: false, error: 'neutral' };
            if (fromFaction === 'parasite' || toFaction === 'parasite') return { success: false, error: 'parasite' };

            const available = getFactionStars(fromFaction);
            if (available < amt) return { success: false, error: 'insufficient_funds', available };

            // Allow transfers to anyone (gifts normalize relations)
            // if (!areAllies(fromFaction, toFaction)) return { success: false, error: 'not_allies' };

            // Transfer
            spendFactionStars(fromFaction, amt);
            addFactionStars(toFaction, amt);

            // Relation updates
            const rel = getRelationRef(fromFaction, toFaction);
            if (rel) {
                rel.tradedMoney += amt;
                rel.lastInteraction = G.time;
            }
            modifyTrust(fromFaction, toFaction, Math.min(amt / 10, 15));

const m = (meta && typeof meta === 'object') ? meta : {};
            const reasoning = ensureRussianReasoningText((m && m.reasoning != null) ? String(m.reasoning) : '', defaultReasoningForAction('send_money', toFaction));
            const source = (m && m.source != null) ? String(m.source) : '';
            const extra = Object.assign({}, m);
            try { delete extra.reasoning; delete extra.source; } catch (e) {}

            logDiplomaticEvent('money_transfer', fromFaction, toFaction, Object.assign({
                amount: amt,
                reasoning,
                source
            }, extra));

            return { success: true, from: fromFaction, to: toFaction, amount: amt };
        }

        function transferFleet(fromFaction, toFaction, shipType, count, meta) {
            const cnt = Math.floor(Number(count || 0));
            if (!cnt || cnt <= 0) return { success: false, error: 'invalid_count' };

            // Validation
            if (fromFaction === toFaction) return { success: false, error: 'same_faction' };
            if (fromFaction === 'neutral' || toFaction === 'neutral') return { success: false, error: 'neutral' };
            if (fromFaction === 'parasite' || toFaction === 'parasite') return { success: false, error: 'parasite' };
            // Allow transfers to anyone (gifts normalize relations)

            // Find donor ships: prefer idle/patrol/guard ships (avoid ships mid-assault)
            const availableShips = G.ships.filter(s =>
                s && s.active &&
                s.faction === fromFaction &&
                s.shipType === shipType &&
                (s.state === ShipState.PATROL || s.state === ShipState.GUARD)
            );

            if (availableShips.length < cnt) {
                return { success: false, error: 'insufficient_ships', available: availableShips.length };
            }

            const transferred = availableShips.slice(0, cnt);
            transferred.forEach(ship => {
                ship.faction = toFaction;

                if (typeof ship.applyUpgrades === 'function') {
                    ship.applyUpgrades();
                }

                // Re-home ship to receiver's planet, if exists
                const newHome = G.planets.find(p => p && p.active !== false && p.faction === toFaction);
                if (newHome) {
                    ship.home = newHome;
                    ship.state = ShipState.TRAVEL;
                    ship.targetPlanet = newHome;
                }
            });

            const rel = getRelationRef(fromFaction, toFaction);
            if (rel) {
                rel.tradedShips += cnt;
                rel.lastInteraction = G.time;
            }

            const trustGain = (shipType === ShipType.BATTLESHIP) ? (cnt * 10) : (cnt * 2);
            modifyTrust(fromFaction, toFaction, Math.min(trustGain, 20));

const m = (meta && typeof meta === 'object') ? meta : {};
            const reasoning = ensureRussianReasoningText((m && m.reasoning != null) ? String(m.reasoning) : '', defaultReasoningForAction('send_fleet', toFaction));
            const source = (m && m.source != null) ? String(m.source) : '';
            const extra = Object.assign({}, m);
            try { delete extra.reasoning; delete extra.source; } catch (e) {}

            logDiplomaticEvent('fleet_transfer', fromFaction, toFaction, Object.assign({
                shipType: shipType === ShipType.BATTLESHIP ? 'battleship' : 'fighter',
                count: cnt,
                reasoning,
                source
            }, extra));

            return { success: true, from: fromFaction, to: toFaction, shipType, count: cnt };
        }

        function transferPlanets(fromFaction, toFaction, planetNames, meta) {
            const list = Array.isArray(planetNames) ? planetNames : (planetNames ? [planetNames] : []);
            const names = list.map(n => String(n || '').trim()).filter(Boolean);
            if (!names.length) return { success: false, error: 'no_planets_selected' };

            // Validation
            if (fromFaction === toFaction) return { success: false, error: 'same_faction' };
            if (fromFaction === 'neutral' || toFaction === 'neutral') return { success: false, error: 'neutral' };
            if (fromFaction === 'parasite' || toFaction === 'parasite') return { success: false, error: 'parasite' };
            // Allow transfers to anyone (gifts normalize relations)

            const owned = (G.planets || []).filter(p => p && p.active !== false && p.faction === fromFaction);
            const ownedByName = new Map(owned.map(p => [p.name, p]));

            const toTransfer = [];
            names.forEach(n => {
                const p = ownedByName.get(n);
                if (p) toTransfer.push(p);
            });

            if (!toTransfer.length) return { success: false, error: 'no_matching_owned_planets' };

            const transferredNames = [];
            toTransfer.forEach(p => {
                // Keep HP unchanged (no reduction on gifting)
                const oldFaction = p.faction;
                p.faction = toFaction;
                p.lastAttacker = null;
                if (p.attackers) p.attackers = {};

                // Transfer garrison: ships that consider this planet their home
                (G.ships || []).forEach(ship => {
                    if (!ship || !ship.active) return;
                    if (ship.home !== p) return;
                    if (ship.faction !== oldFaction) return;

                    ship.faction = toFaction;
                    if (typeof ship.applyUpgrades === 'function') ship.applyUpgrades();

                    // Stabilize behavior after transfer
                    ship.target = null;
                    ship.targetPlanet = null;
                    if (ship.role === ShipRole.DEFENDER) ship.state = ShipState.GUARD;
                    else ship.state = ShipState.PATROL;
                });

                transferredNames.push(p.name);
            });

            const rel = getRelationRef(fromFaction, toFaction);
            if (rel) {
                rel.tradedPlanets = (rel.tradedPlanets || 0) + transferredNames.length;
                rel.lastInteraction = G.time;
            }

            modifyTrust(fromFaction, toFaction, Math.min(10 + transferredNames.length * 6, 25));

const m = (meta && typeof meta === 'object') ? meta : {};
            const reasoning = ensureRussianReasoningText((m && m.reasoning != null) ? String(m.reasoning) : '', defaultReasoningForAction('gift_planet', toFaction));
            const source = (m && m.source != null) ? String(m.source) : '';
            const extra = Object.assign({}, m);
            try { delete extra.reasoning; delete extra.source; } catch (e) {}

            logDiplomaticEvent('planet_transfer', fromFaction, toFaction, Object.assign({
                planets: transferredNames.slice(),
                reasoning,
                source
            }, extra));

            return { success: true, from: fromFaction, to: toFaction, planets: transferredNames.slice() };
        }

        function transferEtherium(fromFaction, toFaction, amount, meta) {
            const amt = Math.floor(Number(amount || 0));
            if (!amt || amt <= 0) return { success: false, error: 'invalid_amount' };
            if (fromFaction === toFaction) return { success: false, error: 'same_faction' };
            if (fromFaction === 'neutral' || toFaction === 'neutral') return { success: false, error: 'neutral' };
            if (fromFaction === 'parasite' || toFaction === 'parasite') return { success: false, error: 'parasite' };

            const available = getFactionEtherium(fromFaction);
            if (available < amt) return { success: false, error: 'insufficient_etherium', available };

            spendFactionEtherium(fromFaction, amt);
            addFactionEtherium(toFaction, amt);

            const rel = getRelationRef(fromFaction, toFaction);
            if (rel) {
                rel.tradedMoney += amt;
                rel.lastInteraction = G.time;
            }
            modifyTrust(fromFaction, toFaction, Math.min(amt / 5, 20));

            const m = (meta && typeof meta === 'object') ? meta : {};
            const reasoning = ensureRussianReasoningText((m && m.reasoning != null) ? String(m.reasoning) : '', 'Передача эфириума.');
            logDiplomaticEvent('etherium_transfer', fromFaction, toFaction, {
                amount: amt,
                reasoning,
                source: m.source || ''
            });

            return { success: true, from: fromFaction, to: toFaction, amount: amt };
        }

        function dispatchTroops(attackerFaction, planetName, shipTypeStr, count, opts) {
            const name = String(planetName || '').trim();
            if (!name) return { success: false, error: 'no_planet' };

            const planet = (G.planets || []).find(p => p && p.active !== false && p.name === name);
            if (!planet) return { success: false, error: 'planet_not_found' };
            if (planet.faction === attackerFaction) return { success: false, error: 'already_owned' };

            // Must be at war
            if (!areAtWar(attackerFaction, planet.faction)) {
                return { success: false, error: 'not_at_war' };
            }

            const st = (String(shipTypeStr || '').toLowerCase() === 'battleship') ? ShipType.BATTLESHIP : ShipType.FIGHTER;
            const desired = Math.floor(Number(count || 0));
            if (!desired || desired <= 0) return { success: false, error: 'invalid_count' };

            const pool = (G.ships || []).filter(s =>
                s && s.active &&
                s.faction === attackerFaction &&
                s.shipType === st &&
                (s.state === ShipState.PATROL || s.state === ShipState.GUARD)
            );

            if (pool.length <= 0) return { success: false, error: 'no_available_units' };

            const sent = pool.slice(0, Math.min(desired, pool.length));
            sent.forEach(ship => {
                ship.target = null;
                ship.targetPlanet = planet;
                ship.state = ShipState.ASSAULT;
            });

const m = (opts && typeof opts === 'object') ? opts : {};
            const reasoning = ensureRussianReasoningText((m && m.reasoning != null) ? String(m.reasoning) : '', defaultReasoningForAction('send_troops', (planet && planet.faction) ? planet.faction : ''));
            const source = (m && m.source != null) ? String(m.source) : '';
            const extra = Object.assign({}, m);
            try { delete extra.reasoning; delete extra.source; } catch (e) {}

            logDiplomaticEvent('send_troops', attackerFaction, planet.faction, Object.assign({
                planet: planet.name,
                shipType: st === ShipType.BATTLESHIP ? 'battleship' : 'fighter',
                count: sent.length,
                reasoning,
                source
            }, extra));

            return { success: true, planet: planet.name, shipType: st, count: sent.length };
        }



        function initStars() {
            G.stars = [];
            const count = Math.floor((G.mapWidth * G.mapHeight) / 15000);
            for (let i = 0; i < count; i++) {
                G.stars.push({
                    x: Math.random() * G.mapWidth,
                    y: Math.random() * G.mapHeight,
                    size: Math.random() * 1.5 + 0.5,
                    bright: 0.3 + Math.random() * 0.7
                });
            }
            renderStarsToCache();
        }

