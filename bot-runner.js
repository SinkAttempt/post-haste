#!/usr/bin/env node
// Bot Runner — runs Post Haste simulation in Node.js (no browser needed)
// Usage: node bot-runner.js [numBots] [daysEach]
// Output: bot-results/<timestamp>.json

const fs = require('fs');
const path = require('path');

// ============================================================
// Mock browser globals so game.js can load
// ============================================================
const noop = () => {};
const mockCtx = new Proxy({}, { get: () => (...args) => mockCtx });

global.window = {
    addEventListener: noop,
    devicePixelRatio: 1,
    innerWidth: 390,
    innerHeight: 844,
    AudioContext: undefined,
    webkitAudioContext: undefined,
    location: { search: '' },
};
global.document = {
    getElementById: () => ({
        getContext: () => mockCtx,
        addEventListener: noop,
        style: {},
        width: 390,
        height: 844,
    }),
    createElement: () => ({ src: '' }),
};
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; },
    removeItem(k) { delete this._data[k]; },
};
global.requestAnimationFrame = noop;
global.Date = Date;

// Load game code via vm module — handles const/let/arrow functions properly
const vm = require('vm');
const gameCode = fs.readFileSync(path.join(__dirname, 'src/game.js'), 'utf8');
let strippedCode = gameCode.replace(/window\.addEventListener\('load'[\s\S]*$/, '');
// Convert const/let to var so they attach to the vm sandbox context
strippedCode = strippedCode.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');

// Create sandbox with mocked browser globals
// Suppress audio errors in headless mode
const quietConsole = { ...console, error: noop, warn: noop };

const sandbox = {
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    requestAnimationFrame: noop,
    Date,
    Math,
    console: quietConsole,
    parseInt,
    parseFloat,
    JSON,
    Set,
    URLSearchParams: class { has() { return false; } get() { return null; } },
};
vm.createContext(sandbox);
vm.runInContext(strippedCode, sandbox);

// Pull everything we need from the sandbox
const {
    state, STATIONS, STATION_DEFS, BIN_COLS, BOT_PROFILES, UPGRADE_DEFS, DEFAULT_LAYOUT,
    CANVAS_W, CANVAS_H, PLAYER_SPEED_BASE, DAY_BASE_TIME,
    startDay, update, stationCenter, nearStation, stackWeight,
    rebuildStations, handleSortSwipe, botChooseTargetPure, simpleHash,
    getUpgradeCost, updateFloatingTexts, updateParticles, updateScreenEffects,
} = sandbox;

// ============================================================
// Runner config
// ============================================================
const BOTS_PER_PROFILE = parseInt(process.argv[2]) || 3;
const DAYS_EACH = parseInt(process.argv[3]) || 30;
const SPEED_MULT = 20;
const NUM_BOTS = BOT_PROFILES.length * BOTS_PER_PROFILE;

const resultsDir = path.join(__dirname, 'bot-results');
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);

console.log(`Running ${NUM_BOTS} bots (${BOTS_PER_PROFILE} per profile × ${BOT_PROFILES.length} profiles), ${DAYS_EACH} days each...`);

// ============================================================
// Run simulations
// ============================================================
const allRuns = [];

for (let botIdx = 0; botIdx < NUM_BOTS; botIdx++) {
    // 3 bots per profile — same skill level, different RNG seeds
    const profileIdx = Math.floor(botIdx / BOTS_PER_PROFILE);
    const runWithinProfile = botIdx % BOTS_PER_PROFILE;
    const profile = BOT_PROFILES[profileIdx];

    // Reset everything
    localStorage.removeItem('postHaste');
    state.day = 1;
    state.totalCoins = 0;
    state.coins = 0;
    state.totalStars = 0;
    state.daysCompleted = 0;
    state.upgrades = { capacity: 0, speed: 0, sortSpeed: 0 };
    state.maxStack = 3;
    state.moveSpeed = PLAYER_SPEED_BASE;
    sandbox.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    rebuildStations();
    sandbox.floatingTexts = [];
    sandbox.particles = [];
    sandbox.screenShake = { amount: 0, decay: 0.7 };
    sandbox.screenBump = { x: 0, y: 0 };
    sandbox.moodOverride = null;
    sandbox.moodOverrideTimer = 0;

    // Init bot tracking
    const botState = {
        profile,
        target: null,
        targetLock: 0,
        afkTimer: 0,
        thinkDelay: 0,
        events: [],
        posLog: [],
        posSampleTimer: 0,
        stationVisits: [],
        lastActions: [],
        lastMeaningfulAction: 0,
        stuckFlags: [],
        dayTimeSpent: {},
    };

    const dayResults = [];
    const dt = 0.016; // 60fps tick

    startDay();

    let tickCount = 0;
    const maxTicks = DAYS_EACH * DAY_BASE_TIME / dt * 2; // safety limit

    while (state.day <= DAYS_EACH && tickCount < maxTicks) {
        tickCount++;

        if (state.screen === 'playing') {
            // Position sampling
            botState.posSampleTimer += dt;
            if (botState.posSampleTimer >= 0.5) {
                botState.posSampleTimer -= 0.5;
                botState.posLog.push({
                    x: Math.round(state.player.x),
                    y: Math.round(state.player.y),
                    t: parseFloat((DAY_BASE_TIME - state.timeLeft).toFixed(1)),
                });

                // Track station time
                for (const key in STATIONS) {
                    if (nearStation(key)) {
                        if (!botState.dayTimeSpent[key]) botState.dayTimeSpent[key] = 0;
                        botState.dayTimeSpent[key] += 0.5;
                        break;
                    }
                }

                // Stuck detection — only flag if NOT near any station (being near a station = working)
                let isNearAnyStation = false;
                for (const key in STATIONS) {
                    if (nearStation(key)) { isNearAnyStation = true; break; }
                }
                if (!isNearAnyStation && botState.posLog.length >= 10) {
                    const recent = botState.posLog.slice(-10);
                    const dx = Math.abs(recent[0].x - recent[9].x);
                    const dy = Math.abs(recent[0].y - recent[9].y);
                    if (dx < 5 && dy < 5) {
                        botState.stuckFlags.push({ t: DAY_BASE_TIME - state.timeLeft, type: 'position_stuck' });
                        const stations = ['incoming', 'sorting', 'counter', 'outgoing'];
                        botState.target = stations[Math.floor(Math.random() * stations.length)];
                        botState.targetLock = 2;
                    }
                }

                // Action loop detection
                if (botState.lastActions.length >= 10) {
                    const last5 = botState.lastActions.slice(-5).join(',');
                    const prev5 = botState.lastActions.slice(-10, -5).join(',');
                    if (last5 === prev5) {
                        botState.stuckFlags.push({ t: DAY_BASE_TIME - state.timeLeft, type: 'action_loop' });
                        botState.lastActions = [];
                        const stations = ['incoming', 'sorting', 'counter', 'outgoing'];
                        botState.target = stations[Math.floor(Math.random() * stations.length)];
                        botState.targetLock = 2;
                    }
                }
            }

            // AFK
            if (botState.afkTimer > 0) {
                botState.afkTimer -= dt;
                state.joy.dx = 0;
                state.joy.dy = 0;
            } else if (Math.random() < profile.afkChance * dt) {
                botState.afkTimer = 0.5 + Math.random() * 2;
                botState.events.push({ type: 'afk', t: DAY_BASE_TIME - state.timeLeft });
            } else {
                // Choose target
                botState.targetLock -= dt;
                if (!botState.target || botState.targetLock <= 0) {
                    const prevTarget = botState.target;
                    botState.target = botChooseTargetPure(profile, botState);
                    botState.targetLock = 0.5 + Math.random() * 1.5;

                    if (Math.random() < profile.wrongStationChance) {
                        const stations = ['incoming', 'sorting', 'counter', 'outgoing'];
                        botState.target = stations[Math.floor(Math.random() * stations.length)];
                    }

                    if (botState.target !== prevTarget) {
                        botState.stationVisits.push(botState.target);
                        botState.lastActions.push('target:' + botState.target);
                        if (botState.lastActions.length > 12) botState.lastActions.shift();
                    }
                }

                // Move toward target
                if (botState.target) {
                    const s = STATIONS[botState.target];
                    const sc = stationCenter(s);
                    const ddx = sc.x - state.player.x;
                    const ddy = sc.y - state.player.y;
                    const d = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (d > 10) {
                        const wobble = Math.sin(tickCount * 0.05) * 0.15;
                        state.joy.dx = (ddx / d) + wobble;
                        state.joy.dy = (ddy / d) + wobble * 0.5;
                        state.joy.active = true;
                    } else {
                        state.joy.dx = 0;
                        state.joy.dy = 0;
                    }
                }
            }

            update(dt);

        } else if (state.screen === 'sorting') {
            // Sort with think delay
            if (botState.thinkDelay > 0) {
                botState.thinkDelay -= dt;
                updateFloatingTexts(dt);
                updateParticles(dt);
                updateScreenEffects();
            } else if (state.sortItem) {
                const correct = Math.random() < profile.accuracy;
                const activeBins = BIN_COLS.slice(0, state.sortBinCount);
                let targetDir;
                if (correct) {
                    targetDir = activeBins[state.sortItem.bin].dir;
                } else {
                    const wrongBins = activeBins.filter((_, i) => i !== state.sortItem.bin);
                    targetDir = wrongBins[Math.floor(Math.random() * wrongBins.length)].dir;
                }

                botState.events.push({
                    type: 'sort', correct, bin: targetDir,
                    expected: activeBins[state.sortItem.bin].dir,
                    isParcel: state.sortItem.isParcel,
                    streak: state.streak,
                });
                botState.lastActions.push('sort:' + (correct ? 'ok' : 'miss'));
                if (botState.lastActions.length > 12) botState.lastActions.shift();

                const cx = CANVAS_W / 2;
                const cy = CANVAS_H / 2;
                const swipeLen = 60;
                let ex = cx, ey = cy;
                if (targetDir === 'left') ex -= swipeLen;
                else if (targetDir === 'right') ex += swipeLen;
                else if (targetDir === 'up') ey -= swipeLen;

                state.sortSwipe = { startX: cx, startY: cy };
                handleSortSwipe(ex, ey);
                state.sortSwipe = null;

                botState.thinkDelay = 0.15 + Math.random() * 0.4;
            } else {
                updateFloatingTexts(dt);
                updateParticles(dt);
                updateScreenEffects();
            }

        } else if (state.screen === 'dayEnd') {
            // Log day results
            const visitPattern = botState.stationVisits.join('->');
            const sortEvents = botState.events.filter(e => e.type === 'sort');

            dayResults.push({
                day: state.day - 1,
                coins: state.dayCoins,
                sorted: state.sortedCount,
                missorts: state.missortCount,
                served: state.customersServed,
                delivered: state.mailDelivered,
                streak: state.bestStreak,
                stars: state.dayStars,
                totalCoins: state.coins + state.dayCoins,
                stationVisitCount: botState.stationVisits.length,
                uniqueStationsUsed: new Set(botState.stationVisits).size,
                timeAtStations: { ...botState.dayTimeSpent },
                afkCount: botState.events.filter(e => e.type === 'afk').length,
                wrongSorts: sortEvents.filter(e => !e.correct).length,
                correctSorts: sortEvents.filter(e => e.correct).length,
                stuckFlags: [...botState.stuckFlags],
                routeHash: simpleHash(visitPattern),
                positionSamples: botState.posLog.length,
                routeLength: botState.posLog.length > 1 ? botState.posLog.reduce((total, p, i) => {
                    if (i === 0) return 0;
                    const prev = botState.posLog[i - 1];
                    return total + Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
                }, 0) : 0,
            });

            // Reset per-day
            botState.events = [];
            botState.posLog = [];
            botState.stationVisits = [];
            botState.lastActions = [];
            botState.stuckFlags = [];
            botState.dayTimeSpent = {};
            botState.posSampleTimer = 0;

            // Upgrade (random buys)
            state.screen = 'upgrade';

        } else if (state.screen === 'upgrade') {
            // Try buying upgrades
            UPGRADE_DEFS.forEach(def => {
                const cost = getUpgradeCost(def);
                if (state.coins >= cost && Math.random() > 0.3) {
                    state.coins -= cost;
                    state.totalCoins = state.coins;
                    state.upgrades[def.key]++;
                    def.apply();
                }
            });
            startDay();
        }
    }

    // Compute summary
    const totalCoins = dayResults.reduce((s, d) => s + d.coins, 0);
    const totalSorted = dayResults.reduce((s, d) => s + d.sorted, 0);
    const totalMissorts = dayResults.reduce((s, d) => s + d.missorts, 0);
    const totalServed = dayResults.reduce((s, d) => s + d.served, 0);
    const totalStars = dayResults.reduce((s, d) => s + d.stars, 0);
    const routeHashes = dayResults.map(d => d.routeHash);
    const uniqueRoutes = new Set(routeHashes).size;
    const totalStuck = dayResults.reduce((s, d) => s + d.stuckFlags.length, 0);
    const totalDistance = dayResults.reduce((s, d) => s + d.routeLength, 0);

    // Station time distribution
    const stationTotals = { incoming: 0, sorting: 0, counter: 0, outgoing: 0 };
    for (const d of dayResults) {
        for (const key in d.timeAtStations) {
            stationTotals[key] = (stationTotals[key] || 0) + d.timeAtStations[key];
        }
    }

    allRuns.push({
        botId: botIdx,
        profile: profile.name,
        daysPlayed: dayResults.length,
        totalCoins,
        avgCoinsPerDay: parseFloat((totalCoins / dayResults.length).toFixed(1)),
        totalSorted,
        totalMissorts,
        accuracy: totalSorted > 0 ? parseFloat(((totalSorted / (totalSorted + totalMissorts)) * 100).toFixed(1)) : 0,
        totalServed,
        totalStars,
        bestStreak: Math.max(...dayResults.map(d => d.streak)),
        finalUpgrades: { ...state.upgrades },
        finalCapacity: state.maxStack,
        finalSpeed: parseFloat(state.moveSpeed.toFixed(2)),
        uniqueRoutePatterns: uniqueRoutes,
        totalStuckEvents: totalStuck,
        totalDistanceWalked: Math.round(totalDistance),
        stationTimeDistribution: stationTotals,
        coinCurve: dayResults.map(d => d.coins),
        starCurve: dayResults.map(d => d.stars),
        sortedCurve: dayResults.map(d => d.sorted),
        stuckDays: dayResults.filter(d => d.stuckFlags.length > 0).map(d => d.day),
        dayBreakdown: dayResults,
    });

    const pct = Math.round((botIdx + 1) / NUM_BOTS * 100);
    process.stdout.write(`\r  Bot ${botIdx + 1}/${NUM_BOTS} (${profile.name}) — ${pct}%`);
}

console.log('\n');

// ============================================================
// Save results
// ============================================================
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = `${timestamp}_${NUM_BOTS}bots_${BOTS_PER_PROFILE}each_${DAYS_EACH}days.json`;
const filepath = path.join(resultsDir, filename);

const output = {
    meta: {
        timestamp: new Date().toISOString(),
        numBots: NUM_BOTS,
        botsPerProfile: BOTS_PER_PROFILE,
        daysEach: DAYS_EACH,
        dayLengthSeconds: DAY_BASE_TIME,
        profiles: BOT_PROFILES.map(p => p.name),
    },
    summary: allRuns.map(r => ({
        botId: r.botId,
        profile: r.profile,
        coins: r.totalCoins,
        avgPerDay: r.avgCoinsPerDay,
        sorted: r.totalSorted,
        accuracy: r.accuracy,
        stars: r.totalStars,
        streak: r.bestStreak,
        capacity: r.finalCapacity,
        speed: r.finalSpeed,
        routes: r.uniqueRoutePatterns,
        stuck: r.totalStuckEvents,
        distance: r.totalDistanceWalked,
    })),
    runs: allRuns,
};

fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
console.log(`Results saved to: ${filepath}`);
console.log(`File size: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);

// Print summary table
console.log('\n=== SUMMARY ===\n');
const headers = ['Bot', 'Profile', 'Coins', 'Avg/Day', 'Sorted', 'Acc%', 'Stars', 'Streak', 'Cap', 'Routes', 'Stuck'];
console.log(headers.map(h => h.padEnd(10)).join(''));
console.log('-'.repeat(110));
for (const r of allRuns) {
    console.log([
        String(r.botId).padEnd(10),
        r.profile.padEnd(10),
        String(r.totalCoins).padEnd(10),
        String(r.avgCoinsPerDay).padEnd(10),
        String(r.totalSorted).padEnd(10),
        (r.accuracy + '%').padEnd(10),
        String(r.totalStars).padEnd(10),
        String(r.bestStreak).padEnd(10),
        String(r.finalCapacity).padEnd(10),
        String(r.uniqueRoutePatterns).padEnd(10),
        String(r.totalStuckEvents).padEnd(10),
    ].join(''));
}

// Flag issues
console.log('\n=== WARNINGS ===');
let warnings = 0;
for (const r of allRuns) {
    if (r.totalStuckEvents > 0) {
        console.log(`  ⚠ Bot ${r.botId} (${r.profile}): stuck ${r.totalStuckEvents}x on days ${r.stuckDays.join(', ')}`);
        warnings++;
    }
    if (r.uniqueRoutePatterns <= 2) {
        console.log(`  ⚠ Bot ${r.botId} (${r.profile}): only ${r.uniqueRoutePatterns} unique routes — very repetitive`);
        warnings++;
    }
}
if (warnings === 0) console.log('  None — all bots ran clean');

// Per-profile variance analysis
console.log('\n=== PROFILE VARIANCE (same skill, different runs) ===\n');
const byProfile = {};
for (const r of allRuns) {
    if (!byProfile[r.profile]) byProfile[r.profile] = [];
    byProfile[r.profile].push(r);
}
for (const [name, runs] of Object.entries(byProfile)) {
    const coins = runs.map(r => r.avgCoinsPerDay);
    const sorted = runs.map(r => r.totalSorted);
    const stars = runs.map(r => r.totalStars);
    const routes = runs.map(r => r.uniqueRoutePatterns);
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const spread = arr => Math.max(...arr) - Math.min(...arr);
    const cv = arr => { const m = avg(arr); return m > 0 ? ((Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) / m) * 100).toFixed(1) : '0.0'; };

    console.log(`  ${name.toUpperCase()} (×${runs.length}):`);
    console.log(`    coins/day: ${coins.map(c => c.toFixed(0)).join(', ')}  (spread: ${spread(coins).toFixed(0)}, CV: ${cv(coins)}%)`);
    console.log(`    sorted:    ${sorted.join(', ')}  (spread: ${spread(sorted)}, CV: ${cv(sorted)}%)`);
    console.log(`    stars:     ${stars.join(', ')}  (spread: ${spread(stars)}, CV: ${cv(stars)}%)`);
    console.log(`    routes:    ${routes.join(', ')}  (spread: ${spread(routes)})`);

    // Flag if bots at same level are too similar (suggests deterministic gameplay)
    if (cv(coins) < 3) {
        console.log(`    ⚠ VERY LOW VARIANCE — coins/day CV < 3%, gameplay may be too deterministic at this level`);
        warnings++;
    }
    // Flag if bots at same level are wildly different (suggests unbalanced RNG)
    if (cv(coins) > 30) {
        console.log(`    ⚠ HIGH VARIANCE — coins/day CV > 30%, RNG swings may dominate skill`);
        warnings++;
    }
}
