/**
 * Aplicação Principal DVR TV para Smart TVs (LG webOS / Samsung) e PC
 * Padrão: Grade 4x4 com as 16 câmeras simultâneas na tela e Modal de Configurações
 */
class DvrTvApp {
    constructor() {
        this.dvr = new DvrApiClient({
            ip: localStorage.getItem('dvr_ip') || '192.168.100.2',
            httpPort: parseInt(localStorage.getItem('dvr_http_port') || '80', 10),
            rtspPort: parseInt(localStorage.getItem('dvr_rtsp_port') || '554', 10),
            username: localStorage.getItem('dvr_user') || 'admin',
            password: localStorage.getItem('dvr_pwd') || 'jr130182'
        });

        this.channels = [];
        this.activeChannelsOnly = false;
        this.currentLayout = localStorage.getItem('dvr_layout') || '4x4';

        this.focusedIndex = 0;
        this.isHeaderFocused = false;
        this.isFullScreen = false;
        this.fullScreenChannel = null;
        this.streamQuality = 2; // Padrão: 2 = Sub-stream Fluido (Alta taxa de quadros / FPS)

        // Estado do Modal de Configurações
        this.isSettingsOpen = false;
        this.isAdvancedOpen = false;
        this.settingsFocusedIndex = 0;
        this.resetPasswordPending = null;

        // Buffer para troca direta de canais com teclas numéricas (0-9)
        this.channelInputBuffer = '';
        this.channelInputTimer = null;
        this.lastBackPressTime = 0;

        this.gridRefreshTimer = null;
        this.player = null;
        this.remote = null;

        this.init();
    }

    async init() {
        document.title = 'DVR TV - LG webOS Smart TV';
        console.log('[App] Inicializando DVR TV App (LG webOS / Smart TV)...');
        this.startClock();
        this.setupDOM();

        var playerContainer = document.getElementById('fullscreen-player-container');
        this.player = new TvStreamPlayer(playerContainer, this.dvr);

        this.setupRemote();
        this.setupModalEvents();
        await this.connectDvr();
    }

    startClock() {
        var clockEl = document.getElementById('clock-time');
        var dateEl = document.getElementById('clock-date');
        var updateClock = function() {
            var now = new Date();
            if (clockEl) {
                clockEl.textContent = now.toLocaleTimeString('pt-BR');
            }
            if (dateEl) {
                dateEl.textContent = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
            }
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    setupDOM() {
        var self = this;
        window.addEventListener('resize', function() {
            if (self.player) self.player.resize();
        });

        var btnSettings = document.getElementById('btn-header-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', function() {
                self.openSettings();
            });
        }
    }

    setupRemote() {
        var self = this;
        this.remote = new RemoteControlManager({
            onUp: function() { self.handleUp(); },
            onDown: function() { self.handleDown(); },
            onLeft: function() { self.handleLeft(); },
            onRight: function() { self.handleRight(); },
            onEnter: function() { self.handleEnter(); },
            onBack: function() { self.handleBack(); },
            onRed: function() { self.handleRed(); },
            onGreen: function() { self.handleGreen(); },
            onYellow: function() { self.handleYellow(); },
            onBlue: function() { self.handleBlue(); },
            onChannelUp: function() { self.nextCamera(); },
            onChannelDown: function() { self.prevCamera(); },
            onNumber: function(num) { self.handleNumber(num); }
        });
    }

    // =========================================================================
    // Conexão com o DVR
    // =========================================================================
    async connectDvr() {
        this.showToast('Conectando ao DVR (' + this.dvr.ip + ':' + this.dvr.httpPort + ')...', 3000);
        this.setConnectionStatus('connecting', 'Conectando...');

        try {
            await this.dvr.login();
            this.setConnectionStatus('connected', 'Conectado');

            var deviceInfo = await this.dvr.getDeviceInfo();
            if (deviceInfo) {
                document.getElementById('dvr-title').textContent = deviceInfo.deviceName + ' • ' + deviceInfo.model;
            }

            this.channels = await this.dvr.getChannels();
            console.log('[App] ' + this.channels.length + ' canais carregados.');

            this.renderGrid();
            this.startGridRefresh();
            this.showToast(this.channels.length + ' Câmeras Carregadas (Grade ' + this.currentLayout + ')', 2500);

        } catch (err) {
            console.error('[App] Erro ao conectar ao DVR:', err);
            this.setConnectionStatus('error', 'Erro de Conexão');
            this.showToast('Falha na conexão: ' + err.message, 8000);

            var grid = document.getElementById('camera-grid');
            if (grid) {
                grid.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#ef4444;font-size:22px;gap:14px;text-align:center;padding:40px;">' +
                    '<div>⚠️ Não foi possível carregar os canais do DVR (' + this.dvr.ip + ')</div>' +
                    '<div style="color:#94a3b8;font-size:16px;">Detalhes: ' + err.message + '</div>' +
                    '<div style="color:#38bdf8;font-size:15px;margin-top:10px;">Pressione <b>🔵 AZUL</b> no controle para ajustar o IP e Senha nas Configurações.</div>' +
                    '</div>';
            }
        }
    }

    setConnectionStatus(state, label) {
        var dot = document.getElementById('status-dot');
        var text = document.getElementById('status-label');
        if (dot) {
            dot.className = 'status-dot ' + state;
        }
        if (text) {
            text.textContent = label;
        }
    }

    // =========================================================================
    // Modal de Configurações
    // =========================================================================
    setupModalEvents() {
        var self = this;

        // Botão Fechar (X)
        var btnCloseX = document.getElementById('btn-modal-close-x');
        if (btnCloseX) {
            btnCloseX.addEventListener('click', function() { self.closeSettings(); });
        }

        // Accordion Avançado
        var btnToggleAdv = document.getElementById('btn-toggle-advanced');
        if (btnToggleAdv) {
            btnToggleAdv.addEventListener('click', function() { self.toggleAdvanced(); });
        }

        // Salvar
        var btnSave = document.getElementById('btn-save-settings');
        if (btnSave) {
            btnSave.addEventListener('click', function() { self.saveSettings(); });
        }

        // Restaurar Padrões
        var btnReset = document.getElementById('btn-reset-settings');
        if (btnReset) {
            btnReset.addEventListener('click', function() { self.resetSettings(); });
        }

        // Cancelar / Fechar
        var btnClose = document.getElementById('btn-close-settings');
        if (btnClose) {
            btnClose.addEventListener('click', function() { self.closeSettings(); });
        }

        // Fechar ao clicar no backdrop escuro
        var backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', function() { self.closeSettings(); });
        }
    }

    getSettingsElements() {
        var elements = [
            document.getElementById('cfg-dvr-ip'),
            document.getElementById('cfg-dvr-user'),
            document.getElementById('cfg-dvr-pwd'),
            document.getElementById('btn-toggle-advanced')
        ];

        if (this.isAdvancedOpen) {
            elements.push(document.getElementById('cfg-dvr-http-port'));
            elements.push(document.getElementById('cfg-dvr-rtsp-port'));
        }

        elements.push(document.getElementById('btn-save-settings'));
        elements.push(document.getElementById('btn-reset-settings'));
        elements.push(document.getElementById('btn-close-settings'));

        return elements.filter(function(el) { return el !== null; });
    }

    openSettings() {
        console.log('[App] Abrindo Modal de Configurações...');
        this.isSettingsOpen = true;
        this.resetPasswordPending = null;

        var modal = document.getElementById('settings-modal');
        if (modal) {
            modal.style.display = 'flex';
        }

        // Preenche os campos com os valores atuais
        var ipInput = document.getElementById('cfg-dvr-ip');
        var userInput = document.getElementById('cfg-dvr-user');
        var pwdInput = document.getElementById('cfg-dvr-pwd');
        var httpInput = document.getElementById('cfg-dvr-http-port');
        var rtspInput = document.getElementById('cfg-dvr-rtsp-port');

        if (ipInput) ipInput.value = localStorage.getItem('dvr_ip') || this.dvr.ip;
        if (userInput) userInput.value = localStorage.getItem('dvr_user') || this.dvr.username;

        // Por segurança, a senha configurada NUNCA é colocada no campo em texto aberto
        if (pwdInput) {
            pwdInput.value = '';
            var hasSavedPwd = !!(localStorage.getItem('dvr_pwd') || this.dvr.password);
            pwdInput.placeholder = hasSavedPwd 
                ? '•••••••• (Senha salva - digite para alterar)' 
                : 'Digite a senha do DVR';
        }

        if (httpInput) httpInput.value = localStorage.getItem('dvr_http_port') || this.dvr.httpPort;
        if (rtspInput) rtspInput.value = localStorage.getItem('dvr_rtsp_port') || this.dvr.rtspPort;

        this.settingsFocusedIndex = 0;
        this.updateSettingsFocus();
    }

    closeSettings() {
        console.log('[App] Fechando Modal de Configurações...');
        this.isSettingsOpen = false;

        var modal = document.getElementById('settings-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        if (document.activeElement) {
            document.activeElement.blur();
        }

        this.isHeaderFocused = false;
        this.updateCardFocus();
    }

    toggleAdvanced() {
        this.isAdvancedOpen = !this.isAdvancedOpen;
        var panel = document.getElementById('advanced-settings-panel');
        var arrow = document.getElementById('accordion-arrow');

        if (panel) {
            panel.style.display = this.isAdvancedOpen ? 'flex' : 'none';
        }
        if (arrow) {
            if (this.isAdvancedOpen) {
                arrow.classList.add('open');
            } else {
                arrow.classList.remove('open');
            }
        }

        this.updateSettingsFocus();
    }

    saveSettings() {
        var ipInput = document.getElementById('cfg-dvr-ip');
        var userInput = document.getElementById('cfg-dvr-user');
        var pwdInput = document.getElementById('cfg-dvr-pwd');
        var httpInput = document.getElementById('cfg-dvr-http-port');
        var rtspInput = document.getElementById('cfg-dvr-rtsp-port');

        var newIp = (ipInput && ipInput.value) ? ipInput.value.trim() : '192.168.100.2';
        var newUser = (userInput && userInput.value) ? userInput.value.trim() : 'admin';

        // Lógica de Segurança da Senha:
        // Se o usuário digitou uma nova senha, usa a nova.
        // Se foi clicado em 'Restaurar Padrões', usa a padrão.
        // Se o campo foi deixado vazio, mantém a senha atual salva internamente!
        var currentSavedPwd = localStorage.getItem('dvr_pwd') || this.dvr.password || 'jr130182';
        var enteredPwd = (pwdInput && pwdInput.value) ? pwdInput.value : '';
        var newPwd = currentSavedPwd;

        if (enteredPwd.length > 0) {
            newPwd = enteredPwd;
        } else if (this.resetPasswordPending) {
            newPwd = this.resetPasswordPending;
        }
        this.resetPasswordPending = null;

        var newHttp = (httpInput && httpInput.value) ? parseInt(httpInput.value, 10) : 80;
        var newRtsp = (rtspInput && rtspInput.value) ? parseInt(rtspInput.value, 10) : 554;

        if (!newIp) {
            this.showToast('Erro: Endereço IP do DVR não pode ser vazio', 3000);
            return;
        }

        localStorage.setItem('dvr_ip', newIp);
        localStorage.setItem('dvr_user', newUser);
        localStorage.setItem('dvr_pwd', newPwd);
        localStorage.setItem('dvr_http_port', newHttp.toString());
        localStorage.setItem('dvr_rtsp_port', newRtsp.toString());

        this.dvr.updateConfig({
            ip: newIp,
            username: newUser,
            password: newPwd,
            httpPort: newHttp,
            rtspPort: newRtsp
        });

        // Limpa o valor digitado do campo por segurança
        if (pwdInput) {
            pwdInput.value = '';
            pwdInput.placeholder = '•••••••• (Senha salva - digite para alterar)';
        }

        this.closeSettings();
        this.showToast('Configurações salvas! Reconectando...', 3000);
        this.connectDvr();
    }

    resetSettings() {
        var ipInput = document.getElementById('cfg-dvr-ip');
        var userInput = document.getElementById('cfg-dvr-user');
        var pwdInput = document.getElementById('cfg-dvr-pwd');
        var httpInput = document.getElementById('cfg-dvr-http-port');
        var rtspInput = document.getElementById('cfg-dvr-rtsp-port');

        if (ipInput) ipInput.value = '192.168.100.2';
        if (userInput) userInput.value = 'admin';

        // Por segurança, não expõe a senha nem na restauração
        if (pwdInput) {
            pwdInput.value = '';
            pwdInput.placeholder = '•••••••• (Padrão restaurado - digite para alterar)';
        }
        this.resetPasswordPending = 'jr130182';

        if (httpInput) httpInput.value = '80';
        if (rtspInput) rtspInput.value = '554';

        this.showToast('Valores padrão restaurados nos campos.', 2500);
    }

    updateSettingsFocus() {
        var elements = this.getSettingsElements();
        if (elements.length === 0) return;

        if (this.settingsFocusedIndex >= elements.length) {
            this.settingsFocusedIndex = elements.length - 1;
        } else if (this.settingsFocusedIndex < 0) {
            this.settingsFocusedIndex = 0;
        }

        elements.forEach(function(el, idx) {
            if (idx === this.settingsFocusedIndex) {
                el.classList.add('focused-setting');
                el.focus();
            } else {
                el.classList.remove('focused-setting');
            }
        }.bind(this));
    }

    navigateSettings(direction) {
        var elements = this.getSettingsElements();
        if (elements.length === 0) return;

        if (direction === 'down') {
            this.settingsFocusedIndex = (this.settingsFocusedIndex + 1) % elements.length;
        } else if (direction === 'up') {
            this.settingsFocusedIndex = (this.settingsFocusedIndex - 1 + elements.length) % elements.length;
        }

        this.updateSettingsFocus();
    }

    handleSettingsEnter() {
        var elements = this.getSettingsElements();
        var currentEl = elements[this.settingsFocusedIndex];
        if (!currentEl) return;

        if (currentEl.tagName === 'INPUT') {
            currentEl.focus();
        } else if (currentEl.tagName === 'BUTTON') {
            currentEl.click();
        }
    }

    // =========================================================================
    // Navegação e Controle Remoto
    // =========================================================================
    handleUp() {
        if (this.isSettingsOpen) {
            this.navigateSettings('up');
            return;
        }

        // Em tela cheia, seta Cima ou Esquerda troca para a câmera anterior
        if (this.isFullScreen) {
            this.prevCamera();
            return;
        }

        var visibleChannels = this.getVisibleChannels();
        var cols = this.getGridColumns();
        if (this.focusedIndex - cols >= 0) {
            this.focusedIndex -= cols;
            this.updateCardFocus();
        } else {
            // Se estiver na linha superior, sobe para o botão de Configurações
            this.isHeaderFocused = true;
            this.updateCardFocus();
        }
    }

    handleDown() {
        if (this.isSettingsOpen) {
            this.navigateSettings('down');
            return;
        }

        // Em tela cheia, seta Baixo ou Direita troca para a próxima câmera
        if (this.isFullScreen) {
            this.nextCamera();
            return;
        }

        if (this.isHeaderFocused) {
            this.isHeaderFocused = false;
            this.updateCardFocus();
            return;
        }

        var visibleChannels = this.getVisibleChannels();
        var cols = this.getGridColumns();
        if (this.focusedIndex + cols < visibleChannels.length) {
            this.focusedIndex += cols;
            this.updateCardFocus();
        }
    }

    handleLeft() {
        if (this.isSettingsOpen) return;

        // Em tela cheia, seta Esquerda vai para a câmera anterior
        if (this.isFullScreen) {
            this.prevCamera();
            return;
        }

        if (this.isHeaderFocused) return;

        var visibleChannels = this.getVisibleChannels();
        if (this.focusedIndex > 0) {
            this.focusedIndex--;
            this.updateCardFocus();
        }
    }

    handleRight() {
        if (this.isSettingsOpen) return;

        // Em tela cheia, seta Direita vai para a próxima câmera
        if (this.isFullScreen) {
            this.nextCamera();
            return;
        }

        if (this.isHeaderFocused) return;

        var visibleChannels = this.getVisibleChannels();
        if (this.focusedIndex < visibleChannels.length - 1) {
            this.focusedIndex++;
            this.updateCardFocus();
        }
    }

    handleEnter() {
        if (this.isSettingsOpen) {
            this.handleSettingsEnter();
            return;
        }

        if (this.isHeaderFocused) {
            this.openSettings();
            return;
        }

        if (this.isFullScreen) {
            this.closeFullScreen();
        } else {
            var visibleChannels = this.getVisibleChannels();
            var selected = visibleChannels[this.focusedIndex];
            if (selected) {
                this.openFullScreen(selected);
            }
        }
    }

    handleBack() {
        console.log('[App] Botão VOLTAR acionado. isSettingsOpen:', this.isSettingsOpen, 'isFullScreen:', this.isFullScreen);

        // 1. Se o Modal de Configurações estiver aberto: apenas fecha o modal e retorna para a grade
        if (this.isSettingsOpen) {
            this.closeSettings();
            return;
        }

        // 2. Se estiver em Tela Cheia (visualizando câmera individual):
        // Retorna imediatamente para a grade de 16 câmeras sem fechar o app!
        if (this.isFullScreen) {
            this.closeFullScreen();
            return;
        }

        // 3. Se estiver na Grade principal:
        // Exige 2 cliques dentro de 2.5 segundos para evitar fechar o app acidentalmente
        var now = Date.now();
        if (!this.lastBackPressTime || (now - this.lastBackPressTime > 2500)) {
            this.lastBackPressTime = now;
            this.showToast('Pressione VOLTAR novamente para sair do aplicativo', 2500);
            return;
        }

        // Se pressionou pela 2ª vez dentro de 2.5s, aí sim fecha o app na TV
        console.log('[App] Fechando o aplicativo por comando do usuário...');
        if (window.webOS && typeof window.webOS.platformBack === 'function') {
            window.webOS.platformBack();
        } else {
            window.close();
        }
    }

    handleRed() {
        if (this.isSettingsOpen) return;
        this.showToast('Reconectando ao DVR...', 2000);
        this.connectDvr();
    }

    handleGreen() {
        if (this.isSettingsOpen) return;
        if (this.isFullScreen) {
            this.closeFullScreen();
        }

        var layouts = ['4x4', '3x3', '2x2', '1x1'];
        var nextIdx = (layouts.indexOf(this.currentLayout) + 1) % layouts.length;
        this.currentLayout = layouts[nextIdx];
        localStorage.setItem('dvr_layout', this.currentLayout);

        this.showToast('Modo de Exibição: Grade ' + this.currentLayout, 2000);
        this.renderGrid();
    }

    handleYellow() {
        if (this.isSettingsOpen) return;
        this.streamQuality = (this.streamQuality === 1) ? 2 : 1;
        var qualityName = (this.streamQuality === 1) ? 'Stream Principal (HD 1080P)' : 'Sub-stream (Rápido/Fluido)';
        this.showToast('Qualidade: ' + qualityName, 2500);

        if (this.isFullScreen && this.fullScreenChannel) {
            document.getElementById('fs-cam-badge').textContent = (this.streamQuality === 1) ? 'STREAM HD 1080P' : 'SUB-STREAM FLUIDO';
            this.player.play(this.fullScreenChannel.id, this.streamQuality);
        }
    }

    handleBlue() {
        // Tecla Azul: Abre/Fecha Configurações conforme plano
        if (this.isSettingsOpen) {
            this.closeSettings();
        } else {
            this.openSettings();
        }
    }

    // =========================================================================
    // Troca Direta de Canais com Teclas Numéricas (0-9)
    // Suporta canais de 1 a 16 (ex: digitar 1 depois 2 = Canal 12)
    // =========================================================================
    showChannelIndicator(buffer) {
        var osd = document.getElementById('channel-osd');
        var numEl = document.getElementById('osd-number');
        if (!osd || !numEl) return;

        numEl.textContent = (buffer.length === 1) ? (buffer + '_') : buffer;
        osd.style.display = 'flex';
    }

    hideChannelIndicator() {
        var osd = document.getElementById('channel-osd');
        if (osd) {
            osd.style.display = 'none';
        }
    }

    handleNumber(digit) {
        if (this.isSettingsOpen) return;

        var self = this;
        if (this.channelInputTimer) {
            clearTimeout(this.channelInputTimer);
            this.channelInputTimer = null;
        }

        this.channelInputBuffer = (this.channelInputBuffer || '') + digit.toString();
        console.log('[App] Tecla numérica:', digit, 'Buffer:', this.channelInputBuffer);

        this.showChannelIndicator(this.channelInputBuffer);

        // Se digitou 2 números (ex: 01, 05, 12, 16), executa na hora sem esperar!
        if (this.channelInputBuffer.length >= 2) {
            var buf = this.channelInputBuffer;
            this.channelInputBuffer = '';
            this.executeChannelSwitch(buf);
            return;
        }

        // Se digitou apenas 1 dígito (ex: "1" ou "5"):
        // Espera 1.2 segundos para ver se o usuário vai digitar o 2º dígito (ex: para canal 11 a 16)
        this.channelInputTimer = setTimeout(function() {
            var singleBuf = self.channelInputBuffer;
            self.channelInputBuffer = '';
            self.executeChannelSwitch(singleBuf);
        }, 1200);
    }

    executeChannelSwitch(buffer) {
        var channelNum = parseInt(buffer, 10);
        this.hideChannelIndicator();

        if (isNaN(channelNum) || channelNum <= 0) {
            return;
        }

        console.log('[App] Executando troca para o Canal:', channelNum);

        // Localiza a câmera com o número informado
        var target = null;
        for (var i = 0; i < this.channels.length; i++) {
            if (this.channels[i].id === channelNum) {
                target = this.channels[i];
                break;
            }
        }

        if (target) {
            var visibleChannels = this.getVisibleChannels();
            var idx = visibleChannels.indexOf(target);
            if (idx !== -1) {
                this.focusedIndex = idx;
                this.isHeaderFocused = false;
                this.updateCardFocus();
            }
            this.openFullScreen(target);
            this.showToast('Canal ' + (channelNum < 10 ? '0' + channelNum : channelNum) + ' • ' + target.name, 2500);
        } else {
            this.showToast('Canal ' + channelNum + ' não disponível (Canais: 1 a 16)', 3000);
        }
    }

    // =========================================================================
    // Grade de Câmeras
    // =========================================================================
    getVisibleChannels() {
        if (!this.activeChannelsOnly) return this.channels;
        return this.channels.filter(function(ch) { return ch.isOnline; });
    }

    getGridColumns() {
        switch (this.currentLayout) {
            case '1x1': return 1;
            case '2x2': return 2;
            case '3x3': return 3;
            case '4x4': return 4;
            default: return 4;
        }
    }

    renderGrid() {
        var grid = document.getElementById('camera-grid');
        if (!grid) return;

        grid.className = 'camera-grid layout-' + this.currentLayout;
        grid.innerHTML = '';

        var visibleChannels = this.getVisibleChannels();
        if (visibleChannels.length === 0) {
            grid.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:20px;">Nenhuma câmera encontrada.</div>';
            return;
        }

        if (this.focusedIndex >= visibleChannels.length) {
            this.focusedIndex = visibleChannels.length - 1;
        }

        var self = this;
        visibleChannels.forEach(function(channel, index) {
            var card = document.createElement('div');
            card.className = 'camera-card' + (index === self.focusedIndex && !self.isHeaderFocused ? ' focused' : '');
            card.id = 'cam-card-' + channel.id;
            card.tabIndex = 0;

            var snapshotUrl = self.dvr.getSnapshotUrl(channel.id, 2);

            card.innerHTML = 
                '<div class="card-video-wrap">' +
                    '<img class="camera-img" src="' + snapshotUrl + '" alt="' + channel.name + '" loading="lazy" />' +
                    '<div class="camera-overlay-top">' +
                        '<span class="cam-badge-id">CH' + (channel.id < 10 ? '0' + channel.id : channel.id) + '</span>' +
                        '<span class="cam-name">' + channel.name + '</span>' +
                    '</div>' +
                    '<div class="camera-overlay-bottom">' +
                        '<span class="cam-status ' + (channel.isOnline ? 'online' : 'offline') + '">' +
                            (channel.isOnline ? 'SINAL OK' : 'SEM SINAL') +
                        '</span>' +
                        '<span class="cam-res">' + (channel.resDesc || 'D1 / 720p') + '</span>' +
                    '</div>' +
                '</div>';

            card.addEventListener('click', function() {
                self.focusedIndex = index;
                self.isHeaderFocused = false;
                self.updateCardFocus();
                self.openFullScreen(channel);
            });

            // Sincroniza o ponteiro do Magic Remote com o sistema de foco
            card.addEventListener('mouseenter', function() {
                if (!self.isFullScreen && !self.isSettingsOpen) {
                    self.focusedIndex = index;
                    self.isHeaderFocused = false;
                    self.updateCardFocus();
                }
            });

            card.addEventListener('focus', function() {
                if (!self.isFullScreen && !self.isSettingsOpen && (self.focusedIndex !== index || self.isHeaderFocused)) {
                    self.focusedIndex = index;
                    self.isHeaderFocused = false;
                    self.updateCardFocus();
                }
            });

            grid.appendChild(card);
        });

        this.updateCardFocus();
    }

    updateCardFocus() {
        var btnSettings = document.getElementById('btn-header-settings');
        if (btnSettings) {
            if (this.isHeaderFocused) {
                btnSettings.classList.add('focused');
                try { btnSettings.focus(); } catch (e) {}
            } else {
                btnSettings.classList.remove('focused');
            }
        }

        var cards = document.querySelectorAll('.camera-card');
        var self = this;
        cards.forEach(function(card, idx) {
            if (idx === self.focusedIndex && !self.isHeaderFocused) {
                card.classList.add('focused');
                try { card.focus(); } catch (e) {}
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                card.classList.remove('focused');
            }
        });
    }

    startGridRefresh() {
        if (this.gridRefreshTimer) clearInterval(this.gridRefreshTimer);
        var self = this;

        // Atualiza os snapshots da grade a cada 1.2 segundos para maior dinamismo
        this.gridRefreshTimer = setInterval(function() {
            if (self.isFullScreen || self.isSettingsOpen) return;
            var visibleChannels = self.getVisibleChannels();
            visibleChannels.forEach(function(ch) {
                var card = document.getElementById('cam-card-' + ch.id);
                if (card) {
                    var img = card.querySelector('.camera-img');
                    if (img) {
                        img.src = self.dvr.getSnapshotUrl(ch.id, 2);
                    }
                }
            });
        }, 1200);
    }

    // =========================================================================
    // Tela Cheia
    // =========================================================================
    openFullScreen(channel) {
        console.log('[App] Abrindo câmera em tela cheia:', channel.name);
        this.isFullScreen = true;
        this.fullScreenChannel = channel;

        var fsView = document.getElementById('fullscreen-view');
        if (fsView) fsView.style.display = 'block';

        var titleEl = document.getElementById('fs-cam-title');
        var badgeEl = document.getElementById('fs-cam-badge');
        if (titleEl) titleEl.textContent = channel.name + ' (Canal ' + channel.id + ')';
        if (badgeEl) badgeEl.textContent = (this.streamQuality === 1) ? 'STREAM HD 1080P' : 'SUB-STREAM FLUIDO';

        this.player.play(channel.id, this.streamQuality);
        this.showToast(channel.name + ' em Tela Cheia', 2000);
    }

    closeFullScreen() {
        if (!this.isFullScreen) return;
        console.log('[App] Fechando tela cheia, retornando para a grade...');
        this.isFullScreen = false;
        this.fullScreenChannel = null;

        var fsView = document.getElementById('fullscreen-view');
        if (fsView) fsView.style.display = 'none';

        this.player.stop();
        this.renderGrid();
        this.updateCardFocus();
    }

    nextCamera() {
        var visibleChannels = this.getVisibleChannels();
        if (visibleChannels.length === 0) return;

        this.focusedIndex = (this.focusedIndex + 1) % visibleChannels.length;
        this.updateCardFocus();

        if (this.isFullScreen) {
            this.openFullScreen(visibleChannels[this.focusedIndex]);
        }
    }

    prevCamera() {
        var visibleChannels = this.getVisibleChannels();
        if (visibleChannels.length === 0) return;

        this.focusedIndex = (this.focusedIndex - 1 + visibleChannels.length) % visibleChannels.length;
        this.updateCardFocus();

        if (this.isFullScreen) {
            this.openFullScreen(visibleChannels[this.focusedIndex]);
        }
    }

    showToast(msg, duration) {
        duration = duration || 3000;
        var toast = document.getElementById('toast-notification');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(function() {
            toast.classList.remove('show');
        }, duration);
    }
}

window.addEventListener('DOMContentLoaded', function() {
    window.app = new DvrTvApp();
});
