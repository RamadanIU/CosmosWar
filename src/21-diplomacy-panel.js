// ============================================================
// MODULE: 21-diplomacy-panel.js
// Назначение: Панель дипломатии: матрица, альянсы, история, чат с LLM (render/wire UI, diploSendMessage)
// Оригинальные строки IIFE: 8992-10560
// Порядок загрузки: 22/24
// ============================================================

        function showDiplomacyPanel() {
            if (G.spectatorMode || G.playerDefeated) return;
            gamePausedForDiplomacy = true;
            const panel = document.getElementById('diplomacyPanel');
            const content = document.getElementById('diplomacyContent');

            let overviewHtml = '';

            G.factions.forEach(faction => {
                if (faction === 'neutral' || faction === 'player') return;

                const hasPlanets = G.planets.some(p => p.faction === faction);
                const hasShips = G.ships.some(s => s.faction === faction && s.active);
                if (!hasPlanets && !hasShips) return;

                // === PARASITE SPECIAL RENDERING ===
                if (faction === 'parasite') {
                    const color = getFactionColorMain(faction);
                    const name = FACTION_NAMES[faction] || faction;
                    const paying = isPayingTribute('player');
                    const tributeData = G.parasiteTributes['player'];
                    const pending = tributeData && tributeData.pending && !tributeData.active;
                    const tributeAmt = paying ? tributeData.amount : (pending ? tributeData.amount : 0);
                    let parasiteCount = 0;
                    for (let si = 0; si < G.ships.length; si++) {
                        if (G.ships[si] && G.ships[si].active && G.ships[si].faction === 'parasite') parasiteCount++;
                    }
                    let statusClass, statusText;
                    if (paying) { statusClass = 'diplo-neutral'; statusText = '💰 Дань: ' + tributeAmt + '💲/10сек'; }
                    else { statusClass = 'diplo-war'; statusText = '⚔️ Агрессивны'; }
                    overviewHtml += '<div class="diplo-faction"><div class="diplo-color" style="background: ' + color + '; border-color: #4b5563;"></div><div style="flex: 1;"><div style="font-weight: bold; font-size: 13px;">🦠 ' + name + '</div><div style="font-size: 10px; opacity: 0.7;">Кораблей: ' + parasiteCount + '</div><span class="diplo-status ' + statusClass + '" style="margin-top: 6px; display: inline-block;">' + statusText + '</span><div class="diplo-actions">';
                    if (paying) {
                        overviewHtml += '<button class="diplo-btn diplo-btn-war" onclick="window.playerRevoltTribute()">⚔️ Восстать</button>';
                    } else if (pending) {
                        overviewHtml += '<button class="diplo-btn diplo-btn-peace" onclick="window.playerAcceptTribute()">💰 Платить ' + tributeAmt + '💲</button>';
                        overviewHtml += '<button class="diplo-btn diplo-btn-war" onclick="window.playerDeclineTribute()">✕ Отказать</button>';
                    } else {
                        overviewHtml += '<button class="diplo-btn diplo-btn-peace" onclick="window.playerOfferTribute()">💰 Предложить дань за мир</button>';
                    }
                    overviewHtml += '</div><button class="diplo-btn diplo-btn-chat" onclick="openDiplomacyChat(\'parasite\')" style="margin-top: 6px; width: 100%;">💬 Чат с паразитами</button></div></div>';
                    return;
                }

                const relation = getRelation('player', faction);
                const color = getFactionColorMain(faction);
                const name = FACTION_NAMES[faction] || faction;
                const strength = evaluateFactionStrength(faction);
                const myStrength = evaluateFactionStrength('player');

                let statusClass, statusText;
                if (relation.status === DiploStatus.WAR) {
                    statusClass = 'diplo-war';
                    statusText = '⚔️ Война';
                } else if (relation.status === DiploStatus.NEUTRAL) {
                    statusClass = 'diplo-neutral';
                    statusText = '😐 Нейтралитет';
                } else {
                    statusClass = 'diplo-alliance';
                    statusText = '🤝 Альянс';
                }

                let strengthText = '';
                const ratio = strength / Math.max(1, myStrength);
                if (ratio < 0.5) strengthText = '💀 Очень слабый';
                else if (ratio < 0.8) strengthText = '📉 Слабее вас';
                else if (ratio < 1.2) strengthText = '⚖️ Равный';
                else if (ratio < 2) strengthText = '📈 Сильнее вас';
                else strengthText = '👑 Доминирует';

                overviewHtml += `
                    <div class="diplo-faction">
                        <div class="diplo-color" style="background: ${color}"></div>
                        <div style="flex: 1;">
                            <div style="font-weight: bold; font-size: 13px;">${name}</div>
                            <div style="font-size: 10px; opacity: 0.7;">${strengthText}</div>
                            <div style="font-size: 10px; opacity: 0.7; margin-top: 2px;">Доверие: ${relation.trust > 0 ? '+' : ''}${relation.trust}</div>`;

                // Show alliance group membership
                const factionAlliance = getAllianceOfFaction(faction);
                if (factionAlliance) {
                    overviewHtml += `<div style="font-size: 10px; color: #86efac; margin-top: 2px;">🛡️ «${factionAlliance.name}» (${factionAlliance.members.length} чл.)</div>`;
                }

                overviewHtml += `
                            <span class="diplo-status ${statusClass}" style="margin-top: 6px; display: inline-block;">${statusText}</span>
                            <div class="diplo-actions">
                `;

                if (relation.status === DiploStatus.WAR) {
                    overviewHtml += `<button class="diplo-btn diplo-btn-peace" onclick="playerProposePeace('${faction}')">🕊️ Мир</button>`;
                    const targetInAlliance = getAllianceOfFaction(faction);
                    const playerInAlliance = getAllianceOfFaction('player');
                    if (!targetInAlliance && !playerInAlliance) {
                        overviewHtml += `<button class="diplo-btn diplo-btn-ally" onclick="playerProposeAlliance('${faction}')">🤝 Альянс</button>`;
                    }
                } else if (relation.status === DiploStatus.NEUTRAL) {
                    overviewHtml += `<button class="diplo-btn diplo-btn-war" onclick="playerDeclareWar('${faction}')">⚔️ Война</button>`;
                    const targetInAlliance = getAllianceOfFaction(faction);
                    const playerInAlliance = getAllianceOfFaction('player');
                    if (!targetInAlliance && !playerInAlliance) {
                        overviewHtml += `<button class="diplo-btn diplo-btn-ally" onclick="playerProposeAlliance('${faction}')">🤝 Альянс</button>`;
                    } else if (targetInAlliance && !playerInAlliance) {
                        overviewHtml += `<button class="diplo-btn diplo-btn-ally" onclick="openDiplomacyTab('alliance')" title="Фракция состоит в альянсе «${targetInAlliance.name}». Подайте заявку через вкладку Альянсы.">📋 Подать заявку</button>`;
                    } else if (targetInAlliance && playerInAlliance) {
                        overviewHtml += `<span style="font-size:10px;opacity:0.6;margin-top:4px;">В другом альянсе</span>`;
                    }
                } else {
                    overviewHtml += `<button class="diplo-btn diplo-btn-war" onclick="playerDeclareWar('${faction}')">⚔️ Война</button>`;
                    overviewHtml += `<button class="diplo-btn diplo-btn-break" onclick="playerBreakAlliance('${faction}')">💔 Разорвать</button>`;
                }

	                overviewHtml += `
	                            </div>
	                            <button class="diplo-btn diplo-btn-chat" onclick="openDiplomacyChat('${faction}')" style="margin-top: 6px; width: 100%;">💬 Открыть чат</button>
	                        </div>
	                    </div>
	                `;
            });

            if (overviewHtml === '') {
                overviewHtml = '<div style="text-align: center; padding: 20px; opacity: 0.7;">Нет активных фракций</div>';
            }

            
            const wrapperHtml = `
                <div class="diplo-tabs">
                    <button id="diploTabBtnOverview" class="diplo-tab-btn diplo-tab-btn-active" onclick="switchDiplomacyTab('overview')">Обзор</button>
                    <button id="diploTabBtnAlliances" class="diplo-tab-btn" onclick="switchDiplomacyTab('alliances')">🛡️ Альянсы</button>
                    <button id="diploTabBtnMatrix" class="diplo-tab-btn" onclick="switchDiplomacyTab('matrix')">Таблица</button>
                    <button id="diploTabBtnChat" class="diplo-tab-btn" onclick="switchDiplomacyTab('chat')">Диалог</button>
                    <button id=\"diploTabBtnHistory\" class=\"diplo-tab-btn\" onclick=\"switchDiplomacyTab('history')\">История</button>
                </div>

                <div id="diploTabOverview" class="diplo-tab-section">
                    ${overviewHtml}
                </div>

                <div id="diploTabAlliances" class="diplo-tab-section" style="display: none;">
                    <div id="diploAlliancesContainer"></div>
                </div>

                <div id="diploTabMatrix" class="diplo-tab-section" style="display: none;">
                    <div id="diploMatrixContainer"></div>
                </div>

                <div id="diploTabChat" class="diplo-tab-section" style="display: none;">
                    <div class="diplo-chat">
                        <div class="diplo-chat-top">
                            <div class="diplo-chat-faction">
                                <div id="diploChatColor" class="diplo-color" style="width: 12px; height: 12px; border-radius: 4px;"></div>
                                <span id="diploChatFactionName" style="opacity: 0.9;">Выберите фракцию в «Обзор» → 💬 Чат</span>
                            </div>
                            <span id="diploChatNet" class="diplo-chat-status"></span>
                            <div id="diploChatThinking" class="diplo-thinking">
                                <div class="spinner"></div>
                                <span id="diploChatThinkingText">ИИ думает…</span>
                                <button id="diploChatCancel" class="diplo-btn diplo-btn-chat diplo-btn-cancel" type="button">Отмена</button>
                            </div>
                        </div>

                        <div id="diploChatMessages" class="diplo-chat-messages"></div>

                        <div class="diplo-chat-actions">
                            <button id="diploChatOfferPeace" class="diplo-btn diplo-btn-peace" disabled>🤍 Предложить мир</button>
                            <button id="diploChatOfferAlliance" class="diplo-btn diplo-btn-ally" disabled>🤝 Предложить альянс</button>
                        </div>

                        
                        <div class="diplo-chat-actions">
                            <button id="diploChatSendResources" class="diplo-btn diplo-btn-chat" disabled>📦 Отправить ресурсы</button>
                            <button id="diploChatSendTroops" class="diplo-btn diplo-btn-chat" disabled>⚔️ Отправить войска</button>
                        </div>

                        <div id="diploSendResourcesPanel" class="diplo-send-panel hidden">
                            <div style="font-size:12px; opacity:0.85; margin-bottom:6px;">Подарок</div>

                            <div class="diplo-send-row">
                                <label>Планеты</label>
                                <span class="avail">доступно: <span id="diploAvailPlanets">0</span></span>
                            </div>
                            <div id="diploGiftPlanetsList" class="diplo-planet-list"></div>

                            <div class="diplo-send-row">
                                <label>Истребители</label>
                                <input id="diploGiftFighters" type="number" min="0" step="1" value="0" />
                                <span class="avail">доступно: <span id="diploAvailFighters">0</span></span>
                            </div>

                            <div class="diplo-send-row">
                                <label>Линкоры</label>
                                <input id="diploGiftBattleships" type="number" min="0" step="1" value="0" />
                                <span class="avail">доступно: <span id="diploAvailBattleships">0</span></span>
                            </div>

                            <div class="diplo-send-row">
                                <label>Деньги</label>
                                <input id="diploGiftStars" type="number" min="0" step="1" value="0" />
                                <span class="avail">доступно: <span id="diploAvailStars">0</span></span>
                            </div>

                            <div class="diplo-send-row">
                                <label style="color:#c084fc;">⟠ Эфириум</label>
                                <input id="diploGiftEtherium" type="number" min="0" step="1" value="0" />
                                <span class="avail">доступно: <span id="diploAvailEtherium" style="color:#c084fc;">0</span></span>
                            </div>

                            <div id="diploGiftError" style="font-size:11px; opacity:0.75; min-height: 14px; margin-top: 6px;"></div>

                            <div class="diplo-send-actions">
                                <button id="diploGiftCancel" class="diplo-btn diplo-btn-chat">Закрыть</button>
                                <button id="diploGiftSend" class="diplo-btn diplo-btn-chat">Отправить</button>
                            </div>
                        </div>

                        <div id="diploSendTroopsPanel" class="diplo-send-panel hidden">
                            <div style="font-size:12px; opacity:0.85; margin-bottom:6px;">Отправка войск (захват)</div>

                            <div class="diplo-send-row">
                                <label>Цель (планета)</label>
                                <select id="diploTroopsPlanet" style="flex: 1; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.26); color: #e5e7eb; outline:none; font-size:12px;"></select>
                            </div>

                            <div class="diplo-send-row">
                                <label>Тип</label>
                                <select id="diploTroopsType" style="flex: 1; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.26); color: #e5e7eb; outline:none; font-size:12px;">
                                    <option value="fighter">Истребители</option>
                                    <option value="battleship">Линкоры</option>
                                </select>
                            </div>

                            <div class="diplo-send-row">
                                <label>Количество</label>
                                <input id="diploTroopsCount" type="number" min="0" step="1" value="0" />
                                <span class="avail">доступно: <span id="diploAvailTroops">0</span></span>
                            </div>

                            <div id="diploTroopsError" style="font-size:11px; opacity:0.75; min-height: 14px; margin-top: 6px;"></div>

                            <div class="diplo-send-actions">
                                <button id="diploTroopsCancel" class="diplo-btn diplo-btn-chat">Закрыть</button>
                                <button id="diploTroopsSend" class="diplo-btn diplo-btn-chat">Отправить</button>
                            </div>
                        </div>

                        <!-- PARASITE-SPECIFIC ACTION BAR -->
                        <div id="parasiteActionsBar" class="parasite-actions-bar">
                            <div id="parasiteStatusLine" class="parasite-status-line">
                                <span class="status-icon">🦠</span>
                                <span id="parasiteStatusText" class="status-text">Рой наблюдает…</span>
                                <span id="parasiteStatusAmount" class="status-amount"></span>
                            </div>
                            <div class="parasite-btn-row">
                                <button id="parasiteBtnPeace" class="parasite-btn parasite-btn-peace" style="flex:1;">☮️ Просить мир</button>
                                <button id="parasiteBtnOffer" class="parasite-btn parasite-btn-pay" style="flex:1; display:none;">💰 Предложить дань</button>
                            </div>
                            <div id="parasiteTributeActions" class="parasite-btn-row" style="display:none;">
                                <button id="parasiteBtnPay" class="parasite-btn parasite-btn-pay" style="flex:1;">💰 Платить дань</button>
                                <button id="parasiteBtnRevolt" class="parasite-btn parasite-btn-revolt" style="flex:1;">⚔️ Восстать</button>
                            </div>
                        </div>


                        <div class="diplo-chat-input">
                            <input id="diploChatInput" type="text" placeholder="Сообщение…" />
                            <button id="diploChatSend" class="diplo-btn diplo-btn-chat">Отправить</button>
                        </div>

                        <div id="diploChatHint" style="font-size: 10px; opacity: 0.65; padding: 0 2px;">
                            ИИ принимает решения по предложениям мира/альянса на основе состояния игры.
                        </div>
                    </div>
                </div>


                <div id="diploTabHistory" class="diplo-tab-section" style="display: none;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
                        <div style="font-size:12px; opacity:0.85;">История дипломатических событий</div>
                        <label style="font-size:11px; opacity:0.8; display:flex; align-items:center; gap:6px; user-select:none;">
                            <input type="checkbox" id="diploHistoryOnlyPlayer" />
                            Только с участием игрока
                        </label>
                    </div>
                    <div id="diploHistoryContainer"></div>
                </div>

            `;

            content.innerHTML = wrapperHtml;
            wireDiplomacyChatUI();
            panel.classList.remove('hidden');
        }

                window.openDiplomacyTab = function(tab) {
                    const diploPanel = document.getElementById('diplomacyPanel');
                    if (diploPanel && diploPanel.classList.contains('hidden')) {
                        diploPanel.classList.remove('hidden');
                    }
                    window.switchDiplomacyTab(tab === 'alliance' ? 'alliances' : tab);
                };

                window.switchDiplomacyTab = function(tab) {
            const overview = document.getElementById('diploTabOverview');
            const alliances = document.getElementById('diploTabAlliances');
            const matrix = document.getElementById('diploTabMatrix');
            const chat = document.getElementById('diploTabChat');
            const history = document.getElementById('diploTabHistory');

            const btnOverview = document.getElementById('diploTabBtnOverview');
            const btnAlliances = document.getElementById('diploTabBtnAlliances');
            const btnMatrix = document.getElementById('diploTabBtnMatrix');
            const btnChat = document.getElementById('diploTabBtnChat');
            const btnHistory = document.getElementById('diploTabBtnHistory');

            if (!overview || !matrix || !chat || !btnOverview || !btnMatrix || !btnChat) return;

            // reset
            overview.style.display = 'none';
            if (alliances) alliances.style.display = 'none';
            matrix.style.display = 'none';
            chat.style.display = 'none';
            if (history) history.style.display = 'none';

            btnOverview.classList.remove('diplo-tab-btn-active');
            if (btnAlliances) btnAlliances.classList.remove('diplo-tab-btn-active');
            btnMatrix.classList.remove('diplo-tab-btn-active');
            btnChat.classList.remove('diplo-tab-btn-active');
            if (btnHistory) btnHistory.classList.remove('diplo-tab-btn-active');

            if (tab === 'alliances') {
                if (alliances && btnAlliances) {
                    alliances.style.display = 'block';
                    btnAlliances.classList.add('diplo-tab-btn-active');
                    renderAlliancesTab();
                    return;
                }
            }

            if (tab === 'matrix') {
                matrix.style.display = 'block';
                btnMatrix.classList.add('diplo-tab-btn-active');
                renderDiplomacyMatrix();
                return;
            }

            if (tab === 'chat') {
                chat.style.display = 'block';
                btnChat.classList.add('diplo-tab-btn-active');
                renderDiplomacyChat();
                return;
            }

            if (tab === 'history') {
                if (!history || !btnHistory) {
                    overview.style.display = 'block';
                    btnOverview.classList.add('diplo-tab-btn-active');
                    return;
                }
                history.style.display = 'block';
                btnHistory.classList.add('diplo-tab-btn-active');
                renderDiplomacyHistory();
                return;
            }

            overview.style.display = 'block';
            btnOverview.classList.add('diplo-tab-btn-active');
        }

        function renderDiplomacyMatrix() {
            const container = document.getElementById('diploMatrixContainer');
            if (!container) return;

            const factions = G.factions.filter(f => f !== 'neutral');
            if (!factions.length) {
                container.innerHTML = '<div style="text-align: center; padding: 16px; opacity: 0.7;">Нет фракций для отображения</div>';
                return;
            }

            let html = '<div class="diplo-matrix-wrapper"><table class="diplo-matrix"><thead><tr>';
            html += '<th class="diplo-matrix-row-header">Фракция</th>';

            factions.forEach(col => {
                const name = col === 'player' ? 'Вы' : (FACTION_NAMES[col] || col);
                html += `<th>${name}</th>`;
            });

            html += '</tr></thead><tbody>';

            factions.forEach(row => {
                const rowName = row === 'player' ? 'Вы' : (FACTION_NAMES[row] || row);
                html += '<tr>';
                html += `<td class="diplo-matrix-row-header">${rowName}</td>`;

                factions.forEach(col => {
                    if (row === col) {
                        html += '<td class="diplo-matrix-diagonal">—</td>';
                    } else {
                        const rel = getRelation(row, col);
                        let text, cls;
                        if (rel.status === DiploStatus.WAR) {
                            text = '⚔️';
                            cls = 'diplo-war';
                        } else if (rel.status === DiploStatus.NEUTRAL) {
                            text = '•';
                            cls = 'diplo-neutral';
                        } else {
                            text = '🤝';
                            cls = 'diplo-alliance';
                        }
                        const trustText = rel.trust > 0 ? '+' + rel.trust : rel.trust;
                        html += `<td class="diplo-matrix-cell ${cls}" title="Доверие: ${trustText}">${text}</td>`;
                    }
                });

                html += '</tr>';
            });

            html += '</tbody></table></div>';

            container.innerHTML = html;
        }


        // ===== ALLIANCES TAB RENDERING =====
        function renderAlliancesTab() {
            const container = document.getElementById('diploAlliancesContainer');
            if (!container) return;

            syncAllianceRelations();
            cleanAllianceVotes();

            let html = '';

            const playerAlliance = getAllianceOfFaction('player');

            // Active council deliberations (all pending votes visible)
            const allCouncils = G.alliancePendingVotes.filter(v => v.council && v.council.length > 0);

            if (allCouncils.length > 0) {
                html += '<div style="font-size:12px; font-weight:700; color:#fcd34d; margin-bottom:8px;">⚖️ Совещания совета</div>';
                allCouncils.forEach(vote => {
                    const factionName = FACTION_NAMES[vote.faction] || vote.faction;
                    const factionColor = FACTION_COLORS[vote.faction] || '#888';
                    const alliance = G.allianceGroups.find(a => a.id === vote.allianceId);
                    if (!alliance && vote.councilPhase !== 'resolved') return;
                    const totalMembers = alliance ? alliance.members.length : 0;
                    const isPlayerInAlliance = alliance && alliance.members.includes('player');
                    const playerHasVoted = vote.votes['player'] !== null && vote.votes['player'] !== undefined;

                    // Count votes
                    const yesCount = Object.values(vote.votes).filter(v => v === true).length;
                    const noCount = Object.values(vote.votes).filter(v => v === false).length;
                    const votedCount = yesCount + noCount;

                    html += `<div class="council-panel">`;
                    html += `<div class="council-header">⚖️ Совещание: <span style="color:${factionColor}">${escapeHtml(factionName)}</span> → «${escapeHtml(vote.allianceName)}»</div>`;
                    html += `<div class="council-subheader">Для вступления необходимо набрать ≥50% голосов членов альянса (${Math.ceil(totalMembers/2)} из ${totalMembers})</div>`;

                    // Vote progress chips
                    html += `<div class="council-progress">`;
                    if (alliance) {
                        alliance.members.forEach(m => {
                            const mName = m === 'player' ? 'Вы' : (FACTION_NAMES[m] || m);
                            const mColor = FACTION_COLORS[m] || '#888';
                            const v = vote.votes[m];
                            const chipClass = v === true ? 'chip-yes' : (v === false ? 'chip-no' : 'chip-pending');
                            const voteIcon = v === true ? '✓' : (v === false ? '✕' : '…');
                            html += `<div class="council-vote-chip ${chipClass}">`;
                            html += `<div class="chip-dot" style="background:${mColor}"></div>`;
                            html += `${escapeHtml(mName)} ${voteIcon}`;
                            html += `</div>`;
                        });
                    }
                    html += `</div>`;

                    // Council chat
                    html += `<div class="council-chat" id="councilChat_${vote.id}">`;
                    vote.council.forEach(msg => {
                        if (msg.faction === '_system') {
                            html += `<div class="council-msg msg-system">`;
                            html += `<div class="council-msg-header">`;
                            html += `<div class="council-msg-dot" style="background:#fcd34d"></div>`;
                            html += `<span style="color:#fcd34d">Совет</span>`;
                            html += `</div>`;
                            html += `<div class="council-msg-text">${escapeHtml(msg.message)}</div>`;
                            html += `</div>`;
                        } else {
                            const speakerName = msg.faction === 'player' ? 'Вы' : (FACTION_NAMES[msg.faction] || msg.faction);
                            const speakerColor = FACTION_COLORS[msg.faction] || '#888';
                            const msgClass = msg.vote === true ? 'msg-approve' : (msg.vote === false ? 'msg-reject' : 'msg-pending');
                            html += `<div class="council-msg ${msgClass}">`;
                            html += `<div class="council-msg-header">`;
                            html += `<div class="council-msg-dot" style="background:${speakerColor}"></div>`;
                            html += `<span style="color:${speakerColor}">${escapeHtml(speakerName)}</span>`;
                            html += `</div>`;
                            html += `<div class="council-msg-text">${escapeHtml(msg.message)}</div>`;
                            if (msg.vote !== null && msg.vote !== undefined) {
                                const voteClass = msg.vote ? 'vote-yes' : 'vote-no';
                                const voteText = msg.vote ? '✓ Голосует ЗА' : '✕ Голосует ПРОТИВ';
                                html += `<div class="council-msg-vote ${voteClass}">${voteText}</div>`;
                            }
                            html += `</div>`;
                        }
                    });

                    // Show thinking indicator if AI members still deliberating
                    if (vote.councilPhase === 'deliberating') {
                        const aiPending = alliance ? alliance.members.filter(m => m !== 'player' && vote.votes[m] === null) : [];
                        if (aiPending.length > 0) {
                            const nextName = FACTION_NAMES[aiPending[0]] || aiPending[0];
                            const nextColor = FACTION_COLORS[aiPending[0]] || '#888';
                            html += `<div class="council-thinking">`;
                            html += `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>`;
                            html += `<span><span style="color:${nextColor}">${escapeHtml(nextName)}</span> обдумывает решение…</span>`;
                            html += `</div>`;
                        }
                    }

                    html += `</div>`; // end council-chat

                    // Result banner if resolved
                    if (vote.councilPhase === 'resolved') {
                        const resultClass = vote.councilResult === 'accepted' ? 'result-accepted' : 'result-rejected';
                        const resultText = vote.councilResult === 'accepted'
                            ? `✓ ${escapeHtml(factionName)} принят в альянс! (${yesCount}/${totalMembers})`
                            : `✕ Заявка отклонена (${yesCount}/${totalMembers}, нужно ${Math.ceil(totalMembers/2)})`;
                        html += `<div class="council-result ${resultClass}">${resultText}</div>`;
                    }

                    // Player vote buttons (if player is in alliance, hasn't voted, and deliberation ongoing)
                    if (isPlayerInAlliance && !playerHasVoted && vote.councilPhase === 'deliberating') {
                        // Check how many AI have already voted (show button once at least some have spoken)
                        const aiVoted = alliance.members.filter(m => m !== 'player' && vote.votes[m] !== null).length;
                        const aiTotal = alliance.members.filter(m => m !== 'player').length;

                        html += `<div class="council-player-vote">`;
                        html += `<button class="diplo-btn diplo-btn-ally" onclick="window.allianceVoteAccept('${vote.id}')">✓ Одобрить вступление</button>`;
                        html += `<button class="diplo-btn diplo-btn-war" onclick="window.allianceVoteReject('${vote.id}')">✕ Отклонить</button>`;
                        html += `</div>`;
                        if (aiVoted < aiTotal) {
                            html += `<div style="font-size:10px;opacity:0.5;margin-top:4px;text-align:center;">Вы можете проголосовать сейчас или дождаться всех высказываний</div>`;
                        }
                    } else if (isPlayerInAlliance && playerHasVoted && vote.councilPhase === 'deliberating') {
                        html += `<div style="font-size:11px;opacity:0.6;margin-top:6px;text-align:center;">Ваш голос учтён. Ожидание остальных…</div>`;
                    }

                    html += `</div>`; // end council-panel
                });
            }

            // All alliance groups
            if (G.allianceGroups.length === 0 && allCouncils.length === 0) {
                html += `<div class="alliance-no-groups">
                    <div style="font-size: 24px; margin-bottom: 10px;">🛡️</div>
                    <div>Активных альянсов нет</div>
                    <div style="font-size: 11px; margin-top: 6px; opacity: 0.5;">Заключите альянс с другой фракцией, чтобы создать группу</div>
                </div>`;
            } else {
                html += '<div style="font-size:12px; font-weight:700; color:#86efac; margin-bottom:8px;">🛡️ Активные альянсы</div>';

                G.allianceGroups.forEach(alliance => {
                    const isPlayerMember = alliance.members.includes('player');
                    const borderColor = isPlayerMember ? 'rgba(134,239,172,0.5)' : 'rgba(100,100,255,0.3)';
                    const ageSeconds = Math.floor((G.time - alliance.createdAt) / 60);
                    const ageMinutes = Math.floor(ageSeconds / 60);
                    const ageText = ageMinutes > 0 ? `${ageMinutes} мин.` : `${ageSeconds} сек.`;

                    // Calculate combined strength
                    let totalStrength = 0;
                    alliance.members.forEach(m => {
                        totalStrength += evaluateFactionStrength(m);
                    });

                    // Count wars
                    const atWarWith = new Set();
                    alliance.members.forEach(m => {
                        G.factions.forEach(f => {
                            if (f !== 'neutral' && f !== 'parasite' && !alliance.members.includes(f) && areAtWar(m, f)) {
                                atWarWith.add(f);
                            }
                        });
                    });

                    // Pending votes for this alliance
                    const pendingForThis = G.alliancePendingVotes.filter(v => v.allianceId === alliance.id && v.councilPhase === 'deliberating');

                    html += `<div class="alliance-group-card" style="border-color:${borderColor}">`;
                    html += `<div class="alliance-group-name">`;
                    html += `<span class="alliance-shield">🛡️</span>`;
                    html += `${escapeHtml(alliance.name)}`;
                    if (isPlayerMember) html += ` <span style="font-size:10px; color:#86efac; opacity:0.7;">(ваш)</span>`;
                    if (pendingForThis.length > 0) html += ` <span style="font-size:10px; color:#fcd34d; opacity:0.8;">⚖️ ${pendingForThis.length} заявк${pendingForThis.length === 1 ? 'а' : 'и'}</span>`;
                    html += `</div>`;

                    // Members
                    html += `<div class="alliance-member-list">`;
                    alliance.members.forEach(m => {
                        const mName = m === 'player' ? 'Вы' : (FACTION_NAMES[m] || m);
                        const mColor = FACTION_COLORS[m] || '#888';
                        html += `<div class="alliance-member-chip">`;
                        html += `<div class="alliance-member-dot" style="background:${mColor}"></div>`;
                        html += `${escapeHtml(mName)}`;
                        html += `</div>`;
                    });
                    html += `</div>`;

                    // Info
                    html += `<div class="alliance-info-row">📊 Совокупная мощь: ${totalStrength}</div>`;
                    html += `<div class="alliance-info-row">👥 Членов: ${alliance.members.length}</div>`;
                    html += `<div class="alliance-info-row">💰 Цена входа: ${alliance.entryFee || 0} 💲</div>`;
                    html += `<div class="alliance-info-row">⏱️ Возраст: ${ageText}</div>`;

                    if (atWarWith.size > 0) {
                        const warNames = [...atWarWith].map(f => FACTION_NAMES[f] || f).join(', ');
                        html += `<div class="alliance-info-row" style="color:#fca5a5;">⚔️ В войне с: ${escapeHtml(warNames)}</div>`;
                    }

                    // Actions
                    html += `<div class="alliance-actions">`;
                    if (isPlayerMember) {
                        html += `<button class="diplo-btn diplo-btn-break" onclick="window.playerLeaveAlliance(${alliance.id})">🚪 Покинуть</button>`;
                        html += `<button class="diplo-btn diplo-btn-chat" onclick="window.setAllianceFee(${alliance.id})">💰 Цена входа</button>`;
                    } else if (!playerAlliance) {
                        const alreadyPending = G.alliancePendingVotes.find(v => v.faction === 'player' && v.allianceId === alliance.id);
                        if (alreadyPending) {
                            html += `<span style="font-size:11px;color:#fcd34d;opacity:0.8;">📋 Заявка на рассмотрении…</span>`;
                        } else {
                            html += `<button class="diplo-btn diplo-btn-ally" onclick="window.playerRequestJoinAlliance(${alliance.id})">📩 Подать заявку</button>`;
                        }
                    }
                    html += `</div>`;

                    html += `</div>`;
                });
            }

            container.innerHTML = html;

            // Auto-scroll council chats to bottom
            allCouncils.forEach(vote => {
                const chatEl = document.getElementById('councilChat_' + vote.id);
                if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
            });
        }

        // Alliance tab player actions
        window.allianceVoteAccept = function(voteId) {
            playerVoteOnJoin(voteId, true, 0);
            renderAlliancesTab();
        };

        window.allianceVoteReject = function(voteId) {
            playerVoteOnJoin(voteId, false);
            renderAlliancesTab();
        };

        window.playerLeaveAlliance = function(allianceId) {
            const alliance = G.allianceGroups.find(a => a.id === allianceId);
            if (!alliance || !alliance.members.includes('player')) return;
            leaveAllianceGroup('player');
            renderAlliancesTab();
        };

        window.playerRequestJoinAlliance = function(allianceId) {
            const alliance = G.allianceGroups.find(a => a.id === allianceId);
            if (!alliance) return;
            if (alliance.members.includes('player')) return;
            if (getAllianceOfFaction('player')) {
                pushSystemInbox('⚠️ Сначала покиньте текущий альянс');
                return;
            }
            // Check if already pending
            if (G.alliancePendingVotes.find(v => v.faction === 'player' && v.allianceId === allianceId)) {
                pushSystemInbox('⚠️ Заявка уже подана');
                return;
            }
            requestJoinAlliance('player', allianceId, alliance.entryFee);
            pushSystemInbox(`✅ Заявка на вступление в «${alliance.name}» подана!`);
            renderAlliancesTab();
        };

        window.setAllianceFee = function(allianceId) {
            const alliance = G.allianceGroups.find(a => a.id === allianceId);
            if (!alliance) return;
            const feeStr = prompt(`Установите цену входа в «${alliance.name}» (текущая: ${alliance.entryFee || 0}):`, String(alliance.entryFee || 0));
            if (feeStr === null) return;
            const fee = Math.max(0, parseInt(feeStr) || 0);
            alliance.entryFee = fee;
            pushSystemInbox(`✅ Цена входа установлена: ${fee} 💲`);
            renderAlliancesTab();
        };

        function renderDiplomacyHistory() {
            const container = document.getElementById('diploHistoryContainer');
            if (!container) return;

            if (!Array.isArray(G.diplomaticHistory)) G.diplomaticHistory = [];

            // Wire filter checkbox once
            const cb = document.getElementById('diploHistoryOnlyPlayer');
            if (cb && !cb._wired) {
                cb._wired = true;
                cb.addEventListener('change', () => {
                    G.diploHistoryOnlyPlayer = !!cb.checked;
                    renderDiplomacyHistory();
                });
            }
            if (cb) cb.checked = !!G.diploHistoryOnlyPlayer;

            const onlyPlayer = !!G.diploHistoryOnlyPlayer;
            let events = G.diplomaticHistory.slice().reverse();
            if (onlyPlayer) {
                events = events.filter(e => e && (e.from === 'player' || e.to === 'player'));
            }

            if (!events.length) {
                container.innerHTML = '<div style="text-align:center; padding: 16px; opacity: 0.7;">Событий пока нет</div>';
                return;
            }

            function nameOf(f) {
                if (f === 'player') return 'Вы';
                return FACTION_NAMES[f] || f;
            }

            function iconFor(type) {
                switch (type) {
                    case 'declare_war': return '⚔️';
                    case 'propose_peace': return '🕊️';
                    case 'propose_alliance': return '🤝';
                    case 'break_alliance': return '💔';
                    case 'offer_response': return '🗳️';
                    case 'money_transfer': return '💰';
                    case 'fleet_transfer': return '🚀';
                    case 'planet_transfer': return '🌍';
                    case 'send_troops': return '🛰️';
                    case 'request_help': return '🆘';
                    case 'alliance_group_created': return '🛡️';
                    case 'alliance_joined': return '🛡️';
                    case 'alliance_left': return '🚪';
                    case 'alliance_dissolved': return '💥';
                    case 'alliance_join_rejected': return '🚫';
                    case 'tribute_set': case 'tribute_demand': return '🦠';
                    case 'tribute_revolt': return '⚔️';
                    case 'tribute_accepted': return '💰';
                    case 'tribute_refused': return '✕';
                    default: return '•';
                }
            }

            function textFor(e) {
                const from = nameOf(e.from);
                const to = nameOf(e.to);
                const d = e.details || {};
                const reasonRaw = (d && d.reasoning != null) ? String(d.reasoning).trim() : '';
                const reason = reasonRaw ? ` (${reasonRaw})` : '';

                switch (e.type) {
                    case 'declare_war':
                        return `${from} объявляет войну: ${to}${reason}`;
                    case 'propose_peace':
                        return `${from} предлагает мир: ${to}${reason}`;
                    case 'propose_alliance':
                        return `${from} предлагает альянс: ${to}${reason}`;
                    case 'break_alliance':
                        return `${from} разрывает альянс: ${to}${reason}`;
                    case 'offer_response':
                        return `${to} ${d.accepted ? 'принял(а)' : 'отклонил(а)'} предложение (${d.offerType || ''}) от ${from}${reason}`;
                    case 'money_transfer':
                        return `${from} → ${to}: ${Math.round(d.amount || 0)}💲${reason}`;
                    case 'fleet_transfer': {
                        const shipTxt = (d.shipType === 'battleship') ? 'линк.' : 'истреб.';
                        return `${from} → ${to}: ${Math.round(d.count || 0)} ${shipTxt}${reason}`;
                    }
                    case 'planet_transfer': {
                        const pls = Array.isArray(d.planets) ? d.planets : (d.planet ? [d.planet] : []);
                        const txt = pls.length ? pls.join(', ') : 'планеты';
                        return `${from} → ${to}: передача планет (${txt})${reason}`;
                    }
                    case 'send_troops': {
                        const pl = d.planet || '';
                        const st = d.shipType || d.ship_type || '';
                        const c = Math.max(0, Math.round(d.count || 0));
                        const stTxt = (st === 'battleship') ? 'линк.' : 'истреб.';
                        return `${from}: отправляет ${c} ${stTxt} на ${pl || 'планету'}${reason}`;
                    }
                    case 'request_help': {
                        const helpType = d.ship_type
                            ? `${Math.max(1, Math.round(d.count || 1))} ${d.ship_type === 'battleship' ? 'линкоров' : 'истребителей'}`
                            : `${Math.max(10, Math.round(d.amount || 50))}💲`;
                        return `${from} просит помощи у ${to}: ${helpType}${reason}`;
                    }
                    case 'planet_upgrade': {
                        const up = d.upgrade || '';
                        const lvl = d.level != null ? d.level : '';
                        const pl = d.planet ? ` "${d.planet}"` : '';
                        return `${from}: апгрейд планеты${pl} (${up}) → ур.${lvl}${reason}`;
                    }
                    case 'alliance_group_created':
                        return `🛡️ Создан альянс «${d.allianceName || ''}»: ${from} и ${to}`;
                    case 'alliance_joined':
                        return `🛡️ ${from} вступил в «${to || d.allianceName || ''}»`;
                    case 'alliance_left':
                        return `🚪 ${from} покинул «${to || d.allianceName || ''}»`;
                    case 'alliance_dissolved':
                        return `💥 Альянс «${from || d.allianceName || ''}» распущен`;
                    case 'alliance_join_rejected':
                        return `🚫 ${from} не принят в «${to || d.allianceName || ''}» (${d.votes || ''})`;
                    case 'tribute_set': case 'tribute_demand':
                        return `🦠 Паразиты требуют дань от ${to}: ${d.amount || '?'}💲/10сек${reason}`;
                    case 'tribute_revolt':
                        return `⚔️ ${from} восстаёт против дани паразитам!${reason}`;
                    case 'tribute_accepted':
                        return `💰 ${from} платит дань паразитам${reason}`;
                    case 'tribute_refused':
                        return `✕ ${from} отказывается от дани${reason}`;
                    default:
                        return `${from} → ${to}: ${e.type}${reason}`;
                }
            }

            let html = '<div style="border:1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow:hidden;">';
            const max = Math.min(60, events.length);
            for (let i = 0; i < max; i++) {
                const e = events[i];
                if (!e) continue;
                const t = typeof e.time === 'number' ? e.time : 0;
                const seconds = Math.floor(t / 60);
                const d = e.details || {};
                const reason = d.reasoning ? String(d.reasoning).trim() : '';

                html += `
                    <div style="padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; justify-content:space-between; gap:10px; align-items: baseline;">
                            <div style="font-size: 12px;">
                                <span style="opacity:0.9;">${iconFor(e.type)} ${escapeHtml(textFor(e))}</span>
                            </div>
                            <div style="font-size: 10px; opacity: 0.6; white-space: nowrap;">t+${seconds}s</div>
                        </div>
                        ${reason ? `<div style="margin-top:6px; font-size: 11px; opacity: 0.8;"><b>Обоснование:</b> ${escapeHtml(reason)}</div>` : ''}
                    </div>
                `;
            }
            html += '</div>';

            container.innerHTML = html;
        }


        function closeDiplomacyPanel() {
            document.getElementById('diplomacyPanel').classList.add('hidden');
            const offerModal = document.getElementById('diploOfferModal');
            const offerOpen = offerModal && !offerModal.classList.contains('hidden');
            const inboxPanel = document.getElementById('diploInboxPanel');
            const inboxOpen = inboxPanel && !inboxPanel.classList.contains('hidden');
            gamePausedForDiplomacy = !!(offerOpen || inboxOpen);
        }

        
        // ===== Diplomacy Chat + LLM decision (Mistral AI) =====
        function ensureChatStore(faction) {
            if (!G.diploChats) G.diploChats = {};
            if (!G.diploChats[faction]) G.diploChats[faction] = [];
            return G.diploChats[faction];
        }

        function addChatMessage(faction, who, text) {
            const arr = ensureChatStore(faction);
            arr.push({ who, text, t: Date.now() });

            // Track last interaction time with this faction (player <-> AI chat)
            if (faction && faction !== 'neutral' && (who === 'player' || who === 'ai')) {
                const rel = getRelationRef('player', faction);
                if (rel) rel.lastInteraction = G.time;
            }

            if (G.activeDiploChatFaction === faction) renderDiplomacyChat();
        }

        // === Diplo Chat Memory ===
        // Convert stored per-faction chat (G.diploChats[faction]) into LLM "messages" so each faction remembers its dialogue.
        function buildFactionChatMemoryMessages(faction, latestPlayerText, opts = {}) {
            const maxMessages = Number.isFinite(opts.maxMessages) ? Math.max(0, Math.floor(opts.maxMessages)) : 18;
            const maxChars = Number.isFinite(opts.maxChars) ? Math.max(0, Math.floor(opts.maxChars)) : 2600;

            let chat = ensureChatStore(faction).slice();
            const latest = String(latestPlayerText || '').trim();

            // diploSendMessage() already pushed the latest player line into chat; remove it so we don't duplicate.
            if (latest && chat.length) {
                const last = chat[chat.length - 1];
                if (last && last.who === 'player' && String(last.text || '').trim() === latest) {
                    chat = chat.slice(0, -1);
                }
            }

            if (maxMessages > 0 && chat.length > maxMessages) {
                chat = chat.slice(chat.length - maxMessages);
            }

            let out = [];
            for (let i = 0; i < chat.length; i++) {
                const m = chat[i];
                if (!m) continue;
                const t = String(m.text || '').trim();
                if (!t) continue;

                if (m.who === 'ai') out.push({ role: 'assistant', content: t });
                else if (m.who === 'player') out.push({ role: 'user', content: t });
                else out.push({ role: 'user', content: `[Система] ${t}` });
            }

            // Keep newest messages within maxChars budget
            if (maxChars > 0 && out.length) {
                let sum = 0;
                for (let i = out.length - 1; i >= 0; i--) {
                    sum += out[i].content.length;
                    if (sum > maxChars) {
                        out = out.slice(i + 1);
                        break;
                    }
                }
            }

            return out;
        }


        function setChatNetStatus(text, kind) {
            const el = document.getElementById('diploChatNet');
            if (!el) return;
            el.classList.remove('ok','err');
            if (kind === 'ok') el.classList.add('ok');
            if (kind === 'err') el.classList.add('err');
            el.textContent = text || '';
        }

        function setDiploThinking(on, label) {
            const el = document.getElementById('diploChatThinking');
            const txt = document.getElementById('diploChatThinkingText');
            const input = document.getElementById('diploChatInput');
            const send = document.getElementById('diploChatSend');
            const cancel = document.getElementById('diploChatCancel');

            if (txt && label) txt.textContent = label;
            if (el) el.style.display = on ? 'flex' : 'none';

            if (input) input.disabled = !!on;
            if (send) send.disabled = !!on;

            if (cancel) cancel.style.display = on ? 'inline-flex' : 'none';
        }

        function renderDiplomacyChat() {
            const box = document.getElementById('diploChatMessages');
            const nameEl = document.getElementById('diploChatFactionName');
            const colorEl = document.getElementById('diploChatColor');
            const btnPeace = document.getElementById('diploChatOfferPeace');
            const btnAlly = document.getElementById('diploChatOfferAlliance');
            const btnSendResources = document.getElementById('diploChatSendResources');
            const btnSendTroops = document.getElementById('diploChatSendTroops');
            const parasiteBar = document.getElementById('parasiteActionsBar');
            const chatTab = document.getElementById('diploTabChat');
            if (!box || !nameEl || !colorEl || !btnPeace || !btnAlly || !btnSendResources || !btnSendTroops) return;

            const faction = G.activeDiploChatFaction;
            const isParasite = (faction === 'parasite');

            // Toggle parasite theme class
            if (chatTab) chatTab.classList.toggle('parasite-chat-active', isParasite);

            // Show/hide parasite bar vs standard bars
            if (parasiteBar) parasiteBar.classList.toggle('visible', isParasite && !!faction);
            btnPeace.parentElement.style.display = isParasite ? 'none' : '';
            btnSendResources.parentElement.style.display = isParasite ? 'none' : '';
            // Hide expandable panels for parasites
            const resPanel = document.getElementById('diploSendResourcesPanel');
            const troopsPanel = document.getElementById('diploSendTroopsPanel');
            if (isParasite) {
                if (resPanel) resPanel.classList.add('hidden');
                if (troopsPanel) troopsPanel.classList.add('hidden');
            }

            if (!faction) {
                nameEl.textContent = 'Выберите фракцию в «Обзор» → 💬 Чат';
                colorEl.style.background = 'rgba(255,255,255,0.15)';
                box.innerHTML = '';
                btnPeace.disabled = true;
                btnAlly.disabled = true;
                btnSendResources.disabled = true;
                btnSendTroops.disabled = true;
                return;
            }

            const rel = getRelation('player', faction);
            const fName = FACTION_NAMES[faction] || faction;

            if (isParasite) {
                const paying = isPayingTribute('player');
                const tributeData = G.parasiteTributes['player'];
                const pending = tributeData && tributeData.pending && !tributeData.active;
                const amt = tributeData ? tributeData.amount : 0;

                // Header
                nameEl.textContent = paying ? '🦠 Рой Паразитов • 💰 Перемирие (дань)' : '🦠 Рой Паразитов • ⚔️ Враждебны';
                colorEl.style.background = paying ? '#22c55e' : '#ef4444';

                // Update parasite status line
                const statusText = document.getElementById('parasiteStatusText');
                const statusAmt = document.getElementById('parasiteStatusAmount');
                const btnParPeace = document.getElementById('parasiteBtnPeace');
                const tributeActions = document.getElementById('parasiteTributeActions');
                const btnPay = document.getElementById('parasiteBtnPay');
                const btnRevolt = document.getElementById('parasiteBtnRevolt');

                if (paying) {
                    if (statusText) statusText.textContent = 'Перемирие • Вы платите дань';
                    if (statusAmt) statusAmt.textContent = amt + '💲/10сек';
                    if (btnParPeace) btnParPeace.style.display = 'none';
                    const btnOfferP = document.getElementById('parasiteBtnOffer');
                    if (btnOfferP) btnOfferP.style.display = 'none';
                    if (tributeActions) {
                        tributeActions.style.display = 'flex';
                        if (btnPay) btnPay.style.display = 'none';
                        if (btnRevolt) { btnRevolt.style.display = ''; btnRevolt.textContent = '⚔️ Восстать против дани'; }
                    }
                } else if (pending) {
                    if (statusText) statusText.textContent = 'Рой требует дань за мир';
                    if (statusAmt) statusAmt.textContent = amt + '💲/10сек';
                    if (btnParPeace) btnParPeace.style.display = 'none';
                    const btnOfferD = document.getElementById('parasiteBtnOffer');
                    if (btnOfferD) btnOfferD.style.display = 'none';
                    if (tributeActions) {
                        tributeActions.style.display = 'flex';
                        if (btnPay) { btnPay.style.display = ''; btnPay.textContent = '💰 Платить ' + amt + '💲/10сек'; }
                        if (btnRevolt) { btnRevolt.style.display = ''; btnRevolt.textContent = '✕ Отказать'; }
                    }
                } else {
                    if (statusText) statusText.textContent = 'Рой враждебен. Можно попросить мир.';
                    if (statusAmt) statusAmt.textContent = '';
                    if (btnParPeace) { btnParPeace.style.display = ''; btnParPeace.disabled = false; }
                    if (tributeActions) tributeActions.style.display = 'none';
                    const btnOffer = document.getElementById('parasiteBtnOffer');
                    if (btnOffer) { btnOffer.style.display = ''; btnOffer.disabled = false; }
                }

                // Disable standard buttons for parasite
                btnPeace.disabled = true;
                btnAlly.disabled = true;
                btnSendResources.disabled = true;
                btnSendTroops.disabled = true;
            } else {
                nameEl.textContent = `${fName} • ${rel.status === DiploStatus.WAR ? 'Война' : (rel.status === DiploStatus.ALLIANCE ? 'Альянс' : 'Нейтралитет')} • доверие ${rel.trust > 0 ? '+' : ''}${rel.trust}`;
                colorEl.style.background = (FACTION_COLORS[faction] || '#888');

                const banned = (faction === 'neutral');
                const isAlly = (!banned && areAllies('player', faction));
                btnPeace.disabled = (banned || rel.status !== DiploStatus.WAR);
                const targetInAlliance = getAllianceOfFaction(faction);
                const playerInAlliance = getAllianceOfFaction('player');
                const eitherInAlliance = !!(targetInAlliance || playerInAlliance);
                btnAlly.disabled = (banned || rel.status !== DiploStatus.NEUTRAL || eitherInAlliance);
                if (!banned && rel.status === DiploStatus.NEUTRAL && eitherInAlliance) {
                    btnAlly.title = targetInAlliance
                        ? `Фракция состоит в альянсе «${targetInAlliance.name}». Подайте заявку через вкладку Альянсы.`
                        : 'Вы уже состоите в альянсе. Покиньте его, чтобы предлагать новый.';
                } else {
                    btnAlly.title = '';
                }
                btnSendResources.disabled = (!isAlly);
                const isWar = (!banned && rel.status === DiploStatus.WAR);
                btnSendTroops.disabled = (!isWar);
            }

            const msgs = ensureChatStore(faction);
            box.innerHTML = msgs.map(m => {
                const cls = (m.who === 'player') ? 'player' : (m.who === 'system' ? 'system' : 'ai');
                const label = (m.who === 'player') ? 'Вы' : (m.who === 'system' ? 'Система' : (isParasite ? '🦠 Рой' : fName));
                return `<div class="diplo-msg ${cls}"><div class="bubble"><b>${label}:</b> ${escapeHtml(m.text)}</div></div>`;
            }).join('');

            box.scrollTop = box.scrollHeight;

            // Update hint text
            const hintEl = document.getElementById('diploChatHint');
            if (hintEl) hintEl.textContent = isParasite
                ? 'Паразиты требуют дань за перемирие. Общайтесь с Роем или используйте кнопки.'
                : 'ИИ принимает решения по предложениям мира/альянса на основе состояния игры.';
        }

        function wireDiplomacyChatUI() {
            const sendBtn = document.getElementById('diploChatSend');
            const input = document.getElementById('diploChatInput');
            const btnPeace = document.getElementById('diploChatOfferPeace');
            const btnAlly = document.getElementById('diploChatOfferAlliance');

            if (sendBtn && !sendBtn._wired) {
                sendBtn._wired = true;
                sendBtn.addEventListener('click', () => diploSendMessage());
            }
            if (input && !input._wired) {
                input._wired = true;
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); diploSendMessage(); }
                });
            }
            if (btnPeace && !btnPeace._wired) {
                btnPeace._wired = true;
                btnPeace.addEventListener('click', () => {
                    if (G.activeDiploChatFaction) playerProposePeace(G.activeDiploChatFaction);
                });
            }
            if (btnAlly && !btnAlly._wired) {
                btnAlly._wired = true;
                btnAlly.addEventListener('click', () => {
                    if (G.activeDiploChatFaction) playerProposeAlliance(G.activeDiploChatFaction);
                });
            }

            
            // Resource gifts (allies only) + troop dispatch (war only)
            const btnSendResources = document.getElementById('diploChatSendResources');
            const btnSendTroops = document.getElementById('diploChatSendTroops');

            const resPanel = document.getElementById('diploSendResourcesPanel');
            const troopsPanel = document.getElementById('diploSendTroopsPanel');

            const giftListEl = document.getElementById('diploGiftPlanetsList');
            const giftFightersEl = document.getElementById('diploGiftFighters');
            const giftBattleshipsEl = document.getElementById('diploGiftBattleships');
            const giftStarsEl = document.getElementById('diploGiftStars');
            const giftErrEl = document.getElementById('diploGiftError');
            const giftAvailPlanetsEl = document.getElementById('diploAvailPlanets');
            const giftAvailFightersEl = document.getElementById('diploAvailFighters');
            const giftAvailBattleshipsEl = document.getElementById('diploAvailBattleships');
            const giftAvailStarsEl = document.getElementById('diploAvailStars');
            const giftCancelEl = document.getElementById('diploGiftCancel');
            const giftSendEl = document.getElementById('diploGiftSend');

            const troopsPlanetEl = document.getElementById('diploTroopsPlanet');
            const troopsTypeEl = document.getElementById('diploTroopsType');
            const troopsCountEl = document.getElementById('diploTroopsCount');
            const troopsAvailEl = document.getElementById('diploAvailTroops');
            const troopsErrEl = document.getElementById('diploTroopsError');
            const troopsCancelEl = document.getElementById('diploTroopsCancel');
            const troopsSendEl = document.getElementById('diploTroopsSend');

            // Local state (keep selections while panel open)
            if (!G._giftPlanetsSelected) G._giftPlanetsSelected = new Set();

            const countTransferableShips = (faction, shipType) => {
                if (!G.ships) return 0;
                return G.ships.filter(s =>
                    s && s.active &&
                    s.faction === faction &&
                    s.shipType === shipType &&
                    (s.state === ShipState.PATROL || s.state === ShipState.GUARD)
                ).length;
            };

            const setGiftError = (msg) => { if (giftErrEl) giftErrEl.textContent = msg || ''; };
            const setTroopsError = (msg) => { if (troopsErrEl) troopsErrEl.textContent = msg || ''; };

            function refreshGiftPanel() {
                const faction = G.activeDiploChatFaction;
                if (!resPanel) return;

                if (!faction || faction === 'neutral' || faction === 'parasite') {
                    resPanel.classList.add('hidden');
                    setGiftError('');
                    if (btnSendResources) btnSendResources.disabled = true;
                    return;
                }

                if (btnSendResources) btnSendResources.disabled = false;

                // Availability
                const myPlanets = (G.planets || []).filter(p => p && p.active !== false && p.faction === 'player');
                const availPlanets = myPlanets.length;
                const availFighters = countTransferableShips('player', ShipType.FIGHTER);
                const availBattleships = countTransferableShips('player', ShipType.BATTLESHIP);
                const availStars = getFactionStars('player');
                const availEtherium = getFactionEtherium('player');

                if (giftAvailPlanetsEl) giftAvailPlanetsEl.textContent = String(availPlanets);
                if (giftAvailFightersEl) giftAvailFightersEl.textContent = String(availFighters);
                if (giftAvailBattleshipsEl) giftAvailBattleshipsEl.textContent = String(availBattleships);
                if (giftAvailStarsEl) giftAvailStarsEl.textContent = String(availStars);
                const availEthEl = document.getElementById('diploAvailEtherium');
                if (availEthEl) availEthEl.textContent = String(availEtherium);

                // Render planet checkbox list
                if (giftListEl) {
                    giftListEl.innerHTML = '';
                    myPlanets.forEach(p => {
                        const id = `giftPlanet_${p.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}`;
                        const row = document.createElement('div');
                        row.className = 'diplo-planet-item';

                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.id = id;
                        cb.checked = G._giftPlanetsSelected.has(p.name);
                        cb.addEventListener('change', () => {
                            if (cb.checked) G._giftPlanetsSelected.add(p.name);
                            else G._giftPlanetsSelected.delete(p.name);
                        });

                        const lab = document.createElement('label');
                        lab.setAttribute('for', id);
                        lab.textContent = p.name;

                        row.appendChild(cb);
                        row.appendChild(lab);
                        giftListEl.appendChild(row);
                    });
                }

                // Clamp numeric inputs
                const clamp = (el, max) => {
                    if (!el) return;
                    let v = Math.floor(Number(el.value || 0));
                    if (!Number.isFinite(v) || v < 0) v = 0;
                    if (typeof max === 'number' && v > max) v = max;
                    el.value = String(v);
                };
                clamp(giftFightersEl, availFighters);
                clamp(giftBattleshipsEl, availBattleships);
                clamp(giftStarsEl, availStars);
                clamp(document.getElementById('diploGiftEtherium'), availEtherium);
            }

            function refreshTroopsPanel() {
                const faction = G.activeDiploChatFaction;
                if (!troopsPanel) return;

                if (!faction || !areAtWar('player', faction)) {
                    troopsPanel.classList.add('hidden');
                    setTroopsError('');
                    if (btnSendTroops) btnSendTroops.disabled = true;
                    return;
                }

                if (btnSendTroops) btnSendTroops.disabled = false;

                // Populate enemy planets
                if (troopsPlanetEl) {
                    const prev = troopsPlanetEl.value;
                    troopsPlanetEl.innerHTML = '';
                    const enemyPlanets = (G.planets || []).filter(p => p && p.active !== false && p.faction === faction);
                    enemyPlanets.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.name;
                        opt.textContent = p.name;
                        troopsPlanetEl.appendChild(opt);
                    });
                    if (prev && Array.from(troopsPlanetEl.options).some(o => o.value === prev)) troopsPlanetEl.value = prev;
                }

                // Availability by selected type
                const type = troopsTypeEl ? String(troopsTypeEl.value || 'fighter') : 'fighter';
                const st = (type === 'battleship') ? ShipType.BATTLESHIP : ShipType.FIGHTER;
                const avail = countTransferableShips('player', st);
                if (troopsAvailEl) troopsAvailEl.textContent = String(avail);

                // Clamp count
                if (troopsCountEl) {
                    let v = Math.floor(Number(troopsCountEl.value || 0));
                    if (!Number.isFinite(v) || v < 0) v = 0;
                    if (v > avail) v = avail;
                    troopsCountEl.value = String(v);
                }
            }

            const closePanels = () => {
                if (resPanel) resPanel.classList.add('hidden');
                if (troopsPanel) troopsPanel.classList.add('hidden');
                setGiftError('');
                setTroopsError('');
            };

            if (btnSendResources && !btnSendResources._wired) {
                btnSendResources._wired = true;
                btnSendResources.addEventListener('click', () => {
                    closePanels();
                    if (!resPanel) return;
                    resPanel.classList.remove('hidden');
                    refreshGiftPanel();
                });
            }

            if (giftCancelEl && !giftCancelEl._wired) {
                giftCancelEl._wired = true;
                giftCancelEl.addEventListener('click', () => {
                    if (resPanel) resPanel.classList.add('hidden');
                    setGiftError('');
                });
            }

            if (giftSendEl && !giftSendEl._wired) {
                giftSendEl._wired = true;
                giftSendEl.addEventListener('click', () => {
                    const faction = G.activeDiploChatFaction;
                    if (!faction) return;
                    if (faction === 'neutral' || faction === 'parasite') { setGiftError('Нельзя отправить сюда.'); return; }

                    const availStars = getFactionStars('player');
                    const availFighters = countTransferableShips('player', ShipType.FIGHTER);
                    const availBattleships = countTransferableShips('player', ShipType.BATTLESHIP);
                    const availEtherium = getFactionEtherium('player');

                    const fighters = Math.floor(Number(giftFightersEl ? giftFightersEl.value : 0));
                    const battleships = Math.floor(Number(giftBattleshipsEl ? giftBattleshipsEl.value : 0));
                    const stars = Math.floor(Number(giftStarsEl ? giftStarsEl.value : 0));
                    const ethGift = Math.floor(Number(document.getElementById('diploGiftEtherium') ? document.getElementById('diploGiftEtherium').value : 0));
                    const planets = Array.from(G._giftPlanetsSelected || []);

                    if ((!planets || planets.length === 0) && (!fighters || fighters <= 0) && (!battleships || battleships <= 0) && (!stars || stars <= 0) && (!ethGift || ethGift <= 0)) {
                        setGiftError('Выставьте хотя бы один ресурс или выберите планеты.');
                        return;
                    }

                    if (stars > availStars) { setGiftError('Недостаточно денег.'); return; }
                    if (fighters > availFighters) { setGiftError('Недостаточно доступных истребителей.'); return; }
                    if (battleships > availBattleships) { setGiftError('Недостаточно доступных линкоров.'); return; }
                    if (ethGift > availEtherium) { setGiftError('Недостаточно эфириума.'); return; }

                    let okAny = false;

                    if (planets && planets.length) {
                        const res = transferPlanets('player', faction, planets, { source: 'player_ui' });
                        if (!res.success) { setGiftError(`Ошибка передачи планет: ${res.error}`); return; }
                        okAny = true;
                        addChatMessage(faction, 'player', `Передаю вам планеты: ${planets.join(', ')}.`);
                    }

                    if (fighters && fighters > 0) {
                        const res = transferFleet('player', faction, ShipType.FIGHTER, fighters, { source: 'player_ui' });
                        if (!res.success) { setGiftError(`Ошибка передачи флота: ${res.error}`); return; }
                        okAny = true;
                        addChatMessage(faction, 'player', `Отправляю ${fighters} истребителей вам на помощь.`);
                    }

                    if (battleships && battleships > 0) {
                        const res = transferFleet('player', faction, ShipType.BATTLESHIP, battleships, { source: 'player_ui' });
                        if (!res.success) { setGiftError(`Ошибка передачи флота: ${res.error}`); return; }
                        okAny = true;
                        addChatMessage(faction, 'player', `Отправляю ${battleships} линкоров вам на помощь.`);
                    }

                    if (stars && stars > 0) {
                        const res = transferStars('player', faction, stars, { source: 'player_ui' });
                        if (!res.success) { setGiftError(`Ошибка передачи денег: ${res.error}`); return; }
                        okAny = true;
                        addChatMessage(faction, 'player', `Отправляю вам ${stars}💲.`);
                    }

                    if (ethGift && ethGift > 0) {
                        const res = transferEtherium('player', faction, ethGift, { source: 'player_ui' });
                        if (!res.success) { setGiftError(`Ошибка передачи эфириума: ${res.error}`); return; }
                        okAny = true;
                        addChatMessage(faction, 'player', `Отправляю вам ${ethGift}⟠ эфириума.`);
                    }

                    if (okAny) {
                        addChatMessage(faction, 'ai', 'Благодарим за поддержку! Эти ресурсы будут использованы с умом.');
                        pushSystemInbox(`✅ Подарок отправлен фракции ${FACTION_NAMES[faction] || faction}`);
                        if (giftFightersEl) giftFightersEl.value = '0';
                        if (giftBattleshipsEl) giftBattleshipsEl.value = '0';
                        if (giftStarsEl) giftStarsEl.value = '0';
                        const ethInput = document.getElementById('diploGiftEtherium');
                        if (ethInput) ethInput.value = '0';
                        if (G._giftPlanetsSelected) G._giftPlanetsSelected.clear();
                        setGiftError('');
                        refreshGiftPanel();
                        updateHUD();
                        renderDiplomacyChat();
                    }
                });
            }

            if (btnSendTroops && !btnSendTroops._wired) {
                btnSendTroops._wired = true;
                btnSendTroops.addEventListener('click', () => {
                    closePanels();
                    if (!troopsPanel) return;
                    troopsPanel.classList.remove('hidden');
                    refreshTroopsPanel();
                });
            }

            if (troopsCancelEl && !troopsCancelEl._wired) {
                troopsCancelEl._wired = true;
                troopsCancelEl.addEventListener('click', () => {
                    if (troopsPanel) troopsPanel.classList.add('hidden');
                    setTroopsError('');
                });
            }

            if (troopsTypeEl && !troopsTypeEl._wired) {
                troopsTypeEl._wired = true;
                troopsTypeEl.addEventListener('change', () => refreshTroopsPanel());
            }

            if (troopsCountEl && !troopsCountEl._wired) {
                troopsCountEl._wired = true;
                troopsCountEl.addEventListener('input', () => refreshTroopsPanel());
            }

            if (troopsSendEl && !troopsSendEl._wired) {
                troopsSendEl._wired = true;
                troopsSendEl.addEventListener('click', () => {
                    const enemyFaction = G.activeDiploChatFaction;
                    if (!enemyFaction) return;
                    if (!areAtWar('player', enemyFaction)) { setTroopsError('Можно отправлять войска только против врага.'); return; }

                    const planetName = troopsPlanetEl ? String(troopsPlanetEl.value || '') : '';
                    if (!planetName) { setTroopsError('Выберите планету.'); return; }

                    const type = troopsTypeEl ? String(troopsTypeEl.value || 'fighter') : 'fighter';
                    const cnt = Math.floor(Number(troopsCountEl ? troopsCountEl.value : 0));
                    if (!cnt || cnt <= 0) { setTroopsError('Укажите количество.'); return; }

                    const res = dispatchTroops('player', planetName, type, cnt, { source: 'player_ui' });
                    if (!res.success) { setTroopsError(`Ошибка: ${res.error}`); return; }

                    pushSystemInbox(`✅ Войска отправлены на ${planetName}`);
                    if (troopsCountEl) troopsCountEl.value = '0';
                    setTroopsError('');
                    refreshTroopsPanel();
                });
            }

            // Keep panels in sync when chat selection changes / rerender happens
            try {
                refreshGiftPanel();
                refreshTroopsPanel();
            } catch (e) {}

            // === PARASITE BUTTONS ===
            const parasiteBtnPeace = document.getElementById('parasiteBtnPeace');
            const parasiteBtnPay = document.getElementById('parasiteBtnPay');
            const parasiteBtnRevolt = document.getElementById('parasiteBtnRevolt');

            if (parasiteBtnPeace && !parasiteBtnPeace._wired) {
                parasiteBtnPeace._wired = true;
                parasiteBtnPeace.addEventListener('click', () => {
                    if (G.activeDiploChatFaction !== 'parasite') return;
                    parasiteBtnPeace.disabled = true;
                    addChatMessage('parasite', 'player', 'Мы просим мир. Какие ваши условия?');
                    renderDiplomacyChat();
                    setChatNetStatus('Отправка…', '');
                    setDiploThinking(true, 'Рой размышляет…');
                    llmRoleplayReply('parasite', 'Мы просим мир. Какие ваши условия? Мы готовы обсудить дань.', { timeoutMs: 25000 })
                        .then(reply => {
                            setDiploThinking(false);
                            setChatNetStatus('Ответ получен', 'ok');
                            if (reply) {
                                const payload = parseLLMChatPayload(reply);
                                if (payload.message) addChatMessage('parasite', 'ai', payload.message);
                                else addChatMessage('parasite', 'ai', reply);
                                if (payload.actions && payload.actions.length) {
                                    payload.actions.forEach(a => {
                                        const act = sanitizeChatAction('parasite', a);
                                        if (act) executeProactiveAction('parasite', act);
                                    });
                                }
                            }
                            renderDiplomacyChat();
                            parasiteBtnPeace.disabled = false;
                        })
                        .catch(e => {
                            setDiploThinking(false);
                            setChatNetStatus('Ошибка', 'err');
                            addChatMessage('parasite', 'ai', 'Связь с Роем прервана…');
                            renderDiplomacyChat();
                            parasiteBtnPeace.disabled = false;
                        });
                });
            }
            if (parasiteBtnPay && !parasiteBtnPay._wired) {
                parasiteBtnPay._wired = true;
                parasiteBtnPay.addEventListener('click', () => {
                    const t = G.parasiteTributes['player'];
                    if (t && t.pending && !t.active) {
                        window.playerAcceptTribute(true);
                    }
                });
            }
            if (parasiteBtnRevolt && !parasiteBtnRevolt._wired) {
                parasiteBtnRevolt._wired = true;
                parasiteBtnRevolt.addEventListener('click', () => {
                    const t = G.parasiteTributes['player'];
                    if (t && t.active) {
                        window.playerRevoltTribute(true);
                    } else if (t && t.pending && !t.active) {
                        window.playerDeclineTribute(true);
                    }
                });
            }
            const parasiteBtnOffer = document.getElementById('parasiteBtnOffer');
            if (parasiteBtnOffer && !parasiteBtnOffer._wired) {
                parasiteBtnOffer._wired = true;
                parasiteBtnOffer.addEventListener('click', () => {
                    window.playerOfferTribute(true);
                });
            }
        }

        async function diploSendMessage() {
            const faction = G.activeDiploChatFaction;
            const input = document.getElementById('diploChatInput');
            const sendBtn = document.getElementById('diploChatSend');

            if (!input) return;

            const txt = (input.value || '').trim();
            if (!txt) {
            setChatNetStatus('Введите сообщение', 'err');
            return;
            }

            if (!faction) {
            setChatNetStatus('Фракция не выбрана', 'err');
            const box = document.getElementById('diploChatMessages');
            if (box) {
            box.innerHTML = `<div class="diplo-msg system"><div class="bubble"><b>Система:</b> Сначала выберите фракцию в «Обзор» → 💬 Чат.</div></div>` + box.innerHTML;
            }
            return;
            }

            // UI: show message immediately
            input.value = '';
            addChatMessage(faction, 'player', txt);
            renderDiplomacyChat();
            setChatNetStatus('Отправка…', '');
            setDiploThinking(true, 'ИИ думает…');

            // Abort + timeout protection
            try { if (G._diploAbort) G._diploAbort.abort(); } catch(e) {}
            const controller = new AbortController();
            G._diploAbort = controller;

            try {
            const reply = await llmRoleplayReply(faction, txt, { signal: controller.signal, timeoutMs: 25000 });
            if (controller.signal.aborted) throw new Error('Отменено');

            setDiploThinking(false);
            setChatNetStatus('Ответ получен', 'ok');

            if (reply) {
            const payload = parseLLMChatPayload(reply);
            const fallbackReason = normalizeReasoningText(payload.reasoning || payload.message || '', 240);
            if (payload.message) addChatMessage(faction, 'ai', payload.message);
            else addChatMessage(faction, 'ai', '...');

            if (payload.actions && payload.actions.length) {
            for (let i = 0; i < payload.actions.length; i++) {
            const act = sanitizeChatAction(faction, payload.actions[i]);
            if (act && !act.reasoning && fallbackReason) act.reasoning = fallbackReason;
            if (!act) continue;
            await executeProactiveAction(faction, act);
            await sleep(250);
            }
            }
            } else {
            addChatMessage(faction, 'ai', 'Связь прервана. Повтори позже.');
            }
            } catch (e) {
            setDiploThinking(false);
            let msg = 'Ошибка сети';
            if (e && e.name === 'AbortError') msg = 'Отменено';
            else if (e && e.message) msg = e.message;

            setChatNetStatus(`Ошибка: ${msg}`, 'err');
            addChatMessage(faction, 'system', `Ошибка запроса к ИИ: ${msg}`);
            console.error('Diplo chat error:', e);
            } finally {
            if (G._diploAbort === controller) G._diploAbort = null;
            if (sendBtn) sendBtn.disabled = false;
            input.disabled = false;
            input.focus();
            renderDiplomacyChat();
            }
        }

