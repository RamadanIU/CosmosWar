// ============================================================
// MODULE: 18-stats-screens.js
// Назначение: Канвасы статистики на экранах конца игры (drawPlanetStats/drawPowerStats/...)
// Оригинальные строки IIFE: 7853-8374
// Порядок загрузки: 19/24
// ============================================================

        function drawPlanetStats(canvas) {
            if (!canvas) return;
            const ctx = canvas.getContext && canvas.getContext('2d');
            if (!ctx) return;
            if (typeof G === 'undefined' || !G) return;

            let history = Array.isArray(G.planetHistory) ? G.planetHistory.slice() : [];

            if (!history.length) {
                const snap = { t: G.time ? (G.time / 60) : 0, planets: {} };
                if (Array.isArray(G.factions)) {
                    G.factions.forEach(f => { snap.planets[f] = 0; });
                }
                if (Array.isArray(G.planets)) {
                    G.planets.forEach(p => {
                        if (!snap.planets[p.faction]) snap.planets[p.faction] = 0;
                        snap.planets[p.faction]++;
                    });
                }
                history.push(snap);
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const marginLeft = 40;
            const marginRight = 10;
            const marginTop = 10;
            const marginBottom = 28;
            const w = Math.max(10, canvas.width - marginLeft - marginRight);
            const h = Math.max(10, canvas.height - marginTop - marginBottom);

            let factions = Array.isArray(G.factions) ? G.factions.slice() : [];
            const usedFactions = new Set();
            history.forEach(s => {
                if (!s || !s.planets) return;
                Object.keys(s.planets).forEach(f => {
                    if (s.planets[f] > 0) usedFactions.add(f);
                });
            });
            if (usedFactions.size) {
                factions = factions.filter(f => usedFactions.has(f));
            }

            if (!factions.length) {
                ctx.fillStyle = '#e5e7eb';
                ctx.font = '14px Segoe UI, Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Нет данных по планетам', canvas.width / 2, canvas.height / 2);
                return;
            }

            let maxPlanets = 0;
            history.forEach(s => {
                if (!s || !s.planets) return;
                factions.forEach(f => {
                    const v = s.planets[f] || 0;
                    if (v > maxPlanets) maxPlanets = v;
                });
            });

            if (maxPlanets <= 0) {
                ctx.fillStyle = '#e5e7eb';
                ctx.font = '14px Segoe UI, Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Все фракции потеряли планеты', canvas.width / 2, canvas.height / 2);
                return;
            }

            const stepsX = Math.max(1, history.length - 1);

            ctx.strokeStyle = 'rgba(148,163,184,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(marginLeft, marginTop);
            ctx.lineTo(marginLeft, marginTop + h);
            ctx.lineTo(marginLeft + w, marginTop + h);
            ctx.stroke();

            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px Segoe UI, Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('Планеты', 4, marginTop + 10);
            ctx.textAlign = 'right';
            ctx.fillText('Время, шаги', marginLeft + w, marginTop + h + 20);

            const stepsY = Math.min(maxPlanets, 5);
            for (let i = 1; i <= stepsY; i++) {
                const val = Math.round(maxPlanets * i / stepsY);
                const y = marginTop + h - (val / maxPlanets) * h;
                ctx.strokeStyle = 'rgba(55,65,81,0.5)';
                ctx.beginPath();
                ctx.moveTo(marginLeft, y);
                ctx.lineTo(marginLeft + w, y);
                ctx.stroke();

                ctx.fillStyle = '#6b7280';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(val), marginLeft - 4, y);
            }

            factions.forEach(function(f) {
                const color = (COLORS[f] && COLORS[f].light) || '#ffffff';
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                let started = false;

                history.forEach(function(s, idx) {
                    if (!s || !s.planets) return;
                    const value = s.planets[f] || 0;
                    const x = marginLeft + (stepsX === 0 ? 0 : (idx / stepsX) * w);
                    const y = marginTop + h - (value / maxPlanets) * h;

                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                ctx.stroke();
            });

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            let lx = marginLeft + 4;
            let ly = marginTop + 8;
            factions.forEach(function(f) {
                const color = (COLORS[f] && COLORS[f].light) || '#ffffff';
                ctx.fillStyle = color;
                ctx.fillRect(lx, ly - 5, 10, 10);
                ctx.fillStyle = '#e5e7eb';
                ctx.font = '10px Segoe UI, Arial';
                const label = (typeof FACTION_NAMES !== 'undefined' && FACTION_NAMES && FACTION_NAMES[f]) ? FACTION_NAMES[f] : f;
                ctx.fillText(label, lx + 14, ly);
                ly += 14;
            });
        }

        // === Military power (objective) for end-game statistics ===

        function escapeHtml(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function computeMilitaryPowerBreakdown() {
            const out = {};
            const ensure = (f) => {
                const key = (f == null) ? 'unknown' : String(f);
                if (!out[key]) {
                    out[key] = {
                        planetPower: 0,
                        shipPower: 0,
                        techBonus: 0,
                        total: 0,
                        planets: 0,
                        fighters: 0,
                        battleships: 0,
                        upgrades: { speed: 1, attack: 1, armor: 1 }
                    };
                }
                return out[key];
            };

            const planetTypeBonus = { normal: 0, industrial: 400, fortress: 600, resource: 250 };
            const turretBonusPer = 300;

            // Planets
            (G.planets || []).forEach(p => {
                if (!p || p.active === false) return;
                const o = ensure(p.faction);
                o.planets++;

                let power = (p.maxHp || 0) * 8;
                power += (planetTypeBonus[p.type] || 0);

                if (p.type === 'fortress' && Array.isArray(p.turrets)) {
                    power += p.turrets.length * turretBonusPer;
                }
                o.planetPower += power;
            });

            // Ships
            (G.ships || []).forEach(s => {
                if (!s || !s.active) return;
                const o = ensure(s.faction);

                if (s.shipType === ShipType.BATTLESHIP) o.battleships++;
                else o.fighters++;

                const hp = (s.maxHp != null) ? s.maxHp : (s.hp || 0);
                const shield = (s.maxShield != null) ? s.maxShield : 0;
                const atk = (s.atk || 0);

                let power = hp * 6 + shield * 3 + atk * 120;
                if (s.shipType === ShipType.BATTLESHIP) power += 6000;
                o.shipPower += power;
            });

            // Tech (upgrades)
            const factionsSet = new Set(Object.keys(out));
            if (Array.isArray(G.factions)) G.factions.forEach(f => factionsSet.add(f));
            (G.planets || []).forEach(p => { if (p && p.active !== false) factionsSet.add(p.faction); });
            (G.ships || []).forEach(s => { if (s && s.active) factionsSet.add(s.faction); });

            factionsSet.forEach(f => {
                const o = ensure(f);
                const up = getFactionUpgrades(f);
                o.upgrades = { speed: up.speed || 1, attack: up.attack || 1, armor: up.armor || 1 };
                o.techBonus = (o.upgrades.speed + o.upgrades.attack + o.upgrades.armor) * 250;
                o.total = o.planetPower + o.shipPower + o.techBonus;
            });

            return out;
        }

        function computeMilitaryPowerTotals() {
            const breakdown = computeMilitaryPowerBreakdown();
            const totals = {};
            Object.keys(breakdown).forEach(f => { totals[f] = Math.round(breakdown[f].total || 0); });
            return totals;
        }

        function drawPowerStats(canvas) {
            if (!canvas) return;
            const ctx = canvas.getContext && canvas.getContext('2d');
            if (!ctx) return;
            if (typeof G === 'undefined' || !G) return;

            let history = Array.isArray(G.powerHistory) ? G.powerHistory.slice() : [];

            if (!history.length) {
                const snap = { t: G.time ? (G.time / 60) : 0, power: {} };
                try {
                    const totals = computeMilitaryPowerTotals();
                    for (const k in totals) {
                        if (!Object.prototype.hasOwnProperty.call(totals, k)) continue;
                        snap.power[k] = totals[k];
                    }
                } catch (e) {}
                history.push(snap);
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const marginLeft = 40;
            const marginRight = 10;
            const marginTop = 10;
            const marginBottom = 28;
            const w = Math.max(10, canvas.width - marginLeft - marginRight);
            const h = Math.max(10, canvas.height - marginTop - marginBottom);

            let factions = Array.isArray(G.factions) ? G.factions.slice() : [];
            const usedFactions = new Set();
            history.forEach(s => {
                if (!s || !s.power) return;
                Object.keys(s.power).forEach(f => {
                    if (s.power[f] > 0) usedFactions.add(f);
                });
            });
            if (usedFactions.size) {
                factions = factions.filter(f => usedFactions.has(f));
            }
            // include any non-standard factions (e.g., parasite) if they show up in power
            usedFactions.forEach(f => { if (!factions.includes(f)) factions.push(f); });

            if (!factions.length) {
                ctx.fillStyle = '#e5e7eb';
                ctx.font = '14px Segoe UI, Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Нет данных по мощности', canvas.width / 2, canvas.height / 2);
                return;
            }

            let maxPower = 0;
            history.forEach(s => {
                if (!s || !s.power) return;
                factions.forEach(f => {
                    const v = s.power[f] || 0;
                    if (v > maxPower) maxPower = v;
                });
            });

            if (maxPower <= 0) {
                ctx.fillStyle = '#e5e7eb';
                ctx.font = '14px Segoe UI, Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Все фракции потеряли мощь', canvas.width / 2, canvas.height / 2);
                return;
            }

            const stepsX = Math.max(1, history.length - 1);

            ctx.strokeStyle = 'rgba(148,163,184,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(marginLeft, marginTop);
            ctx.lineTo(marginLeft, marginTop + h);
            ctx.lineTo(marginLeft + w, marginTop + h);
            ctx.stroke();

            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px Segoe UI, Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('Мощь', 4, marginTop + 10);
            ctx.textAlign = 'right';
            ctx.fillText('Время, шаги', marginLeft + w, marginTop + h + 20);

            const stepsY = 5;
            for (let i = 1; i <= stepsY; i++) {
                const val = Math.round(maxPower * i / stepsY);
                const y = marginTop + h - (val / maxPower) * h;
                ctx.strokeStyle = 'rgba(55,65,81,0.5)';
                ctx.beginPath();
                ctx.moveTo(marginLeft, y);
                ctx.lineTo(marginLeft + w, y);
                ctx.stroke();

                ctx.fillStyle = '#6b7280';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(val), marginLeft - 4, y);
            }

            factions.forEach(function(f) {
                const color = (COLORS[f] && COLORS[f].light) || '#ffffff';
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                let started = false;

                history.forEach(function(s, idx) {
                    if (!s || !s.power) return;
                    const value = s.power[f] || 0;
                    const x = marginLeft + (stepsX === 0 ? 0 : (idx / stepsX) * w);
                    const y = marginTop + h - (value / maxPower) * h;

                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                ctx.stroke();
            });

            // Legend
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            let lx = marginLeft + 4;
            let ly = marginTop + 8;
            factions.forEach(function(f) {
                const color = (COLORS[f] && COLORS[f].light) || '#ffffff';
                ctx.fillStyle = color;
                ctx.fillRect(lx, ly - 5, 10, 10);
                ctx.fillStyle = '#e5e7eb';
                ctx.font = '10px Segoe UI, Arial';
                const label = (typeof FACTION_NAMES !== 'undefined' && FACTION_NAMES && FACTION_NAMES[f]) ? FACTION_NAMES[f] : f;
                ctx.fillText(label, lx + 14, ly);
                ly += 14;
            });
        }

        function renderPowerSummary(targetEl) {
            if (!targetEl) return;

            let breakdown;
            try { breakdown = computeMilitaryPowerBreakdown(); } catch (e) { breakdown = {}; }

            const entries = Object.keys(breakdown)
                .map(f => ({ f, v: Math.round(breakdown[f].total || 0), b: breakdown[f] }))
                .filter(x => x.f !== 'neutral' && x.v > 0)
                .sort((a, b) => b.v - a.v);

            if (!entries.length) {
                targetEl.innerHTML = '<span style="opacity:0.85;">Нет данных по военному потенциалу.</span>';
                return;
            }

            const maxV = Math.max(1, entries[0].v);
            const fmt = (n) => {
                const v = Math.round(Number(n) || 0);
                try { return v.toLocaleString('ru-RU'); } catch (e) { return String(v); }
            };

            const header = `
                <div style="font-size: 12px; font-weight: 700; opacity: 0.92; margin: 0 0 6px;">
                    Расшифровка (итоговая мощь = планеты + флот + тех-бонус)
                </div>
            `;

            const thead = `
                <thead>
                    <tr>
                        <th style="width:42px;">#</th>
                        <th>Фракция</th>
                        <th>Всего</th>
                        <th>Планеты (мощь)</th>
                        <th>Флот (мощь)</th>
                        <th>Тех (бонус)</th>
                        <th>Планеты</th>
                        <th>Истр.</th>
                        <th>Линк.</th>
                        <th>Апгрейды</th>
                    </tr>
                </thead>
            `;

            const rows = entries.map((e, idx) => {
                const name = (typeof FACTION_NAMES !== 'undefined' && FACTION_NAMES && FACTION_NAMES[e.f]) ? FACTION_NAMES[e.f] : e.f;
                const c = (COLORS[e.f] && COLORS[e.f].light) ? COLORS[e.f].light : '#e5e7eb';
                const pct = Math.round((e.v / maxV) * 100);
                const up = (e.b && e.b.upgrades) ? e.b.upgrades : { speed: 1, attack: 1, armor: 1 };

                return `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>
                            <span class="power-dot" style="background:${c};"></span>${escapeHtml(name)}
                        </td>
                        <td>
                            <div>${fmt(e.v)}</div>
                            <div class="pb-sub">${pct}% от лидера</div>
                        </td>
                        <td>${fmt(e.b.planetPower || 0)}</td>
                        <td>${fmt(e.b.shipPower || 0)}</td>
                        <td>${fmt(e.b.techBonus || 0)}</td>
                        <td>${fmt(e.b.planets || 0)}</td>
                        <td>${fmt(e.b.fighters || 0)}</td>
                        <td>${fmt(e.b.battleships || 0)}</td>
                        <td style="white-space:nowrap;">🚀${fmt(up.speed || 1)} ⚔️${fmt(up.attack || 1)} 🛡️${fmt(up.armor || 1)}</td>
                    </tr>
                `;
            }).join('');

            const table = `
                <div class="power-breakdown-wrap">
                    <table class="power-breakdown-table">
                        ${thead}
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;

            targetEl.innerHTML = header + table;
        }


        function setEndScreenTab(prefix, tab) {
            const isPlanets = tab === 'planets';

            const btnPlanets = document.getElementById(prefix === 'win' ? 'winTabPlanets' : 'loseTabPlanets');
            const btnPower = document.getElementById(prefix === 'win' ? 'winTabPower' : 'loseTabPower');

            const secPlanets = document.getElementById(prefix === 'win' ? 'winStatsPlanets' : 'loseStatsPlanets');
            const secPower = document.getElementById(prefix === 'win' ? 'winStatsPower' : 'loseStatsPower');

            if (secPlanets) secPlanets.style.display = isPlanets ? 'block' : 'none';
            if (secPower) secPower.style.display = isPlanets ? 'none' : 'block';

            const activeBg = 'rgba(255,255,255,0.12)';
            const idleBg = 'rgba(255,255,255,0.06)';
            const activeBorder = 'rgba(255,255,255,0.18)';
            const idleBorder = 'rgba(255,255,255,0.14)';

            if (btnPlanets) {
                btnPlanets.style.opacity = isPlanets ? '1' : '0.8';
                btnPlanets.style.background = isPlanets ? activeBg : idleBg;
                btnPlanets.style.border = '1px solid ' + (isPlanets ? activeBorder : idleBorder);
            }
            if (btnPower) {
                btnPower.style.opacity = isPlanets ? '0.8' : '1';
                btnPower.style.background = isPlanets ? idleBg : activeBg;
                btnPower.style.border = '1px solid ' + (isPlanets ? idleBorder : activeBorder);
            }
        }

function evaluateFactionStrength(faction) {
            const planets = G.planets.filter(p => p.faction === faction);

            let fighters = 0;
            let battleships = 0;
            for (const ship of G.ships) {
                if (!ship.active || ship.faction !== faction) continue;
                if (ship.shipType === ShipType.FIGHTER) fighters++;
                else if (ship.shipType === ShipType.BATTLESHIP) battleships++;
            }

            let score = 0;
            score += planets.length * 100;
            score += fighters * 5;
            score += battleships * 50;

            planets.forEach(p => {
                if (p.type === 'industrial') score += 30;
                if (p.type === 'fortress') score += 40;
                if (p.type === 'resource') score += 20;
            });

            const upgrades = getFactionUpgrades(faction);
            score += (upgrades.speed + upgrades.attack + upgrades.armor) * 15;

            return score;
        }

