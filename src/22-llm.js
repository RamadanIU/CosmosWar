// ============================================================
// MODULE: 22-llm.js
// Назначение: Интеграция с LLM (Mistral): снапшоты, промпты, sanitize действий, выполнение
// Оригинальные строки IIFE: 10561-11895
// Порядок загрузки: 23/24
// ============================================================

        function getFactionSnapshot(faction) {
            const planets = G.planets ? G.planets.filter(p => p.faction === faction) : [];
            const ships = G.ships ? G.ships.filter(s => s.faction === faction && s.active) : [];
            const fighters = ships.filter(s => s.shipType === ShipType.FIGHTER).length;
            const battleships = ships.filter(s => s.shipType === ShipType.BATTLESHIP).length;
            const strength = (typeof evaluateFactionStrength === 'function') ? evaluateFactionStrength(faction) : (fighters + battleships * 10);

            const money = Number(getFactionStars(faction) || 0);
            const fleetUpgrades = getFactionUpgrades(faction) || { speed: 1, attack: 1, armor: 1 };
            const planetUpgrades = getFactionPlanetUpgrades(faction) || { attack: 1, defense: 1, economy: 1 };

            return {
                faction,
                name: FACTION_NAMES[faction] || faction,
                planets: planets.length,
                fighters,
                battleships,
                strength: Math.round(strength),
                money: Math.round(money),
                etherium: Math.round(Number(getFactionEtherium(faction) || 0)),
                fleet_upgrades: { speed: fleetUpgrades.speed, attack: fleetUpgrades.attack, armor: fleetUpgrades.armor }
            };
        }

        function buildRelationsFor(faction) {
            const rel = {};
            (G.factions || []).forEach(other => {
                if (other === faction) return;
                const r = getRelation(faction, other);
                rel[other] = { status: r.status, trust: r.trust };
            });
            return rel;
        }

        function buildWorldSnapshot(targetFaction) {
            // Parasites don't have planets/normal upgrades
            if (targetFaction === 'parasite') {
                let pCount = 0;
                for (const s of G.ships) { if (s && s.active && s.faction === 'parasite') pCount++; }
                const tributeInfo = {};
                (G.factions || []).forEach(f => { if (f !== 'neutral' && f !== 'parasite' && isPayingTribute(f)) tributeInfo[f] = { paying: true, amount: getTributeAmount(f) }; });
                const pendingInfo = {};
                (G.factions || []).forEach(f => { if (f !== 'neutral' && f !== 'parasite') { const t = G.parasiteTributes[f]; if (t && t.pending && !t.active) pendingInfo[f] = { pending: true, amount: t.amount }; } });
                return {
                    you: { name: 'Паразиты', faction: 'parasite', ships: pCount, strength: pCount * 50 },
                    factions: (G.factions || []).filter(f => f !== 'neutral' && f !== 'parasite').map(f => getFactionSnapshot(f)),
                    parasite_tributes: tributeInfo,
                    parasite_pending: pendingInfo,
                    time: G.time
                };
            }
            const factions = (G.factions || []).slice();
            const stats = {};
            factions.forEach(f => { stats[f] = getFactionSnapshot(f); });

            const player = getFactionSnapshot('player');
            return {
                time: Math.round(G.time),
                player,
                you: stats[targetFaction],
                factions: factions.map(f => stats[f]),
                relations_from_you: buildRelationsFor(targetFaction),
                relations_from_player: buildRelationsFor('player'),
                planets_overview: (G.planets || []).filter(p => p && p.active !== false).map(p => ({
                    name: p.name,
                    owner: p.faction,
                    inhabited: !!p.inhabited,
                    upgrades: { ...ensurePlanetUpgradeState(p) }
                })),
                notes: {
                    rules: [
                        "neutral и parasite не заключают мир/альянс (движок это запретит)",
                        "alliance = общие враги, это не просто ненападение",
                        "если вы согласны на союз, вы обязуетесь помогать против общих врагов"
                    ]
                }
            };
        }

        function buildFullDiplomaticSnapshot(targetFaction) {
            const base = buildWorldSnapshot(targetFaction);

            const factions = (G.factions || []).filter(f => f !== 'neutral' && f !== 'parasite');
            const allRelations = {};

            factions.forEach(f1 => {
                allRelations[f1] = {};
                factions.forEach(f2 => {
                    if (f1 === f2) return;
                    const rel = getRelation(f1, f2);
                    allRelations[f1][f2] = {
                        status: rel.status === DiploStatus.WAR ? 'war' :
                            (rel.status === DiploStatus.ALLIANCE ? 'alliance' : 'neutral'),
                        trust: rel.trust,
                        tradedMoney: rel.tradedMoney || 0,
                        tradedShips: rel.tradedShips || 0,
                        lastInteraction: rel.lastInteraction || 0
                    };
                });
            });

            base.full_diplomatic_matrix = allRelations;
            base.diplomacy_matrix = allRelations;

            // Active conflicts: ships currently targeting enemy planets
            base.active_conflicts = [];
            factions.forEach(attacker => {
                factions.forEach(defender => {
                    if (attacker === defender) return;
                    if (!areAtWar(attacker, defender)) return;

                    let attackingShips = 0;
                    for (let i = 0; i < G.ships.length; i++) {
                        const s = G.ships[i];
                        if (!s || !s.active) continue;
                        if (s.faction !== attacker) continue;
                        if (s.targetPlanet && s.targetPlanet.faction === defender) attackingShips++;
                    }

                    if (attackingShips > 0) {
                        base.active_conflicts.push({
                            attacker,
                            defender,
                            ships: attackingShips
                        });
                    }
                });
            });

            // Recent diplomatic events - ONLY involving this faction (last 10)
            const factionHistory = Array.isArray(G.diplomaticHistory)
                ? G.diplomaticHistory.filter(e => e.from === targetFaction || e.to === targetFaction)
                : [];
            base.recent_diplomatic_events = factionHistory.slice(-10).map(e => ({
                type: e.type,
                from: e.from,
                to: e.to,
                details: e.details
            }));

            // === PROMINENT: Your current diplomatic status with all factions ===
            const yourStatus = {};
            factions.forEach(other => {
                if (other === targetFaction) return;
                const rel = getRelation(targetFaction, other);
                const otherSnap = base.factions ? base.factions.find(f => f && f.faction === other) : null;
                const statusStr = rel.status === DiploStatus.WAR ? 'WAR' :
                    (rel.status === DiploStatus.ALLIANCE ? 'ALLIANCE' : 'NEUTRAL');
                yourStatus[other] = {
                    name: FACTION_NAMES[other] || other,
                    status: statusStr,
                    trust: rel.trust,
                    their_strength: otherSnap ? otherSnap.strength : 0,
                    threat_level: (rel.status === DiploStatus.WAR && otherSnap && base.you)
                        ? (otherSnap.strength > base.you.strength ? 'HIGH' : 'LOW') : 'NONE'
                };
            });
            base.YOUR_DIPLOMATIC_STATUS = yourStatus;

            // Also add: what do OTHER factions think about EACH OTHER (not just about you)
            const othersRelations = {};
            factions.forEach(f1 => {
                if (f1 === targetFaction) return;
                factions.forEach(f2 => {
                    if (f2 === targetFaction || f2 === f1) return;
                    const r = getRelation(f1, f2);
                    const key = `${f1}_vs_${f2}`;
                    othersRelations[key] = r.status === DiploStatus.WAR ? 'war' :
                        (r.status === DiploStatus.ALLIANCE ? 'alliance' : 'neutral');
                });
            });
            base.other_factions_relations = othersRelations;

            return base;
        }


        function safeJsonParse(s) {
            try {
                // try direct
                return JSON.parse(s);
            } catch (e) {
                // try extract {...}
                const m = s.match(/\{[\s\S]*\}/);
                if (!m) return null;
                try { return JSON.parse(m[0]); } catch { return null; }
            }
        }

        
        function estimatePromptChars(messages) {
            try {
                if (!Array.isArray(messages)) return 0;
                let n = 0;
                for (let i = 0; i < messages.length; i++) {
                    const c = messages[i] && messages[i].content;
                    if (c == null) continue;
                    n += String(c).length;
                }
                return n;
            } catch {
                return 0;
            }
        }

        function compactSnapshotForLLM(snapshot, opts = {}) {
            const maxPlanets = Number.isFinite(opts.maxPlanets) ? Math.max(0, Math.floor(opts.maxPlanets)) : 220;
            const maxEvents = Number.isFinite(opts.maxEvents) ? Math.max(0, Math.floor(opts.maxEvents)) : 6;
            const keepMatrix = (opts.keepMatrix !== false);

            const out = {};
            if (snapshot && typeof snapshot === 'object') {
                if (snapshot.time != null) out.time = snapshot.time;
                if (snapshot.player) out.player = snapshot.player;
                if (snapshot.you) out.you = snapshot.you;
                if (Array.isArray(snapshot.factions)) out.factions = snapshot.factions;
                if (snapshot.relations_from_you) out.relations_from_you = snapshot.relations_from_you;
                if (snapshot.relations_from_player) out.relations_from_player = snapshot.relations_from_player;
                if (keepMatrix && snapshot.diplomacy_matrix) out.diplomacy_matrix = snapshot.diplomacy_matrix;
                if (Array.isArray(snapshot.active_conflicts)) out.active_conflicts = snapshot.active_conflicts.slice(-8);
                if (snapshot.YOUR_DIPLOMATIC_STATUS) out.YOUR_DIPLOMATIC_STATUS = snapshot.YOUR_DIPLOMATIC_STATUS;
                if (snapshot.other_factions_relations) out.other_factions_relations = snapshot.other_factions_relations;

                if (Array.isArray(snapshot.recent_diplomatic_events)) {
                    out.recent_diplomatic_events = snapshot.recent_diplomatic_events.slice(-maxEvents).map(e => {
                        const d = (e && e.details != null)
                            ? (typeof e.details === 'string' ? e.details : JSON.stringify(e.details))
                            : '';
                        return {
                            type: e && e.type,
                            from: e && e.from,
                            to: e && e.to,
                            details: d ? String(d).slice(0, 140) : ''
                        };
                    });
                }

                const po = Array.isArray(snapshot.planets_overview) ? snapshot.planets_overview : [];
                const list = po.map(p => {
                    const name = (p && p.name != null) ? String(p.name).replace(/\|/g, '/') : '';
                    const owner = (p && (p.owner != null || p.faction != null)) ? String(p.owner ?? p.faction) : '';
                    const u = (p && p.upgrades) ? (p.upgrades) : { attack: 1, defense: 1, economy: 1 };
                    return `${name}|${owner}|A${u.attack}|D${u.defense}|E${u.economy}`;
                });

                out.planet_control_total = list.length;
                if (list.length > maxPlanets) {
                    out.planet_control = list.slice(0, maxPlanets);
                    out.planet_control_truncated = true;
                    const counts = {};
                    for (let i = 0; i < po.length; i++) {
                        const p = po[i];
                        const o = (p && (p.owner != null || p.faction != null)) ? String(p.owner ?? p.faction) : '';
                        counts[o] = (counts[o] || 0) + 1;
                    }
                    out.planet_counts_by_owner = counts;
                } else {
                    out.planet_control = list;
                }
            }
            return out;
        }

        function buildProactiveMessages(targetFaction, snapshotFull, maxMoney, opts = {}) {
            const MAX_INPUT_CHARS = Number.isFinite(opts.maxChars) ? Math.max(2000, Math.floor(opts.maxChars)) : 9500;

            let snapLLM = compactSnapshotForLLM(snapshotFull, { maxPlanets: 999999, maxEvents: 8, keepMatrix: true });

            // Add tribute info to snapshot
            const tributeInfo = {};
            const pendingTribInfo = {};
            (G.factions || []).forEach(f => {
                if (f === 'neutral' || f === 'parasite') return;
                if (isPayingTribute(f)) tributeInfo[f] = { paying: true, amount: getTributeAmount(f) };
                const t = G.parasiteTributes[f];
                if (t && t.pending && !t.active) pendingTribInfo[f] = { pending: true, amount: t.amount };
            });
            snapLLM.parasite_tributes = tributeInfo;
            snapLLM.parasite_pending_tributes = pendingTribInfo;
            // Add YOUR tribute status prominently
            if (targetFaction !== 'parasite') {
                const myTrib = G.parasiteTributes[targetFaction];
                if (myTrib && myTrib.pending && !myTrib.active) {
                    snapLLM.YOU_HAVE_PENDING_TRIBUTE_DEMAND = { amount: myTrib.amount, action_needed: 'accept_tribute or revolt_tribute with target=parasite' };
                } else if (isPayingTribute(targetFaction)) {
                    snapLLM.YOU_PAY_PARASITE_TRIBUTE = { amount: getTributeAmount(targetFaction) };
                }
            }

            const systemPrompt = [
                `Ты — стратегический ИИ-советник фракции "${(snapLLM.you && snapLLM.you.name) || targetFaction}" в космической RTS.`,
                `КРИТИЧЕСКИ ВАЖНО: Изучи поле YOUR_DIPLOMATIC_STATUS — это ТВОИ текущие отношения с каждой фракцией (WAR/NEUTRAL/ALLIANCE, trust, threat_level). Также other_factions_relations показывает отношения МЕЖДУ другими фракциями. Учитывай это при принятии решений!`,
                `Не объявляй войну союзникам. Не предлагай мир тем, с кем уже мир. Не предлагай альянс тем, с кем уже альянс. Реагируй на угрозы (threat_level=HIGH).`,
                `recent_diplomatic_events содержит только ТВОЮ историю (последние 10 событий с твоим участием).`,
                `Главный приоритет — выживание фракции и рост её силы. Избегай бессмысленной эскалации: если ты слабее или зажат — предпочитай мир/альянс/запрос помощи и осторожные действия вместо войны.`,
                `Верни строго JSON без markdown: {"actions":[...],"strategic_summary":"..."}.`,
                `actions максимум 2. Каждый action ОБЯЗАТЕЛЬНО содержит поле reasoning (коротко почему, 1 фраза). Все текстовые поля (strategic_summary, actions[].reasoning) строго на РУССКОМ языке, без английских слов.`,
                `Доступные type: declare_war, propose_peace, propose_alliance, break_alliance, send_money, send_etherium, send_fleet, gift_planet, send_troops, request_help, upgrade_planet_attack, upgrade_planet_defense, upgrade_planet_economy, accept_tribute, revolt_tribute, wait.`,
                `declare_war используй только если ты не слабее цели или если это единственный способ предотвратить немедленную угрозу; иначе избегай.`,
                `send_money: amount 10..${maxMoney} (только союзникам).`,
                `send_etherium: amount 1..50 — передаёт эфириум союзнику. Эфириум (⟠) — добывается грузовиками с необитаемых планет. Нужен для апгрейдов уровня 4+ и постройки линкоров.`,
                `send_fleet: ship_type fighter|battleship, count 1..5 (только союзникам).`,
                `gift_planet: target=союзник, planet или planets[] (планеты должны быть твоими).`,
                `send_troops: planet, ship_type fighter|battleship, count 1..10 (только против врага или neutral).`,
                `upgrade_planet_attack: повышает уровень атаки планет на +1 (эффект: +1 атакующий корабль/ур.). Стоимость = (текущий_уровень * 50). target не нужен.`,
                `upgrade_planet_defense: +1 защитник/ур. и +10 HP планеты/ур. Стоимость = (текущий_уровень * 50). target не нужен.`,
                `upgrade_planet_economy: апгрейд экономики конкретной планеты. Требует planet="<имя своей планеты>". (доход +1 $/сек/ур.) Стоимость = (текущий_уровень_этой_планеты * 50). target не нужен.`,

                `Планеты: поле planet_control = ["name|owner|A#|D#|E#", ...] (A/D/E — уровни апгрейдов этой планеты).`,
                `Нельзя target neutral.`,
                `Паразиты: если у тебя есть YOU_HAVE_PENDING_TRIBUTE_DEMAND — ОБЯЗАТЕЛЬНО отреагируй: accept_tribute (target=parasite) или revolt_tribute (target=parasite). Без ответа паразиты продолжат атаковать! parasite_tributes показывает кто уже платит. Если ты слабее паразитов или тебе нужен мир — лучше принять дань.`,
                `Если ты платишь дань (YOU_PAY_PARASITE_TRIBUTE), но стал сильным — рассмотри revolt_tribute (восстание, но паразиты снова станут враждебны).`
            ].join(' ');

            const makeUser = (obj) => `Ситуация (JSON): ${JSON.stringify(obj)}. Выбери 0-2 действия и верни валидный JSON.`;

            let messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: makeUser(snapLLM) }
            ];

            // Shrink if exceeds limit
            if (estimatePromptChars(messages) > MAX_INPUT_CHARS) {
                snapLLM = compactSnapshotForLLM(snapshotFull, { maxPlanets: 220, maxEvents: 5, keepMatrix: true });
                messages[1].content = makeUser(snapLLM);
            }
            if (estimatePromptChars(messages) > MAX_INPUT_CHARS) {
                snapLLM = compactSnapshotForLLM(snapshotFull, { maxPlanets: 140, maxEvents: 3, keepMatrix: false });
                // Drop the heaviest optional blocks if still too long, but KEEP YOUR_DIPLOMATIC_STATUS
                delete snapLLM.recent_diplomatic_events;
                delete snapLLM.active_conflicts;
                delete snapLLM.diplomacy_matrix;
                delete snapLLM.other_factions_relations;
                messages[1].content = makeUser(snapLLM);
            }

            return { messages, snapLLM, systemPrompt };
        }

        
        function normalizeReasoningText(v, maxLen = 240) {
            if (v == null) return '';
            let s = String(v);
            // Some models may return arrays/objects for reasoning; stringify safely
            if (typeof v === 'object') {
                try { s = JSON.stringify(v); } catch (e) { s = String(v); }
            }
            s = s.replace(/\s+/g, ' ').trim();
            if (!s) return '';
            if (Number.isFinite(maxLen) && maxLen > 20 && s.length > maxLen) {
                // Prefer cutting at sentence end
                const cut = s.slice(0, maxLen);
                const dot = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
                s = (dot > 40) ? cut.slice(0, dot + 1).trim() : cut.trim() + '…';
            }
            return s;
        }


        function _hasCyrillic(str) { return /[А-Яа-яЁё]/.test(String(str || '')); }
        function _hasLatin(str) { return /[A-Za-z]/.test(String(str || '')); }

        function defaultReasoningForAction(type, target) {
            switch (String(type || '')) {
                case 'declare_war': return 'Начинаем войну ради безопасности и выгоды.';
                case 'propose_peace': return 'Предлагаем мир, чтобы восстановить силы.';
                case 'propose_alliance': return 'Союз усилит наши позиции.';
                case 'break_alliance': return 'Союз больше не приносит выгоды.';
                case 'send_money': return 'Поддерживаем союзника ресурсами.';
                case 'send_etherium': return 'Передаём союзнику эфириум для апгрейдов.';
                case 'send_fleet': return 'Усиливаем союзника флотом.';
                case 'gift_planet': return 'Укрепляем союз через уступку территории.';
                case 'send_troops': return 'Отправляем войска для давления и захвата.';
                case 'request_help': return 'Просим поддержку для перевеса.';
                case 'upgrade_planet_attack': return 'Усиливаем атаку планет для давления и захвата.';
                case 'upgrade_planet_defense': return 'Укрепляем оборону планет для выживания.';
                case 'upgrade_planet_economy': return 'Увеличиваем доход для роста и армии.';
                case 'wait': return 'Наблюдаем и копим силы.';
                default: return 'Действуем в интересах фракции.';
            }
        }

        // Гарантия русского текста reasoning: если модель вернула латиницу без кириллицы — подставляем русский шаблон.
        function ensureRussianReasoningText(text, fallback) {
            const s = normalizeReasoningText(text, 240);
            if (!s) return normalizeReasoningText(fallback || '', 240);
            if (!_hasCyrillic(s) && _hasLatin(s)) {
                return normalizeReasoningText(fallback || '', 240) || 'Действуем в интересах фракции.';
            }
            return s;
        }


function parseLLMChatPayload(raw) {
            const out = { message: '', actions: [], reasoning: '' };
            if (!raw) return out;

            // Try JSON first
            const obj = safeJsonParse(String(raw).trim());
            if (obj && typeof obj === 'object') {
                if (Array.isArray(obj.actions)) {
                    const msg = (typeof obj.message === 'string') ? obj.message
                              : (typeof obj.reply === 'string') ? obj.reply
                              : (typeof obj.text === 'string') ? obj.text
                              : '';
                    out.message = msg || '';
                    out.reasoning = ensureRussianReasoningText(obj.reasoning ?? obj.strategic_summary ?? obj.summary ?? obj.rationale ?? obj.why ?? '', '');
                    out.actions = obj.actions.slice(0, 2).filter(a => a && typeof a === 'object');
                    return out;
                }
            }

            // Try fenced JSON ```json ... ```
            const m = String(raw).match(/```json\s*([\s\S]*?)```/i);
            if (m) {
                const obj2 = safeJsonParse(m[1]);
                if (obj2 && typeof obj2 === 'object' && Array.isArray(obj2.actions)) {
                    out.message = (typeof obj2.message === 'string') ? obj2.message : '';
                    out.reasoning = ensureRussianReasoningText(obj2.reasoning ?? obj2.strategic_summary ?? obj2.summary ?? obj2.rationale ?? obj2.why ?? '', '');
                    out.actions = obj2.actions.slice(0, 2).filter(a => a && typeof a === 'object');
                    return out;
                }
            }

            out.message = String(raw).trim();
            return out;
        }

        function sanitizeChatAction(faction, a) {
            if (!a || typeof a !== 'object') return null;

            const allowed = new Set([
                'declare_war',
                'propose_peace',
                'propose_alliance',
                'break_alliance',
                'send_money',
                'send_etherium',
                'send_fleet',
                'gift_planet',
                'send_troops',
                'request_help',
                'upgrade_planet_attack',
                'upgrade_planet_defense',
                'upgrade_planet_economy',
                'demand_tribute',
                'accept_tribute',
                'revolt_tribute',
                'wait'
            ]);

            const type = String(a.type || '').trim();
            if (!allowed.has(type)) return null;

            const act = {
                type,
                target: a.target ? String(a.target).trim() : 'player',
                amount: a.amount,
                ship_type: a.ship_type,
                count: a.count,
                planet: a.planet,
                planets: a.planets,
                reasoning: normalizeReasoningText(a.reasoning ?? a.reason ?? a.rationale ?? a.why ?? a.explanation ?? ''),
                direct: !!a.direct
            };
            act.reasoning = ensureRussianReasoningText(act.reasoning, defaultReasoningForAction(act.type, act.target));


            // Avoid neutral and self-target; parasites allowed for tribute
            if (act.target === 'neutral') return null;
            if (act.target === 'parasite' && act.type !== 'accept_tribute' && act.type !== 'revolt_tribute') return null;
            if (act.target === faction) return null;

            // Hard safety: chat actions default to player unless explicitly another active faction
            if (!act.target) act.target = 'player';

            return act;
        }

        async function mistralChat(model, messages, opts = {}) {
            const url = 'https://api.mistral.ai/v1/chat/completions';
            const body = {
                model,
                messages,
                temperature: opts.temperature ?? 0.7,
                max_tokens: opts.max_tokens ?? 260,
                stream: false
            };

            const timeoutMs = opts.timeoutMs ?? 35000;
            let controller = null;
            let signal = opts.signal;
            if (!signal) {
                controller = new AbortController();
                signal = controller.signal;
            }
            const t0 = Date.now();
            let to = null;
            if (controller) {
                to = setTimeout(() => {
                    try { controller.abort(); } catch(e) {}
                }, timeoutMs);
            }

            let text = '';
            try {
                const r = await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${MISTRAL_API_KEY}`
                    },
                    body: JSON.stringify(body),
                    signal
                });
                text = await r.text();
                if (!r.ok) {
                    throw new Error(`HTTP ${r.status}: ${text.slice(0, 240)}`);
                }
            } finally {
                if (to) clearTimeout(to);
            }

            let data = null;
            try {
                data = JSON.parse(text || '{}');
            } catch (e) {
                throw new Error('Bad JSON from API');
            }

            const content = data?.choices?.[0]?.message?.content;
            const dt = Date.now() - t0;
            if (!content || !String(content).trim()) {
                throw new Error(`Empty response (${dt}ms)`);
            }
            return String(content).trim();
        }

	        async function llmRoleplayReply(targetFaction, playerText, net = {}) {
	            const snapshotFull = buildWorldSnapshot(targetFaction);

	            if (!snapshotFull || !snapshotFull.you) {
	                // For parasites, build minimal snapshot
	                if (targetFaction === 'parasite') {
	                    const parasiteSnap = { you: { name: 'Паразиты', faction: 'parasite', strength: 0 }, factions: [] };
	                    const tributeInfo = {};
	                    (G.factions || []).forEach(f => { if (f !== 'neutral' && f !== 'parasite' && isPayingTribute(f)) tributeInfo[f] = { paying: true, amount: getTributeAmount(f) }; });
	                    parasiteSnap.parasite_tributes = tributeInfo;
	                    const playerPaying = isPayingTribute('player');
	                    const playerPending = G.parasiteTributes['player'] && G.parasiteTributes['player'].pending;
	                    const pSys = [
	                        'Ты — коллективный разум Роя Паразитов. Ты говоришь от лица космических паразитов. Стиль: угрожающий, древний, чуждый, но рациональный.',
	                        'Игрок пытается общаться. Ты можешь: угрожать, требовать дань за мир, обсуждать условия перемирия.',
	                        playerPaying ? 'Игрок УЖЕ ПЛАТИТ дань. Будь снисходителен, но напоминай о последствиях восстания. Можешь снизить дань если просит (demand_tribute с меньшим amount).' : (playerPending ? 'Ты ТРЕБУЕШЬ дань от игрока. Убеждай заплатить. Объясни что это цена мира.' : 'Игрок НЕ платит дань. Если просит мир — ОБЯЗАТЕЛЬНО потребуй дань через demand_tribute! Мир только через дань!'),
	                        'КЛЮЧЕВОЕ: Мир возможен ТОЛЬКО через дань. Если игрок просит мир/перемирие — верни JSON с demand_tribute.',
	                        'JSON: {"message":"...","actions":[{"type":"demand_tribute","target":"player","amount":5,"reasoning":"..."}]}.',
	                        'amount: 3-15. Слабый игрок: 3-5, средний: 5-10, сильный: 10-15.',
	                        'Все тексты ТОЛЬКО на русском языке.',
	                        'Если действий нет — ответь 1-3 предложениями от лица Роя. Будь колоритным и жутким.'
	                    ].join(' ');
	                    const hist = buildFactionChatMemoryMessages('parasite', playerText, { maxMessages: 10, maxChars: 1500 });
	                    const playerSnap = getFactionSnapshot('player');
	                    const contextMsg = 'Состояние игрока: сила=' + playerSnap.strength + ', деньги=' + playerSnap.money + ', планет=' + playerSnap.planets + ', истребителей=' + playerSnap.fighters + ', линкоров=' + playerSnap.battleships;
	                    const messages = [
	                        { role: 'system', content: pSys },
	                        { role: 'user', content: '[Контекст: ' + contextMsg + ']' },
	                        { role: 'assistant', content: 'Мы видим всё...' },
	                        ...hist,
	                        { role: 'user', content: playerText }
	                    ];
	                    try {
	                        return await mistralChat(G.aiModel || 'mistral-small-latest', messages, { max_tokens: 200, temperature: 0.8, reasoning_effort: 'low', signal: net.signal, timeoutMs: net.timeoutMs });
	                    } catch (e) { return 'Рой не отвечает… шум космоса заглушает связь.'; }
	                }
	                console.error('Invalid snapshot for faction:', targetFaction, snapshotFull);
	                return 'Невозможно обработать запрос. Фракция недоступна.';
	            }

	            const MAX_INPUT_CHARS = Number.isFinite(net.maxChars) ? Math.max(2500, Math.floor(net.maxChars)) : 9500;

	            const sys = [
	                `Ты — правитель фракции "${snapshotFull.you.name}" в RTS-игре про захват планет.`,
	                `Отвечай как лидер империи, но всегда рационально: цель — выживание и усиление фракции. Если ты слабее — будь уважительным, ищи мир/альянс и допускай уступки; не провоцируй и не угрожай без возможности исполнить. Если сильнее — будь уверенным и твёрдым, но без оскорблений и без саморазрушительных решений.`,
	                `Учитывай отношения/доверие и текущие войны/альянсы.`,
	                `Никаких списков правил для игрока, минимум "мета". Только характер лидера.`,
	                `Если ты хочешь сразу выполнить действие (мир/альянс/война/подарок/войска) — верни ВАЛИДНЫЙ JSON без markdown: {"message":"...","actions":[{...}]}.`,
	                `actions: максимум 2. Каждый action ОБЯЗАТЕЛЬНО содержит поле reasoning (коротко почему, 1 фраза). Все текстовые поля (message, actions[].reasoning) строго на РУССКОМ языке, без английских слов. type: declare_war|propose_peace|propose_alliance|break_alliance|send_money|send_etherium|send_fleet|gift_planet|send_troops|request_help|wait.`,
	                `Если target не указан — считай target="player".`,
	                `send_money: amount 10..30% твоих денег (и только если вы в альянсе). send_etherium: amount 1..50 — передать эфириум (⟠) союзнику. send_fleet: count 1..5 (и только если вы в альянсе).`,
	                `gift_planet: можно подарить planet или planets[] (только свои планеты, только союзнику).`,
	                `send_troops: planet, ship_type fighter|battleship, count 1..10 (только на врага или neutral).`,
	                `request_help: можно попросить amount (деньги) или ship_type+count у союзника.`,
	                `accept_tribute: target=parasite — принять дань паразитам. revolt_tribute: target=parasite — восстать против дани.`,
	                `Для propose_peace/propose_alliance с игроком можно ставить "direct": true чтобы сразу оформить (без окна предложения).`,
	                `Если действий нет — ответ: 1-4 предложения, без технических деталей.`
	            ].join(' ');

	            const estimate = (msgs) => (typeof estimatePromptChars === 'function')
	                ? estimatePromptChars(msgs)
	                : JSON.stringify(msgs).length;

	            const buildPack = (snapOpts, histOpts) => {
	                const snap = compactSnapshotForLLM(snapshotFull, snapOpts);
	                const hist = buildFactionChatMemoryMessages(targetFaction, playerText, histOpts);

	                const messages = [
	                    { role: 'system', content: sys },
	                    { role: 'user', content: `Состояние игры (JSON): ${JSON.stringify(snap)}` },
	                    ...hist,
	                    { role: 'user', content: `Сообщение игрока:\n${playerText}\n\nОтветь либо 1-4 предложениями в характере лидера, либо строго JSON без markdown {"message":"...","actions":[{...}]}.` }
	                ];

	                return { messages, snap };
	            };

	            // Start with memory enabled, then shrink snapshot/history if needed.
	            let pack = buildPack({ maxPlanets: 160, maxEvents: 4, keepMatrix: false }, { maxMessages: 18, maxChars: 2600 });
	            if (estimate(pack.messages) > MAX_INPUT_CHARS) pack = buildPack({ maxPlanets: 130, maxEvents: 3, keepMatrix: false }, { maxMessages: 14, maxChars: 1800 });
	            if (estimate(pack.messages) > MAX_INPUT_CHARS) pack = buildPack({ maxPlanets: 100, maxEvents: 2, keepMatrix: false }, { maxMessages: 10, maxChars: 1100 });
	            if (estimate(pack.messages) > MAX_INPUT_CHARS) pack = buildPack({ maxPlanets: 70, maxEvents: 1, keepMatrix: false }, { maxMessages: 6, maxChars: 650 });
	            if (estimate(pack.messages) > MAX_INPUT_CHARS) pack = buildPack({ maxPlanets: 50, maxEvents: 1, keepMatrix: false }, { maxMessages: 0, maxChars: 0 });

	            try {
	                return await mistralChat(G.aiModel || 'mistral-small-latest', pack.messages, {
	                    max_tokens: 200,
	                    temperature: 0.8,
	                    reasoning_effort: 'low',
	                    signal: net.signal,
	                    timeoutMs: net.timeoutMs
	                });
	            } catch (e) {
	                console.error('LLM roleplay error:', e);
	                return 'Связь нестабильна. Попробуй переформулировать.';
	            }
	        }

async function llmDecideOffer(targetFaction, offerType) {
            // Compact snapshot to avoid provider input limits
            const snapshotFull = buildWorldSnapshot(targetFaction);
            let snapshot = compactSnapshotForLLM(snapshotFull, { maxPlanets: 0, maxEvents: 0, keepMatrix: false });

            // Keep only the relevant pair relations (you <-> player)
            try {
                if (snapshot && typeof snapshot === 'object') {
                    if (snapshot.relations_from_you && snapshot.relations_from_you.player) {
                        snapshot.relations_from_you = { player: snapshot.relations_from_you.player };
                    }
                    if (snapshot.relations_from_player && snapshot.relations_from_player[targetFaction]) {
                        snapshot.relations_from_player = { [targetFaction]: snapshot.relations_from_player[targetFaction] };
                    }
                    // Offer decision does not need planet lists/counts
                    delete snapshot.planet_control;
                    delete snapshot.planet_control_total;
                    delete snapshot.planet_control_truncated;
                    delete snapshot.planet_counts_by_owner;
                }
            } catch (e) {}

            const sys = [
                `Ты — правитель фракции "${snapshot.you.name}" в RTS-игре про планеты.`,
                `Игрок предлагает дипломатическое действие: peace или alliance.`,
                `Твоя задача: принять или отклонить так, чтобы максимально увеличить шансы выживания фракции и её выгоду. Если ты заметно слабее игрока (strength меньше примерно 0.8 от силы игрока) или проигрываешь войну — мир чаще выгоднее отказа.`,
                `Для peace: если вы в войне и ты слабее или доверие не крайне низкое — обычно принимай. Отклоняй мир только если ты явно выигрываешь и доверие очень низкое.`,
                `Для alliance: принимай, если это повышает безопасность (особенно если ты слабее или есть сильные общие враги) и доверие не крайне низкое.`,
                `В reply не упоминай внутренние JSON-ключи, коэффициенты и расчёты; говори как дипломатический лидер.`,
                `Отвечай строго ВАЛИДНЫМ JSON без лишнего текста.`,
                `Формат: {"accepted":true/false,"reply":"текст лидера (1-3 предложения)","trustDelta":-20..20}`, `reply строго на РУССКОМ языке (без английских слов).`,
                `reply должен быть в стиле лидера империи: прагматично и дипломатично. Если ты слабее — тон примирительный и уважительный; если сильнее — тон твёрдый, но без насмешек и пустых угроз.`
            ].join(' ');

            const user = `offerType=${offerType}

Состояние (JSON):
${JSON.stringify(snapshot)}

Верни JSON.`;

            let raw = '';
            try {
                raw = await mistralChat(G.aiModel || 'mistral-small-latest', [
                    { role: 'system', content: sys },
                    { role: 'user', content: user }
                ], { max_tokens: 220, temperature: 0.55, reasoning_effort: 'medium' });
            } catch (e) {
                console.error('LLM offer error:', e);
                if (offerType === 'peace') {
                    return { accepted: false, reply: "Сейчас — нет. Мы ещё не готовы к миру.", trustDelta: -5 };
                }
                return { accepted: false, reply: "Альянс? Слишком рано. Докажи свою надёжность.", trustDelta: -8 };
            }

            const obj = safeJsonParse(raw);
            if (!obj || typeof obj.accepted !== 'boolean') {
                return { accepted: false, reply: "Мы не доверяем твоим словам. Сейчас — нет.", trustDelta: -5 };
            }
            if (typeof obj.reply !== 'string') obj.reply = '...';
            if (typeof obj.trustDelta !== 'number') obj.trustDelta = 0;
            obj.trustDelta = Math.max(-20, Math.min(20, Math.round(obj.trustDelta)));
            return obj;
        }

        // === Proactive LLM diplomacy (initiative + support actions) ===

        function canCallLLM(faction) {
            const now = G.time;
            const last = llmCallTimestamps[faction] || 0;
            const cooldown = 600; // ~10 seconds (at 60 fps)
            if (now - last < cooldown) return false;
            llmCallTimestamps[faction] = now;
            return true;
        }

        async function cachedLLMDecision(faction) {
            const bucket = Math.floor(G.time / 600); // ~10s buckets
            const key = `${faction}_${bucket}`;
            if (llmDecisionCache.has(key)) return llmDecisionCache.get(key);

            const decision = await llmDecideProactiveActions(faction);
            llmDecisionCache.set(key, decision);

            // Более агрессивная очистка старых записей
            if (llmDecisionCache.size > 20) {
                const keysToDelete = Array.from(llmDecisionCache.keys()).slice(0, 10);
                keysToDelete.forEach(k => llmDecisionCache.delete(k));
            }
            return decision;
        }

        async function llmDecideProactiveActions(targetFaction) {
            const snapshotFull = buildFullDiplomaticSnapshot(targetFaction);

            const maxMoney = Math.max(10, Math.floor((snapshotFull.you && snapshotFull.you.money ? snapshotFull.you.money : 0) * 0.3));

            const callOnce = async (maxChars) => {
                const built = buildProactiveMessages(targetFaction, snapshotFull, maxMoney, { maxChars });
                return await mistralChat(
                    G.aiModel || 'mistral-small-latest',
                    built.messages,
                    { max_tokens: 420, temperature: 0.7, reasoning_effort: 'medium' }
                );
            };

            try {
                const raw = await callOnce(9500);

                const parsed = safeJsonParse(raw);
                if (!parsed || !Array.isArray(parsed.actions)) return { actions: [] };

                const globalReason = ensureRussianReasoningText(parsed.strategic_summary ?? parsed.reasoning ?? parsed.summary ?? parsed.rationale ?? parsed.why ?? '', '');
                parsed.actions = parsed.actions
                    .slice(0, 2)
                    .filter(a => a && typeof a === 'object')
                    .map(a => {
                        const r0 = normalizeReasoningText(a.reasoning ?? a.reason ?? a.rationale ?? a.why ?? a.explanation ?? '', 240);
                        const fb = defaultReasoningForAction(a.type, a.target);
                        a.reasoning = ensureRussianReasoningText(r0 || globalReason || '', fb);
                        return a;
                    });
                return parsed;
            } catch (e) {
                const msg = (e && e.message) ? String(e.message) : '';
                // Auto-retry once with stronger compaction if provider rejects length
                if (msg.includes('maximum length') || msg.includes('exceeds maximum length') || msg.includes('Input text exceeds')) {
                    try {
                        const raw2 = await callOnce(7000);
                        const parsed2 = safeJsonParse(raw2);
                        if (!parsed2 || !Array.isArray(parsed2.actions)) return { actions: [] };
                        const globalReason2 = ensureRussianReasoningText(parsed2.strategic_summary ?? parsed2.reasoning ?? parsed2.summary ?? parsed2.rationale ?? parsed2.why ?? '', '');
                        parsed2.actions = parsed2.actions
                            .slice(0, 2)
                            .filter(a => a && typeof a === 'object')
                            .map(a => {
                                const r0 = normalizeReasoningText(a.reasoning ?? a.reason ?? a.rationale ?? a.why ?? a.explanation ?? '', 240);
                                const fb = defaultReasoningForAction(a.type, a.target);
                                a.reasoning = ensureRussianReasoningText(r0 || globalReason2 || '', fb);
                                return a;
                            });
                        return parsed2;
                    } catch (e2) {
                        console.error('LLM proactive error (retry):', e2);
                        return { actions: [] };
                    }
                }

                console.error('LLM proactive error:', e);
                return { actions: [] };
            }
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function executeProactiveAction(faction, action) {
            if (!action) return;

            const type = action.type;
            const target = action.target;
            const amount = action.amount;
            const ship_type = action.ship_type;
            const count = action.count;
            const rawReason = action.reasoning || action.reason || action.rationale || action.why || action.explanation || '';
            const reasoning = ensureRussianReasoningText(rawReason, defaultReasoningForAction(type, target));
            const direct = !!action.direct;

            // If an offer modal is already open, do not stack more offer-type actions
            const offerModal = document.getElementById('diploOfferModal');
            const offerOpen = offerModal && !offerModal.classList.contains('hidden');
            if (offerOpen && (type === 'declare_war' || type === 'propose_peace' || type === 'propose_alliance' || type === 'break_alliance')) {
                return;
            }

            // Clean old inbox messages periodically
            cleanInbox();

            if (!type || type === 'wait') return;

            // Guard: no neutral interactions (parasites now allowed for tribute)
            if (target === 'neutral' || faction === 'neutral') return;
            if (faction === 'parasite' && type !== 'demand_tribute' && type !== 'wait') return;
            if (target === 'parasite' && type !== 'accept_tribute' && type !== 'revolt_tribute') return;
            if (target && target === faction) return;

            console.log(`[Diplo LLM] ${faction} -> ${type} (${target || ''})`, reasoning || '');

            switch (type) {
                case 'declare_war': {
                    if (!target) break;
                    setRelation(faction, target, DiploStatus.WAR);
                    modifyTrust(faction, target, -40);
                    logDiplomaticEvent('declare_war', faction, target, { reasoning: reasoning || '', source: 'llm_proactive' });
                    cascadeWarToAlliance(faction, target);

                    if (target === 'player') { ensureChatStore(faction); addChatMessage(faction, 'ai', `Мы объявляем войну. ${reasoning || ''}`.trim()); showDiplomaticOffer(faction, 'war', reasoning || ''); }
                    break;
                }
                                case 'propose_peace': {
                    if (!target) break;

                    if (target === 'player') {
                        if (direct) {
                            // Directly sign peace with player (used by chat tool-actions)
                            if (areAtWar(faction, 'player')) {
                                setRelation(faction, 'player', DiploStatus.NEUTRAL);
                                modifyTrust(faction, 'player', 15);
                                cascadePeaceToAlliance(faction, 'player');
                            }
                            logDiplomaticEvent('propose_peace', faction, 'player', { reasoning: reasoning || '', direct: true, source: 'llm_proactive' });
                            ensureChatStore(faction);
                            addChatMessage(faction, 'ai', `Мир заключён. ${reasoning || ''}`.trim());
                            pushToInbox(faction, 'peace', reasoning || 'Мир заключён напрямую.');
                        } else {
                            ensureChatStore(faction);
                            addChatMessage(faction, 'ai', `Мы предлагаем мир. ${reasoning || ''}`.trim());
                            showDiplomaticOffer(faction, 'peace', reasoning || '');
                            logDiplomaticEvent('propose_peace', faction, 'player', { reasoning: reasoning || '' });
                        }
                    } else {
                        const accepted = aiRespondToOffer(target, faction, 'peace');
                        if (accepted) {
                            setRelation(faction, target, DiploStatus.NEUTRAL);
                            modifyTrust(faction, target, 15);
                            cascadePeaceToAlliance(faction, target);
                        }
                        logDiplomaticEvent('propose_peace', faction, target, { reasoning: reasoning || '' });
                    }

                    break;
                }
                case 'propose_alliance': {
                    if (!target) break;

                    // Guard: block direct alliance proposals if either party is in an alliance (must use voting)
                    const fAllianceCheck = getAllianceOfFaction(faction);
                    const tAllianceCheck = getAllianceOfFaction(target);
                    if (fAllianceCheck || tAllianceCheck) {
                        if (fAllianceCheck && tAllianceCheck && fAllianceCheck.id === tAllianceCheck.id) break;
                        if (target === 'player') {
                            ensureChatStore(faction);
                            addChatMessage(faction, 'ai', fAllianceCheck
                                ? `Мы состоим в альянсе «${fAllianceCheck.name}». Подайте заявку через систему альянсов.`
                                : `Вы состоите в альянсе. Мы не можем предложить вам альянс напрямую.`);
                        }
                        break;
                    }

                    if (target === 'player') {
                        if (direct) {
                            // Directly sign alliance with player (used by chat tool-actions)
                            setRelation(faction, 'player', DiploStatus.ALLIANCE);
                            modifyTrust(faction, 'player', 25);
                            // Create or join alliance group
                            const fAlliance = getAllianceOfFaction(faction);
                            const pAlliance = getAllianceOfFaction('player');
                            if (fAlliance && !pAlliance) {
                                joinAllianceGroup('player', fAlliance.id, 0);
                            } else if (!fAlliance && pAlliance) {
                                joinAllianceGroup(faction, pAlliance.id, 0);
                            } else if (!fAlliance && !pAlliance) {
                                createAllianceGroup(faction, 'player');
                            }
                            logDiplomaticEvent('propose_alliance', faction, 'player', { reasoning: reasoning || '', direct: true, source: 'llm_proactive' });
                            ensureChatStore(faction);
                            addChatMessage(faction, 'ai', `Альянс заключён. ${reasoning || ''}`.trim());
                            pushToInbox(faction, 'alliance', reasoning || 'Альянс заключён напрямую.');
                        } else {
                            ensureChatStore(faction);
                            addChatMessage(faction, 'ai', `Мы предлагаем альянс. ${reasoning || ''}`.trim());
                            showDiplomaticOffer(faction, 'alliance', reasoning || '');
                            logDiplomaticEvent('propose_alliance', faction, 'player', { reasoning: reasoning || '', source: 'llm_proactive' });
                        }
                    } else {
                        const accepted = aiRespondToOffer(target, faction, 'alliance');
                        if (accepted) {
                            setRelation(faction, target, DiploStatus.ALLIANCE);
                            modifyTrust(faction, target, 25);
                            // Create or join alliance group for AI-AI
                            const fAlliance = getAllianceOfFaction(faction);
                            const tAlliance = getAllianceOfFaction(target);
                            if (fAlliance && !tAlliance) {
                                joinAllianceGroup(target, fAlliance.id, 0);
                            } else if (!fAlliance && tAlliance) {
                                joinAllianceGroup(faction, tAlliance.id, 0);
                            } else if (!fAlliance && !tAlliance) {
                                createAllianceGroup(faction, target);
                            }
                        }
                        logDiplomaticEvent('propose_alliance', faction, target, { reasoning: reasoning || '', source: 'llm_proactive' });
                    }

                    break;
                }
case 'break_alliance': {
                    if (!target) break;
                    setRelation(faction, target, DiploStatus.NEUTRAL);
                    modifyTrust(faction, target, -30);
                    // Leave alliance group if in one
                    const brkAlliance = getAllianceOfFaction(faction);
                    if (brkAlliance && brkAlliance.members.includes(target)) {
                        leaveAllianceGroup(faction);
                    }
                    logDiplomaticEvent('break_alliance', faction, target, { reasoning: reasoning || '', source: 'llm_proactive' });

                    if (target === 'player') { ensureChatStore(faction); addChatMessage(faction, 'ai', `Мы разрываем альянс. ${reasoning || ''}`.trim()); showDiplomaticOffer(faction, 'break_alliance', reasoning || ''); }
                    break;
                }
                case 'send_money': {
                    if (!target) break;
                    const amt = Math.floor(Number(amount || 0));
                    if (!amt || amt <= 0) break;

                    const res = transferStars(faction, target, amt, { reasoning: reasoning || '', source: 'llm_proactive' });
                    if (res.success) {
                        if (target === 'player') {
                            const reasonText = reasoning ? `
💬 ${reasoning}` : '';
                            pushToInbox(faction, 'gift', `Передал вам ${amt}💲${reasonText}`);
                            addChatMessage(faction, 'ai', `Мы отправили вам ${amt}💲 в знак поддержки. ${reasoning || ''}`.trim());
                            updateHUD();
                        }
                    }
                    break;
                }
                case 'send_etherium': {
                    if (!target) break;
                    const ethAmt = Math.floor(Number(amount || 0));
                    if (!ethAmt || ethAmt <= 0) break;

                    const res = transferEtherium(faction, target, ethAmt, { reasoning: reasoning || '', source: 'llm_proactive' });
                    if (res.success) {
                        if (target === 'player') {
                            const reasonText = reasoning ? ` 💬 ${reasoning}` : '';
                            pushToInbox(faction, 'gift', `Передал вам ${ethAmt}⟠ эфириума${reasonText}`);
                            addChatMessage(faction, 'ai', `Отправляем вам ${ethAmt}⟠ эфириума. ${reasoning || ''}`.trim());
                            updateHUD();
                        }
                    }
                    break;
                }
                case 'send_fleet': {
                    if (!target) break;
                    const cnt = Math.floor(Number(count || 0));
                    if (!cnt || cnt <= 0) break;

                    const st = (ship_type === 'battleship') ? ShipType.BATTLESHIP : ShipType.FIGHTER;
                    const res = transferFleet(faction, target, st, Math.min(5, Math.max(1, cnt)), { reasoning: reasoning || '', source: 'llm_proactive' });
                    if (res.success) {
                        if (target === 'player') {
                            const shipName = (ship_type === 'battleship') ? 'линкоров' : 'истребителей';
                            const reasonText = reasoning ? ` 💬 ${reasoning}` : '';
                            pushToInbox(faction, 'gift', `Передал вам ${res.count} ${shipName}${reasonText}`);
                            addChatMessage(faction, 'ai', `Отправляем вам ${res.count} ${shipName} на помощь. ${reasoning || ''}`.trim());
                        }
                    }
                    break;
                }
                
                case 'gift_planet': {
                    if (!target) break;

                    const list = Array.isArray(action.planets) ? action.planets : (action.planet ? [action.planet] : []);
                    const planets = list.map(n => String(n || '').trim()).filter(Boolean);
                    if (!planets.length) break;

                    const res = transferPlanets(faction, target, planets, { reasoning: reasoning || '', source: 'llm_proactive' });
                    if (res.success) {
                        if (target === 'player') {
                            ensureChatStore(faction);
                            addChatMessage(faction, 'ai', `Передаём вам планеты: ${planets.join(', ')}. ${reasoning || ''}`.trim());
                            pushToInbox(faction, 'gift', `Передал вам планеты: ${planets.join(', ')}`);
                        }
                    }
                    break;
                }
                case 'send_troops': {
                    const planet = action.planet ? String(action.planet).trim() : '';
                    if (!planet) break;

                    const cnt = Math.floor(Number(count || 0));
                    if (!cnt || cnt <= 0) break;

                    const st = (ship_type === 'battleship') ? 'battleship' : 'fighter';
                    const res = dispatchTroops(faction, planet, st, cnt, { reasoning: reasoning || '', source: 'llm_proactive' });
                    if (res.success) {
                        const p = (G.planets || []).find(pp => pp && pp.active !== false && pp.name === res.planet);
                        if (p && p.faction === 'player') {
                            pushToInbox(faction, 'troops_attack', `Отправляет войска на вашу планету ${res.planet}`);
                        }
                    }
                    break;
                }

                case 'upgrade_planet_attack':
                case 'upgrade_planet_defense':
                case 'upgrade_planet_economy': {
                    const key = (type === 'upgrade_planet_attack') ? 'attack' :
                                (type === 'upgrade_planet_defense') ? 'defense' : 'economy';

                    const planetName = action.planet ? String(action.planet).trim() : '';
                    if (!planetName) break;

                    const p = getPlanetByName(planetName);
                    if (!p || p.faction !== faction) break;

                    const pu = ensurePlanetUpgradeState(p);
                    const lvl = Math.max(1, (pu[key] || 1));
                    const cost = lvl * 50;

                    if (getFactionStars(faction) < cost) break;
                    addFactionStars(faction, -cost);
                    pu[key] = lvl + 1;

                    if (key !== 'economy') applyPlanetUpgradesToPlanet(p);

                    logDiplomaticEvent('planet_upgrade', faction, faction, {
                        planet: p.name,
                        upgrade: key,
                        cost,
                        level: pu[key],
                        reasoning: reasoning || '',
                        source: 'llm_proactive'
                    });
                    break;
                }

case 'request_help': {
                    if (!target) break;
                    if (!areAllies(faction, target)) break;
                    const cnt = Math.floor(Number(count || 0));
                    const amt = Math.floor(Number(amount || 0));
                    const reqShipType = ship_type === 'battleship' ? 'линкоров' : 'истребителей';

                    if (target === 'player') {
                        const helpType = ship_type ? `${Math.max(1, cnt || 1)} ${reqShipType}` : `${Math.max(10, amt || 50)}💲`;
                        const reasonText = reasoning ? ` 💬 ${reasoning}` : '';
                        pushToInbox(faction, 'help_request', `Просит помощи: ${helpType}${reasonText}`);
                        addChatMessage(faction, 'ai', `Нам нужна помощь! ${reasoning || 'Ситуация критическая.'} Можете отправить ${helpType}?`);
                    }
                    const rel = getRelationRef(faction, target);
                    if (rel) rel.helpRequested = (rel.helpRequested || 0) + 1;
                    logDiplomaticEvent('request_help', faction, target, { amount: amt || 0, ship_type: ship_type || null, count: cnt || 0, reasoning: reasoning || '', source: 'llm_proactive' });
                    break;
                }
                case 'demand_tribute': {
                    if (faction !== 'parasite' || !target) break;
                    if (isPayingTribute(target)) break; // already paying
                    if (G.parasiteTributes[target] && G.parasiteTributes[target].pending) break; // already pending
                    const amt = Math.max(3, Math.min(15, Math.floor(Number(amount || 5))));
                    console.log('[PARASITE] Executing demand_tribute on', target, 'amount:', amt);

                    if (target === 'player') {
                        G.parasiteTributes['player'] = { amount: amt, active: false, pending: true, lastCollect: G.time, startTime: G.time };
                        ensureChatStore('parasite');
                        addChatMessage('parasite', 'ai', 'Мы требуем дань: ' + amt + '💲 каждые 10 секунд. Платите — и мы вас не тронем. ' + (reasoning || ''));
                        pushToInbox('parasite', 'tribute_demand', 'Паразиты требуют дань: ' + amt + '💲 каждые 10 сек за нейтралитет.');
                    } else {
                        // LLM faction: mark as pending, their next LLM cycle will decide
                        G.parasiteTributes[target] = { amount: amt, active: false, pending: true, lastCollect: G.time, startTime: G.time };
                        console.log('[PARASITE] Tribute demand sent to LLM faction', target, 'amount:', amt, '- pending LLM decision');
                    }
                    logDiplomaticEvent('tribute_demand', 'parasite', target, { amount: amt, reasoning: reasoning || '' });
                    break;
                }

                case 'accept_tribute': {
                    if (target !== 'parasite') break;
                    const t = G.parasiteTributes[faction];
                    if (!t || t.active) break;
                    t.active = true;
                    t.pending = false;
                    t.lastCollect = G.time;
                    logDiplomaticEvent('tribute_accepted', faction, 'parasite', { amount: t.amount, reasoning: reasoning || '' });
                    if (faction === 'player') {
                        pushToInbox('parasite', 'tribute_accepted', 'Вы платите дань паразитам: ' + t.amount + '💲/10сек.');
                    }
                    break;
                }

                case 'revolt_tribute': {
                    if (target !== 'parasite') break;
                    if (!isPayingTribute(faction)) break;
                    cancelTribute(faction);
                    logDiplomaticEvent('tribute_revolt', faction, 'parasite', { reasoning: reasoning || '' });
                    if (faction === 'player') {
                        pushToInbox('parasite', 'tribute_revolt', 'Вы восстали! Паразиты снова агрессивны.');
                    }
                    break;
                }

                    default:
                    break;
            }
        }

        function startProactiveLLMDiplomacy(faction) {
            if (!faction || faction === 'player' || faction === 'neutral' || faction === 'parasite') return;
            if (llmDiploInFlight[faction]) return;
            if (!canCallLLM(faction)) return;

            llmDiploInFlight[faction] = true;

            cachedLLMDecision(faction)
                .then(async (decision) => {
                    if (!decision || !Array.isArray(decision.actions) || !decision.actions.length) return;
                    for (let i = 0; i < decision.actions.length; i++) {
                        await executeProactiveAction(faction, decision.actions[i]);
                        // Small pause to avoid spamming UI/logs
                        await sleep(350);
                        if (gamePausedForDiplomacy) break;
                    }
                })
                .catch(e => console.error(`LLM diplomacy error for ${faction}:`, e))
                .finally(() => {
                    llmDiploInFlight[faction] = false;
                });
        }


        window.openDiplomacyChat = function(faction) {
            G.activeDiploChatFaction = faction;
            ensureChatStore(faction);

            // If no prior intro, add one line to anchor the roleplay
            try {
                if (G.diploChats && G.diploChats[faction] && G.diploChats[faction].length === 0) {
                    if (faction === 'parasite') {
                        addChatMessage(faction, 'ai', 'Мы — Рой. Паразиты космоса. Плати дань — или будешь уничтожен.');
                    } else {
                        addChatMessage(faction, 'ai', `Мы — ${FACTION_NAMES[faction] || faction}. Говори, человек. Чего ты хочешь?`);
                    }
                }
            } catch (e) {}

            // Ensure diplomacy panel is visible
            const panel = document.getElementById('diplomacyPanel');
            if (panel && panel.classList.contains('hidden')) {
                showDiplomacyPanel();
            }

            // Let the DOM render tab sections first
            setTimeout(() => {
                switchDiplomacyTab('chat');
                renderDiplomacyChat();
                const inp = document.getElementById('diploChatInput');
                if (inp) inp.focus();
            }, 50);
        };

window.playerProposePeace = async function(faction) {
            if (!faction || faction === 'neutral') return;
            if (faction === 'parasite') { openDiplomacyChat('parasite'); return; }

            openDiplomacyChat(faction);
            addChatMessage(faction, 'player', 'Предлагаю заключить мир.');

            setDiploThinking(true, 'ИИ оценивает предложение мира…');
            const decision = await llmDecideOffer(faction, 'peace').catch(() => null);
            setDiploThinking(false);

            if (!decision) {
                addChatMessage(faction, 'ai', 'Связь прервана. Мы не можем сейчас ответить.');
                return;
            }

            addChatMessage(faction, 'ai', decision.reply);

            if (decision.accepted) {
                setRelation('player', faction, DiploStatus.NEUTRAL);
                modifyTrust('player', faction, 15 + decision.trustDelta);
                cascadePeaceToAlliance('player', faction);
                pushToInbox(faction, 'peace', 'Мир принят.');
            } else {
                modifyTrust('player', faction, -10 + decision.trustDelta);
                pushToInbox(faction, 'peace_rejected', 'Предложение мира отвергнуто.');
            }

            renderDiplomacyChat();
        };

        window.playerProposeAlliance = async function(faction) {
            if (!faction || faction === 'neutral') return;
            if (faction === 'parasite') { openDiplomacyChat('parasite'); return; }

            // Guard: prevent direct alliance proposal if either party is already in an alliance
            const targetAlliance = getAllianceOfFaction(faction);
            const playerAlliance = getAllianceOfFaction('player');
            if (targetAlliance || playerAlliance) {
                openDiplomacyChat(faction);
                if (targetAlliance) {
                    addChatMessage(faction, 'system', `Фракция состоит в альянсе «${targetAlliance.name}». Подайте заявку через вкладку Альянсы.`);
                } else {
                    addChatMessage(faction, 'system', 'Вы уже состоите в альянсе. Покиньте его, чтобы предлагать новый.');
                }
                renderDiplomacyChat();
                return;
            }

            openDiplomacyChat(faction);
            addChatMessage(faction, 'player', 'Предлагаю заключить альянс.');

            setDiploThinking(true, 'ИИ оценивает предложение альянса…');
            const decision = await llmDecideOffer(faction, 'alliance').catch(() => null);
            setDiploThinking(false);

            if (!decision) {
                addChatMessage(faction, 'ai', 'Связь прервана. Мы не можем сейчас ответить.');
                return;
            }

            addChatMessage(faction, 'ai', decision.reply);

            if (decision.accepted) {
                setRelation('player', faction, DiploStatus.ALLIANCE);
                modifyTrust('player', faction, 20 + decision.trustDelta);

                // Create or join alliance group
                const playerAlliance = getAllianceOfFaction('player');
                const factionAlliance = getAllianceOfFaction(faction);
                if (playerAlliance && !factionAlliance) {
                    // Faction joins player's alliance
                    joinAllianceGroup(faction, playerAlliance.id, playerAlliance.entryFee);
                } else if (!playerAlliance && factionAlliance) {
                    // Player joins faction's alliance
                    joinAllianceGroup('player', factionAlliance.id, 0);
                } else if (!playerAlliance && !factionAlliance) {
                    // Create new alliance group
                    createAllianceGroup('player', faction);
                }
                // If both in different alliances - create new one together
                else if (playerAlliance && factionAlliance && playerAlliance.id !== factionAlliance.id) {
                    createAllianceGroup('player', faction);
                }

                pushToInbox(faction, 'alliance', 'Альянс заключён.');
            } else {
                modifyTrust('player', faction, -15 + decision.trustDelta);
                pushToInbox(faction, 'alliance_rejected', 'Предложение альянса отклонено.');
            }

            renderDiplomacyChat();
        };

        window.playerDeclareWar = function(faction) {
            setRelation('player', faction, DiploStatus.WAR);
            modifyTrust('player', faction, -40);
            logDiplomaticEvent('declare_war', 'player', faction, { reasoning: 'Игрок объявил войну', source: 'player' });
            cascadeWarToAlliance('player', faction);
            closeDiplomacyPanel();
            pushToInbox(faction, 'war_declared', `Вы объявили войну.`);
        };

        window.playerBreakAlliance = function(faction) {
            setRelation('player', faction, DiploStatus.NEUTRAL);
            modifyTrust('player', faction, -30);
            const alliance = getAllianceOfFaction('player');
            if (alliance && alliance.members.includes(faction)) {
                leaveAllianceGroup('player');
            }
            closeDiplomacyPanel();
            pushToInbox(faction, 'alliance_broken', 'Альянс разорван.');
        };

        window.playerAcceptTribute = function(keepOpen) {
            const t = G.parasiteTributes['player'];
            if (!t) return;
            t.active = true; t.pending = false; t.lastCollect = G.time;
            logDiplomaticEvent('tribute_accepted', 'player', 'parasite', { amount: t.amount });
            ensureChatStore('parasite');
            addChatMessage('parasite', 'ai', 'Мудрое решение. Платите — и мы не тронем ваши корабли.');
            pushToInbox('parasite', 'tribute_accepted', 'Вы платите дань паразитам: ' + t.amount + '💲/10сек.');
            if (!keepOpen) closeDiplomacyPanel();
            else renderDiplomacyChat();
        };

        window.playerDeclineTribute = function(keepOpen) {
            const t = G.parasiteTributes['player'];
            if (!t) return;
            delete G.parasiteTributes['player'];
            logDiplomaticEvent('tribute_refused', 'player', 'parasite', {});
            ensureChatStore('parasite');
            addChatMessage('parasite', 'ai', 'Вы пожалеете об этом. Наш рой не знает пощады.');
            pushToInbox('parasite', 'tribute_refused', 'Вы отказались от дани. Паразиты остаются агрессивными.');
            if (!keepOpen) closeDiplomacyPanel();
            else renderDiplomacyChat();
        };

        window.playerRevoltTribute = function(keepOpen) {
            cancelTribute('player');
            ensureChatStore('parasite');
            addChatMessage('parasite', 'ai', 'Предатели! Мы уничтожим всё, что вы построили!');
            pushToInbox('parasite', 'tribute_revolt', 'Вы восстали против дани! Паразиты снова агрессивны.');
            if (!keepOpen) closeDiplomacyPanel();
            else renderDiplomacyChat();
        };

        // Игрок сам предлагает дань паразитам для восстановления мира (без LLM)
        window.playerOfferTribute = function(keepOpen) {
            if (isPayingTribute('player')) return;
            const t = G.parasiteTributes['player'];
            if (t && t.pending) return; // уже есть pending-требование — кнопка «Платить»
            const str = (typeof evaluateFactionStrength === 'function') ? evaluateFactionStrength('player') : 50;
            const amt = Math.max(3, Math.min(15, Math.floor(str * 0.04) + 3));
            G.parasiteTributes['player'] = { amount: amt, active: true, pending: false, lastCollect: G.time, startTime: G.time };
            logDiplomaticEvent('tribute_set', 'player', 'parasite', { amount: amt, reasoning: 'Игрок предлагает дань за мир.' });
            ensureChatStore('parasite');
            addChatMessage('parasite', 'ai', 'Хорошо. Платитее ' + amt + '💲 каждые 10 секунд — и мы не тронем ваши корабли.');
            pushToInbox('parasite', 'tribute_accepted', 'Вы платите дань паразитам: ' + amt + '💲/10сек. Перемирие восстановлено.');
            if (!keepOpen) closeDiplomacyPanel();
            else renderDiplomacyChat();
        };

