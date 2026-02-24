const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TILE = 32;
const W = Math.floor(canvas.width / TILE);
const H = Math.floor(canvas.height / TILE);

const moneyEl = document.getElementById('money');
const cargoEl = document.getElementById('cargo');
const scoreEl = document.getElementById('score');
const pauseBtn = document.getElementById('pause-btn');

const terrain = Array.from({ length: H }, () =>
  Array.from({ length: W }, () => ({ rail: false, station: false, type: 'grass' }))
);

const farms = [
  { x: 3, y: 3 },
  { x: 6, y: 14 },
  { x: 20, y: 6 }
];

const towns = [
  { x: 24, y: 4 },
  { x: 15, y: 16 },
  { x: 27, y: 11 }
];

const cargoPiles = farms.map((f) => ({ ...f, amount: 0 }));
let trains = [];
let money = 5000;
let delivered = 0;
let score = 0;
let paused = false;
let tool = 'rail';

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function setTool(name) {
  tool = name;
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
}

document.querySelectorAll('[data-tool]').forEach((btn) => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

document.getElementById('spawn-train').addEventListener('click', () => {
  if (money < 500) return;

  const stationTiles = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (terrain[y][x].station) stationTiles.push({ x, y });
    }
  }

  if (stationTiles.length < 2) return;

  money -= 500;
  const start = stationTiles[Math.floor(Math.random() * stationTiles.length)];
  trains.push({ x: start.x, y: start.y, cargo: 0, speedTick: 0, target: null });
  updateHud();
});

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Verder' : 'Pauze';
});

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * canvas.width / TILE);
  const y = Math.floor(((ev.clientY - rect.top) / rect.height) * canvas.height / TILE);
  if (!inBounds(x, y)) return;

  const tile = terrain[y][x];

  if (tool === 'rail' && money >= 20) {
    if (!tile.rail) {
      tile.rail = true;
      money -= 20;
    }
  } else if (tool === 'station' && money >= 100) {
    if (tile.rail && !tile.station) {
      tile.station = true;
      money -= 100;
    }
  } else if (tool === 'delete') {
    if (tile.station) tile.station = false;
    if (tile.rail) tile.rail = false;
  }

  updateHud();
});

function updateHud() {
  moneyEl.textContent = `€${money}`;
  const totalCargo = cargoPiles.reduce((sum, c) => sum + c.amount, 0);
  cargoEl.textContent = `Goederen: ${totalCargo}`;
  scoreEl.textContent = `Score: ${score}`;
}

function neighbors(x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ].filter((p) => inBounds(p.x, p.y) && terrain[p.y][p.x].rail);
}

function closestRailTo(point) {
  let best = null;
  let dist = Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!terrain[y][x].rail) continue;
      const d = Math.abs(x - point.x) + Math.abs(y - point.y);
      if (d < dist) {
        dist = d;
        best = { x, y };
      }
    }
  }
  return best;
}

function stepTrain(train) {
  const stations = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (terrain[y][x].station) stations.push({ x, y });
    }
  }
  if (stations.length < 2) return;

  if (!train.target || (train.target.x === train.x && train.target.y === train.y)) {
    train.target = stations[Math.floor(Math.random() * stations.length)];
  }

  const options = neighbors(train.x, train.y);
  if (!options.length) return;

  options.sort((a, b) => (
    Math.abs(a.x - train.target.x) + Math.abs(a.y - train.target.y)
    - (Math.abs(b.x - train.target.x) + Math.abs(b.y - train.target.y))
  ));

  const next = options[0];
  train.x = next.x;
  train.y = next.y;

  // Load from nearby farm
  farms.forEach((farm, i) => {
    const near = Math.abs(train.x - farm.x) + Math.abs(train.y - farm.y) <= 1;
    if (near && cargoPiles[i].amount > 0) {
      const load = Math.min(3, cargoPiles[i].amount);
      train.cargo += load;
      cargoPiles[i].amount -= load;
    }
  });

  // Deliver to nearby town
  towns.forEach((town) => {
    const near = Math.abs(train.x - town.x) + Math.abs(train.y - town.y) <= 1;
    if (near && train.cargo > 0) {
      const reward = train.cargo * 30;
      money += reward;
      delivered += train.cargo;
      score += reward;
      train.cargo = 0;
    }
  });
}

let farmTick = 0;
function tick() {
  if (!paused) {
    farmTick++;
    if (farmTick % 35 === 0) {
      cargoPiles.forEach((c) => {
        c.amount = Math.min(150, c.amount + 2);
      });
    }

    trains.forEach((train) => {
      train.speedTick++;
      if (train.speedTick % 5 === 0) stepTrain(train);
    });
    updateHud();
  }

  draw();
  requestAnimationFrame(tick);
}

function drawTile(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      drawTile(x, y, '#3f9a4c');
      const t = terrain[y][x];
      if (t.rail) {
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(x * TILE + 4, y * TILE + 12, TILE - 8, 8);
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(x * TILE + 8, y * TILE + 14, TILE - 16, 4);
      }
      if (t.station) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x * TILE + 7, y * TILE + 4, TILE - 14, TILE - 8);
      }
    }
  }

  farms.forEach((farm, i) => {
    drawTile(farm.x, farm.y, '#16a34a');
    ctx.fillStyle = '#14532d';
    ctx.fillRect(farm.x * TILE + 8, farm.y * TILE + 8, 16, 16);
    ctx.fillStyle = '#ecfccb';
    ctx.font = '12px sans-serif';
    ctx.fillText(String(cargoPiles[i].amount), farm.x * TILE + 4, farm.y * TILE + 30);
  });

  towns.forEach((town) => {
    drawTile(town.x, town.y, '#2563eb');
    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(town.x * TILE + 6, town.y * TILE + 10, 20, 16);
  });

  trains.forEach((train) => {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(train.x * TILE + 8, train.y * TILE + 8, 16, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(train.cargo), train.x * TILE + 10, train.y * TILE + 20);
  });
}

// Seed with starter rails connecting first farm-town pair for playability
for (let x = 3; x <= 24; x++) terrain[3][x].rail = true;
terrain[3][3].station = true;
terrain[3][24].station = true;

updateHud();
requestAnimationFrame(tick);
