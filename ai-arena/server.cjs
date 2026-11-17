const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const F = require('./fight.js');
const R = require('./race.js');

const root = path.resolve(__dirname, '..');
const rooms = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, {}, 204);
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return send(res, { error: 'URL无效' }, 400);
  }

  if (url.pathname === '/api/room' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8192) return send(res, { error: '请求过大' }, 413);
    }
    try {
      const b = JSON.parse(body);
      let room = rooms.get(String(b.code || '').trim());

      if (b.action === 'create') {
        let code;
        do {
          code = crypto.randomInt(100000, 1000000).toString();
        } while (rooms.has(code));
        room = {
          code,
          mode: b.mode === 'race' ? 'race' : 'fight',
          players: [],
          inputs: [{}, {}],
          pulseQueue: [{}, {}],
          state: null,
          last: Date.now()
        };
        rooms.set(code, room);
      }

      if (!room) return send(res, { error: '房间不存在或已过期' }, 404);

      if (b.action === 'create' || b.action === 'join') {
        if (room.players.length >= 2) return send(res, { error: '房间已满' }, 409);
        const token = crypto.randomBytes(24).toString('hex');
        room.players.push({
          token,
          id: b.character || 'gpt',
          seen: Date.now(),
          ready: false
        });
        room.last = Date.now();
        return send(res, {
          code: room.code,
          token,
          slot: room.players.length - 1,
          mode: room.mode
        });
      }

      const slot = room.players.findIndex(p => p.token === b.token);
      if (slot < 0) return send(res, { error: '身份校验失效，请重新加入' }, 403);

      room.players[slot].seen = Date.now();
      room.last = Date.now();

      if (b.action === 'ready') {
        room.players[slot].ready = true;
        if (room.players.length === 2 && room.players.every(p => p.ready)) {
          room.state = (room.mode === 'fight' ? F : R).create({
            characters: room.players.map(p => p.id)
          });
          room.players.forEach(p => (p.ready = false));
          room.inputs = [{}, {}];
          room.pulseQueue = [{}, {}];
        }
      }

      if (b.action === 'input') {
        const clean = {};
        const validKeys = ['left', 'right', 'up', 'down', 'jump', 'light', 'heavy', 'special', 'super', 'dash', 'guard', 'grab'];
        for (const k of validKeys) {
          clean[k] = !!b.input?.[k];
        }
        room.inputs[slot] = clean;

        if (Array.isArray(b.pulses)) {
          for (const pk of b.pulses) {
            if (validKeys.includes(pk)) {
              room.pulseQueue[slot][pk] = 3;
            }
          }
        }
      }

      return send(res, {
        state: room.state,
        players: room.players.length,
        ready: room.players.map(p => p.ready),
        disconnected: room.players.some(p => Date.now() - p.seen > 15000)
      });
    } catch {
      return send(res, { error: '请求格式错误' }, 400);
    }
  }

  let reqPath = decodeURIComponent(url.pathname);
  if (reqPath === '/') reqPath = '/web-prototype/index.html';

  const file = path.resolve(root, '.' + reqPath);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return send(res, { error: '禁止访问' }, 403);
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.last > 1800000) {
      rooms.delete(code);
      continue;
    }
    if (r.state && r.players.length === 2 && r.players.every(p => now - p.seen < 15000)) {
      const mergedInputs = [0, 1].map(slot => {
        const inp = { ...r.inputs[slot] };
        const pq = r.pulseQueue[slot];
        for (const k of Object.keys(pq)) {
          if (pq[k] > 0) {
            inp[k] = true;
            pq[k]--;
          }
        }
        return inp;
      });
      (r.mode === 'fight' ? F : R).step(r.state, mergedInputs);
    }
  }
}, 1000 / 60);

const PORT = process.env.PORT || 4173;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`手机联机服务已启动: http://localhost:${PORT}`);
});

module.exports = server;
