// ============================================================
// MODULE: 04-input.js
// Назначение: renderCache, объект input, resize канваса и миникарты
// Оригинальные строки IIFE: 1919-1954
// Порядок загрузки: 5/24
// ============================================================

        const renderCache = {
            shipCache: new Map(),
            planetCache: new Map(),
            clear: function() {
                this.shipCache.clear();
                this.planetCache.clear();
            }
        };

        const input = {
            dragging: false,
            lastX: 0, lastY: 0,
            startX: 0, startY: 0,
            moved: false,
            pinching: false,
            pinchDist: 0,
            pinchScale: 1
        };

        function resize() {
            canvas.width = gameArea.clientWidth;
            canvas.height = gameArea.clientHeight;
            resizeMinimap();
        }
        window.addEventListener('resize', resize);

        function resizeMinimap() {
            if (!G.mapWidth || !G.mapHeight) return;
            const mapRatio = G.mapWidth / G.mapHeight;
            const baseWidth = Math.min(120, Math.max(70, window.innerWidth * 0.15));
            const width = Math.round(baseWidth);
            const height = Math.round(width / mapRatio);
            minimapCanvas.width = width;
            minimapCanvas.height = height;
        }

