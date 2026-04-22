/* =====================================================================
   CAFE TYCOON — game.js
   Complete 2D Restaurant Simulator for Telegram Mini App
   ===================================================================== */

(function () {
  'use strict';

  /* ── Canvas & Context ── */
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* ── Constants ── */
  const TILE        = 40;
  const PLAYER_R    = 16;
  const GUEST_R     = 14;
  const TABLE_W     = 56;
  const TABLE_H     = 46;
  const COUNTER_W   = 120;
  const COUNTER_H   = 44;

  const MENUS       = ['🍔','🍕','☕','🍰','🍜'];
  const EARN_PER_GUEST = [20, 25, 30, 35, 40]; // per food type

  const Colors = {
    floor:       '#f5e9d0',
    floorTile:   '#ede0c4',
    wall:        '#5c3317',
    wallTop:     '#7a4520',
    table:       '#c87d3e',
    tableDirty:  '#7a5533',
    tableClean:  '#c87d3e',
    tableBorder: '#8b4e1a',
    counter:     '#3a7bd5',
    counterTop:  '#2962b3',
    chair:       '#d4a96a',
    entrance:    '#2ec96b',
    exit:        '#e8394a',
    player:      '#f5c842',
    playerBorder:'#c89a10',
    guest:       '#7ec8f0',
    guestBorder: '#3a9bdc',
    guestWait:   '#f0a060',
    shadow:      'rgba(0,0,0,0.18)',
    progressBg:  'rgba(0,0,0,0.4)',
    progressFg:  '#2ec96b',
    progressRed: '#e8394a',
    speech:      '#fffde7',
    speechBorder:'#f5c842',
  };

  /* ── Game State ── */
  let W, H, ROOM_X, ROOM_Y, ROOM_W, ROOM_H;
  let lastTime   = 0;
  let money      = 0;
  let totalEarned= 0;
  let gameLevel  = 1;
  let paused     = false;
  let gameStarted = false;

  /* ── World Objects ── */
  let player     = {};
  let tables     = [];
  let guests     = [];
  let particles  = [];
  let guestIdCounter = 0;
  let spawnTimer = 0;
  let spawnInterval = 5.5; // seconds between spawns
  const MAX_QUEUE = 4;

  /* ── Upgrade Data ── */
  const upgrades = {
    tableSlots: {
      label: 'New Table',
      icon: '🪑',
      desc: 'Add a table to serve more guests',
      costs: [60, 120, 200, 300, 450],
      level: 0,
      max: 5,
    },
    speed: {
      label: 'Faster Legs',
      icon: '👟',
      desc: 'Increase your movement speed',
      costs: [80, 150, 250, 400],
      level: 0,
      max: 4,
    },
    cookSpeed: {
      label: 'Quick Kitchen',
      icon: '⚡',
      desc: 'Food is prepared faster',
      costs: [100, 180, 300],
      level: 0,
      max: 3,
    },
    spawnRate: {
      label: 'Marketing',
      icon: '📣',
      desc: 'Guests arrive more frequently',
      costs: [70, 150, 280],
      level: 0,
      max: 3,
    },
  };

  /* ── Table slot positions (room-relative) ── */
  const TABLE_POSITIONS = [
    { x: 0.22, y: 0.28 },
    { x: 0.50, y: 0.28 },
    { x: 0.78, y: 0.28 },
    { x: 0.22, y: 0.58 },
    { x: 0.50, y: 0.58 },
    { x: 0.78, y: 0.58 },
    { x: 0.22, y: 0.82 },
    { x: 0.50, y: 0.82 },
  ];
  const INITIAL_TABLES = 3;

  /* ============================================================
     SIZING
  ============================================================ */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;

    // Room occupies most of the screen (padded for HUD)
    const hudH    = 52;
    const claimH  = 60;
    const pad     = 10;
    ROOM_X = pad;
    ROOM_Y = hudH + pad;
    ROOM_W = W - pad * 2;
    ROOM_H = H - hudH - claimH - pad * 2;

    // Update table positions
    tables.forEach((t, i) => {
      const pos = TABLE_POSITIONS[i];
      t.x = ROOM_X + ROOM_W * pos.x - TABLE_W / 2;
      t.y = ROOM_Y + ROOM_H * pos.y - TABLE_H / 2;
    });

    repositionStaticZones();
  }

  /* ── Static zones ── */
  let entrance  = {};
  let exitZone  = {};
  let counter   = {};

  function repositionStaticZones() {
    // Entrance: left side, vertical center
    entrance = {
      x: ROOM_X,
      y: ROOM_Y + ROOM_H * 0.5 - 26,
      w: 42,
      h: 52,
      cx: ROOM_X + 21,
      cy: ROOM_Y + ROOM_H * 0.5,
    };
    // Exit: same spot (guests leave via entrance)
    exitZone = {
      x: ROOM_X,
      y: ROOM_Y + ROOM_H * 0.5 - 26,
      w: 42, h: 52,
      cx: ROOM_X + 21,
      cy: ROOM_Y + ROOM_H * 0.5,
    };
    // Counter: top-right area
    counter = {
      x: ROOM_X + ROOM_W - COUNTER_W - 10,
      y: ROOM_Y + 10,
      w: COUNTER_W, h: COUNTER_H,
      cx: ROOM_X + ROOM_W - COUNTER_W / 2 - 10,
      cy: ROOM_Y + 10 + COUNTER_H / 2,
    };
    // Reposition player if not started
    if (!gameStarted) {
      player.x = entrance.cx + 60;
      player.y = entrance.cy;
    }
  }

  /* ============================================================
     INIT
  ============================================================ */
  function init() {
    money        = 0;
    totalEarned  = 0;
    gameLevel    = 1;
    guests       = [];
    particles    = [];
    spawnTimer   = 2;
    guestIdCounter = 0;

    // Reset upgrades
    Object.values(upgrades).forEach(u => u.level = 0);

    resize();
    buildTables(INITIAL_TABLES);

    player = {
      x: entrance.cx + 70,
      y: entrance.cy,
      vx: 0, vy: 0,
      radius: PLAYER_R,
      speed: getPlayerSpeed(),
      carrying: null,    // food emoji string
      followGuest: null, // guest being guided to table
      interactTimer: 0,
      interactTarget: null,
    };
    updateHUD();
  }

  function buildTables(count) {
    tables = [];
    for (let i = 0; i < count && i < TABLE_POSITIONS.length; i++) {
      const pos = TABLE_POSITIONS[i];
      tables.push(createTable(i, pos));
    }
  }

  function createTable(i, pos) {
    return {
      id: i,
      x: ROOM_X + ROOM_W * pos.x - TABLE_W / 2,
      y: ROOM_Y + ROOM_H * pos.y - TABLE_H / 2,
      w: TABLE_W, h: TABLE_H,
      state: 'empty',   // empty | occupied | dirty
      guest: null,
      money: 0,
      cx() { return this.x + this.w / 2; },
      cy() { return this.y + this.h / 2; },
    };
  }

  function getPlayerSpeed() {
    return 140 + upgrades.speed.level * 35;
  }
  function getCookTime() {
    return 3.5 - upgrades.cookSpeed.level * 0.8;
  }
  function getSpawnInterval() {
    return Math.max(3.0, 5.5 - upgrades.spawnRate.level * 0.8);
  }

  /* ============================================================
     GUEST FACTORY
  ============================================================ */
  const GUEST_STATE = {
    QUEUING:       'QUEUING',
    FOLLOWING:     'FOLLOWING',
    SEATED:        'SEATED',
    WAITING_FOOD:  'WAITING_FOOD',
    EATING:        'EATING',
    LEAVING:       'LEAVING',
    GONE:          'GONE',
  };

  const GUEST_COLORS = ['#7ec8f0','#f0a060','#c088e0','#60d0a0','#f0d060','#f07090'];

  function spawnGuest() {
    const waitingCount = guests.filter(g => g.state === GUEST_STATE.QUEUING).length;
    if (waitingCount >= MAX_QUEUE) return;

    const id    = ++guestIdCounter;
    const color = GUEST_COLORS[id % GUEST_COLORS.length];
    const food  = MENUS[Math.floor(Math.random() * MENUS.length)];
    const earn  = EARN_PER_GUEST[MENUS.indexOf(food)];
    const queueIndex = guests.filter(g => g.state === GUEST_STATE.QUEUING).length;

    guests.push({
      id,
      x: entrance.cx,
      y: entrance.cy,
      vx: 0, vy: 0,
      radius: GUEST_R,
      color,
      state: GUEST_STATE.QUEUING,
      food,
      earn,
      table: null,
      seatX: 0, seatY: 0,
      patience: 30,       // seconds before leaving without service
      patienceTimer: 0,
      orderTimer: 1.5,    // wait before showing order bubble
      orderShown: false,
      eatTime: 5,
      eatTimer: 0,
      cookTimer: 0,
      cookDone: false,
      queuePos: queueIndex,
      targetX: 0, targetY: 0,
      speed: 90 + Math.random() * 20,
      bobOffset: Math.random() * Math.PI * 2,
      emoji: getGuestEmoji(id),
    });
    updateQueuePositions();
  }

  function getGuestEmoji(id) {
    const emojis = ['🧑','👩','👨','🧒','👧','🧔'];
    return emojis[id % emojis.length];
  }

  function updateQueuePositions() {
    let qi = 0;
    guests.filter(g => g.state === GUEST_STATE.QUEUING).forEach(g => {
      g.queuePos = qi++;
      g.targetX  = entrance.cx + 50 + g.queuePos * 38;
      g.targetY  = entrance.cy;
    });
  }

  /* ============================================================
     INPUT — JOYSTICK
  ============================================================ */
  const joy = {
    active: false,
    startX: 0, startY: 0,
    dx: 0, dy: 0,
    maxR: 38,
    knob: document.getElementById('joystick-knob'),
    base: document.getElementById('joystick-base'),
  };

  const joyZone = document.getElementById('joystick-zone');

  joyZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    const r = joyZone.getBoundingClientRect();
    joy.active = true;
    joy.startX = r.left + r.width  / 2;
    joy.startY = r.top  + r.height / 2;
    updateJoy(t.clientX, t.clientY);
  }, { passive: false });

  joyZone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!joy.active) return;
    updateJoy(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  joyZone.addEventListener('touchend', () => {
    joy.active = false;
    joy.dx = 0; joy.dy = 0;
    joy.knob.style.transform = 'translate(-50%,-50%)';
  });

  /* Keyboard fallback (desktop testing) */
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup',   e => { keys[e.key] = false; });

  function updateJoy(cx, cy) {
    const dx = cx - joy.startX;
    const dy = cy - joy.startY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, joy.maxR);
    const angle = Math.atan2(dy, dx);
    joy.dx = (clamped / joy.maxR) * Math.cos(angle);
    joy.dy = (clamped / joy.maxR) * Math.sin(angle);

    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    joy.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  }

  function getInput() {
    let dx = joy.dx, dy = joy.dy;
    if (keys['ArrowLeft']  || keys['a']) dx -= 1;
    if (keys['ArrowRight'] || keys['d']) dx += 1;
    if (keys['ArrowUp']    || keys['w']) dy -= 1;
    if (keys['ArrowDown']  || keys['s']) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  /* ============================================================
     COLLISION
  ============================================================ */
  function getObstacles() {
    const obs = [];
    // Room walls (as rects, kept as segments for circle)
    obs.push({ x: ROOM_X,              y: ROOM_Y,              w: ROOM_W, h: 6 });   // top
    obs.push({ x: ROOM_X,              y: ROOM_Y + ROOM_H - 6, w: ROOM_W, h: 6 });   // bottom
    obs.push({ x: ROOM_X,              y: ROOM_Y,              w: 6,       h: ROOM_H }); // left
    obs.push({ x: ROOM_X + ROOM_W - 6, y: ROOM_Y,              w: 6,       h: ROOM_H }); // right
    // Tables
    tables.forEach(t => obs.push({ x: t.x, y: t.y, w: t.w, h: t.h }));
    // Counter
    obs.push({ x: counter.x, y: counter.y, w: counter.w, h: counter.h });
    return obs;
  }

  function resolveCircleRect(cx, cy, r, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(cx, rx + rw));
    const nearY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearX;
    const dy = cy - nearY;
    const distSq = dx * dx + dy * dy;
    if (distSq < r * r) {
      const dist = Math.sqrt(distSq) || 0.001;
      const overlap = r - dist;
      return { x: (dx / dist) * overlap, y: (dy / dist) * overlap };
    }
    return null;
  }

  function keepInRoom(entity) {
    const r = entity.radius;
    const minX = ROOM_X + r + 6;
    const maxX = ROOM_X + ROOM_W - r - 6;
    const minY = ROOM_Y + r + 6;
    const maxY = ROOM_Y + ROOM_H - r - 6;
    entity.x = Math.max(minX, Math.min(maxX, entity.x));
    entity.y = Math.max(minY, Math.min(maxY, entity.y));
  }

  function applyCollisions(entity, obstacles) {
    for (const obs of obstacles) {
      const push = resolveCircleRect(entity.x, entity.y, entity.radius, obs.x, obs.y, obs.w, obs.h);
      if (push) {
        entity.x += push.x;
        entity.y += push.y;
      }
    }
    keepInRoom(entity);
  }

  /* ============================================================
     INTERACTION DETECTION
  ============================================================ */
  const INTERACT_DIST = 52;

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function nearCounter() {
    return Math.hypot(player.x - counter.cx, player.y - counter.cy) < INTERACT_DIST + 10;
  }

  function nearTable(table) {
    return Math.hypot(player.x - table.cx(), player.y - table.cy()) < INTERACT_DIST;
  }

  function nearGuest(guest) {
    return dist(player, guest) < INTERACT_DIST;
  }

  /* ============================================================
     PLAYER UPDATE
  ============================================================ */
  function updatePlayer(dt) {
    const { dx, dy } = getInput();
    const spd = getPlayerSpeed();
    player.vx = dx * spd;
    player.vy = dy * spd;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const obs = getObstacles();
    applyCollisions(player, obs);

    // Interact timer
    if (player.interactTimer > 0) {
      player.interactTimer -= dt;
      if (player.interactTimer <= 0) {
        player.interactTimer   = 0;
        player.interactTarget  = null;
      }
    }

    handleInteractions(dt);
  }

  function handleInteractions(dt) {
    // ── 1. Pick up food at counter (if not carrying) ──
    if (!player.carrying && !player.followGuest && nearCounter()) {
      // Check if any seated guest is waiting for food
      const waitingGuest = guests.find(g => g.state === GUEST_STATE.WAITING_FOOD && g.cookDone);
      if (waitingGuest) {
        player.carrying   = waitingGuest.food;
        waitingGuest.cookDone = false; // picked up
        showToast(`Picked up ${player.carrying}!`);
      } else {
        // Trigger cook for nearest waiting_food guest
        const cooking = guests.find(g => g.state === GUEST_STATE.WAITING_FOOD && !g.cookDone && g.cookTimer <= 0);
        if (cooking) {
          cooking.cookTimer = getCookTime();
          showToast('Cooking…');
        }
      }
    }

    // ── 2. Pick up waiting guest (if not carrying food, not already following) ──
    if (!player.carrying && !player.followGuest) {
      const queueingGuest = guests.find(g => g.state === GUEST_STATE.QUEUING && nearGuest(g));
      if (queueingGuest) {
        const freeTable = tables.find(t => t.state === 'empty');
        if (freeTable) {
          queueingGuest.state      = GUEST_STATE.FOLLOWING;
          player.followGuest       = queueingGuest;
          queueingGuest.table      = freeTable;
          freeTable.state          = 'occupied';
          freeTable.guest          = queueingGuest;
          updateQueuePositions();
          showToast('Lead guest to a table!');
        } else {
          showToast('No free tables! 😬');
        }
      }
    }

    // ── 3. Seat following guest at their table ──
    if (player.followGuest && !player.carrying) {
      const t = player.followGuest.table;
      if (t && nearTable(t)) {
        seatGuest(player.followGuest, t);
        player.followGuest = null;
      }
    }

    // ── 4. Deliver food to occupied table ──
    if (player.carrying) {
      const targetTable = tables.find(t =>
        t.state === 'occupied' &&
        t.guest &&
        t.guest.state === GUEST_STATE.WAITING_FOOD &&
        t.guest.food === player.carrying &&
        nearTable(t)
      );
      if (targetTable) {
        targetTable.guest.state = GUEST_STATE.EATING;
        targetTable.guest.eatTimer = targetTable.guest.eatTime;
        player.carrying = null;
        spawnParticles(targetTable.cx(), targetTable.cy(), Colors.progressFg, 8);
        showToast('Food delivered! 😋');
      }
    }

    // ── 5. Clean dirty table ──
    if (!player.carrying && !player.followGuest) {
      const dirtyTable = tables.find(t => t.state === 'dirty' && nearTable(t));
      if (dirtyTable) {
        if (player.interactTarget === dirtyTable) {
          // already cleaning, handled in interact timer callback
        } else {
          player.interactTarget = dirtyTable;
          player.interactTimer  = 2.0; // 2 sec clean
        }
      } else {
        // moved away, cancel clean
        if (player.interactTarget && player.interactTarget.state === 'dirty') {
          if (!nearTable(player.interactTarget)) {
            player.interactTarget = null;
            player.interactTimer  = 0;
          }
        }
      }

      // Complete cleaning
      if (player.interactTimer <= 0 && player.interactTarget && player.interactTarget.state === 'dirty') {
        const t = player.interactTarget;
        money      += t.money;
        totalEarned += t.money;
        spawnMoneyParticle(t.cx(), t.cy(), t.money);
        t.state  = 'empty';
        t.guest  = null;
        t.money  = 0;
        player.interactTarget = null;
        updateHUD();
      }
    } else {
      // Carrying or following — cancel any cleaning
      player.interactTarget = null;
      player.interactTimer  = 0;
    }
  }

  function seatGuest(guest, table) {
    guest.state       = GUEST_STATE.SEATED;
    guest.seatX       = table.cx();
    guest.seatY       = table.cy() + 18;
    guest.x           = guest.seatX;
    guest.y           = guest.seatY;
    guest.orderTimer  = 1.8;
    guest.orderShown  = false;
    spawnParticles(table.cx(), table.cy(), Colors.gold, 6);
  }

  /* ============================================================
     GUEST UPDATE
  ============================================================ */
  function updateGuests(dt) {
    const obstacles = getObstacles().filter(o => {
      // Guests can walk through entrance/exit area
      return !(o.x === ROOM_X && o.w === 6);
    });

    guests.forEach(g => {
      switch (g.state) {

        case GUEST_STATE.QUEUING: {
          // Move to queue position
          moveToward(g, g.targetX, g.targetY, g.speed, dt);
          // Patience
          g.patienceTimer += dt;
          if (g.patienceTimer > g.patience) {
            g.state = GUEST_STATE.LEAVING;
            g.targetX = entrance.cx - 10;
            g.targetY = entrance.cy;
            updateQueuePositions();
            showToast('A guest left… 😢');
          }
          break;
        }

        case GUEST_STATE.FOLLOWING: {
          // Follow the player
          moveToward(g, player.x, player.y + 26, 110, dt);
          break;
        }

        case GUEST_STATE.SEATED: {
          g.x = g.seatX;
          g.y = g.seatY;
          g.orderTimer -= dt;
          if (g.orderTimer <= 0 && !g.orderShown) {
            g.orderShown = true;
            g.state      = GUEST_STATE.WAITING_FOOD;
          }
          break;
        }

        case GUEST_STATE.WAITING_FOOD: {
          g.x = g.seatX; g.y = g.seatY;
          // Cook timer
          if (g.cookTimer > 0) {
            g.cookTimer -= dt;
            if (g.cookTimer <= 0) {
              g.cookDone = true;
            }
          }
          // Patience at table
          g.patienceTimer += dt;
          if (g.patienceTimer > g.patience * 1.5) {
            leaveAngry(g);
          }
          break;
        }

        case GUEST_STATE.EATING: {
          g.x = g.seatX; g.y = g.seatY;
          g.eatTimer -= dt;
          if (g.eatTimer <= 0) {
            finishEating(g);
          }
          break;
        }

        case GUEST_STATE.LEAVING: {
          moveToward(g, exitZone.cx - 15, exitZone.cy, g.speed, dt);
          if (dist(g, { x: exitZone.cx - 15, y: exitZone.cy }) < 12) {
            g.state = GUEST_STATE.GONE;
          }
          break;
        }

        case GUEST_STATE.GONE:
          break;
      }

      // Bob animation
      if (g.state !== GUEST_STATE.SEATED && g.state !== GUEST_STATE.EATING &&
          g.state !== GUEST_STATE.WAITING_FOOD) {
        g.bobOffset += dt * 4;
      }
    });

    // Remove gone guests
    guests = guests.filter(g => g.state !== GUEST_STATE.GONE);
  }

  function moveToward(entity, tx, ty, speed, dt) {
    const dx = tx - entity.x;
    const dy = ty - entity.y;
    const d  = Math.hypot(dx, dy);
    if (d < 3) return;
    const step = Math.min(speed * dt, d);
    entity.x += (dx / d) * step;
    entity.y += (dy / d) * step;
  }

  function finishEating(guest) {
    guest.state = GUEST_STATE.LEAVING;
    const t = guest.table;
    if (t) {
      t.state = 'dirty';
      t.money = guest.earn;
      t.guest = null;
    }
    guest.targetX = exitZone.cx - 15;
    guest.targetY = exitZone.cy;
  }

  function leaveAngry(guest) {
    guest.state = GUEST_STATE.LEAVING;
    if (guest.table) {
      guest.table.state = 'empty';
      guest.table.guest = null;
      guest.table = null;
    }
    guest.targetX = exitZone.cx - 15;
    guest.targetY = exitZone.cy;
    updateQueuePositions();
    showToast('Guest left angry! 😡');
  }

  /* ============================================================
     SPAWN TIMER
  ============================================================ */
  function updateSpawn(dt) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = getSpawnInterval();
      spawnGuest();
    }
  }

  /* ============================================================
     PARTICLES
  ============================================================ */
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.7 + Math.random() * 0.3,
        maxLife: 1.0,
        r: 3 + Math.random() * 4,
        color,
        text: null,
      });
    }
  }

  function spawnMoneyParticle(x, y, amount) {
    particles.push({
      x, y,
      vx: 0, vy: -60,
      life: 1.2, maxLife: 1.2,
      r: 0,
      color: Colors.gold,
      text: `+${amount}💰`,
    });
  }

  function updateParticles(dt) {
    particles.forEach(p => {
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.vy   += 40 * dt; // gravity
      p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);
  }

  /* ============================================================
     HUD
  ============================================================ */
  function updateHUD() {
    document.getElementById('money-amount').textContent = money;
    document.getElementById('level-amount').textContent = `Lv.${gameLevel}`;
    document.getElementById('shop-money').textContent   = money;
  }

  /* ── Toast ── */
  let toastTimeout = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ============================================================
     SHOP
  ============================================================ */
  function openShop() {
    paused = true;
    document.getElementById('shop-money').textContent = money;
    renderShopItems();
    document.getElementById('shop-overlay').classList.remove('hidden');
  }
  function closeShop() {
    paused = false;
    document.getElementById('shop-overlay').classList.add('hidden');
  }

  function renderShopItems() {
    const container = document.getElementById('shop-items');
    container.innerHTML = '';
    Object.entries(upgrades).forEach(([key, upg]) => {
      const item = document.createElement('div');
      item.className = 'shop-item';
      const cost     = upg.costs[upg.level];
      const isMax    = upg.level >= upg.max;
      const canAfford = money >= (cost || 0);

      let btnLabel  = isMax ? '✓ MAX' : `💰 ${cost}`;
      let btnClass  = isMax ? 'shop-item-buy maxed' : 'shop-item-buy';
      let disabled  = isMax || !canAfford;

      item.innerHTML = `
        <div class="shop-item-icon">${upg.icon}</div>
        <div class="shop-item-info">
          <div class="shop-item-name">${upg.label} ${upg.level > 0 ? `(${upg.level}/${upg.max})` : ''}</div>
          <div class="shop-item-desc">${upg.desc}</div>
        </div>
        <button class="${btnClass}" data-key="${key}" ${disabled ? 'disabled' : ''}>${btnLabel}</button>
      `;
      container.appendChild(item);
    });

    // Bind buy buttons
    container.querySelectorAll('.shop-item-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        buyUpgrade(key);
      });
    });
  }

  function buyUpgrade(key) {
    const upg = upgrades[key];
    if (upg.level >= upg.max) return;
    const cost = upg.costs[upg.level];
    if (money < cost) {
      showToast('Not enough money! 💸');
      return;
    }
    money     -= cost;
    totalEarned = Math.max(0, totalEarned); // don't subtract from total
    upg.level++;

    // Apply effects
    if (key === 'tableSlots') {
      const i = tables.length;
      if (i < TABLE_POSITIONS.length) {
        tables.push(createTable(i, TABLE_POSITIONS[i]));
        showToast('New table added! 🪑');
      }
    } else if (key === 'speed') {
      player.speed = getPlayerSpeed();
      showToast('You feel faster! 👟');
    } else if (key === 'cookSpeed') {
      showToast('Kitchen upgraded! ⚡');
    } else if (key === 'spawnRate') {
      showToast('More guests incoming! 📣');
    }

    // Level up display
    gameLevel = 1 + Object.values(upgrades).reduce((s, u) => s + u.level, 0);

    updateHUD();
    renderShopItems();
    document.getElementById('shop-money').textContent = money;
  }

  /* ============================================================
     DRAW HELPERS
  ============================================================ */
  function drawRoundRect(x, y, w, h, r, fill, stroke, strokeW = 2) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
  }

  function drawCircle(x, y, r, fill, stroke, strokeW = 2) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
  }

  function drawEmoji(emoji, x, y, size) {
    ctx.font      = `${size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  function drawProgressBar(x, y, w, h, pct, fg, bg = Colors.progressBg, radius = 4) {
    drawRoundRect(x, y, w, h, radius, bg, null);
    if (pct > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.clip();
      drawRoundRect(x, y, w * pct, h, radius, fg, null);
      ctx.restore();
    }
  }

  /* ============================================================
     DRAW SCENE
  ============================================================ */
  function drawRoom() {
    // Floor
    ctx.fillStyle = Colors.floor;
    ctx.fillRect(ROOM_X, ROOM_Y, ROOM_W, ROOM_H);

    // Tile pattern
    ctx.strokeStyle = Colors.floorTile;
    ctx.lineWidth   = 0.5;
    const tileSize  = 44;
    for (let tx = ROOM_X; tx < ROOM_X + ROOM_W; tx += tileSize) {
      ctx.beginPath(); ctx.moveTo(tx, ROOM_Y); ctx.lineTo(tx, ROOM_Y + ROOM_H); ctx.stroke();
    }
    for (let ty = ROOM_Y; ty < ROOM_Y + ROOM_H; ty += tileSize) {
      ctx.beginPath(); ctx.moveTo(ROOM_X, ty); ctx.lineTo(ROOM_X + ROOM_W, ty); ctx.stroke();
    }

    // Walls
    ctx.fillStyle = Colors.wall;
    ctx.fillRect(ROOM_X,              ROOM_Y,              ROOM_W, 8); // top
    ctx.fillRect(ROOM_X,              ROOM_Y + ROOM_H - 8, ROOM_W, 8); // bottom
    ctx.fillRect(ROOM_X,              ROOM_Y,              8, ROOM_H); // left
    ctx.fillRect(ROOM_X + ROOM_W - 8, ROOM_Y,              8, ROOM_H); // right

    // Wall top highlights
    ctx.fillStyle = Colors.wallTop;
    ctx.fillRect(ROOM_X, ROOM_Y, ROOM_W, 3);
    ctx.fillRect(ROOM_X, ROOM_Y, 3, ROOM_H);

    // Entrance door
    const ew = 36, eh = 50;
    const ex = ROOM_X, ey = entrance.cy - eh / 2;
    drawRoundRect(ex - 4, ey, ew, eh, 4, Colors.entrance, '#1a8a48', 2);
    drawEmoji('🚪', ex + 12, entrance.cy, 20);

    // Exit label
    ctx.font      = 'bold 10px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IN/OUT', ex + 18, entrance.cy + eh / 2 + 12);
  }

  function drawCounter() {
    const c = counter;
    // Shadow
    drawRoundRect(c.x + 3, c.y + 4, c.w, c.h, 8, Colors.shadow, null);
    // Body
    drawRoundRect(c.x, c.y, c.w, c.h, 8, Colors.counter, Colors.counterTop, 2.5);
    // Top highlight
    drawRoundRect(c.x + 4, c.y + 3, c.w - 8, 6, 3, 'rgba(255,255,255,0.15)', null);

    // Cooking food items on counter
    const cookingGuests = guests.filter(g => g.state === GUEST_STATE.WAITING_FOOD);
    cookingGuests.forEach((g, i) => {
      const fx = c.x + 14 + i * 30;
      const fy = c.cy;
      if (g.cookDone) {
        drawEmoji(g.food, fx, fy, 18);
      } else if (g.cookTimer > 0) {
        const pct = 1 - g.cookTimer / getCookTime();
        drawProgressBar(fx - 12, fy - 22, 24, 5, pct, Colors.progressRed);
        ctx.globalAlpha = 0.5;
        drawEmoji(g.food, fx, fy, 16);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.4;
        drawEmoji(g.food, fx, fy, 16);
        ctx.globalAlpha = 1;
      }
    });

    drawEmoji('👨‍🍳', c.x + c.w - 18, c.cy, 18);

    ctx.font      = 'bold 10px sans-serif';
    ctx.fillStyle = '#d0e8ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KITCHEN', c.cx, c.y - 10);
  }

  function drawTables() {
    tables.forEach(t => {
      const shadow = 4;
      // Shadow
      drawRoundRect(t.x + shadow, t.y + shadow, t.w, t.h, 8, Colors.shadow, null);

      // Table body
      const tColor = t.state === 'dirty' ? Colors.tableDirty : Colors.tableClean;
      drawRoundRect(t.x, t.y, t.w, t.h, 8, tColor, Colors.tableBorder, 2);

      // Top highlight
      drawRoundRect(t.x + 4, t.y + 3, t.w - 8, 8, 3, 'rgba(255,255,255,0.18)', null);

      // Chairs (decorative)
      const cx = t.cx(), cy = t.y;
      drawCircle(cx - 16, cy - 10, 8, Colors.chair, Colors.tableBorder, 1.5);
      drawCircle(cx + 16, cy - 10, 8, Colors.chair, Colors.tableBorder, 1.5);
      drawCircle(cx, t.y + t.h + 10, 8, Colors.chair, Colors.tableBorder, 1.5);

      if (t.state === 'dirty') {
        drawEmoji('🍽️', t.cx(), t.cy() - 4, 18);
        // Money on table
        if (t.money > 0) {
          drawEmoji('💰', t.cx(), t.cy() + 12, 14);
          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = Colors.gold;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(t.money, t.cx() + 14, t.cy() + 12);
        }

        // Cleaning progress bar
        if (player.interactTarget === t && player.interactTimer > 0) {
          const pct = 1 - player.interactTimer / 2.0;
          drawProgressBar(t.x + 4, t.y - 14, t.w - 8, 7, pct, Colors.progressFg);
          drawEmoji('🧹', t.cx(), t.y - 20, 14);
        }
      } else if (t.state === 'empty') {
        drawEmoji('🪑', t.cx(), t.cy(), 20);
      }

      // Number
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`T${t.id + 1}`, t.x + 4, t.y + 3);
    });
  }

  function drawGuests() {
    guests.forEach(g => {
      if (g.state === GUEST_STATE.GONE) return;

      const bob = Math.sin(g.bobOffset) * 2;

      // Shadow
      drawCircle(g.x + 2, g.y + 4 + bob, g.radius - 2, Colors.shadow, null);

      // Body
      const bodyColor = g.state === GUEST_STATE.QUEUING ? Colors.guestWait : g.color;
      drawCircle(g.x, g.y + bob, g.radius, bodyColor, Colors.guestBorder, 2);

      // Emoji face
      drawEmoji(g.emoji, g.x, g.y + bob, g.radius * 1.1);

      // Patience bar (queuing)
      if (g.state === GUEST_STATE.QUEUING) {
        const pct = 1 - g.patienceTimer / g.patience;
        drawProgressBar(g.x - 18, g.y + bob - g.radius - 10, 36, 5, pct, pct > 0.4 ? Colors.progressFg : Colors.progressRed);
      }

      // Order bubble (waiting for food)
      if (g.state === GUEST_STATE.WAITING_FOOD || g.state === GUEST_STATE.EATING) {
        drawSpeechBubble(g.x, g.y + bob - g.radius - 6, g.food, g.state);
      }

      // Eat progress bar
      if (g.state === GUEST_STATE.EATING) {
        const pct = 1 - g.eatTimer / g.eatTime;
        drawProgressBar(g.x - 18, g.y + bob - g.radius - 10, 36, 5, pct, '#f5c842');
      }
    });
  }

  function drawSpeechBubble(x, y, emoji, state) {
    const bw = 36, bh = 32, br = 8;
    const bx = x - bw / 2, by = y - bh - 6;
    // Bubble
    drawRoundRect(bx, by, bw, bh, br, Colors.speech, Colors.speechBorder, 1.5);
    // Tail
    ctx.beginPath();
    ctx.moveTo(x - 5, by + bh);
    ctx.lineTo(x + 5, by + bh);
    ctx.lineTo(x, by + bh + 7);
    ctx.closePath();
    ctx.fillStyle = Colors.speech;
    ctx.fill();
    ctx.strokeStyle = Colors.speechBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Emoji
    drawEmoji(emoji, x, by + bh / 2, 18);

    // Cooking indicator
    if (state === GUEST_STATE.WAITING_FOOD) {
      ctx.beginPath();
      ctx.arc(bx + bw - 5, by + 5, 5, 0, Math.PI * 2);
      ctx.fillStyle = Colors.progressRed;
      ctx.fill();
    } else if (state === GUEST_STATE.EATING) {
      ctx.beginPath();
      ctx.arc(bx + bw - 5, by + 5, 5, 0, Math.PI * 2);
      ctx.fillStyle = Colors.progressFg;
      ctx.fill();
    }
  }

  function drawPlayer() {
    const bob = player.vy !== 0 ? Math.sin(Date.now() / 120) * 2 : 0;

    // Shadow
    drawCircle(player.x + 2, player.y + 4, player.radius - 2, Colors.shadow, null);

    // Body
    drawCircle(player.x, player.y + bob, player.radius, Colors.player, Colors.playerBorder, 2.5);

    // Emoji
    drawEmoji('👨‍🍳', player.x, player.y + bob, player.radius * 1.2);

    // Carrying indicator
    if (player.carrying) {
      drawRoundRect(player.x + 10, player.y + bob - 26, 26, 24, 6, 'rgba(255,255,255,0.9)', Colors.gold, 1.5);
      drawEmoji(player.carrying, player.x + 23, player.y + bob - 14, 16);
    }

    // Following indicator
    if (player.followGuest) {
      ctx.font      = '11px serif';
      ctx.textAlign = 'center';
      ctx.fillText('➡️', player.x, player.y + bob - 28);
    }

    // Interact arrow (counter prompt)
    if (!player.carrying && !player.followGuest && nearCounter()) {
      const readyFood = guests.find(g => g.state === GUEST_STATE.WAITING_FOOD && g.cookDone);
      if (readyFood) {
        drawInteractPrompt(player.x, player.y + bob - 32, `Pick up ${readyFood.food}`);
      }
    }
  }

  function drawInteractPrompt(x, y, text) {
    ctx.font      = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    const tw      = ctx.measureText(text).width;
    drawRoundRect(x - tw / 2 - 8, y - 14, tw + 16, 16, 5, 'rgba(0,0,0,0.7)', Colors.gold, 1);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 6);
  }

  function drawParticles() {
    particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      if (p.text) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        drawCircle(p.x, p.y, p.r, p.color, null);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawHints() {
    // First-time hints
    if (guests.length === 0) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Guests will arrive shortly…', ROOM_X + ROOM_W / 2, ROOM_Y + ROOM_H / 2);
    }
  }

  /* ============================================================
     MAIN LOOP
  ============================================================ */
  function update(dt) {
    if (paused) return;
    updatePlayer(dt);
    updateGuests(dt);
    updateSpawn(dt);
    updateParticles(dt);
    player.speed = getPlayerSpeed(); // in case upgrade happened
    updateHUD();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#1a0a04';
    ctx.fillRect(0, 0, W, H);

    drawRoom();
    drawCounter();
    drawTables();
    drawGuests();
    drawPlayer();
    drawParticles();
    drawHints();
  }

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ============================================================
     EVENT BINDINGS
  ============================================================ */
  document.getElementById('shop-btn').addEventListener('click', openShop);
  document.getElementById('shop-close').addEventListener('click', closeShop);

  document.getElementById('claim-btn').addEventListener('click', () => {
    if (money <= 0) {
      showToast('No earnings yet! 💸');
      return;
    }
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.sendData(JSON.stringify({ discount: money, totalEarned }));
      tg.close();
    } else {
      showToast(`Claimed 💰${money}! (no Telegram context)`);
      money = 0;
      updateHUD();
    }
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    gameStarted = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  });

  window.addEventListener('resize', resize);

  /* ── Telegram WebApp init ── */
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.expand();
    tg.ready();
    tg.setHeaderColor('#1a0a04');
    tg.setBackgroundColor('#1a0a04');
  }

  /* ============================================================
     BOOTSTRAP
  ============================================================ */
  init();

})();

