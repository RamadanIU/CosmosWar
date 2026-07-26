// ============================================================
// MODULE: 00-core-utils.js
// Назначение: SpatialGrid, ObjectPool, MathUtils, canvas/ctx, MAP_SIZES, COLORS
// Оригинальные строки IIFE: 1487-1618
// Порядок загрузки: 1/24
// ============================================================

        class SpatialGrid {
            constructor(cellSize = 150) {
                this.cellSize = cellSize;
                this.invCellSize = 1 / cellSize;
                this.grid = new Map();
                this.cellCache = new Map();
            }

            _cellKey(x, y) {
                return ((x * this.invCellSize) | 0) * 100000 + ((y * this.invCellSize) | 0);
            }

            key(x, y) {
                return `${Math.floor(x/this.cellSize)}_${Math.floor(y/this.cellSize)}`;
            }

            insert(obj, type) {
                const k = this._cellKey(obj.x, obj.y);
                let cell = this.grid.get(k);
                if (!cell) { cell = { ships: [], planets: [] }; this.grid.set(k, cell); }
                if (type === 'ship') cell.ships.push(obj);
                else if (type === 'planet') cell.planets.push(obj);
            }

            query(x, y, radius, type) {
                const cacheKey = this._cellKey(x, y) * 1000 + radius + (type === 'ship' ? 0 : 500);
                const cached = this.cellCache.get(cacheKey);
                if (cached) return cached;

                const results = [];
                const inv = this.invCellSize;
                const startX = ((x - radius) * inv) | 0;
                const endX = ((x + radius) * inv) | 0;
                const startY = ((y - radius) * inv) | 0;
                const endY = ((y + radius) * inv) | 0;

                for (let cx = startX; cx <= endX; cx++) {
                    for (let cy = startY; cy <= endY; cy++) {
                        const cell = this.grid.get(cx * 100000 + cy);
                        if (cell) {
                            const arr = type === 'ship' ? cell.ships : cell.planets;
                            for (let i = 0; i < arr.length; i++) results.push(arr[i]);
                        }
                    }
                }

                this.cellCache.set(cacheKey, results);
                return results;
            }

            clear() {
                this.grid.clear();
            }

            clearCache() {
                this.cellCache.clear();
            }
        }

        class ObjectPool {
            constructor(createFn, initialSize = 50) {
                this.create = createFn;
                this.pool = [];
                for (let i = 0; i < initialSize; i++) {
                    this.pool.push(createFn());
                }
            }

            get() {
                if (this.pool.length > 0) {
                    return this.pool.pop();
                }
                return this.create();
            }

            release(obj) {
                if (obj && typeof obj.reset === 'function') {
                    obj.reset();
                }
                this.pool.push(obj);
            }
        }

        const MathUtils = {
            fastHypot: (dx, dy) => {

                dx = Math.abs(dx);
                dy = Math.abs(dy);
                const min = Math.min(dx, dy);
                return dx + dy - (min * 0.5);
            },

            distanceSquared: (x1, y1, x2, y2) => {
                const dx = x2 - x1;
                const dy = y2 - y1;
                return dx * dx + dy * dy;
            },

            angleDiff: (a, b) => {
                let diff = b - a;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                return diff;
            }
        };

        const gameArea = document.getElementById('gameArea');
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        const minimapCanvas = document.getElementById('minimapCanvas');
        const minimapCtx = minimapCanvas.getContext('2d');

        const MAP_SIZES = {
            1: { width: 1500, height: 1800, name: 'Малая' },
            2: { width: 2200, height: 2600, name: 'Средняя' },
            3: { width: 3000, height: 3500, name: 'Огромная' }
        };

        const COLORS = {
            player: { main: '#22c55e', light: '#4ade80', dark: '#166534' },
            neutral: { main: '#6b7280', light: '#9ca3af', dark: '#374151' },
            enemy1: { main: '#ef4444', light: '#f87171', dark: '#991b1b' },
            enemy2: { main: '#f97316', light: '#fb923c', dark: '#9a3412' },
            enemy3: { main: '#eab308', light: '#facc15', dark: '#a16207' },
            enemy4: { main: '#06b6d4', light: '#22d3ee', dark: '#0e7490' },
            enemy5: { main: '#a855f7', light: '#c084fc', dark: '#7e22ce' },
            enemy6: { main: '#ec4899', light: '#f472b6', dark: '#be185d' }
        };

        COLORS.parasite = { main: '#000000', light: '#4b5563', dark: '#000000' };

        // Seeded pseudo-random number generator (Mulberry32)
