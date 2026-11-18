const $ = id => document.getElementById(id);

let session = null;
let input = {};
let pulseBuffer = new Set();
let busy = false;
let pollTimer = null;
const activePointers = new Map();

const query = new URLSearchParams(location.search);
if (query.get('mode') === 'race') $('mode').value = 'race';
if (query.get('room')) {
  $('code').value = query.get('room');
  $('status').textContent = `已自动填入房间码 ${query.get('room')}，请选择角色后点击“加入房间”`;
}

async function api(action, extra = {}) {
  const res = await fetch('/api/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...session, action, ...extra })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '网络请求失败');
  return data;
}

function buildGamepad(mode) {
  const pad = $('pad');
  if (mode === 'fight') {
    pad.innerHTML = `
      <div class="pad-left">
        <button class="pad-btn" data-action="left">←</button>
        <button class="pad-btn" data-action="right">→</button>
        <button class="pad-btn" data-action="down">蹲</button>
        <button class="pad-btn" data-action="jump">跳</button>
      </div>
      <div class="pad-right">
        <button class="pad-btn" data-action="light">轻击</button>
        <button class="pad-btn" data-action="heavy">重击</button>
        <button class="pad-btn" data-action="guard">防御</button>
        <button class="pad-btn" data-action="special">技能</button>
        <button class="pad-btn" data-action="super">必杀</button>
        <button class="pad-btn" data-action="dash">突进</button>
      </div>
    `;
  } else {
    pad.innerHTML = `
      <div class="pad-left">
        <button class="pad-btn" data-action="left">←</button>
        <button class="pad-btn" data-action="right">→</button>
        <button class="pad-btn" data-action="up">加速</button>
        <button class="pad-btn" data-action="down">减速</button>
      </div>
      <div class="pad-right">
        <button class="pad-btn wide" data-action="jump">跳跃</button>
        <button class="pad-btn" data-action="dash">翻滚</button>
        <button class="pad-btn wide" data-action="grab">推搡</button>
      </div>
    `;
  }

  pad.querySelectorAll('.pad-btn').forEach(btn => {
    const action = btn.dataset.action;

    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { btn, action });
      btn.classList.add('active');
      input[action] = true;
      pulseBuffer.add(action);
    });

    const release = e => {
      const record = activePointers.get(e.pointerId);
      if (record) {
        record.btn.classList.remove('active');
        activePointers.delete(e.pointerId);
        const stillHeld = Array.from(activePointers.values()).some(r => r.action === record.action);
        if (!stillHeld) input[record.action] = false;
      }
    };

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  });
}

async function connect(action) {
  try {
    const codeVal = $('code').value.trim();
    if (action === 'join' && codeVal.length !== 6) {
      $('status').textContent = '请输入正确的 6 位数字房间码';
      return;
    }

    $('status').textContent = '正在连接服务器...';
    session = await api(action, {
      code: codeVal,
      mode: $('mode').value,
      character: $('character').value
    });

    $('setup').hidden = true;
    $('room-actions').hidden = false;
    $('status').textContent = `房间号：${session.code}（你是 P${session.slot + 1}）· 等待双方点击准备`;

    buildGamepad(session.mode);
    startPoll();
  } catch (e) {
    $('status').textContent = e.message;
  }
}

$('create').onclick = () => connect('create');
$('join').onclick = () => connect('join');

const sendReady = async () => {
  try {
    await api('ready');
    $('ready').textContent = '已准备，等待对手确认...';
    $('ready').disabled = true;
    $('hud-ready').hidden = true;
    $('status').textContent = `房间号：${session.code} · 你已准备，等待对手`;
  } catch (e) {
    $('status').textContent = e.message;
  }
};

$('ready').onclick = sendReady;
$('hud-ready').onclick = sendReady;

$('share').onclick = async () => {
  const link = `${location.origin}${location.pathname}?room=${session.code}&mode=${session.mode}`;
  try {
    await navigator.clipboard.writeText(link);
    $('status').textContent = `已复制邀请链接（房间码 ${session.code}），快发给微信好友吧！`;
  } catch {
    $('status').textContent = `请手动复制链接发给好友：${link}`;
  }
};

$('hud-exit').onclick = () => {
  clearTimeout(pollTimer);
  session = null;
  input = {};
  activePointers.clear();
  $('game-view').hidden = true;
  $('lobby-view').hidden = false;
  $('setup').hidden = false;
  $('room-actions').hidden = true;
  $('ready').disabled = false;
  $('ready').textContent = '我已准备好（开始对局）';
  $('status').textContent = '已退出房间';
};

function startPoll() {
  clearTimeout(pollTimer);
  poll();
}

async function poll() {
  if (!session) return;
  if (busy) {
    pollTimer = setTimeout(poll, 35);
    return;
  }
  busy = true;
  try {
    const pulses = Array.from(pulseBuffer);
    pulseBuffer.clear();

    const d = await api('input', { input, pulses });

    if (!d.state) {
      $('lobby-view').hidden = false;
      $('game-view').hidden = true;
      $('status').textContent = `房间 ${session.code} · 当前人数 ${d.players}/2 · ${d.ready[session.slot] ? '你已准备' : '请点击准备'}`;
    } else {
      $('lobby-view').hidden = true;
      $('game-view').hidden = false;

      const canvas = $('screen');
      const ctx = canvas.getContext('2d');
      (session.mode === 'fight' ? ArenaRender.fight : ArenaRender.race)(ctx, d.state, false);

      let info = `房间 ${session.code} · P${session.slot + 1}`;
      if (d.disconnected) info += ' · 对方网络波动/暂离';
      if (d.state.phase === 'ended') {
        info += d.state.winner === null ? ' · 平局！' : ` · P${d.state.winner + 1} 获胜！`;
        $('hud-ready').hidden = false;
      } else {
        $('hud-ready').hidden = true;
      }
      $('hud-text').textContent = info;
    }
  } catch (e) {
    $('status').textContent = '网络重连中：' + e.message;
    $('hud-text').textContent = '网络重连中...';
  } finally {
    busy = false;
    if (session) pollTimer = setTimeout(poll, 35);
  }
}

window.addEventListener('blur', () => {
  input = {};
  pulseBuffer.clear();
  activePointers.forEach(r => r.btn.classList.remove('active'));
  activePointers.clear();
});
