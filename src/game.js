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

// Station definitions
// Station definitions — icons + descriptive labels
const STATIONS = {
    incoming: { x: 60, y: 180, w: 70, h: 55, label: 'MAIL IN', icon: '\u{1F4E8}', col: COL.brown },
    sorting:  { x: 155, y: 400, w: 80, h: 60, label: 'SORT', icon: '\u{1F4CB}', col: COL.postal },
    counter:  { x: 280, y: 180, w: 75, h: 55, label: 'SERVE', icon: '\u{1F6CE}', col: COL.green },
    outgoing: { x: 280, y: 500, w: 75, h: 55, label: 'SEND OUT', icon: '\u{1F69A}', col: COL.red },
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
const DAY_BASE_TIME = 60; // 60 seconds — tight shifts
const MAIL_SPAWN_INTERVAL_BASE = 2000; // ms between new mail at incoming
const CUSTOMER_SPAWN_INTERVAL_BASE = 5000; // ms between customers
const CUSTOMER_PATIENCE = 12000; // ms before customer leaves

// ============================================================
// AUDIO — cozy synthesised SFX (no external files)
// ============================================================
let audioCtx = null;
let masterGain = null;

function getAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function unlockAudio() {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
}

// Soft bubble pop — picking up mail
function sfxPickup() {
    const ctx = getAudio();
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
            patience: CUSTOMER_PATIENCE,
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
        const hadItems = state.stack.length;
        while (state.stack.length < state.maxStack && state.incomingPile.length > 0) {
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

    // Badge count
    let count = 0;
    if (key === 'incoming') count = state.incomingPile.length;
    if (key === 'counter') count = state.customers.length;
    if (key === 'outgoing') count = state.outgoingPile.length;

    if (count > 0) {
        // Red notification badge
        ctx.fillStyle = COL.red;
        ctx.beginPath();
        ctx.arc(s.x + s.w - 2, s.y + 2, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COL.white;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(count, s.x + s.w - 2, s.y + 3);
    }

    ctx.restore();
}

function getPlayerMood() {
    // Excited: on a streak of 3+
    if (state.streak >= 3) return 'excited';
    // Sad: just missorted (shake still active)
    if (screenShake.amount > 0.5) return 'sad';
    // Happy: carrying mail or just sorted something
    if (state.stack.length > 0 || state.sortedCount > 0) return 'happy';
    // Happy: customers waiting and near counter
    if (state.customers.length > 0 && nearStation('counter')) return 'happy';
    // Neutral: idle
    return 'neutral';
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

    // Eyes
    ctx.fillStyle = COL.white;
    ctx.beginPath();
    if (mood === 'sad') {
        // Droopy eyes (smaller, lower)
        ctx.arc(px - 5, py - 3, 2.5, 0, Math.PI * 2);
        ctx.arc(px + 5, py - 3, 2.5, 0, Math.PI * 2);
    } else if (mood === 'happy') {
        // Big bright eyes
        ctx.arc(px - 5, py - 4, 3.5, 0, Math.PI * 2);
        ctx.arc(px + 5, py - 4, 3.5, 0, Math.PI * 2);
    } else if (mood === 'excited') {
        // Squinting happy (closed smile eyes)
        ctx.arc(px - 5, py - 4, 3, 0, Math.PI * 2);
        ctx.arc(px + 5, py - 4, 3, 0, Math.PI * 2);
    } else {
        // Neutral
        ctx.arc(px - 5, py - 4, 3, 0, Math.PI * 2);
        ctx.arc(px + 5, py - 4, 3, 0, Math.PI * 2);
    }
    ctx.fill();

    // Pupils for excited (tiny dots on white)
    if (mood === 'excited') {
        ctx.fillStyle = COL.postal;
        ctx.beginPath();
        ctx.arc(px - 5, py - 4, 1.2, 0, Math.PI * 2);
        ctx.arc(px + 5, py - 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = COL.white;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (mood === 'sad') {
        // Frown
        ctx.arc(px, py + 6, 4, 1.1 * Math.PI, 1.9 * Math.PI);
    } else if (mood === 'happy') {
        // Smile
        ctx.arc(px, py + 1, 5, 0.1 * Math.PI, 0.9 * Math.PI);
    } else if (mood === 'excited') {
        // Big open smile
        ctx.arc(px, py + 1, 6, 0.05 * Math.PI, 0.95 * Math.PI);
        ctx.stroke();
        // Fill mouth
        ctx.fillStyle = '#1a3050';
        ctx.beginPath();
        ctx.arc(px, py + 1, 6, 0.05 * Math.PI, 0.95 * Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath(); // reset for outer stroke
    } else {
        // Neutral line
        ctx.moveTo(px - 4, py + 3);
        ctx.lineTo(px + 4, py + 3);
    }
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
    const fillPct = state.stack.length / state.maxStack;
    if (fillPct > 0) {
        ctx.fillStyle = fillPct >= 1 ? '#FF6B6B' : 'rgba(255,255,255,0.6)';
        drawRoundRect(12, 42, Math.max(100 * fillPct, 8), 18, 4);
        ctx.fill();
    }
    ctx.fillStyle = COL.white;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u{1F4E6} ' + state.stack.length + ' / ' + state.maxStack, 62, 52);

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
    if (state.stack.length >= state.maxStack) {
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
        ctx.fillText(state.sortItem.isParcel ? 'PARCEL' : 'LETTER', cx, cy + 32);
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
        ['\u{1F4E6}', 'Day 5+: parcels appear (heavier, take more bag space)'],
        ['\u{1F7E2}', 'Day 10+: 3rd sorting bin unlocks (green)'],
        ['\u{1F4B0}', 'Between days: upgrade carry capacity and move speed'],
        ['\u{1F525}', 'Correct sort streaks give coin multipliers (up to 3x)'],
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

    // Hint
    ctx.fillStyle = COL.textLight;
    ctx.font = '11px sans-serif';
    ctx.fillText('Upgrades carry over between shifts', cx, btnY + 75);

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
    }

    ctx.restore();
}

// ============================================================
// START
// ============================================================
window.addEventListener('load', init);
