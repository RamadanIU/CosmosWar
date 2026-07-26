// ============================================================
// MODULE: 20-diplomacy-inbox.js
// Назначение: Входящие предложения (inbox), модалка дип. оффера, handlePlayerOfferResponse
// Оригинальные строки IIFE: 8544-8991
// Порядок загрузки: 21/24
// ============================================================

        let pendingOffer = null;
        let gamePausedForDiplomacy = false;

        // ===== Diplomacy Inbox System =====
        function pushToInbox(fromFaction, offerType, reasonText) {
            const msg = {
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                from: fromFaction,
                type: offerType,
                reason: reasonText || '',
                time: G.time,
                read: false,
                handled: false
            };
            G.diploInbox.push(msg);
            G.diploInboxUnread++;
            updateInboxBadge();
            showDiploToast(fromFaction, offerType, reasonText);

            // Auto-render if inbox panel is open
            const panel = document.getElementById('diploInboxPanel');
            if (panel && !panel.classList.contains('hidden')) {
                renderInbox();
            }
        }

        function pushSystemInbox(text) {
            const msg = {
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                from: 'system',
                type: 'system',
                reason: text || '',
                time: G.time,
                read: false,
                handled: false
            };
            G.diploInbox.push(msg);
            G.diploInboxUnread++;
            updateInboxBadge();
            showDiploToast('system', 'system', text);

            const panel = document.getElementById('diploInboxPanel');
            if (panel && !panel.classList.contains('hidden')) {
                renderInbox();
            }
        }

        function showDiplomaticOffer(fromFaction, offerType, reasonText) {
            // No longer pauses game or shows fullscreen modal
            // Instead pushes to inbox
            pushToInbox(fromFaction, offerType, reasonText);
        }

        function showDiploToast(fromFaction, offerType, reasonText) {
            // Remove old toasts
            document.querySelectorAll('.diplo-toast').forEach(t => t.remove());

            const color = fromFaction === 'system' ? '#a78bfa' : getFactionColorMain(fromFaction);
            const name = fromFaction === 'system' ? '⚙️ Система' : (FACTION_NAMES[fromFaction] || fromFaction);

            let typeText = '';
            if (offerType === 'alliance') typeText = 'предлагает альянс';
            else if (offerType === 'peace') typeText = 'предлагает мир';
            else if (offerType === 'war') typeText = 'объявляет войну!';
            else if (offerType === 'break_alliance') typeText = 'разрывает альянс!';
            else if (offerType === 'alliance_join_request') typeText = 'просит вступить в ваш альянс';
            else if (offerType === 'gift') typeText = 'передаёт ресурсы';
            else if (offerType === 'troops_attack') typeText = 'отправляет войска!';
            else if (offerType === 'help_request') typeText = 'просит помощи';
            else if (offerType === 'war_declared') typeText = 'война объявлена';
            else if (offerType === 'alliance_broken') typeText = 'альянс разорван';
            else if (offerType === 'peace_rejected') typeText = 'мир отвергнут';
            else if (offerType === 'alliance_rejected') typeText = 'альянс отвергнут';
            else if (offerType === 'tribute_demand') typeText = 'требует дань!';
            else if (offerType === 'tribute_accepted') typeText = 'дань принята';
            else if (offerType === 'tribute_revolt') typeText = 'восстание против дани!';
            else if (offerType === 'tribute_refused') typeText = 'дань отвергнута';
            else if (offerType === 'tribute_failed') typeText = 'не может заплатить дань!';
            else if (offerType === 'system') typeText = reasonText || 'событие';
            else typeText = reasonText || 'сообщение';

            const toast = document.createElement('div');
            toast.className = 'diplo-toast';
            toast.style.borderLeft = `3px solid ${color}`;
            toast.innerHTML = `
                <div class="toast-dot" style="background:${color}; color:${color};"></div>
                <div class="toast-text"><b style="color:${color}">${escapeHtml(name)}</b> ${escapeHtml(typeText)}</div>
            `;
            toast.addEventListener('click', () => {
                toast.remove();
                showInboxPanel();
            });
            document.body.appendChild(toast);
            setTimeout(() => { try { toast.remove(); } catch(e){} }, 5000);
        }

        function updateInboxBadge() {
            const badge = document.getElementById('inboxBadge');
            if (!badge) return;
            const unread = G.diploInbox.filter(m => !m.read).length;
            G.diploInboxUnread = unread;
            if (unread > 0) {
                badge.textContent = unread;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        function showInboxPanel() {
            if (G.spectatorMode || G.playerDefeated) return;
            gamePausedForDiplomacy = true;
            const panel = document.getElementById('diploInboxPanel');
            if (panel) panel.classList.remove('hidden');
            // Mark all as read
            G.diploInbox.forEach(m => m.read = true);
            G.diploInboxUnread = 0;
            updateInboxBadge();
            renderInbox();
        }

        function closeInboxPanel() {
            const panel = document.getElementById('diploInboxPanel');
            if (panel) panel.classList.add('hidden');
            const diploPanel = document.getElementById('diplomacyPanel');
            const diploOpen = diploPanel && !diploPanel.classList.contains('hidden');
            const upgPanel = document.getElementById('upgradePanel');
            const upgOpen = upgPanel && !upgPanel.classList.contains('hidden');
            gamePausedForDiplomacy = !!(diploOpen || upgOpen);
        }

        function renderInbox() {
            const content = document.getElementById('inboxContent');
            const empty = document.getElementById('inboxEmpty');
            if (!content) return;

            // Show newest first
            const msgs = G.diploInbox.slice().reverse();

            if (msgs.length === 0) {
                content.innerHTML = '';
                if (empty) empty.style.display = 'block';
                return;
            }
            if (empty) empty.style.display = 'none';

            let html = '';
            for (const msg of msgs) {
                const color = msg.from === 'system' ? '#a78bfa' : getFactionColorMain(msg.from);
                const name = msg.from === 'system' ? 'Система' : (FACTION_NAMES[msg.from] || msg.from);
                const reasonSafe = msg.reason ? escapeHtml(String(msg.reason)) : '';

                let icon = '📜';
                let typeLabel = '';
                let typeColor = '#6b7280';
                let typeBg = '#374151';
                let bodyText = '';
                let showAcceptDecline = false;
                let showDismiss = false;

                if (msg.type === 'alliance') {
                    icon = '🤝';
                    typeLabel = 'Альянс';
                    typeColor = '#86efac'; typeBg = '#14532d';
                    bodyText = 'Предлагает заключить <b>альянс</b>. Союзники не атакуют друг друга и объединяются против общих врагов.';
                    showAcceptDecline = !msg.handled;
                } else if (msg.type === 'peace') {
                    icon = '🕊️';
                    typeLabel = 'Мир';
                    typeColor = '#93c5fd'; typeBg = '#1e3a5f';
                    bodyText = 'Предлагает заключить <b>мир</b>. Нейтральные фракции не нападают друг на друга.';
                    showAcceptDecline = !msg.handled;
                } else if (msg.type === 'war') {
                    icon = '⚔️';
                    typeLabel = 'Война';
                    typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = '<b>Объявляет вам войну!</b> Приготовьтесь к обороне.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'break_alliance') {
                    icon = '💔';
                    typeLabel = 'Разрыв';
                    typeColor = '#fcd34d'; typeBg = '#713f12';
                    bodyText = '<b>Разрывает альянс</b> с вами. Отношения становятся нейтральными.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'alliance_join_request') {
                    icon = '🛡️';
                    typeLabel = 'Вступление';
                    typeColor = '#86efac'; typeBg = '#14532d';
                    bodyText = `Запрос на вступление в ваш альянс. Голосуйте во вкладке <b>Альянсы</b>.`;
                    showDismiss = !msg.handled;
                } else if (msg.type === 'gift') {
                    icon = '🎁';
                    typeLabel = 'Подарок';
                    typeColor = '#86efac'; typeBg = '#14532d';
                    bodyText = reasonSafe || 'Передаёт ресурсы.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'troops_attack') {
                    icon = '🚀';
                    typeLabel = 'Войска';
                    typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = reasonSafe || 'Отправляет войска.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'help_request') {
                    icon = '🆘';
                    typeLabel = 'Помощь';
                    typeColor = '#fcd34d'; typeBg = '#713f12';
                    bodyText = reasonSafe || 'Просит помощи.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'war_declared') {
                    icon = '⚔️';
                    typeLabel = 'Война';
                    typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = reasonSafe || 'Вы объявили войну.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'alliance_broken') {
                    icon = '💔';
                    typeLabel = 'Разрыв';
                    typeColor = '#fcd34d'; typeBg = '#713f12';
                    bodyText = reasonSafe || 'Альянс разорван.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'peace_rejected') {
                    icon = '🚫';
                    typeLabel = 'Отказ';
                    typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = reasonSafe || 'Предложение мира отвергнуто.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'alliance_rejected') {
                    icon = '🚫';
                    typeLabel = 'Отказ';
                    typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = reasonSafe || 'Предложение альянса отклонено.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'tribute_demand') {
                    icon = '🦠'; typeLabel = 'Дань'; typeColor = '#fbbf24'; typeBg = '#78350f';
                    bodyText = reasonSafe || 'Паразиты требуют дань.';
                    showAcceptDecline = !msg.handled;
                } else if (msg.type === 'tribute_accepted') {
                    icon = '💰'; typeLabel = 'Дань'; typeColor = '#fbbf24'; typeBg = '#78350f';
                    bodyText = reasonSafe || 'Дань принята.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'tribute_revolt') {
                    icon = '⚔️'; typeLabel = 'Восстание'; typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = reasonSafe || 'Восстание против дани!';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'tribute_refused') {
                    icon = '✕'; typeLabel = 'Отказ'; typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = reasonSafe || 'Дань отвергнута.';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'tribute_failed') {
                    icon = '💸'; typeLabel = 'Дань'; typeColor = '#fca5a5'; typeBg = '#7f1d1d';
                    bodyText = reasonSafe || 'Не хватает денег на дань!';
                    showDismiss = !msg.handled;
                } else if (msg.type === 'system') {
                    icon = '⚙️'; typeLabel = 'Система';
                    typeColor = '#c4b5fd'; typeBg = '#3b0764';
                    bodyText = reasonSafe || 'Системное событие.';
                    showDismiss = !msg.handled;
                } else {
                    icon = '📜';
                    typeLabel = 'Инфо';
                    typeColor = '#d1d5db'; typeBg = '#374151';
                    bodyText = reasonSafe || 'Сообщение.';
                    showDismiss = !msg.handled;
                }

                const timeAgo = Math.max(0, Math.floor((G.time - msg.time) / 60));
                const timeStr = timeAgo < 1 ? 'только что' : timeAgo + ' сек. назад';

                html += `<div class="inbox-msg" style="border-left: 3px solid ${color};">`;
                html += `<div class="inbox-msg-header">`;
                html += `<div class="inbox-msg-dot" style="background:${color}; color:${color};"></div>`;
                html += `<span class="inbox-msg-from" style="color:${color}">${icon} ${escapeHtml(name)}</span>`;
                html += `<span class="inbox-msg-type" style="background:${typeBg}; color:${typeColor};">${typeLabel}</span>`;
                html += `</div>`;
                html += `<div class="inbox-msg-body">${bodyText}</div>`;
                const showReasonSeparately = reasonSafe && (msg.type === 'alliance' || msg.type === 'peace' || msg.type === 'war' || msg.type === 'break_alliance');
                if (showReasonSeparately) {
                    html += `<div class="inbox-msg-reason">💬 "${reasonSafe}"</div>`;
                }

                if (msg.handled) {
                    const ackTypes = ['war','break_alliance','alliance_join_request','gift','troops_attack','help_request','war_declared','alliance_broken','peace_rejected','alliance_rejected','system','tribute_accepted','tribute_revolt','tribute_refused','tribute_failed'];
                    const resultText = msg.accepted ? (ackTypes.includes(msg.type) ? '📌 Принято к сведению' : '✅ Принято') : (ackTypes.includes(msg.type) ? '📌 Принято к сведению' : '❌ Отклонено');
                    html += `<div style="padding-left:20px; font-size:11px; opacity:0.6; font-style:italic;">${resultText}</div>`;
                } else if (showAcceptDecline) {
                    html += `<div class="inbox-msg-actions">`;
                    html += `<button class="inbox-accept" onclick="handleInboxResponse('${msg.id}', true)">✓ Принять</button>`;
                    html += `<button class="inbox-decline" onclick="handleInboxResponse('${msg.id}', false)">✕ Отклонить</button>`;
                    html += `</div>`;
                } else if (showDismiss) {
                    html += `<div class="inbox-msg-actions">`;
                    html += `<button class="inbox-dismiss" onclick="handleInboxResponse('${msg.id}', true)">Понятно</button>`;
                    html += `</div>`;
                }

                html += `<div class="inbox-msg-time">${timeStr}</div>`;
                html += `</div>`;
            }
            content.innerHTML = html;
        }

        window.handleInboxResponse = function(msgId, accepted) {
            const msg = G.diploInbox.find(m => m.id === msgId);
            if (!msg || msg.handled) return;

            msg.handled = true;
            msg.accepted = accepted;

            const from = msg.from;
            const type = msg.type;

            if (type === 'alliance') {
                if (accepted) {
                    setRelation('player', from, DiploStatus.ALLIANCE);
                    modifyTrust('player', from, 30);
                    // Create or join alliance group
                    const pAlliance = getAllianceOfFaction('player');
                    const fAlliance = getAllianceOfFaction(from);
                    if (pAlliance && !fAlliance) {
                        joinAllianceGroup(from, pAlliance.id, 0);
                    } else if (!pAlliance && fAlliance) {
                        joinAllianceGroup('player', fAlliance.id, 0);
                    } else if (!pAlliance && !fAlliance) {
                        createAllianceGroup('player', from);
                    }
                } else {
                    modifyTrust('player', from, -20);
                }
            } else if (type === 'peace') {
                if (accepted) {
                    setRelation('player', from, DiploStatus.NEUTRAL);
                    modifyTrust('player', from, 15);
                    cascadePeaceToAlliance('player', from);
                } else {
                    modifyTrust('player', from, -15);
                }
            } else if (type === 'war') {
                setRelation('player', from, DiploStatus.WAR);
                modifyTrust('player', from, -40);
                // War cascade already handled when AI declared war
            } else if (type === 'break_alliance') {
                setRelation('player', from, DiploStatus.NEUTRAL);
                modifyTrust('player', from, -30);
            } else if (type === 'alliance_join_request') {
                msg.handled = true;
            } else if (type === 'tribute_demand') {
                if (accepted) { window.playerAcceptTribute(); }
                else { window.playerDeclineTribute(); }
            }

            logDiplomaticEvent('offer_response', from, 'player', {
                offerType: type,
                accepted: !!accepted,
                reasoning: (msg.reason || '').toString()
            });

            // Echo in chat
            try {
                if (type === 'peace' || type === 'alliance') {
                    ensureChatStore(from);
                    const verb = (type === 'peace')
                        ? (accepted ? 'Мир заключён.' : 'Вы отклонили мир.')
                        : (accepted ? 'Альянс заключён.' : 'Вы отклонили альянс.');
                    addChatMessage(from, 'ai', verb);
                }
            } catch (e) {}

            renderInbox();
        };

        // Clean old inbox messages (keep last 20)
        function cleanInbox() {
            if (G.diploInbox.length > 20) {
                G.diploInbox = G.diploInbox.slice(-20);
            }
        }

        function handlePlayerOfferResponse(accepted) {
            const modal = document.getElementById('diploOfferModal');
            modal.classList.add('hidden');

            document.getElementById('offerAccept').textContent = '✓ Принять';
            document.getElementById('offerDecline').classList.remove('hidden');

            if (pendingOffer) {
                const { from, type, reason } = pendingOffer;

                if (type === 'alliance') {
                    if (accepted) {
                        setRelation('player', from, DiploStatus.ALLIANCE);
                        modifyTrust('player', from, 30);
                        // Create or join alliance group
                        const pAlliance2 = getAllianceOfFaction('player');
                        const fAlliance2 = getAllianceOfFaction(from);
                        if (pAlliance2 && !fAlliance2) {
                            joinAllianceGroup(from, pAlliance2.id, 0);
                        } else if (!pAlliance2 && fAlliance2) {
                            joinAllianceGroup('player', fAlliance2.id, 0);
                        } else if (!pAlliance2 && !fAlliance2) {
                            createAllianceGroup('player', from);
                        }
                    } else {
                        modifyTrust('player', from, -20);
                    }
                } else if (type === 'peace') {
                    if (accepted) {
                        setRelation('player', from, DiploStatus.NEUTRAL);
                        modifyTrust('player', from, 15);
                        cascadePeaceToAlliance('player', from);
                    } else {
                        modifyTrust('player', from, -15);
                    }
                } else if (type === 'war') {
                    setRelation('player', from, DiploStatus.WAR);
                    modifyTrust('player', from, -40);
                    accepted = true;
                } else if (type === 'break_alliance') {
                    setRelation('player', from, DiploStatus.NEUTRAL);
                    modifyTrust('player', from, -30);
                    accepted = true;
                }

                logDiplomaticEvent('offer_response', from, 'player', {
                    offerType: type,
                    accepted: !!accepted,
                    reasoning: (reason || '').toString()
                });

                try {
                    if (type === 'peace' || type === 'alliance') {
                        ensureChatStore(from);
                        const verb = (type === 'peace') ? (accepted ? 'Мир заключён.' : 'Мы отклоняем мир.') : (accepted ? 'Альянс заключён.' : 'Мы отклоняем союз.');
                        const extra = reason ? ` ${reason}` : '';
                        addChatMessage(from, 'ai', (verb + extra).trim());
                    }
                } catch (e) {}
            }

            pendingOffer = null;

            const panel = document.getElementById('diplomacyPanel');
            const panelOpen = panel && !panel.classList.contains('hidden');
            gamePausedForDiplomacy = !!panelOpen;
        }

        document.getElementById('offerAccept').addEventListener('click', () => handlePlayerOfferResponse(true));
        document.getElementById('offerDecline').addEventListener('click', () => handlePlayerOfferResponse(false));

