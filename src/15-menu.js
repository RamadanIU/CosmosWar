// ============================================================
// MODULE: 15-menu.js
// Назначение: Меню/спектатор, выбор AI-модели Mistral, экраны победы/поражения
// Оригинальные строки IIFE: 6779-6964
// Порядок загрузки: 16/24
// ============================================================

        const spectatorToggle = document.getElementById('spectatorMode');
        if (spectatorToggle) {
            spectatorToggle.checked = !!settings.spectatorMode;
            spectatorToggle.addEventListener('change', (e) => {
                settings.spectatorMode = !!e.target.checked;
            });
        }



        
        // ===== Mistral AI: model selection (menu-only) =====
        const MISTRAL_API_KEY = "7FSTM9li4nDP51YRdRjHIcfp6vz7i2dE";

        function normalizeTextModels(list) {
            if (!Array.isArray(list)) return [];
            // Sometimes APIs return objects; support both {name:"..."} and plain strings
            return list.map(x => {
                if (typeof x === 'string') return x;
                if (x && typeof x === 'object') return x.name || x.id || x.model || x.slug || JSON.stringify(x);
                return String(x);
            }).filter(Boolean);
        }

        async function fetchMistralTextModels() {
            const url = "https://api.mistral.ai/v1/models";
            const r = await fetch(url, { 
                headers: {
                    'Authorization': `Bearer ${MISTRAL_API_KEY}`
                },
                cache: 'no-store' 
            });
            const data = await r.json();
            // Mistral возвращает { data: [{id: "model-name", ...}, ...] }
            const models = (data.data || []).map(m => m.id).filter(Boolean);
            return Array.from(new Set(models)).sort((a,b)=>a.localeCompare(b));
        }

        async function initAIModelSelect() {
            const select = document.getElementById('aiModelSelect');
            if (!select) return;

            // Restore last choice (menu-level, still user-controlled)
            const saved = localStorage.getItem('cosmoswar_ai_model');
            if (saved) settings.aiModel = saved;

            try {
                const models = await fetchMistralTextModels();
                select.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
                select.value = (models.includes(settings.aiModel) ? settings.aiModel : (models[0] || 'openai'));
                settings.aiModel = select.value;
            } catch (e) {
                // Fallback
                select.innerHTML = `<option value="mistral-small-latest">mistral-small-latest</option><option value="mistral-medium-latest">mistral-medium-latest</option><option value="mistral-large-latest">mistral-large-latest</option>`;
                select.value = settings.aiModel || 'openai';
            }

            select.addEventListener('change', () => {
                settings.aiModel = select.value;
                localStorage.setItem('cosmoswar_ai_model', settings.aiModel);
            });
        }

        initAIModelSelect();

        function applySpectatorUI() {
            const isSpectator = !!G.spectatorMode || !!G.playerDefeated;

            if (typeof FACTION_NAMES !== 'undefined') {
                FACTION_NAMES.player = isSpectator ? 'Зелёная Империя' : 'Ваша Империя';
            }
const buildBtn = document.getElementById('buildBattleship');
            if (buildBtn) buildBtn.style.display = isSpectator ? 'none' : '';

            const diploBtn = document.getElementById('diplomacyBtn');
            if (diploBtn) diploBtn.style.display = isSpectator ? 'none' : '';

            

            const upgBtn = document.getElementById('upgradeBtn');
            if (upgBtn) upgBtn.style.display = isSpectator ? 'none' : '';
const topLeft = document.getElementById('topHUD-left');
            const actions = document.getElementById('topActions');
            if (actions) actions.style.display = isSpectator ? 'none' : '';
            if (topLeft) {
                let lbl = document.getElementById('spectatorLabel');
                if (!lbl) {
                    lbl = document.createElement('div');
                    lbl.id = 'spectatorLabel';
                    lbl.style.display = 'none';
                    lbl.style.color = 'white';
                    lbl.style.fontSize = '13px';
                    lbl.style.opacity = '0.85';
                    lbl.style.padding = '6px 10px';
                    lbl.style.borderRadius = '10px';
                    lbl.style.background = 'rgba(0,0,0,0.35)';
                    lbl.textContent = '👁️ Наблюдение';
                    topLeft.appendChild(lbl);
                }
                lbl.style.display = isSpectator ? 'block' : 'none';
            }
        }

function startGame() {
            document.getElementById('startScreen').classList.add('hidden');
            document.getElementById('topHUD').classList.remove('hidden');
            const bottomHUD = document.getElementById('bottomHUD');
            if (bottomHUD) bottomHUD.classList.add('hidden');
            resize();
            G.gameSpeed = settings.gameSpeed || 2.5;
            G.aiModel = settings.aiModel || 'openai';
            G.spectatorMode = !!settings.spectatorMode;
            G.playerDefeated = false;
            G.winnerFaction = null;
            applySpectatorUI();
            G.diploChats = {};
            G.activeDiploChatFaction = null;
            const _sel = document.getElementById('aiModelSelect');
            if (_sel) _sel.disabled = true;
            generateLevel();
            G.running = true;
            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        }

        document.getElementById('startBtn').addEventListener('click', startGame);
        document.getElementById('startBtn').addEventListener('touchend', (e) => {
            e.preventDefault();
            startGame();
        });

        function returnToMenu() {
            G.running = false;
            document.getElementById('victoryScreen').classList.add('hidden');
            document.getElementById('gameOverScreen').classList.add('hidden');
            document.getElementById('topHUD').classList.add('hidden');
            (document.getElementById('bottomHUD') && document.getElementById('bottomHUD').classList.add('hidden'));
            document.getElementById('startScreen').classList.remove('hidden');
            const _sel = document.getElementById('aiModelSelect');
            if (_sel) _sel.disabled = false;
        }

        document.getElementById('menuBtnWin').addEventListener('click', returnToMenu);
        document.getElementById('menuBtnLose').addEventListener('click', returnToMenu);


        // End screen tabs: planets vs military power
        const _winTabPlanets = document.getElementById('winTabPlanets');
        const _winTabPower = document.getElementById('winTabPower');
        const _loseTabPlanets = document.getElementById('loseTabPlanets');
        const _loseTabPower = document.getElementById('loseTabPower');

        const bindTab = (el, fn) => {
            if (!el) return;
            el.addEventListener('click', fn);
            el.addEventListener('touchend', (e) => { e.preventDefault(); fn(); });
        };

        bindTab(_winTabPlanets, () => setEndScreenTab('win', 'planets'));
        bindTab(_winTabPower, () => setEndScreenTab('win', 'power'));
        bindTab(_loseTabPlanets, () => setEndScreenTab('lose', 'planets'));
        bindTab(_loseTabPower, () => setEndScreenTab('lose', 'power'));

        // default
        try { setEndScreenTab('win', 'planets'); } catch (e) {}
        try { setEndScreenTab('lose', 'planets'); } catch (e) {}

        const watchBtnLose = document.getElementById('watchBtnLose');
        if (watchBtnLose) {
            watchBtnLose.addEventListener('click', () => {
                // Switch to spectating after defeat
                G.playerDefeated = true;
                G.spectatorMode = true;
                G.winnerFaction = null;

                const go = document.getElementById('gameOverScreen');
                if (go) go.classList.add('hidden');

                applySpectatorUI();
                G.running = true;
                lastTime = performance.now();
                requestAnimationFrame(gameLoop);
            });
        }


