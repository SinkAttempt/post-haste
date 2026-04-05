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
    h: 530,
};

// Layout grid
const GRID_COLS = 5;
const GRID_ROWS = 7;
const GRID_CELL_W = Math.floor((CANVAS_W - 40) / GRID_COLS); // ~70
const GRID_CELL_H = Math.floor(530 / GRID_ROWS);              // ~75

// Blocked cells: pillars and walls [col, row]
const BLOCKED_CELLS = [
    [2, 2], // centre pillar
    [0, 4], // left wall feature
    [2, 5], // lower pillar
    [4, 3], // right wall feature
];
// Fixed features (drawn but not placeable)
const FIXED_FEATURES = [
    { col: 4, row: 0, label: 'DOOR', icon: '\u{1F6AA}' },       // customer entrance top-right
    { col: 0, row: 6, label: 'DOCK', icon: '\u{1F69B}' },       // loading dock bottom-left
];

// Station definitions — with placement constraints
const STATION_DEFS = {
    incoming: { w: 70, h: 55, label: 'MAIL IN', icon: '\u{1F4E8}', col: COL.brown,
        constraint: 'Must be near DOCK (within 2 cells)',
        check: (c, r) => Math.abs(c - 0) + Math.abs(r - 6) <= 3 },  // near dock
    sorting:  { w: 80, h: 60, label: 'SORT', icon: '\u{1F4CB}', col: COL.postal,
        constraint: 'Middle rows only (rows 2-5)',
        check: (c, r) => r >= 2 && r <= 5 },  // must be in centre area
    counter:  { w: 75, h: 55, label: 'SERVE', icon: '\u{1F6CE}', col: COL.green,
        constraint: 'Must be near DOOR (within 2 cells)',
        check: (c, r) => Math.abs(c - 4) + Math.abs(r - 0) <= 3 },  // near door
    outgoing: { w: 75, h: 55, label: 'SEND OUT', icon: '\u{1F69A}', col: COL.red,
        constraint: 'Must be near DOCK (within 2 cells)',
        check: (c, r) => Math.abs(c - 0) + Math.abs(r - 6) <= 3 },  // near dock
};

// Default grid positions [col, row] for each station
const DEFAULT_LAYOUT = {
    incoming: [1, 5],
    sorting:  [2, 3],
    counter:  [3, 1],
    outgoing: [0, 5],
};

// Current layout (mutable, saved/loaded)
let layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));

// STATIONS object — computed from layout, referenced everywhere
const STATIONS = {};
function rebuildStations() {
    for (const key in STATION_DEFS) {
        const def = STATION_DEFS[key];
        const [gc, gr] = layout[key];
        STATIONS[key] = {
            x: OFFICE.x + gc * GRID_CELL_W + (GRID_CELL_W - def.w) / 2,
            y: OFFICE.y + gr * GRID_CELL_H + (GRID_CELL_H - def.h) / 2,
            w: def.w,
            h: def.h,
            label: def.label,
            icon: def.icon,
            col: def.col,
        };
    }
}
rebuildStations();

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
const DAY_BASE_TIME = 60; // 60 seconds — tight shifts
const MAIL_SPAWN_INTERVAL_BASE = 2000; // ms between new mail at incoming
const CUSTOMER_SPAWN_INTERVAL_BASE = 5000; // ms between customers
const CUSTOMER_PATIENCE = 12000; // ms before customer leaves

// ============================================================
// AUDIO — cozy synthesised SFX (no external files)
// ============================================================
let audioCtx = null;
let masterGain = null;
let audioReady = false;

function getAudio() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.5;
            masterGain.connect(audioCtx.destination);
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => { audioReady = true; });
        } else {
            audioReady = true;
        }
        return audioCtx;
    } catch (e) {
        console.error('Audio init failed:', e);
        return null;
    }
}

function unlockAudio() {
    const ctx = getAudio();
    if (!ctx) return;
    try {
        // Force resume then play silent buffer
        const doUnlock = () => {
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
            audioReady = true;
        };
        if (ctx.state === 'suspended') {
            ctx.resume().then(doUnlock);
        } else {
            doUnlock();
        }
    } catch (e) {
        console.error('Audio unlock failed:', e);
    }
}

// Soft bubble pop — picking up mail
function sfxPickup() {
    const ctx = getAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.12);
}

// Swoosh + ding — correct sort
function sfxCorrect() {
    const ctx = getAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    // Ding
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1047, t + 0.06);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.3);
    // Warm undertone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523, t);
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.06, t + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.25);
}

// Gentle boop — wrong sort
function sfxWrong() {
    const ctx = getAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
}

// Warm ka-ching — tips/coins
function sfxCoin() {
    const ctx = getAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1319, t);
    osc.frequency.setValueAtTime(1568, t + 0.05);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
}

// Soft whoosh — dispatching mail
function sfxDispatch() {
    const ctx = getAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    // Noise-like whoosh using detuned oscillators
    for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200 + i * 150, t);
        osc.frequency.exponentialRampToValueAtTime(800 + i * 200, t + 0.15);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.04, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.2);
    }
}

// Rising chime — streak milestone
function sfxStreak() {
    const ctx = getAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.08);
        gain.gain.setValueAtTime(0, t + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.1, t + i * 0.08 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t + i * 0.08);
        osc.stop(t + i * 0.08 + 0.3);
    });
}

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

    // Tutorial / hints
    hintTimer: 0,
    hintsShown: {},  // track which hints the player has seen
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
        layout: layout,
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
        if (data.layout) {
            layout = data.layout;
            rebuildStations();
        }
    } catch (e) {
        console.error('Failed to load save:', e);
    }
}

// ============================================================
// MAIL GENERATION
// ============================================================
let mailIdCounter = 0;

// Day milestones — what unlocks when
const MILESTONES = [
    { day: 4, text: 'Parcels arriving!', desc: 'Heavier — take 2 bag slots' },
    { day: 5, text: 'New bin: Green!', desc: '3 sorting destinations now' },
    { day: 8, text: 'Impatient customers!', desc: 'They won\'t wait as long' },
    { day: 12, text: 'Dispatch deadline!', desc: 'Sorted mail expires if not sent' },
    { day: 16, text: 'Fragile parcels!', desc: 'Handle with care — move slower' },
];

function createMail() {
    const binCount = state.sortBinCount;
    const binIdx = Math.floor(Math.random() * binCount);
    const isParcel = state.day >= 4 && Math.random() < (0.2 + state.day * 0.02);
    const isFragile = state.day >= 16 && isParcel && Math.random() < 0.25;
    return {
        id: mailIdCounter++,
        bin: binIdx,
        col: BIN_COLS[binIdx].col,
        label: BIN_COLS[binIdx].name,
        isParcel,
        isFragile,
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
    unlockAudio();
    if (state.screen === 'menu') {
        // Check reset button
        if (state.daysCompleted > 0 && state._resetBtnY && y > state._resetBtnY && y < state._resetBtnY + 35 && x > 130 && x < 260) {
            localStorage.removeItem('postHaste');
            state.day = 1;
            state.totalCoins = 0;
            state.coins = 0;
            state.totalStars = 0;
            state.daysCompleted = 0;
            state.upgrades = { capacity: 0, speed: 0, sortSpeed: 0 };
            state.maxStack = 3;
            state.moveSpeed = PLAYER_SPEED_BASE;
            layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
            rebuildStations();
            return;
        }
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
    if (state.screen === 'layout') {
        handleLayoutDown(x, y);
        return;
    }
    if (state.screen === 'sorting') {
        // Start swipe
        state.sortSwipe = { startX: x, startY: y };
        return;
    }
    if (state.screen === 'playing') {
        // Debug skip button (top-right)
        if (x > CANVAS_W - 50 && x < CANVAS_W && y > 74 && y < 98) {
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
    if (state.screen === 'layout' && state.layoutDrag) {
        state.layoutDrag.curX = x;
        state.layoutDrag.curY = y;
        return;
    }
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
    if (state.screen === 'layout' && state.layoutDrag) {
        handleLayoutDrop(x, y);
        return;
    }
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
        const earned = Math.floor(state.sortItem.isParcel ? 6 * multiplier : 3 * multiplier);
        state.dayCoins += earned;
        state.sortedCount++;
        state.outgoingPile.push(state.sortItem);
        floatingTexts.push(createFloatingText('+' + earned, CANVAS_W / 2, CANVAS_H / 2 - 95, COL.green, 22));
        // Cancel any lingering shake from a previous miss
        screenShake.amount = 0;
        sfxCorrect();
        // VFX: sparkles fly toward the target bin, not centre
        const targetBin = BIN_COLS[state.sortItem.bin];
        let px, py;
        if (targetBin.dir === 'left') { px = 50; py = CANVAS_H / 2 - 20; }
        else if (targetBin.dir === 'right') { px = CANVAS_W - 50; py = CANVAS_H / 2 - 20; }
        else { px = CANVAS_W / 2; py = 185; }
        spawnParticles(px, py, targetBin.col, 6, 'sparkle');
        addBump(0, -1.5);
        // Extra burst on streak milestones — spawn at top, away from card
        if (state.streak >= 3 && state.streak % 3 === 0) {
            spawnParticles(CANVAS_W / 2, 120, COL.streakGlow, 10, 'confetti');
            addBump(0, -2);
            sfxStreak();
        }
    } else {
        // Wrong sort — soft shake, not aggressive
        state.streak = 0;
        state.missortCount++;
        floatingTexts.push(createFloatingText('MISS!', CANVAS_W / 2, CANVAS_H / 2 - 95, COL.red, 22));
        addShake(1.5);
        addBump(0, 0.5);
        sfxWrong();
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
        baseCost: 50,
        costMult: 2.2,
        apply: () => { state.maxStack = 3 + state.upgrades.capacity + 1; },
    },
    {
        key: 'speed',
        label: 'Move Speed',
        desc: 'Walk a bit faster',
        baseCost: 40,
        costMult: 2.0,
        apply: () => { state.moveSpeed = PLAYER_SPEED_BASE + (state.upgrades.speed + 1) * 0.2; },
    },
];

function getUpgradeCost(def) {
    return Math.floor(def.baseCost * Math.pow(def.costMult, state.upgrades[def.key]));
}

function handleUpgradeTap(x, y) {
    // Check "Next Day" button
    if (x > 80 && x < CANVAS_W - 80 && y > 490 && y < 545) {
        startDay();
        return;
    }
    // Check "Rearrange" button
    if (x > 80 && x < CANVAS_W - 80 && y > 555 && y < 595) {
        state.screen = 'layout';
        state.layoutDrag = null;
        return;
    }

    // Check upgrade buy buttons
    UPGRADE_DEFS.forEach((def, i) => {
        const cardY = 210 + i * 130;
        const btnX = CANVAS_W - 145;
        const btnY = cardY + 72;
        if (x > btnX && x < btnX + 100 && y > btnY && y < btnY + 32) {
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
// LAYOUT EDITOR
// ============================================================
function gridToPixel(col, row) {
    return {
        x: OFFICE.x + col * GRID_CELL_W + GRID_CELL_W / 2,
        y: OFFICE.y + row * GRID_CELL_H + GRID_CELL_H / 2,
    };
}

function pixelToGrid(px, py) {
    const col = Math.floor((px - OFFICE.x) / GRID_CELL_W);
    const row = Math.floor((py - OFFICE.y) / GRID_CELL_H);
    return [
        Math.max(0, Math.min(GRID_COLS - 1, col)),
        Math.max(0, Math.min(GRID_ROWS - 1, row)),
    ];
}

function isCellBlocked(col, row) {
    // Check pillars
    for (const b of BLOCKED_CELLS) {
        if (b[0] === col && b[1] === row) return true;
    }
    // Check fixed features
    for (const f of FIXED_FEATURES) {
        if (f.col === col && f.row === row) return true;
    }
    return false;
}

function isCellOccupied(col, row, excludeKey) {
    for (const key in layout) {
        if (key === excludeKey) continue;
        if (layout[key][0] === col && layout[key][1] === row) return true;
    }
    return false;
}

function handleLayoutDown(x, y) {
    // Check "Done" button
    if (x > 120 && x < CANVAS_W - 120 && y > CANVAS_H - 70 && y < CANVAS_H - 30) {
        state.screen = 'upgrade';
        rebuildStations();
        save();
        return;
    }

    // Check if tapping a station to start dragging
    const [gc, gr] = pixelToGrid(x, y);
    for (const key in layout) {
        if (layout[key][0] === gc && layout[key][1] === gr) {
            state.layoutDrag = {
                key,
                origCol: gc,
                origRow: gr,
                curX: x,
                curY: y,
            };
            return;
        }
    }
}

function canPlaceStation(key, col, row) {
    if (isCellBlocked(col, row)) return false;
    if (isCellOccupied(col, row, key)) return false;
    const def = STATION_DEFS[key];
    if (def.check && !def.check(col, row)) return false;
    return true;
}

function handleLayoutDrop(x, y) {
    if (!state.layoutDrag) return;
    const drag = state.layoutDrag;
    const [gc, gr] = pixelToGrid(x, y);

    if (canPlaceStation(drag.key, gc, gr)) {
        layout[drag.key] = [gc, gr];
    }

    state.layoutDrag = null;
    rebuildStations();
}

function drawLayoutEditor() {
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cx = CANVAS_W / 2;

    // Header
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Rearrange Office', cx, 40);

    ctx.fillStyle = COL.textLight;
    ctx.font = '12px sans-serif';
    ctx.fillText('Drag stations to rearrange your layout', cx, 65);

    // Draw grid
    for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
            const gx = OFFICE.x + c * GRID_CELL_W;
            const gy = OFFICE.y + r * GRID_CELL_H;

            // Cell background
            const blocked = isCellBlocked(c, r);
            if (blocked) {
                ctx.fillStyle = '#C8C3B8';
                drawRoundRect(gx + 2, gy + 2, GRID_CELL_W - 4, GRID_CELL_H - 4, 6);
                ctx.fill();
                // Pillar icon
                ctx.fillStyle = '#999';
                ctx.font = '18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\u{1F9F1}', gx + GRID_CELL_W / 2, gy + GRID_CELL_H / 2);
            } else {
                ctx.fillStyle = COL.floor;
                drawRoundRect(gx + 2, gy + 2, GRID_CELL_W - 4, GRID_CELL_H - 4, 6);
                ctx.fill();
                ctx.strokeStyle = '#D4D0C8';
                ctx.lineWidth = 1;
                drawRoundRect(gx + 2, gy + 2, GRID_CELL_W - 4, GRID_CELL_H - 4, 6);
                ctx.stroke();
            }
        }
    }

    // Draw fixed features
    for (const feat of FIXED_FEATURES) {
        const gx = OFFICE.x + feat.col * GRID_CELL_W;
        const gy = OFFICE.y + feat.row * GRID_CELL_H;
        ctx.fillStyle = '#AAA';
        drawRoundRect(gx + 2, gy + 2, GRID_CELL_W - 4, GRID_CELL_H - 4, 6);
        ctx.fill();
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(feat.icon, gx + GRID_CELL_W / 2, gy + GRID_CELL_H / 2 - 8);
        ctx.fillStyle = COL.text;
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(feat.label, gx + GRID_CELL_W / 2, gy + GRID_CELL_H / 2 + 14);
    }

    // Draw placed stations (except the one being dragged)
    for (const key in layout) {
        if (state.layoutDrag && state.layoutDrag.key === key) continue;
        const [gc, gr] = layout[key];
        const def = STATION_DEFS[key];
        const gx = OFFICE.x + gc * GRID_CELL_W;
        const gy = OFFICE.y + gr * GRID_CELL_H;

        ctx.fillStyle = def.col;
        drawRoundRect(gx + 4, gy + 4, GRID_CELL_W - 8, GRID_CELL_H - 8, 8);
        ctx.fill();

        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon, gx + GRID_CELL_W / 2, gy + GRID_CELL_H / 2 - 8);

        ctx.fillStyle = COL.white;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(def.label, gx + GRID_CELL_W / 2, gy + GRID_CELL_H / 2 + 14);
    }

    // Draw dragged station following finger
    if (state.layoutDrag) {
        const drag = state.layoutDrag;
        const def = STATION_DEFS[drag.key];
        const dx = drag.curX - GRID_CELL_W / 2;
        const dy = drag.curY - GRID_CELL_H / 2;

        // Show valid zone for this station
        for (let c = 0; c < GRID_COLS; c++) {
            for (let r = 0; r < GRID_ROWS; r++) {
                if (canPlaceStation(drag.key, c, r)) {
                    const zx = OFFICE.x + c * GRID_CELL_W;
                    const zy = OFFICE.y + r * GRID_CELL_H;
                    ctx.fillStyle = 'rgba(74,140,92,0.12)';
                    drawRoundRect(zx + 2, zy + 2, GRID_CELL_W - 4, GRID_CELL_H - 4, 6);
                    ctx.fill();
                }
            }
        }

        // Highlight target cell
        const [tc, tr] = pixelToGrid(drag.curX, drag.curY);
        const canPlace = canPlaceStation(drag.key, tc, tr);
        const tx = OFFICE.x + tc * GRID_CELL_W;
        const ty = OFFICE.y + tr * GRID_CELL_H;
        ctx.fillStyle = canPlace ? 'rgba(74,140,92,0.4)' : 'rgba(212,72,59,0.4)';
        drawRoundRect(tx + 2, ty + 2, GRID_CELL_W - 4, GRID_CELL_H - 4, 6);
        ctx.fill();

        // Floating station
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = def.col;
        drawRoundRect(dx + 4, dy + 4, GRID_CELL_W - 8, GRID_CELL_H - 8, 8);
        ctx.fill();
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon, drag.curX, drag.curY - 8);
        ctx.fillStyle = COL.white;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(def.label, drag.curX, drag.curY + 14);
        ctx.globalAlpha = 1;
    }

    // Hint — show constraint when dragging, legend when not
    ctx.fillStyle = COL.textLight;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    if (state.layoutDrag) {
        const def = STATION_DEFS[state.layoutDrag.key];
        ctx.fillStyle = COL.postal;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(def.label + ': ' + def.constraint, cx, CANVAS_H - 95);
        ctx.fillStyle = COL.textLight;
        ctx.font = '11px sans-serif';
        ctx.fillText('Green cells = valid placement', cx, CANVAS_H - 78);
    } else {
        ctx.fillText('\u{1F9F1} pillar   \u{1F6AA} customers enter   \u{1F69B} mail arrives/departs', cx, CANVAS_H - 88);
    }

    // Done button
    ctx.fillStyle = COL.postal;
    drawRoundRect(120, CANVAS_H - 70, CANVAS_W - 240, 40, 10);
    ctx.fill();
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Done', cx, CANVAS_H - 50);

    ctx.restore();
}

// ============================================================
// FLOATING TEXT
// ============================================================
let floatingTexts = [];

function createFloatingText(text, x, y, col, size) {
    return { text, x, y, col, life: 1.0, size: size || 16 };
}

function updateFloatingTexts(dt) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].life -= dt * 1.2;
        floatingTexts[i].y -= 40 * dt;
        if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }
}

// ============================================================
// PARTICLES — soft, cozy visual feedback
// ============================================================
let particles = [];

function spawnParticles(x, y, col, count, style) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.8;
        const speed = 60 + Math.random() * 90;
        const sizeMap = { sparkle: 5 + Math.random() * 6, confetti: 6 + Math.random() * 6, rise: 4 + Math.random() * 5, burst: 5 + Math.random() * 7 };
        const speedMap = { burst: 1.8, rise: 0.8, sparkle: 1.2, confetti: 1.6 };
        const st = style || 'burst';
        particles.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 20,
            vx: Math.cos(angle) * speed * (speedMap[st] || 1),
            vy: Math.sin(angle) * speed * (speedMap[st] || 1) - (st === 'rise' ? 60 : 0),
            life: 0.35 + Math.random() * 0.25,
            maxLife: 0.35 + Math.random() * 0.25,
            size: sizeMap[st] || 5,
            col,
            style: st,
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98; // gentle drag
        p.vy += 20 * dt; // gentle gravity
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.save();
        const t = p.life / p.maxLife;
        ctx.globalAlpha = t * 0.9;

        if (p.style === 'sparkle') {
            // Rotating diamond sparkle
            const s = p.size * (0.4 + t * 0.6);
            ctx.fillStyle = p.col;
            ctx.translate(p.x, p.y);
            ctx.rotate(Date.now() * 0.005 + p.maxLife * 10);
            ctx.fillRect(-s / 2, -s / 2, s, s);
        } else if (p.style === 'confetti') {
            // Tumbling confetti rectangle
            ctx.fillStyle = p.col;
            const s = p.size * (0.5 + t * 0.5);
            ctx.translate(p.x, p.y);
            ctx.rotate(Date.now() * 0.004 + p.maxLife * 7);
            ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6);
        } else {
            // Soft glowing circle
            ctx.fillStyle = p.col;
            const s = p.size * (0.3 + t * 0.7);
            ctx.beginPath();
            ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
            ctx.fill();
            // Glow halo
            ctx.globalAlpha = t * 0.3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, s * 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// ============================================================
// SCREEN EFFECTS — shake + subtle sway/bump on events
// ============================================================
let screenShake = { amount: 0, decay: 0.7 };

// Smooth bump — a soft push that eases back (not jarring like shake)
let screenBump = { x: 0, y: 0 };

function addShake(amount) {
    screenShake.amount = Math.min(screenShake.amount + amount, 8);
}

function addBump(dx, dy) {
    screenBump.x += dx;
    screenBump.y += dy;
}

function getScreenOffset() {
    // Combine shake + bump + ambient sway
    let ox = 0, oy = 0;

    // Shake (random jitter, for mistakes)
    if (screenShake.amount > 0.3) {
        ox += (Math.random() - 0.5) * screenShake.amount * 2;
        oy += (Math.random() - 0.5) * screenShake.amount * 2;
    }

    // Bump (smooth push, eases back)
    ox += screenBump.x;
    oy += screenBump.y;

    // Ambient breathing sway (very subtle, always present)
    const t = Date.now() * 0.001;
    ox += Math.sin(t * 0.7) * 0.4;
    oy += Math.sin(t * 0.5) * 0.3;

    return { x: ox, y: oy };
}

function updateScreenEffects() {
    screenShake.amount *= screenShake.decay;
    screenBump.x *= 0.85;
    screenBump.y *= 0.85;
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
    state.outgoingTimer = 0;
    state.stack = [];
    state.sortItem = null;
    state.customers = [];
    state.player.x = 195;
    state.player.y = 350;
    state.joy.active = false;
    state.lastMailSpawn = Date.now();
    state.lastCustomerSpawn = Date.now();
    floatingTexts = [];
    particles = [];
    state.milestone = null;

    // === PROGRESSION: scale by day ===
    // Bins: 2 at start, 3 from day 5
    state.sortBinCount = state.day >= 5 ? 3 : 2;

    // Customer patience gets shorter from day 8
    state.currentPatience = state.day >= 8
        ? Math.max(6000, CUSTOMER_PATIENCE - (state.day - 8) * 500)
        : CUSTOMER_PATIENCE;

    // Outgoing dispatch deadline from day 12
    state.outgoingDeadline = state.day >= 12 ? 20 : 0; // seconds, 0 = no deadline

    // Check for milestone notification
    const milestone = MILESTONES.find(m => m.day === state.day);
    if (milestone) {
        state.milestone = milestone;
        state.milestoneTimer = 3.0; // show for 3 seconds
    }

    // Seed initial mail — start busy, scale with day
    const seedCount = Math.min(3 + Math.floor(state.day / 3), 8);
    for (let i = 0; i < seedCount; i++) {
        state.incomingPile.push(createMail());
    }
}

function endDay() {
    state.screen = 'dayEnd';

    // Calculate stars (tuned for 60s days)
    let stars = 0;
    if (state.sortedCount >= 3) stars = 1;
    if (state.sortedCount >= 6 && state.missortCount <= 2) stars = 2;
    if (state.sortedCount >= 12 && state.missortCount === 0) stars = 3;

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
    // VFX always update regardless of screen
    updateFloatingTexts(dt);
    updateParticles(dt);
    updateScreenEffects();

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
    const mailInterval = Math.max(800, MAIL_SPAWN_INTERVAL_BASE - state.day * 150);
    if (now - state.lastMailSpawn > mailInterval && state.incomingPile.length < 10) {
        state.incomingPile.push(createMail());
        state.lastMailSpawn = now;
    }

    // Spawn customers
    const custInterval = Math.max(2500, CUSTOMER_SPAWN_INTERVAL_BASE - state.day * 300);
    if (now - state.lastCustomerSpawn > custInterval && state.customers.length < 3) {
        state.customers.push({
            id: Date.now(),
            patience: state.currentPatience || CUSTOMER_PATIENCE,
            coins: 3 + Math.floor(Math.random() * 7),
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

    // Outgoing deadline (day 12+): sorted mail expires
    if (state.outgoingDeadline > 0 && state.outgoingPile.length > 0) {
        state.outgoingTimer += dt;
        if (state.outgoingTimer >= state.outgoingDeadline) {
            // Mail expired — van left without it
            const lost = state.outgoingPile.length;
            state.outgoingPile = [];
            state.outgoingTimer = 0;
            const oc = stationCenter(STATIONS.outgoing);
            floatingTexts.push(createFloatingText('Van left! -' + lost, oc.x, oc.y - 30, COL.red, 18));
            addShake(1);
        }
    }

    // Milestone notification countdown
    if (state.milestoneTimer > 0) {
        state.milestoneTimer -= dt;
    }

    // Fragile penalty: move slower when carrying fragile items
    let fragileSlowdown = 1.0;
    if (state.day >= 16) {
        const hasFragile = state.stack.some(item => item.isFragile);
        if (hasFragile) fragileSlowdown = 0.6;
    }

    // Move player
    const px = state.player.x + state.joy.dx * state.moveSpeed * fragileSlowdown;
    const py = state.player.y + state.joy.dy * state.moveSpeed * fragileSlowdown;

    // Clamp to office bounds
    const margin = PLAYER_RADIUS + 5;
    state.player.x = Math.max(OFFICE.x + margin, Math.min(OFFICE.x + OFFICE.w - margin, px));
    state.player.y = Math.max(OFFICE.y + margin, Math.min(OFFICE.y + OFFICE.h - margin, py));

    // Proximity checks (only when not moving fast — prevents drive-by)
    const isMoving = Math.abs(state.joy.dx) > 0.3 || Math.abs(state.joy.dy) > 0.3;

    // INCOMING: Pick up mail (parcels take 2 slots)
    if (nearStation('incoming') && state.incomingPile.length > 0) {
        const hadItems = state.stack.length;
        while (state.incomingPile.length > 0 && stackWeight() + state.incomingPile[0].weight <= state.maxStack) {
            state.stack.push(state.incomingPile.shift());
        }
        if (state.stack.length > hadItems) {
            const sc = stationCenter(STATIONS.incoming);
            spawnParticles(sc.x, sc.y, COL.brown, 8, 'rise');
            addBump(0, -1.5);
            sfxPickup();
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
        floatingTexts.push(createFloatingText('+' + cust.coins + ' tip', STATIONS.counter.x + STATIONS.counter.w / 2, STATIONS.counter.y - 30, COL.green, 18));
        const cc = stationCenter(STATIONS.counter);
        spawnParticles(cc.x, cc.y, COL.yellow, 8, 'sparkle');
        addBump(0, -2);
        sfxCoin();
        setMoodOverride('tipjoy', 0.8);
    }

    // OUTGOING: Deposit sorted mail
    if (nearStation('outgoing') && state.outgoingPile.length > 0) {
        const delivered = state.outgoingPile.length;
        state.mailDelivered += delivered;
        const bonus = Math.floor(delivered * 1.5);
        state.dayCoins += bonus;
        floatingTexts.push(createFloatingText('+' + bonus + ' sent', STATIONS.outgoing.x + STATIONS.outgoing.w / 2, STATIONS.outgoing.y - 30, COL.red, 18));
        const oc = stationCenter(STATIONS.outgoing);
        spawnParticles(oc.x, oc.y, COL.postal, 10, 'burst');
        addBump(0, -3);
        sfxDispatch();
        state.outgoingPile = [];
        state.outgoingTimer = 0;
    }

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
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    ctx.save();

    // Shadow
    ctx.fillStyle = COL.shadow;
    drawRoundRect(s.x + 3, s.y + 3, s.w, s.h, 8);
    ctx.fill();

    // Body
    ctx.fillStyle = s.col;
    drawRoundRect(s.x, s.y, s.w, s.h, 8);
    ctx.fill();

    // Icon
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.icon, cx, cy - 8);

    // Label
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(s.label, cx, cy + 14);

    // === Detailed item/customer display below station ===
    if (key === 'incoming' && state.incomingPile.length > 0) {
        drawIncomingDetails(s);
    }
    if (key === 'counter' && state.customers.length > 0) {
        drawCustomerDetails(s);
    }
    if (key === 'outgoing' && state.outgoingPile.length > 0) {
        drawOutgoingDetails(s);
    }

    ctx.restore();
}

function drawDetailPill(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    drawRoundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
}

function drawIncomingDetails(s) {
    const letters = state.incomingPile.filter(m => !m.isParcel).length;
    const parcels = state.incomingPile.filter(m => m.isParcel && !m.isFragile).length;
    const fragile = state.incomingPile.filter(m => m.isFragile).length;
    const cx = s.x + s.w / 2;
    const y = s.y + s.h + 14;

    // Build label parts
    const parts = [];
    if (letters > 0) parts.push('\u{2709}\uFE0F ' + letters);
    if (parcels > 0) parts.push('\u{1F4E6} ' + parcels);
    if (fragile > 0) parts.push('\u{26A0}\uFE0F ' + fragile);
    const label = parts.join('  ');

    // Dark pill background
    const pillW = Math.max(parts.length * 36, 50);
    drawDetailPill(cx, y, pillW, 22);

    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.white;
    ctx.fillText(label, cx, y);
}

function drawCustomerDetails(s) {
    const cx = s.x + s.w / 2;
    const y = s.y + s.h + 14;

    // Dark pill background
    const pillW = Math.max(state.customers.length * 24 + 8, 36);
    drawDetailPill(cx, y, pillW, 26);

    // Show each customer as a face emoji that changes with patience
    const startX = cx - (state.customers.length - 1) * 12;
    state.customers.forEach((cust, i) => {
        const patiencePct = cust.patience / (state.currentPatience || CUSTOMER_PATIENCE);
        let face;
        if (patiencePct > 0.6) face = '\u{1F642}';
        else if (patiencePct > 0.3) face = '\u{1F610}';
        else if (patiencePct > 0.15) face = '\u{1F620}';
        else face = '\u{1F621}';

        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(face, startX + i * 24, y);
    });
}

function drawOutgoingDetails(s) {
    const letters = state.outgoingPile.filter(m => !m.isParcel).length;
    const parcels = state.outgoingPile.filter(m => m.isParcel).length;
    const cx = s.x + s.w / 2;
    const y = s.y - 16;

    const parts = [];
    if (letters > 0) parts.push('\u{2709}\uFE0F ' + letters);
    if (parcels > 0) parts.push('\u{1F4E6} ' + parcels);
    const label = parts.join('  ');

    const pillW = Math.max(parts.length * 36, 50);
    drawDetailPill(cx, y, pillW, 22);

    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.white;
    ctx.fillText(label, cx, y);
}

// Mood timer for temporary expressions (tip joy, etc)
let moodOverride = null;
let moodOverrideTimer = 0;

function setMoodOverride(mood, duration) {
    moodOverride = mood;
    moodOverrideTimer = duration;
}

function getPlayerMood() {
    // Temporary override (tip joy, etc)
    if (moodOverride && moodOverrideTimer > 0) return moodOverride;

    // Streak excitement
    if (state.streak >= 5) return 'thrilled';   // huge grin, starry eyes
    if (state.streak >= 3) return 'excited';     // open mouth smile

    // Missort sadness
    if (screenShake.amount > 0.3) return 'oops';

    // Carrying strain based on how full the bag is
    const weight = stackWeight();
    const capacity = state.maxStack;
    if (weight >= capacity) return 'strained';       // bag is full, struggling
    if (weight >= capacity * 0.6) return 'effort';   // getting heavy
    if (weight > 0) return 'carrying';               // mild focus

    // Nothing in hands
    if (state.screen === 'playing') return 'idle';   // big relaxed smile
    return 'idle';
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

    // Face — expression changes with game state
    const mood = getPlayerMood();

    // Update mood override timer
    if (moodOverrideTimer > 0) moodOverrideTimer -= 0.016;

    // === EYES ===
    ctx.fillStyle = COL.white;
    ctx.beginPath();
    switch (mood) {
        case 'idle':
            // Big happy round eyes
            ctx.arc(px - 5, py - 4, 3.5, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 3.5, 0, Math.PI * 2);
            ctx.fill();
            // Sparkle dot
            ctx.fillStyle = '#AAD4FF';
            ctx.beginPath();
            ctx.arc(px - 3.5, py - 5.5, 1, 0, Math.PI * 2);
            ctx.arc(px + 6.5, py - 5.5, 1, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'carrying':
            // Normal focused eyes
            ctx.arc(px - 5, py - 4, 3, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 3, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'effort':
            // Slightly squished eyes (straining)
            ctx.ellipse(px - 5, py - 3, 3.5, 2.5, 0, 0, Math.PI * 2);
            ctx.ellipse(px + 5, py - 3, 3.5, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Sweat drop
            ctx.fillStyle = '#88CCFF';
            ctx.beginPath();
            ctx.arc(px + 10, py - 6, 2, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'strained':
            // Squeezed shut eyes (> < shape)
            ctx.strokeStyle = COL.white;
            ctx.lineWidth = 2;
            ctx.moveTo(px - 7, py - 6); ctx.lineTo(px - 3, py - 3); ctx.moveTo(px - 7, py - 1); ctx.lineTo(px - 3, py - 3);
            ctx.moveTo(px + 3, py - 6); ctx.lineTo(px + 7, py - 3); ctx.moveTo(px + 3, py - 1); ctx.lineTo(px + 7, py - 3);
            ctx.stroke();
            // Two sweat drops
            ctx.fillStyle = '#88CCFF';
            ctx.beginPath();
            ctx.arc(px + 11, py - 6, 2, 0, Math.PI * 2);
            ctx.arc(px - 11, py - 4, 1.5, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'tipjoy':
            // Big starry eyes
            ctx.arc(px - 5, py - 4, 4, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 4, 0, Math.PI * 2);
            ctx.fill();
            // Star pupils
            ctx.fillStyle = COL.yellow;
            ctx.font = '6px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u{2605}', px - 5, py - 4);
            ctx.fillText('\u{2605}', px + 5, py - 4);
            break;
        case 'excited':
            // Happy arc eyes (closed smile)
            ctx.strokeStyle = COL.white;
            ctx.lineWidth = 2;
            ctx.arc(px - 5, py - 3, 3, 1.1 * Math.PI, 1.9 * Math.PI);
            ctx.moveTo(px + 8, py - 3);
            ctx.arc(px + 5, py - 3, 3, 1.1 * Math.PI, 1.9 * Math.PI);
            ctx.stroke();
            break;
        case 'thrilled':
            // Huge starry eyes
            ctx.arc(px - 5, py - 4, 4, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = COL.postal;
            ctx.beginPath();
            ctx.arc(px - 5, py - 4, 1.5, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 1.5, 0, Math.PI * 2);
            ctx.fill();
            // Sparkles around head
            ctx.fillStyle = COL.streakGlow;
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            const sparkleOff = Math.sin(Date.now() * 0.006) * 2;
            ctx.fillText('\u{2728}', px - 14, py - 8 + sparkleOff);
            ctx.fillText('\u{2728}', px + 14, py - 6 - sparkleOff);
            break;
        case 'oops':
            // Wide worried eyes
            ctx.arc(px - 5, py - 4, 3.5, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 3.5, 0, Math.PI * 2);
            ctx.fill();
            // Tiny pupils (shocked)
            ctx.fillStyle = COL.postal;
            ctx.beginPath();
            ctx.arc(px - 5, py - 4, 1, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 1, 0, Math.PI * 2);
            ctx.fill();
            break;
        default:
            ctx.arc(px - 5, py - 4, 3, 0, Math.PI * 2);
            ctx.arc(px + 5, py - 4, 3, 0, Math.PI * 2);
            ctx.fill();
    }

    // === MOUTH ===
    ctx.strokeStyle = COL.white;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    switch (mood) {
        case 'idle':
            // Big relaxed smile
            ctx.arc(px, py + 1, 6, 0.1 * Math.PI, 0.9 * Math.PI);
            ctx.stroke();
            break;
        case 'carrying':
            // Small pleasant smile
            ctx.arc(px, py + 2, 4, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
            break;
        case 'effort':
            // Gritting / wavy mouth
            ctx.moveTo(px - 5, py + 3);
            ctx.quadraticCurveTo(px - 2, py + 5, px, py + 3);
            ctx.quadraticCurveTo(px + 2, py + 1, px + 5, py + 3);
            ctx.stroke();
            break;
        case 'strained':
            // Open grimace
            ctx.arc(px, py + 4, 4, 0, Math.PI);
            ctx.stroke();
            ctx.fillStyle = '#1a3050';
            ctx.beginPath();
            ctx.arc(px, py + 4, 4, 0, Math.PI);
            ctx.closePath();
            ctx.fill();
            break;
        case 'tipjoy':
            // Big open happy "O!"
            ctx.fillStyle = '#1a3050';
            ctx.beginPath();
            ctx.arc(px, py + 3, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = COL.white;
            ctx.beginPath();
            ctx.arc(px, py + 3, 4, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case 'excited':
            // Open grin
            ctx.arc(px, py + 1, 5, 0.05 * Math.PI, 0.95 * Math.PI);
            ctx.stroke();
            ctx.fillStyle = '#1a3050';
            ctx.beginPath();
            ctx.arc(px, py + 1, 5, 0.05 * Math.PI, 0.95 * Math.PI);
            ctx.closePath();
            ctx.fill();
            break;
        case 'thrilled':
            // Huge open grin
            ctx.arc(px, py + 1, 7, 0.05 * Math.PI, 0.95 * Math.PI);
            ctx.stroke();
            ctx.fillStyle = '#1a3050';
            ctx.beginPath();
            ctx.arc(px, py + 1, 7, 0.05 * Math.PI, 0.95 * Math.PI);
            ctx.closePath();
            ctx.fill();
            break;
        case 'oops':
            // Small "o" surprise mouth
            ctx.fillStyle = '#1a3050';
            ctx.beginPath();
            ctx.ellipse(px, py + 4, 3, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = COL.white;
            ctx.beginPath();
            ctx.ellipse(px, py + 4, 3, 4, 0, 0, Math.PI * 2);
            ctx.stroke();
            break;
        default:
            ctx.moveTo(px - 4, py + 3);
            ctx.lineTo(px + 4, py + 3);
            ctx.stroke();
    }

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
        // Fragile marker
        if (item.isFragile) {
            ctx.fillStyle = COL.red;
            ctx.font = '6px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', ix + iw / 2, iy - ih + 4);
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
    ctx.fillRect(0, 0, CANVAS_W, 90);

    // Row 1: Day | Timer | Coins
    ctx.fillStyle = COL.white;
    ctx.textBaseline = 'middle';

    // Day
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('DAY ' + state.day, 15, 22);

    // Timer (centre, large)
    const mins = Math.floor(state.timeLeft / 60);
    const secs = state.timeLeft % 60;
    const timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px sans-serif';
    if (state.timeLeft <= 30) ctx.fillStyle = '#FF6B6B';
    ctx.fillText(timeStr, CANVAS_W / 2, 22);

    // Coins with icon
    ctx.fillStyle = COL.yellow;
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('\u{1F4B0} ' + state.dayCoins, CANVAS_W - 15, 22);

    // Row 2: Visual mail bag indicator | streak | sorted
    // Mail bag (visual stack count)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    drawRoundRect(12, 42, 100, 18, 4);
    ctx.fill();
    // Fill based on capacity
    const currentWeight = stackWeight();
    const fillPct = currentWeight / state.maxStack;
    if (fillPct > 0) {
        ctx.fillStyle = fillPct >= 1 ? '#FF6B6B' : 'rgba(255,255,255,0.6)';
        drawRoundRect(12, 42, Math.max(100 * Math.min(fillPct, 1), 8), 18, 4);
        ctx.fill();
    }
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u{1F4E6} ' + currentWeight + ' / ' + state.maxStack, 62, 52);

    // Streak (centre)
    if (state.streak > 1) {
        ctx.fillStyle = COL.streakGlow;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F525} x' + state.streak, CANVAS_W / 2, 52);
    }

    // Sorted count
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('\u{2705} ' + state.sortedCount + ' sorted', CANVAS_W - 15, 52);

    // Row 3: Contextual hint
    const hint = getContextHint();
    if (hint) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(hint, CANVAS_W / 2, 74);
    }

    // Debug: Skip day button (top-right)
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    drawRoundRect(CANVAS_W - 45, 78, 35, 16, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SKIP', CANVAS_W - 28, 87);

    ctx.restore();
}

function getContextHint() {
    // Priority-based hints — show the most relevant one
    if (state.stack.length === 0 && state.incomingPile.length > 0) {
        return '\u{1F449} Walk to MAIL IN to collect mail';
    }
    if (stackWeight() >= state.maxStack) {
        return '\u{1F4E6} Bag full! Walk to SORT desk';
    }
    if (state.stack.length > 0 && state.outgoingPile.length === 0) {
        return '\u{1F4CB} Walk to SORT desk to sort your mail';
    }
    if (state.outgoingPile.length > 0) {
        return '\u{1F69A} Walk to SEND OUT to dispatch sorted mail';
    }
    if (state.customers.length > 0 && state.stack.length === 0) {
        return '\u{1F6CE} Customer waiting! Walk to SERVE counter';
    }
    return null;
}

function drawMilestone() {
    if (!state.milestone || state.milestoneTimer <= 0) return;
    ctx.save();
    const alpha = Math.min(state.milestoneTimer, 1);
    ctx.globalAlpha = alpha;

    const cx = CANVAS_W / 2;
    const y = CANVAS_H / 2 - 180;

    // Banner background
    ctx.fillStyle = COL.postal;
    drawRoundRect(40, y - 25, CANVAS_W - 80, 55, 12);
    ctx.fill();

    // Title
    ctx.fillStyle = COL.yellow;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u{2B50} ' + state.milestone.text, cx, y - 6);

    // Description
    ctx.fillStyle = COL.white;
    ctx.font = '12px sans-serif';
    ctx.fillText(state.milestone.desc, cx, y + 16);

    ctx.restore();
}

function drawOutgoingTimer() {
    if (!state.outgoingDeadline || state.outgoingPile.length === 0) return;
    ctx.save();

    const s = STATIONS.outgoing;
    const remaining = state.outgoingDeadline - state.outgoingTimer;
    const pct = remaining / state.outgoingDeadline;

    // Timer bar below outgoing station
    const barX = s.x;
    const barY = s.y + s.h + 6;
    const barW = s.w;
    const barH = 5;

    ctx.fillStyle = '#555';
    drawRoundRect(barX, barY, barW, barH, 2);
    ctx.fill();

    ctx.fillStyle = pct > 0.3 ? COL.green : COL.red;
    drawRoundRect(barX, barY, Math.max(barW * pct, 2), barH, 2);
    ctx.fill();

    // Urgent text when low
    if (pct < 0.3) {
        ctx.fillStyle = COL.red;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VAN LEAVING!', s.x + s.w / 2, barY + 14);
    }

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
        if (nearStation('incoming') && state.incomingPile.length > 0 && stackWeight() < state.maxStack) {
            drawProximityGlow(STATIONS.incoming, 'COLLECTING');
        }
        if (nearStation('sorting') && state.stack.length > 0) {
            drawProximityGlow(STATIONS.sorting, 'STOP TO SORT');
        }
        if (nearStation('counter') && state.customers.length > 0) {
            drawProximityGlow(STATIONS.counter, 'SERVING');
        }
        if (nearStation('outgoing') && state.outgoingPile.length > 0) {
            drawProximityGlow(STATIONS.outgoing, 'DISPATCHING');
        }
    }

    ctx.restore();
}

function drawProximityGlow(s, actionText) {
    ctx.save();
    const pulse = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;

    // Glow ring
    ctx.globalAlpha = pulse + 0.15;
    ctx.strokeStyle = COL.yellow;
    ctx.lineWidth = 3;
    drawRoundRect(s.x - 5, s.y - 5, s.w + 10, s.h + 10, 10);
    ctx.stroke();

    // Action label above station
    if (actionText) {
        ctx.globalAlpha = 0.85;
        const tx = s.x + s.w / 2;
        const ty = s.y - 16;

        // Pill background
        ctx.fillStyle = COL.yellow;
        const tw = ctx.measureText ? 60 : 50;
        drawRoundRect(tx - 40, ty - 10, 80, 20, 6);
        ctx.fill();

        ctx.fillStyle = COL.text;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actionText, tx, ty);
    }

    ctx.restore();
}

function drawFloatingTexts() {
    for (const ft of floatingTexts) {
        ctx.save();
        ctx.globalAlpha = Math.min(ft.life * 1.5, 1);
        ctx.font = 'bold ' + ft.size + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Background pill for readability
        const metrics = ctx.measureText(ft.text);
        const pw = metrics.width + 16;
        const ph = ft.size + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        drawRoundRect(ft.x - pw / 2, ft.y - ph / 2, pw, ph, ph / 2);
        ctx.fill();

        // Text
        ctx.fillStyle = ft.col;
        ctx.fillText(ft.text, ft.x, ft.y + 1);
        ctx.restore();
    }
}

// ============================================================
// SORT MODE RENDERING
// ============================================================
function drawSortMode() {
    ctx.save();

    // Dim background
    ctx.fillStyle = 'rgba(26,26,46,0.85)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2 - 20;

    // Header area
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SORTING DESK', cx, 60);

    // Progress dots (show how many items left)
    const totalItems = state.stack.length + 1; // +1 for current
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText((totalItems - state.stack.length) + ' of ' + totalItems, cx, 85);

    // Streak
    if (state.streak > 1) {
        const streakPulse = 1 + Math.sin(Date.now() * 0.008) * 0.1;
        ctx.save();
        ctx.translate(cx, 115);
        ctx.scale(streakPulse, streakPulse);
        ctx.fillStyle = COL.streakGlow;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('\u{1F525} x' + state.streak, 0, 0);
        ctx.restore();
    }

    // === BIN TARGETS (large, clear, positioned at edges) ===
    const activeBins = BIN_COLS.slice(0, state.sortBinCount);
    for (const bin of activeBins) {
        ctx.save();
        let bx, by, bw, bh;

        if (bin.dir === 'left') {
            bx = 15; by = cy - 45; bw = 70; bh = 90;
        } else if (bin.dir === 'right') {
            bx = CANVAS_W - 85; by = cy - 45; bw = 70; bh = 90;
        } else if (bin.dir === 'up') {
            bx = cx - 45; by = 150; bw = 90; bh = 65;
        }

        // Bin background
        ctx.fillStyle = bin.col;
        ctx.globalAlpha = 0.2;
        drawRoundRect(bx, by, bw, bh, 12);
        ctx.fill();

        // Bin border
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = bin.col;
        ctx.lineWidth = 3;
        drawRoundRect(bx, by, bw, bh, 12);
        ctx.stroke();

        // Arrow pointing inward (toward bin)
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = bin.col;
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const arrows = { left: '\u{2B05}', right: '\u{27A1}', up: '\u{2B06}' };
        ctx.fillText(arrows[bin.dir], bx + bw / 2, by + (bin.dir === 'up' ? 22 : 30));

        // Bin colour name (large, clear)
        ctx.globalAlpha = 1;
        ctx.fillStyle = bin.col;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(bin.name, bx + bw / 2, by + (bin.dir === 'up' ? 50 : bh - 18));

        ctx.restore();
    }

    // === CURRENT ITEM (large, centred, clear) ===
    if (state.sortItem) {
        const iw = 140;
        const ih = 100;

        // Card shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        drawRoundRect(cx - iw / 2 + 3, cy - ih / 2 + 3, iw, ih, 14);
        ctx.fill();

        // Card background
        ctx.fillStyle = COL.white;
        drawRoundRect(cx - iw / 2, cy - ih / 2, iw, ih, 14);
        ctx.fill();

        // Big colour bar at top
        ctx.fillStyle = state.sortItem.col;
        drawRoundRect(cx - iw / 2, cy - ih / 2, iw, 35, 14);
        ctx.fill();
        ctx.fillRect(cx - iw / 2, cy - ih / 2 + 20, iw, 15);

        // Colour name on bar
        ctx.fillStyle = COL.white;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(state.sortItem.label, cx, cy - ih / 2 + 18);

        // Mail type icon + label
        ctx.fillStyle = COL.text;
        ctx.font = '24px sans-serif';
        ctx.fillText(state.sortItem.isParcel ? '\u{1F4E6}' : '\u{2709}', cx, cy + 8);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = COL.textLight;
        const typeLabel = state.sortItem.isFragile ? 'FRAGILE!' : (state.sortItem.isParcel ? 'PARCEL' : 'LETTER');
        ctx.fillStyle = state.sortItem.isFragile ? COL.red : COL.textLight;
        ctx.fillText(typeLabel, cx, cy + 32);
    }

    // === INSTRUCTION (bottom, clear) ===
    ctx.fillStyle = COL.white;
    ctx.globalAlpha = 0.7;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';

    // Dynamic instruction based on current item
    if (state.sortItem) {
        const matchBin = BIN_COLS[state.sortItem.bin];
        ctx.fillText('Swipe toward the ' + matchBin.name + ' bin', cx, CANVAS_H - 140);
    }

    // Swipe gesture hint (animated)
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.004) * 0.15;
    ctx.font = '12px sans-serif';
    ctx.fillText('\u{261D} swipe to sort', cx, CANVAS_H - 110);

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

    const cx = CANVAS_W / 2;
    let y = 45;

    // Title
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POST HASTE', cx, y);
    y += 28;

    // Subtitle
    ctx.fillStyle = COL.brown;
    ctx.font = '14px sans-serif';
    ctx.fillText('Sort. Serve. Deliver.', cx, y);
    y += 20;

    // Stats (returning player)
    if (state.daysCompleted > 0) {
        ctx.fillStyle = COL.textLight;
        ctx.font = '13px sans-serif';
        ctx.fillText('Day ' + state.day + '  \u{2022}  \u{1F4B0} ' + state.totalCoins + '  \u{2022}  \u{2B50} ' + state.totalStars, cx, y);
        y += 15;
    }

    // === HOW TO PLAY ===
    y += 12;
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('HOW TO PLAY', cx, y);
    y += 8;

    // Divider
    ctx.strokeStyle = COL.wall;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, y); ctx.lineTo(CANVAS_W - 60, y);
    ctx.stroke();
    y += 14;

    const steps = [
        ['\u{1F4E8}', 'Collect', 'Walk to MAIL IN to pick up mail'],
        ['\u{1F4CB}', 'Sort', 'Walk to SORT desk, swipe to matching colour bin'],
        ['\u{1F69A}', 'Deliver', 'Walk to SEND OUT to dispatch sorted mail'],
        ['\u{1F6CE}', 'Serve', 'Walk to SERVE counter to earn tips'],
    ];

    steps.forEach((step) => {
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(step[0], 48, y + 2);

        ctx.fillStyle = COL.text;
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(step[1], 72, y - 4);

        ctx.fillStyle = COL.textLight;
        ctx.font = '11px sans-serif';
        ctx.fillText(step[2], 72, y + 10);

        ctx.fillStyle = COL.postal;
        y += 35;
    });

    // Controls
    ctx.fillStyle = COL.textLight;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Touch & drag bottom of screen to move your character', cx, y);
    y += 14;
    ctx.fillText('Walk near a station to interact automatically', cx, y);
    y += 14;
    ctx.fillText('At the sort desk: stop moving, then swipe mail to bins', cx, y);

    // === TESTER INFO ===
    y += 28;
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('TESTER INFO', cx, y);
    y += 8;

    ctx.strokeStyle = COL.wall;
    ctx.beginPath();
    ctx.moveTo(60, y); ctx.lineTo(CANVAS_W - 60, y);
    ctx.stroke();
    y += 14;

    ctx.fillStyle = COL.textLight;
    ctx.font = '11px sans-serif';

    const testerLines = [
        ['\u{23E9}', 'SKIP button (top-right during play) skips to end of day'],
        ['\u{1F4E6}', 'Day 4: parcels arrive (heavier, 2 bag slots each)'],
        ['\u{1F7E2}', 'Day 5: 3rd sorting bin (green) unlocks'],
        ['\u{23F0}', 'Day 8: customers get impatient faster'],
        ['\u{1F69A}', 'Day 12: dispatch deadline — van leaves without your mail!'],
    ];

    testerLines.forEach((line) => {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(line[0], 42, y + 1);

        ctx.fillStyle = COL.text;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(line[1], 60, y + 1);

        ctx.fillStyle = COL.textLight;
        y += 22;
    });

    // What we want feedback on
    y += 6;
    ctx.fillStyle = COL.brown;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('We want to know:', cx, y);
    y += 16;
    ctx.fillStyle = COL.textLight;
    ctx.font = '11px sans-serif';
    ctx.fillText('Does sorting feel satisfying? Is movement clear?', cx, y);
    y += 15;
    ctx.fillText('Does the pace feel right? What would you upgrade first?', cx, y);

    // Start button
    y += 32;
    ctx.fillStyle = COL.postal;
    drawRoundRect(100, y, 190, 50, 14);
    ctx.fill();
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.daysCompleted > 0 ? '\u{1F4EC} Next Shift' : '\u{1F4EC} Start Shift', cx, y + 26);

    // Reset button (below start)
    if (state.daysCompleted > 0) {
        y += 60;
        ctx.fillStyle = COL.red;
        ctx.globalAlpha = 0.7;
        drawRoundRect(130, y, 130, 35, 8);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = COL.white;
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('Reset Progress', cx, y + 18);
        state._resetBtnY = y; // store for tap detection
    }

    // DuckDuckWeasel
    ctx.font = '11px sans-serif';
    ctx.fillStyle = COL.textLight;
    ctx.fillText('DuckDuckWeasel', cx, CANVAS_H - 20);

    ctx.restore();
}

// ============================================================
// DAY END SCREEN
// ============================================================
function drawDayEnd() {
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cx = CANVAS_W / 2;

    // Title
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Shift Complete!', cx, 130);

    ctx.fillStyle = COL.textLight;
    ctx.font = '14px sans-serif';
    ctx.fillText('Day ' + (state.day - 1) + ' finished', cx, 160);

    // Stars (large)
    const starY = 210;
    for (let i = 0; i < 3; i++) {
        ctx.font = '48px sans-serif';
        ctx.fillStyle = i < state.dayStars ? COL.yellow : COL.wall;
        ctx.fillText('\u{2B50}', cx - 60 + i * 60, starY);
    }

    // Star requirements hint — show next goal
    ctx.fillStyle = COL.textLight;
    ctx.font = '11px sans-serif';
    if (state.dayStars === 0) {
        ctx.fillText('Sort at least 3 items to earn a star', cx, starY + 35);
    } else if (state.dayStars === 1) {
        ctx.fillText('Next: sort 6+ with 2 or fewer mistakes', cx, starY + 35);
    } else if (state.dayStars === 2) {
        ctx.fillText('Next: sort 12+ with zero mistakes', cx, starY + 35);
    } else {
        ctx.fillText('Perfect shift!', cx, starY + 35);
    }

    // Stats cards
    const cardW = 150;
    const cardH = 70;
    const cardGap = 15;
    const startY = 280;

    const statCards = [
        { icon: '\u{1F4CB}', label: 'Sorted', value: state.sortedCount, col: COL.postal },
        { icon: '\u{274C}', label: 'Missorts', value: state.missortCount, col: state.missortCount > 0 ? COL.red : COL.green },
        { icon: '\u{1F6CE}', label: 'Served', value: state.customersServed, col: COL.green },
        { icon: '\u{1F525}', label: 'Best Streak', value: state.bestStreak, col: COL.yellow },
    ];

    statCards.forEach((card, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = cx - cardW - cardGap / 2 + col * (cardW + cardGap);
        const y = startY + row * (cardH + cardGap);

        // Card bg
        ctx.fillStyle = COL.white;
        ctx.shadowColor = COL.shadow;
        ctx.shadowBlur = 4;
        drawRoundRect(x, y, cardW, cardH, 10);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Icon + value
        ctx.fillStyle = card.col;
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(card.icon, x + cardW / 2, y + 22);

        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(card.value, x + cardW / 2 + 18, y + 22);

        // Label
        ctx.fillStyle = COL.textLight;
        ctx.font = '11px sans-serif';
        ctx.fillText(card.label, x + cardW / 2, y + 52);
    });

    // Coins earned (big, highlighted)
    const coinsY = startY + 2 * (cardH + cardGap) + 20;
    ctx.fillStyle = COL.postal;
    drawRoundRect(cx - 100, coinsY, 200, 50, 12);
    ctx.fill();
    ctx.fillStyle = COL.yellow;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u{1F4B0} +' + state.dayCoins + ' coins', cx, coinsY + 26);

    // Total
    ctx.fillStyle = COL.textLight;
    ctx.font = '12px sans-serif';
    ctx.fillText('Total: ' + state.coins + ' coins', cx, coinsY + 70);

    // Tap to continue
    ctx.fillStyle = COL.postal;
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
    ctx.font = '14px sans-serif';
    ctx.fillText('Tap to continue \u{2192}', cx, CANVAS_H - 80);

    ctx.restore();
}

// ============================================================
// UPGRADE SCREEN
// ============================================================
// Upgrade icon/emoji for each type
const UPGRADE_ICONS = { capacity: '\u{1F4E6}', speed: '\u{1F3C3}' };

function drawUpgradeScreen() {
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cx = CANVAS_W / 2;

    // Header
    ctx.fillStyle = COL.postal;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Upgrade Your Office', cx, 80);

    // Balance (prominent)
    ctx.fillStyle = COL.postal;
    drawRoundRect(cx - 80, 105, 160, 40, 10);
    ctx.fill();
    ctx.fillStyle = COL.yellow;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('\u{1F4B0} ' + state.coins, cx, 126);

    // Current stats summary
    ctx.fillStyle = COL.textLight;
    ctx.font = '13px sans-serif';
    ctx.fillText('\u{1F4E6} Carry ' + state.maxStack + ' items  \u{2022}  \u{1F3C3} Speed ' + state.moveSpeed.toFixed(1), cx, 170);

    // Upgrade cards
    UPGRADE_DEFS.forEach((def, i) => {
        const y = 210 + i * 130;
        const cost = getUpgradeCost(def);
        const canAfford = state.coins >= cost;
        const icon = UPGRADE_ICONS[def.key] || '\u{2B50}';

        // Card bg
        ctx.fillStyle = COL.white;
        ctx.shadowColor = COL.shadow;
        ctx.shadowBlur = 6;
        drawRoundRect(35, y, CANVAS_W - 70, 110, 12);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Left: icon
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(icon, 70, y + 35);

        // Title + level
        ctx.fillStyle = COL.text;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(def.label, 100, y + 28);

        // Level pips
        ctx.fillStyle = COL.textLight;
        ctx.font = '12px sans-serif';
        ctx.fillText('Level ' + state.upgrades[def.key], 100, y + 48);

        // Level bar
        const barX = 100;
        const barY = y + 58;
        const barW = CANVAS_W - 150;
        const barH = 8;
        const maxLvl = 10;
        ctx.fillStyle = '#E0DDD5';
        drawRoundRect(barX, barY, barW, barH, 4);
        ctx.fill();
        const fillW = (state.upgrades[def.key] / maxLvl) * barW;
        if (fillW > 0) {
            ctx.fillStyle = COL.postal;
            drawRoundRect(barX, barY, Math.max(fillW, 8), barH, 4);
            ctx.fill();
        }

        // Description
        ctx.fillStyle = COL.textLight;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(def.desc, 100, y + 82);

        // Buy button (right side)
        const btnX = CANVAS_W - 145;
        const btnY = y + 72;
        const btnW = 100;
        const btnH = 32;
        ctx.fillStyle = canAfford ? COL.green : '#BDBDBD';
        drawRoundRect(btnX, btnY, btnW, btnH, 8);
        ctx.fill();
        ctx.fillStyle = COL.white;
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F4B0} ' + cost, btnX + btnW / 2, btnY + btnH / 2 + 1);
    });

    // Next Day button
    const btnY = 490;
    ctx.fillStyle = COL.postal;
    drawRoundRect(80, btnY, CANVAS_W - 160, 55, 14);
    ctx.fill();
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u{1F4EC} Start Day ' + state.day, cx, btnY + 28);

    // Rearrange button
    ctx.fillStyle = COL.brown;
    drawRoundRect(80, 555, CANVAS_W - 160, 40, 10);
    ctx.fill();
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('\u{1F3D7} Rearrange Office', cx, 575);

    // Hint
    ctx.fillStyle = COL.textLight;
    ctx.font = '11px sans-serif';
    ctx.fillText('Upgrades carry over between shifts', cx, 615);

    ctx.restore();
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop(timestamp) {
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
    lastTime = timestamp;

    // Bot runs multiple ticks per frame for speed
    if (bot && bot.active) {
        const ticks = bot.speed;
        for (let i = 0; i < ticks; i++) {
            botUpdate(dt);
            update(dt);
        }
    } else {
        update(dt);
    }

    if (!bot || !bot.headless) {
        render();
    }

    requestAnimationFrame(gameLoop);
}

function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Apply screen effects (shake + bump + sway)
    const shake = getScreenOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    switch (state.screen) {
        case 'menu':
            drawMenu();
            break;
        case 'playing':
            ctx.fillStyle = COL.bg;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            drawOffice();
            drawParticles();
            drawPlayer();
            drawJoystick();
            drawHUD();
            drawFloatingTexts();
            drawMilestone();
            drawOutgoingTimer();
            break;
        case 'sorting':
            ctx.fillStyle = COL.bg;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            drawOffice();
            drawPlayer();
            drawHUD();
            drawSortMode();
            drawParticles();
            break;
        case 'dayEnd':
            drawDayEnd();
            break;
        case 'upgrade':
            drawUpgradeScreen();
            break;
        case 'layout':
            drawLayoutEditor();
            break;
    }

    ctx.restore();
}

// ============================================================
// BOT SIMULATION MODE — ?bot=true or ?bot=100 (num days)
// ============================================================
const BOT_PROFILES = [
    { name: 'rookie',      accuracy: 0.6,  afkChance: 0.15, wrongStationChance: 0.25, sortPriority: 0.4, servePriority: 0.3, dispatchPriority: 0.3, upgradePreference: 'random' },
    { name: 'balanced',    accuracy: 0.82, afkChance: 0.05, wrongStationChance: 0.1,  sortPriority: 0.4, servePriority: 0.3, dispatchPriority: 0.3, upgradePreference: 'random' },
    { name: 'sorter',      accuracy: 0.92, afkChance: 0.03, wrongStationChance: 0.05, sortPriority: 0.7, servePriority: 0.1, dispatchPriority: 0.2, upgradePreference: 'capacity' },
    { name: 'server',      accuracy: 0.75, afkChance: 0.05, wrongStationChance: 0.1,  sortPriority: 0.2, servePriority: 0.6, dispatchPriority: 0.2, upgradePreference: 'speed' },
    { name: 'speedrunner', accuracy: 0.95, afkChance: 0.01, wrongStationChance: 0.02, sortPriority: 0.45, servePriority: 0.25, dispatchPriority: 0.3, upgradePreference: 'speed' },
];

let bot = null;

function initBot() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('bot')) return;

    const maxDays = parseInt(params.get('bot')) || 30;
    const profileName = params.get('profile') || 'all';
    const speed = parseInt(params.get('speed')) || 10; // game speed multiplier
    const headless = params.get('headless') === 'true';

    bot = {
        active: true,
        maxDays,
        speed,
        headless,
        profileName,
        currentProfile: null,
        target: null,           // target station key
        targetLock: 0,          // seconds before reconsidering target
        afkTimer: 0,            // seconds of being "distracted"
        thinkDelay: 0,          // delay before sort decision
        results: [],            // per-profile results
        dayLog: [],             // current profile's day data
        allProfiles: profileName === 'all' ? [...BOT_PROFILES] : BOT_PROFILES.filter(p => p.name === profileName),
        profileIndex: 0,
        // Granular event tracking
        events: [],             // all events for current day
        posLog: [],             // position samples for current day
        posSampleTimer: 0,      // timer for position sampling
        stationVisits: [],      // ordered station visit log for current day
        lastActions: [],        // last N actions for stuck detection
        lastMeaningfulAction: 0, // timestamp of last meaningful action
        stuckFlags: [],         // stuck incidents detected
        dayTimeSpent: {},       // time spent near each station per day
        nearStation: null,      // which station player is currently near
        nearTimer: 0,           // how long near current station
    };

    console.log('%c[BOT] Post Haste Simulation', 'color: #2B4570; font-weight: bold; font-size: 14px');
    console.log(`[BOT] Running ${bot.allProfiles.length} profile(s), ${maxDays} days each, ${speed}x speed`);

    // Start first profile
    botStartProfile();
}

function botStartProfile() {
    if (bot.profileIndex >= bot.allProfiles.length) {
        botFinish();
        return;
    }
    bot.currentProfile = bot.allProfiles[bot.profileIndex];
    bot.dayLog = [];

    // Reset game state for this profile
    localStorage.removeItem('postHaste');
    state.day = 1;
    state.totalCoins = 0;
    state.coins = 0;
    state.totalStars = 0;
    state.daysCompleted = 0;
    state.upgrades = { capacity: 0, speed: 0, sortSpeed: 0 };
    state.maxStack = 3;
    state.moveSpeed = PLAYER_SPEED_BASE;
    layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    rebuildStations();

    console.log(`%c[BOT] Profile: ${bot.currentProfile.name}`, 'color: #4A8C5C; font-weight: bold');
    startDay();
}

function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return 'R' + Math.abs(h).toString(36).slice(0, 6);
}

function botLogEvent(type, data) {
    const t = DAY_BASE_TIME - state.timeLeft;
    bot.events.push({ t: parseFloat(t.toFixed(2)), type, ...data });

    // Track for stuck detection
    bot.lastActions.push(type + ':' + (data.station || data.bin || ''));
    if (bot.lastActions.length > 12) bot.lastActions.shift();
    bot.lastMeaningfulAction = t;
}

function botCheckStuck() {
    // Check for action loop: last 10 actions are the same 2-3 repeating
    if (bot.lastActions.length >= 10) {
        const last5 = bot.lastActions.slice(-5).join(',');
        const prev5 = bot.lastActions.slice(-10, -5).join(',');
        if (last5 === prev5) {
            const elapsed = DAY_BASE_TIME - state.timeLeft;
            bot.stuckFlags.push({ t: elapsed, type: 'action_loop', pattern: last5 });
            bot.lastActions = []; // reset to break the loop
            // Force a random target to break out
            const stations = ['incoming', 'sorting', 'counter', 'outgoing'];
            bot.target = stations[Math.floor(Math.random() * stations.length)];
            bot.targetLock = 2;
        }
    }

    // Check for position stuck: barely moved in recent samples
    if (bot.posLog.length >= 6) {
        const recent = bot.posLog.slice(-6);
        const dx = Math.abs(recent[0].x - recent[5].x);
        const dy = Math.abs(recent[0].y - recent[5].y);
        if (dx < 5 && dy < 5 && state.screen === 'playing') {
            const elapsed = DAY_BASE_TIME - state.timeLeft;
            bot.stuckFlags.push({ t: elapsed, type: 'position_stuck', x: recent[0].x, y: recent[0].y });
            // Force movement to random station
            const stations = ['incoming', 'sorting', 'counter', 'outgoing'];
            bot.target = stations[Math.floor(Math.random() * stations.length)];
            bot.targetLock = 2;
        }
    }
}

function botSamplePosition(dt) {
    bot.posSampleTimer += dt;
    if (bot.posSampleTimer >= 0.5) {
        bot.posSampleTimer -= 0.5;
        bot.posLog.push({
            x: Math.round(state.player.x),
            y: Math.round(state.player.y),
            t: parseFloat((DAY_BASE_TIME - state.timeLeft).toFixed(1)),
        });
        botCheckStuck();

        // Track time spent near stations
        let currentNear = null;
        for (const key in STATIONS) {
            if (nearStation(key)) { currentNear = key; break; }
        }
        if (currentNear) {
            if (!bot.dayTimeSpent[currentNear]) bot.dayTimeSpent[currentNear] = 0;
            bot.dayTimeSpent[currentNear] += 0.5;
        }
    }
}

function botUpdate(dt) {
    if (!bot || !bot.active) return;

    const profile = bot.currentProfile;
    const scaledDt = dt * bot.speed;

    // Sample position for route tracking
    if (state.screen === 'playing') botSamplePosition(scaledDt);

    // AFK simulation — random pauses
    if (bot.afkTimer > 0) {
        bot.afkTimer -= scaledDt;
        state.joy.dx = 0;
        state.joy.dy = 0;
        return;
    }
    if (Math.random() < profile.afkChance * dt) {
        const duration = 0.5 + Math.random() * 2;
        bot.afkTimer = duration;
        botLogEvent('afk', { duration: parseFloat(duration.toFixed(1)) });
        return;
    }

    if (state.screen === 'playing') {
        botPlayUpdate(scaledDt);
    } else if (state.screen === 'sorting') {
        botSortUpdate(scaledDt);
    } else if (state.screen === 'dayEnd') {
        botDayEnd();
    } else if (state.screen === 'upgrade') {
        botUpgrade();
    }
}

function botPlayUpdate(dt) {
    const profile = bot.currentProfile;

    // Reconsider target periodically or when current target is done
    bot.targetLock -= dt;
    if (!bot.target || bot.targetLock <= 0) {
        const prevTarget = bot.target;
        bot.target = botChooseTarget();
        bot.targetLock = 0.5 + Math.random() * 1.5;

        // Random chance to pick a wrong/suboptimal station
        let wrongPick = false;
        if (Math.random() < profile.wrongStationChance) {
            const stations = ['incoming', 'sorting', 'counter', 'outgoing'];
            bot.target = stations[Math.floor(Math.random() * stations.length)];
            wrongPick = true;
        }
        if (bot.target !== prevTarget) {
            botLogEvent('target', { station: bot.target, reason: wrongPick ? 'wrong_pick' : 'priority', from: prevTarget });
            bot.stationVisits.push(bot.target);
        }
    }

    // Move toward target
    if (bot.target) {
        const s = STATIONS[bot.target];
        const sc = stationCenter(s);
        const dx = sc.x - state.player.x;
        const dy = sc.y - state.player.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d > 10) {
            // Add slight wobble to path (humans don't walk perfectly straight)
            const wobble = Math.sin(Date.now() * 0.003) * 0.15;
            state.joy.dx = (dx / d) + wobble;
            state.joy.dy = (dy / d) + wobble * 0.5;
            state.joy.active = true;
        } else {
            state.joy.dx = 0;
            state.joy.dy = 0;
            state.joy.active = false;
        }
    }
}

function botChooseTarget() {
    const profile = bot.currentProfile;
    const weight = stackWeight();

    // Build weighted options based on what's available
    const options = [];

    // Can pick up mail?
    if (state.incomingPile.length > 0 && weight < state.maxStack) {
        options.push({ key: 'incoming', w: profile.sortPriority * (1 + state.incomingPile.length * 0.2) });
    }
    // Can sort?
    if (state.stack.length > 0) {
        options.push({ key: 'sorting', w: profile.sortPriority * (1 + state.stack.length * 0.5) });
    }
    // Can serve?
    if (state.customers.length > 0) {
        // Urgency increases as patience drops
        const urgency = state.customers.some(c => c.patience < 5000) ? 3 : 1;
        options.push({ key: 'counter', w: profile.servePriority * urgency });
    }
    // Can dispatch?
    if (state.outgoingPile.length > 0) {
        const urgency = (state.outgoingDeadline > 0 && state.outgoingTimer > state.outgoingDeadline * 0.6) ? 3 : 1;
        options.push({ key: 'outgoing', w: profile.dispatchPriority * urgency * (1 + state.outgoingPile.length * 0.3) });
    }

    if (options.length === 0) {
        // Nothing to do — go to incoming and wait
        return 'incoming';
    }

    // Weighted random selection
    const totalW = options.reduce((sum, o) => sum + o.w, 0);
    let r = Math.random() * totalW;
    for (const o of options) {
        r -= o.w;
        if (r <= 0) return o.key;
    }
    return options[options.length - 1].key;
}

function botSortUpdate(dt) {
    const profile = bot.currentProfile;

    // Think delay before swiping
    if (bot.thinkDelay > 0) {
        bot.thinkDelay -= dt;
        return;
    }

    if (!state.sortItem) return;

    // Decide: correct or wrong?
    const correct = Math.random() < profile.accuracy;
    const activeBins = BIN_COLS.slice(0, state.sortBinCount);

    let targetDir;
    if (correct) {
        targetDir = activeBins[state.sortItem.bin].dir;
    } else {
        const wrongBins = activeBins.filter((_, i) => i !== state.sortItem.bin);
        targetDir = wrongBins[Math.floor(Math.random() * wrongBins.length)].dir;
    }

    botLogEvent('sort', {
        correct,
        bin: targetDir,
        expected: activeBins[state.sortItem.bin].dir,
        isParcel: state.sortItem.isParcel,
        streak: state.streak + (correct ? 1 : 0),
        thinkTime: parseFloat((0.15 + Math.random() * 0.4).toFixed(2)),
    });

    // Simulate swipe
    const swipeLen = 60;
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    let endX = cx, endY = cy;
    if (targetDir === 'left') endX -= swipeLen;
    else if (targetDir === 'right') endX += swipeLen;
    else if (targetDir === 'up') endY -= swipeLen;

    state.sortSwipe = { startX: cx, startY: cy };
    handleSortSwipe(endX, endY);
    state.sortSwipe = null;

    // Add think delay for next item
    bot.thinkDelay = 0.15 + Math.random() * 0.4;
}

function botDayEnd() {
    // Compute route pattern signature (station visit order compressed)
    const visitPattern = bot.stationVisits.join('->');
    const uniqueVisits = [...new Set(bot.stationVisits)].length;

    // Count event types
    const sortEvents = bot.events.filter(e => e.type === 'sort');
    const correctSorts = sortEvents.filter(e => e.correct).length;
    const afkEvents = bot.events.filter(e => e.type === 'afk');
    const wrongPicks = bot.events.filter(e => e.type === 'target' && e.reason === 'wrong_pick').length;

    // Log day data with granular detail
    bot.dayLog.push({
        day: state.day - 1,
        coins: state.dayCoins,
        sorted: state.sortedCount,
        missorts: state.missortCount,
        served: state.customersServed,
        delivered: state.mailDelivered,
        streak: state.bestStreak,
        stars: state.dayStars,
        totalCoins: state.coins + state.dayCoins,
        // Granular data
        events: bot.events.length,
        route: bot.posLog,
        stationVisitOrder: bot.stationVisits,
        stationVisitCount: bot.stationVisits.length,
        uniqueStationsUsed: uniqueVisits,
        timeAtStations: { ...bot.dayTimeSpent },
        afkCount: afkEvents.length,
        afkTotalTime: parseFloat(afkEvents.reduce((s, e) => s + (e.duration || 0), 0).toFixed(1)),
        wrongPickCount: wrongPicks,
        sortDetails: sortEvents.map(e => ({ correct: e.correct, bin: e.bin, thinkTime: e.thinkTime })),
        stuckFlags: [...bot.stuckFlags],
        routePatternHash: simpleHash(visitPattern),
    });

    // Reset per-day tracking
    bot.events = [];
    bot.posLog = [];
    bot.stationVisits = [];
    bot.lastActions = [];
    bot.stuckFlags = [];
    bot.dayTimeSpent = {};
    bot.posSampleTimer = 0;

    // Check if done with this profile
    if (state.day > bot.maxDays) {
        botEndProfile();
        return;
    }

    state.screen = 'upgrade';
}

function botUpgrade() {
    const profile = bot.currentProfile;

    // Try to buy an upgrade
    let bought = false;
    UPGRADE_DEFS.forEach((def) => {
        if (bought) return;
        const cost = getUpgradeCost(def);
        if (state.coins >= cost) {
            // Profile preference or random
            if (profile.upgradePreference === 'random' || profile.upgradePreference === def.key) {
                if (profile.upgradePreference === 'random' && Math.random() > 0.5) return; // 50/50 skip
                state.coins -= cost;
                state.totalCoins = state.coins;
                state.upgrades[def.key]++;
                def.apply();
                bought = true;
            }
        }
    });

    // Start next day
    startDay();
}

function botEndProfile() {
    const profile = bot.currentProfile;
    const log = bot.dayLog;

    // Compute summary stats
    const totalCoins = log.reduce((s, d) => s + d.coins, 0);
    const totalSorted = log.reduce((s, d) => s + d.sorted, 0);
    const totalMissorts = log.reduce((s, d) => s + d.missorts, 0);
    const totalServed = log.reduce((s, d) => s + d.served, 0);
    const totalStars = log.reduce((s, d) => s + d.stars, 0);
    const avgCoins = (totalCoins / log.length).toFixed(1);
    const avgSorted = (totalSorted / log.length).toFixed(1);
    const accuracy = totalSorted > 0 ? ((totalSorted / (totalSorted + totalMissorts)) * 100).toFixed(1) : '0';
    const bestStreak = Math.max(...log.map(d => d.streak));

    // Route pattern analysis: how many unique route patterns?
    const routeHashes = log.map(d => d.routePatternHash);
    const uniqueRoutes = new Set(routeHashes).size;
    const mostCommonRoute = routeHashes.sort((a, b) =>
        routeHashes.filter(v => v === b).length - routeHashes.filter(v => v === a).length
    )[0];
    const routeRepeatPct = ((routeHashes.filter(h => h === mostCommonRoute).length / log.length) * 100).toFixed(0);

    // Stuck analysis
    const totalStuckEvents = log.reduce((s, d) => s + d.stuckFlags.length, 0);

    // Station time analysis
    const stationTotals = { incoming: 0, sorting: 0, counter: 0, outgoing: 0 };
    for (const d of log) {
        for (const key in d.timeAtStations) {
            stationTotals[key] = (stationTotals[key] || 0) + d.timeAtStations[key];
        }
    }
    const totalStationTime = Object.values(stationTotals).reduce((s, v) => s + v, 0);
    const stationPcts = {};
    for (const key in stationTotals) {
        stationPcts[key] = totalStationTime > 0 ? ((stationTotals[key] / totalStationTime) * 100).toFixed(0) + '%' : '0%';
    }

    const summary = {
        profile: profile.name,
        days: log.length,
        totalCoins,
        avgCoinsPerDay: parseFloat(avgCoins),
        totalSorted,
        avgSortedPerDay: parseFloat(avgSorted),
        totalMissorts,
        accuracy: parseFloat(accuracy) + '%',
        totalServed,
        totalStars,
        bestStreak,
        finalUpgrades: { ...state.upgrades },
        // Route diversity
        uniqueRoutePatterns: uniqueRoutes,
        routeRepetitionPct: routeRepeatPct + '%',
        // Stuck detection
        totalStuckEvents,
        stuckDays: log.filter(d => d.stuckFlags.length > 0).map(d => d.day),
        // Time distribution
        stationTimeDistribution: stationPcts,
        // AFK stats
        totalAfkEvents: log.reduce((s, d) => s + d.afkCount, 0),
        totalWrongPicks: log.reduce((s, d) => s + d.wrongPickCount, 0),
        // Full day data
        dayBreakdown: log,
    };

    bot.results.push(summary);

    console.log(`%c[BOT] ${profile.name} complete`, 'color: #D4A83B; font-weight: bold');
    console.table([{
        Profile: profile.name,
        Days: log.length,
        'Coins': totalCoins,
        'Avg/Day': avgCoins,
        'Sorted': totalSorted,
        'Accuracy': accuracy + '%',
        'Stars': totalStars,
        'Streak': bestStreak,
        'Cap': state.maxStack,
        'Spd': state.moveSpeed.toFixed(1),
        'Routes': uniqueRoutes,
        'Repeat%': routeRepeatPct + '%',
        'Stuck': totalStuckEvents,
    }]);
    console.log(`  Station time: IN=${stationPcts.incoming} SORT=${stationPcts.sorting} SERVE=${stationPcts.counter} OUT=${stationPcts.outgoing}`);

    // Next profile
    bot.profileIndex++;
    botStartProfile();
}

function botFinish() {
    bot.active = false;
    console.log('%c[BOT] All profiles complete!', 'color: #D4483B; font-weight: bold; font-size: 14px');
    console.log('[BOT] Full results available at: window.BOT_RESULTS');

    // Print comparison table
    console.table(bot.results.map(r => ({
        Profile: r.profile,
        'Coins': r.totalCoins,
        'Avg/Day': r.avgCoinsPerDay,
        'Sorted': r.totalSorted,
        'Acc%': r.accuracy,
        'Stars': r.totalStars,
        'Streak': r.bestStreak,
        'Cap': r.finalUpgrades.capacity + 3,
        'Spd': r.finalUpgrades.speed,
        'Routes': r.uniqueRoutePatterns,
        'Rpt%': r.routeRepetitionPct,
        'Stuck': r.totalStuckEvents,
        'AFK': r.totalAfkEvents,
        'WrongPick': r.totalWrongPicks,
    })));

    // Flag problems
    for (const r of bot.results) {
        if (r.totalStuckEvents > 0) {
            console.warn(`[BOT] WARNING: ${r.profile} got stuck ${r.totalStuckEvents} time(s) on days: ${r.stuckDays.join(', ')}`);
        }
        if (parseInt(r.routeRepetitionPct) > 80) {
            console.warn(`[BOT] WARNING: ${r.profile} used same route ${r.routeRepetitionPct} of the time — low variance`);
        }
    }

    // Expose for programmatic access
    window.BOT_RESULTS = bot.results;

    // Day-by-day coin curve for balance analysis
    console.log('%c[BOT] Day-by-day coin curves:', 'color: #2B4570; font-weight: bold');
    for (const r of bot.results) {
        console.log(`${r.profile}: [${r.dayBreakdown.map(d => d.coins).join(', ')}]`);
    }
}

// ============================================================
// START
// ============================================================
window.addEventListener('load', () => {
    init();
    initBot();
});
