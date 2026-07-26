// ============================================================
// MODULE: 16-diplomacy-core.js
// Назначение: Состояние дипломатии (DiploStatus/Relations), имена фракций, отношения, дань паразитов
// Оригинальные строки IIFE: 6965-7345
// Порядок загрузки: 17/24
// ============================================================

        const DiploStatus = { WAR: -1, NEUTRAL: 0, ALLIANCE: 1 };
        const DiploRelations = {};

        // Extended diplomacy actions (used by proactive LLM + resource support)
        const DiploActionType = {
            PROPOSE_PEACE: 'propose_peace',
            PROPOSE_ALLIANCE: 'propose_alliance',
            DECLARE_WAR: 'declare_war',
            BREAK_ALLIANCE: 'break_alliance',
            SEND_MONEY: 'send_money',
            SEND_FLEET: 'send_fleet',
            GIFT_PLANET: 'gift_planet',
            SEND_TROOPS: 'send_troops',
            REQUEST_HELP: 'request_help',
            OFFER_TRADE: 'offer_trade',
            THREATEN: 'threaten',
            NEGOTIATE: 'negotiate',
            WAIT: 'wait'
        };

        // Proactive LLM diplomacy (rate limits + cache + in-flight guards)
        const llmDecisionCache = new Map();
        const llmCallTimestamps = {};
        const llmDiploInFlight = {};

        const FACTION_NAMES = {
            player: 'Ваша Империя',
            enemy1: 'Красный Легион',
            enemy2: 'Оранжевый Синдикат',
            enemy3: 'Жёлтая Орда',
            enemy4: 'Циановый Флот',
            enemy5: 'Пурпурный Альянс',
            enemy6: 'Розовая Федерация'
        };

        // Used by diplomacy UI (chat header, etc.)
        const FACTION_COLORS = {
            player: '#22c55e',
            enemy1: '#ef4444',
            enemy2: '#f97316',
            enemy3: '#eab308',
            enemy4: '#06b6d4',
            enemy5: '#a855f7',
            enemy6: '#ec4899',
            neutral: '#6b7280',
            parasite: '#000000'
        };
        // === Random names for empires & planets (generated per new game) ===
        const NameGen = (() => {
            const hasCrypto = () => (typeof window !== 'undefined') && (window.crypto || window.msCrypto) && (window.crypto || window.msCrypto).getRandomValues;
            const randU32 = () => {
                if (hasCrypto()) {
                    const a = new Uint32Array(1);
                    (window.crypto || window.msCrypto).getRandomValues(a);
                    return a[0] >>> 0;
                }
                return (Math.random() * 0x100000000) >>> 0;
            };
            const randFloat = () => randU32() / 0x100000000; // [0,1)
            const randInt = (max) => (max <= 1 ? 0 : (randU32() % max));
            const pick = (arr) => arr[randInt(arr.length)];

            const PLANET_START = ['Ар', 'Аст', 'Зор', 'Кал', 'Нок', 'Вел', 'Сир', 'Тер', 'Эл', 'Ион', 'Лю', 'Хар', 'Кси', 'Фен', 'Вар', 'Дра', 'Кир', 'Тал', 'Рив', 'Мер', 'Кер', 'Ори', 'Вега', 'Сол', 'Таур', 'Нер', 'Лаз', 'Уль', 'Ши', 'Гел', 'Крон', 'Мал', 'Сан'];
            const PLANET_MID = ['а', 'е', 'и', 'о', 'у', 'я', 'э', 'ю', 'аи', 'еи', 'ио', 'уа', 'ора', 'ари', 'ено', 'или', 'ару', 'эо', 'юа'];
            const PLANET_END = ['он', 'ус', 'ия', 'ор', 'ар', 'ен', 'ис', 'ум', 'ос', 'аль', 'ир', 'а', 'ея', 'ай', 'иум', 'орн', 'ариус', 'ариа', 'ет', 'ат', 'икс', 'тос', 'мар', 'вен', 'дис', 'кард', 'фос', 'сир'];

            const EMPIRE_ADJ = ['Звёздный', 'Сумеречный', 'Кристальный', 'Стальной', 'Серебряный', 'Астральный', 'Гелиосный', 'Титановый', 'Безмолвный', 'Огненный', 'Ледяной', 'Теневой', 'Эфирный', 'Пустотный', 'Небесный', 'Орбитальный', 'Грозовой', 'Сияющий', 'Древний', 'Гранитный', 'Алый', 'Золотой', 'Сапфировый', 'Изумрудный'];
            const EMPIRE_NOUN = ['Доминион', 'Легион', 'Синдикат', 'Консорциум', 'Конклав', 'Орден', 'Флот', 'Протекторат', 'Картель', 'Союз', 'Режим', 'Ковенант', 'Коалиция', 'Пакт', 'Директорат'];

            const normalize = (s) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;

            const makePlanet = () => {
                for (let k = 0; k < 20; k++) {
                    const a = pick(PLANET_START);
                    const b = (randFloat() < 0.65) ? pick(PLANET_MID) : '';
                    const c = pick(PLANET_END);

                    let name = (a + b + c).replace(/\s+/g, '');
                    name = normalize(name);

                    // sanity filter (length + avoid triple same vowel)
                    if (name.length < 4 || name.length > 12) continue;
                    if (/[аеёиоуыэюя]{3,}/i.test(name)) continue;
                    return name;
                }
                return normalize(pick(PLANET_START) + pick(PLANET_END));
            };

            const makeEmpire = () => `${pick(EMPIRE_ADJ)} ${pick(EMPIRE_NOUN)}`;

            const unique = (maker, used, maxAttempts = 2500) => {
                for (let i = 0; i < maxAttempts; i++) {
                    const n = maker();
                    if (!used.has(n)) {
                        used.add(n);
                        return n;
                    }
                }
                // fallback: deterministic suffix
                const base = maker();
                let idx = 2;
                while (used.has(`${base}-${idx}`)) idx++;
                const out = `${base}-${idx}`;
                used.add(out);
                return out;
            };

            return {
                uniquePlanet(used) { return unique(makePlanet, used); },
                uniqueEmpire(used) { return unique(makeEmpire, used); }
            };
        })();

        function initRandomFactionNames() {
            const used = new Set();

            // Core factions (player + enemies) receive new names every new game
            (G.factions || []).forEach(f => {
                if (f === 'neutral' || f === 'parasite') return;
                FACTION_NAMES[f] = NameGen.uniqueEmpire(used);
            });

            // Stable non-empire labels
            FACTION_NAMES.neutral = 'Нейтралы';
            FACTION_NAMES.parasite = 'Паразиты';
        }

        function generateUniquePlanetName(usedSet) {
            return NameGen.uniquePlanet(usedSet);
        }


        function initDiplomacy() {
            // reset relations between matches (enemy count can change)
            for (const k in DiploRelations) delete DiploRelations[k];

            if (!Array.isArray(G.diplomaticHistory)) G.diplomaticHistory = [];

            // Reset alliance groups
            G.allianceGroups = [];
            G.alliancePendingVotes = [];
            G.allianceNextId = 1;

            for (let i = 0; i < G.factions.length; i++) {
                for (let j = i + 1; j < G.factions.length; j++) {
                    const key = getRelationKey(G.factions[i], G.factions[j]);
                    DiploRelations[key] = {
                        status: DiploStatus.WAR,
                        trust: 0,
                        lastChange: 0,
                        offers: [],
                        tradedMoney: 0,
                        tradedShips: 0,
                        helpRequested: 0,
                        helpProvided: 0,
                        lastInteraction: 0,
                        pendingActions: []
                    };
                }
            }
        }

        function getRelationKey(f1, f2) {
            return [f1, f2].sort().join('_');
        }

        function getRelation(f1, f2) {
            if (f1 === f2) return ensureRelationExtras({ status: DiploStatus.ALLIANCE, trust: 100 });
            if (f1 === 'parasite' || f2 === 'parasite') {
                const other = (f1 === 'parasite') ? f2 : f1;
                if (isPayingTribute(other)) return ensureRelationExtras({ status: DiploStatus.NEUTRAL, trust: 0 });
                return ensureRelationExtras({ status: DiploStatus.WAR, trust: -100 });
            }
            if (f1 === 'neutral' || f2 === 'neutral') return ensureRelationExtras({ status: DiploStatus.NEUTRAL, trust: 0 });
            const key = getRelationKey(f1, f2);
            const rel = DiploRelations[key];
            if (rel) return ensureRelationExtras(rel);
            return ensureRelationExtras({ status: DiploStatus.WAR, trust: 0 });
        }

        function setRelation(f1, f2, status) {
            if (f1 === f2 || f1 === 'neutral' || f2 === 'neutral' || f1 === 'parasite' || f2 === 'parasite') return;
            const key = getRelationKey(f1, f2);
            if (!DiploRelations[key]) {
                DiploRelations[key] = {
                    status: DiploStatus.WAR,
                    trust: 0,
                    lastChange: 0,
                    offers: [],
                    tradedMoney: 0,
                    tradedShips: 0,
                    helpRequested: 0,
                    helpProvided: 0,
                    lastInteraction: 0,
                    pendingActions: []
                };
            }
            DiploRelations[key].status = status;
            DiploRelations[key].lastChange = G.time;
        }

        function modifyTrust(f1, f2, amount) {
            if (f1 === f2 || f1 === 'neutral' || f2 === 'neutral' || f1 === 'parasite' || f2 === 'parasite') return;
            const key = getRelationKey(f1, f2);
            if (DiploRelations[key]) {
                DiploRelations[key].trust = Math.max(-100, Math.min(100, DiploRelations[key].trust + amount));
            }
        }

        function ensureRelationExtras(rel) {
            if (!rel) return rel;
            if (typeof rel.tradedMoney !== 'number') rel.tradedMoney = 0;
            if (typeof rel.tradedShips !== 'number') rel.tradedShips = 0;
            if (typeof rel.helpRequested !== 'number') rel.helpRequested = 0;
            if (typeof rel.helpProvided !== 'number') rel.helpProvided = 0;
            if (typeof rel.lastInteraction !== 'number') rel.lastInteraction = 0;
            if (!Array.isArray(rel.pendingActions)) rel.pendingActions = [];
            if (!Array.isArray(rel.offers)) rel.offers = [];
            if (typeof rel.lastChange !== 'number') rel.lastChange = 0;
            if (typeof rel.trust !== 'number') rel.trust = 0;
            if (typeof rel.status !== 'number') rel.status = DiploStatus.WAR;
            return rel;
        }

        // Returns the stored relation object (mutable), creating if missing.
        function getRelationRef(f1, f2) {
            if (f1 === f2) return null;
            if (f1 === 'parasite' || f2 === 'parasite') return null;
            if (f1 === 'neutral' || f2 === 'neutral') return null;
            const key = getRelationKey(f1, f2);
            if (!DiploRelations[key]) {
                DiploRelations[key] = ensureRelationExtras({
                    status: DiploStatus.WAR,
                    trust: 0,
                    lastChange: 0,
                    offers: []
                });
            } else {
                ensureRelationExtras(DiploRelations[key]);
            }
            return DiploRelations[key];
        }

        function logDiplomaticEvent(type, from, to, details) {
            if (!Array.isArray(G.diplomaticHistory)) G.diplomaticHistory = [];
            G.diplomaticHistory.push({
                time: G.time,
                type,
                from,
                to,
                details: details || {}
            });
            if (G.diplomaticHistory.length > 60) G.diplomaticHistory.shift();

            // Live-update history tab if visible
            try {
                const sec = document.getElementById('diploTabHistory');
                if (sec && sec.style && sec.style.display !== 'none') {
                    renderDiplomacyHistory();
                }
            } catch (e) {}
        }

        function areAllies(f1, f2) {
            return getRelation(f1, f2).status === DiploStatus.ALLIANCE;
        }

        function areAtWar(f1, f2) {
            if (f1 === 'parasite' || f2 === 'parasite') {
                if (f1 === f2) return false;
                const other = (f1 === 'parasite') ? f2 : f1;
                if (isPayingTribute(other)) return false;
                return true;
            }
            return getRelation(f1, f2).status === DiploStatus.WAR;
        }

        function areNeutral(f1, f2) {
            return getRelation(f1, f2).status === DiploStatus.NEUTRAL;
        }

        // ===== PARASITE TRIBUTE SYSTEM =====
        function isPayingTribute(faction) {
            if (!faction || faction === 'parasite' || faction === 'neutral') return false;
            const t = G.parasiteTributes[faction];
            return !!(t && t.active && t.amount > 0);
        }

        function getTributeAmount(faction) {
            const t = G.parasiteTributes[faction];
            return (t && t.active) ? (t.amount || 0) : 0;
        }

        function setTribute(faction, amount) {
            if (!faction || faction === 'parasite' || faction === 'neutral') return;
            const amt = Math.max(1, Math.floor(Number(amount) || 5));
            G.parasiteTributes[faction] = { amount: amt, active: true, lastCollect: G.time, startTime: G.time };
            logDiplomaticEvent('tribute_set', 'parasite', faction, { amount: amt, reasoning: 'Паразиты требуют дань ' + amt + '💲 каждые 10 сек.' });
        }

        function cancelTribute(faction) {
            if (!G.parasiteTributes[faction] || !G.parasiteTributes[faction].active) return;
            G.parasiteTributes[faction].active = false;
            logDiplomaticEvent('tribute_revolt', faction, 'parasite', { reasoning: (FACTION_NAMES[faction] || faction) + ' восстаёт против дани паразитам!' });
        }

        function collectTributes() {
            G.parasiteTributeTimer = (G.parasiteTributeTimer || 0) + 1;
            if (G.parasiteTributeTimer < 600) return; // every 10 seconds
            G.parasiteTributeTimer = 0;

            // Check stale pending tributes for LLM factions (60s timeout)
            const allKeys = Object.keys(G.parasiteTributes);
            for (let i = 0; i < allKeys.length; i++) {
                const f = allKeys[i];
                const t = G.parasiteTributes[f];
                if (!t || !t.pending || t.active) continue;
                if (f === 'player') continue; // player decides manually
                const age = G.time - (t.startTime || 0);
                if (age > 3600) { // 60 seconds timeout
                    console.log('[PARASITE] Pending tribute timeout for', f, '- auto-refusing');
                    delete G.parasiteTributes[f];
                    logDiplomaticEvent('tribute_refused', f, 'parasite', { reasoning: (FACTION_NAMES[f] || f) + ' не ответил на требование дани.' });
                }
            }

            // Collect from active payers
            const activeKeys = Object.keys(G.parasiteTributes);
            for (let i = 0; i < activeKeys.length; i++) {
                const f = activeKeys[i];
                const t = G.parasiteTributes[f];
                if (!t || !t.active || !t.amount) continue;
                const stars = getFactionStars(f);
                if (stars >= t.amount) {
                    addFactionStars(f, -t.amount);
                    t.lastCollect = G.time;
                } else {
                    cancelTribute(f);
                    pushToInbox(f === 'player' ? 'parasite' : f, 'tribute_failed', (FACTION_NAMES[f] || f) + ' не может заплатить дань (' + t.amount + '💲). Паразиты атакуют!');
                }
            }
        }

        // Автоматическое требование дани паразитами (вызывается каждые 3 минуты)
        function parasiteAutoDemandTribute() {
            const hasShips = G.ships.some(s => s.faction === 'parasite' && s.active);
            if (!hasShips) return;

            let parasiteShipCount = 0;
            for (const s of G.ships) { if (s && s.active && s.faction === 'parasite') parasiteShipCount++; }

            for (const f of G.factions) {
                if (f === 'neutral' || f === 'parasite') continue;
                // Пропускаем тех кто уже платит или у кого pending
                if (isPayingTribute(f)) continue;
                const t = G.parasiteTributes[f];
                if (t && t.pending) continue;

                // Проверяем что фракция жива
                const alive = G.planets.some(p => p.faction === f) || G.ships.some(s => s.faction === f && s.active);
                if (!alive) continue;

                // Рассчитываем размер дани по силе фракции
                const str = (typeof evaluateFactionStrength === 'function') ? evaluateFactionStrength(f) : 50;
                const amt = Math.max(3, Math.min(15, Math.floor(str * 0.04) + 3));

                console.log('[PARASITE AUTO] Demanding tribute from', f, 'amount:', amt);

                G.parasiteTributes[f] = { amount: amt, active: false, pending: true, lastCollect: G.time, startTime: G.time };

                if (f === 'player') {
                    ensureChatStore('parasite');
                    addChatMessage('parasite', 'ai', 'Рой требует дань: ' + amt + '💲 каждые 10 секунд. Платите — или будете поглощены.');
                    pushToInbox('parasite', 'tribute_demand', 'Паразиты требуют дань: ' + amt + '💲/10сек за нейтралитет.');
                }

                logDiplomaticEvent('tribute_demand', 'parasite', f, { amount: amt, reasoning: 'Рой автоматически требует дань.' });
            }
        }

        // ===== ALLIANCE GROUP SYSTEM (NATO Article 5) =====
