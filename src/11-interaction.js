// ============================================================
// MODULE: 11-interaction.js
// Назначение: screenToWorld, handleTap, модалка колонизации
// Оригинальные строки IIFE: 5007-5294
// Порядок загрузки: 12/24
// ============================================================

        function screenToWorld(sx, sy) {

            const rect = canvas.getBoundingClientRect();
            const canvasX = sx - rect.left;
            const canvasY = sy - rect.top;

            const scale = G.cam.scale;
            const vw = canvas.width / scale;
            const vh = canvas.height / scale;
            const camX = G.cam.x - vw / 2;
            const camY = G.cam.y - vh / 2;
            return { x: camX + canvasX / scale, y: camY + canvasY / scale };
        }

        function handleTap(screenX, screenY) {
            if (G.spectatorMode || G.playerDefeated) return;
            const world = screenToWorld(screenX, screenY);
            const tapped = G.planets.find(p => MathUtils.distanceSquared(p.x, p.y, world.x, world.y) < (p.radius + 30) * (p.radius + 30));

            // Линкоры полностью автономны — команды игрока на них не действуют.
            const attackerShips = G.ships.filter(s => s.faction === 'player' && s.active && s.role === ShipRole.ATTACKER && s.shipType !== ShipType.COLONIZER && s.shipType !== ShipType.BATTLESHIP);

            if (tapped) {
                if (tapped.faction === 'player') {
                    attackerShips.forEach(ship => {
                        if (ship.state !== ShipState.GUARD) {
                            ship.targetPlanet = tapped;
                            ship.state = ShipState.TRAVEL;
                            ship.target = null;
                            ship.waypoint = null;
                        }
                    });
                    spawnParticles(world.x, world.y, '#4ade80', 3);
                    G.selectedPlanet = tapped;
                } else {
                    if (tapped.faction === 'neutral') {
                        G.selectedPlanet = tapped;
                        showColonizeModal(tapped);
                        spawnParticles(world.x, world.y, '#60a5fa', 3);
                    } else {
                        attackerShips.forEach(ship => {
                            ship.targetPlanet = tapped;
                            ship.state = ShipState.TRAVEL;
                            ship.target = null;
                            ship.waypoint = null;
                        });
                        spawnParticles(world.x, world.y, '#f87171', 3);
                        G.selectedPlanet = null;
                    }
                }
            } else {
                const waypoint = { x: world.x, y: world.y, time: G.time };

                attackerShips.forEach(ship => {
                    ship.waypoint = waypoint;
                    ship.targetPlanet = null;
                    ship.target = null;
                    ship.state = ShipState.WAYPOINT;
                });

                spawnParticles(world.x, world.y, '#60a5fa', 4);
                G.waypoints.push(waypoint);
                G.selectedPlanet = null;
            }
        }

        
        // === Colonization (neutral planets) ===
        G.pendingColonizePlanet = null;

        const colonizeModalEl = document.getElementById('colonizeModal');
        const colonizePlanetNameEl = document.getElementById('colonizePlanetName');
        const colonizeStatusTextEl = document.getElementById('colonizeStatusText');
        const colonizeConfirmBtn = document.getElementById('colonizeConfirm');
        const closeColonizeBtn = document.getElementById('closeColonize');

        function canColonizePlanet(faction, planet) {
            if (!planet || !planet.active) return { ok: false, reason: 'planet_not_found' };
            if (planet.faction !== 'neutral') return { ok: false, reason: 'not_neutral' };
            if (planet.colonizing) return { ok: false, reason: 'already_colonizing', by: planet.colonizing.faction };
            const funds = getFactionStars(faction);
            if (funds < COLONIZER_COST) return { ok: false, reason: 'insufficient_funds', funds };
            const origins = G.planets.filter(p => p.active && p.faction === faction);
            if (!origins.length) return { ok: false, reason: 'no_origin_planet' };
            return { ok: true, funds, origins };
        }

        function pickOriginPlanetForColonizer(faction, targetPlanet) {
            const origins = G.planets.filter(p => p.active && p.faction === faction);
            if (!origins.length) return null;
            let best = origins[0], bestD = Infinity;
            for (const p of origins) {
                const d = MathUtils.distanceSquared(p.x, p.y, targetPlanet.x, targetPlanet.y);
                if (d < bestD) { bestD = d; best = p; }
            }
            return best;
        }

        function buildAndSendColonizer(faction, targetPlanet, meta) {
            const check = canColonizePlanet(faction, targetPlanet);
            if (!check.ok) return { success: false, error: check.reason, details: check };

            const origin = pickOriginPlanetForColonizer(faction, targetPlanet);
            if (!origin) return { success: false, error: 'no_origin_planet' };

            spendFactionStars(faction, COLONIZER_COST);

            const angle = Math.random() * Math.PI * 2;
            const dist = origin.radius + 110;
            const colonizer = new Colonizer(
                origin.x + Math.cos(angle) * dist,
                origin.y + Math.sin(angle) * dist,
                faction,
                origin
            );
            colonizer.targetPlanet = targetPlanet;
            colonizer.state = ShipState.TRAVEL;

            G.ships.push(colonizer);

            if (faction === 'player') {
                pushSystemInbox('🛰 Колонизатор отправлен на ' + (targetPlanet.name || 'нейтральную планету'));
            }

            try {
                const m = (meta && typeof meta === 'object') ? meta : {};
                logDiplomaticEvent('colonize', faction, 'neutral', { planet: targetPlanet.name || '', cost: COLONIZER_COST, source: m.source || 'game' });
            } catch (e) {}

            return { success: true };
        }

        function updateColonizeModal() {
            if (!colonizeModalEl || colonizeModalEl.classList.contains('hidden')) return;
            const planet = G.pendingColonizePlanet;
            if (!planet) return;

            const pname = planet.name || 'Нейтральная планета';
            colonizePlanetNameEl.textContent = '🌍 ' + pname;

            if (planet.colonizing) {
                const by = planet.colonizing.faction;
                const left = Math.max(0, Math.ceil((planet.colonizing.endTime - G.time) / 60));
                colonizeStatusTextEl.textContent = 'Сейчас идёт освоение фракцией: ' + ((typeof FACTION_NAMES !== 'undefined' && FACTION_NAMES[by]) ? FACTION_NAMES[by] : by) + ' (' + left + 'с).';
                colonizeConfirmBtn.disabled = true;
                return;
            }

            const check = canColonizePlanet('player', planet);
            if (!check.ok) {
                if (check.reason === 'insufficient_funds') {
                    colonizeStatusTextEl.textContent = 'Недостаточно денег. Нужно ' + COLONIZER_COST + '💲, у вас: ' + Math.floor(getFactionStars('player')) + '💲.';
                } else if (check.reason === 'no_origin_planet') {
                    colonizeStatusTextEl.textContent = 'Нет своих планет, чтобы построить колонизатор.';
                } else {
                    colonizeStatusTextEl.textContent = 'Нельзя колонизировать эту планету.';
                }
                colonizeConfirmBtn.disabled = true;
                return;
            }

            colonizeStatusTextEl.textContent = 'Построить колонизатор за ' + COLONIZER_COST + '💲 и отправить на освоение (40 секунд после прибытия).';
            colonizeConfirmBtn.disabled = false;
        }

        function showColonizeModal(planet) {
            if (!colonizeModalEl) return;
            if (G.spectatorMode || G.playerDefeated) return;

            G.pendingColonizePlanet = planet;
            colonizeModalEl.classList.remove('hidden');
            updateColonizeModal();
        }

        function hideColonizeModal() {
            if (!colonizeModalEl) return;
            colonizeModalEl.classList.add('hidden');
            G.pendingColonizePlanet = null;
        }

        if (closeColonizeBtn) closeColonizeBtn.addEventListener('click', hideColonizeModal);
        if (colonizeModalEl) colonizeModalEl.addEventListener('click', (e) => { if (e.target === colonizeModalEl) hideColonizeModal(); });
        if (colonizeConfirmBtn) colonizeConfirmBtn.addEventListener('click', () => {
            const planet = G.pendingColonizePlanet;
            if (!planet) return;
            const res = buildAndSendColonizer('player', planet, { source: 'ui' });
            if (res && res.success) hideColonizeModal();
            else updateColonizeModal();
        });


        canvas.addEventListener('mousedown', (e) => {
            input.dragging = true;
            input.lastX = input.startX = e.clientX;
            input.lastY = input.startY = e.clientY;
            input.moved = false;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!input.dragging) return;

            const dx = e.clientX - input.lastX;
            const dy = e.clientY - input.lastY;

            if (Math.abs(e.clientX - input.startX) > 10 || Math.abs(e.clientY - input.startY) > 10) {
                input.moved = true;
            }

            G.cam.x -= dx / G.cam.scale;
            G.cam.y -= dy / G.cam.scale;

            input.lastX = e.clientX;
            input.lastY = e.clientY;
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!input.moved && G.running) {
                handleTap(e.clientX, e.clientY);
            }
            input.dragging = false;
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            G.cam.targetScale = Math.max(0.3, Math.min(2, G.cam.targetScale - e.deltaY * 0.001));
        }, { passive: false });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                input.pinching = true;
                input.dragging = false;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                input.pinchDist = Math.hypot(dx, dy);
                input.pinchScale = G.cam.scale;
            } else if (e.touches.length === 1) {
                input.dragging = true;
                input.pinching = false;
                input.lastX = input.startX = e.touches[0].clientX;
                input.lastY = input.startY = e.touches[0].clientY;
                input.moved = false;
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 2 && input.pinching) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                G.cam.targetScale = Math.max(0.3, Math.min(2, (dist / input.pinchDist) * input.pinchScale));
                G.cam.scale = G.cam.targetScale;
            } else if (e.touches.length === 1 && input.dragging && !input.pinching) {
                const dx = e.touches[0].clientX - input.lastX;
                const dy = e.touches[0].clientY - input.lastY;

                if (Math.abs(e.touches[0].clientX - input.startX) > 10 || Math.abs(e.touches[0].clientY - input.startY) > 10) {
                    input.moved = true;
                }

                G.cam.x -= dx / G.cam.scale;
                G.cam.y -= dy / G.cam.scale;

                input.lastX = e.touches[0].clientX;
                input.lastY = e.touches[0].clientY;
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (e.touches.length === 0) {
                if (!input.moved && !input.pinching && G.running) {
                    const touch = e.changedTouches[0];
                    handleTap(touch.clientX, touch.clientY);
                }
                input.dragging = false;
                input.pinching = false;
            } else if (e.touches.length === 1) {
                input.pinching = false;
                input.dragging = true;
                input.lastX = e.touches[0].clientX;
                input.lastY = e.touches[0].clientY;
                input.startX = input.lastX;
                input.startY = input.lastY;
                input.moved = true;
            }
        }, { passive: false });

