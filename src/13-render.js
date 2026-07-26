// ============================================================
// MODULE: 13-render.js
// Назначение: render() — основной рендер мира
// Оригинальные строки IIFE: 5633-6555
// Порядок загрузки: 14/24
// ============================================================

        function render() {
            // Clear gradient cache per frame to prevent unbounded growth
            gradientCache.clear();

            G.cam.scale += (G.cam.targetScale - G.cam.scale) * 0.1;

            const scale = G.cam.scale;
            const vw = canvas.width / scale;
            const vh = canvas.height / scale;

            G.cam.x = Math.max(vw / 2, Math.min(G.mapWidth - vw / 2, G.cam.x));
            G.cam.y = Math.max(vh / 2, Math.min(G.mapHeight - vh / 2, G.cam.y));

            const camX = G.cam.x - vw / 2;
            const camY = G.cam.y - vh / 2;

            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.scale(scale, scale);
            ctx.translate(-camX, -camY);

            ctx.fillStyle = '#fff';
            // Draw pre-rendered star background
            if (_starCanvas) {
                ctx.drawImage(_starCanvas, 0, 0);
            }

            G.waypoints.forEach(wp => {
                const age = G.time - wp.time;
                if (age > 300) return;

                ctx.globalAlpha = Math.max(0, 1 - age / 300);
                ctx.strokeStyle = '#60a5fa';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(wp.x, wp.y, 15 + Math.sin(G.time * 0.1) * 5, 0, Math.PI * 2);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(wp.x - 8, wp.y);
                ctx.lineTo(wp.x + 8, wp.y);
                ctx.moveTo(wp.x, wp.y - 8);
                ctx.lineTo(wp.x, wp.y + 8);
                ctx.stroke();
            });
            ctx.globalAlpha = 1;

            for (let pIdx = 0; pIdx < G.planets.length; pIdx++) {
                const p = G.planets[pIdx];
                if (p.x < camX - p.radius * 2 || p.x > camX + vw + p.radius * 2 ||
                    p.y < camY - p.radius * 2 || p.y > camY + vh + p.radius * 2) continue;

                const c = COLORS[p.faction] || COLORS.neutral;
                const typeData = PLANET_TYPES[p.type];

                // ── PULSING HIT FLASH ──
                if (p.hitTimer > 0) {
                    ctx.fillStyle = `rgba(255,255,255,${p.hitTimer / 20})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
                    ctx.fill();
                }

                // ── PLANET BODY (cached to offscreen canvas) ──
                const bodyCanvas = getPlanetBodyCanvas(p);
                ctx.drawImage(bodyCanvas, p.x - bodyCanvas.width / 2, p.y - bodyCanvas.height / 2);

                // Clouds (slowly drifting) — only for worlds with a real atmosphere
                const hasClouds = p.inhabited && (p.type === 'normal' || p.type === 'industrial');
                if (hasClouds && p.cloudPatches) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.clip();
                    const drift = (G.time || 0) * (p.cloudDrift || 0.0003);
                    // Industrial: yellowish-brown smog; normal: white
                    const cloudColor = p.type === 'industrial' ? 'rgba(225,210,180,1)' : 'rgba(255,255,255,1)';
                    ctx.globalAlpha = p.type === 'industrial' ? 0.5 : 0.6;
                    for (const cl of p.cloudPatches) {
                        const cx2 = p.x + (cl.nx * Math.cos(drift) - cl.ny * Math.sin(drift)) * p.radius;
                        const cy2 = p.y + (cl.nx * Math.sin(drift) + cl.ny * Math.cos(drift)) * p.radius;
                        ctx.save();
                        ctx.translate(cx2, cy2);
                        ctx.rotate(cl.rot);
                        ctx.scale(1, cl.ry / Math.max(cl.rx, 0.01));
                        ctx.beginPath();
                        ctx.arc(0, 0, cl.rx * p.radius, 0, Math.PI * 2);
                        ctx.fillStyle = cloudColor;
                        ctx.fill();
                        ctx.restore();
                    }
                    ctx.globalAlpha = 1;
                    ctx.restore();
                }

                // ── ATMOSPHERE RIM (crisp inner rim stroke only) ──
                let rimColor;
                if (p.type === 'resource') rimColor = 'rgba(168,85,247,0.45)';
                else if (p.type === 'fortress') rimColor = 'rgba(200,215,235,0.30)';
                else if (!p.inhabited) rimColor = 'rgba(190,130,80,0.30)';
                else rimColor = 'rgba(120,190,255,0.40)'; // earth-like
                ctx.strokeStyle = rimColor;
                ctx.lineWidth = p.radius * 0.12;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 1.04, 0, Math.PI * 2);
                ctx.stroke();

                // ── FORTRESS BEACONS (pulsing red lights at weapon mounts) ──
                if (p.type === 'fortress' && p.turrets) {
                    const pulse = 0.5 + 0.5 * Math.sin((G.time || 0) * 0.12);
                    ctx.save();
                    for (const t of p.turrets) {
                        const bx = p.x + Math.cos(t.angle) * (p.radius * 1.02);
                        const by = p.y + Math.sin(t.angle) * (p.radius * 1.02);
                        ctx.fillStyle = `rgba(255,180,120,${0.7 + pulse * 0.3})`;
                        ctx.beginPath();
                        ctx.arc(bx, by, 1.8 + pulse * 0.8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }

                if (p.name && G.cam.scale >= 0.75) {
                    const fontSize = Math.max(9, p.radius / 4);
                    ctx.save();
                    ctx.font = `bold ${fontSize}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillStyle = '#fff';
                    const namePrefix = p.inhabited ? '' : '⟠ ';
                    ctx.fillText(namePrefix + p.name, p.x, p.y - p.radius - 6);
                    ctx.restore();
                }

                ctx.font = `${Math.max(10, p.radius / 2)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.inhabited ? typeData.icon : '⟠', p.x, p.y - 2);

                const defenders = p.getDefenderCount();
                const attackers = p.getAttackerCount();
                const battleships = p.getBattleshipCount();

                ctx.font = `bold ${Math.max(8, p.radius / 4)}px Arial`;
                ctx.fillStyle = '#fff';

                let shipText = `🛡${defenders} ⚔${attackers}`;
                if (battleships > 0) shipText += ` 🚀${battleships}`;
                ctx.fillText(shipText, p.x, p.y + p.radius / 2 + 2);

                if (p.type === 'fortress' && p.faction !== 'neutral') {
                    p.turrets.forEach(turret => {
                        const tx = p.x + Math.cos(turret.angle) * (p.radius - 5);
                        const ty = p.y + Math.sin(turret.angle) * (p.radius - 5);

                        ctx.save();
                        ctx.translate(tx, ty);
                        ctx.rotate(turret.angle);

                        ctx.fillStyle = c.dark;
                        ctx.fillRect(-4, -3, 8, 6);
                        ctx.fillStyle = c.light;
                        ctx.fillRect(0, -2, 10, 4);

                        ctx.restore();
                    });
                }

                const barW = p.radius * 2, barH = 4, barY = p.y + p.radius + 10;
                ctx.fillStyle = '#333';
                ctx.fillRect(p.x - barW / 2, barY, barW, barH);
                const hpPct = Math.max(0, p.hp / p.maxHp);
                ctx.fillStyle = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444';
                ctx.fillRect(p.x - barW / 2, barY, barW * hpPct, barH);

                // Colonization progress (neutral planets)
                if (p.faction === 'neutral' && p.colonizing) {
                    const col = p.colonizing;
                    const pct = Math.max(0, Math.min(1, 1 - (col.endTime - G.time) / COLONIZATION_TIME_TICKS));
                    const colColor = (COLORS[col.faction] || COLORS.neutral).light;
                    const t2 = G.time * 0.03;

                    // Pulsing ring around planet during colonization
                    const pulseR = p.radius + 6 + Math.sin(t2 * 2) * 3;
                    ctx.strokeStyle = colColor + '55';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, pulseR + 10, 0, Math.PI * 2);
                    ctx.stroke();

                    // Status text
                    ctx.fillStyle = '#fff';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('🛰 ' + Math.floor(pct * 100) + '%', p.x, p.y + p.radius + 35);
                }
            }

            // Batch projectiles by faction for fewer draw calls
            const _projBatchBig = {};
            const _projBatchSmall = {};
            for (let pi = 0; pi < G.projectiles.length; pi++) {
                const p = G.projectiles[pi];
                if (!p.active) continue;
                if (p.x < camX - 20 || p.x > camX + vw + 20 || p.y < camY - 20 || p.y > camY + vh + 20) continue;
                const c = COLORS[p.faction] || COLORS.neutral;
                const colorKey = c.light;
                if (p.isBig) {
                    if (!_projBatchBig[colorKey]) _projBatchBig[colorKey] = [];
                    _projBatchBig[colorKey].push(p);
                } else {
                    if (!_projBatchSmall[colorKey]) _projBatchSmall[colorKey] = [];
                    _projBatchSmall[colorKey].push(p);
                }
            }
            // Draw big projectiles
            for (const colorKey in _projBatchBig) {
                const batch = _projBatchBig[colorKey];
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                for (let i = 0; i < batch.length; i++) {
                    const p = batch[i];
                    ctx.moveTo(p.x - p.vx * 3, p.y - p.vy * 3);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
                ctx.strokeStyle = colorKey;
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < batch.length; i++) {
                    const p = batch[i];
                    ctx.moveTo(p.x - p.vx * 2, p.y - p.vy * 2);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
            // Draw small projectiles
            for (const colorKey in _projBatchSmall) {
                const batch = _projBatchSmall[colorKey];
                ctx.lineCap = 'round';
                ctx.strokeStyle = colorKey;
                ctx.lineWidth = 3;
                ctx.beginPath();
                for (let i = 0; i < batch.length; i++) {
                    const p = batch[i];
                    ctx.moveTo(p.x - p.vx * 2, p.y - p.vy * 2);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = 0; i < batch.length; i++) {
                    const p = batch[i];
                    ctx.moveTo(p.x - p.vx, p.y - p.vy);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }

            for (let si = 0; si < G.ships.length; si++) {
                const s = G.ships[si];
                if (!s.active) continue;
                if (s.x < camX - 50 || s.x > camX + vw + 50 || s.y < camY - 50 || s.y > camY + vh + 50) continue;

                const c = COLORS[s.faction] || COLORS.neutral;

                // === CARGO SHIP RENDERING ===
                if (s.shipType === ShipType.CARGO) {

                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.rotate(s.angle);

                    // Hull - boxy cargo shape
                    ctx.fillStyle = '#1a1a2e';
                    ctx.beginPath();
                    ctx.moveTo(14, 0);
                    ctx.lineTo(8, -8);
                    ctx.lineTo(-10, -9);
                    ctx.lineTo(-14, -6);
                    ctx.lineTo(-14, 6);
                    ctx.lineTo(-10, 9);
                    ctx.lineTo(8, 8);
                    ctx.closePath();
                    ctx.fill();

                    // Inner hull color
                    ctx.fillStyle = c.dark;
                    ctx.beginPath();
                    ctx.moveTo(12, 0);
                    ctx.lineTo(6, -6);
                    ctx.lineTo(-8, -7);
                    ctx.lineTo(-12, -5);
                    ctx.lineTo(-12, 5);
                    ctx.lineTo(-8, 7);
                    ctx.lineTo(6, 6);
                    ctx.closePath();
                    ctx.fill();

                    // Cargo bay indicator (purple when loaded)
                    ctx.fillStyle = s.loaded ? '#a855f7' : '#333';
                    ctx.fillRect(-6, -4, 8, 8);
                    ctx.strokeStyle = '#555';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(-6, -4, 8, 8);

                    // Forward accent
                    ctx.fillStyle = c.main;
                    ctx.beginPath();
                    ctx.moveTo(12, 0);
                    ctx.lineTo(6, -4);
                    ctx.lineTo(6, 4);
                    ctx.closePath();
                    ctx.fill();

                    ctx.restore();

                    // HP bar for cargo
                    const bw = 20, bh = 2, by = s.y + 12;
                    ctx.fillStyle = '#333';
                    ctx.fillRect(s.x - bw / 2, by, bw, bh);
                    const hp = Math.max(0, s.hp / s.maxHp);
                    ctx.fillStyle = hp > 0.5 ? '#a855f7' : '#ef4444';
                    ctx.fillRect(s.x - bw / 2, by, bw * hp, bh);
                }
                else if (s.shipType === ShipType.BATTLESHIP) {

                    const bt = G.time * 0.03;

                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.rotate(s.angle);

                    // === Heavy armored hull ===
                    // Outer armor plating - dark base
                    ctx.fillStyle = '#0d0d1a';
                    ctx.beginPath();
                    ctx.moveTo(30, 0);
                    ctx.lineTo(20, -8);
                    ctx.lineTo(8, -12);
                    ctx.lineTo(-8, -14);
                    ctx.lineTo(-24, -13);
                    ctx.lineTo(-30, -9);
                    ctx.lineTo(-30, 9);
                    ctx.lineTo(-24, 13);
                    ctx.lineTo(-8, 14);
                    ctx.lineTo(8, 12);
                    ctx.lineTo(20, 8);
                    ctx.closePath();
                    ctx.fill();

                    // Main hull plating
                    ctx.fillStyle = c.dark;
                    ctx.beginPath();
                    ctx.moveTo(28, 0);
                    ctx.lineTo(18, -7);
                    ctx.lineTo(6, -10);
                    ctx.lineTo(-8, -12);
                    ctx.lineTo(-22, -11);
                    ctx.lineTo(-28, -7);
                    ctx.lineTo(-28, 7);
                    ctx.lineTo(-22, 11);
                    ctx.lineTo(-8, 12);
                    ctx.lineTo(6, 10);
                    ctx.lineTo(18, 7);
                    ctx.closePath();
                    ctx.fill();

                    // Armor panel lines (horizontal seams)
                    ctx.strokeStyle = '#00000044';
                    ctx.lineWidth = 0.7;
                    ctx.beginPath();
                    ctx.moveTo(20, -4); ctx.lineTo(-24, -6);
                    ctx.moveTo(20, 4); ctx.lineTo(-24, 6);
                    ctx.moveTo(12, -9); ctx.lineTo(-20, -11);
                    ctx.moveTo(12, 9); ctx.lineTo(-20, 11);
                    ctx.stroke();

                    // Mid-section accent stripe
                    ctx.fillStyle = c.main;
                    ctx.beginPath();
                    ctx.moveTo(26, 0);
                    ctx.lineTo(16, -5);
                    ctx.lineTo(-6, -6);
                    ctx.lineTo(-22, -5);
                    ctx.lineTo(-22, 5);
                    ctx.lineTo(-6, 6);
                    ctx.lineTo(16, 5);
                    ctx.closePath();
                    ctx.fill();

                    // Bridge / command tower (raised section)
                    ctx.fillStyle = c.dark;
                    ctx.beginPath();
                    ctx.moveTo(10, -4);
                    ctx.lineTo(3, -7);
                    ctx.lineTo(-8, -7);
                    ctx.lineTo(-10, -4);
                    ctx.lineTo(-10, 4);
                    ctx.lineTo(-8, 7);
                    ctx.lineTo(3, 7);
                    ctx.lineTo(10, 4);
                    ctx.closePath();
                    ctx.fill();

                    // Bridge windows
                    ctx.fillStyle = '#aaddff';
                    ctx.globalAlpha = 0.6 + Math.sin(bt * 2) * 0.15;
                    ctx.beginPath();
                    ctx.roundRect(4, -3, 4, 2, 0.5);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.roundRect(4, 1, 4, 2, 0.5);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.roundRect(-1, -3, 4, 2, 0.5);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.roundRect(-1, 1, 4, 2, 0.5);
                    ctx.fill();
                    ctx.globalAlpha = 1;

                    // Forward ram / prow reinforcement
                    ctx.fillStyle = c.light + '88';
                    ctx.beginPath();
                    ctx.moveTo(30, 0);
                    ctx.lineTo(22, -3);
                    ctx.lineTo(22, 3);
                    ctx.closePath();
                    ctx.fill();

                    // Side weapon bays (port)
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(-16, -13, 6, 2);
                    ctx.fillRect(-6, -12, 6, 2);
                    ctx.fillRect(4, -11, 6, 2);
                    // Side weapon bays (starboard)
                    ctx.fillRect(-16, 11, 6, 2);
                    ctx.fillRect(-6, 10, 6, 2);
                    ctx.fillRect(4, 9, 6, 2);

                    // === Turrets (improved) ===
                    s.turrets.forEach(turret => {
                        ctx.save();
                        ctx.translate(turret.x, turret.y);
                        ctx.rotate(turret.angle);

                        // Turret base - armored ring
                        ctx.fillStyle = '#1a1a2e';
                        ctx.beginPath();
                        ctx.arc(0, 0, 6, 0, Math.PI * 2);
                        ctx.fill();

                        // Turret housing
                        ctx.fillStyle = c.dark;
                        ctx.beginPath();
                        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
                        ctx.fill();

                        // Gun barrel - dual cannons
                        ctx.fillStyle = '#2a2a3e';
                        ctx.fillRect(2, -3, 12, 2);
                        ctx.fillRect(2, 1, 12, 2);

                        // Barrel tips (muzzle)
                        ctx.fillStyle = c.light + '99';
                        ctx.fillRect(12, -3, 2, 2);
                        ctx.fillRect(12, 1, 2, 2);

                        // Turret center dot
                        ctx.fillStyle = c.main;
                        ctx.beginPath();
                        ctx.arc(0, 0, 2, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.restore();
                    });

                    // === Engine section ===
                    // Engine housing
                    ctx.fillStyle = '#111122';
                    ctx.beginPath();
                    ctx.moveTo(-28, -8);
                    ctx.lineTo(-33, -7);
                    ctx.lineTo(-33, 7);
                    ctx.lineTo(-28, 8);
                    ctx.closePath();
                    ctx.fill();

                    // Main engine nozzles (4 engines)
                    for (let en = 0; en < 4; en++) {
                        const ey = -6 + en * 4;
                        // Nozzle housing
                        ctx.fillStyle = '#1a1a2e';
                        ctx.beginPath();
                        ctx.moveTo(-33, ey - 1.5);
                        ctx.lineTo(-36, ey - 2);
                        ctx.lineTo(-36, ey + 2);
                        ctx.lineTo(-33, ey + 1.5);
                        ctx.closePath();
                        ctx.fill();

                        // Thrust flame - outer
                        const flicker = Math.random() * 6;
                        ctx.fillStyle = c.light + 'bb';
                        ctx.beginPath();
                        ctx.moveTo(-36, ey - 1.8);
                        ctx.lineTo(-42 - flicker, ey);
                        ctx.lineTo(-36, ey + 1.8);
                        ctx.closePath();
                        ctx.fill();

                        // Thrust flame - inner (hot core)
                        ctx.fillStyle = '#fff';
                        ctx.globalAlpha = 0.7;
                        ctx.beginPath();
                        ctx.moveTo(-36, ey - 0.8);
                        ctx.lineTo(-39 - flicker * 0.4, ey);
                        ctx.lineTo(-36, ey + 0.8);
                        ctx.closePath();
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }

                    // Antenna / sensor mast
                    ctx.strokeStyle = c.light + '66';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(-4, -7);
                    ctx.lineTo(-4, -16);
                    ctx.stroke();
                    ctx.fillStyle = c.light;
                    ctx.beginPath();
                    ctx.arc(-4, -16, 1.5, 0, Math.PI * 2);
                    ctx.fill();

                    // Running lights
                    if (Math.sin(bt * 4) > 0.2) {
                        ctx.fillStyle = '#ff2222';
                        ctx.beginPath();
                        ctx.arc(28, -2, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    if (Math.sin(bt * 4 + Math.PI) > 0.2) {
                        ctx.fillStyle = '#22ff22';
                        ctx.beginPath();
                        ctx.arc(28, 2, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // Rear warning light
                    if (Math.sin(bt * 6) > 0) {
                        ctx.fillStyle = '#ffaa00';
                        ctx.globalAlpha = 0.6;
                        ctx.beginPath();
                        ctx.arc(-30, 0, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }

                    ctx.restore();

                    // Shield bar
                    if (s.maxShield && s.shield > 0) {
                        const shieldBarW = 36, shieldPct = s.shield / s.maxShield;
                        ctx.fillStyle = '#0a0a2a';
                        ctx.fillRect(s.x - shieldBarW / 2, s.y - 30, shieldBarW, 2);
                        ctx.fillStyle = '#3b82f6';
                        ctx.fillRect(s.x - shieldBarW / 2, s.y - 30, shieldBarW * shieldPct, 2);
                    }

                    // HP bar
                    if (s.hp < s.maxHp) {
                        const barW = 36, hpPct = s.hp / s.maxHp;
                        ctx.fillStyle = '#333';
                        ctx.fillRect(s.x - barW / 2, s.y - 26, barW, 4);
                        ctx.fillStyle = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444';
                        ctx.fillRect(s.x - barW / 2, s.y - 26, barW * hpPct, 4);
                    }
                } else if (s.shipType === ShipType.COLONIZER) {

                    const t = G.time * 0.03;

                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.rotate(s.angle);

                    // === Main hull - elongated colony ship ===
                    // Rear engine block
                    ctx.fillStyle = '#1a1a2e';
                    ctx.beginPath();
                    ctx.moveTo(-22, -8);
                    ctx.lineTo(-16, -8);
                    ctx.lineTo(-16, 8);
                    ctx.lineTo(-22, 8);
                    ctx.closePath();
                    ctx.fill();

                    // Main body - long central hull
                    ctx.fillStyle = c.dark;
                    ctx.beginPath();
                    ctx.moveTo(22, 0);
                    ctx.quadraticCurveTo(18, -6, 8, -7);
                    ctx.lineTo(-16, -5);
                    ctx.lineTo(-16, 5);
                    ctx.lineTo(8, 7);
                    ctx.quadraticCurveTo(18, 6, 22, 0);
                    ctx.closePath();
                    ctx.fill();

                    // Top cargo pod
                    ctx.fillStyle = c.main;
                    ctx.beginPath();
                    ctx.roundRect(-8, -11, 14, 5, 2);
                    ctx.fill();

                    // Bottom cargo pod
                    ctx.beginPath();
                    ctx.roundRect(-8, 6, 14, 5, 2);
                    ctx.fill();

                    // Struts connecting pods
                    ctx.strokeStyle = c.dark;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-2, -6); ctx.lineTo(-2, -11);
                    ctx.moveTo(4, -6); ctx.lineTo(4, -11);
                    ctx.moveTo(-2, 6); ctx.lineTo(-2, 11);
                    ctx.moveTo(4, 6); ctx.lineTo(4, 11);
                    ctx.stroke();

                    // Habitat dome ring (flat dot, no gradient glow)
                    ctx.fillStyle = c.light;
                    ctx.beginPath();
                    ctx.arc(2, 0, 4, 0, Math.PI * 2);
                    ctx.fill();

                    // Habitat dome ring
                    ctx.strokeStyle = c.light;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.ellipse(2, 0, 5, 5, 0, 0, Math.PI * 2);
                    ctx.stroke();

                    // Bridge (front section)
                    ctx.fillStyle = '#aaddff';
                    ctx.beginPath();
                    ctx.moveTo(22, 0);
                    ctx.lineTo(16, -3);
                    ctx.lineTo(16, 3);
                    ctx.closePath();
                    ctx.fill();

                    // Side fins / solar panels
                    ctx.fillStyle = c.main + '88';
                    ctx.beginPath();
                    ctx.moveTo(-12, -6);
                    ctx.lineTo(-6, -14);
                    ctx.lineTo(2, -14);
                    ctx.lineTo(-4, -6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(-12, 6);
                    ctx.lineTo(-6, 14);
                    ctx.lineTo(2, 14);
                    ctx.lineTo(-4, 6);
                    ctx.closePath();
                    ctx.fill();

                    // Solar panel grid lines
                    ctx.strokeStyle = c.light + '55';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(-9, -9); ctx.lineTo(-1, -9);
                    ctx.moveTo(-8, -11); ctx.lineTo(0, -11);
                    ctx.moveTo(-9, 9); ctx.lineTo(-1, 9);
                    ctx.moveTo(-8, 11); ctx.lineTo(0, 11);
                    ctx.stroke();

                    // Engine nozzles (3 engines)
                    for (let en = -1; en <= 1; en++) {
                        const ey = en * 5;
                        // Nozzle cone
                        ctx.fillStyle = '#334';
                        ctx.beginPath();
                        ctx.moveTo(-22, ey - 2);
                        ctx.lineTo(-25, ey - 3);
                        ctx.lineTo(-25, ey + 3);
                        ctx.lineTo(-22, ey + 2);
                        ctx.closePath();
                        ctx.fill();
                        // Thrust flame
                        const flicker = Math.random() * 4;
                        ctx.fillStyle = '#4af';
                        ctx.beginPath();
                        ctx.moveTo(-25, ey - 2.5);
                        ctx.lineTo(-30 - flicker, ey);
                        ctx.lineTo(-25, ey + 2.5);
                        ctx.closePath();
                        ctx.fill();
                        ctx.fillStyle = '#aef';
                        ctx.beginPath();
                        ctx.moveTo(-25, ey - 1.5);
                        ctx.lineTo(-28 - flicker * 0.5, ey);
                        ctx.lineTo(-25, ey + 1.5);
                        ctx.closePath();
                        ctx.fill();
                    }

                    // Blinking nav light
                    if (Math.sin(t * 3) > 0.3) {
                        ctx.fillStyle = '#ff3333';
                        ctx.beginPath();
                        ctx.arc(20, -2, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    if (Math.sin(t * 3 + 1.5) > 0.3) {
                        ctx.fillStyle = '#33ff33';
                        ctx.beginPath();
                        ctx.arc(20, 2, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.restore();

                    // === Colonization beam & effects ===
                    if (s.state === ShipState.COLONIZE && s.targetPlanet && s.targetPlanet.colonizing && s.targetPlanet.colonizing.colonizer === s) {
                        const col = s.targetPlanet.colonizing;
                        const pct = Math.max(0, Math.min(1, 1 - (col.endTime - G.time) / COLONIZATION_TIME_TICKS));
                        const tp = s.targetPlanet;

                        // Energy beam from ship to planet
                        const beamAlpha = 0.3 + Math.sin(t * 4) * 0.15;
                        ctx.save();
                        ctx.globalAlpha = beamAlpha;
                        ctx.strokeStyle = c.light;
                        ctx.lineWidth = 2 + Math.sin(t * 6) * 1;
                        ctx.setLineDash([4, 6]);
                        ctx.lineDashOffset = -G.time * 0.5;
                        ctx.beginPath();
                        ctx.moveTo(s.x, s.y);
                        ctx.lineTo(tp.x, tp.y);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.globalAlpha = 1;
                        ctx.restore();

                        // Expanding colonization rings on the planet
                        for (let ring = 0; ring < 3; ring++) {
                            const ringPhase = (t * 1.2 + ring * 2.1) % (Math.PI * 2);
                            const ringR = tp.radius + 8 + Math.sin(ringPhase) * 15 * pct + ring * 8;
                            const ringAlpha = (0.15 + pct * 0.25) * (1 - ring * 0.25);
                            ctx.strokeStyle = c.light;
                            ctx.lineWidth = 1.5 - ring * 0.3;
                            ctx.globalAlpha = ringAlpha;
                            ctx.beginPath();
                            ctx.arc(tp.x, tp.y, ringR, 0, Math.PI * 2);
                            ctx.stroke();
                        }
                        ctx.globalAlpha = 1;

                        // Scanning sweep beam on the planet
                        const sweepAngle = t * 2;
                        const sweepR = tp.radius + 12;
                        ctx.save();
                        ctx.globalAlpha = 0.2 + pct * 0.2;
                        ctx.beginPath();
                        ctx.moveTo(tp.x, tp.y);
                        ctx.arc(tp.x, tp.y, sweepR, sweepAngle, sweepAngle + 0.5);
                        ctx.closePath();
                        ctx.fillStyle = c.light;
                        ctx.fill();
                        ctx.restore();

                        // Landing particles falling toward planet
                        const particleCount = Math.floor(3 + pct * 8);
                        for (let pi = 0; pi < particleCount; pi++) {
                            const pa = (t * 0.7 + pi * (Math.PI * 2 / particleCount)) % (Math.PI * 2);
                            const pDist = tp.radius + 20 - pct * 10 + Math.sin(t * 3 + pi) * 5;
                            const px = tp.x + Math.cos(pa) * pDist;
                            const py = tp.y + Math.sin(pa) * pDist;
                            const pSize = 1 + pct * 1.5;
                            ctx.fillStyle = c.light;
                            ctx.globalAlpha = 0.4 + pct * 0.4;
                            ctx.beginPath();
                            ctx.arc(px, py, pSize, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.globalAlpha = 1;

                        // Progress percentage on planet
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 11px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(Math.floor(pct * 100) + '%', tp.x, tp.y + tp.radius + 22);

                        // Circular progress arc around planet
                        ctx.strokeStyle = c.light;
                        ctx.lineWidth = 3;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.arc(tp.x, tp.y, tp.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
                        ctx.stroke();

                        // Background arc
                        ctx.strokeStyle = '#333';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.arc(tp.x, tp.y, tp.radius + 4, -Math.PI / 2 + Math.PI * 2 * pct, -Math.PI / 2 + Math.PI * 2);
                        ctx.stroke();
                    }

                    // HP bar
                    if (s.hp < s.maxHp) {
                        const barW = 34, barH = 3;
                        const barY = s.y + 20;
                        ctx.fillStyle = '#333';
                        ctx.fillRect(s.x - barW / 2, barY, barW, barH);
                        const hpPct = Math.max(0, s.hp / s.maxHp);
                        ctx.fillStyle = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444';
                        ctx.fillRect(s.x - barW / 2, barY, barW * hpPct, barH);
                    }

                } else {

                    const isDefender = s.role === ShipRole.DEFENDER;
                    const isEscort = s instanceof EscortShip;
                    const sizeMultiplier = isEscort ? 0.5 : 1;

                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.rotate(s.angle);
                    ctx.scale(sizeMultiplier, sizeMultiplier);

                    if (isDefender) {
                        ctx.fillStyle = c.main;
                        ctx.beginPath();
                        ctx.moveTo(6, 0);
                        ctx.lineTo(0, -6);
                        ctx.lineTo(-4, 0);
                        ctx.lineTo(0, 6);
                        ctx.closePath();
                        ctx.fill();

                        ctx.fillStyle = c.light;
                        ctx.beginPath();
                        ctx.moveTo(4, 0);
                        ctx.lineTo(0, -3);
                        ctx.lineTo(0, 3);
                        ctx.closePath();
                        ctx.fill();
                    } else {
                        ctx.fillStyle = c.main;
                        ctx.beginPath();
                        ctx.moveTo(9, 0);
                        ctx.lineTo(-5, -4);
                        ctx.lineTo(-3, 0);
                        ctx.lineTo(-5, 4);
                        ctx.closePath();
                        ctx.fill();

                        ctx.fillStyle = c.light;
                        ctx.beginPath();
                        ctx.moveTo(7, 0);
                        ctx.lineTo(-2, -2);
                        ctx.lineTo(-2, 2);
                        ctx.closePath();
                        ctx.fill();
                    }

                    ctx.restore();

                    if (s.hp < s.maxHp) {
                        const barW = 14 * sizeMultiplier, hpPct = s.hp / s.maxHp;
                        ctx.fillStyle = '#333';
                        ctx.fillRect(s.x - barW / 2, s.y - 12 * sizeMultiplier, barW, 3);
                        ctx.fillStyle = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444';
                        ctx.fillRect(s.x - barW / 2, s.y - 12 * sizeMultiplier, barW * hpPct, 3);
                    }
                }
            }

            for (let ei = 0; ei < G.explosions.length; ei++) {
                const e = G.explosions[ei];
                if (e.x < camX - e.radius || e.x > camX + vw + e.radius || e.y < camY - e.radius || e.y > camY + vh + e.radius) continue;
                ctx.globalAlpha = e.life;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            for (let pi = 0; pi < G.particles.length; pi++) {
                const p = G.particles[pi];
                if (!p.active) continue;
                if (p.x < camX - 5 || p.x > camX + vw + 5 || p.y < camY - 5 || p.y > camY + vh + 5) continue;
                ctx.globalAlpha = p.life / p.maxLife;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            ctx.restore();

            drawMinimap();
        }

