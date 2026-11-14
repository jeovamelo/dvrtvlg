const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const DEFAULT_DVR_HOST = '192.168.100.2';
const DEFAULT_DVR_PORT = 80;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Proxy dinâmico para o DVR Hikvision
    if (req.url.startsWith('/dvr/')) {
        const dvrPath = req.url.substring(4);

        // Suporte a IP e porta dinâmicos configurados no App
        let targetHost = DEFAULT_DVR_HOST;
        let targetPort = DEFAULT_DVR_PORT;

        if (req.headers['x-dvr-target']) {
            const parts = req.headers['x-dvr-target'].split(':');
            targetHost = parts[0] || DEFAULT_DVR_HOST;
            targetPort = parseInt(parts[1] || DEFAULT_DVR_PORT, 10);
        } else if (req.headers['x-dvr-host']) {
            targetHost = req.headers['x-dvr-host'];
            if (req.headers['x-dvr-port']) {
                targetPort = parseInt(req.headers['x-dvr-port'], 10);
            }
        }

        const headers = { ...req.headers };
        headers.host = targetHost + (targetPort === 80 ? '' : (':' + targetPort));
        delete headers.origin;
        delete headers.referer;
        delete headers['x-dvr-target'];
        delete headers['x-dvr-host'];
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
            console.error(`[DVR Proxy] Erro (${targetHost}:${targetPort}):`, err.message);
            res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end(`DVR Gateway Error (${targetHost}:${targetPort}): ` + err.message);
        });

        req.pipe(dvrReq);
        return;
    }

    // Servir arquivos estáticos locais
    let cleanUrl = req.url.split('?')[0];
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
        '.xml': 'text/xml',
        '.ipk': 'application/vnd.apple.installer+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DVR TV] Servidor rodando com sucesso em http://localhost:${PORT}/`);
});
