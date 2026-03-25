// === Core Game Engine ===
class RhythmGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.paused = false;
        this.startTime = 0;
        this.elapsed = 0;
        this.beatmap = [];
        this.activeNotes = [];
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.stats = { perfect: 0, good: 0, miss: 0 };

        // Input state
        this.input = {
            L: { pressed: false, pressTime: 0, rapidCount: 0, rapidStart: 0 },
            R: { pressed: false, pressTime: 0, rapidCount: 0, rapidStart: 0 },
        };

        // Visual
        this.particles = [];
        this.hitZoneY = 0;
        this.laneWidth = 0;
        this.laneCenterL = 0;
        this.laneCenterR = 0;

        this._raf = null;
        this._boundLoop = this._loop.bind(this);

        this.onScoreChange = null;
        this.onComboChange = null;
        this.onGameEnd = null;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.ctx.scale(dpr, dpr);
        this.w = window.innerWidth;
        this.h = window.innerHeight;

        this.hitZoneY = this.h * 0.78; // 判定線位置
        this.laneWidth = this.w / 2;
        this.laneCenterL = this.w * 0.25;
        this.laneCenterR = this.w * 0.75;

        // 根據螢幕高度調整下落速度 (音符從頂端落到判定線約需 1.5 秒)
        this.fallSpeed = this.hitZoneY / 1.5;
    }

    start(beatmap) {
        this.beatmap = beatmap.map(n => ({
            ...n,
            hit: false,
            missed: false,
            y: -100,
            // 長按狀態
            holdProgress: 0,
            holdComplete: false,
            // 連打狀態
            rapidHits: 0,
            rapidComplete: false,
        }));
        this.activeNotes = [];
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.stats = { perfect: 0, good: 0, miss: 0 };
        this.particles = [];
        this.input.L = { pressed: false, pressTime: 0, rapidCount: 0, rapidStart: 0 };
        this.input.R = { pressed: false, pressTime: 0, rapidCount: 0, rapidStart: 0 };

        this.resize();
        this.running = true;
        this.startTime = performance.now();
        this._loop();
    }

    stop() {
        this.running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    // --- Input Handlers ---
    pressDown(lane) {
        if (!this.running) return;
        const inp = this.input[lane];
        inp.pressed = true;
        inp.pressTime = performance.now();

        // Check tap notes
        this._checkTap(lane);

        // Check rapid notes - increment
        this._checkRapidTap(lane);
    }

    pressUp(lane) {
        if (!this.running) return;
        const inp = this.input[lane];
        const holdDuration = performance.now() - inp.pressTime;
        inp.pressed = false;

        // Check long press release
        this._checkLongRelease(lane, holdDuration);
    }

    // --- Hit Detection ---
    _checkTap(lane) {
        const now = this.elapsed;
        let closest = null;
        let closestDist = Infinity;

        for (const note of this.activeNotes) {
            if (note.lane !== lane || note.hit || note.missed) continue;
            if (note.type !== 'tap') continue;
            const dist = Math.abs(note.time - now);
            if (dist < closestDist && dist < CONFIG.timing.good) {
                closest = note;
                closestDist = dist;
            }
        }

        if (closest) {
            closest.hit = true;
            const grade = closestDist <= CONFIG.timing.perfect ? 'perfect' : 'good';
            this._registerHit(grade, closest);
        }
    }

    _checkLongRelease(lane, holdDuration) {
        for (const note of this.activeNotes) {
            if (note.lane !== lane || note.hit || note.missed || note.type !== 'long') continue;
            // Check if player started holding near the note time
            const noteStartDiff = Math.abs(note.time - (this.elapsed - holdDuration));
            if (noteStartDiff < CONFIG.timing.good * 2) {
                if (holdDuration >= note.holdDuration * 0.6) {
                    note.hit = true;
                    note.holdComplete = true;
                    const grade = holdDuration >= note.holdDuration * 0.85 ? 'perfect' : 'good';
                    this._registerHit(grade, note);
                    AudioEngine.longEnd();
                }
            }
        }
    }

    _checkRapidTap(lane) {
        const now = performance.now();
        const inp = this.input[lane];

        for (const note of this.activeNotes) {
            if (note.lane !== lane || note.hit || note.missed || note.type !== 'rapid') continue;
            const timeDiff = Math.abs(note.time - this.elapsed);
            if (timeDiff < CONFIG.rapid.windowMs) {
                if (note.rapidHits === 0) {
                    note._rapidStart = now;
                }
                note.rapidHits++;
                AudioEngine.rapidTap();

                if (note.rapidHits >= CONFIG.rapid.requiredTaps) {
                    note.hit = true;
                    note.rapidComplete = true;
                    const elapsed = now - note._rapidStart;
                    const grade = elapsed < CONFIG.rapid.windowMs * 0.6 ? 'perfect' : 'good';
                    this._registerHit(grade, note);
                }
            }
        }
    }

    _registerHit(grade, note) {
        const baseScore = CONFIG.score[grade];
        const multiplier = CONFIG.comboBonus(this.combo);
        const points = Math.round(baseScore * multiplier);

        this.score += points;
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this.stats[grade]++;

        if (grade === 'perfect') AudioEngine.perfect();
        else AudioEngine.good();
        AudioEngine.combo(this.combo);

        // Spawn particles
        const x = note.lane === 'L' ? this.laneCenterL : this.laneCenterR;
        this._spawnParticles(x, this.hitZoneY, grade);

        if (this.onScoreChange) this.onScoreChange(this.score);
        if (this.onComboChange) this.onComboChange(this.combo);
    }

    _registerMiss(note) {
        note.missed = true;
        this.stats.miss++;
        this.combo = 0;
        AudioEngine.miss();
        if (this.onComboChange) this.onComboChange(0);
    }

    // --- Game Loop ---
    _loop() {
        if (!this.running) return;
        this._raf = requestAnimationFrame(this._boundLoop);

        const now = performance.now();
        this.elapsed = now - this.startTime;

        // Check game end
        if (this.elapsed >= CONFIG.gameDuration) {
            this.running = false;
            AudioEngine.gameEnd();
            if (this.onGameEnd) {
                this.onGameEnd({
                    score: this.score,
                    maxCombo: this.maxCombo,
                    stats: { ...this.stats },
                    passed: this.score >= CONFIG.passThreshold,
                });
            }
            return;
        }

        // Activate notes that should appear
        const leadTime = this.hitZoneY / this.fallSpeed * 1000; // ms before hit time to show
        for (const note of this.beatmap) {
            if (note._activated) continue;
            if (note.time - this.elapsed < leadTime + 100) {
                note._activated = true;
                this.activeNotes.push(note);
            }
        }

        // Update notes
        for (const note of this.activeNotes) {
            if (note.hit || note.missed) continue;

            // Calculate Y position based on time
            const timeUntilHit = note.time - this.elapsed;
            note.y = this.hitZoneY - (timeUntilHit / 1000) * this.fallSpeed;

            // Miss detection: note passed beyond hit zone
            if (note.type === 'tap' && note.y > this.hitZoneY + 60) {
                this._registerMiss(note);
            }
            if (note.type === 'long' && this.elapsed > note.time + note.holdDuration + 500) {
                if (!note.holdComplete) this._registerMiss(note);
            }
            if (note.type === 'rapid' && this.elapsed > note.time + CONFIG.rapid.windowMs + 200) {
                if (!note.rapidComplete) this._registerMiss(note);
            }
        }

        // Update particles
        this.particles = this.particles.filter(p => {
            p.life -= 0.02;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3;
            return p.life > 0;
        });

        // Clean old notes
        this.activeNotes = this.activeNotes.filter(n => {
            if (n.hit || n.missed) return n.y < this.h + 200;
            return true;
        });

        this._render();
    }

    // --- Rendering ---
    _render() {
        const { ctx, w, h } = this;
        ctx.clearRect(0, 0, w, h);

        // Background gradient
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0a0a1a');
        bg.addColorStop(1, '#1a0a2e');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Lane divider
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h * 0.82);
        ctx.stroke();

        // Lane labels
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.font = 'bold 3rem sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('L', this.laneCenterL, h * 0.5);
        ctx.fillText('R', this.laneCenterR, h * 0.5);

        // Hit zone line
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(0, this.hitZoneY);
        ctx.lineTo(w, this.hitZoneY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hit zone glow for active press
        if (this.input.L.pressed) {
            ctx.fillStyle = 'rgba(123,104,238,0.15)';
            ctx.fillRect(0, this.hitZoneY - 30, w / 2, 60);
        }
        if (this.input.R.pressed) {
            ctx.fillStyle = 'rgba(0,212,255,0.15)';
            ctx.fillRect(w / 2, this.hitZoneY - 30, w / 2, 60);
        }

        // Render notes
        for (const note of this.activeNotes) {
            if (note.y < -80 || note.y > h + 80) continue;
            const x = note.lane === 'L' ? this.laneCenterL : this.laneCenterR;
            const alpha = note.hit ? Math.max(0, 1 - (note.y - this.hitZoneY) / 100) :
                         note.missed ? 0.3 : 1;

            ctx.globalAlpha = alpha;

            if (note.type === 'tap') {
                this._drawTapNote(x, note.y, note.lane, note.hit);
            } else if (note.type === 'long') {
                this._drawLongNote(x, note.y, note);
            } else if (note.type === 'rapid') {
                this._drawRapidNote(x, note.y, note);
            }

            ctx.globalAlpha = 1;
        }

        // Render particles
        for (const p of this.particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Progress bar
        const progress = this.elapsed / CONFIG.gameDuration;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(0, h - 3, w, 3);
        const grad = ctx.createLinearGradient(0, 0, w * progress, 0);
        grad.addColorStop(0, '#7b68ee');
        grad.addColorStop(1, '#00d4ff');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h - 3, w * progress, 3);
    }

    _drawTapNote(x, y, lane, hit) {
        const { ctx } = this;
        const color = lane === 'L' ? '#7b68ee' : '#00d4ff';
        const size = hit ? 30 : 24;

        // Outer glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;

        // Diamond shape
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.fill();

        // Inner highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const s2 = size * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - s2);
        ctx.lineTo(x + s2, y);
        ctx.lineTo(x, y + s2);
        ctx.lineTo(x - s2, y);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
    }

    _drawLongNote(x, y, note) {
        const { ctx } = this;
        const color = note.lane === 'L' ? '#7b68ee' : '#00d4ff';
        const holdLen = (note.holdDuration / 1000) * this.fallSpeed;

        // Bar body
        ctx.fillStyle = color;
        ctx.globalAlpha *= 0.6;
        const barW = 36;
        ctx.beginPath();
        ctx.roundRect(x - barW / 2, y - holdLen, barW, holdLen, 8);
        ctx.fill();
        ctx.globalAlpha /= 0.6;

        // Head diamond
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();

        // Hold indicator text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 0.7rem sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('HOLD', x, y + 4);

        ctx.shadowBlur = 0;
    }

    _drawRapidNote(x, y, note) {
        const { ctx } = this;
        const color = note.lane === 'L' ? '#7b68ee' : '#00d4ff';

        // Multiple small circles
        for (let i = 0; i < CONFIG.rapid.requiredTaps; i++) {
            const offsetY = -i * 18;
            const filled = i < note.rapidHits;
            ctx.beginPath();
            ctx.arc(x, y + offsetY, 12, 0, Math.PI * 2);
            if (filled) {
                ctx.fillStyle = '#ffcc00';
                ctx.fill();
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.globalAlpha *= 0.3;
                ctx.fill();
                ctx.globalAlpha /= 0.3;
            }
        }

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 0.65rem sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('RAPID', x, y + 28);
    }

    _spawnParticles(x, y, grade) {
        const colors = grade === 'perfect'
            ? ['#ffcc00', '#ffee77', '#ffaa00']
            : ['#00d4ff', '#77eeff', '#0088cc'];
        const count = grade === 'perfect' ? 15 : 8;

        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 1) * 6,
                size: Math.random() * 4 + 2,
                life: 1,
                color: colors[Math.floor(Math.random() * colors.length)],
            });
        }
    }

    getResults() {
        return {
            score: this.score,
            maxCombo: this.maxCombo,
            stats: { ...this.stats },
            passed: this.score >= CONFIG.passThreshold,
        };
    }
}
