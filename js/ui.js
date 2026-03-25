// === UI Controller ===
(() => {
    // --- Elements ---
    const $ = id => document.getElementById(id);
    const screens = {
        start: $('screen-start'),
        game: $('screen-game'),
        result: $('screen-result'),
        leaderboard: $('screen-leaderboard'),
        admin: $('screen-admin'),
    };

    const canvas = $('game-canvas');
    const game = new RhythmGame(canvas);

    let playerName = '';

    // --- Screen Navigation ---
    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    // --- Check for admin hash ---
    function checkAdminMode() {
        if (window.location.hash === '#admin') {
            showScreen('admin');
            $('admin-secret').value = CONFIG.secretMessage;
            $('admin-threshold').value = CONFIG.passThreshold;
            $('admin-api-url').value = CONFIG.apiUrl;
        }
    }
    window.addEventListener('hashchange', checkAdminMode);
    checkAdminMode();

    // --- Start Screen ---
    const nameInput = $('player-name');
    const btnStart = $('btn-start');

    nameInput.addEventListener('input', () => {
        btnStart.disabled = nameInput.value.trim().length === 0;
    });

    btnStart.addEventListener('click', () => {
        playerName = nameInput.value.trim();
        if (!playerName) return;
        startGame();
    });

    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && nameInput.value.trim()) {
            playerName = nameInput.value.trim();
            startGame();
        }
    });

    $('btn-leaderboard').addEventListener('click', () => {
        showScreen('leaderboard');
        loadLeaderboard();
    });

    // --- Game ---
    function startGame() {
        showScreen('game');
        $('hud-player').textContent = playerName;
        $('hud-score').textContent = '0';
        $('hud-combo').className = 'hidden';

        game.resize();

        // Countdown
        countdown(3, () => {
            const beatmap = CONFIG.generateBeatmap();
            game.onScoreChange = score => {
                $('hud-score').textContent = score.toLocaleString();
            };
            game.onComboChange = combo => {
                const el = $('hud-combo');
                if (combo > 1) {
                    el.className = 'visible';
                    $('combo-count').textContent = combo;
                    // Combo burst at milestones
                    if (combo % 10 === 0) spawnComboBurst(combo);
                } else {
                    el.className = 'hidden';
                }
            };
            game.onGameEnd = results => {
                setTimeout(() => showResults(results), 500);
            };
            game.start(beatmap);
        });
    }

    function countdown(n, callback) {
        const overlay = document.createElement('div');
        overlay.id = 'countdown-overlay';
        document.body.appendChild(overlay);

        let count = n;
        function tick() {
            if (count > 0) {
                overlay.textContent = count;
                overlay.style.animation = 'none';
                overlay.offsetHeight; // reflow
                overlay.style.animation = 'countPulse 0.6s ease';
                AudioEngine.countdown();
                count--;
                setTimeout(tick, 800);
            } else {
                overlay.textContent = 'GO!';
                overlay.style.color = '#ffcc00';
                AudioEngine.countdownGo();
                setTimeout(() => {
                    overlay.remove();
                    callback();
                }, 600);
            }
        }
        tick();
    }

    function spawnComboBurst(combo) {
        const el = document.createElement('div');
        el.className = 'combo-burst';
        el.textContent = `${combo} COMBO!`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 900);
    }

    // --- Game Controls ---
    const btnL = $('btn-left');
    const btnR = $('btn-right');

    // Touch
    btnL.addEventListener('touchstart', e => { e.preventDefault(); btnL.classList.add('pressing'); game.pressDown('L'); });
    btnL.addEventListener('touchend', e => { e.preventDefault(); btnL.classList.remove('pressing'); game.pressUp('L'); });
    btnR.addEventListener('touchstart', e => { e.preventDefault(); btnR.classList.add('pressing'); game.pressDown('R'); });
    btnR.addEventListener('touchend', e => { e.preventDefault(); btnR.classList.remove('pressing'); game.pressUp('R'); });

    // Mouse fallback
    btnL.addEventListener('mousedown', e => { e.preventDefault(); btnL.classList.add('pressing'); game.pressDown('L'); });
    btnL.addEventListener('mouseup', e => { e.preventDefault(); btnL.classList.remove('pressing'); game.pressUp('L'); });
    btnL.addEventListener('mouseleave', () => { btnL.classList.remove('pressing'); game.pressUp('L'); });
    btnR.addEventListener('mousedown', e => { e.preventDefault(); btnR.classList.add('pressing'); game.pressDown('R'); });
    btnR.addEventListener('mouseup', e => { e.preventDefault(); btnR.classList.remove('pressing'); game.pressUp('R'); });
    btnR.addEventListener('mouseleave', () => { btnR.classList.remove('pressing'); game.pressUp('R'); });

    // Keyboard support (D=Left, K=Right or ArrowLeft/ArrowRight)
    const keyMap = { d: 'L', arrowleft: 'L', k: 'R', arrowright: 'R', f: 'L', j: 'R' };
    const keyState = {};
    document.addEventListener('keydown', e => {
        const lane = keyMap[e.key.toLowerCase()];
        if (lane && !keyState[e.key]) {
            keyState[e.key] = true;
            game.pressDown(lane);
            (lane === 'L' ? btnL : btnR).classList.add('pressing');
        }
    });
    document.addEventListener('keyup', e => {
        const lane = keyMap[e.key.toLowerCase()];
        if (lane) {
            keyState[e.key] = false;
            game.pressUp(lane);
            (lane === 'L' ? btnL : btnR).classList.remove('pressing');
        }
    });

    // Resize handler
    window.addEventListener('resize', () => {
        if (game.running) game.resize();
    });

    // --- Results Screen ---
    function showResults(results) {
        showScreen('result');
        $('result-score').textContent = results.score.toLocaleString();
        $('result-max-combo').textContent = results.maxCombo;
        $('result-perfect').textContent = results.stats.perfect;
        $('result-good').textContent = results.stats.good;
        $('result-miss').textContent = results.stats.miss;

        if (results.passed) {
            $('result-title').textContent = '🎉 挑戰成功！';
            $('result-title').style.color = '#ffcc00';
            showSecretMessages(playerName);
        } else {
            $('result-title').textContent = '挑戰結束';
            $('result-title').style.color = '#aaa';
            $('secret-message-area').classList.add('hidden');
        }

        // Submit score
        submitScore(playerName, results.score);
    }

    function showSecretMessages(name) {
        const area = $('secret-message-area');
        area.classList.remove('hidden');
        area.innerHTML = '';

        const messages = [
            `恭喜「${name}」挑戰成功！`,
            '請記下接下來的文字訊息',
            `輸入破關訊息「${CONFIG.secretMessage}」獲得積分`,
        ];

        messages.forEach((msg, i) => {
            const line = document.createElement('div');
            line.className = 'fade-line';
            line.textContent = msg;
            line.style.animationDelay = `${i * 1.5 + 0.5}s`;
            area.appendChild(line);
        });
    }

    $('btn-retry').addEventListener('click', () => {
        game.stop();
        startGame();
    });

    $('btn-home').addEventListener('click', () => {
        game.stop();
        showScreen('start');
    });

    // --- Leaderboard ---
    // Local fallback leaderboard (used when no API URL configured)
    function getLocalScores() {
        try { return JSON.parse(localStorage.getItem('oc_scores') || '[]'); }
        catch { return []; }
    }
    function saveLocalScore(name, score) {
        const scores = getLocalScores();
        scores.push({ name, score, date: new Date().toISOString().slice(0, 10) });
        scores.sort((a, b) => b.score - a.score);
        localStorage.setItem('oc_scores', JSON.stringify(scores.slice(0, 50)));
    }

    async function submitScore(name, score) {
        saveLocalScore(name, score); // Always save locally

        const url = CONFIG.apiUrl;
        if (!url) return;

        try {
            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'addScore', name, score }),
            });
        } catch (e) {
            console.warn('Failed to submit score to remote:', e);
        }
    }

    async function loadLeaderboard() {
        const list = $('leaderboard-list');
        list.innerHTML = '<p class="loading">載入中...</p>';

        let scores = [];
        const url = CONFIG.apiUrl;

        if (url) {
            try {
                const res = await fetch(`${url}?action=getScores`);
                const data = await res.json();
                if (Array.isArray(data)) scores = data;
            } catch (e) {
                console.warn('Failed to load remote scores, using local:', e);
            }
        }

        // Merge with local scores
        const localScores = getLocalScores();
        const merged = [...scores];
        for (const ls of localScores) {
            if (!merged.some(s => s.name === ls.name && s.score === ls.score)) {
                merged.push(ls);
            }
        }
        merged.sort((a, b) => b.score - a.score);
        const top = merged.slice(0, 30);

        if (top.length === 0) {
            list.innerHTML = '<p class="loading">尚無紀錄</p>';
            return;
        }

        list.innerHTML = top.map((s, i) => `
            <div class="lb-row">
                <span class="lb-rank">${i + 1}</span>
                <span class="lb-name">${escapeHtml(s.name)}</span>
                <span class="lb-score">${s.score.toLocaleString()}</span>
            </div>
        `).join('');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    $('btn-back').addEventListener('click', () => showScreen('start'));

    // --- Admin ---
    $('btn-admin-save').addEventListener('click', () => {
        localStorage.setItem('oc_secret', $('admin-secret').value);
        localStorage.setItem('oc_threshold', $('admin-threshold').value);
        localStorage.setItem('oc_api_url', $('admin-api-url').value);
        $('admin-status').textContent = '設定已儲存！';
        setTimeout(() => $('admin-status').textContent = '', 2000);
    });

    $('btn-admin-back').addEventListener('click', () => {
        window.location.hash = '';
        showScreen('start');
    });
})();
