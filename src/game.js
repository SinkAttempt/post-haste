// Post Haste — MVP Prototype
// Portrait mobile arcade idle post office sim
// HTML5 Canvas / Vanilla JS

// ============================================================
// CONSTANTS
// ============================================================
const CANVAS_W = 390;
const CANVAS_H = 844;

// Colours
const COL = {
    bg: '#F5F0E8',
    wall: '#D4D0C8',
    floor: '#EDE8DC',
    postal: '#2B4570',
    brown: '#A37B4F',
    red: '#D4483B',
    green: '#4A8C5C',
    blue: '#3B7DD8',
    yellow: '#D4A83B',
    text: '#1A1A2E',
    textLight: '#666',
    white: '#FFFFFF',
    shadow: 'rgba(0,0,0,0.1)',
    highlight: 'rgba(255,255,255,0.8)',
    overlay: 'rgba(0,0,0,0.5)',
    streakGlow: '#FFD700',
};

// Station positions (relative to office)
const OFFICE = {
    x: 20,
    y: 100,
    w: CANVAS_W - 40,
    h: 520,
};

// Station definitions
const STATIONS = {
    incoming: { x: 60, y: 180, w: 70, h: 50, label: 'INCOMING', col: COL.brown },
    sorting:  { x: 160, y: 400, w: 80, h: 60, label: 'SORT DESK', col: COL.postal },
    counter:  { x: 290, y: 180, w: 70, h: 50, label: 'COUNTER', col: COL.green },
    outgoing: { x: 290, y: 500, w: 70, h: 50, label: 'OUTGOING', col: COL.red },
};

// Sort bins (used in sort mode)
const BIN_COLS = [
    { name: 'Red', col: COL.red, dir: 'left' },
    { name: 'Blue', col: COL.blue, dir: 'right' },
    { name: 'Green', col: COL.green, dir: 'up' },
];

// Player
const PLAYER_RADIUS = 18;
const PLAYER_SPEED_BASE = 2.5;
const STACK_ITEM_H = 8;

// Joystick
const JOY_RADIUS = 50;
const JOY_KNOB = 22;
const JOY_DEAD = 8;

// Proximity trigger distance
const PROX_DIST = 45;

// Day settings
const DAY_BASE_TIME = 180; // 3 minutes in seconds
const MAIL_SPAWN_INTERVAL_BASE = 3000; // ms between new mail at incoming
const CUSTOMER_SPAWN_INTERVAL_BASE = 8000; // ms between customers
const CUSTOMER_PATIENCE = 15000; // ms before customer leaves

// ============================================================
// GAME STATE
// ============================================================
let canvas, ctx;
let scale = 1;
let offsetX = 0, offsetY = 0;

const state = {
    screen: 'menu', // menu, playing, sorting, dayEnd, upgrade
    day: 1,
    timeLeft: DAY_BASE_TIME,
    coins: 0,
    totalCoins: 0,
    dayCoins: 0,
    streak: 0,
    bestStreak: 0,

    // Player
    player: { x: 195, y: 350, vx: 0, vy: 0 },
    stack: [], // items player is carrying
    maxStack: 3,
    moveSpeed: PLAYER_SPEED_BASE,

    // Stations
    incomingPile: [], // mail waiting at incoming
    outgoingPile: [], // sorted mail deposited at outgoing
    sortedCount: 0,
    missortCount: 0,
    mailDelivered: 0,

    // Customers
    customers: [],
    customersServed: 0,

    // Sort mode
    sortItem: null,
    sortBinCount: 2,
    sortSwipe: null, // {startX, startY}

    // Joystick
    joy: { active: false, touchId: null, baseX: 0, baseY: 0, knobX: 0, knobY: 0, dx: 0, dy: 0 },

    // Timers
    lastMailSpawn: 0,
    lastCustomerSpawn: 0,
    dayTimer: null,

    // Upgrades
    upgrades: {
        capacity: 0, // +1 per level
        speed: 0,    // +0.3 per level
        sortSpeed: 0, // future
    },

    // Persistence
    totalStars: 0,
    daysCompleted: 0,
};

// ============================================================
// SAVE / LOAD
// ============================================================
function save() {
    const data = {
        day: state.day,
        totalCoins: state.totalCoins,
        upgrades: state.upgrades,
        totalStars: state.totalStars,
        daysCompleted: state.daysCompleted,
        maxStack: state.maxStack,
        moveSpeed: state.moveSpeed,
    };
    localStorage.setItem('postHaste', JSON.stringify(data));
}

function load() {
    const raw = localStorage.getItem('postHaste');
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        state.day = data.day || 1;
        state.totalCoins = data.totalCoins || 0;
        state.coins = state.totalCoins;
        state.upgrades = data.upgrades || { capacity: 0, speed: 0, sortSpeed: 0 };
        state.totalStars = data.totalStars || 0;
        state.daysCompleted = data.daysCompleted || 0;
        state.maxStack = data.maxStack || 3;
        state.moveSpeed = data.moveSpeed || PLAYER_SPEED_BASE;
    } catch (e) {
        console.error('Failed to load save:', e);
    }
}

// ============================================================
// MAIL GENERATION
// ============================================================
let mailIdCounter = 0;

function createMail() {
    const binCount = state.sortBinCount;
    const binIdx = Math.floor(Math.random() * binCount);
    const isParcel = state.day >= 5 && Math.random() < 0.3;
    return {
        id: mailIdCounter++,
        bin: binIdx,
        col: BIN_COLS[binIdx].col,
        label: BIN_COLS[binIdx].name,
        isParcel,
        weight: isParcel ? 2 : 1,
    };
}

// ============================================================
// INIT
// ============================================================
function init() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    // Touch events
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });

    // Mouse fallback (desktop testing)
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);

    load();
    state.screen = 'menu';
    requestAnimationFrame(gameLoop);
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;

    // Fit canvas to screen maintaining aspect ratio
    const targetRatio = CANVAS_W / CANVAS_H;
    const windowRatio = windowW / windowH;

    let displayW, displayH;
    if (windowRatio < targetRatio) {
        displayW = windowW;
        displayH = windowW / targetRatio;
    } else {
        displayH = windowH;
        displayW = windowH * targetRatio;
    }

    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    scale = displayW / CANVAS_W;
    offsetX = (windowW - displayW) / 2;
    offsetY = (windowH - displayH) / 2;
}

function canvasCoords(clientX, clientY) {
    return {
        x: (clientX - offsetX) / scale,
        y: (clientY - offsetY) / scale,
    };
}

// ============================================================
// INPUT HANDLING
// ============================================================
function onTouchStart(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        const pos = canvasCoords(touch.clientX, touch.clientY);
        handlePointerDown(pos.x, pos.y, touch.identifier);
    }
}

function onTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        const pos = canvasCoords(touch.clientX, touch.clientY);
        handlePointerMove(pos.x, pos.y, touch.identifier);
    }
}

function onTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        const pos = canvasCoords(touch.clientX, touch.clientY);
        handlePointerUp(pos.x, pos.y, touch.identifier);
    }
}

let mouseDown = false;
function onMouseDown(e) {
    mouseDown = true;
    const pos = canvasCoords(e.clientX, e.clientY);
    handlePointerDown(pos.x, pos.y, -1);
}
function onMouseMove(e) {
    if (!mouseDown) return;
    const pos = canvasCoords(e.clientX, e.clientY);
    handlePointerMove(pos.x, pos.y, -1);
}
function onMouseUp(e) {
    mouseDown = false;
    const pos = canvasCoords(e.clientX, e.clientY);
    handlePointerUp(pos.x, pos.y, -1);
}

function handlePointerDown(x, y, id) {
    if (state.screen === 'menu') {
        startDay();
        return;
    }
    if (state.screen === 'dayEnd') {
        state.screen = 'upgrade';
        return;
    }
    if (state.screen === 'upgrade') {
        handleUpgradeTap(x, y);
        return;
    }
    if (state.screen === 'sorting') {
        // Start swipe
        state.sortSwipe = { startX: x, startY: y };
        return;
    }
    if (state.screen === 'playing') {
        // Debug skip button (top-right)
        if (x > CANVAS_W - 50 && x < CANVAS_W && y > 62 && y < 84) {
            endDay();
            return;
        }
        // Start joystick
        if (y > CANVAS_H * 0.6) {
            state.joy.active = true;
            state.joy.touchId = id;
            state.joy.baseX = x;
            state.joy.baseY = y;
            state.joy.knobX = x;
            state.joy.knobY = y;
            state.joy.dx = 0;
            state.joy.dy = 0;
        }
    }
}

function handlePointerMove(x, y, id) {
    if (state.screen === 'sorting' && state.sortSwipe) {
        // Tracking swipe (we handle on release)
        return;
    }
    if (state.screen === 'playing' && state.joy.active && state.joy.touchId === id) {
        const dx = x - state.joy.baseX;
        const dy = y - state.joy.baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampDist = Math.min(dist, JOY_RADIUS);
        const angle = Math.atan2(dy, dx);

        state.joy.knobX = state.joy.baseX + Math.cos(angle) * clampDist;
        state.joy.knobY = state.joy.baseY + Math.sin(angle) * clampDist;

        if (dist > JOY_DEAD) {
            const strength = clampDist / JOY_RADIUS;
            state.joy.dx = Math.cos(angle) * strength;
            state.joy.dy = Math.sin(angle) * strength;
        } else {
            state.joy.dx = 0;
            state.joy.dy = 0;
        }
    }
}

function handlePointerUp(x, y, id) {
    if (state.screen === 'sorting' && state.sortSwipe) {
        handleSortSwipe(x, y);
        state.sortSwipe = null;
        return;
    }
    if (state.joy.active && state.joy.touchId === id) {
        state.joy.active = false;
        state.joy.dx = 0;
        state.joy.dy = 0;
    }
}

// ============================================================
// SORT SWIPE HANDLING
// ============================================================
function handleSortSwipe(endX, endY) {
    if (!state.sortItem || !state.sortSwipe) return;

    const dx = endX - state.sortSwipe.startX;
    const dy = endY - state.sortSwipe.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 30) return; // Too short, ignore

    // Determine direction
    let dir;
    if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx < 0 ? 'left' : 'right';
    } else {
        dir = dy < 0 ? 'up' : 'down';
    }

    // Check which bin this matches
    const activeBins = BIN_COLS.slice(0, state.sortBinCount);
    const targetBin = activeBins.findIndex(b => b.dir === dir);

    if (targetBin === -1) {
        // Swiped in a direction with no bin — ignore
        return;
    }

    // Check correctness
    if (targetBin === state.sortItem.bin) {
        // Correct sort!
        state.streak++;
        if (state.streak > state.bestStreak) state.bestStreak = state.streak;
        const multiplier = Math.min(1 + (state.streak - 1) * 0.5, 3);
        const earned = Math.floor(state.sortItem.isParcel ? 8 * multiplier : 4 * multiplier);
        state.dayCoins += earned;
        state.sortedCount++;
        state.outgoingPile.push(state.sortItem);
        floatingTexts.push(createFloatingText('+' + earned, CANVAS_W / 2, CANVAS_H / 2 - 50, COL.green));
    } else {
        // Wrong sort — bounces back
        state.streak = 0;
        state.missortCount++;
        floatingTexts.push(createFloatingText('WRONG', CANVAS_W / 2, CANVAS_H / 2 - 50, COL.red));
    }

    // Next item or exit sort mode
    if (state.stack.length > 0) {
        state.sortItem = state.stack.pop();
    } else {
        state.sortItem = null;
        state.screen = 'playing';
    }
}

// ============================================================
// UPGRADE HANDLING
// ============================================================
const UPGRADE_DEFS = [
    {
        key: 'capacity',
        label: 'Carry Capacity',
        desc: '+1 mail per trip',
        baseCost: 30,
        costMult: 1.8,
        apply: () => { state.maxStack = 3 + state.upgrades.capacity + 1; },
    },
    {
        key: 'speed',
        label: 'Move Speed',
        desc: 'Walk faster',
        baseCost: 25,
        costMult: 1.6,
        apply: () => { state.moveSpeed = PLAYER_SPEED_BASE + (state.upgrades.speed + 1) * 0.3; },
    },
];

function getUpgradeCost(def) {
    return Math.floor(def.baseCost * Math.pow(def.costMult, state.upgrades[def.key]));
}

function handleUpgradeTap(x, y) {
    // Check "Next Day" button
    if (x > 120 && x < 270 && y > 680 && y < 730) {
        startDay();
        return;
    }

    // Check upgrade buttons
    UPGRADE_DEFS.forEach((def, i) => {
        const btnY = 380 + i * 120;
        if (x > 60 && x < 330 && y > btnY && y < btnY + 90) {
            const cost = getUpgradeCost(def);
            if (state.coins >= cost) {
                state.coins -= cost;
                state.totalCoins = state.coins;
                state.upgrades[def.key]++;
                def.apply();
                save();
            }
        }
    });
}

// ============================================================
// FLOATING TEXT
// ============================================================
let floatingTexts = [];

function createFloatingText(text, x, y, col) {
    return { text, x, y, col, life: 1.0 };
}

function updateFloatingTexts(dt) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].life -= dt * 1.5;
        floatingTexts[i].y -= 30 * dt;
        if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }
}

// ============================================================
// GAME LOGIC
// ============================================================
function startDay() {
    state.screen = 'playing';
    state.timeLeft = DAY_BASE_TIME;
    state.dayCoins = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.sortedCount = 0;
    state.missortCount = 0;
    state.mailDelivered = 0;
    state.customersServed = 0;
    state.incomingPile = [];
    state.outgoingPile = [];
    state.stack = [];
    state.sortItem = null;
    state.customers = [];
    state.player.x = 195;
    state.player.y = 350;
    state.joy.active = false;
    state.lastMailSpawn = Date.now();
    state.lastCustomerSpawn = Date.now();
    floatingTexts = [];

    // Scale difficulty by day
    state.sortBinCount = state.day >= 10 ? 3 : 2;

    // Seed some initial mail
    for (let i = 0; i < 3; i++) {
        state.incomingPile.push(createMail());
    }
}

function endDay() {
    state.screen = 'dayEnd';

    // Calculate stars
    let stars = 1;
    if (state.sortedCount >= 10 && state.missortCount <= 2) stars = 2;
    if (state.sortedCount >= 20 && state.missortCount === 0) stars = 3;

    state.dayStars = stars;
    state.totalStars += stars;
    state.coins += state.dayCoins;
    state.totalCoins = state.coins;
    state.daysCompleted++;
    state.day++;
    save();
}

function dist(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

function stationCenter(s) {
    return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

function nearStation(stationKey) {
    const s = STATIONS[stationKey];
    const sc = stationCenter(s);
    return dist(state.player.x, state.player.y, sc.x, sc.y) < PROX_DIST + s.w / 2;
}

function stackWeight() {
    let w = 0;
    for (const item of state.stack) w += item.weight;
    return w;
}

let lastTime = 0;
let dayTimerAcc = 0;

function update(dt) {
    if (state.screen !== 'playing') return;

    const now = Date.now();

    // Day timer
    dayTimerAcc += dt;
    if (dayTimerAcc >= 1) {
        dayTimerAcc -= 1;
        state.timeLeft--;
        if (state.timeLeft <= 0) {
            endDay();
            return;
        }
    }

    // Spawn mail at incoming
    const mailInterval = Math.max(1500, MAIL_SPAWN_INTERVAL_BASE - state.day * 100);
    if (now - state.lastMailSpawn > mailInterval && state.incomingPile.length < 8) {
        state.incomingPile.push(createMail());
        state.lastMailSpawn = now;
    }

    // Spawn customers
    const custInterval = Math.max(4000, CUSTOMER_SPAWN_INTERVAL_BASE - state.day * 300);
    if (now - state.lastCustomerSpawn > custInterval && state.customers.length < 3) {
        state.customers.push({
            id: Date.now(),
            patience: CUSTOMER_PATIENCE,
            coins: 5 + Math.floor(Math.random() * 10),
        });
        state.lastCustomerSpawn = now;
    }

    // Update customers (patience)
    for (let i = state.customers.length - 1; i >= 0; i--) {
        state.customers[i].patience -= dt * 1000;
        if (state.customers[i].patience <= 0) {
            state.customers.splice(i, 1); // Customer left angry
        }
    }

    // Move player
    const px = state.player.x + state.joy.dx * state.moveSpeed;
    const py = state.player.y + state.joy.dy * state.moveSpeed;

    // Clamp to office bounds
    const margin = PLAYER_RADIUS + 5;
    state.player.x = Math.max(OFFICE.x + margin, Math.min(OFFICE.x + OFFICE.w - margin, px));
    state.player.y = Math.max(OFFICE.y + margin, Math.min(OFFICE.y + OFFICE.h - margin, py));

    // Proximity checks (only when not moving fast — prevents drive-by)
    const isMoving = Math.abs(state.joy.dx) > 0.3 || Math.abs(state.joy.dy) > 0.3;

    // INCOMING: Pick up mail
    if (nearStation('incoming') && state.incomingPile.length > 0) {
        while (state.stack.length < state.maxStack && state.incomingPile.length > 0) {
            state.stack.push(state.incomingPile.shift());
        }
    }

    // SORTING DESK: Enter sort mode
    if (nearStation('sorting') && state.stack.length > 0 && !isMoving) {
        state.sortItem = state.stack.pop();
        state.screen = 'sorting';
        state.joy.active = false;
        state.joy.dx = 0;
        state.joy.dy = 0;
    }

    // COUNTER: Serve customers
    if (nearStation('counter') && state.customers.length > 0) {
        const cust = state.customers.shift();
        state.customersServed++;
        state.dayCoins += cust.coins;
        floatingTexts.push(createFloatingText('+' + cust.coins, STATIONS.counter.x + 35, STATIONS.counter.y - 10, COL.green));
    }

    // OUTGOING: Deposit sorted mail
    if (nearStation('outgoing') && state.outgoingPile.length > 0) {
        const delivered = state.outgoingPile.length;
        state.mailDelivered += delivered;
        const bonus = delivered * 2;
        state.dayCoins += bonus;
        floatingTexts.push(createFloatingText('+' + bonus + ' delivery', STATIONS.outgoing.x + 35, STATIONS.outgoing.y - 10, COL.postal));
        state.outgoingPile = [];
    }

    updateFloatingTexts(dt);
}

// ============================================================
// RENDERING
// ============================================================
function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawStation(key) {
    const s = STATIONS[key];
    ctx.save();

    // Shadow
    ctx.fillStyle = COL.shadow;
    drawRoundRect(s.x + 2, s.y + 2, s.w, s.h, 6);
    ctx.fill();

    // Body
    ctx.fillStyle = s.col;
    drawRoundRect(s.x, s.y, s.w, s.h, 6);
    ctx.fill();

    // Label
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.label, s.x + s.w / 2, s.y + s.h / 2);

    // Indicator counts
    let count = 0;
    if (key === 'incoming') count = state.incomingPile.length;
    if (key === 'counter') count = state.customers.length;
    if (key === 'outgoing') count = state.outgoingPile.length;

    if (count > 0) {
        ctx.fillStyle = COL.white;
        ctx.beginPath();
        ctx.arc(s.x + s.w - 5, s.y + 5, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = s.col;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(count, s.x + s.w - 5, s.y + 6);
    }

    ctx.restore();
}

function drawPlayer() {
    const px = state.player.x;
    const py = state.player.y;

    ctx.save();

    // Shadow
    ctx.fillStyle = COL.shadow;
    ctx.beginPath();
    ctx.ellipse(px + 1, py + PLAYER_RADIUS - 2, PLAYER_RADIUS * 0.8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = COL.postal;
    drawRoundRect(px - PLAYER_RADIUS, py - PLAYER_RADIUS, PLAYER_RADIUS * 2, PLAYER_RADIUS * 2, 8);
    ctx.fill();

    // Face
    ctx.fillStyle = COL.white;
    ctx.beginPath();
    ctx.arc(px - 5, py - 4, 3, 0, Math.PI * 2);
    ctx.arc(px + 5, py - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = COL.white;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py + 2, 5, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Hat (postal cap)
    ctx.fillStyle = COL.postal;
    drawRoundRect(px - PLAYER_RADIUS - 2, py - PLAYER_RADIUS - 8, PLAYER_RADIUS * 2 + 4, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#1a3050';
    drawRoundRect(px - PLAYER_RADIUS + 2, py - PLAYER_RADIUS - 12, PLAYER_RADIUS * 2 - 4, 8, 3);
    ctx.fill();

    // Stack on head
    const stackBase = py - PLAYER_RADIUS - 14;
    for (let i = 0; i < state.stack.length; i++) {
        const item = state.stack[i];
        const wobble = Math.sin(Date.now() * 0.003 + i * 0.7) * (1 + i * 0.5);
        const ix = px + wobble - (item.isParcel ? 10 : 8);
        const iy = stackBase - i * STACK_ITEM_H;
        const iw = item.isParcel ? 20 : 16;
        const ih = item.isParcel ? 7 : 4;

        ctx.fillStyle = item.col;
        drawRoundRect(ix, iy - ih, iw, ih, 2);
        ctx.fill();

        // Parcel tape
        if (item.isParcel) {
            ctx.strokeStyle = COL.brown;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ix + iw / 2, iy - ih);
            ctx.lineTo(ix + iw / 2, iy);
            ctx.stroke();
        }
    }

    ctx.restore();
}

function drawJoystick() {
    if (!state.joy.active && state.screen !== 'playing') return;

    const jx = state.joy.active ? state.joy.baseX : CANVAS_W / 2;
    const jy = state.joy.active ? state.joy.baseY : CANVAS_H - 100;

    ctx.save();
    ctx.globalAlpha = state.joy.active ? 0.4 : 0.15;

    // Base
    ctx.fillStyle = COL.text;
    ctx.beginPath();
    ctx.arc(jx, jy, JOY_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Knob
    ctx.globalAlpha = state.joy.active ? 0.6 : 0.25;
    ctx.fillStyle = COL.postal;
    const kx = state.joy.active ? state.joy.knobX : jx;
    const ky = state.joy.active ? state.joy.knobY : jy;
    ctx.beginPath();
    ctx.arc(kx, ky, JOY_KNOB, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawHUD() {
    ctx.save();

    // Top bar background
    ctx.fillStyle = COL.postal;
    ctx.fillRect(0, 0, CANVAS_W, 80);

    // Day
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Day ' + state.day, 15, 25);

    // Timer
    const mins = Math.floor(state.timeLeft / 60);
    const secs = state.timeLeft % 60;
    const timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px sans-serif';
    if (state.timeLeft <= 30) ctx.fillStyle = COL.red;
    ctx.fillText(timeStr, CANVAS_W / 2, 25);

    // Coins
    ctx.fillStyle = COL.yellow;
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(state.dayCoins + ' coins', CANVAS_W - 15, 25);

    // Streak
    if (state.streak > 1) {
        ctx.fillStyle = COL.streakGlow;
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('Streak x' + state.streak, CANVAS_W / 2, 55);
    }

    // Stack indicator
    ctx.fillStyle = COL.highlight;
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillText('Carrying: ' + state.stack.length + '/' + state.maxStack, 15, 55);

    // Sorted count
    ctx.textAlign = 'right';
    ctx.fillText('Sorted: ' + state.sortedCount, CANVAS_W - 15, 55);

    // Debug: Skip day button (top-right)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    drawRoundRect(CANVAS_W - 50, 62, 40, 22, 4);
    ctx.fill();
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SKIP', CANVAS_W - 30, 74);

    ctx.restore();
}

function drawOffice() {
    ctx.save();

    // Floor
    ctx.fillStyle = COL.floor;
    drawRoundRect(OFFICE.x, OFFICE.y, OFFICE.w, OFFICE.h, 10);
    ctx.fill();

    // Walls
    ctx.strokeStyle = COL.wall;
    ctx.lineWidth = 3;
    drawRoundRect(OFFICE.x, OFFICE.y, OFFICE.w, OFFICE.h, 10);
    ctx.stroke();

    // Grid lines (subtle floor tiles)
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    for (let gx = OFFICE.x + 40; gx < OFFICE.x + OFFICE.w; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, OFFICE.y);
        ctx.lineTo(gx, OFFICE.y + OFFICE.h);
        ctx.stroke();
    }
    for (let gy = OFFICE.y + 40; gy < OFFICE.y + OFFICE.h; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(OFFICE.x, gy);
        ctx.lineTo(OFFICE.x + OFFICE.w, gy);
        ctx.stroke();
    }

    // Stations
    drawStation('incoming');
    drawStation('sorting');
    drawStation('counter');
    drawStation('outgoing');

    // Proximity hints (glow when near and can interact)
    if (state.screen === 'playing') {
        if (nearStation('incoming') && state.incomingPile.length > 0 && state.stack.length < state.maxStack) {
            drawProximityGlow(STATIONS.incoming);
        }
        if (nearStation('sorting') && state.stack.length > 0) {
            drawProximityGlow(STATIONS.sorting);
        }
        if (nearStation('counter') && state.customers.length > 0) {
            drawProximityGlow(STATIONS.counter);
        }
        if (nearStation('outgoing') && state.outgoingPile.length > 0) {
            drawProximityGlow(STATIONS.outgoing);
        }
    }

    ctx.restore();
}

function drawProximityGlow(s) {
    ctx.save();
    const pulse = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = COL.yellow;
    ctx.lineWidth = 3;
    drawRoundRect(s.x - 4, s.y - 4, s.w + 8, s.h + 8, 8);
    ctx.stroke();
    ctx.restore();
}

function drawFloatingTexts() {
    for (const ft of floatingTexts) {
        ctx.save();
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.col;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    }
}

// ============================================================
// SORT MODE RENDERING
// ============================================================
function drawSortMode() {
    ctx.save();

    // Dim background
    ctx.fillStyle = COL.overlay;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Title
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SORT THE MAIL', CANVAS_W / 2, 80);

    // Remaining count
    ctx.font = '14px sans-serif';
    ctx.fillText(state.stack.length + ' remaining', CANVAS_W / 2, 110);

    // Streak
    if (state.streak > 1) {
        ctx.fillStyle = COL.streakGlow;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('STREAK x' + state.streak, CANVAS_W / 2, 145);
    }

    // Current item
    if (state.sortItem) {
        const cx = CANVAS_W / 2;
        const cy = CANVAS_H / 2;
        const iw = state.sortItem.isParcel ? 120 : 100;
        const ih = state.sortItem.isParcel ? 80 : 50;

        // Item card
        ctx.fillStyle = COL.white;
        ctx.shadowColor = COL.shadow;
        ctx.shadowBlur = 10;
        drawRoundRect(cx - iw / 2, cy - ih / 2, iw, ih, 10);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Colour stripe
        ctx.fillStyle = state.sortItem.col;
        drawRoundRect(cx - iw / 2, cy - ih / 2, iw, 20, 10);
        ctx.fill();
        // Fix bottom corners of stripe
        ctx.fillRect(cx - iw / 2, cy - ih / 2 + 10, iw, 10);

        // Label
        ctx.fillStyle = COL.text;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(state.sortItem.label, cx, cy + 5);

        // Type
        ctx.font = '12px sans-serif';
        ctx.fillStyle = COL.textLight;
        ctx.fillText(state.sortItem.isParcel ? 'PARCEL' : 'LETTER', cx, cy + 25);
    }

    // Bin labels
    const activeBins = BIN_COLS.slice(0, state.sortBinCount);
    for (const bin of activeBins) {
        ctx.save();
        let bx, by;
        if (bin.dir === 'left') { bx = 50; by = CANVAS_H / 2; }
        if (bin.dir === 'right') { bx = CANVAS_W - 50; by = CANVAS_H / 2; }
        if (bin.dir === 'up') { bx = CANVAS_W / 2; by = CANVAS_H / 2 - 160; }

        // Bin box
        ctx.fillStyle = bin.col;
        ctx.globalAlpha = 0.8;
        drawRoundRect(bx - 30, by - 20, 60, 40, 8);
        ctx.fill();

        // Arrow
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = bin.col;
        const arrowDist = 70;
        let ax, ay;
        if (bin.dir === 'left') { ax = bx + arrowDist; ay = by; }
        if (bin.dir === 'right') { ax = bx - arrowDist; ay = by; }
        if (bin.dir === 'up') { ax = bx; ay = by + arrowDist; }
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const arrows = { left: '←', right: '→', up: '↑' };
        ctx.fillText(arrows[bin.dir], ax, ay);

        // Label
        ctx.globalAlpha = 1;
        ctx.fillStyle = COL.white;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(bin.name, bx, by);

        ctx.restore();
    }

    // Instruction
    ctx.fillStyle = COL.white;
    ctx.globalAlpha = 0.6;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Swipe mail to the matching bin', CANVAS_W / 2, CANVAS_H - 120);

    drawFloatingTexts();
    ctx.restore();
}

// ============================================================
// MENU SCREEN
// ============================================================
function drawMenu() {
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Title
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POST', CANVAS_W / 2, 280);
    ctx.fillText('HASTE', CANVAS_W / 2, 340);

    // Subtitle
    ctx.fillStyle = COL.brown;
    ctx.font = '16px sans-serif';
    ctx.fillText('Sort. Serve. Deliver.', CANVAS_W / 2, 390);

    // Stats
    if (state.daysCompleted > 0) {
        ctx.fillStyle = COL.textLight;
        ctx.font = '14px sans-serif';
        ctx.fillText('Day ' + state.day + ' | ' + state.totalCoins + ' coins | ' + state.totalStars + ' stars', CANVAS_W / 2, 450);
    }

    // Start button
    ctx.fillStyle = COL.postal;
    drawRoundRect(120, 520, 150, 50, 12);
    ctx.fill();
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(state.daysCompleted > 0 ? 'Next Shift' : 'Start', CANVAS_W / 2, 545);

    // Tap hint
    ctx.fillStyle = COL.textLight;
    ctx.font = '12px sans-serif';
    ctx.fillText('Tap anywhere to begin', CANVAS_W / 2, 620);

    // DuckDuckWeasel
    ctx.font = '11px sans-serif';
    ctx.fillStyle = COL.textLight;
    ctx.fillText('DuckDuckWeasel', CANVAS_W / 2, CANVAS_H - 30);

    ctx.restore();
}

// ============================================================
// DAY END SCREEN
// ============================================================
function drawDayEnd() {
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Title
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Shift Complete!', CANVAS_W / 2, 150);

    // Stars
    const starY = 210;
    for (let i = 0; i < 3; i++) {
        ctx.font = '40px sans-serif';
        ctx.fillStyle = i < state.dayStars ? COL.yellow : COL.wall;
        ctx.fillText('★', CANVAS_W / 2 - 50 + i * 50, starY);
    }

    // Stats
    ctx.fillStyle = COL.text;
    ctx.font = '16px sans-serif';
    const stats = [
        'Mail Sorted: ' + state.sortedCount,
        'Missorts: ' + state.missortCount,
        'Customers Served: ' + state.customersServed,
        'Deliveries: ' + state.mailDelivered,
        'Best Streak: ' + state.bestStreak,
        '',
        'Coins Earned: ' + state.dayCoins,
    ];
    stats.forEach((s, i) => {
        ctx.fillText(s, CANVAS_W / 2, 290 + i * 30);
    });

    // Tap to continue
    ctx.fillStyle = COL.textLight;
    ctx.font = '14px sans-serif';
    ctx.fillText('Tap to continue', CANVAS_W / 2, 600);

    ctx.restore();
}

// ============================================================
// UPGRADE SCREEN
// ============================================================
function drawUpgradeScreen() {
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Title
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Post Office Upgrades', CANVAS_W / 2, 120);

    // Balance
    ctx.fillStyle = COL.yellow;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(state.coins + ' coins', CANVAS_W / 2, 170);

    // Current stats
    ctx.fillStyle = COL.textLight;
    ctx.font = '13px sans-serif';
    ctx.fillText('Capacity: ' + state.maxStack + ' | Speed: ' + state.moveSpeed.toFixed(1), CANVAS_W / 2, 210);

    // Upgrade buttons
    UPGRADE_DEFS.forEach((def, i) => {
        const y = 380 + i * 120;
        const cost = getUpgradeCost(def);
        const canAfford = state.coins >= cost;

        // Card
        ctx.fillStyle = COL.white;
        ctx.shadowColor = COL.shadow;
        ctx.shadowBlur = 5;
        drawRoundRect(60, y, 270, 90, 10);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Title
        ctx.fillStyle = COL.text;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(def.label, 80, y + 25);

        // Desc
        ctx.fillStyle = COL.textLight;
        ctx.font = '12px sans-serif';
        ctx.fillText(def.desc + ' (Lv.' + state.upgrades[def.key] + ')', 80, y + 48);

        // Cost button
        ctx.fillStyle = canAfford ? COL.green : COL.wall;
        drawRoundRect(220, y + 55, 90, 28, 6);
        ctx.fill();
        ctx.fillStyle = COL.white;
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cost + ' coins', 265, y + 70);
    });

    // Next Day button
    ctx.fillStyle = COL.postal;
    drawRoundRect(120, 680, 150, 50, 12);
    ctx.fill();
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Next Shift →', CANVAS_W / 2, 705);

    ctx.restore();
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop(timestamp) {
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    switch (state.screen) {
        case 'menu':
            drawMenu();
            break;
        case 'playing':
            ctx.fillStyle = COL.bg;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            drawOffice();
            drawPlayer();
            drawJoystick();
            drawHUD();
            drawFloatingTexts();
            break;
        case 'sorting':
            ctx.fillStyle = COL.bg;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            drawOffice();
            drawPlayer();
            drawHUD();
            drawSortMode();
            break;
        case 'dayEnd':
            drawDayEnd();
            break;
        case 'upgrade':
            drawUpgradeScreen();
            break;
    }
}

// ============================================================
// START
// ============================================================
window.addEventListener('load', init);
