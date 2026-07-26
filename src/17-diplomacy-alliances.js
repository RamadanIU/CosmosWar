// ============================================================
// MODULE: 17-diplomacy-alliances.js
// Назначение: Альянсы (NATO Article 5), голосования, совет LLM
// Оригинальные строки IIFE: 7346-7852
// Порядок загрузки: 18/24
// ============================================================

        const ALLIANCE_NAMES_ADJ = ['Великий','Звёздный','Вечный','Священный','Грозный','Северный','Южный','Восточный','Западный','Железный','Золотой','Серебряный','Алый','Небесный','Теневой','Пламенный','Лунный','Солнечный','Астральный','Кристальный','Титановый','Изумрудный','Сапфировый','Громовой','Незыблемый'];
        const ALLIANCE_NAMES_NOUN = ['Пакт','Альянс','Союз','Конкорд','Ковенант','Консорциум','Лига','Коалиция','Конфедерация','Протокол','Аккорд','Блок','Ось','Директорат','Конвенция','Хартия','Трибунал','Совет','Орден','Братство'];

        function generateAllianceName() {
            const adj = ALLIANCE_NAMES_ADJ[Math.floor(Math.random() * ALLIANCE_NAMES_ADJ.length)];
            const noun = ALLIANCE_NAMES_NOUN[Math.floor(Math.random() * ALLIANCE_NAMES_NOUN.length)];
            return `${adj} ${noun}`;
        }

        function getAllianceOfFaction(faction) {
            return G.allianceGroups.find(a => a.members.includes(faction)) || null;
        }

        function getAllianceMembersOf(faction) {
            const alliance = getAllianceOfFaction(faction);
            if (!alliance) return [];
            return alliance.members.filter(m => m !== faction);
        }

        function createAllianceGroup(f1, f2) {
            // Remove both from any existing alliances first
            leaveAllianceGroup(f1, true);
            leaveAllianceGroup(f2, true);

            const id = G.allianceNextId++;
            const name = generateAllianceName();
            const group = {
                id,
                name,
                members: [f1, f2],
                entryFee: 0,
                createdAt: G.time,
                founder: f1
            };
            G.allianceGroups.push(group);

            // Set alliance status between all members
            setRelation(f1, f2, DiploStatus.ALLIANCE);

            logDiplomaticEvent('alliance_group_created', f1, f2, { allianceName: name, allianceId: id });
            return group;
        }

        function joinAllianceGroup(faction, allianceId, fee) {
            const alliance = G.allianceGroups.find(a => a.id === allianceId);
            if (!alliance) return false;
            if (alliance.members.includes(faction)) return false;

            // Leave old alliance if in one
            leaveAllianceGroup(faction, true);

            // Pay entry fee
            if (fee > 0) {
                const fd = G.factionData[faction];
                if (fd && fd.stars >= fee) {
                    fd.stars -= fee;
                    // Split fee among existing members
                    const share = Math.floor(fee / alliance.members.length);
                    alliance.members.forEach(m => {
                        const md = G.factionData[m];
                        if (md) md.stars += share;
                    });
                }
            }

            alliance.members.push(faction);

            // Set alliance status with ALL existing members
            alliance.members.forEach(m => {
                if (m !== faction) {
                    setRelation(faction, m, DiploStatus.ALLIANCE);
                    modifyTrust(faction, m, 15);
                }
            });

            logDiplomaticEvent('alliance_joined', faction, alliance.name, { allianceId, allianceName: alliance.name });
            return true;
        }

        function leaveAllianceGroup(faction, silent) {
            const alliance = getAllianceOfFaction(faction);
            if (!alliance) return;

            alliance.members = alliance.members.filter(m => m !== faction);

            // Set relation to neutral with former allies
            alliance.members.forEach(m => {
                setRelation(faction, m, DiploStatus.NEUTRAL);
                modifyTrust(faction, m, -20);
            });

            if (!silent) {
                logDiplomaticEvent('alliance_left', faction, alliance.name, { allianceName: alliance.name });
            }

            // Dissolve if < 2 members
            if (alliance.members.length < 2) {
                dissolveAllianceGroup(alliance.id);
            }
        }

        function dissolveAllianceGroup(allianceId) {
            const idx = G.allianceGroups.findIndex(a => a.id === allianceId);
            if (idx === -1) return;
            const alliance = G.allianceGroups[idx];

            // Set all members to neutral with each other
            for (let i = 0; i < alliance.members.length; i++) {
                for (let j = i + 1; j < alliance.members.length; j++) {
                    setRelation(alliance.members[i], alliance.members[j], DiploStatus.NEUTRAL);
                }
            }

            // Remove pending votes for this alliance
            G.alliancePendingVotes = G.alliancePendingVotes.filter(v => v.allianceId !== allianceId);

            logDiplomaticEvent('alliance_dissolved', alliance.name, '', { allianceName: alliance.name });
            G.allianceGroups.splice(idx, 1);
        }

        // === NATO Article 5: Cascade war/peace to alliance members ===
        function cascadeWarToAlliance(aggressor, target) {
            const targetAlliance = getAllianceOfFaction(target);
            if (!targetAlliance) return;

            // All other members of target's alliance also go to war with aggressor
            targetAlliance.members.forEach(member => {
                if (member === target) return;
                const rel = getRelation(aggressor, member);
                if (rel.status !== DiploStatus.WAR) {
                    setRelation(aggressor, member, DiploStatus.WAR);
                    modifyTrust(aggressor, member, -30);
                    logDiplomaticEvent('declare_war', member, aggressor, { reasoning: `Статья 5: защита союзника ${FACTION_NAMES[target]}`, source: 'alliance_cascade' });

                    if (member === 'player') {
                        // Route through inbox (diplo chat system)
                        pushToInbox(aggressor, 'war', `Статья 5 альянса «${targetAlliance.name}»: война объявлена из-за атаки на союзника ${FACTION_NAMES[target]}`);
                    }
                    if (aggressor === 'player') {
                        // AI member joined war against player's target — notify via inbox
                        pushToInbox(member, 'war', `Статья 5 альянса «${targetAlliance.name}»: ${FACTION_NAMES[member]} вступает в войну как союзник ${FACTION_NAMES[target]}`);
                    }
                }
            });

            // Also cascade from aggressor's alliance
            const aggressorAlliance = getAllianceOfFaction(aggressor);
            if (aggressorAlliance) {
                aggressorAlliance.members.forEach(member => {
                    if (member === aggressor) return;
                    targetAlliance.members.forEach(targetMember => {
                        const rel = getRelation(member, targetMember);
                        if (rel.status !== DiploStatus.WAR) {
                            setRelation(member, targetMember, DiploStatus.WAR);
                            modifyTrust(member, targetMember, -25);
                            logDiplomaticEvent('declare_war', member, targetMember, { reasoning: `Статья 5: союзник ${FACTION_NAMES[aggressor]} объявил войну`, source: 'alliance_cascade' });

                            if (member === 'player') {
                                pushToInbox(targetMember, 'war', `Статья 5: ваш союзник ${FACTION_NAMES[aggressor]} объявил войну — вы тоже в состоянии войны с ${FACTION_NAMES[targetMember]}`);
                            }
                            if (targetMember === 'player') {
                                pushToInbox(member, 'war', `Статья 5: ${FACTION_NAMES[member]} вступает в войну как союзник ${FACTION_NAMES[aggressor]}`);
                            }
                        }
                    });
                });
            }
        }

        function cascadePeaceToAlliance(faction1, faction2) {
            // When peace is made, notify alliance members (they stay at war unless they also make peace)
            const alliance1 = getAllianceOfFaction(faction1);
            const alliance2 = getAllianceOfFaction(faction2);

            if (alliance1) {
                alliance1.members.forEach(member => {
                    if (member === faction1 || member === 'player') return;
                    // AI members consider peace too
                    const rel = getRelation(member, faction2);
                    if (rel.status === DiploStatus.WAR) {
                        // Auto-peace for AI alliance members
                        setRelation(member, faction2, DiploStatus.NEUTRAL);
                        modifyTrust(member, faction2, 10);
                        logDiplomaticEvent('propose_peace', member, faction2, { reasoning: `Мир вслед за союзником ${FACTION_NAMES[faction1]}`, source: 'alliance_cascade' });
                    }
                });
                // If player is in alliance, notify via inbox
                if (alliance1.members.includes('player') && faction1 !== 'player') {
                    pushToInbox(faction1, 'peace', `Союзник ${FACTION_NAMES[faction1]} заключил мир с ${FACTION_NAMES[faction2]} — каскадный мир для альянса`);
                }
            }

            if (alliance2) {
                alliance2.members.forEach(member => {
                    if (member === faction2 || member === 'player') return;
                    const rel = getRelation(member, faction1);
                    if (rel.status === DiploStatus.WAR) {
                        setRelation(member, faction1, DiploStatus.NEUTRAL);
                        modifyTrust(member, faction1, 10);
                        logDiplomaticEvent('propose_peace', member, faction1, { reasoning: `Мир вслед за союзником ${FACTION_NAMES[faction2]}`, source: 'alliance_cascade' });
                    }
                });
                if (alliance2.members.includes('player') && faction2 !== 'player') {
                    pushToInbox(faction2, 'peace', `Союзник ${FACTION_NAMES[faction2]} заключил мир с ${FACTION_NAMES[faction1]} — каскадный мир для альянса`);
                }
            }
        }

        // === Alliance Council Deliberation System ===
        function requestJoinAlliance(faction, allianceId, proposedFee) {
            const alliance = G.allianceGroups.find(a => a.id === allianceId);
            if (!alliance) return;
            if (alliance.members.includes(faction)) return;

            // Check if already pending
            if (G.alliancePendingVotes.find(v => v.faction === faction && v.allianceId === allianceId)) return;

            const vote = {
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                faction,
                allianceId,
                allianceName: alliance.name,
                proposedFee: proposedFee || alliance.entryFee || 0,
                votes: {},         // member -> true/false/null
                council: [],       // array of { faction, message, vote: true/false, timestamp }
                councilPhase: 'deliberating', // 'deliberating' | 'resolved'
                councilResult: null, // 'accepted' | 'rejected'
                createdAt: G.time,
                aiDeliberationStarted: false
            };

            // Initialize votes
            alliance.members.forEach(m => {
                vote.votes[m] = null; // not yet voted
            });

            // Add system opening message
            const factionName = FACTION_NAMES[faction] || faction;
            const applicantColor = FACTION_COLORS[faction] || '#888';
            vote.council.push({
                faction: '_system',
                message: `${factionName} подаёт заявку на вступление в альянс «${alliance.name}». Совет альянса начинает совещание.`,
                vote: null,
                timestamp: G.time
            });

            G.alliancePendingVotes.push(vote);

            // Notify player if they are in the alliance
            if (alliance.members.includes('player')) {
                pushToInbox(faction, 'alliance_join_request', `${factionName} просит вступить в «${alliance.name}». Совет альянса начал совещание — выскажитесь во вкладке Альянсы.`);
            }

            // Start AI deliberation asynchronously
            startCouncilDeliberation(vote.id);

            renderAlliancesTab();
            return vote;
        }

        async function startCouncilDeliberation(voteId) {
            const vote = G.alliancePendingVotes.find(v => v.id === voteId);
            if (!vote || vote.aiDeliberationStarted) return;
            vote.aiDeliberationStarted = true;

            const alliance = G.allianceGroups.find(a => a.id === vote.allianceId);
            if (!alliance) return;

            const aiMembers = alliance.members.filter(m => m !== 'player');

            // Each AI member deliberates sequentially (so they can see prior messages)
            for (const member of aiMembers) {
                // Re-find vote in case it was cleaned
                const currentVote = G.alliancePendingVotes.find(v => v.id === voteId);
                if (!currentVote || currentVote.councilPhase === 'resolved') break;

                try {
                    const result = await llmCouncilDeliberate(member, currentVote);
                    if (!result) {
                        // Fallback: use heuristic
                        const rel = getRelation(member, vote.faction);
                        const trust = rel.trust;
                        let acceptChance = 0.5 + trust * 0.005;
                        if (areAtWar(member, vote.faction)) acceptChance = 0.05;
                        const accepted = Math.random() < Math.max(0.1, Math.min(0.9, acceptChance));
                        const fallbackMsg = accepted
                            ? 'Считаю, что это усилит наш альянс. Голосую за.'
                            : 'Не доверяю этой фракции. Голосую против.';

                        currentVote.council.push({
                            faction: member,
                            message: fallbackMsg,
                            vote: accepted,
                            timestamp: G.time
                        });
                        currentVote.votes[member] = accepted;
                    } else {
                        currentVote.council.push({
                            faction: member,
                            message: result.message,
                            vote: result.accepted,
                            timestamp: G.time
                        });
                        currentVote.votes[member] = result.accepted;
                    }
                } catch (e) {
                    console.error('Council deliberation error for', member, e);
                    const rel = getRelation(member, vote.faction);
                    const accepted = (rel.trust > 0 && !areAtWar(member, vote.faction));
                    currentVote.council.push({
                        faction: member,
                        message: accepted ? 'Пусть вступает.' : 'Я против.',
                        vote: accepted,
                        timestamp: G.time
                    });
                    currentVote.votes[member] = accepted;
                }

                renderAlliancesTab();

                // Slight delay between AI speakers for visual effect
                await new Promise(r => setTimeout(r, 800));
            }

            // Check if player needs to vote, otherwise resolve
            const finalVote = G.alliancePendingVotes.find(v => v.id === voteId);
            if (finalVote && !alliance.members.includes('player')) {
                // No player in alliance - resolve immediately
                checkVoteResult(voteId);
            }
            renderAlliancesTab();
        }

        async function llmCouncilDeliberate(member, vote) {
            const alliance = G.allianceGroups.find(a => a.id === vote.allianceId);
            if (!alliance) return null;

            const memberName = FACTION_NAMES[member] || member;
            const applicantName = FACTION_NAMES[vote.faction] || vote.faction;

            // Build context of prior council messages
            const priorMessages = vote.council
                .filter(c => c.faction !== '_system')
                .map(c => {
                    const name = c.faction === 'player' ? 'Игрок' : (FACTION_NAMES[c.faction] || c.faction);
                    const voteStr = c.vote === true ? 'ЗА' : (c.vote === false ? 'ПРОТИВ' : '');
                    return `${name}: "${c.message}" ${voteStr ? `[Голос: ${voteStr}]` : ''}`;
                }).join('\n');

            const rel = getRelation(member, vote.faction);
            const myStrength = evaluateFactionStrength(member);
            const applicantStrength = evaluateFactionStrength(vote.faction);
            const commonEnemies = findCommonEnemies(member, vote.faction);
            const allyCount = alliance.members.length;

            const sys = [
                `Ты — лидер фракции "${memberName}" в космической RTS-игре.`,
                `Ты член альянса «${alliance.name}» (${allyCount} участников).`,
                `Фракция «${applicantName}» подала заявку на вступление в ваш альянс.`,
                `Идёт совещание совета альянса. Ты должен высказать свою позицию и проголосовать.`,
                ``,
                `Данные:`,
                `- Твоё доверие к ${applicantName}: ${rel.trust}`,
                `- Отношения: ${rel.status === -1 ? 'ВОЙНА' : (rel.status === 1 ? 'АЛЬЯНС' : 'НЕЙТРАЛИТЕТ')}`,
                `- Твоя сила: ${myStrength}, сила ${applicantName}: ${applicantStrength}`,
                `- Общие враги: ${commonEnemies.length > 0 ? commonEnemies.map(e => FACTION_NAMES[e]||e).join(', ') : 'нет'}`,
                `- Предложенная цена входа: ${vote.proposedFee} 💲`,
                priorMessages ? `\nВысказывания других членов совета:\n${priorMessages}` : '',
                ``,
                `Правила:`,
                `- Говори 2-3 предложения от лица лидера на совещании. Обращайся к другим членам совета.`,
                `- Учитывай аргументы предыдущих выступающих, можешь соглашаться или спорить с ними.`,
                `- В конце чётко укажи своё решение.`,
                `- Если в войне с заявителем — почти наверняка откажи.`,
                `- Отвечай строго ВАЛИДНЫМ JSON: {"message":"текст выступления","accepted":true/false}`,
                `- Текст строго на РУССКОМ языке.`
            ].join('\n');

            const user = `Голосуй. Верни JSON.`;

            try {
                const raw = await mistralChat(G.aiModel || 'mistral-small-latest', [
                    { role: 'system', content: sys },
                    { role: 'user', content: user }
                ], { max_tokens: 180, temperature: 0.65, reasoning_effort: 'medium' });

                const obj = safeJsonParse(raw);
                if (!obj || typeof obj.accepted !== 'boolean' || typeof obj.message !== 'string') {
                    return null;
                }
                return { message: obj.message.slice(0, 300), accepted: obj.accepted };
            } catch (e) {
                console.error('LLM council error:', e);
                return null;
            }
        }

        function playerVoteOnJoin(voteId, accept, fee) {
            const vote = G.alliancePendingVotes.find(v => v.id === voteId);
            if (!vote) return;
            vote.votes['player'] = accept;
            if (typeof fee === 'number' && fee >= 0) {
                vote.proposedFee = fee;
            }

            // Add player message to council
            const playerMsg = accept
                ? 'Я одобряю вступление. Голосую за.'
                : 'Я против вступления этой фракции.';
            vote.council.push({
                faction: 'player',
                message: playerMsg,
                vote: accept,
                timestamp: G.time
            });

            checkVoteResult(vote.id);
        }

        function checkVoteResult(voteId) {
            const vote = G.alliancePendingVotes.find(v => v.id === voteId);
            if (!vote) return;

            const alliance = G.allianceGroups.find(a => a.id === vote.allianceId);
            if (!alliance) {
                G.alliancePendingVotes = G.alliancePendingVotes.filter(v => v.id !== voteId);
                return;
            }

            // Check if all voted
            const allVoted = alliance.members.every(m => vote.votes[m] !== null && vote.votes[m] !== undefined);
            if (!allVoted) return;

            // Count votes
            const yesCount = alliance.members.filter(m => vote.votes[m] === true).length;
            const majority = Math.ceil(alliance.members.length / 2);
            const accepted = yesCount >= majority;

            // Add result to council
            const factionName = FACTION_NAMES[vote.faction] || vote.faction;
            vote.council.push({
                faction: '_system',
                message: accepted
                    ? `Совет принял решение: ${factionName} принят в альянс «${vote.allianceName}»! (${yesCount}/${alliance.members.length} голосов за)`
                    : `Совет принял решение: заявка ${factionName} отклонена. (${yesCount}/${alliance.members.length} голосов за, требовалось ${majority})`,
                vote: null,
                timestamp: G.time
            });

            vote.councilPhase = 'resolved';
            vote.councilResult = accepted ? 'accepted' : 'rejected';

            if (accepted) {
                joinAllianceGroup(vote.faction, vote.allianceId, vote.proposedFee);
                if (alliance.members.includes('player') || vote.faction === 'player') {
                    pushToInbox(vote.faction, 'alliance_joined', `${factionName} принят в «${vote.allianceName}» по решению совета.`);
                }
            } else {
                logDiplomaticEvent('alliance_join_rejected', vote.faction, alliance.name, { allianceName: alliance.name, votes: `${yesCount}/${alliance.members.length}` });
                if (alliance.members.includes('player')) {
                    pushToInbox(vote.faction, 'alliance_join_rejected', `Заявка ${factionName} отклонена советом (${yesCount}/${alliance.members.length}).`);
                }
            }

            // Keep resolved votes visible for a while, then clean up
            // (cleanAllianceVotes will remove after timeout)
            renderAlliancesTab();
        }

        // Clean up stale votes (>120 seconds game time for active, >30 sec for resolved)
        function cleanAllianceVotes() {
            G.alliancePendingVotes = G.alliancePendingVotes.filter(v => {
                const age = G.time - v.createdAt;
                if (v.councilPhase === 'resolved' && age > 1800) return false; // ~30 sec resolved
                if (age > 7200) return false; // ~120 sec max
                // Also clean if alliance no longer exists
                if (!G.allianceGroups.find(a => a.id === v.allianceId)) return false;
                return true;
            });
        }

        // Sync alliance groups with bilateral relations
        function syncAllianceRelations() {
            G.allianceGroups.forEach(alliance => {
                // Remove dead factions from alliance
                alliance.members = alliance.members.filter(m => {
                    if (m === 'player') return !G.playerDefeated;
                    return G.planets.some(p => p.faction === m) || G.ships.some(s => s.faction === m && s.active);
                });

                // Ensure all members are allied with each other
                for (let i = 0; i < alliance.members.length; i++) {
                    for (let j = i + 1; j < alliance.members.length; j++) {
                        const rel = getRelation(alliance.members[i], alliance.members[j]);
                        if (rel.status !== DiploStatus.ALLIANCE) {
                            setRelation(alliance.members[i], alliance.members[j], DiploStatus.ALLIANCE);
                        }
                    }
                }

                // Dissolve if less than 2
                if (alliance.members.length < 2) {
                    dissolveAllianceGroup(alliance.id);
                }
            });
        }

