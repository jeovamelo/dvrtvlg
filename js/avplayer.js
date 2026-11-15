/**
 * Player de Vídeo para Smart TVs (LG webOS e Samsung Tizen) e Navegadores PC
 * Suporta:
 * 1. Elemento HTML5 <video> nativo para webOS TV e navegadores modernos
 * 2. Samsung webapis.avplay (caso executado em TV Samsung)
 * 3. Fallback contínuo de alta taxa via snapshots periódicos (ISAPI JPEG)
 */
class TvStreamPlayer {
    constructor(containerElement, dvrClient) {
        this.container = containerElement;
        this.dvrClient = dvrClient;
        this.isAvPlayAvailable = (typeof window.webapis !== 'undefined' && typeof window.webapis.avplay !== 'undefined');
        this.currentChannelId = null;
        this.currentStreamType = 1; // 1 = Main (1080P), 2 = Sub (Fluido)
        this.isPlaying = false;
        this.fallbackTimer = null;
        this.fallbackImg = null;
        this.videoEl = null;

        console.log('[Player] Inicializado. Suporte AVPlay:', this.isAvPlayAvailable ? 'SIM' : 'NÃO (HTML5 / Fallback)');
        this.initDOM();
    }

    initDOM() {
        // Elemento HTML5 Video
        this.videoEl = document.createElement('video');
        this.videoEl.className = 'stream-video-element';
        this.videoEl.style.width = '100%';
        this.videoEl.style.height = '100%';
        this.videoEl.style.objectFit = 'contain';
        this.videoEl.style.display = 'none';
        this.videoEl.autoplay = true;
        this.videoEl.playsInline = true;
        this.videoEl.muted = true;
        this.container.appendChild(this.videoEl);

        // Imagem para Fallback de snapshots contínuos
        this.fallbackImg = document.createElement('img');
        this.fallbackImg.className = 'avplay-fallback-img';
        this.fallbackImg.style.width = '100%';
        this.fallbackImg.style.height = '100%';
        this.fallbackImg.style.objectFit = 'contain';
        this.fallbackImg.style.display = 'none';
        this.fallbackImg.alt = 'Stream Fallback';
        this.container.appendChild(this.fallbackImg);
    }

    /**
     * Inicia a reprodução de um canal
     */
    async play(channelId, streamType) {
        streamType = streamType || 1;
        this.stop();
        this.currentChannelId = channelId;
        this.currentStreamType = streamType;
        this.isPlaying = true;
        this.onBuffering(true);

        if (this.isAvPlayAvailable) {
            this.playAvPlay(channelId, streamType);
        } else {
            this.playHtml5OrFallback(channelId, streamType);
        }
    }

    /**
     * Tenta reprodução via HTML5 <video> e ativa fallback caso RTSP direto não seja decodificado
     */
    playHtml5OrFallback(channelId, streamType) {
        var self = this;
        var rtspUrl = this.dvrClient.getRtspUrl(channelId, streamType);
        console.log('[Player] Tentando streaming RTSP/Video para o canal ' + channelId + ':', rtspUrl);

        var hasStarted = false;
        var timeoutTimer = setTimeout(function() {
            if (!hasStarted && self.isPlaying && self.currentChannelId === channelId) {
                console.log('[Player] Timeout na inicialização do vídeo HTML5. Alternando para streaming de snapshots.');
                self.playFallback(channelId, streamType);
            }
        }, 3500);

        this.videoEl.onplaying = function() {
            hasStarted = true;
            clearTimeout(timeoutTimer);
            self.onBuffering(false);
            self.videoEl.style.display = 'block';
            console.log('[Player] Reprodução HTML5 iniciada.');
        };

        this.videoEl.onerror = function(err) {
            clearTimeout(timeoutTimer);
            console.warn('[Player] HTML5 video não reproduziu formato diretamente. Alternando para fallback snapshot.', err);
            self.videoEl.style.display = 'none';
            if (self.isPlaying && self.currentChannelId === channelId) {
                self.playFallback(channelId, streamType);
            }
        };

        try {
            this.videoEl.src = rtspUrl;
            this.videoEl.load();
            var playPromise = this.videoEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(function() {
                    // Espera pelo timeout ou fallback
                });
            }
        } catch (e) {
            clearTimeout(timeoutTimer);
            this.playFallback(channelId, streamType);
        }
    }

    /**
     * Reprodução nativa via Samsung AVPlay (caso executado em TV Samsung)
     */
    playAvPlay(channelId, streamType) {
        var self = this;
        try {
            var rtspUrl = this.dvrClient.getRtspUrl(channelId, streamType);
            console.log('[AVPlay] Abrindo stream RTSP:', rtspUrl);

            window.webapis.avplay.open(rtspUrl);

            var rect = this.container.getBoundingClientRect();
            var x = Math.round(rect.left);
            var y = Math.round(rect.top);
            var w = Math.round(rect.width);
            var h = Math.round(rect.height);

            window.webapis.avplay.setDisplayRect(x, y, w, h);

            window.webapis.avplay.setListener({
                onbufferingstart: function() { self.onBuffering(true); },
                onbufferingcomplete: function() { self.onBuffering(false); },
                onerror: function(err) {
                    console.error('[AVPlay] Erro no player:', err);
                    self.onBuffering(false);
                    self.playFallback(channelId, streamType);
                }
            });

            window.webapis.avplay.prepareAsync(function() {
                window.webapis.avplay.play();
                self.onBuffering(false);
            }, function(prepareErr) {
                console.warn('[AVPlay] Falha no prepareAsync:', prepareErr);
                self.playFallback(channelId, streamType);
            });

        } catch (e) {
            console.error('[AVPlay] Exceção ao iniciar AVPlay:', e);
            this.playFallback(channelId, streamType);
        }
    }

    /**
     * Streaming contínuo via snapshots periódicos em alta taxa de quadros (FPS Turbo)
     */
    async playFallback(channelId, streamType) {
        console.log('[Player] Executando streaming contínuo de alta taxa (Modo Turbo FPS)');
        if (this.videoEl) {
            this.videoEl.style.display = 'none';
        }
        this.fallbackImg.style.display = 'block';
        this.onBuffering(false);

        var self = this;
        var lastBlobUrl = null;
        var inFlight = false;

        var updateFrame = async function() {
            if (!self.isPlaying || self.currentChannelId !== channelId) return;
            if (inFlight) return;
            inFlight = true;

            try {
                var newBlobUrl = await self.dvrClient.fetchSnapshotBlob(channelId, streamType);
                if (self.isPlaying && self.currentChannelId === channelId) {
                    self.fallbackImg.src = newBlobUrl;
                    if (lastBlobUrl) {
                        URL.revokeObjectURL(lastBlobUrl);
                    }
                    lastBlobUrl = newBlobUrl;
                } else {
                    URL.revokeObjectURL(newBlobUrl);
                }
            } catch (err) {
                // Erro transitório de rede
            } finally {
                inFlight = false;
            }

            if (self.isPlaying && self.currentChannelId === channelId) {
                // Intervalo mínimo para máxima taxa de quadros (FPS):
                // 10ms para Sub-stream Fluido (~15-25 FPS) e 50ms para HD
                var delay = (streamType === 1) ? 50 : 10;
                self.fallbackTimer = setTimeout(updateFrame, delay);
            }
        };

        updateFrame();
    }

    /**
     * Interrompe a reprodução atual
     */
    stop() {
        this.isPlaying = false;

        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }

        if (this.fallbackImg) {
            this.fallbackImg.style.display = 'none';
            this.fallbackImg.src = '';
        }

        if (this.videoEl) {
            this.videoEl.style.display = 'none';
            try {
                this.videoEl.pause();
                this.videoEl.removeAttribute('src');
                this.videoEl.load();
            } catch (e) {}
        }

        if (this.isAvPlayAvailable) {
            try {
                var state = window.webapis.avplay.getState();
                if (state === 'PLAYING' || state === 'PAUSED' || state === 'READY') {
                    window.webapis.avplay.stop();
                }
                window.webapis.avplay.close();
            } catch (e) {
                console.warn('[AVPlay] Erro ao parar AVPlay:', e);
            }
        }

        this.onBuffering(false);
    }

    onBuffering(isBuffering) {
        var loader = document.getElementById('player-loader');
        if (loader) {
            loader.style.display = isBuffering ? 'flex' : 'none';
        }
    }

    resize() {
        if (!this.isPlaying) return;
        if (this.isAvPlayAvailable) {
            try {
                var rect = this.container.getBoundingClientRect();
                window.webapis.avplay.setDisplayRect(
                    Math.round(rect.left),
                    Math.round(rect.top),
                    Math.round(rect.width),
                    Math.round(rect.height)
                );
            } catch (e) {}
        }
    }
}

window.TvStreamPlayer = TvStreamPlayer;
