// === Web Audio API Sound Effects (No external files needed) ===
const AudioEngine = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function playTone(freq, duration, type = 'sine', gain = 0.15) {
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

    return {
        perfect() { playTone(880, 0.15, 'sine', 0.2); playTone(1320, 0.1, 'sine', 0.1); },
        good() { playTone(660, 0.12, 'triangle', 0.15); },
        miss() { playTone(200, 0.2, 'sawtooth', 0.08); },
        longStart() { playTone(440, 0.08, 'sine', 0.12); },
        longEnd() { playTone(880, 0.15, 'sine', 0.18); },
        rapidTap() { playTone(1000 + Math.random() * 200, 0.06, 'square', 0.08); },
        combo(n) {
            if (n % 10 === 0 && n > 0) {
                playTone(523, 0.1, 'sine', 0.15);
                setTimeout(() => playTone(659, 0.1, 'sine', 0.15), 80);
                setTimeout(() => playTone(784, 0.15, 'sine', 0.2), 160);
            }
        },
        countdown() { playTone(440, 0.15, 'sine', 0.2); },
        countdownGo() { playTone(880, 0.3, 'sine', 0.25); },
        gameEnd() {
            [523, 659, 784, 1047].forEach((f, i) => {
                setTimeout(() => playTone(f, 0.3, 'sine', 0.15), i * 150);
            });
        },
        // 背景節拍 (metronome)
        tick() { playTone(1200, 0.03, 'sine', 0.05); }
    };
})();
