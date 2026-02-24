const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TILE = 24;
const GRID_W = Math.floor(canvas.width / TILE);
const GRID_H = Math.floor(canvas.height / TILE);

const state = {
  money: 100000,
  year: 1950,
  month: 1,
  companyValue: 0,
  speed: 1,
  paused: false,
  tool: 'rail',
  tick: 0,
  prices: { goods: 80, passengers: 55, mail: 40 },
  trains: [],
  stations: [],
  industries: []
};

const ui = {
  money: document.getElementById('money'),
  date: document.getElementById('date'),
  rating: document.getElementById('rating'),
  stationFrom: document.getElementById('station-from'),
  stationTo: document.getElementById('station-to'),
  trainList: document.getElementById('train-list'),
  priceGoods: document.getElementById('price-goods'),
  pricePassengers: document.getElementById('price-passengers'),
  priceMail: document.getElementById('price-mail')
};

const grid = Array.from({ length: GRID_H }, () =>
  Array.from({ length: GRID_W }, () => ({
    terrain: 'grass', rail: false, stationId: null, depot: false, townId: null, industryId: null
  }))
);

const towns = [];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H; }
function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function generateWorld() {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const edge = x < 2 || y < 2 || x > GRID_W - 3 || y > GRID_H - 3;
      if (edge || Math.random() < 0.03) grid[y][x].terrain = 'water';
      else if (Math.random() < 0.07) grid[y][x].terrain = 'mountain';
    }
  }

  for (let i = 0; i < 6; i++) {
    const town = { id: i + 1, name: `Stad ${i + 1}`, x: rnd(4, GRID_W - 5), y: rnd(4, GRID_H - 5), population: rnd(500, 2500), storage: { passengers: 0, mail: 0 } };
    towns.push(town);
    paintTown(town);
  }

  const industryTypes = [
    { type: 'farm', produces: 'goods', color: '#2f855a' },
    { type: 'sawmill', produces: 'goods', color: '#8b5a2b' },
    { type: 'post', produces: 'mail', color: '#d69e2e' }
  ];

  for (let i = 0; i < 8; i++) {
    const t = industryTypes[i % industryTypes.length];
    const ind = { id: i + 1, ...t, x: rnd(3, GRID_W - 4), y: rnd(3, GRID_H - 4), stock: 0, productionRate: rnd(3, 8) };
    state.industries.push(ind);
    const tile = grid[ind.y][ind.x];
    tile.industryId = ind.id;
    if (tile.terrain === 'water') tile.terrain = 'grass';
  }
}

function paintTown(town) {
  for (let yy = -1; yy <= 1; yy++) {
    for (let xx = -1; xx <= 1; xx++) {
      const x = town.x + xx;
      const y = town.y + yy;
      if (!inBounds(x, y)) continue;
      grid[y][x].townId = town.id;
      if (grid[y][x].terrain === 'water') grid[y][x].terrain = 'grass';
    }
  }
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
}

document.querySelectorAll('[data-tool]').forEach((btn) => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

document.getElementById('pause-btn').addEventListener('click', (e) => {
  state.paused = !state.paused;
  e.target.textContent = state.paused ? 'Verder' : 'Pauze';
});

document.getElementById('speed-btn').addEventListener('click', (e) => {
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
  e.target.textContent = `Snelheid x${state.speed}`;
});

document.getElementById('buy-train').addEventListener('click', () => {
  const fromId = Number(ui.stationFrom.value);
  const toId = Number(ui.stationTo.value);
  if (!fromId || !toId || fromId === toId || state.money < 1500) return;

  const from = state.stations.find((s) => s.id === fromId);
  const to = state.stations.find((s) => s.id === toId);
  if (!from || !to) return;

  const path = findPath(from.x, from.y, to.x, to.y);
  if (!path.length) return;

  const train = {
    id: state.trains.length + 1,
    x: from.x,
    y: from.y,
    path,
    pathIndex: 0,
    fromId,
    toId,
    cargo: { goods: 0, passengers: 0, mail: 0 },
    capacity: 40,
    age: 0,
    profit: 0
  };

  state.money -= 1500;
  state.trains.push(train);
  updateHUD();
  renderTrainList();
});

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * canvas.width / TILE);
  const y = Math.floor(((ev.clientY - rect.top) / rect.height) * canvas.height / TILE);
  if (!inBounds(x, y)) return;

  const tile = grid[y][x];
  if (tile.terrain === 'water' || tile.terrain === 'mountain') return;

  if (state.tool === 'rail' && state.money >= 30 && !tile.rail && !tile.stationId) {
    tile.rail = true;
    state.money -= 30;
  } else if (state.tool === 'station' && state.money >= 250 && tile.rail && !tile.stationId) {
    const station = { id: state.stations.length + 1, name: `Station ${state.stations.length + 1}`, x, y, waiting: { goods: 0, passengers: 0, mail: 0 } };
    state.stations.push(station);
    tile.stationId = station.id;
    state.money -= 250;
    syncStationSelects();
  } else if (state.tool === 'depot' && state.money >= 400 && tile.rail && !tile.depot) {
    tile.depot = true;
    state.money -= 400;
  } else if (state.tool === 'bulldoze') {
    tile.rail = false;
    tile.depot = false;
    if (tile.stationId) {
      state.stations = state.stations.filter((s) => s.id !== tile.stationId);
      tile.stationId = null;
      syncStationSelects();
    }
  }

  updateHUD();
});

function syncStationSelects() {
  const options = state.stations.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  ui.stationFrom.innerHTML = `<option value="">Van station</option>${options}`;
  ui.stationTo.innerHTML = `<option value="">Naar station</option>${options}`;
}

function findPath(sx, sy, ex, ey) {
  const q = [{ x: sx, y: sy }];
  const prev = new Map();
  const key = (x, y) => `${x},${y}`;
  prev.set(key(sx, sy), null);

  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === ex && cur.y === ey) break;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny) || !grid[ny][nx].rail) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      q.push({ x: nx, y: ny });
    }
  }

  if (!prev.has(key(ex, ey))) return [];
  const path = [];
  let node = { x: ex, y: ey };
  while (node) {
    path.push(node);
    node = prev.get(key(node.x, node.y));
  }
  return path.reverse();
}

function nearestStation(x, y) {
  let best = null;
  let dist = Infinity;
  for (const station of state.stations) {
    const d = manhattan({ x, y }, station);
    if (d < dist && d <= 4) {
      dist = d;
      best = station;
    }
  }
  return best;
}

function produceCargo() {
  for (const ind of state.industries) {
    ind.stock = Math.min(300, ind.stock + ind.productionRate);
    const station = nearestStation(ind.x, ind.y);
    if (station && ind.stock > 0) {
      const move = Math.min(15, ind.stock);
      station.waiting[ind.produces] += move;
      ind.stock -= move;
    }
  }

  for (const town of towns) {
    town.storage.passengers = Math.min(300, town.storage.passengers + Math.floor(town.population / 500));
    town.storage.mail = Math.min(250, town.storage.mail + Math.floor(town.population / 700));

    const station = nearestStation(town.x, town.y);
    if (!station) continue;
    const p = Math.min(12, town.storage.passengers);
    const m = Math.min(8, town.storage.mail);
    station.waiting.passengers += p;
    station.waiting.mail += m;
    town.storage.passengers -= p;
    town.storage.mail -= m;
  }
}

function loadUnload(train) {
  const onStation = state.stations.find((s) => s.x === train.x && s.y === train.y);
  if (!onStation) return;

  const atDestination = onStation.id === train.toId;
  if (atDestination) {
    const deliveredGoods = train.cargo.goods;
    const deliveredPassengers = train.cargo.passengers;
    const deliveredMail = train.cargo.mail;

    const earn = deliveredGoods * state.prices.goods + deliveredPassengers * state.prices.passengers + deliveredMail * state.prices.mail;
    train.profit += earn;
    state.money += earn;

    train.cargo.goods = 0;
    train.cargo.passengers = 0;
    train.cargo.mail = 0;

    const temp = train.fromId;
    train.fromId = train.toId;
    train.toId = temp;

    const from = state.stations.find((s) => s.id === train.fromId);
    const to = state.stations.find((s) => s.id === train.toId);
    if (from && to) {
      const newPath = findPath(from.x, from.y, to.x, to.y);
      if (newPath.length) {
        train.path = newPath;
        train.pathIndex = 0;
      }
    }
  }

  const free = train.capacity - (train.cargo.goods + train.cargo.passengers + train.cargo.mail);
  if (free <= 0) return;

  for (const type of ['goods', 'passengers', 'mail']) {
    if (onStation.waiting[type] <= 0) continue;
    const take = Math.min(free, onStation.waiting[type]);
    train.cargo[type] += take;
    onStation.waiting[type] -= take;
  }
}

function updateTrains() {
  for (const train of state.trains) {
    train.age += 1;
    if (!train.path.length) continue;
    train.pathIndex = (train.pathIndex + 1) % train.path.length;
    const next = train.path[train.pathIndex];
    train.x = next.x;
    train.y = next.y;
    loadUnload(train);

    if (train.age % 500 === 0) {
      state.money -= 200;
      train.profit -= 200;
    }
  }
}

function updateEconomy() {
  if (state.tick % 450 === 0) {
    state.prices.goods = rnd(65, 95);
    state.prices.passengers = rnd(45, 70);
    state.prices.mail = rnd(30, 55);
  }

  state.companyValue = Math.floor(
    state.money + state.trains.length * 1200 + state.stations.length * 400 + state.trains.reduce((s, t) => s + Math.max(0, t.profit), 0)
  );

  if (state.tick % 300 === 0) {
    state.month += 1;
    if (state.month > 12) {
      state.month = 1;
      state.year += 1;
    }
  }
}

function renderTrainList() {
  ui.trainList.innerHTML = state.trains.map((t) => {
    const routeA = state.stations.find((s) => s.id === t.fromId)?.name || '?';
    const routeB = state.stations.find((s) => s.id === t.toId)?.name || '?';
    const load = t.cargo.goods + t.cargo.passengers + t.cargo.mail;
    return `<li>#${t.id} ${routeA} → ${routeB}<br>lading ${load}/${t.capacity}, winst €${Math.floor(t.profit)}</li>`;
  }).join('');
}

function updateHUD() {
  ui.money.textContent = `€${Math.floor(state.money)}`;
  ui.date.textContent = `Jaar ${state.year}, maand ${state.month}`;
  ui.rating.textContent = `Bedrijfswaarde: €${state.companyValue}`;
  ui.priceGoods.textContent = `€${state.prices.goods}`;
  ui.pricePassengers.textContent = `€${state.prices.passengers}`;
  ui.priceMail.textContent = `€${state.prices.mail}`;
}

function drawTile(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
}

function drawWorld() {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const tile = grid[y][x];
      const terrainColor = tile.terrain === 'water' ? '#1d4e89' : tile.terrain === 'mountain' ? '#5f5f5f' : '#4d9f57';
      drawTile(x, y, terrainColor);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);

      if (tile.townId) {
        ctx.fillStyle = '#bcd4ff';
        ctx.fillRect(x * TILE + 5, y * TILE + 5, 14, 14);
      }
      if (tile.industryId) {
        const ind = state.industries.find((i) => i.id === tile.industryId);
        ctx.fillStyle = ind?.color || '#c77d00';
        ctx.fillRect(x * TILE + 4, y * TILE + 4, 16, 16);
      }
      if (tile.rail) {
        ctx.fillStyle = '#8b949e';
        ctx.fillRect(x * TILE + 2, y * TILE + 10, TILE - 4, 4);
        ctx.fillRect(x * TILE + 10, y * TILE + 2, 4, TILE - 4);
      }
      if (tile.stationId) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x * TILE + 6, y * TILE + 6, 12, 12);
      }
      if (tile.depot) {
        ctx.fillStyle = '#ffedd5';
        ctx.fillRect(x * TILE + 7, y * TILE + 7, 10, 10);
      }
    }
  }

  for (const train of state.trains) {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(train.x * TILE + 6, train.y * TILE + 6, 12, 12);
  }

  if (state.companyValue >= 250000) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, canvas.height - 36, canvas.width, 36);
    ctx.fillStyle = '#bbf7d0';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Overwinning: bedrijf > €250.000!', 12, canvas.height - 12);
  }
}

function seedRail() {
  const a = towns[0];
  const b = towns[1];
  if (!a || !b) return;

  const y = a.y;
  const xMin = Math.min(a.x, b.x);
  const xMax = Math.max(a.x, b.x);
  for (let x = xMin; x <= xMax; x++) {
    if (grid[y][x].terrain !== 'water') grid[y][x].rail = true;
  }
  const yMin = Math.min(a.y, b.y);
  const yMax = Math.max(a.y, b.y);
  for (let yy = yMin; yy <= yMax; yy++) {
    if (grid[yy][b.x].terrain !== 'water') grid[yy][b.x].rail = true;
  }
}

function loop() {
  if (!state.paused) {
    for (let i = 0; i < state.speed; i++) {
      state.tick += 1;
      if (state.tick % 20 === 0) produceCargo();
      if (state.tick % 3 === 0) updateTrains();
      updateEconomy();
    }
    renderTrainList();
    updateHUD();
  }

  drawWorld();
  requestAnimationFrame(loop);
}

generateWorld();
seedRail();
updateHUD();
syncStationSelects();
requestAnimationFrame(loop);
