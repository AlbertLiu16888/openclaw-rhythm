// === Web Audio API Sound Effects (No external files needed) ===
const AudioEngine = (() => {
    let ctx = null;
    let enabled = true;
    let vibrationEnabled = true;
    const canVibrate = !!navigator.vibrate;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function vibrate(pattern) {
        if (vibrationEnabled && canVibrate) navigator.vibrate(pattern);
    }
    function vibrateShort() { vibrate(15); }
    function vibrateMedium() { vibrate(40); }
    function vibrateLong() { vibrate(80); }
    function vibratePattern(p) { vibrate(p); }

    function playTone(freq, duration, type = 'sine', gain = 0.15) {
        if (!enabled) return;
        const c = getCtx();
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
        osc.connect(g).connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + duration);
    }

    function unlock() {
        try {
            const c = getCtx();
            const buf = c.createBuffer(1, 1, 22050);
            const src = c.createBufferSource();
            src.buffer = buf;
            src.connect(c.destination);
            src.start(0);
        } catch (e) { /* ignore */ }
    }

    return {
        perfect() { playTone(880, 0.15, 'sine', 0.2); playTone(1320, 0.1, 'sine', 0.1); vibrateShort(); },
        good() { playTone(660, 0.12, 'triangle', 0.15); vibrateShort(); },
        miss() { playTone(200, 0.2, 'sawtooth', 0.08); vibrateMedium(); },
        longStart() { playTone(440, 0.08, 'sine', 0.12); vibrateShort(); },
        longEnd() { playTone(880, 0.15, 'sine', 0.18); vibrateMedium(); },
        rapidTap() { playTone(1000 + Math.random() * 200, 0.06, 'square', 0.08); vibrate(10); },
        combo(n) {
            if (n % 10 === 0 && n > 0) {
                playTone(523, 0.1, 'sine', 0.15);
                setTimeout(() => playTone(659, 0.1, 'sine', 0.15), 80);
                setTimeout(() => playTone(784, 0.15, 'sine', 0.2), 160);
                vibratePattern([30, 20, 30]);
            }
        },
        countdown() { playTone(440, 0.15, 'sine', 0.2); vibrateShort(); },
        countdownGo() { playTone(880, 0.3, 'sine', 0.25); vibrateMedium(); },
        gameEnd() {
            [523, 659, 784, 1047].forEach((f, i) => {
                setTimeout(() => playTone(f, 0.3, 'sine', 0.15), i * 150);
            });
            vibratePattern([50, 30, 50, 30, 150]);
        },
        // 背景節拍 (metronome)
        tick() { playTone(1200, 0.03, 'sine', 0.05); },
        toggle() {
            enabled = !enabled;
            return enabled;
        },
        toggleVibration() {
            vibrationEnabled = !vibrationEnabled;
            return vibrationEnabled;
        },
        unlock,
    };
})();
