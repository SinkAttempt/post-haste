// =============================================================================
// Post Haste — Cozy Sound Effects (Pure Web Audio API Synthesis)
// No external audio files needed. Animal Crossing / Stardew Valley vibes.
// =============================================================================

// ---------------------------------------------------------------------------
// AudioContext singleton with mobile autoplay handling
// ---------------------------------------------------------------------------
let _ctx = null;

/**
 * Returns the shared AudioContext, creating it on first call.
 * Handles mobile autoplay restrictions — call this from any user gesture
 * (tap, click) and it will resume a suspended context automatically.
 */
function getAudioContext() {
    if (!_ctx) {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Browsers suspend AudioContext until a user gesture occurs
    if (_ctx.state === 'suspended') {
        _ctx.resume();
    }
    return _ctx;
}

/**
 * Call once from your first user interaction (e.g. "Tap to start" screen).
 * Ensures audio is unlocked on iOS Safari and Chrome mobile.
 */
function unlockAudio() {
    const ctx = getAudioContext();
    // iOS Safari needs a tiny silent buffer played to unlock
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    src.stop(0.001);
}

// ---------------------------------------------------------------------------
// Master volume (0.0 – 1.0). All sounds route through this.
// ---------------------------------------------------------------------------
let _masterVolume = 0.6;
let _masterGain = null;

function getMasterGain() {
    if (!_masterGain) {
        const ctx = getAudioContext();
        _masterGain = ctx.createGain();
        _masterGain.gain.value = _masterVolume;
        _masterGain.connect(ctx.destination);
    }
    return _masterGain;
}

/**
 * Set master volume (0.0 silent – 1.0 full).
 */
function setMasterVolume(v) {
    _masterVolume = Math.max(0, Math.min(1, v));
    if (_masterGain) {
        _masterGain.gain.value = _masterVolume;
    }
}

// ---------------------------------------------------------------------------
// Utility: create an oscillator -> gain -> master chain
// ---------------------------------------------------------------------------
function createOscGain(ctx, type, freq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(getMasterGain());
    return { osc, gain };
}

// ---------------------------------------------------------------------------
// 1. SOFT POP — picking up mail
//    Short sine burst with quick pitch drop. Sounds like a bubble pop.
// ---------------------------------------------------------------------------
function playPickupPop() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const { osc, gain } = createOscGain(ctx, 'sine', 600);

    // Quick pitch drop gives the "pop" character
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

    // Fast attack, quick decay — bubble pop envelope
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.start(now);
    osc.stop(now + 0.15);
}

// ---------------------------------------------------------------------------
// 2. SWOOSH + DING — correct sort
//    Filtered noise swoosh followed by a warm two-tone chime.
// ---------------------------------------------------------------------------
function playCorrectSort() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // --- Part A: Soft swoosh (filtered noise) ---
    const bufferSize = ctx.sampleRate * 0.15;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(2000, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(800, now + 0.12);
    noiseFilter.Q.value = 0.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(getMasterGain());
    noiseSrc.start(now);

    // --- Part B: Two-note ding (C6 → E6, major third — warm & happy) ---
    const notes = [
        { freq: 1047, start: 0.06, dur: 0.18 },  // C6
        { freq: 1319, start: 0.14, dur: 0.22 },   // E6
    ];

    notes.forEach(n => {
        const { osc, gain } = createOscGain(ctx, 'sine', n.freq);
        const t = now + n.start;

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);

        osc.start(t);
        osc.stop(t + n.dur + 0.01);
    });

    // --- Part C: Subtle shimmer overtone on the second note ---
    const { osc: shimmer, gain: shimGain } = createOscGain(ctx, 'triangle', 2638);
    const shimStart = now + 0.14;
    shimGain.gain.setValueAtTime(0.001, shimStart);
    shimGain.gain.linearRampToValueAtTime(0.06, shimStart + 0.02);
    shimGain.gain.exponentialRampToValueAtTime(0.001, shimStart + 0.25);
    shimmer.start(shimStart);
    shimmer.stop(shimStart + 0.3);
}

// ---------------------------------------------------------------------------
// 3. GENTLE BOOP — wrong sort (not punishing, just a soft nudge)
//    Low-pitched sine with slight pitch bend down. Rounded, not harsh.
// ---------------------------------------------------------------------------
function playWrongBoop() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Primary tone — low, soft, rounded
    const { osc, gain } = createOscGain(ctx, 'sine', 320);

    // Gentle downward pitch bend
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);

    // Soft envelope — no sharp attack
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.25);

    // Second softer undertone for warmth
    const { osc: osc2, gain: gain2 } = createOscGain(ctx, 'sine', 240);
    osc2.frequency.setValueAtTime(240, now);
    osc2.frequency.exponentialRampToValueAtTime(180, now + 0.15);

    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc2.start(now);
    osc2.stop(now + 0.25);
}

// ---------------------------------------------------------------------------
// 4. WARM KA-CHING — earning coins/tips
//    Bright but warm: two metallic pings with a coin-shimmer tail.
// ---------------------------------------------------------------------------
function playKaChing() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // --- "Ka" — short percussive tap ---
    const { osc: tap, gain: tapGain } = createOscGain(ctx, 'triangle', 1800);
    tap.frequency.setValueAtTime(1800, now);
    tap.frequency.exponentialRampToValueAtTime(800, now + 0.03);

    tapGain.gain.setValueAtTime(0.001, now);
    tapGain.gain.linearRampToValueAtTime(0.15, now + 0.005);
    tapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    tap.start(now);
    tap.stop(now + 0.08);

    // --- "Ching" — bright ring, two harmonically-related tones ---
    const chingStart = now + 0.04;

    // Fundamental — E7 (2637 Hz), warm metallic ring
    const { osc: ring1, gain: ringGain1 } = createOscGain(ctx, 'sine', 2637);
    ringGain1.gain.setValueAtTime(0.001, chingStart);
    ringGain1.gain.linearRampToValueAtTime(0.2, chingStart + 0.008);
    ringGain1.gain.exponentialRampToValueAtTime(0.001, chingStart + 0.35);
    ring1.start(chingStart);
    ring1.stop(chingStart + 0.4);

    // Overtone — perfect fifth above for shimmer
    const { osc: ring2, gain: ringGain2 } = createOscGain(ctx, 'sine', 3951);
    ringGain2.gain.setValueAtTime(0.001, chingStart);
    ringGain2.gain.linearRampToValueAtTime(0.08, chingStart + 0.01);
    ringGain2.gain.exponentialRampToValueAtTime(0.001, chingStart + 0.3);
    ring2.start(chingStart);
    ring2.stop(chingStart + 0.35);

    // Sub-octave warmth
    const { osc: sub, gain: subGain } = createOscGain(ctx, 'sine', 1319);
    subGain.gain.setValueAtTime(0.001, chingStart);
    subGain.gain.linearRampToValueAtTime(0.1, chingStart + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.001, chingStart + 0.25);
    sub.start(chingStart);
    sub.stop(chingStart + 0.3);
}

// ---------------------------------------------------------------------------
// 5. SOFT WHOOSH — dispatching / sending mail
//    Filtered noise sweep from low to high, like a letter sliding away.
// ---------------------------------------------------------------------------
function playDispatchWhoosh() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.25;

    // White noise source
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    // Bandpass filter sweeps upward — gives the "whoosh" movement
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + duration * 0.7);
    filter.frequency.exponentialRampToValueAtTime(1500, now + duration);
    filter.Q.value = 1.2;

    // Envelope: fade in, sustain, fade out
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
    gain.gain.setValueAtTime(0.12, now + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSrc.connect(filter);
    filter.connect(gain);
    gain.connect(getMasterGain());

    noiseSrc.start(now);

    // Optional: tiny sine "poof" at the end for sweetness
    const { osc: poof, gain: poofGain } = createOscGain(ctx, 'sine', 800);
    const poofTime = now + duration * 0.6;
    poof.frequency.setValueAtTime(800, poofTime);
    poof.frequency.exponentialRampToValueAtTime(400, poofTime + 0.08);
    poofGain.gain.setValueAtTime(0.001, poofTime);
    poofGain.gain.linearRampToValueAtTime(0.08, poofTime + 0.01);
    poofGain.gain.exponentialRampToValueAtTime(0.001, poofTime + 0.1);
    poof.start(poofTime);
    poof.stop(poofTime + 0.12);
}

// ---------------------------------------------------------------------------
// 6. LEVEL UP CHIME — streak milestones
//    Rising arpeggio: C5 → E5 → G5 → C6 with shimmer tail.
//    Pentatonic-adjacent, warm, celebratory but gentle.
// ---------------------------------------------------------------------------
function playLevelUpChime() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Major arpeggio — C5, E5, G5, C6 (warm, happy, resolved)
    const notes = [
        { freq: 523.25, time: 0.0 },    // C5
        { freq: 659.25, time: 0.09 },   // E5
        { freq: 783.99, time: 0.18 },   // G5
        { freq: 1046.50, time: 0.27 },  // C6
    ];

    const noteDuration = 0.28;

    notes.forEach((n, i) => {
        const t = now + n.time;
        const isLast = i === notes.length - 1;
        const dur = isLast ? 0.5 : noteDuration;

        // Primary sine tone
        const { osc, gain } = createOscGain(ctx, 'sine', n.freq);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.015);
        gain.gain.setValueAtTime(0.2, t + dur * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.01);

        // Soft triangle overtone for warmth
        const { osc: tri, gain: triGain } = createOscGain(ctx, 'triangle', n.freq * 2);
        triGain.gain.setValueAtTime(0.001, t);
        triGain.gain.linearRampToValueAtTime(0.05, t + 0.02);
        triGain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
        tri.start(t);
        tri.stop(t + dur + 0.01);
    });

    // Final shimmer — high sparkle on the last note
    const shimmerStart = now + 0.27;
    const { osc: shim1, gain: shimGain1 } = createOscGain(ctx, 'sine', 2093);
    shimGain1.gain.setValueAtTime(0.001, shimmerStart + 0.05);
    shimGain1.gain.linearRampToValueAtTime(0.06, shimmerStart + 0.08);
    shimGain1.gain.exponentialRampToValueAtTime(0.001, shimmerStart + 0.6);
    shim1.start(shimmerStart);
    shim1.stop(shimmerStart + 0.65);

    const { osc: shim2, gain: shimGain2 } = createOscGain(ctx, 'sine', 3136);
    shimGain2.gain.setValueAtTime(0.001, shimmerStart + 0.08);
    shimGain2.gain.linearRampToValueAtTime(0.03, shimmerStart + 0.12);
    shimGain2.gain.exponentialRampToValueAtTime(0.001, shimmerStart + 0.55);
    shim2.start(shimmerStart);
    shim2.stop(shimmerStart + 0.6);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export {
    getAudioContext,
    unlockAudio,
    setMasterVolume,
    playPickupPop,
    playCorrectSort,
    playWrongBoop,
    playKaChing,
    playDispatchWhoosh,
    playLevelUpChime,
};
