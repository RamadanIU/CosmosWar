// ============================================================
// MODULE: 03-render-cache.js
// Назначение: Кэши рендера: звёздный фон, тела планет (без свечения для производительности)
// Оригинальные строки IIFE: 1762-1918
// Порядок загрузки: 4/24
// ============================================================

        // Glow sprite cache removed for performance - no glow effects used

        // === STAR BACKGROUND CACHE (pre-rendered) ===
        let _starCanvas = null;
        let _starCanvasW = 0, _starCanvasH = 0;
        function renderStarsToCache() {
            _starCanvasW = G.mapWidth;
            _starCanvasH = G.mapHeight;
            _starCanvas = document.createElement('canvas');
            _starCanvas.width = _starCanvasW;
            _starCanvas.height = _starCanvasH;
            const sc = _starCanvas.getContext('2d');
            sc.fillStyle = '#fff';
            for (let i = 0; i < G.stars.length; i++) {
                const s = G.stars[i];
                sc.globalAlpha = s.bright * 0.75;
                sc.beginPath();
                sc.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                sc.fill();
            }
            sc.globalAlpha = 1;
        }

        // === PLANET BODY CACHE (offscreen canvas per planet, realistic per-pixel sphere) ===
        const _planetBodyCache = new Map();
        function invalidatePlanetCache(planet) {
            _planetBodyCache.delete(planet);
        }

        // Cheap seeded value-noise + fbm for surface texture (no deps).
        function _hash2(ix, iy, seed) {
            let h = (ix * 374761393 + iy * 668265263 + seed * 1442695040) | 0;
            h = (h ^ (h >>> 13)) | 0;
            h = Math.imul(h, 1274126177) | 0;
            return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        }
        function _vnoise(x, y, seed) {
            const ix = Math.floor(x), iy = Math.floor(y);
            const fx = x - ix, fy = y - iy;
            const sx = fx * fx * (3 - 2 * fx);
            const sy = fy * fy * (3 - 2 * fy);
            const a = _hash2(ix, iy, seed), b = _hash2(ix + 1, iy, seed);
            const c = _hash2(ix, iy + 1, seed), d = _hash2(ix + 1, iy + 1, seed);
            return (a + (b - a) * sx) + (c - a + (a - b - c + d) * sx) * sy;
        }
        function _fbm(x, y, seed, oct) {
            let v = 0, amp = 0.5, freq = 1, norm = 0;
            for (let i = 0; i < oct; i++) {
                v += _vnoise(x * freq, y * freq, seed + i * 17) * amp;
                norm += amp; amp *= 0.5; freq *= 2;
            }
            return v / norm;
        }

        function getPlanetBodyCanvas(p) {
            let cached = _planetBodyCache.get(p);
            if (cached && cached.faction === p.faction && cached.inhabited === p.inhabited && cached.type === p.type) return cached.canvas;

            const SS = 2; // supersample for crisp edges at zoom
            const pad = 4;
            const size = Math.ceil(p.radius * 2 + pad * 2);
            const hi = size * SS;
            const hiC = document.createElement('canvas');
            hiC.width = hi; hiC.height = hi;
            const hc = hiC.getContext('2d');
            const img = hc.createImageData(hi, hi);
            const data = img.data;

            const cx = hi / 2, cy = hi / 2, r = p.radius * SS;
            const seed = (p.terrainSeed || 1) & 0xffffff;
            const type = p.type || 'normal';
            const inhabited = !!p.inhabited;

            // Light direction (upper-left, toward camera-ish). Normalized.
            const lx = -0.55, ly = -0.45, lz = 0.70;
            const lLen = Math.hypot(lx, ly, lz);
            const Lx = lx / lLen, Ly = ly / lLen, Lz = lz / lLen;
            // Half vector for specular (view ~ +z)
            const hx0 = Lx, hy0 = Ly, hz0 = Lz + 1;
            const hLen = Math.hypot(hx0, hy0, hz0);
            const Hx = hx0 / hLen, Hy = hy0 / hLen, Hz = hz0 / hLen;

            const r2 = r * r;
            const texScale = 0.10 * SS; // noise frequency in hi-res pixels

            const conts = p.continents || [];
            function pointInPoly(px, py, pts) {
                let inside = false;
                for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
                    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-6) + xi)) inside = !inside;
                }
                return inside;
            }

            const craters = p.craters || [];

            for (let y = 0; y < hi; y++) {
                for (let x = 0; x < hi; x++) {
                    const dx = x - cx + 0.5, dy = y - cy + 0.5;
                    const d2 = dx * dx + dy * dy;
                    const idx = (y * hi + x) * 4;
                    if (d2 > r2) { data[idx + 3] = 0; continue; }

                    // Sphere normal
                    const nz = Math.sqrt(1 - d2 / r2);
                    const nxn = dx / r, nyn = dy / r;

                    // Surface map coords (orthographic-ish)
                    const lat = nyn;      // -1..1
                    const lon = nxn;      // -1..1
                    const u = lon * 3.0 + 10.0;
                    const v = lat * 3.0 + 10.0;

                    // Diffuse + ambient
                    let ndl = nxn * Lx + nyn * Ly + nz * Lz;
                    if (ndl < 0) ndl = 0;
                    const ambient = 0.12;
                    const light = ambient + (1 - ambient) * ndl;

                    // Specular
                    let ndh = nxn * Hx + nyn * Hy + nz * Hz;
                    if (ndh < 0) ndh = 0;
                    const specBase = Math.pow(ndh, 32);

                    let R = 0, G = 0, B = 0, spec = 0, specR = 255, specG = 255, specB = 255;

                    if (inhabited && (type === 'normal' || type === 'industrial')) {
                        // ---- EARTH-LIKE / INDUSTRIAL ----
                        let isLand = false;
                        let landKind = 'land';
                        for (let ci = 0; ci < conts.length; ci++) {
                            if (pointInPoly(lon, lat, conts[ci].pts)) { isLand = true; landKind = conts[ci].ctype; break; }
                        }
                        const elev = _fbm(u * texScale, v * texScale, seed, 4);
                        if (!isLand && elev > 0.62) { isLand = true; landKind = elev > 0.74 ? 'land' : 'arid'; }
                        if (isLand && elev < 0.34) { isLand = false; }

                        const polar = Math.abs(lat) > 0.78 ? (Math.abs(lat) - 0.78) / 0.22 : 0;

                        if (!isLand) {
                            const depth = _fbm(u * texScale * 0.6, v * texScale * 0.6, seed + 99, 3);
                            R = 18 + depth * 30; G = 70 + depth * 70; B = 130 + depth * 90;
                            spec = specBase * 0.9;
                            specR = 255; specG = 245; specB = 210;
                        } else if (landKind === 'arid') {
                            const t = _fbm(u * texScale, v * texScale, seed + 7, 4);
                            R = 150 + t * 70; G = 120 + t * 55; B = 70 + t * 40;
                            const d = _fbm(u * texScale * 3, v * texScale * 3, seed + 13, 2);
                            R += (d - 0.5) * 30; G += (d - 0.5) * 25; B += (d - 0.5) * 15;
                        } else {
                            const t = _fbm(u * texScale, v * texScale, seed + 3, 4);
                            const wet = _fbm(u * texScale * 2.3, v * texScale * 2.3, seed + 21, 3);
                            R = 40 + t * 60; G = 90 + t * 90; B = 45 + t * 45;
                            if (wet > 0.6) { R -= 10; G += 20; B -= 5; }
                            if (wet < 0.35) { R += 25; G += 10; B += 5; }
                        }

                        if (polar > 0) {
                            const ice = _fbm(u * texScale * 2, v * texScale * 2, seed + 55, 3);
                            const iw = Math.min(1, polar * 1.2 + (ice - 0.5) * 0.3);
                            R = R * (1 - iw) + 235 * iw;
                            G = G * (1 - iw) + 245 * iw;
                            B = B * (1 - iw) + 255 * iw;
                        }

                        if (type === 'industrial') {
                            const smog = _fbm(u * texScale * 0.8, v * texScale * 0.8, seed + 200, 3);
                            const smogAmt = 0.35 + smog * 0.3;
                            R = R * (1 - smogAmt) + 90 * smogAmt;
                            G = G * (1 - smogAmt) + 85 * smogAmt;
                            B = B * (1 - smogAmt) + 70 * smogAmt;
                            const city = _fbm(u * texScale * 1.7, v * texScale * 1.7, seed + 311, 3);
                            if (isLand && city > 0.7) {
                                R = R * 0.55; G = G * 0.5; B = B * 0.45;
                            }
                            // City lights on the night side
                            if (isLand && city > 0.66) {
                                const nightFactor = Math.max(0, 1 - ndl * 3.0);
                                if (nightFactor > 0) {
                                    const flick = 0.7 + 0.3 * _vnoise(u * texScale * 9, v * texScale * 9, seed + 900);
                                    const li = nightFactor * flick * (city - 0.66) / 0.34;
                                    R += li * 220; G += li * 150; B += li * 60;
                                }
                            }
                        }
                    } else if (type === 'fortress') {
                        // ---- ARMORED BATTLE STATION ----
                        const plate = _fbm(u * texScale * 1.4, v * texScale * 1.4, seed + 4, 3);
                        const grime = _fbm(u * texScale * 4, v * texScale * 4, seed + 44, 3);
                        const baseGray = 90 + plate * 45;
                        R = baseGray; G = baseGray + 4; B = baseGray + 10;
                        const seam = Math.abs(Math.sin((plate - 0.5) * 18));
                        if (seam > 0.93) { R *= 0.55; G *= 0.55; B *= 0.6; }
                        R += (grime - 0.5) * 25; G += (grime - 0.5) * 22; B += (grime - 0.5) * 20;
                        // Rivets on a regular lattice
                        const rx = u * texScale * 12, ry = v * texScale * 12;
                        const rivetD = Math.hypot(rx - Math.round(rx), ry - Math.round(ry));
                        if (rivetD < 0.18) { R += 35; G += 35; B += 40; }
                        spec = specBase * 0.6;
                        specR = 200; specG = 210; specB = 230;
                    } else if (type === 'resource') {
                        // ---- CRYSTALLINE ETHERIUM WORLD ----
                        const t = _fbm(u * texScale * 1.2, v * texScale * 1.2, seed + 5, 4);
                        R = 70 + t * 50; G = 60 + t * 40; B = 95 + t * 70;
                        const fRaw = _fbm(u * texScale * 2.2, v * texScale * 2.2, seed + 77, 3);
                        const facet = Math.floor(fRaw * 6) / 6;
                        const edge = Math.abs(fRaw - (facet + 1 / 12));
                        if (edge < 0.04) { R *= 0.7; G *= 0.65; B *= 0.8; }
                        const vein = _fbm(u * texScale * 3.5, v * texScale * 3.5, seed + 333, 3);
                        const veinAmt = Math.max(0, vein - 0.62) / 0.38;
                        if (veinAmt > 0) {
                            const glow = veinAmt * (0.6 + 0.4 * Math.sin((u + v) * 4));
                            R += glow * 180; G += glow * 60; B += glow * 230;
                        }
                        spec = specBase * 0.8;
                        specR = 210; specG = 170; specB = 255;
                    } else {
                        // ---- BARREN / UNINHABITED (mars-like) ----
                        const t = _fbm(u * texScale, v * texScale, seed + 2, 5);
                        R = 120 + t * 70; G = 70 + t * 45; B = 45 + t * 30;
                        const d = _fbm(u * texScale * 4, v * texScale * 4, seed + 19, 2);
                        R += (d - 0.5) * 35; G += (d - 0.5) * 25; B += (d - 0.5) * 18;
                        for (let ci = 0; ci < craters.length; ci++) {
                            const cr = craters[ci];
                            const cdx = lon - Math.cos(cr.a) * cr.d;
                            const cdy = lat - Math.sin(cr.a) * cr.d;
                            const cd = Math.hypot(cdx, cdy);
                            const crR = cr.s * 1.5;
                            if (cd < crR) {
                                const k = cd / crR;
                                const depth = (1 - k) * 0.6;
                                const rim = k > 0.8 ? (k - 0.8) / 0.2 * 0.5 : 0;
                                R = R * (1 - depth) + 30 * depth + rim * 60;
                                G = G * (1 - depth) + 18 * depth + rim * 45;
                                B = B * (1 - depth) + 12 * depth + rim * 30;
                            }
                        }
                        const vein = _fbm(u * texScale * 3, v * texScale * 3, seed + 333, 3);
                        const veinAmt = Math.max(0, vein - 0.7) / 0.3;
                        if (veinAmt > 0) {
                            R += veinAmt * 90; G += veinAmt * 30; B += veinAmt * 140;
                        }
                        const polar = Math.abs(lat) > 0.85 ? (Math.abs(lat) - 0.85) / 0.15 : 0;
                        if (polar > 0) {
                            R = R * (1 - polar) + 230 * polar;
                            G = G * (1 - polar) + 235 * polar;
                            B = B * (1 - polar) + 240 * polar;
                        }
                    }

                    // Lighting
                    R *= light; G *= light; B *= light;

                    if (spec > 0 && ndl > 0) {
                        R += spec * specR;
                        G += spec * specG;
                        B += spec * specB;
                    }

                    // Limb darkening + atmosphere rim glow
                    const e = 1 - nz;
                    const limbDark = 1 - e * 0.35;
                    R *= limbDark; G *= limbDark; B *= limbDark;
                    if ((inhabited && (type === 'normal' || type === 'industrial')) || type === 'resource') {
                        if (e > 0.78 && ndl > 0) {
                            const rim = (e - 0.78) / 0.22 * Math.min(1, ndl * 2);
                            if (type === 'resource') { R += rim * 90; G += rim * 40; B += rim * 160; }
                            else { R += rim * 70; G += rim * 130; B += rim * 230; }
                        }
                    }

                    data[idx]     = R > 255 ? 255 : R < 0 ? 0 : R | 0;
                    data[idx + 1] = G > 255 ? 255 : G < 0 ? 0 : G | 0;
                    data[idx + 2] = B > 255 ? 255 : B < 0 ? 0 : B | 0;
                    data[idx + 3] = 255;
                }
            }
            hc.putImageData(img, 0, 0);

            // Downscale supersampled -> final size with smoothing
            const offC = document.createElement('canvas');
            offC.width = size; offC.height = size;
            const oc = offC.getContext('2d');
            oc.imageSmoothingEnabled = true;
            oc.imageSmoothingQuality = 'high';
            oc.drawImage(hiC, 0, 0, size, size);

            _planetBodyCache.set(p, { canvas: offC, faction: p.faction, inhabited: p.inhabited, type: p.type });
            return offC;
        }