/* The Quiet Archive — engine.
   Top-down stealth: move Wren through three archive rooms, take every
   seal-stamp, reach the exit unseen. Wardens patrol with amber vision cones;
   shelves block their sight, shadow pools hide you inside a cone, and
   running is loud. All art is drawn in code; all sound is synthesised.
   No randomness in play: patrols, maps and shading are fixed. */
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlayEl = document.getElementById('overlay');
const hudLevel = document.getElementById('hud-level');
const hudStamps = document.getElementById('hud-stamps');
const hudTime = document.getElementById('hud-time');
const hudSound = document.getElementById('hud-sound');

const W = 1280;
const H = 480;
const VIEW_RANGE = 175;
const VIEW_HALF = (38 * Math.PI) / 180;
const PLAYER_R = 11;
const RUN_SPEED = 150;
const SNEAK_SPEED = 72;
const NOISE_RADIUS = 95;

/* A tiny deterministic hash for per-tile shading (no Math.random in play). */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

const game = {
  state: 'title', // title | intro | play | paused | caught | levelclear | win
  levelIndex: 0,
  level: null,
  player: null,
  keys: {},
  clickTarget: null,
  alarm: 0,
  alerts: 0,
  time: 0,
  totalTime: 0,
  toast: '',
  toastUntil: 0,
  stepAcc: 0,
  lastTs: 0,
};

function isSolid(level, px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows) return true;
  return level.solid[ty][tx];
}

function inShadow(level, px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows) return false;
  return level.shadow[ty][tx];
}

function circleHitsSolid(level, x, y, r) {
  // Check the tiles the circle's box overlaps; any solid tile whose box the
  // circle actually reaches counts as a hit.
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows) return true;
      if (!level.solid[ty][tx]) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

function moveCircle(level, obj, dx, dy, r) {
  const nx = obj.x + dx;
  if (!circleHitsSolid(level, nx, obj.y, r)) obj.x = nx;
  const ny = obj.y + dy;
  if (!circleHitsSolid(level, obj.x, ny, r)) obj.y = ny;
}

/** Line of sight between two points: shelves block it. Sampled every 8 px. */
function losClear(level, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolid(level, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function loadLevel(index) {
  const def = LEVELS[index];
  const level = parseLevel(def);
  level.def = def;
  game.level = level;
  game.levelIndex = index;
  game.player = {
    x: (level.start.x + 0.5) * TILE,
    y: (level.start.y + 0.5) * TILE,
    dir: 0,
    moving: false,
    sneaking: false,
    hidden: false,
  };
  game.clickTarget = null;
  game.alarm = 0;
  game.time = 0;
  game.toast = '';
  hudLevel.textContent = `Level ${index + 1} · ${level.name}`;
  updateStampsHud();
}

function updateStampsHud() {
  const left = game.level.stamps.filter((s) => !s.taken).length;
  const total = game.level.stamps.length;
  hudStamps.textContent = `Seals ${total - left} / ${total}`;
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function showOverlay(html) {
  overlayEl.innerHTML = html;
  overlayEl.classList.remove('hidden');
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
  overlayEl.innerHTML = '';
}

function showTitle() {
  game.state = 'title';
  showOverlay(`
    <h2>The Quiet Archive</h2>
    <p>You are Wren, a courier with one job: take the seal-stamps from the
    night archive and leave without a single warden seeing you.</p>
    <p>Amber cones are what the wardens can see. Shelves block their sight.
    Dark pools hide you even inside a cone. Hold <b>Shift</b> to sneak —
    running is loud, and nearby wardens will turn to look.</p>
    <p class="keys">Move: WASD or arrows · Sneak: Shift · Click to walk there · R restart · P pause · M mute</p>
    <button id="ov-start">Begin — Level ${game.levelIndex + 1}</button>`);
  document.getElementById('ov-start').addEventListener('click', () => {
    ArchiveAudio.unlock();
    ArchiveAudio.click();
    startLevel(game.levelIndex);
  });
}

function showIntro(index) {
  game.state = 'intro';
  const level = game.level;
  showOverlay(`
    <h2>Level ${index + 1} · ${level.name}</h2>
    <p>${level.intro}</p>
    <p class="keys">Seals to take: ${level.stamps.length} · Wardens on patrol: ${level.wardens.length}</p>
    <button id="ov-go">Enter the room</button>`);
  document.getElementById('ov-go').addEventListener('click', () => {
    ArchiveAudio.unlock();
    ArchiveAudio.click();
    game.state = 'play';
    hideOverlay();
  });
}

function startLevel(index) {
  loadLevel(index);
  showIntro(index);
}

function showCaught() {
  game.state = 'caught';
  ArchiveAudio.caught();
  showOverlay(`
    <h2>Seen!</h2>
    <p>A warden caught you in the lamplight. The archive keeps its seals —
    this time.</p>
    <p class="keys">Level ${game.levelIndex + 1} · ${game.level.name} · ${fmtTime(game.time)}</p>
    <button id="ov-retry">Try the room again (R)</button>`);
  document.getElementById('ov-retry').addEventListener('click', () => {
    ArchiveAudio.click();
    startLevel(game.levelIndex);
  });
}

function showLevelClear() {
  game.state = 'levelclear';
  game.totalTime += game.time;
  ArchiveAudio.win();
  const last = game.levelIndex === LEVELS.length - 1;
  showOverlay(`
    <h2>${last ? 'The Archive Is Yours' : 'Out Unseen'}</h2>
    <p>${last
      ? `Every seal taken, every room crossed, never once seen. Wren slips into the night with the archive's four seals.`
      : `You reached the east door with all ${game.level.stamps.length} seals. The next room waits.`}</p>
    <p class="keys">Level time ${fmtTime(game.time)} · Total ${fmtTime(game.totalTime)} · Times spotted ${game.alerts}</p>
    <button id="ov-next">${last ? 'See the ending' : 'Next room'}</button>`);
  document.getElementById('ov-next').addEventListener('click', () => {
    ArchiveAudio.click();
    if (last) showWin();
    else startLevel(game.levelIndex + 1);
  });
}

function showWin() {
  game.state = 'win';
  showOverlay(`
    <h2>The Quiet Archive</h2>
    <p>Three rooms. ${LEVELS.reduce((n, l) => n + l.stamps, 0)} seals. Zero alarms that mattered.
    The wardens will find the shelves undisturbed and the seals gone — and
    never know Wren was there at all.</p>
    <p class="keys">Total time ${fmtTime(game.totalTime)} · Times spotted ${game.alerts}</p>
    <button id="ov-again">Play again from Level 1</button>`);
  document.getElementById('ov-again').addEventListener('click', () => {
    ArchiveAudio.click();
    game.totalTime = 0;
    game.alerts = 0;
    startLevel(0);
  });
}

function toast(msg, seconds = 2.5) {
  game.toast = msg;
  game.toastUntil = game.time + seconds;
}

function updatePlayer(dt) {
  const p = game.player;
  const level = game.level;
  let dx = 0;
  let dy = 0;
  if (game.keys['arrowup'] || game.keys['w']) dy -= 1;
  if (game.keys['arrowdown'] || game.keys['s']) dy += 1;
  if (game.keys['arrowleft'] || game.keys['a']) dx -= 1;
  if (game.keys['arrowright'] || game.keys['d']) dx += 1;
  const keyMove = dx !== 0 || dy !== 0;
  if (keyMove) game.clickTarget = null;
  if (!keyMove && game.clickTarget) {
    const tx = game.clickTarget.x - p.x;
    const ty = game.clickTarget.y - p.y;
    const d = Math.hypot(tx, ty);
    if (d < 6) {
      game.clickTarget = null;
    } else {
      dx = tx / d;
      dy = ty / d;
    }
  }
  const len = Math.hypot(dx, dy);
  p.moving = len > 0;
  p.sneaking = !!game.keys['shift'];
  if (p.moving) {
    const speed = p.sneaking ? SNEAK_SPEED : RUN_SPEED;
    const nx = (dx / len) * speed * dt;
    const ny = (dy / len) * speed * dt;
    moveCircle(level, p, nx, ny, PLAYER_R);
    p.dir = Math.atan2(dy, dx);
    game.stepAcc += speed * dt;
    if (game.stepAcc > 26) {
      game.stepAcc = 0;
      ArchiveAudio.step(p.sneaking);
    }
    // Running is loud: wardens nearby turn to look.
    if (!p.sneaking) {
      for (const w of level.wardens) {
        const d = Math.hypot(w.x - p.x, w.y - p.y);
        if (d < NOISE_RADIUS && losClear(level, w.x, w.y, p.x, p.y)) {
          w.suspicion = Math.min(1, w.suspicion + 0.25 * dt);
          if (w.state === 'patrol') {
            w.state = 'suspicious';
            w.lastSeen = { x: p.x, y: p.y };
          }
        }
      }
    }
  }
  p.hidden = inShadow(level, p.x, p.y);

  // Pick up seals.
  for (const s of level.stamps) {
    if (s.taken) continue;
    const sx = (s.x + 0.5) * TILE;
    const sy = (s.y + 0.5) * TILE;
    if (Math.hypot(sx - p.x, sy - p.y) < 22) {
      s.taken = true;
      ArchiveAudio.pickup();
      updateStampsHud();
      const left = level.stamps.filter((st) => !st.taken).length;
      if (left === 0) {
        ArchiveAudio.unlock_exit();
        toast('All seals taken — the east door stands open.');
      } else {
        toast(`Seal taken. ${left} left.`);
      }
    }
  }

  // Reach the exit.
  const ex = (level.exit.x + 0.5) * TILE;
  const ey = (level.exit.y + 0.5) * TILE;
  if (Math.hypot(ex - p.x, ey - p.y) < 24) {
    const left = level.stamps.filter((s) => !s.taken).length;
    if (left === 0) {
      showLevelClear();
    } else if (game.time > (game._exitNag || 0)) {
      game._exitNag = game.time + 3;
      toast(`The door is sealed. ${left} seal${left === 1 ? '' : 's'} still inside.`);
    }
  }
}

function updateWardens(dt) {
  const level = game.level;
  const p = game.player;
  let maxSuspicion = 0;
  for (const w of level.wardens) {
    const dx = p.x - w.x;
    const dy = p.y - w.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    const inCone = dist < VIEW_RANGE && Math.abs(angleDiff(toPlayer, w.dir)) < VIEW_HALF;
    const seen = inCone && losClear(level, w.x, w.y, p.x, p.y) && !p.hidden;

    if (seen) {
      const closeness = 1.15 - dist / VIEW_RANGE;
      const rate = (p.sneaking ? 0.55 : 1) * closeness * 1.5;
      const before = w.suspicion;
      w.suspicion = Math.min(1, w.suspicion + rate * dt);
      if (before <= 0.45 && w.suspicion > 0.45 && w.state === 'patrol') {
        w.state = 'suspicious';
        ArchiveAudio.alert();
        game.alerts++;
      }
      if (w.suspicion > 0.75 && w.state !== 'chase') w.state = 'chase';
      if (w.state === 'chase' || w.state === 'suspicious') w.lastSeen = { x: p.x, y: p.y };
    } else {
      w.suspicion = Math.max(0, w.suspicion - 0.45 * dt);
      if (w.state === 'suspicious' && w.suspicion <= 0.2) w.state = 'patrol';
      if (w.state === 'chase' && w.suspicion <= 0.35) {
        w.state = 'search';
        w.wait = 1.4;
      }
    }
    maxSuspicion = Math.max(maxSuspicion, w.suspicion);

    if (w.state === 'patrol') {
      if (w.wait > 0) {
        w.wait -= dt;
      } else {
        const target = w.waypoints[w.wp];
        const tdx = target.x - w.x;
        const tdy = target.y - w.y;
        const td = Math.hypot(tdx, tdy);
        if (td < 4) {
          w.wp += w.wpDir;
          if (w.wp >= w.waypoints.length || w.wp < 0) {
            w.wpDir *= -1;
            w.wp += w.wpDir * 2;
          }
          w.wait = 0.7;
        } else {
          const step = (w.speed * dt) / td;
          moveCircle(level, w, tdx * step, tdy * step, 12);
          w.dir = Math.atan2(tdy, tdx);
        }
      }
    } else if (w.state === 'suspicious') {
      // Turn to face the last seen spot, but hold position.
      if (w.lastSeen) {
        const want = Math.atan2(w.lastSeen.y - w.y, w.lastSeen.x - w.x);
        w.dir += angleDiff(want, w.dir) * Math.min(1, dt * 6);
      }
    } else if (w.state === 'chase') {
      if (w.lastSeen) {
        const tdx = w.lastSeen.x - w.x;
        const tdy = w.lastSeen.y - w.y;
        const td = Math.hypot(tdx, tdy);
        if (td > 6) {
          const step = ((w.speed * 1.35) * dt) / td;
          moveCircle(level, w, tdx * step, tdy * step, 12);
          w.dir = Math.atan2(tdy, tdx);
        }
      }
    } else if (w.state === 'search') {
      w.wait -= dt;
      w.dir += dt * 1.5;
      if (w.wait <= 0) w.state = 'patrol';
    }
  }
  game.alarm = maxSuspicion;
  if (game.alarm >= 1) showCaught();
}

function update(dt) {
  if (game.state !== 'play') return;
  game.time += dt;
  hudTime.textContent = fmtTime(game.time);
  updatePlayer(dt);
  if (game.state !== 'play') return;
  updateWardens(dt);
}

/* ---------------------------------------------------------- rendering */

function drawFloor(level) {
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const px = x * TILE;
      const py = y * TILE;
      if (level.solid[y][x]) continue;
      const shade = hash2(x, y);
      ctx.fillStyle = shade < 0.5 ? '#1a2233' : '#1c2436';
      ctx.fillRect(px, py, TILE, TILE);
      if (level.shadow[y][x]) {
        ctx.fillStyle = 'rgba(8, 10, 26, 0.55)';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(90, 110, 190, 0.10)';
        ctx.beginPath();
        ctx.ellipse(px + TILE / 2, py + TILE / 2, 13, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Faint floorboard seams.
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.beginPath();
        ctx.moveTo(px, py + TILE - 0.5);
        ctx.lineTo(px + TILE, py + TILE - 0.5);
        ctx.stroke();
      }
    }
  }
}

function drawShelves(level) {
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      if (!level.solid[y][x]) continue;
      const px = x * TILE;
      const py = y * TILE;
      const edge = hash2(x, y) < 0.5;
      ctx.fillStyle = edge ? '#3a2c1c' : '#33271a';
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = '#4a3a26';
      ctx.fillRect(px + 3, py + 3, TILE - 6, 5);
      // Book spines: deterministic stripes.
      for (let i = 0; i < 5; i++) {
        const h = hash2(x * 5 + i, y);
        ctx.fillStyle = ['#6b4a2f', '#7a5a35', '#54401f', '#8a6a3f', '#5d3a28'][Math.floor(h * 5)];
        ctx.fillRect(px + 4 + i * 5, py + 12, 4, 16);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px + 1, py + TILE - 5, TILE - 2, 4);
    }
  }
}

function drawVisionCone(w) {
  const alpha = w.state === 'chase' ? 0.34 : w.state === 'suspicious' ? 0.26 : 0.16;
  ctx.beginPath();
  ctx.moveTo(w.x, w.y);
  ctx.arc(w.x, w.y, VIEW_RANGE, w.dir - VIEW_HALF, w.dir + VIEW_HALF);
  ctx.closePath();
  ctx.fillStyle = `rgba(242, 190, 80, ${alpha})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(242, 190, 80, ${alpha + 0.12})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawWarden(w) {
  drawVisionCone(w);
  // Body: dark uniform with a brass button.
  ctx.beginPath();
  ctx.arc(w.x, w.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#2c3e5e';
  ctx.fill();
  ctx.strokeStyle = '#d8cfae';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Facing nose.
  ctx.beginPath();
  ctx.moveTo(w.x + Math.cos(w.dir) * 12, w.y + Math.sin(w.dir) * 12);
  ctx.lineTo(w.x + Math.cos(w.dir + 2.6) * 8, w.y + Math.sin(w.dir + 2.6) * 8);
  ctx.lineTo(w.x + Math.cos(w.dir - 2.6) * 8, w.y + Math.sin(w.dir - 2.6) * 8);
  ctx.closePath();
  ctx.fillStyle = '#d8cfae';
  ctx.fill();
  // Cap brim.
  ctx.beginPath();
  ctx.arc(w.x, w.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#1a2438';
  ctx.fill();
  // Alert mark.
  if (w.suspicion > 0.45) {
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = w.state === 'chase' ? '#ff5a4a' : '#f2be50';
    ctx.fillText(w.state === 'chase' ? '!' : '?', w.x, w.y - 18);
  }
}

function drawStamps(level) {
  for (const s of level.stamps) {
    if (s.taken) continue;
    const cx = (s.x + 0.5) * TILE;
    const cy = (s.y + 0.5) * TILE;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(242, 217, 140, 0.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f2d98c';
    ctx.fill();
    ctx.strokeStyle = '#8a6a3f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4a3410';
    ctx.fillText('S', cx, cy + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawExit(level) {
  const open = level.stamps.every((s) => s.taken);
  const cx = (level.exit.x + 0.5) * TILE;
  const cy = (level.exit.y + 0.5) * TILE;
  ctx.fillStyle = open ? 'rgba(120, 220, 140, 0.25)' : 'rgba(200, 80, 60, 0.18)';
  ctx.fillRect(cx - 16, cy - 16, 32, 32);
  ctx.strokeStyle = open ? '#7ed48a' : '#c85a4a';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 14, cy - 14, 28, 28);
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = open ? '#a9e8b4' : '#e8a49a';
  ctx.fillText(open ? 'EXIT' : 'SEALED', cx, cy - 20);
  // Door.
  ctx.fillStyle = open ? '#20301f' : '#3a1f1a';
  ctx.fillRect(cx - 7, cy - 10, 14, 20);
  ctx.fillStyle = open ? '#7ed48a' : '#8a4a3f';
  ctx.fillRect(cx + 3, cy - 2, 3, 3);
}

function drawPlayer() {
  const p = game.player;
  // Lantern glow.
  const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 46);
  glow.addColorStop(0, 'rgba(242, 217, 140, 0.20)');
  glow.addColorStop(1, 'rgba(242, 217, 140, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 46, 0, Math.PI * 2);
  ctx.fill();
  // Hooded cloak.
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 13);
  ctx.lineTo(p.x + 10, p.y + 9);
  ctx.lineTo(p.x - 10, p.y + 9);
  ctx.closePath();
  ctx.fillStyle = p.hidden ? '#3d4a68' : '#5a6c8c';
  ctx.fill();
  ctx.strokeStyle = '#d8cfae';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Face.
  ctx.beginPath();
  ctx.arc(p.x, p.y - 3, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#e8d9b0';
  ctx.fill();
  // Sneak indicator.
  if (p.sneaking) {
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ab8e8';
    ctx.fillText('sneaking', p.x, p.y + 24);
  } else if (p.hidden) {
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ab8e8';
    ctx.fillText('hidden', p.x, p.y + 24);
  }
  // Click target marker.
  if (game.clickTarget) {
    ctx.beginPath();
    ctx.arc(game.clickTarget.x, game.clickTarget.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(216, 207, 174, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(game.clickTarget.x - 9, game.clickTarget.y);
    ctx.lineTo(game.clickTarget.x + 9, game.clickTarget.y);
    ctx.moveTo(game.clickTarget.x, game.clickTarget.y - 9);
    ctx.lineTo(game.clickTarget.x, game.clickTarget.y + 9);
    ctx.stroke();
  }
}

function drawAlarm() {
  if (game.state !== 'play') return;
  const a = game.alarm;
  if (a <= 0.02) return;
  const w = 260;
  const x = (W - w) / 2;
  const y = 10;
  ctx.fillStyle = 'rgba(8, 10, 15, 0.7)';
  ctx.fillRect(x - 6, y - 6, w + 12, 26);
  ctx.fillStyle = '#33241f';
  ctx.fillRect(x, y, w, 14);
  ctx.fillStyle = a > 0.75 ? '#ff5a4a' : '#f2be50';
  ctx.fillRect(x, y, w * a, 14);
  ctx.font = '12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#efe6c2';
  ctx.fillText(a > 0.75 ? 'SPOTTED — RUN!' : 'a warden suspects something…', W / 2, y + 32);
}

function drawToast() {
  if (!game.toast || game.time > game.toastUntil) return;
  ctx.font = '15px Georgia, serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(game.toast).width + 24;
  ctx.fillStyle = 'rgba(8, 10, 15, 0.78)';
  ctx.fillRect((W - tw) / 2, H - 44, tw, 28);
  ctx.fillStyle = '#efe6c2';
  ctx.fillText(game.toast, W / 2, H - 25);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#141a24';
  ctx.fillRect(0, 0, W, H);
  const level = game.level;
  if (!level) return;
  drawFloor(level);
  drawExit(level);
  drawStamps(level);
  for (const w of level.wardens) drawWarden(w);
  drawPlayer();
  drawShelves(level);
  drawAlarm();
  drawToast();
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - game.lastTs) / 1000 || 0);
  game.lastTs = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------- input */

function keyName(e) {
  return e.key.toLowerCase();
}

window.addEventListener('keydown', (e) => {
  const k = keyName(e);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  game.keys[k] = true;
  if (k === 'm') {
    const muted = ArchiveAudio.toggleMute();
    hudSound.textContent = `Sound: ${muted ? 'off' : 'on'} (M)`;
  }
  if (k === 'p' && game.state === 'play') {
    game.state = 'paused';
    showOverlay('<h2>Paused</h2><p>Take a breath. The wardens wait.</p><button id="ov-resume">Keep sneaking (P)</button>');
    document.getElementById('ov-resume').addEventListener('click', () => {
      game.state = 'play';
      hideOverlay();
    });
  } else if (k === 'p' && game.state === 'paused') {
    game.state = 'play';
    hideOverlay();
  }
  if (k === 'r' && (game.state === 'play' || game.state === 'caught' || game.state === 'paused')) {
    startLevel(game.levelIndex);
  }
  if (k === 'enter' && game.state === 'title') {
    ArchiveAudio.unlock();
    startLevel(game.levelIndex);
  }
});

window.addEventListener('keyup', (e) => {
  game.keys[keyName(e)] = false;
});

canvas.addEventListener('mousedown', (e) => {
  ArchiveAudio.unlock();
  if (game.state !== 'play') return;
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  game.clickTarget = { x, y };
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* Read-only handle for play-testing and screenshots: state, never a cheat. */
window.__game = {
  get state() { return game.state; },
  get level() { return game.levelIndex + 1; },
  get alarm() { return game.alarm; },
  get stampsLeft() {
    return game.level ? game.level.stamps.filter((s) => !s.taken).length : 0;
  },
  get player() {
    return game.player ? { x: Math.round(game.player.x), y: Math.round(game.player.y) } : null;
  },
  get time() { return game.time; },
};

/* ---------------------------------------------------------- boot */

(function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mute') === '1') {
    ArchiveAudio.toggleMute();
    hudSound.textContent = 'Sound: off (M)';
  }
  const startLevelParam = parseInt(params.get('level') || '1', 10);
  const startAt = Number.isInteger(startLevelParam) && startLevelParam >= 1 && startLevelParam <= LEVELS.length
    ? startLevelParam - 1
    : 0;
  loadLevel(startAt);
  showTitle();
  requestAnimationFrame((ts) => {
    game.lastTs = ts;
    requestAnimationFrame(loop);
  });
})();
