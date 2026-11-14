/**
 * Hikvision ISAPI Client para Smart TVs (LG webOS e Samsung Tizen) e Navegadores PC
 * Compatível com TVs modernas e navegadores com suporte a Fetch e Promises.
 */

function getNodeText(parent, selector, defaultValue) {
    if (!parent) return defaultValue || '';
    var el = parent.querySelector(selector);
    return (el && el.textContent) ? el.textContent : (defaultValue || '');
}

class DvrApiClient {
    constructor(config) {
        this.updateConfig(config || {});
    }

    updateConfig(config) {
        this.ip = config.ip || '192.168.100.2';
        this.httpPort = parseInt(config.httpPort || 80, 10);
        this.rtspPort = parseInt(config.rtspPort || 554, 10);
        this.username = config.username || 'admin';
        this.password = config.password || 'jr130182';

        this.stopHeartbeat();
        this.sessionTag = null;
        this.sessionID = null;
        this.isAuthenticated = false;
        this.deviceInfo = null;
        this.channels = [];
    }

    get isLocalProxy() {
        return (typeof window !== 'undefined' && window.location && 
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
    }

    get baseUrl() {
        if (this.isLocalProxy) {
            return window.location.origin + '/dvr';
        }
        var portStr = (this.httpPort === 80) ? '' : (':' + this.httpPort);
        return 'http://' + this.ip + portStr;
    }

    getAuthHeaders(customHeaders) {
        var headers = Object.assign({}, customHeaders || {});
        headers['If-Modified-Since'] = '0';

        if (this.sessionTag) {
            headers['SessionTag'] = this.sessionTag;
        }

        // Se estiver rodando pelo proxy do server.js (no PC), envia o destino dinâmico
        if (this.isLocalProxy) {
            headers['X-DVR-Target'] = this.ip + ':' + this.httpPort;
            headers['X-DVR-Host'] = this.ip;
            headers['X-DVR-Port'] = this.httpPort.toString();
        }

        return headers;
    }

    /**
     * Autenticação via ISAPI sessionLogin (SHA-256)
     */
    async login() {
        try {
            console.log('[DVR] Conectando a ' + this.baseUrl + ' (' + this.ip + ':' + this.httpPort + ')');
            
            // Passo 1: Obter capacidades e desafio
            var capUrl = this.baseUrl + '/ISAPI/Security/sessionLogin/capabilities?username=' + encodeURIComponent(this.username) + '&_=' + Date.now();
            var capRes = await fetch(capUrl, {
                method: 'GET',
                headers: this.getAuthHeaders(),
                credentials: 'include'
            });

            if (!capRes.ok) {
                throw new Error('Falha HTTP ' + capRes.status + ' ao obter capacidades do DVR');
            }

            var capXmlText = await capRes.text();
            var parser = new DOMParser();
            var capDoc = parser.parseFromString(capXmlText, 'text/xml');

            this.sessionID = getNodeText(capDoc, 'sessionID', '');
            var challenge = getNodeText(capDoc, 'challenge', '');
            var iterations = parseInt(getNodeText(capDoc, 'iterations', '100'), 10);
            var isIrreversible = (getNodeText(capDoc, 'isIrreversible', 'false') === 'true');
            var salt = getNodeText(capDoc, 'salt', '');

            if (!challenge) {
                throw new Error('Desafio de autenticação não retornado pelo DVR');
            }

            // Passo 2: Calcular Hash SHA-256 da senha
            var passwordHash = '';
            if (isIrreversible) {
                var h = window.SHA256(this.username + salt + this.password);
                h = window.SHA256(h + challenge);
                for (var i = 2; i < iterations; i++) {
                    h = window.SHA256(h);
                }
                passwordHash = h;
            } else {
                var h2 = window.SHA256(this.password) + challenge;
                for (var j = 1; j < iterations; j++) {
                    h2 = window.SHA256(h2);
                }
                passwordHash = h2;
            }

            // Passo 3: Enviar requisição POST com XML de SessionLogin
            var loginPayload = 
                '<?xml version="1.0" encoding="UTF-8"?>' +
                '<SessionLogin>' +
                '<userName>' + this.username + '</userName>' +
                '<password>' + passwordHash + '</password>' +
                '<sessionID>' + this.sessionID + '</sessionID>' +
                '</SessionLogin>';

            var loginUrl = this.baseUrl + '/ISAPI/Security/sessionLogin?timeStamp=' + Date.now();
            var loginRes = await fetch(loginUrl, {
                method: 'POST',
                headers: this.getAuthHeaders({
                    'Content-Type': 'application/xml'
                }),
                credentials: 'include',
                body: loginPayload
            });

            var loginXmlText = await loginRes.text();
            var loginDoc = parser.parseFromString(loginXmlText, 'text/xml');
            var statusVal = getNodeText(loginDoc, 'statusValue', '');
            var sessionTagVal = getNodeText(loginDoc, 'sessionTag', '');

            if (loginRes.ok && (statusVal === '200' || statusVal === '1')) {
                this.sessionTag = sessionTagVal;
                this.isAuthenticated = true;
                console.log('[DVR] Login realizado com sucesso! SessionTag:', this.sessionTag || 'Cookie ativo');
                this.startHeartbeat();
                return true;
            } else {
                var statusMsg = getNodeText(loginDoc, 'statusString', 'Credenciais inválidas');
                throw new Error('Falha no login (' + statusVal + '): ' + statusMsg);
            }

        } catch (e) {
            console.error('[DVR] Erro no fluxo de login:', e);
            throw e;
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        var self = this;
        this.heartbeatTimer = setInterval(async function() {
            try {
                await fetch(self.baseUrl + '/ISAPI/Security/sessionHeartbeat', {
                    method: 'PUT',
                    headers: self.getAuthHeaders(),
                    credentials: 'include'
                });
            } catch (e) {
                console.warn('[DVR] Erro no heartbeat:', e);
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Consulta informações de hardware do DVR
     */
    async getDeviceInfo() {
        try {
            var res = await fetch(this.baseUrl + '/ISAPI/System/deviceInfo', {
                headers: this.getAuthHeaders(),
                credentials: 'include'
            });

            if (!res.ok) return null;
            var xmlText = await res.text();
            var doc = new DOMParser().parseFromString(xmlText, 'text/xml');

            this.deviceInfo = {
                deviceName: getNodeText(doc, 'deviceName', 'DVR'),
                model: getNodeText(doc, 'model', 'iDS-7216HQHI-M1/XT'),
                serialNumber: getNodeText(doc, 'serialNumber', ''),
                firmwareVersion: getNodeText(doc, 'firmwareVersion', ''),
                manufacturer: getNodeText(doc, 'manufacturer', 'Hikvision')
            };
            return this.deviceInfo;
        } catch (e) {
            console.error('[DVR] Erro ao obter deviceInfo:', e);
            return null;
        }
    }

    /**
     * Lista todos os canais de vídeo disponíveis e o status de sinal
     */
    async getChannels() {
        try {
            var res = await fetch(this.baseUrl + '/ISAPI/System/Video/inputs/channels', {
                headers: this.getAuthHeaders(),
                credentials: 'include'
            });

            if (!res.ok) throw new Error('HTTP ' + res.status);
            var xmlText = await res.text();
            var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
            var nodes = doc.querySelectorAll('VideoInputChannel');

            var channels = [];
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var id = parseInt(getNodeText(node, 'id', '0'), 10);
                var inputPort = parseInt(getNodeText(node, 'inputPort', '0'), 10);
                var defaultName = 'Camera ' + (id < 10 ? '0' + id : id);
                var name = getNodeText(node, 'name', defaultName);
                var resDesc = getNodeText(node, 'resDesc', '').trim();
                var isOnline = (resDesc.indexOf('NO VIDEO') === -1 && resDesc.length > 0);

                channels.push({
                    id: id,
                    inputPort: inputPort,
                    name: name,
                    resDesc: resDesc,
                    isOnline: isOnline,
                    mainStreamChannelId: id * 100 + 1, // Ex: 101, 201
                    subStreamChannelId: id * 100 + 2   // Ex: 102, 202
                });
            }

            this.channels = channels;
            return channels;
        } catch (e) {
            console.error('[DVR] Erro ao obter canais:', e);
            throw e;
        }
    }

    /**
     * Retorna a URL de Snapshot (JPEG) para um canal
     */
    getSnapshotUrl(channelId, streamType) {
        streamType = streamType || 2;
        var chId = channelId * 100 + streamType;
        return this.baseUrl + '/ISAPI/Streaming/channels/' + chId + '/picture?t=' + Date.now();
    }

    /**
     * Busca o snapshot como Blob com os headers de autenticação
     */
    async fetchSnapshotBlob(channelId, streamType) {
        streamType = streamType || 2;
        var url = this.getSnapshotUrl(channelId, streamType);

        var res = await fetch(url, {
            headers: this.getAuthHeaders(),
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Snapshot error HTTP ' + res.status);
        var blob = await res.blob();
        return URL.createObjectURL(blob);
    }

    /**
     * Gera URL RTSP para reprodução de streaming
     */
    getRtspUrl(channelId, streamType) {
        streamType = streamType || 1;
        var chId = channelId * 100 + streamType;
        return 'rtsp://' + encodeURIComponent(this.username) + ':' + encodeURIComponent(this.password) + '@' + this.ip + ':' + this.rtspPort + '/Streaming/Channels/' + chId;
    }
}

window.DvrApiClient = DvrApiClient;
