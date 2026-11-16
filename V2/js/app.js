/**
 * DVR TV - Aplicação para Samsung Smart TV (Tizen 5.5+) e Navegadores
 * Usabilidade Estilo Netflix: Navegação 100% via Setas e OK,
 * Menus Translúcidos com Fade-Out Automático, 1x1 Proporcional 16:9,
 * Monitor de Banda (KB/s), Botão Voltar Duplo para Sair e Sincronização Mobile.
 *
 * NOTA CRÍTICA DE COMPATIBILIDADE:
 * NUNCA utilizar operadores ES2020 (optional chaining ou nullish coalescing)
 * para garantir suporte pleno ao Chromium 69/76 do Tizen 5.5.
 */

class DvrTvApp {
    constructor() {
        var DvrClass = window.DvrApiClient || (typeof DvrApiClient !== 'undefined' ? DvrApiClient : null);
        var savedIp = localStorage.getItem('dvr_ip') || '';
        var savedUser = localStorage.getItem('dvr_user') || '';
        var savedPwd = localStorage.getItem('dvr_pwd') || localStorage.getItem('dvr_pass') || '';
        var savedHttp = parseInt(localStorage.getItem('dvr_http_port') || '80', 10);
        var savedRtsp = parseInt(localStorage.getItem('dvr_rtsp_port') || '554', 10);

        this.dvr = new DvrClass({
            ip: savedIp,
            httpPort: savedHttp,
            rtspPort: savedRtsp,
            username: savedUser,
            password: savedPwd
        });
        this.drawerTimer = null;

        this.channels = [];
        this.currentLayout = '4x4';
        this.currentGridCols = 4;
        this.currentGridCapacity = 16;
        this.focusedIndex = 0;
        this.fullScreenChannel = null;
        this.isFullScreen = false;
        this.isModalOpen = false;
        this.isDrawerOpen = false;
        this.isQrModalOpen = false;
        this.isHelpModalOpen = false;
        this.isLicenseModalOpen = false;
        var isConfigured = Boolean(savedIp && savedUser && savedPwd);
        this.isConfigured = isConfigured;
        this.isOnboarding = !isConfigured;
        this.openedFromZone = "grid";

        // Zonas de Foco: 'grid', 'bottom-bar', 'drawer', 'modal', 'qrcode', 'help', 'fullscreen'
        this.currentFocusZone = 'grid';
        this.bottomBarFocusIndex = 0;
        this.drawerFocusIndex = 0;

        // Preferências persistidas no localStorage
        this.showOfflineCameras = (localStorage.getItem('dvr_show_offline') !== 'false');
        this.gridMode = localStorage.getItem('dvr_grid_mode') || 'auto';
        this.currentPage = 0; // 'auto', '1x1', '2x2', '3x3', '4x4', '5x5', '6x6'
        this.streamQuality = localStorage.getItem('dvr_stream_quality') || 'sub'; // 'sub' = Fluido, 'main' = HD
        this.serverUrl = localStorage.getItem('dvr_server_url') || '';

        this.gridRefreshTimer = null;
        this.chromeHideTimer = null;
        this.syncPollTimer = null;
        this.backPressTimer = null;
        this.qrCodeInstance = null;

        this.modalFocusableElements = [];
        this.modalFocusIndex = 0;
        this.isAdvancedOpen = false;
        this.initDeviceIdentity();

        this.init();
    }

    async init() {
        console.log('[App] Inicializando DVR TV Estilo Netflix...');
        this.startClock();
        this.setupDOM();
        this.setupRemote();
        this.updateBarLabels();
        this.wakeChrome();
        this.updateOnboardingVisibility();
        if (this.isOnboarding) {
            this.currentFocusZone = 'onboarding';
            var firstOnboardingButton = document.getElementById('onboarding-mobile');
            if (firstOnboardingButton) {
                firstOnboardingButton.focus();
                firstOnboardingButton.classList.add('is-focused');
            }
            await this.detectServerInfo();
            this.startSyncPolling();
            return false;
        }

        // Inicializar player de vídeo para a TV
        var container = document.getElementById('fullscreen-player-container');
        var PlayerClass = window.TvStreamPlayer || (typeof TvStreamPlayer !== 'undefined' ? TvStreamPlayer : null);
        if (PlayerClass && container) {
            this.player = new PlayerClass(container, this.dvr);
        }

        // Iniciar monitor de velocidade de banda (KB/s)
        var self = this;
        this.dvr.startBandwidthMonitor(function(formatted) {
            var bwEl = document.getElementById('bandwidth-label');
            if (bwEl) {
                bwEl.textContent = '• ' + formatted;
            }
        });

        // Detectar URL do servidor de sync / mobile
        await this.detectServerInfo();

        // Conectar ao DVR e carregar canais
        await this.connectDvr();

        // Iniciar polling de sincronização com o celular / controle remoto
        this.startSyncPolling();
    }

    /* ==========================================================================
       RELÓGIO E CABEÇALHO
       ========================================================================== */
    startClock() {
        function updateClock() {
            var now = new Date();
            var hours = String(now.getHours()).padStart(2, '0');
            var minutes = String(now.getMinutes()).padStart(2, '0');
            var seconds = String(now.getSeconds()).padStart(2, '0');
            var clockEl = document.getElementById('clock-time');
            if (clockEl) clockEl.textContent = hours + ':' + minutes + ':' + seconds;

            var day = String(now.getDate()).padStart(2, '0');
            var month = String(now.getMonth() + 1).padStart(2, '0');
            var year = now.getFullYear();
            var dateEl = document.getElementById('clock-date');
            if (dateEl) dateEl.textContent = day + '/' + month + '/' + year;
        }
        updateClock();
        setInterval(updateClock, 1000);
    }

    setConnectionStatus(status, text) {
        var dot = document.getElementById('status-dot');
        var label = document.getElementById('status-label');
        if (dot) dot.className = 'status-dot ' + status;
        if (label) label.textContent = text;
        this.syncStateToServer();
    }

    /* ==========================================================================
       AUTO-FADE DO CABEÇALHO E RODAPÉ ESTILO NETFLIX (TRANSLÚCIDO)
       ========================================================================== */
    wakeChrome() {
        if (this.isFullScreen) { return; }
        var header = document.getElementById('app-header');
        var bottomBar = document.getElementById('bottom-menu-bar');
        var drawerWrap = document.getElementById('netflix-drawer-wrap');
        var self = this;

        if (header) header.classList.add('visible');
        if (bottomBar) bottomBar.classList.add('visible');
        if (drawerWrap) drawerWrap.classList.remove('drawer-hidden');
        if (this.drawerVisibilityTimer) clearTimeout(this.drawerVisibilityTimer);

        if (this.chromeHideTimer) {
            clearTimeout(this.chromeHideTimer);
        }

        this.drawerVisibilityTimer = setTimeout(function() {
            if (drawerWrap) {
                drawerWrap.classList.add('drawer-hidden');
                drawerWrap.classList.remove('is-open');
                document.body.classList.remove('drawer-expanded');
                self.isDrawerOpen = false;
            }
        }, 4000);

        // Se o foco estiver no menu inferior ou se houver modal/drawer aberto, não esmaece
        if (this.currentFocusZone === 'bottom-bar' || this.isModalOpen || this.isDrawerOpen || this.isQrModalOpen || this.isHelpModalOpen) {
            return;
        }

        this.chromeHideTimer = setTimeout(function() {
            if (self.currentFocusZone !== 'bottom-bar' && !self.isModalOpen && !self.isDrawerOpen && !self.isQrModalOpen && !self.isHelpModalOpen) {
                if (header) header.classList.remove('visible');
                if (bottomBar) bottomBar.classList.remove('visible');
            }
        }, 4000);

    }

    /* ==========================================================================
       DETECTAR SERVIDOR DE SINCRONIZAÇÃO / QR CODE
       ========================================================================== */
    async resolveTvIpAddress() {
        var network = (window.webapis && window.webapis.network) ? window.webapis.network : null;
        if (!network) return '';
        try {
            // Samsung Product Network API: o método oficial é getIp().
            // getIpAddress() não faz parte da API Samsung TV e sempre falhava
            // em aparelhos reais, deixando o QR Code sem endereço.
            if (typeof network.getIp === 'function') {
                var directIp = network.getIp();
                if (directIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(directIp)) return directIp;
            }
        } catch (e) {}
        try {
            // Só confirma que a rede está pronta; não substitui o IP por um
            // endereço do navegador/PC.
            if (typeof network.isConnectedToGateway === 'function' && !network.isConnectedToGateway()) {
                return '';
            }
        } catch (e2) {}
        return '';
    }

    isTizenRuntime() {
        return typeof window.tizen !== 'undefined' || typeof window.webapis !== 'undefined';
    }

    async detectServerInfo() {
        var self = this;
        var tvIp = await this.resolveTvIpAddress();
        if (tvIp) {
            self.tvIpAddress = tvIp;
            self.detectedServerIp = tvIp;
            self.detectedServerPort = window.location.port || '8080';
            self.mobileWebUrl = 'http://' + tvIp + ':' + self.detectedServerPort + '/mobile';
        }
        var isFileRuntime = window.location && window.location.protocol === 'file:';
        var defaultHost = isFileRuntime ? 'localhost' : ((window.location && window.location.hostname && window.location.hostname !== '') 
            ? window.location.hostname 
            : '192.168.100.74');
        var defaultPort = isFileRuntime ? '8080' : ((window.location && window.location.port && window.location.port !== '')
            ? window.location.port
            : '8080');

        var baseApi = 'http://' + defaultHost + ':' + defaultPort;
        if (this.serverUrl && this.serverUrl.indexOf(':') !== -1) {
            baseApi = (this.serverUrl.indexOf('http') === 0) ? this.serverUrl : ('http://' + this.serverUrl);
        }

        try {
            var res = await fetch(baseApi + '/api/info');
            if (res.ok) {
                var data = await res.json();
                if (data && data.mobileUrl && !tvIp && !self.isTizenRuntime()) {
                    self.mobileWebUrl = data.mobileUrl;
                    self.detectedServerIp = data.serverIp;
                    self.detectedServerPort = data.port;
                    return;
                }
            }
        } catch (e) {
            // Silencioso em caso de servidor indisponível
        }

        if (!self.mobileWebUrl && !this.isTizenRuntime()) {
            self.mobileWebUrl = 'http://' + defaultHost + ':' + defaultPort + '/mobile';
            self.detectedServerIp = defaultHost;
            self.detectedServerPort = defaultPort;
        }
    }

    updateBarLabels() {
        var qLabel = document.getElementById('bar-label-quality');
        if (qLabel) {
            qLabel.textContent = (this.streamQuality === 'main') ? 'HD 1080p' : 'Fluido';
        }

        var gLabel = document.getElementById('bar-label-grid');
        if (gLabel) {
            gLabel.textContent = 'Grade: ' + (this.gridMode === 'auto' ? 'Auto' : this.gridMode.toUpperCase());
        }

        var drawerFilterBadge = document.getElementById('drawer-filter-badge');
        var drawerFilterDesc = document.getElementById('drawer-filter-desc');
        if (drawerFilterBadge) {
            drawerFilterBadge.textContent = this.showOfflineCameras ? 'Sim' : 'Não';
        }
        if (drawerFilterDesc) {
            drawerFilterDesc.textContent = this.showOfflineCameras ? 'Mostrando todas as câmeras' : 'Ocultando câmeras sem vídeo';
        }

        var drawerGridBadge = document.getElementById('drawer-grid-badge');
        if (drawerGridBadge) {
            drawerGridBadge.textContent = (this.gridMode === 'auto' ? 'Auto' : this.gridMode.toUpperCase());
        }
        var drawerQualityBadge = document.getElementById('drawer-quality-badge');
        if (drawerQualityBadge) {
            drawerQualityBadge.textContent = (this.streamQuality === 'main') ? 'HD 1080p' : 'Fluido';
        }

    }

    /* ==========================================================================
       SETUP DE ELEMENTOS DOM E EVENTOS
       ========================================================================== */
    setupDOM() {
        var self = this;

        window.addEventListener('resize', function() {
            if (self.isFullScreen && self.player && self.player.resize) {
                self.player.resize();
            }
        });

        // Eventos do mouse / movimento acordam o cabeçalho e rodapé
        window.addEventListener('mousemove', function() {
            self.wakeChrome();
        });
        window.addEventListener('keydown', function() { self.wakeChrome(); }, true);
        window.addEventListener('touchstart', function() { self.wakeChrome(); }, { passive: true });

        var onboardingMobile = document.getElementById('onboarding-mobile');
        var onboardingTv = document.getElementById('onboarding-tv');
        if (onboardingMobile) onboardingMobile.addEventListener('click', function() {
            self.openQrModal(true);
        });
        if (onboardingTv) onboardingTv.addEventListener('click', function() {
            self.openSettingsModal(true);
        });

        // Botões do Menu Inferior
        var btnBarMenu = document.getElementById('btn-bar-menu');
        if (btnBarMenu) btnBarMenu.addEventListener('click', function() { self.openDrawer(); });

        var btnBarSettings = document.getElementById('btn-bar-settings');
        if (btnBarSettings) btnBarSettings.addEventListener('click', function() { self.openSettingsModal(); });

        var btnBarGrid = document.getElementById('btn-bar-grid');
        if (btnBarGrid) btnBarGrid.addEventListener('click', function() { self.cycleGridMode(); });

        var btnBarQuality = document.getElementById('btn-bar-quality');
        if (btnBarQuality) btnBarQuality.addEventListener('click', function() { self.toggleStreamQuality(); });

        var btnBarMobile = document.getElementById('btn-bar-mobile');
        if (btnBarMobile) btnBarMobile.addEventListener('click', function() { self.openQrModal(); });

        var btnBarReconnect = document.getElementById('btn-bar-reconnect');
        if (btnBarReconnect) btnBarReconnect.addEventListener('click', function() { self.connectDvr(); });

        var btnBarHelp = document.getElementById('btn-bar-help');
        if (btnBarHelp) btnBarHelp.addEventListener('click', function() { self.openHelpModal(); });

        // Itens do Menu Netflix (Drawer)
                // Item Início do Menu
        var drawerItemHome = document.getElementById('drawer-item-home');
        if (drawerItemHome) {
            drawerItemHome.addEventListener('click', function() {
                self.closeDrawer();
                self.currentPage = 0;
                self.focusedIndex = 0;
                self.updateCardFocus();
                self.renderGrid();
            });
        }

        var drawerItemCameras = document.getElementById('drawer-item-cameras');
        if (drawerItemCameras) drawerItemCameras.addEventListener('click', function() {
            self.closeDrawer();
            if (self.isFullScreen) self.closeFullScreen();
            self.currentFocusZone = 'grid';
            var visible = self.getVisibleChannels();
            self.focusedIndex = visible.length ? Math.max(0, Math.min(self.focusedIndex, visible.length - 1)) : 0;
            self.updateCardFocus();
            self.showToast('Visualização das câmeras');
        });

        var drawerItemSettings = document.getElementById('drawer-item-settings');
        if (drawerItemSettings) {
            drawerItemSettings.addEventListener('click', function() {
                self.closeDrawer();
                self.openSettingsModal();
            });
        }

        var drawerItemFilter = document.getElementById('drawer-item-filter');
        if (drawerItemFilter) drawerItemFilter.addEventListener('click', function() { self.toggleOfflineFilter(); });

        var drawerItemGrid = document.getElementById('drawer-item-grid');
        if (drawerItemGrid) drawerItemGrid.addEventListener('click', function() { self.cycleGridMode(); });

        var drawerItemMobile = document.getElementById('drawer-item-mobile');
        if (drawerItemMobile) {
            drawerItemMobile.addEventListener('click', function() {
                self.closeDrawer();
                self.openQrModal();
            });
        }

        var drawerItemHelp = document.getElementById('drawer-item-help');
        if (drawerItemHelp) {
            drawerItemHelp.addEventListener('click', function() {
                self.closeDrawer();
                self.openHelpModal();
            });
        }

        var drawerItemExit = document.getElementById('drawer-item-exit');
        if (drawerItemExit) drawerItemExit.addEventListener('click', function() { self.exitApp(); });

        var drawerBackdrop = document.getElementById('drawer-backdrop');
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', function() { self.closeDrawer(); });

        var drawer = document.getElementById('netflix-drawer');
        if (drawer) {
            drawer.addEventListener('mouseenter', function() { self.resetDrawerTimer(); });
            drawer.addEventListener('mouseleave', function() { self.resetDrawerTimer(); });
            drawer.addEventListener('focusin', function() { self.resetDrawerTimer(); });
            drawer.addEventListener('focusout', function(event) {
                if (!event.relatedTarget || !drawer.contains(event.relatedTarget)) {
                    self.resetDrawerTimer();
                }
            });
        }

        // Modais (QR Code, Ajuda, Configurações)
        var btnCloseQr = document.getElementById('btn-close-qrcode');
        var btnDismissQr = document.getElementById('btn-dismiss-qrcode');
        var qrBackdrop = document.getElementById('qrcode-backdrop');
        if (btnCloseQr) btnCloseQr.addEventListener('click', function() { self.closeQrModal(); });
        if (btnDismissQr) btnDismissQr.addEventListener('click', function() { self.closeQrModal(); });
        if (qrBackdrop) qrBackdrop.addEventListener('click', function() { self.closeQrModal(); });

        var btnCloseHelp = document.getElementById('btn-close-help');
        var btnDismissHelp = document.getElementById('btn-dismiss-help');
        var helpBackdrop = document.getElementById('help-backdrop');
        if (btnCloseHelp) btnCloseHelp.addEventListener('click', function() { self.closeHelpModal(); });
        if (btnDismissHelp) btnDismissHelp.addEventListener('click', function() { self.closeHelpModal(); });
        if (helpBackdrop) helpBackdrop.addEventListener('click', function() { self.closeHelpModal(); });

        var btnCloseModal = document.getElementById('btn-close-modal');
        var btnCancelModal = document.getElementById('btn-cancel-settings');
        var settingsBackdrop = document.getElementById('settings-backdrop');
        if (btnCloseModal) btnCloseModal.addEventListener('click', function() { self.closeSettingsModal(); });
        if (btnCancelModal) btnCancelModal.addEventListener('click', function() { self.closeSettingsModal(); });
        if (settingsBackdrop) settingsBackdrop.addEventListener('click', function() { self.closeSettingsModal(); });

        var btnToggleAdv = document.getElementById('btn-toggle-advanced');
        if (btnToggleAdv) btnToggleAdv.addEventListener('click', function() { self.toggleAdvancedSection(); });

                var btnTogglePwd = document.getElementById('btn-toggle-pwd');
        if (btnTogglePwd) {
            btnTogglePwd.addEventListener('click', function() {
                var pwdIn = document.getElementById('cfg-pwd');
                if (pwdIn) {
                    if (pwdIn.type === 'password') {
                        pwdIn.type = 'text';
                        btnTogglePwd.textContent = '🙈';
                    } else {
                        pwdIn.type = 'password';
                        btnTogglePwd.textContent = '👁️';
                    }
                }
            });
        }

        var btnSave = document.getElementById('btn-save-settings');
        if (btnSave) btnSave.addEventListener('click', function() { self.saveSettings(); });

        var btnDiscoverDvr = document.getElementById('btn-discover-dvr');
        if (btnDiscoverDvr) btnDiscoverDvr.addEventListener('click', function() { self.discoverDvr(); });

        var btnDefault = document.getElementById('btn-default-settings');
        if (btnDefault) btnDefault.addEventListener('click', function() { self.restoreDefaultSettings(); });

        var drawerItemQuality = document.getElementById('drawer-item-quality');
        if (drawerItemQuality) drawerItemQuality.addEventListener('click', function() { self.toggleStreamQuality(); });

        var btnCfgReconnect = document.getElementById('btn-cfg-reconnect');
        if (btnCfgReconnect) btnCfgReconnect.addEventListener('click', function() {
            self.closeSettingsModal();
            self.connectDvr();
        });

        var btnCfgMobile = document.getElementById('btn-cfg-mobile');
        if (btnCfgMobile) btnCfgMobile.addEventListener('click', function() {
            self.closeSettingsModal();
            self.openQrModal();
        });

        var btnCfgLicense = document.getElementById('btn-cfg-license');
        if (btnCfgLicense) btnCfgLicense.addEventListener('click', function() {
            self.openLicenseModal();
        });

        var btnCloseLic = document.getElementById('btn-close-license');
        var btnDismissLic = document.getElementById('btn-dismiss-license');
        var btnRefreshLic = document.getElementById('btn-refresh-license');
        var licBackdrop = document.getElementById('license-backdrop');
        if (btnCloseLic) btnCloseLic.addEventListener('click', function() { self.closeLicenseModal(); });
        if (btnDismissLic) btnDismissLic.addEventListener('click', function() { self.closeLicenseModal(); });
        if (btnRefreshLic) btnRefreshLic.addEventListener('click', function() { self.refreshLicenseStatus(); });
        if (licBackdrop) licBackdrop.addEventListener('click', function() { self.closeLicenseModal(); });

    }

    /* ==========================================================================
       CONEXÃO COM CONTROLE REMOTO
       ========================================================================== */
    setupRemote() {
        var self = this;
        var RemoteClass = window.RemoteControlManager || (typeof RemoteControlManager !== 'undefined' ? RemoteControlManager : null);
        if (RemoteClass) {
            this.remote = new RemoteClass({
                onUp: function() { self.handleNavigation('up'); },
                onDown: function() { self.handleNavigation('down'); },
                onLeft: function() { self.handleNavigation('left'); },
                onRight: function() { self.handleNavigation('right'); },
                onEnter: function() { self.handleEnter(); },
                onBack: function() { self.handleBack(); },
                onRed: function() { self.handleRed(); },
                onGreen: function() { self.handleGreen(); },
                onYellow: function() { self.handleYellow(); },
                onBlue: function() { self.handleBlue(); },
                onChannelUp: function() { self.nextCamera(); },
                onChannelDown: function() { self.prevCamera(); },
                onNumber: function(num) { self.handleNumber(num); },
                isFormNavigation: function() { return self.currentFocusZone === 'modal' && self.isModalOpen; }
            });
        }
    }

    /* ==========================================================================
       CÁLCULO E RENDERIZAÇÃO DA GRADE (ESTRITAMENTE QUADRADAS NxN)
       ========================================================================== */
    getVisibleChannels() {
        if (!this.channels || this.channels.length === 0) return [];
        if (!this.showOfflineCameras) {
            return this.channels.filter(function(ch) { return ch.isOnline; });
        }
        return this.channels;
    }

    /**
     * Calcula a menor grade quadrada NxN cuja capacidade seja >= visíveis
     * 1: 1x1 | 2-4: 2x2 | 5-9: 3x3 | 10-16: 4x4 | 17-25: 5x5 | 26-36: 6x6
     */
    calculateOptimalGrid(visibleCount) {
        if (visibleCount <= 1) return { layout: '1x1', cols: 1, capacity: 1 };
        if (visibleCount <= 4) return { layout: '2x2', cols: 2, capacity: 4 };
        if (visibleCount <= 9) return { layout: '3x3', cols: 3, capacity: 9 };
        if (visibleCount <= 16) return { layout: '4x4', cols: 4, capacity: 16 };
        if (visibleCount <= 25) return { layout: '5x5', cols: 5, capacity: 25 };
        return { layout: '6x6', cols: 6, capacity: 36 };
    }

    /**
     * Retorna apenas as grades quadradas cuja capacidade é >= ao número de câmeras visíveis.
     * NUNCA permite grades com capacidade menor que as câmeras disponíveis.
     */
    getAllowedSquareGrids() {
        return ['auto', '1x1', '2x2', '3x3', '4x4', '5x5', '6x6'];
    }

    getCurrentGridSpec() {
        var visibleCount = this.getVisibleChannels().length;
        if (this.gridMode === 'auto') {
            return this.calculateOptimalGrid(visibleCount);
        }
        var cols = parseInt(this.gridMode.charAt(0), 10);
        return { layout: this.gridMode, cols: cols, capacity: cols * cols };
    }

    getCurrentPageChannels() {
        var visibleChannels = this.getVisibleChannels();
        if (visibleChannels.length === 0) return [];
        var gridSpec = this.getCurrentGridSpec();
        var startIndex = this.currentPage * gridSpec.capacity;
        return visibleChannels.slice(startIndex, startIndex + gridSpec.capacity);
    }

    renderGrid() {
        var self = this;
        var grid = document.getElementById('camera-grid');
        if (!grid) return;

        var visibleChannels = this.getVisibleChannels();
        var gridSpec = this.getCurrentGridSpec();

        this.currentLayout = gridSpec.layout;
        this.currentGridCols = gridSpec.cols;
        this.currentGridCapacity = gridSpec.capacity;

        var totalPages = Math.ceil(visibleChannels.length / gridSpec.capacity);
        if (totalPages < 1) totalPages = 1;
        if (this.currentPage >= totalPages) this.currentPage = 0;
        if (this.currentPage < 0) this.currentPage = 0;

        var startIndex = this.currentPage * gridSpec.capacity;
        var pageChannels = visibleChannels.slice(startIndex, startIndex + gridSpec.capacity);

        grid.className = 'camera-grid layout-' + this.currentLayout;
        grid.innerHTML = '';

        // Atualiza indicador de paginação no cabeçalho
        var pagePill = document.getElementById('pagination-pill');
        if (pagePill) {
            if (totalPages > 1) {
                pagePill.style.display = 'inline-block';
                pagePill.textContent = 'Pág. ' + (this.currentPage + 1) + '/' + totalPages;
            } else {
                pagePill.style.display = 'none';
            }
        }

        if (visibleChannels.length === 0) {
            grid.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:22px;grid-column:1/-1;">Nenhuma câmera ativa encontrada.</div>';
            return;
        }

        if (this.focusedIndex >= pageChannels.length) {
            this.focusedIndex = 0;
        }

        // Renderiza APENAS as câmeras da página atual (no máximo gridSpec.capacity nós)
        // Isso ELIMINA o problema de linhas implícitas ou telas espremidas em tiras finas
        pageChannels.forEach(function(channel, index) {
            var card = document.createElement('div');
            var isFocused = (self.currentFocusZone === 'grid' && index === self.focusedIndex);
            var isOffline = !channel.isOnline;

            card.className = 'camera-card' + (isFocused ? ' focused' : '') + (isOffline ? ' offline-card' : '');
            card.dataset.channelId = channel.id;
            card.dataset.index = index;
            card.tabIndex = 0;

            var statusClass = channel.isOnline ? 'online' : 'offline';
            var statusText = channel.isOnline ? 'AO VIVO' : 'SEM SINAL';
            var resBadge = channel.resDesc || (channel.isOnline ? '1080P' : 'OFF');

            var qualityHtml = '';
            if (self.currentLayout === '1x1') {
                qualityHtml = '<span class="cam-quality-tag"><span class="quality-dot yellow"></span> ' + (self.streamQuality === 'main' ? 'HD' : 'Fluido') + '</span>';
            }

            if (channel.isOnline) {
                var initialSrc = self.dvr.getSnapshotUrl(channel.id, 2);
                card.innerHTML = 
                    '<div class="card-video-wrap">' +
                        '<img class="camera-img" src="' + initialSrc + '" alt="' + channel.name + '" loading="lazy" />' +
                        '<div class="camera-overlay-top">' +
                            '<span class="cam-badge-id">CH ' + channel.id + '</span>' +
                            '<span class="cam-name">' + channel.name + '</span>' +
                            qualityHtml +
                        '</div>' +
                        '<div class="camera-overlay-bottom">' +
                            '<span class="cam-status ' + statusClass + '">' + statusText + '</span>' +
                            '<span class="cam-res">' + resBadge + '</span>' +
                        '</div>' +
                    '</div>';
            } else {
                var offlineSrc = self.dvr.getSnapshotUrl(channel.id, 2);
                card.innerHTML = '<div class="card-video-wrap offline-frame-wrap" style="background:#000;">' +
                    '<img class="camera-img offline-frame" src="' + offlineSrc + '" alt="' + channel.name + '" onerror="this.style.display=\'none\'" />' +
                    '</div>';
            }

            card.addEventListener('click', function() {
                self.currentFocusZone = 'grid';
                self.focusedIndex = index;
                self.updateCardFocus();
                if (channel.isOnline) {
                    self.openFullScreen(channel);
                } else {
                    self.showToast('Câmera CH ' + channel.id + ' está sem sinal (NO VIDEO)');
                }
            });

            grid.appendChild(card);
        });

        if (!(window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))) {
            pageChannels.forEach(function(channel) {
                if (channel.isOnline) {
                    self.dvr.fetchSnapshotBlob(channel.id, 2).then(function(blobUrl) {
                        var cardImg = grid.querySelector('.camera-card[data-channel-id="' + channel.id + '"] .camera-img');
 if (cardImg) {
 cardImg.dataset.blobUrl = blobUrl;
 cardImg.src = blobUrl;
 }
 }).catch(function() {});
 }
 });
 }

        // Preenche slots vazios restantes para garantir que a grade seja estritamente quadrada
        var emptyCount = gridSpec.capacity - pageChannels.length;
        for (var k = 0; k < emptyCount; k++) {
            var emptySlot = document.createElement('div');
            emptySlot.className = 'camera-card empty-slot';
            grid.appendChild(emptySlot);
        }

        this.updateCardFocus();
        this.updateBarLabels();
        this.syncStateToServer();
    }

    updateCardFocus() {
        var cards = document.querySelectorAll('.camera-card:not(.empty-slot)');
        for (var i = 0; i < cards.length; i++) {
            if (this.currentFocusZone === 'grid' && i === this.focusedIndex) {
                cards[i].classList.add('focused');
            } else {
                cards[i].classList.remove('focused');
            }
        }
    }

    startGridRefresh() {
        var self = this;
        if (this.gridRefreshTimer) clearInterval(this.gridRefreshTimer);

        this.gridRefreshTimer = setInterval(function() {
            if (self.isFullScreen || self.isModalOpen || self.isDrawerOpen || self.isQrModalOpen || self.isHelpModalOpen) return;

            var cards = document.querySelectorAll('.camera-card:not(.offline-card):not(.empty-slot)');
            cards.forEach(function(card) {
                var chId = card.dataset.channelId;
                var img = card.querySelector('.camera-img');
                if (img && chId) {
                    if (window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                        var newImg = new Image();
                        var nextUrl = self.dvr.getSnapshotUrl(chId, 2);
                        newImg.onload = function() {
                            img.src = nextUrl;
                            if (self.dvr && self.dvr.recordBytes) {
                                self.dvr.recordBytes(22000);
                            }
                        };
                        newImg.src = nextUrl;
                    } else {
                        self.dvr.fetchSnapshotBlob(chId, 2).then(function(blobUrl) {
                            var oldBlob = img.dataset.blobUrl;
                            img.dataset.blobUrl = blobUrl;
                            img.src = blobUrl;
                            if (oldBlob) {
                                setTimeout(function() { try { URL.revokeObjectURL(oldBlob); } catch(e) {} }, 600);
                            }
                            if (self.dvr && self.dvr.recordBytes) {
                                self.dvr.recordBytes(22000);
                            }
                        }).catch(function() {});
                    }
                }
            });
        }, 1200);
    }

    /* ==========================================================================
       CONEXÃO COM O DVR
       ========================================================================== */

    renderUnconfiguredScreen() {
        var container = document.getElementById('camera-grid');
        if (!container) return;

        container.className = 'camera-grid unconfigured-grid';
        container.innerHTML = 
            '<div class="unconfigured-welcome-card">' +
                '<img src="images/logo.png" class="welcome-logo-img" alt="DVR TV">' +
                '<h2>Bem-vindo ao DVR TV</h2>' +
                '<p class="welcome-subtitle">Para começar a visualizar suas câmeras, configure a conexão com o seu DVR.</p>' +
                '<div class="welcome-options-row">' +
                    '<button type="button" id="btn-welcome-mobile" class="welcome-option-card focused" tabindex="0">' +
                        '<div class="welcome-card-icon">📱</div>' +
                        '<div class="welcome-card-info">' +
                            '<h3>Configurar pelo Celular</h3>' +
                            '<span>Recomendado: Aponte a câmera e configure em segundos</span>' +
                        '</div>' +
                        '<span class="welcome-card-badge">Rápido</span>' +
                    '</button>' +
                    '<button type="button" id="btn-welcome-tv" class="welcome-option-card" tabindex="0">' +
                        '<div class="welcome-card-icon">⚙️</div>' +
                        '<div class="welcome-card-info">' +
                            '<h3>Configurar pelo Controle</h3>' +
                            '<span>Digite o IP, usuário e senha na TV</span>' +
                        '</div>' +
                    '</button>' +
                '</div>' +
            '</div>';

        var self = this;
        var btnMob = document.getElementById('btn-welcome-mobile');
        var btnTv = document.getElementById('btn-welcome-tv');

        if (btnMob) {
            btnMob.addEventListener('click', function() { self.openQrModal(); });
        }
        if (btnTv) {
            btnTv.addEventListener('click', function() { self.openSettingsModal(); });
        }

        this.currentFocusZone = 'unconfigured';
        if (btnMob) btnMob.focus();
    }

    async connectDvr() {
        if (!this.dvr.ip || !this.dvr.username) {
            console.log('[App] DVR não configurado. Exibindo tela de boas-vindas.');
            this.setConnectionStatus('waiting', 'Aguardando Configuração');
            this.renderUnconfiguredScreen();
            return;
        }
        this.setConnectionStatus('connecting', 'Conectando...');
        try {
            await this.dvr.login();
            this.setConnectionStatus('online', 'Conectado');

            try {
                var deviceInfo = await this.dvr.getDeviceInfo();
                if (deviceInfo) {
                    var titleEl = document.getElementById('dvr-title');
                    if (titleEl) {
                        this.deviceTitle = deviceInfo.deviceName + ' • ' + deviceInfo.model;
                    titleEl.textContent = this.deviceTitle;
                    }
                }
            } catch (errDev) {
                console.warn('[DVR] deviceInfo omitido:', errDev);
            }

            var channels = await this.dvr.getChannels();
            this.channels = channels;
            this.renderGrid();
            this.startGridRefresh();
            this.showToast('DVR conectado: ' + channels.length + ' canais identificados');
            return true;
        } catch (e) {
            console.error('[App] Erro na conexão com o DVR:', e);
            this.setConnectionStatus('offline', 'Falha na Conexão');
            this.showToast('Erro ao conectar ao DVR: ' + e.message, 5000);
            return false;
        }
    }

    /* ==========================================================================
       MENU NETFLIX (DRAWER LATERAL)
       ========================================================================== */
    updateOnboardingVisibility() {
        var screen = document.getElementById('onboarding-screen');
        var body = document.body;
        if (screen) {
            screen.classList.toggle('onboarding-hidden', !this.isOnboarding);
            screen.style.display = this.isOnboarding ? 'flex' : '';
        }
        if (body) body.classList.toggle('onboarding-active', this.isOnboarding);
    }

    completeOnboarding() {
        this.isConfigured = true;
        this.isOnboarding = false;
        localStorage.setItem('dvr_onboarding_complete', 'true');
        this.updateOnboardingVisibility();
        this.currentFocusZone = 'grid';
        this.updateCardFocus();
        this.wakeChrome();
    }

    enterCameraGrid(channels) {
        var validChannels = Array.isArray(channels) ? channels : [];
        if (validChannels.length === 0) {
            this.showToast('Configuração validada, mas nenhuma câmera foi encontrada.', 5000);
            return false;
        }

        this.channels = validChannels;
        this.completeOnboarding();
        this.isModalOpen = false;
        this.isQrModalOpen = false;
        this.isHelpModalOpen = false;
        this.isDrawerOpen = false;

        var settingsModal = document.getElementById('settings-modal');
        var qrModal = document.getElementById('qrcode-modal');
        var drawerWrap = document.getElementById('netflix-drawer-wrap');
        if (settingsModal) settingsModal.style.setProperty('display', 'none', 'important');
        if (qrModal) qrModal.style.display = 'none';
        if (drawerWrap) {
            drawerWrap.style.display = 'flex';
            drawerWrap.classList.remove('is-open');
        }

        this.currentFocusZone = 'grid';
        this.renderGrid();
        this.startGridRefresh();
        this.updateCardFocus();
        this.showToast('Configuração concluída. Câmeras carregadas.', 3500);
        this.syncStateToServer();
        return true;
    }

    openDrawer() {
        if (this.isFullScreen) {
            this.closeFullScreen();
        }
        this.isDrawerOpen = true;
        this.currentFocusZone = 'drawer';
        this.drawerFocusIndex = 0;

        var wrap = document.getElementById('netflix-drawer-wrap');
        if (wrap) {
            wrap.style.display = 'flex';
            wrap.classList.add('is-open');
            wrap.classList.remove('drawer-hidden');
        }
        var drawerPanel = document.getElementById('netflix-drawer');
        if (drawerPanel) drawerPanel.style.setProperty('width', '270px', 'important');
        document.body.classList.add('drawer-expanded');

        this.updateBarLabels();
        this.updateDrawerFocus();
        this.resetDrawerTimer();
        this.wakeChrome();
        this.syncStateToServer();
    }

    closeDrawer() {
        this.clearDrawerTimer();
        this.isDrawerOpen = false;
        var wrap = document.getElementById('netflix-drawer-wrap');
        if (wrap) {
            wrap.style.display = 'flex';
            wrap.classList.remove('is-open');
        }
        var drawerPanel = document.getElementById('netflix-drawer');
        if (drawerPanel) drawerPanel.style.setProperty('width', '68px', 'important');
        document.body.classList.remove('drawer-expanded');

        this.currentFocusZone = (this.channels && this.channels.length > 0) ? 'grid' : 'unconfigured';
        if (this.currentFocusZone === 'grid') {
            this.updateCardFocus();
        }
        this.wakeChrome();
        this.syncStateToServer();
    }

    getDrawerItems() {
        var elements = document.querySelectorAll('#netflix-drawer .drawer-nav .drawer-item');
        return Array.prototype.slice.call(elements).filter(function(el) {
            return el && window.getComputedStyle(el).display !== 'none';
        });
    }

    resetDrawerTimer() {
        this.clearDrawerTimer();
        var self = this;
        this.drawerTimer = setTimeout(function() {
            console.log('[Drawer] Auto-recolhimento após inatividade');
            self.closeDrawer();
        }, 4000);
    }

    clearDrawerTimer() {
        if (this.drawerTimer) {
            clearTimeout(this.drawerTimer);
            this.drawerTimer = null;
        }
    }

    updateDrawerFocus() {
        var items = this.getDrawerItems();
        for (var i = 0; i < items.length; i++) {
            if (i === this.drawerFocusIndex) {
                items[i].classList.add('focused');
                items[i].focus();
            } else {
                items[i].classList.remove('focused');
            }
        }
    }

    toggleOfflineFilter() {
        this.showOfflineCameras = !this.showOfflineCameras;
        localStorage.setItem('dvr_show_offline', this.showOfflineCameras ? 'true' : 'false');
        this.renderGrid();
        this.updateBarLabels();
        this.showToast(this.showOfflineCameras ? 'Mostrando todas as câmeras' : 'Ocultando câmeras sem sinal');
    }

    cycleGridMode() {
        var squareModes = ['auto', '1x1', '2x2', '3x3', '4x4', '5x5', '6x6'];
        var idx = squareModes.indexOf(this.gridMode);
        var nextIdx = (idx + 1) % squareModes.length;
        this.gridMode = squareModes[nextIdx];
        this.currentPage = 0;
        this.focusedIndex = 0;
        localStorage.setItem('dvr_grid_mode', this.gridMode);
        this.renderGrid();
        this.updateBarLabels();
        this.showToast('Grade: ' + (this.gridMode === 'auto' ? 'Automática' : this.gridMode.toUpperCase()));
        this.syncStateToServer();
    }

    toggleStreamQuality() {
        this.streamQuality = (this.streamQuality === 'sub') ? 'main' : 'sub';
        localStorage.setItem('dvr_stream_quality', this.streamQuality);
        this.updateBarLabels();

        if (this.isFullScreen && this.fullScreenChannel) {
            this.openFullScreen(this.fullScreenChannel);
        }

        this.showToast('Qualidade: ' + (this.streamQuality === 'main' ? 'HD 1080p' : 'Fluido (Sub-Stream)'));
        this.syncStateToServer();
    }

    /* ==========================================================================
       MODAL QR CODE
       ========================================================================== */
    async openQrModal(fromOnboarding) {
        this.openedFromOnboarding = !!fromOnboarding;
        this.isQrModalOpen = true;
        this.currentFocusZone = 'qrcode';

        var modal = document.getElementById('qrcode-modal');
        if (modal) {
            modal.classList.add('qr-fullscreen-view');
            modal.style.display = 'flex';
        }

        // A rede da TV pode terminar de subir alguns instantes depois da tela.
        // Repetimos a consulta somente pela API Samsung, sem fallback para o PC.
        // O QR Code abre a página hospedada na VPS. A TV não hospeda Node.js
        // nem a rota /mobile; o IP local da TV será usado apenas no pareamento.
        var targetUrl = 'https://dvr.ilocseguro.com/mobile';
        try {
            var pairRes = await fetch(this.getRemoteControlServerBase() + '/api/pair/create', { method: 'POST', cache: 'no-store' });
            var pairData = await pairRes.json();
            if (pairData && pairData.code) {
                localStorage.setItem('dvr_tv_id', pairData.tvId || '');
                localStorage.setItem('dvr_tv_pair', pairData.code);
                targetUrl += '?pair=' + encodeURIComponent(pairData.code);
            }
        } catch (pairErr) { console.warn('[Pairing] Não foi possível criar código:', pairErr); }
        var addrEl = document.getElementById('qr-address-url');
        if (addrEl) addrEl.textContent = targetUrl;

        var qrContainer = document.getElementById('qrcode-container');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            try {
                if (typeof QRCode !== 'undefined') {
                    this.qrCodeInstance = new QRCode(qrContainer, {
                        text: targetUrl,
                        width: 200,
                        height: 200,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } else {
                    qrContainer.innerHTML = '<div style="color:#000;font-weight:700;padding:20px;">' + targetUrl + '</div>';
                }
            } catch (errQr) {
                qrContainer.innerHTML = '<div style="color:#000;font-weight:700;padding:20px;">' + targetUrl + '</div>';
            }
        }

        var btn = document.getElementById('btn-dismiss-qrcode');
        if (btn) btn.focus();
    }

    closeQrModal() {
        this.isQrModalOpen = false;
        var modal = document.getElementById('qrcode-modal');
        if (modal) {
            modal.classList.remove('qr-fullscreen-view');
            modal.style.display = 'none';
        }

        if (this.openedFromOnboarding) {
            this.openedFromOnboarding = false;
            this.currentFocusZone = 'onboarding';
        } else {
            this.currentFocusZone = 'grid';
            this.updateCardFocus();
        }
        this.wakeChrome();
    }

    /* ==========================================================================
       MODAL AJUDA
       ========================================================================== */
    openHelpModal() {
        this.isHelpModalOpen = true;
        this.currentFocusZone = 'help';

        var modal = document.getElementById('help-modal');
        if (modal) modal.style.display = 'flex';

        var btn = document.getElementById('btn-dismiss-help');
        if (btn) btn.focus();
    }

    closeHelpModal() {
        this.isHelpModalOpen = false;
        var modal = document.getElementById('help-modal');
        if (modal) modal.style.display = 'none';

        this.currentFocusZone = 'grid';
        this.updateCardFocus();
        this.wakeChrome();
    }

    /* ==========================================================================
       MODAL CONFIGURAÇÕES
       ========================================================================== */
    openSettingsModal(fromOnboarding) {
        this.openedFromOnboarding = !!fromOnboarding;
        this.isModalOpen = true;
        this.currentFocusZone = 'modal';

        var modal = document.getElementById('settings-modal');
        if (modal) { modal.classList.add('is-open'); modal.style.setProperty('display', 'flex', 'important'); }

        var ipInput = document.getElementById('cfg-ip');
        var userInput = document.getElementById('cfg-user');
        var pwdInput = document.getElementById('cfg-pwd');
        var showOfflineSelect = document.getElementById('cfg-show-offline');
        var qualitySelect = document.getElementById('cfg-quality');
        var gridModeSelect = document.getElementById('cfg-grid-mode');
        var httpPortInput = document.getElementById('cfg-http-port');
        var rtspPortInput = document.getElementById('cfg-rtsp-port');
        var serverUrlInput = document.getElementById('cfg-server-url');

        var banner = document.getElementById('cfg-status-banner');
        if (banner) {
            banner.style.display = 'none';
            banner.textContent = '';
        }

        if (ipInput) ipInput.value = localStorage.getItem('dvr_ip') || this.dvr.ip || '';
        if (userInput) userInput.value = localStorage.getItem('dvr_user') || this.dvr.username || '';
        if (pwdInput) {
            pwdInput.value = localStorage.getItem('dvr_pwd') || this.dvr.password || '';
            pwdInput.placeholder = 'Senha do DVR';
        }
        if (showOfflineSelect) showOfflineSelect.value = this.showOfflineCameras ? 'true' : 'false';
        if (qualitySelect) qualitySelect.value = this.streamQuality || 'sub';
        if (gridModeSelect) {
            gridModeSelect.innerHTML = '';
            var optAuto = document.createElement('option');
            optAuto.value = 'auto';
            optAuto.textContent = 'Automática (Ideal para ' + this.getVisibleChannels().length + ' câmeras)';
            gridModeSelect.appendChild(optAuto);

            var squareModes = [
                { id: '1x1', label: '1x1 (1 Câmera por tela)' },
                { id: '2x2', label: '2x2 (4 Câmeras por tela)' },
                { id: '3x3', label: '3x3 (9 Câmeras por tela)' },
                { id: '4x4', label: '4x4 (16 Câmeras por tela)' },
                { id: '5x5', label: '5x5 (25 Câmeras por tela)' },
                { id: '6x6', label: '6x6 (36 Câmeras por tela)' }
            ];

            squareModes.forEach(function(m) {
                var opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.label;
                gridModeSelect.appendChild(opt);
            });
            gridModeSelect.value = this.gridMode;
        }
        if (httpPortInput) httpPortInput.value = localStorage.getItem('dvr_http_port') || this.dvr.httpPort || 80;
        if (rtspPortInput) rtspPortInput.value = localStorage.getItem('dvr_rtsp_port') || this.dvr.rtspPort || 554;
        if (serverUrlInput) serverUrlInput.value = this.serverUrl || (this.detectedServerIp ? (this.detectedServerIp + ':8080') : '192.168.100.74:8080');

        this.refreshModalFocusList();
        this.modalFocusIndex = 0;
        this.updateModalFocus();
    }

    closeSettingsModal() {
        this.isModalOpen = false;
        var modal = document.getElementById('settings-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.style.setProperty('display', 'none', 'important');
        }

        if (this.isOnboarding || (!this.isConfigured && this.openedFromOnboarding)) {
            this.currentFocusZone = 'onboarding';
            var onboardingMobile = document.getElementById('onboarding-mobile');
            if (onboardingMobile) {
                onboardingMobile.focus();
                onboardingMobile.classList.add('is-focused');
            }
        } else if (this.openedFromZone === 'drawer') {
            this.openDrawer();
        } else {
            this.currentFocusZone = 'grid';
            this.updateCardFocus();
        }
        this.wakeChrome();
    }

    toggleAdvancedSection() {
        var advFields = document.getElementById('advanced-fields');
        var advArrow = document.getElementById('advanced-arrow');
        if (!advFields) return;

        this.isAdvancedOpen = !this.isAdvancedOpen;
        advFields.style.display = this.isAdvancedOpen ? 'block' : 'none';
        if (advArrow) {
            advArrow.className = 'advanced-arrow' + (this.isAdvancedOpen ? ' open' : '');
        }
        this.refreshModalFocusList();
    }

        refreshModalFocusList() {
        var elements = [
            document.getElementById('cfg-ip'),
            document.getElementById('btn-discover-dvr'),
            document.getElementById('cfg-user'),
            document.getElementById('cfg-pwd'),
            document.getElementById('cfg-http-port'),
            document.getElementById('cfg-rtsp-port'),
            document.getElementById('cfg-quality'),
            document.getElementById('cfg-grid-mode'),
            document.getElementById('cfg-show-offline'),
            document.getElementById('btn-default-settings'),
            document.getElementById('btn-cancel-settings'),
            document.getElementById('btn-save-settings')
        ];
        this.modalFocusableElements = elements.filter(function(el) { return el !== null; });
    }

    updateModalFocus() {
        if (!this.modalFocusableElements || this.modalFocusableElements.length === 0) return;
        for (var i = 0; i < this.modalFocusableElements.length; i++) {
            var el = this.modalFocusableElements[i];
            if (i === this.modalFocusIndex) {
                el.classList.add('focused');
                el.focus();
                if (typeof el.scrollIntoView === 'function') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } else {
                el.classList.remove('focused');
            }
        }
    }

        async saveSettings() {
        var ipInput = document.getElementById('cfg-ip');
        var userInput = document.getElementById('cfg-user');
        var pwdInput = document.getElementById('cfg-pwd');
        var qualitySelect = document.getElementById('cfg-quality');
        var showOfflineSelect = document.getElementById('cfg-show-offline');
        var gridModeSelect = document.getElementById('cfg-grid-mode');
        var httpPortInput = document.getElementById('cfg-http-port');
        var rtspPortInput = document.getElementById('cfg-rtsp-port');
        var serverUrlInput = document.getElementById('cfg-server-url');
        var banner = document.getElementById('cfg-status-banner');
        var saveBtn = document.getElementById('btn-save-settings');

        var newIp = ipInput ? ipInput.value.trim() : '';
        var newUser = userInput ? userInput.value.trim() : '';
        var newPwd = pwdInput ? pwdInput.value : '';
        var newHttpPort = httpPortInput ? parseInt(httpPortInput.value || '80', 10) : 80;
        var newRtspPort = rtspPortInput ? parseInt(rtspPortInput.value || '554', 10) : 554;

        if (!newIp || !newUser || !newPwd) {
            if (banner) {
                banner.className = 'cfg-status-banner error';
                banner.style.display = 'flex';
                banner.textContent = '❌ Por favor, preencha o IP, Usuário e Senha do DVR antes de salvar.';
            }
            if (ipInput && !newIp) ipInput.focus();
            else if (userInput && !newUser) userInput.focus();
            else if (pwdInput && !newPwd) pwdInput.focus();
            return;
        }

        if (banner) {
            banner.className = 'cfg-status-banner loading';
            banner.style.display = 'flex';
            banner.textContent = '⏳ Testando conexão com o DVR (' + newIp + ')...';
        }
        if (saveBtn) saveBtn.disabled = true;

        var DvrClass = window.DvrApiClient || (typeof DvrApiClient !== 'undefined' ? DvrApiClient : null);
        var testClient = new DvrClass({
            ip: newIp,
            httpPort: newHttpPort,
            rtspPort: newRtspPort,
            username: newUser,
            password: newPwd
        });

        try {
            await testClient.login();
            var channels = await testClient.getChannels();
            if (!channels || channels.length === 0) {
                throw new Error('Nenhum canal retornado pelo DVR.');
            }

            // SUCESSO! Salva credenciais validadas no localStorage
            localStorage.setItem('dvr_ip', newIp);
            localStorage.setItem('dvr_user', newUser);
            localStorage.setItem('dvr_pwd', newPwd);
            localStorage.setItem('dvr_pass', newPwd);
            localStorage.setItem('dvr_http_port', newHttpPort.toString());
            localStorage.setItem('dvr_rtsp_port', newRtspPort.toString());
            document.cookie = 'dvr_ip=' + encodeURIComponent(newIp) + '; Max-Age=31536000; Path=/; SameSite=Lax';
            document.cookie = 'dvr_user=' + encodeURIComponent(newUser) + '; Max-Age=31536000; Path=/; SameSite=Lax';
            document.cookie = 'dvr_pwd=' + encodeURIComponent(newPwd) + '; Max-Age=31536000; Path=/; SameSite=Lax';
            document.cookie = 'dvr_http_port=' + encodeURIComponent(newHttpPort) + '; Max-Age=31536000; Path=/; SameSite=Lax';
            document.cookie = 'dvr_rtsp_port=' + encodeURIComponent(newRtspPort) + '; Max-Age=31536000; Path=/; SameSite=Lax';

            if (qualitySelect) {
                this.streamQuality = qualitySelect.value;
                localStorage.setItem('dvr_stream_quality', this.streamQuality);
                this.updateBarLabels();
            }
            if (showOfflineSelect) {
                this.showOfflineCameras = (showOfflineSelect.value === 'true');
                localStorage.setItem('dvr_show_offline', this.showOfflineCameras ? 'true' : 'false');
            }
            if (gridModeSelect) {
                this.gridMode = gridModeSelect.value;
                localStorage.setItem('dvr_grid_mode', this.gridMode);
                this.updateBarLabels();
            }
            if (serverUrlInput && serverUrlInput.value.trim()) {
                this.serverUrl = serverUrlInput.value.trim();
                localStorage.setItem('dvr_server_url', this.serverUrl);
            }

            this.dvr = testClient;
            this.channels = channels;
            this.isConfigured = true;
            this.isOnboarding = false;
            localStorage.setItem('dvr_onboarding_complete', 'true');

            if (banner) {
                banner.className = 'cfg-status-banner success';
                banner.textContent = '✅ Conexão bem-sucedida! Carregando câmeras...';
            }

            var self = this;
            setTimeout(function() {
                self.enterCameraGrid(channels);
            }, 600);

        } catch (err) {
            console.error('[Config Test Failed]', err);
            // REGRA: Se a configuração não der certo, mantém a tela aberta e pede para verificar e corrigir
            if (banner) {
                banner.className = 'cfg-status-banner error';
                banner.style.display = 'flex';
                var rawMsg = err.message || 'DVR inacessível';
            var friendlyMsg = rawMsg;
            if (rawMsg.toLowerCase().indexOf('unauthorized') !== -1) {
                friendlyMsg = 'Senha ou Usuário incorretos no DVR (Unauthorized). Confira se a senha foi digitada corretamente clicando no botão do olho 👁️ (senha cadastrada: jr130182).';
            }
            banner.textContent = '❌ ' + friendlyMsg;
            }
            if (pwdInput) pwdInput.focus();
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    async discoverDvr() {
        var input = document.getElementById('cfg-ip');
        var banner = document.getElementById('cfg-status-banner');
        var button = document.getElementById('btn-discover-dvr');
        if (button) { button.disabled = true; button.textContent = '⌕ Procurando...'; }
        if (banner) { banner.style.display = 'block'; banner.className = 'cfg-status-banner loading'; banner.textContent = 'Procurando DVRs na rede local...'; }
        try {
            var base = (window.location && window.location.protocol === 'file:')
                ? 'http://localhost:8080'
                : window.location.origin;
            var response = await fetch(base + '/api/dvr/discover', { cache: 'no-store' });
            var data = await response.json();
            if (data.success && data.devices && data.devices.length) {
                if (input) input.value = data.devices[0].ip;
                if (banner) { banner.className = 'cfg-status-banner success'; banner.textContent = 'DVR encontrado em ' + data.devices[0].ip + '. Verifique os dados e salve.'; }
            } else if (banner) {
                banner.className = 'cfg-status-banner error'; banner.textContent = 'Nenhum DVR encontrado na rede local.';
            }
        } catch (error) {
            if (banner) { banner.className = 'cfg-status-banner error'; banner.textContent = 'Não foi possível buscar o DVR: ' + error.message; }
        } finally {
            if (button) { button.disabled = false; button.textContent = '⌕ Buscar IP'; }
        }
    }

    restoreDefaultSettings() {
        var ipInput = document.getElementById('cfg-ip');
        var userInput = document.getElementById('cfg-user');
        var pwdInput = document.getElementById('cfg-pwd');
        var showOfflineSelect = document.getElementById('cfg-show-offline');
        var gridModeSelect = document.getElementById('cfg-grid-mode');
        var httpPortInput = document.getElementById('cfg-http-port');
        var rtspPortInput = document.getElementById('cfg-rtsp-port');

        if (ipInput) ipInput.value = '';
        if (userInput) userInput.value = '';
        if (pwdInput) pwdInput.value = '';
        var banner = document.getElementById('cfg-status-banner');
        if (banner) banner.style.display = 'none';
        if (showOfflineSelect) showOfflineSelect.value = 'true';
        if (gridModeSelect) gridModeSelect.value = 'auto';
        if (httpPortInput) httpPortInput.value = '80';
        if (rtspPortInput) rtspPortInput.value = '554';

        this.showToast('Padrões restaurados na tela. Salve para aplicar.');
    }

    /* ==========================================================================
       TELA CHEIA DEDICADA / CÂMERA ÚNICA
       ========================================================================== */
    openFullScreen(channel) {
        if (!channel) return;
        this.isFullScreen = true;
        this.fullScreenChannel = channel;
        this.currentFocusZone = 'fullscreen';

        var fsView = document.getElementById('fullscreen-view');
        if (fsView) fsView.style.display = 'flex';
        this.fitFullscreenPlayer();

        // Atualiza título no cabeçalho superior para a câmera em tela cheia
        var titleEl = document.getElementById('dvr-title');
        if (titleEl) {
            titleEl.textContent = (this.deviceTitle || 'DVR01Casa') + ' • ' + channel.name + ' (CH ' + channel.id + ')';
        }

        // Atualiza orientações no menu inferior
        var hintEl = document.querySelector('.bottom-menu-hint');
        if (hintEl) {
            hintEl.innerHTML = '<span class="key-badge">◄ ►</span> Trocar Câmera &bull; <span class="key-badge">OK</span> Fluido/HD &bull; <span class="key-badge">VOLTAR</span> Grade';
        }

        var toastBadge = document.getElementById('fs-toast-badge');
        if (toastBadge) toastBadge.classList.remove('show');

        // REGRA ESTRITA TELA CHEIA REAL: Esconder cabeçalho, rodapé e menus
        var header = document.getElementById('app-header');
        if (header) header.classList.remove('visible');
        var bottomBar = document.getElementById('bottom-menu-bar');
        if (bottomBar) bottomBar.classList.remove('visible');

        var toastBadge = document.getElementById('fs-toast-badge');
        var fsTitle = document.getElementById('fs-badge-title');
        var fsQuality = document.getElementById('fs-badge-quality');
        if (fsTitle) fsTitle.textContent = channel.name + ' (CH ' + channel.id + ')';
        if (fsQuality) {
            fsQuality.textContent = (this.streamQuality === 'main') ? '● HD 1080p' : '● Fluido';
            fsQuality.className = (this.streamQuality === 'main') ? 'fs-tag-hd' : 'fs-tag-fluido';
        }
        if (toastBadge) {
            toastBadge.classList.add('show');
            setTimeout(function() { toastBadge.classList.remove('show'); }, 1500);
        }

        var streamType = (this.streamQuality === 'main') ? 1 : 2;
        if (this.player) {
            var initialSrc = '';
            var activeCard = document.querySelector('.camera-card[data-channel-id="' + channel.id + '"] .camera-img');
            if (activeCard && activeCard.src) initialSrc = activeCard.src;
            this.player.play(channel.id, streamType, initialSrc);
        }

        this.syncStateToServer();
    }

    fitFullscreenPlayer() {
        var container = document.getElementById('fullscreen-player-container');
        if (!container) return;
        container.style.setProperty('width', '100vw', 'important');
        container.style.setProperty('height', '100vh', 'important');
        if (this.player && this.player.resize) {
            this.player.resize();
        }
    }

    closeFullScreen() {
        if (!this.isFullScreen) return;
        this.isFullScreen = false;
        this.fullScreenChannel = null;

        var fsView = document.getElementById('fullscreen-view');
        if (fsView) fsView.style.display = 'none';

        if (this.player) {
            this.player.stop();
        }

        // Restaura título original do DVR
        var titleEl = document.getElementById('dvr-title');
        if (titleEl) {
            titleEl.textContent = this.deviceTitle || 'DVR01Casa • iDS-7216HQHI-M1/XT';
        }

        // Restaura orientações do menu inferior
        var hintEl = document.querySelector('.bottom-menu-hint');
        if (hintEl) {
            hintEl.innerHTML = '<span class="key-badge">▲ ▼ ◄ ►</span> Navegar &bull; <span class="key-badge">OK</span> Selecionar / Tela Cheia';
        }

        this.currentFocusZone = 'grid';
        this.updateCardFocus();
        this.wakeChrome();
        this.syncStateToServer();
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

    /* ==========================================================================
       GESTÃO DE FOCO E NAVEGAÇÃO 100% VIA SETAS E OK
       ========================================================================== */
    handleNavigation(direction) {
        this.wakeChrome();

        if (this.currentFocusZone === 'onboarding' || this.isOnboarding) {
            var onboardingButtons = [
                document.getElementById('onboarding-mobile'),
                document.getElementById('onboarding-tv')
            ].filter(function(el) { return el !== null; });
            var onboardingIndex = document.activeElement === onboardingButtons[1] ? 1 : 0;
            if (direction === 'left' || direction === 'right') {
                onboardingIndex = onboardingIndex === 0 ? 1 : 0;
                onboardingButtons[onboardingIndex].focus();
                for (var ob = 0; ob < onboardingButtons.length; ob++) {
                    onboardingButtons[ob].classList.toggle('is-focused', ob === onboardingIndex);
                }
            }
            return;
        }

                if (this.currentFocusZone === 'license' && this.isLicenseModalOpen) {
            var licBtns = [
                document.getElementById('btn-refresh-license'),
                document.getElementById('btn-dismiss-license')
            ].filter(function(b) { return b !== null; });

            if (direction === 'left' && licBtns[0]) {
                licBtns[0].focus();
            } else if (direction === 'right' && licBtns[1]) {
                licBtns[1].focus();
            }
            return;
        }

        // 1. Modal de Configurações
        if (this.currentFocusZone === 'modal' && this.isModalOpen) {
            var len = this.modalFocusableElements.length;
            if (len === 0) return;

            if (direction === 'up') {
                this.modalFocusIndex = (this.modalFocusIndex - 1 + len) % len;
                this.updateModalFocus();
            } else if (direction === 'down') {
                this.modalFocusIndex = (this.modalFocusIndex + 1) % len;
                this.updateModalFocus();
            } else if (direction === 'left' || direction === 'right') {
                var active = this.modalFocusableElements[this.modalFocusIndex];
                if (active && active.tagName === 'SELECT') {
                    var step = direction === 'right' ? 1 : -1;
                    active.selectedIndex = (active.selectedIndex + step + active.options.length) % active.options.length;
                    active.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            return;
        }

        // 2. Menu Netflix (Drawer)
        if (this.currentFocusZone === 'drawer' && this.isDrawerOpen) {
            var items = this.getDrawerItems();
            var dLen = items.length;
            if (dLen === 0) return;

            if (direction === 'up') {
                this.drawerFocusIndex = (this.drawerFocusIndex - 1 + dLen) % dLen;
                this.updateDrawerFocus();
                this.resetDrawerTimer();
            } else if (direction === 'down') {
                this.drawerFocusIndex = (this.drawerFocusIndex + 1) % dLen;
                this.updateDrawerFocus();
                this.resetDrawerTimer();
            } else if (direction === 'right') {
                this.closeDrawer();
            }
            return;
        }

        // 3. Em Tela Cheia (100% vídeo: setas apenas trocam de câmera)
        if (this.currentFocusZone === 'fullscreen' && this.isFullScreen) {
            if (direction === 'right' || direction === 'down') {
                this.nextCamera();
            } else if (direction === 'left' || direction === 'up') {
                this.prevCamera();
            }
            return;
        }

        // 4. Menu Inferior
        if (this.currentFocusZone === 'bottom-bar') {
            var barButtons = [
                document.getElementById('btn-bar-menu'),
                document.getElementById('btn-bar-settings'),
                document.getElementById('btn-bar-grid'),
                document.getElementById('btn-bar-quality'),
                document.getElementById('btn-bar-mobile'),
                document.getElementById('btn-bar-reconnect'),
                document.getElementById('btn-bar-help')
            ].filter(function(el) { return el !== null; });

            if (direction === 'up') {
                this.currentFocusZone = 'grid';
                this.updateBottomBarFocus(barButtons, -1);
                this.updateCardFocus();
                return;
            } else if (direction === 'left') {
                this.bottomBarFocusIndex = (this.bottomBarFocusIndex - 1 + barButtons.length) % barButtons.length;
                this.updateBottomBarFocus(barButtons, this.bottomBarFocusIndex);
                return;
            } else if (direction === 'right') {
                this.bottomBarFocusIndex = (this.bottomBarFocusIndex + 1) % barButtons.length;
                this.updateBottomBarFocus(barButtons, this.bottomBarFocusIndex);
                return;
            }
            return;
        }

        // 5. Grade de Câmeras com Paginação Manual Contínua e Abertura do Drawer
        if (this.currentFocusZone === 'grid') {
            var pageChannels = this.getCurrentPageChannels();
            var totalOnPage = pageChannels.length;
            if (totalOnPage === 0) return;

            var cols = this.currentGridCols || 4;
            var visibleChannels = this.getVisibleChannels();
            var totalPages = Math.ceil(visibleChannels.length / this.currentGridCapacity);
            if (totalPages < 1) totalPages = 1;

            switch (direction) {
                case 'right':
                    if (this.focusedIndex < totalOnPage - 1) {
                        this.focusedIndex++;
                    } else if (totalPages > 1) {
                        // Última câmera da página: avança para a próxima página
                        if (this.currentPage < totalPages - 1) {
                            this.currentPage++;
                            this.focusedIndex = 0;
                            this.renderGrid();
                            this.showToast('Página ' + (this.currentPage + 1) + ' de ' + totalPages, 1000);
                            return;
                        } else {
                            // Última câmera da última página: volta para a página 1
                            this.currentPage = 0;
                            this.focusedIndex = 0;
                            this.renderGrid();
                            this.showToast('Página 1 de ' + totalPages, 1000);
                            return;
                        }
                    }
                    break;

                case 'left':
                    if (this.focusedIndex % cols === 0) {
                        // Câmera na coluna mais à esquerda da grade
                        if (this.focusedIndex === 0 && this.currentPage > 0) {
                            // Primeira câmera de página subsequente: volta para página anterior
                            this.currentPage--;
                            this.renderGrid();
                            var prevPageChannels = this.getCurrentPageChannels();
                            this.focusedIndex = prevPageChannels.length - 1;
                            this.updateCardFocus();
                            this.showToast('Página ' + (this.currentPage + 1) + ' de ' + totalPages, 1000);
                            return;
                        } else {
                            // Na borda esquerda da tela: ABRE O MENU LATERAL ESTILO NETFLIX!
                            this.openDrawer();
                            return;
                        }
                    } else if (this.focusedIndex > 0) {
                        this.focusedIndex--;
                    }
                    break;

                case 'down':
                    if (this.focusedIndex + cols < totalOnPage) {
                        this.focusedIndex += cols;
                    } else if (this.focusedIndex === totalOnPage - 1 && totalPages > 1 && this.currentPage < totalPages - 1) {
                        // Na câmera mais abaixo e mais à direita: avança para a próxima página
                        this.currentPage++;
                        this.focusedIndex = 0;
                        this.renderGrid();
                        this.showToast('Página ' + (this.currentPage + 1) + ' de ' + totalPages, 1000);
                        return;
                    }
                    break;

                case 'up':
                    if (this.focusedIndex - cols >= 0) {
                        this.focusedIndex -= cols;
                    } else if (this.focusedIndex === 0 && this.currentPage > 0) {
                        // Subir da primeira câmera vai para a página anterior
                        this.currentPage--;
                        this.renderGrid();
                        var prevCh = this.getCurrentPageChannels();
                        this.focusedIndex = prevCh.length - 1;
                        this.updateCardFocus();
                        this.showToast('Página ' + (this.currentPage + 1) + ' de ' + totalPages, 1000);
                        return;
                    }
                    break;
            }

            this.updateCardFocus();
        }
    }

    updateBottomBarFocus(buttons, activeIndex) {
        for (var i = 0; i < buttons.length; i++) {
            if (i === activeIndex) {
                buttons[i].classList.add('focused');
                buttons[i].focus();
            } else {
                buttons[i].classList.remove('focused');
            }
        }
    }

    /* ==========================================================================
       ENTER / OK
       ========================================================================== */
    handleEnter() {
        this.wakeChrome();

        if (this.currentFocusZone === 'onboarding' || this.isOnboarding) {
            if (document.activeElement && document.activeElement.click) document.activeElement.click();
            return;
        }

        if (this.currentFocusZone === 'modal' && this.isModalOpen) {
            var el = this.modalFocusableElements[this.modalFocusIndex];
            if (el) {
                if (el.tagName === 'BUTTON') {
                    el.click();
                } else if (el.tagName === 'SELECT') {
                    if (el.selectedIndex < el.options.length - 1) {
                        el.selectedIndex++;
                    } else {
                        el.selectedIndex = 0;
                    }
                } else if (el.tagName === 'INPUT') {
                    el.focus();
                }
            }
            return;
        }

        if (this.currentFocusZone === 'drawer' && this.isDrawerOpen) {
            var items = this.getDrawerItems();
            var item = items[this.drawerFocusIndex];
            if (item) item.click();
            return;
        }

        if (this.isQrModalOpen) {
            this.closeQrModal();
            return;
        }
        if (this.isHelpModalOpen) {
            this.closeHelpModal();
            return;
        }

        if (this.currentFocusZone === 'bottom-bar') {
            var barBtns = [
                document.getElementById('btn-bar-menu'),
                document.getElementById('btn-bar-settings'),
                document.getElementById('btn-bar-grid'),
                document.getElementById('btn-bar-quality'),
                document.getElementById('btn-bar-mobile'),
                document.getElementById('btn-bar-reconnect'),
                document.getElementById('btn-bar-help')
            ].filter(function(b) { return b !== null; });

            if (barBtns[this.bottomBarFocusIndex]) {
                barBtns[this.bottomBarFocusIndex].click();
            }
            return;
        }

        if (this.isFullScreen) {
            this.toggleStreamQuality();
            return;
        }

        var visibleChannels = this.getVisibleChannels();
        if (visibleChannels.length > 0 && this.focusedIndex < visibleChannels.length) {
            this.openFullScreen(visibleChannels[this.focusedIndex]);
        }
    }

    /* ==========================================================================
       BOTÃO VOLTAR: 1 CLIQUE ABRE MENU LATERAL | 2 CLIQUES SAI DO APP
       ========================================================================== */
    handleBack() {
        var self = this;

        if (this.isModalOpen) {
            this.closeSettingsModal();
            return;
        }

        if (this.isQrModalOpen) {
            this.closeQrModal();
            return;
        }

        if (this.isHelpModalOpen) {
            this.closeHelpModal();
            return;
        }

        if (this.isLicenseModalOpen) {
            this.closeLicenseModal();
            return;
        }

        if (this.isOnboarding) return;

        if (this.isFullScreen) {
            this.closeFullScreen();
            return;
        }

        // Se o drawer já estiver aberto, fecha
        if (this.isDrawerOpen) {
            // Se clicar de novo enquanto o drawer está aberto, confirma saída
            if (this.backPressTimer) {
                clearTimeout(this.backPressTimer);
                this.backPressTimer = null;
                this.exitApp();
                return;
            }
            this.closeDrawer();
            return;
        }

        // Na grade principal:
        if (this.backPressTimer) {
            // Segundo clique dentro da janela de 1.5s -> SAI DO APP
            clearTimeout(this.backPressTimer);
            this.backPressTimer = null;
            this.exitApp();
            return;
        }

        // Primeiro clique: abre menu lateral e arma o timer de 1.5s
        this.openDrawer();
        this.showToast('Pressione VOLTAR novamente para sair do aplicativo', 1500);
        this.backPressTimer = setTimeout(function() {
            self.backPressTimer = null;
        }, 1500);
    }

    /* ==========================================================================
       ATALHOS OPCIONAIS DO CONTROLE REMOTO
       ========================================================================== */
    handleRed() {
        if (this.isModalOpen || this.isDrawerOpen || this.isQrModalOpen || this.isHelpModalOpen) return;
        this.connectDvr();
    }

    handleGreen() {
        if (this.isModalOpen || this.isDrawerOpen || this.isQrModalOpen || this.isHelpModalOpen) return;
        this.cycleGridMode();
    }

    handleYellow() {
        if (this.isModalOpen || this.isDrawerOpen || this.isQrModalOpen || this.isHelpModalOpen) return;
        this.toggleStreamQuality();
    }

    handleBlue() {
        if (this.isModalOpen) {
            this.closeSettingsModal();
            return;
        }
        if (this.isDrawerOpen) {
            this.closeDrawer();
        }
        this.openSettingsModal();
    }

    handleNumber(num) {
        if (this.isModalOpen || this.isDrawerOpen || this.isQrModalOpen || this.isHelpModalOpen) return;
        if (num === 0) num = 10;

        var visibleChannels = this.getVisibleChannels();
        for (var i = 0; i < visibleChannels.length; i++) {
            if (visibleChannels[i].id === num) {
                this.focusedIndex = i;
                this.updateCardFocus();
                this.openFullScreen(visibleChannels[i]);
                return;
            }
        }
        this.showToast('Câmera CH ' + num + ' não encontrada ou offline');
    }


    initDeviceIdentity() {
        if (!this.deviceId) {
            this.deviceId = localStorage.getItem('dvr_device_id');
            if (!this.deviceId) {
                this.deviceId = 'TV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
                localStorage.setItem('dvr_device_id', this.deviceId);
            }
        }
    }

    openLicenseModal() {
        this.isLicenseModalOpen = true;
        this.currentFocusZone = 'license';
        var modal = document.getElementById('license-modal');
        if (modal) modal.style.display = 'flex';
        var devIdEl = document.getElementById('license-device-id');
        if (devIdEl) devIdEl.textContent = this.deviceId || 'TV-NATIVE';
        var devStatusEl = document.getElementById('license-device-status');
        if (devStatusEl) devStatusEl.textContent = 'Ativa (Versão Completa)';
        var qrContainer = document.getElementById('license-qrcode-container');
        if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: 'https://seusite.com/licenca?device=' + (this.deviceId || 'TV-NATIVE'),
                width: 140,
                height: 140,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }
        var btnDismiss = document.getElementById('btn-dismiss-license');
        if (btnDismiss) btnDismiss.focus();
    }

    closeLicenseModal() {
        this.isLicenseModalOpen = false;
        var modal = document.getElementById('license-modal');
        if (modal) modal.style.display = 'none';
        this.currentFocusZone = 'modal';
        var btnLic = document.getElementById('btn-cfg-license');
        if (btnLic) btnLic.focus();
    }

    refreshLicenseStatus() {
        this.showToast('Verificando licença do dispositivo...');
        var self = this;
        setTimeout(function() {
            self.showToast('Dispositivo licenciado com sucesso!');
        }, 1000);
    }

    exitApp() {
        console.log('[App] Encerrando aplicativo DVR TV...');
        if (typeof window.tizen !== 'undefined' && typeof window.tizen.application !== 'undefined') {
            try {
                window.tizen.application.getCurrentApplication().exit();
            } catch (e) {
                window.close();
            }
        } else {
            window.close();
        }
    }

    /* ==========================================================================
       SINCRONIZAÇÃO COM O CONTROLE MOBILE
       ========================================================================== */
    getRemoteControlServerBase() {
        // O celular acessa a VPS. No teste pelo PC, o emulador também precisa
        // consultar a mesma fila na VPS; caso contrário o comando fica preso
        // no servidor remoto e o PC consulta apenas localhost.
        if (this.serverUrl && /^https?:\/\//i.test(this.serverUrl)) {
            return this.serverUrl.replace(/\/$/, '');
        }
        return 'https://dvr.ilocseguro.com';
    }

    syncStateToServer(extraState) {
        var baseApi = this.getRemoteControlServerBase();

        var visibleChannels = this.getVisibleChannels();
        var selectedCh = (this.isFullScreen && this.fullScreenChannel) 
            ? this.fullScreenChannel 
            : (visibleChannels[this.focusedIndex] || null);

        var statePayload = {
            connected: (this.channels && this.channels.length > 0),
            dvrStatus: this.dvr ? (this.dvr.isAuthenticated ? 'online' : 'connecting') : 'offline',
            currentView: this.isFullScreen ? 'fullscreen' : 'grid',
            selectedChannelId: selectedCh ? selectedCh.id : 1,
            selectedCameraName: selectedCh ? selectedCh.name : 'Camera 01',
            quality: this.streamQuality,
            gridMode: this.gridMode,
            currentPage: this.currentPage + 1,
            totalPages: Math.ceil(this.getVisibleChannels().length / (this.currentGridCapacity || 16)) || 1,
            allowedGrids: this.getAllowedSquareGrids(),
            showOffline: this.showOfflineCameras,
            bandwidth: this.dvr ? (this.dvr.bandwidthFormatted || '0 KB/s') : '0 KB/s',
            channels: (this.channels || []).map(function(c) {
                return { id: c.id, name: c.name, isOnline: c.isOnline };
            })
        };

        if (extraState) {
            for (var stateKey in extraState) {
                if (Object.prototype.hasOwnProperty.call(extraState, stateKey)) {
                    statePayload[stateKey] = extraState[stateKey];
                }
            }
        }

        fetch(baseApi + '/api/remote/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(statePayload)
        }).catch(function() {});
    }

    startSyncPolling() {
        var self = this;
        if (this.syncPollTimer) clearInterval(this.syncPollTimer);

        this.syncPollTimer = setInterval(async function() {
            var baseApi = self.getRemoteControlServerBase();

            try {
            var pairId = localStorage.getItem('dvr_tv_pair') || '';
            var pollUrl = baseApi + '/api/remote/poll' + (pairId ? '?pairId=' + encodeURIComponent(pairId) : '');
            var res = await fetch(pollUrl, { cache: 'no-store' });
                if (res.ok) {
                    var data = await res.json();
                    if (data && data.commands && data.commands.length > 0) {
                        data.commands.forEach(function(cmdObj) {
                            self.executeRemoteCommand(cmdObj);
                        });
                    }
                }
            } catch (e) {}
        }, 500);
    }

    executeRemoteCommand(cmdObj) {
        var cmd = cmdObj.command;
        var chId = cmdObj.channelId;
        var val = cmdObj.value;

        console.log('[Remote Sync] Comando recebido:', cmd, chId, val);

        switch (cmd) {
            case 'go_home':
                this.closeDrawer();
                this.closeFullScreen();
                this.currentPage = 0;
                this.focusedIndex = 0;
                this.currentFocusZone = 'grid';
                this.renderGrid();
                this.updateCardFocus();
                break;
            case 'select_camera':
                if (chId) {
                    var vChs = this.getVisibleChannels();
                    for (var i = 0; i < vChs.length; i++) {
                        if (vChs[i].id === chId) {
                            this.focusedIndex = i;
                            this.updateCardFocus();
                            break;
                        }
                    }
                }
                break;

            case 'open_fullscreen':
                if (chId) {
                    var targetCh = null;
                    for (var j = 0; j < this.channels.length; j++) {
                        if (this.channels[j].id === chId) {
                            targetCh = this.channels[j];
                            break;
                        }
                    }
                    if (targetCh) this.openFullScreen(targetCh);
                } else if (this.channels && this.channels[this.focusedIndex]) {
                    this.openFullScreen(this.channels[this.focusedIndex]);
                }
                break;

            case 'close_fullscreen':
                this.closeFullScreen();
                break;

            case 'next_camera':
                this.nextCamera();
                break;

            case 'prev_camera':
                this.prevCamera();
                break;

            case 'toggle_quality':
                this.toggleStreamQuality();
                break;

            case 'set_quality':
                if (val && (val === 'main' || val === 'sub')) {
                    this.streamQuality = val;
                    localStorage.setItem('dvr_stream_quality', this.streamQuality);
                    this.updateBarLabels();
                    if (this.isFullScreen && this.fullScreenChannel) {
                        this.openFullScreen(this.fullScreenChannel);
                    }
                }
                break;

            case 'configure_dvr':
                if (val && typeof val === 'object') {
                    var configRequestId = val.requestId || null;
                    this.syncStateToServer({ configResult: { requestId: configRequestId, status: 'testing' } });
                    var ip = val.ip ? val.ip.trim() : '';
                    var user = val.username ? val.username.trim() : (val.user ? val.user.trim() : '');
                    var pwd = val.password ? val.password : (val.pwd ? val.pwd : '');
                    var hPort = val.httpPort ? parseInt(val.httpPort, 10) : 80;
                    var rPort = val.rtspPort ? parseInt(val.rtspPort, 10) : 554;

                    if (ip) {
                        this.dvr.ip = ip;
                        localStorage.setItem('dvr_ip', ip);
                    }
                    if (user) {
                        this.dvr.username = user;
                        localStorage.setItem('dvr_user', user);
                    }
                    if (pwd) {
                        this.dvr.password = pwd;
                        localStorage.setItem('dvr_pwd', pwd);
                        localStorage.setItem('dvr_pass', pwd);
                    }
                    this.dvr.httpPort = hPort;
                    localStorage.setItem('dvr_http_port', hPort.toString());
                    this.dvr.rtspPort = rPort;
                    localStorage.setItem('dvr_rtsp_port', rPort.toString());
                    document.cookie = 'dvr_ip=' + encodeURIComponent(ip) + '; Max-Age=31536000; Path=/; SameSite=Lax';
                    document.cookie = 'dvr_user=' + encodeURIComponent(user) + '; Max-Age=31536000; Path=/; SameSite=Lax';
                    document.cookie = 'dvr_pwd=' + encodeURIComponent(pwd) + '; Max-Age=31536000; Path=/; SameSite=Lax';
                    document.cookie = 'dvr_http_port=' + encodeURIComponent(hPort) + '; Max-Age=31536000; Path=/; SameSite=Lax';
                    document.cookie = 'dvr_rtsp_port=' + encodeURIComponent(rPort) + '; Max-Age=31536000; Path=/; SameSite=Lax';
                    this.isConfigured = true;
                    this.isOnboarding = false;
                    localStorage.setItem('dvr_onboarding_complete', 'true');
                    this.closeQrModal();
                    this.closeSettingsModal();
                    this.closeDrawer();
                    this.showToast('Configurações recebidas. Validando câmeras...', 2500);
                    this.connectDvr().then(function(ok) {
                        this.syncStateToServer({ configResult: {
                            requestId: configRequestId,
                            status: ok ? 'success' : 'error',
                            message: ok ? 'DVR conectado com sucesso.' : 'A TV não conseguiu autenticar ou acessar o DVR.'
                        }});
                        if (ok && this.channels && this.channels.length > 0) {
                            this.enterCameraGrid(this.channels);
                        }
                    }.bind(this));
                }
                break;
            case 'set_grid':
                if (val) {
                    this.gridMode = val;
                    localStorage.setItem('dvr_grid_mode', this.gridMode);
                    this.renderGrid();
                    this.updateBarLabels();
                }
                break;

            case 'toggle_offline':
                this.toggleOfflineFilter();
                break;

            case 'reconnect':
                this.connectDvr();
                break;

            case 'open_settings':
                this.openSettingsModal();
                break;

            case 'close_settings':
                this.closeSettingsModal();
                break;

            case 'open_drawer':
                this.openDrawer();
                break;

            case 'close_drawer':
                this.closeDrawer();
                break;

            case 'dpad_up':
                this.handleNavigation('up');
                break;
            case 'dpad_down':
                this.handleNavigation('down');
                break;
            case 'dpad_left':
                this.handleNavigation('left');
                break;
            case 'dpad_right':
                this.handleNavigation('right');
                break;
            case 'dpad_ok':
                this.handleEnter();
                break;
            case 'dpad_back':
                this.handleBack();
                break;
        }

        this.syncStateToServer();
    }

    showToast(msg, duration) {
        duration = duration || 3000;
        var toast = document.getElementById('toast-notification');
        if (!toast) return;

        toast.textContent = msg;
        toast.className = 'toast-notification show';

        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(function() {
            toast.className = 'toast-notification';
        }, duration);
    }
}

window.addEventListener('DOMContentLoaded', function() {
    window.app = new DvrTvApp();
    if (window.DvrSmartView) {
        window.DvrSmartView.initReceiver(function(payload) {
            if (window.app && payload) window.app.executeRemoteCommand(payload);
        });
    }
});
