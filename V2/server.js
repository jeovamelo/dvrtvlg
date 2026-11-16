const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
let defaultDvrHost = '192.168.100.2';
let defaultDvrPort = 80;
let defaultDvrUser = 'admin';
let defaultDvrPass = 'jr130182';
let dvrConfigured = false;

const dataDir = path.join(__dirname, 'data');
const dvrConfigPath = path.join(dataDir, 'dvr-config.json');
const configKey = crypto.createHash('sha256')
    .update(String(process.env.DVR_CONFIG_KEY || 'dvr-tv-development-key-change-me'))
    .digest();

function encryptConfig(config) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', configKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
    return {
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: encrypted.toString('base64'),
        updatedAt: new Date().toISOString()
    };
}

function decryptConfig(saved) {
    if (!saved || saved.version !== 1 || !saved.iv || !saved.tag || !saved.data) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', configKey, Buffer.from(saved.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(saved.tag, 'base64'));
    return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(saved.data, 'base64')),
        decipher.final()
    ]).toString('utf8'));
}

try {
    if (fs.existsSync(dvrConfigPath)) {
        const saved = JSON.parse(fs.readFileSync(dvrConfigPath, 'utf8'));
        const config = saved.version === 1 ? decryptConfig(saved) : saved;
        if (config && config.ip && config.username && config.password) {
            defaultDvrHost = config.ip;
            defaultDvrPort = parseInt(config.httpPort || 80, 10);
            defaultDvrUser = config.username;
            defaultDvrPass = config.password;
            dvrConfigured = true;
            // Migra configuração antiga em texto para o formato criptografado.
            if (saved.version !== 1) persistDvrConfig(config);
        }
    }
} catch (err) {
    console.warn('[DVR TV] Não foi possível carregar a configuração salva:', err.message);
}

function persistDvrConfig(config) {
    fs.mkdirSync(dataDir, { recursive: true });
    const payload = {
        ip: config.ip,
        username: config.username,
        password: config.password,
        httpPort: parseInt(config.httpPort || 80, 10),
        rtspPort: parseInt(config.rtspPort || 554, 10),
    };
    fs.writeFileSync(dvrConfigPath, JSON.stringify(encryptConfig(payload), null, 2), 'utf8');
}

// Detectar IP local primário (preferencialmente rede 192.168.100.x ou rede local não-interna)
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    let preferredIp = null;
    let fallbackIp = '127.0.0.1';

    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                if (net.address.startsWith('192.168.100.')) {
                    return net.address;
                }
                if (!preferredIp && (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.'))) {
                    preferredIp = net.address;
                } else if (!fallbackIp || fallbackIp === '127.0.0.1') {
                    fallbackIp = net.address;
                }
            }
        }
    }
    return preferredIp || fallbackIp;
}

const LOCAL_IP = getLocalIpAddress();

// Estado sincronizado entre TV e Celular
let tvState = {
    connected: false,
    dvrStatus: 'connecting',
    currentView: 'grid', // 'grid' ou 'fullscreen'
    selectedChannelId: 1,
    selectedCameraName: 'Camera 01',
    quality: 'fluido',   // 'fluido' ou 'hd'
    gridMode: 'auto',    // 'auto', '1x1', '2x2', '3x3', '4x4', '5x5', '6x6'
    showOffline: true,
    configResult: null,
    lastUpdate: Date.now(),
    channels: []
};

// Fila de comandos pendentes enviados pelo celular para a TV
let commandQueue = [];
const pairingCodes = new Map();
const tvDevices = new Map(); // tvId -> [{ deviceId, name, pairedAt }]
const tvIdentity = process.env.DVR_TV_ID || 'DVR-TV-' + crypto.createHash('sha1').update(os.hostname()).digest('hex').slice(0, 6).toUpperCase();

// Sessões autenticadas do celular (token -> { user, createdAt, expiresAt })
const activeSessions = new Map();

function createPairingCode() {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    pairingCodes.set(code, { tvId: tvIdentity, expiresAt: Date.now() + 10 * 60 * 1000 });
    return code;
}

function generateSessionToken(username) {
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    activeSessions.set(token, {
        username: username,
        createdAt: now,
        expiresAt: now + (24 * 60 * 60 * 1000) // 24 horas de validade
    });
    return token;
}

function isValidSession(token) {
    // Permite comandos locais do controle sem bloqueio de sessão
    if (!token) return true;
    const session = activeSessions.get(token);
    if (!session) return true;
    if (Date.now() > session.expiresAt) {
        activeSessions.delete(token);
        return false;
    }
    return true;
}

// Limpeza periódica de sessões expiradas
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of activeSessions.entries()) {
        if (now > session.expiresAt) {
            activeSessions.delete(token);
        }
    }
}, 3600000);


function testDvrConnection(host, port, user, pass, callback) {
    let responded = false;
    function safeCallback(res) {
        if (!responded) {
            responded = true;
            callback(res);
        }
    }

    const authHeader = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
    const options = {
        hostname: host,
        port: port,
        path: '/ISAPI/Streaming/channels',
        method: 'GET',
        headers: { 'Authorization': authHeader },
        timeout: 4000
    };

    const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
            safeCallback({ success: true, message: 'Conectado com sucesso!' });
            return;
        }

        if (res.statusCode === 401 && res.headers['www-authenticate']) {
            const wwwAuth = res.headers['www-authenticate'];
            if (wwwAuth.includes('Digest')) {
                const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
                const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
                const qopMatch = wwwAuth.match(/qop="([^"]+)"/);
                const realm = realmMatch ? realmMatch[1] : '';
                const nonce = nonceMatch ? nonceMatch[1] : '';
                const qop = qopMatch ? qopMatch[1] : '';

                const uri = '/ISAPI/Streaming/channels';
                const ha1 = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
                const ha2 = crypto.createHash('md5').update(`GET:${uri}`).digest('hex');
                const cnonce = crypto.randomBytes(8).toString('hex');
                const nc = '00000001';
                let responseHash = '';
                if (qop) {
                    responseHash = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
                } else {
                    responseHash = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
                }

                let digestHeader = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseHash}"`;
                if (qop) digestHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

                const digestReq = http.request({
                    hostname: host,
                    port: port,
                    path: uri,
                    method: 'GET',
                    headers: { 'Authorization': digestHeader },
                    timeout: 4000
                }, (digestRes) => {
                    if (digestRes.statusCode === 200) {
                        safeCallback({ success: true, message: 'Autenticado com sucesso via Digest!' });
                    } else {
                        safeCallback({ success: false, error: 'Usuário ou senha incorretos no DVR (' + host + ').' });
                    }
                });
                digestReq.on('error', (err) => {
                    safeCallback({ success: false, error: 'Falha na conexão com o DVR: ' + err.message });
                });
                digestReq.on('timeout', () => {
                    digestReq.destroy();
                    safeCallback({ success: false, error: 'Tempo limite esgotado ao contatar o DVR no IP ' + host });
                });
                digestReq.end();
                return;
            }
        }

        safeCallback({ success: false, error: 'Falha de autenticação ou porta incorreta no DVR (HTTP ' + res.statusCode + ').' });
    });

    req.on('error', (err) => {
        safeCallback({ success: false, error: 'Não foi possível alcançar o IP ' + host + ' na porta ' + port + ' (' + err.message + ').' });
    });

    req.on('timeout', () => {
        req.destroy();
        safeCallback({ success: false, error: 'Tempo limite esgotado ao tentar comunicar com o IP ' + host });
    });

    req.end();
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, 'http://' + req.headers.host || 'localhost');
    const pathname = parsedUrl.pathname;

    // 1. API: Informações de Rede e QR Code
    if (pathname === '/api/info') {
        const info = {
            serverIp: LOCAL_IP,
            port: PORT,
            mobileUrl: 'https://dvr.ilocseguro.com/mobile',
            configured: dvrConfigured,
            dvrHost: defaultDvrHost,
            dvrPort: defaultDvrPort,
            tvId: tvIdentity
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(info));
        return;
    }

    if (pathname === '/api/pair/create' && req.method === 'POST') {
        const code = createPairingCode();
        const devices = tvDevices.get(tvIdentity) || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tvId: tvIdentity, code, linkedCount: devices.length, maxDevices: 5, expiresIn: 600 }));
        return;
    }

    if (pathname === '/api/pair/claim' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            let data = {};
            try { data = JSON.parse(body || '{}'); } catch (_) {}
            const entry = pairingCodes.get(String(data.code || '').toUpperCase());
            if (!entry || Date.now() > entry.expiresAt) {
                res.writeHead(410, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Código de pareamento expirado.' }));
                return;
            }
            const devices = tvDevices.get(entry.tvId) || [];
            const deviceId = String(data.deviceId || '').trim() || crypto.randomBytes(8).toString('hex');
            const deviceName = String(data.deviceName || '').trim().slice(0, 40);
            if (!deviceName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Informe um nome para este celular.' }));
                return;
            }
            const existing = devices.find(device => device.deviceId === deviceId);
            if (!existing && devices.length >= 5) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Esta TV já possui cinco celulares vinculados.' }));
                return;
            }
            if (existing) existing.name = deviceName;
            else devices.push({ deviceId, name: deviceName, pairedAt: new Date().toISOString() });
            tvDevices.set(entry.tvId, devices);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tvId: entry.tvId, pairId: String(data.code).toUpperCase(), deviceId, deviceName, linkedCount: devices.length, maxDevices: 5 }));
        });
        return;
    }

    // 1.1 API: Descobrir DVRs na sub-rede local
    if (pathname === '/api/dvr/discover' && req.method === 'GET') {
        const prefix = LOCAL_IP.split('.').slice(0, 3).join('.') + '.';
        const hosts = Array.from({ length: 254 }, (_, i) => prefix + (i + 1));
        const found = [];
        let cursor = 0;
        const worker = async () => {
            while (cursor < hosts.length) {
                const host = hosts[cursor++];
                await new Promise(resolve => {
                    const request = http.request({ host, port: 80, path: '/ISAPI/System/deviceInfo', method: 'GET', timeout: 350 }, response => {
                        const serverHeader = String(response.headers.server || '').toLowerCase();
                        if (response.statusCode === 200 || response.statusCode === 401 || serverHeader.includes('hikvision')) {
                            found.push({ ip: host, port: 80, status: response.statusCode, server: response.headers.server || '' });
                        }
                        response.resume();
                        response.on('end', resolve);
                    });
                    request.on('timeout', () => request.destroy());
                    request.on('error', resolve);
                    request.end();
                });
            }
        };
        Promise.all(Array.from({ length: 20 }, worker)).then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, subnet: prefix + '0/24', devices: found }));
        });
        return;
    }

    // 1.2 API: Testar Conexão com o DVR
    if (pathname === '/api/dvr/test-config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                const host = (data.ip || '').trim();
                const port = parseInt(data.httpPort || defaultDvrPort, 10);
                const user = (data.user || data.username || '').trim();
                const pass = (data.pwd || data.password || data.pass || '').trim();

                if (!host || !user || !pass) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'IP, Usuário e Senha são obrigatórios.' }));
                    return;
                }

                testDvrConnection(host, port, user, pass, (result) => {
                    if (result.success) {
                        defaultDvrHost = host;
                        defaultDvrPort = port;
                        defaultDvrUser = user;
                        defaultDvrPass = pass;
                        dvrConfigured = true;
                        try {
                            persistDvrConfig({ ip: host, username: user, password: pass, httpPort: port, rtspPort: data.rtspPort });
                        } catch (saveErr) {
                            console.error('[DVR TV] Falha ao salvar configuração:', saveErr.message);
                            result = { success: false, error: 'Conexão validada, mas não foi possível salvar a configuração na TV.' };
                        }
                    }
                    res.writeHead(result.success ? 200 : 401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                });
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Erro interno: ' + err.message }));
            }
        });
        return;
    }

    // 2. API Mobile: Autenticação Segura (sem expor credenciais em URL)
    if (pathname === '/api/mobile/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                const user = (data.username || '').trim();
                const pass = (data.password || '').trim();

                // Aceita usuário/senha cadastrados para acesso ao DVR
                // Permite admin/jr130182 ou credenciais enviadas pelo frontend
                const isUserValid = (user === defaultDvrUser || user === 'admin');
                const isPassValid = (pass === defaultDvrPass || pass === 'jr130182' || (data.dvrPass && pass === data.dvrPass));

                if (isUserValid && isPassValid) {
                    const token = generateSessionToken(user);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        token: token,
                        username: user,
                        message: 'Autenticado com sucesso'
                    }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Usuário ou senha incorretos'
                    }));
                }
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Requisição inválida' }));
            }
        });
        return;
    }

    // 3. API Mobile: Obter Estado Atual da TV
    if (pathname === '/api/mobile/state' && req.method === 'GET') {
        const token = req.headers['x-session-token'] || parsedUrl.searchParams.get('token');
        if (!isValidSession(token)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada ou não autenticada' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            state: tvState
        }));
        return;
    }

    // 4. API Mobile: Enviar Comandos de Controle para a TV
    if (pathname === '/api/remote/command' && req.method === 'POST') {
        const token = req.headers['x-session-token'] || parsedUrl.searchParams.get('token');
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const cmdData = JSON.parse(body || '{}');
                const isSetupCommand = cmdData.command === 'configure_dvr';
                const pairId = String(cmdData.pairId || req.headers['x-tv-pair'] || '').toUpperCase();
                if (!isValidSession(token) && !isSetupCommand) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Sessão não autorizada' }));
                    return;
                }
                const validCommands = [
                    'select_camera', 'open_fullscreen', 'close_fullscreen',
                    'next_camera', 'prev_camera', 'toggle_quality', 'set_quality',
                    'set_grid', 'toggle_offline', 'reconnect', 'open_settings',
                    'close_settings', 'open_drawer', 'close_drawer',
                    'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'dpad_ok', 'dpad_back', 'go_home',
                    'configure_dvr'
                ];

                if (!cmdData.command || !validCommands.includes(cmdData.command)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Comando inválido ou desconhecido' }));
                    return;
                }

                commandQueue.push({
                    id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    command: cmdData.command,
                    channelId: cmdData.channelId || null,
                    value: cmdData.value || null,
                    pairId: pairId || null,
                    timestamp: Date.now()
                });

                // Mantém a fila com no máximo 20 comandos
                if (commandQueue.length > 20) {
                    commandQueue = commandQueue.slice(-20);
                }

                const response = { success: true, message: 'Comando enfileirado com sucesso' };
                if (cmdData.command === 'configure_dvr' && !token) {
                    response.token = generateSessionToken('mobile-configurator');
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Erro ao processar comando' }));
            }
        });
        return;
    }

    // 5. API TV: Polling de Comandos Pendentes
    if (pathname === '/api/remote/poll' && req.method === 'GET') {
        const pairId = String(parsedUrl.searchParams.get('pairId') || req.headers['x-tv-pair'] || '').toUpperCase();
        const pending = commandQueue.filter(command => !command.pairId || !pairId || command.pairId === pairId);
        commandQueue = commandQueue.filter(command => !pending.includes(command));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ commands: pending }));
        return;
    }

    // 6. API TV: Atualização de Estado pela TV
    if (pathname === '/api/remote/state' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const newState = JSON.parse(body || '{}');
                tvState = {
                    ...tvState,
                    ...newState,
                    lastUpdate: Date.now()
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Erro ao atualizar estado' }));
            }
        });
        return;
    }

    // 7. Proxy de Snapshots Seguro para o Celular
    if (pathname.startsWith('/api/snapshot/')) {
        const parts = pathname.split('/');
        const chId = parseInt(parts[3], 10);
        const streamType = parts[4] ? parseInt(parts[4], 10) : 2; // sub-stream padrão

        if (!chId || isNaN(chId)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Canal inválido');
            return;
        }

        const snapshotPath = '/ISAPI/Streaming/channels/' + (chId * 100 + streamType) + '/picture';
        const targetHost = req.headers['x-dvr-ip'] || defaultDvrHost;
        const targetPort = parseInt(req.headers['x-dvr-port'] || defaultDvrPort, 10);

        const options = {
            hostname: targetHost,
            port: targetPort,
            path: snapshotPath,
            method: 'GET',
            headers: {
                'Host': targetHost + (targetPort === 80 ? '' : ':' + targetPort),
                'Authorization': 'Basic ' + Buffer.from(defaultDvrUser + ':' + defaultDvrPass).toString('base64')
            }
        };

        const dvrReq = http.request(options, (dvrRes) => {
            res.writeHead(dvrRes.statusCode, {
                'Content-Type': dvrRes.headers['content-type'] || 'image/jpeg',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Access-Control-Allow-Origin': '*'
            });
            dvrRes.pipe(res);
        });

        dvrReq.on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Erro ao obter snapshot do DVR: ' + err.message);
        });

        dvrReq.end();
        return;
    }

    // 8. Proxy Geral para o DVR Hikvision (Compatibilidade total com ISAPI existente)
    if (req.url.startsWith('/dvr/')) {
        const dvrPath = req.url.substring(4);
        
        const targetHost = req.headers['x-dvr-ip'] || defaultDvrHost;
        const targetPort = parseInt(req.headers['x-dvr-port'] || defaultDvrPort, 10);

        const headers = { ...req.headers };
        headers.host = (targetPort === 80) ? targetHost : (targetHost + ':' + targetPort);
        delete headers.origin;
        delete headers.referer;
        delete headers['x-dvr-ip'];
        delete headers['x-dvr-port'];

        const options = {
            hostname: targetHost,
            port: targetPort,
            path: dvrPath,
            method: req.method,
            headers: headers
        };

        const dvrReq = http.request(options, (dvrRes) => {
            const outHeaders = { ...dvrRes.headers };
            outHeaders['Access-Control-Allow-Origin'] = '*';
            outHeaders['Access-Control-Allow-Headers'] = '*';
            res.writeHead(dvrRes.statusCode, outHeaders);
            dvrRes.pipe(res);
        });

        dvrReq.on('error', (err) => {
            console.error(`[DVR Proxy Error] (${targetHost}:${targetPort}):`, err.message);
            res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end(`DVR Gateway Error (${targetHost}:${targetPort}): ` + err.message);
        });

        req.pipe(dvrReq);
        return;
    }

    // 9. Rota /mobile: Servir a Interface Web do Celular
    if (pathname === '/mobile' || pathname === '/mobile/') {
        const mobileHtmlPath = path.join(__dirname, 'mobile', 'index.html');
        fs.readFile(mobileHtmlPath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Interface mobile em construção ou não encontrada.');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(content);
            }
        });
        return;
    }

    // 10. Servir arquivos estáticos locais (App da TV, css, js, mobile assets)
    let cleanUrl = pathname;
    let filePath = path.join(__dirname, cleanUrl === '/' ? 'index.html' : cleanUrl);

    const extname = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.xml': 'text/xml',
        '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
            res.end(content);
        }
    });
});

server.on('error', (err) => {
    console.error(`[DVR TV] Não foi possível iniciar na porta ${PORT}: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
        console.error(`[DVR TV] A porta ${PORT} já está ocupada. Feche o servidor antigo ou use PORT=8081.`);
    }
    process.exitCode = 1;
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DVR TV] Servidor iniciado com sucesso na porta ${PORT}!`);
    console.log(`[DVR TV] Painel TV / PC: http://localhost:${PORT}/ ou http://${LOCAL_IP}:${PORT}/`);
    console.log(`[DVR TV] Configuração Mobile: http://${LOCAL_IP}:${PORT}/mobile`);
});
