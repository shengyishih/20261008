(() => {
  'use strict';

  const COLS = 10, ROWS = 20, BLOCK = 30;
  const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
  };
  const COLORS = { I: '#58dce5', O: '#f0d45e', T: '#b58aff', S: '#7be0a3', Z: '#ff718c', J: '#6e9aff', L: '#ffa55e' };
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const nextCanvas = document.getElementById('nextCanvas');
  const nextCtx = nextCanvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  let board, current, nextType, bag = [], score = 0, lines = 0, level = 1, pieceNumber = 0;
  let running = false, paused = false, lastTime = 0, dropCounter = 0, raf = 0;
  let soundOn = true, audio;
  let best = Number(localStorage.getItem('blockAfterDarkBest') || 0);

  const $ = id => document.getElementById(id);
  const format = n => String(n).padStart(6, '0');

  function shuffleBag() {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  function takeType() { if (!bag.length) shuffleBag(); return bag.pop(); }
  function makePiece(type) {
    const matrix = SHAPES[type].map(row => [...row]);
    return { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: -1 };
  }
  function reset() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = []; score = 0; lines = 0; level = 1; pieceNumber = 0;
    nextType = takeType(); spawn(); updateStats(); draw(); drawNext();
  }
  function spawn() {
    current = makePiece(nextType);
    nextType = takeType(); pieceNumber++;
    drawNext(); updateStats();
    if (collides(current, 0, 0, current.matrix)) endGame();
  }
  function collides(piece, dx, dy, matrix) {
    for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const bx = piece.x + x + dx, by = piece.y + y + dy;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
    return false;
  }
  function rotate(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
  }
  function move(dx) {
    if (!running || paused) return;
    if (!collides(current, dx, 0, current.matrix)) { current.x += dx; tone(220, .025); draw(); }
  }
  function rotatePiece() {
    if (!running || paused) return;
    const rotated = rotate(current.matrix);
    for (const kick of [0, -1, 1, -2, 2]) if (!collides(current, kick, 0, rotated)) {
      current.x += kick; current.matrix = rotated; tone(360, .045); draw(); return;
    }
  }
  function stepDown(manual = false) {
    if (!running || paused) return;
    if (!collides(current, 0, 1, current.matrix)) {
      current.y++;
      if (manual) { score += 1; updateStats(); }
    } else lockPiece();
    draw();
  }
  function hardDrop() {
    if (!running || paused) return;
    let distance = 0;
    while (!collides(current, 0, 1, current.matrix)) { current.y++; distance++; }
    score += distance * 2; tone(120, .08); lockPiece(); draw();
  }
  function lockPiece() {
    current.matrix.forEach((row, y) => row.forEach((cell, x) => {
      const by = current.y + y, bx = current.x + x;
      if (cell && by >= 0) board[by][bx] = current.type;
    }));
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) if (board[y].every(Boolean)) {
      board.splice(y, 1); board.unshift(Array(COLS).fill(null)); cleared++; y++;
    }
    if (cleared) {
      const points = [0, 100, 300, 500, 800][cleared] * level;
      score += points; lines += cleared; level = Math.floor(lines / 10) + 1;
      tone(cleared === 4 ? 740 : 520, .12);
      $('statusText').textContent = cleared === 4 ? 'TETRIS! NICE WORK' : `${cleared} LINE${cleared > 1 ? 'S' : ''} CLEARED`;
      setTimeout(() => { if (running && !paused) $('statusText').textContent = 'LIVE SESSION'; }, 1000);
    } else tone(160, .035);
    if (score > best) { best = score; localStorage.setItem('blockAfterDarkBest', String(best)); }
    spawn(); updateStats();
  }
  function cell(x, y, type, alpha = 1) {
    const inset = 1.6, px = x * BLOCK, py = y * BLOCK;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLORS[type];
    ctx.fillRect(px + inset, py + inset, BLOCK - inset * 2, BLOCK - inset * 2);
    ctx.fillStyle = '#ffffff35'; ctx.fillRect(px + inset + 2, py + inset + 2, BLOCK - inset * 2 - 4, 2);
    ctx.fillStyle = '#00000022'; ctx.fillRect(px + inset + 2, py + BLOCK - 5, BLOCK - inset * 2 - 4, 2);
    ctx.globalAlpha = 1;
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#11111b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * BLOCK + .5, 0); ctx.lineTo(x * BLOCK + .5, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * BLOCK + .5); ctx.lineTo(canvas.width, y * BLOCK + .5); ctx.stroke(); }
    board.forEach((row, y) => row.forEach((type, x) => { if (type) cell(x, y, type); }));
    if (!current) return;
    let ghostY = current.y;
    while (!collides(current, 0, ghostY - current.y + 1, current.matrix)) ghostY++;
    current.matrix.forEach((row, y) => row.forEach((v, x) => {
      if (v && ghostY + y >= 0) {
        ctx.strokeStyle = COLORS[current.type] + '65';
        ctx.lineWidth = 1.5;
        ctx.strokeRect((current.x + x) * BLOCK + 4, (ghostY + y) * BLOCK + 4, BLOCK - 8, BLOCK - 8);
      }
    }));
    current.matrix.forEach((row, y) => row.forEach((v, x) => { if (v && current.y + y >= 0) cell(current.x + x, current.y + y, current.type); }));
  }
  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const matrix = SHAPES[nextType];
    const size = 20, width = matrix[0].length * size, height = matrix.length * size;
    const ox = (nextCanvas.width - width) / 2, oy = (nextCanvas.height - height) / 2;
    matrix.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      nextCtx.fillStyle = COLORS[nextType]; nextCtx.fillRect(ox + x * size + 1, oy + y * size + 1, size - 3, size - 3);
      nextCtx.fillStyle = '#ffffff35'; nextCtx.fillRect(ox + x * size + 3, oy + y * size + 3, size - 7, 2);
    }));
  }
  function updateStats() {
    $('score').textContent = format(score); $('best').textContent = format(best);
    $('level').textContent = String(level).padStart(2, '0'); $('lines').textContent = String(lines).padStart(2, '0');
    $('pieceNumber').textContent = String(pieceNumber).padStart(2, '0');
    const progress = lines % 10;
    $('levelFill').style.width = `${progress * 10}%`; $('progressText').textContent = `${progress} / 10`;
  }
  function start() {
    if (running) return;
    reset(); running = true; paused = false; lastTime = 0; dropCounter = 0;
    overlay.classList.add('hidden'); $('pauseBadge').classList.remove('show');
    $('statusText').textContent = 'LIVE SESSION'; raf = requestAnimationFrame(loop);
  }
  function endGame() {
    running = false; paused = false; cancelAnimationFrame(raf);
    overlay.classList.remove('hidden');
    $('overlayKicker').textContent = 'GAME OVER'; $('overlayTitle').textContent = '再來一局？';
    $('overlayCopy').textContent = `本局得分 ${format(score)}，再挑戰一次吧。`;
    $('startButtonText').textContent = '重新開始'; $('overlay').dataset.mode = 'end';
    $('statusText').textContent = 'SESSION ENDED'; updateStats();
  }
  function togglePause() {
    if (!running) return;
    paused = !paused;
    $('pauseBadge').classList.toggle('show', paused);
    $('statusText').textContent = paused ? 'TAKE A BREATHER' : 'LIVE SESSION';
    if (!paused) { lastTime = 0; raf = requestAnimationFrame(loop); }
  }
  function loop(time = 0) {
    if (!running || paused) return;
    const delta = lastTime ? time - lastTime : 0; lastTime = time; dropCounter += delta;
    const interval = Math.max(90, 850 - (level - 1) * 65);
    if (dropCounter > interval) { stepDown(); dropCounter = 0; }
    if (running) raf = requestAnimationFrame(loop);
  }
  function tone(freq, duration) {
    if (!soundOn) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = 'sine'; osc.frequency.value = freq; gain.gain.setValueAtTime(.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
    } catch (_) { /* Audio is optional. */ }
  }

  document.addEventListener('keydown', e => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'];
    if (keys.includes(e.key)) e.preventDefault();
    if (e.key === 'Enter' && !running) start();
    else if (e.key.toLowerCase() === 'p' || e.key === 'Escape') togglePause();
    else if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'x') rotatePiece();
    else if (e.key === 'ArrowDown') stepDown(true);
    else if (e.key === ' ') hardDrop();
  });
  document.getElementById('startButton').addEventListener('click', start);
  document.getElementById('restartButton').addEventListener('click', () => { running = false; start(); });
  document.getElementById('soundButton').addEventListener('click', () => {
    soundOn = !soundOn; $('soundIcon').textContent = soundOn ? '♫' : '♪';
    document.getElementById('soundButton').style.opacity = soundOn ? '1' : '.55';
  });
  document.querySelectorAll('[data-action]').forEach(button => {
    const action = () => {
      const map = { left: () => move(-1), right: () => move(1), down: () => stepDown(true), rotate: rotatePiece, drop: hardDrop };
      map[button.dataset.action]();
    };
    button.addEventListener('click', action);
    if (button.dataset.action === 'down' || button.dataset.action === 'left' || button.dataset.action === 'right') {
      let timer;
      button.addEventListener('pointerdown', () => { timer = setInterval(action, 100); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(name => button.addEventListener(name, () => clearInterval(timer)));
    }
  });
  best = Number.isFinite(best) ? best : 0;
  reset();
  $('overlay').dataset.mode = 'ready';
})();
