// ============================================================
// MODULE: 02-core-pools.js
// Назначение: Экземпляры spatialGrid/projectilePool/particlePool, gradientCache, _glowSpriteCache
// Оригинальные строки IIFE: 1700-1761
// Порядок загрузки: 3/24
// ============================================================

        const spatialGrid = new SpatialGrid(150);
        const projectilePool = new ObjectPool(() => ({
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            faction: '',
            damage: 0,
            life: 0,
            active: false,
            isPlanetTarget: false,
            isBig: false,
            reset() {
                this.x = 0;
                this.y = 0;
                this.vx = 0;
                this.vy = 0;
                this.faction = '';
                this.damage = 0;
                this.life = 0;
                this.active = false;
                this.isPlanetTarget = false;
                this.isBig = false;
            }
        }), 100);

        const particlePool = new ObjectPool(() => ({
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            life: 0,
            maxLife: 0,
            color: '',
            size: 0,
            active: false,
            reset() {
                this.x = 0;
                this.y = 0;
                this.vx = 0;
                this.vy = 0;
                this.life = 0;
                this.maxLife = 0;
                this.color = '';
                this.size = 0;
                this.active = false;
            }
        }), 200);

        const gradientCache = new Map();
        const getCachedGradient = (x, y, r1, r2, color1, color2) => {
            const key = `${x|0}_${y|0}_${r1}_${r2}_${color1}_${color2}`;
            if (!gradientCache.has(key)) {
                const grad = ctx.createRadialGradient(x, y, r1, x, y, r2);
                grad.addColorStop(0, color1);
                grad.addColorStop(1, color2);
                gradientCache.set(key, grad);
            }
            return gradientCache.get(key);
        };

        // === GLOW SPRITE CACHE (pre-rendered radial glow circles) ===
