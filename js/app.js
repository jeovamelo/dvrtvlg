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
        this.streamQuality = 1; // 1 = HD (1080P), 2 = Fluido

        // Estado do Modal de Configurações
        this.isSettingsOpen = false;
        this.isAdvancedOpen = false;
        this.isPasswordVisible = false;
        this.settingsFocusedIndex = 0;

        this.gridRefreshTimer = null;
        this.player = null;
        this.remote = null;

        this.init();
    }

    async init() {
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

        // Alternar Senha (Exibir / Ocultar)
        var btnTogglePwd = document.getElementById('btn-toggle-pwd');
        if (btnTogglePwd) {
            btnTogglePwd.addEventListener('click', function() { self.togglePassword(); });
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
            document.getElementById('btn-toggle-pwd'),
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
        if (pwdInput) pwdInput.value = localStorage.getItem('dvr_pwd') || this.dvr.password;
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

        this.updateCardFocus();
    }

    togglePassword() {
        this.isPasswordVisible = !this.isPasswordVisible;
        var pwdInput = document.getElementById('cfg-dvr-pwd');
        var iconEl = document.getElementById('pwd-toggle-icon');
        var textEl = document.getElementById('pwd-toggle-text');

        if (pwdInput) {
            pwdInput.type = this.isPasswordVisible ? 'text' : 'password';
        }
        if (iconEl) {
            iconEl.textContent = this.isPasswordVisible ? '🙈' : '👁️';
        }
        if (textEl) {
            textEl.textContent = this.isPasswordVisible ? 'Ocultar' : 'Exibir';
        }
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
        var newPwd = (pwdInput && pwdInput.value) ? pwdInput.value : 'jr130182';
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
        if (pwdInput) pwdInput.value = 'jr130182';
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
        if (this.isFullScreen) return;

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
        if (this.isFullScreen) return;

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
        if (this.isFullScreen) return;
        if (this.isHeaderFocused) return;

        var visibleChannels = this.getVisibleChannels();
        if (this.focusedIndex > 0) {
            this.focusedIndex--;
            this.updateCardFocus();
        }
    }

    handleRight() {
        if (this.isSettingsOpen) return;
        if (this.isFullScreen) return;
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
        if (this.isSettingsOpen) {
            this.closeSettings();
            return;
        }

        if (this.isFullScreen) {
            this.closeFullScreen();
            return;
        }

        // Sair do app na Smart TV
        if (window.webOS && window.webOS.platformBack) {
            window.webOS.platformBack();
        } else if (typeof window.tizen !== 'undefined') {
            try {
                window.tizen.application.getCurrentApplication().exit();
            } catch (e) {
                console.log('Saindo do app...');
            }
        } else {
            console.log('[App] Retornar acionado na tela principal');
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

    handleNumber(num) {
        if (this.isSettingsOpen) return;
        if (num === 0) num = 10;
        var target = null;
        for (var i = 0; i < this.channels.length; i++) {
            if (this.channels[i].id === num) {
                target = this.channels[i];
                break;
            }
        }
        if (target) {
            var visibleChannels = this.getVisibleChannels();
            var idx = visibleChannels.indexOf(target);
            if (idx !== -1) {
                this.focusedIndex = idx;
                this.updateCardFocus();
            }
            this.openFullScreen(target);
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

            grid.appendChild(card);
        });
    }

    updateCardFocus() {
        var btnSettings = document.getElementById('btn-header-settings');
        if (btnSettings) {
            if (this.isHeaderFocused) {
                btnSettings.classList.add('focused');
            } else {
                btnSettings.classList.remove('focused');
            }
        }

        var cards = document.querySelectorAll('.camera-card');
        var self = this;
        cards.forEach(function(card, idx) {
            if (idx === self.focusedIndex && !self.isHeaderFocused) {
                card.classList.add('focused');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                card.classList.remove('focused');
            }
        });
    }

    startGridRefresh() {
        if (this.gridRefreshTimer) clearInterval(this.gridRefreshTimer);
        var self = this;

        // Atualiza os snapshots da grade a cada 3 segundos
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
        }, 3000);
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
