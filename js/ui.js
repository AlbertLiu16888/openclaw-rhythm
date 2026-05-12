// === UI Controller ===
(() => {
    // --- Elements ---
    const $ = id => document.getElementById(id);
    const screens = {
        start: $('screen-start'),
        lobby: $('screen-lobby'),
        waiting: $('screen-waiting'),
        game: $('screen-game'),
        result: $('screen-result'),
        leaderboard: $('screen-leaderboard'),
        admin: $('screen-admin'),
    };

    const canvas = $('game-canvas');
    const game = new RhythmGame(canvas);
    let playerName = '';
    let isBattleMode = false;
    let mp = null; // MultiplayerManager instance
    let sharedBeatmapSeed = null;
    let opponentFinalResults = null;
    let syncInterval = null;

    // Firebase 設定 — 替換成你自己的 Firebase config
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyCgHgg7cwWQdK_3CXbw_j3NznU8owamYsE",
        authDomain: "openclaw-games.firebaseapp.com",
        databaseURL: "https://openclaw-games-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "openclaw-games",
        storageBucket: "openclaw-games.firebasestorage.app",
        messagingSenderId: "722220179558",
        appId: "1:722220179558:web:4819d728e7d45d42f70da7"
    };

    let firebaseReady = false;
    function initFirebase() {
        if (firebaseReady) return true;
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            firebaseReady = true;
            return true;
        } catch (e) {
            console.warn('Firebase init failed:', e);
            return false;
        }
    }

    // 開機載入遠端設定
    CONFIG.loadRemoteConfig();

    // --- Screen Navigation ---
    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    // --- Check for admin hash ---
    async function checkAdminMode() {
        if (window.location.hash === '#admin') {
            showScreen('admin');
            await CONFIG.loadRemoteConfig();
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
    const btnBattle = $('btn-battle');

    nameInput.addEventListener('input', () => {
        const hasName = nameInput.value.trim().length > 0;
        btnStart.disabled = !hasName;
        btnBattle.disabled = !hasName;
    });

    btnStart.addEventListener('click', () => {
        playerName = nameInput.value.trim();
        if (!playerName) return;
        isBattleMode = false;
        startGame();
    });

    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && nameInput.value.trim()) {
            playerName = nameInput.value.trim();
            isBattleMode = false;
            startGame();
        }
    });

    $('btn-leaderboard').addEventListener('click', () => {
        showScreen('leaderboard');
        loadLeaderboard();
    });

    // =========================================
    // 對戰模式
    // =========================================

    btnBattle.addEventListener('click', () => {
        playerName = nameInput.value.trim();
        if (!playerName) return;
        showScreen('lobby');
    });

    $('btn-lobby-back').addEventListener('click', () => showScreen('start'));

    // 建立房間
    $('btn-create-room').addEventListener('click', async () => {
        if (!initFirebase()) {
            alert('Firebase 連線失敗，請檢查網路');
            return;
        }
        mp = new MultiplayerManager('rhythm');
        mp.init();

        const code = await mp.createRoom(playerName);
        showWaitingRoom(code);
    });

    // 快速配對
    $('btn-quick-match').addEventListener('click', async () => {
        if (!initFirebase()) {
            alert('Firebase 連線失敗，請檢查網路');
            return;
        }
        mp = new MultiplayerManager('rhythm');
        mp.init();

        $('btn-quick-match').textContent = '配對中...';
        $('btn-quick-match').disabled = true;

        const result = await mp.quickMatch(playerName);
        $('btn-quick-match').textContent = '🔀 快速配對';
        $('btn-quick-match').disabled = false;

        if (result.success) {
            showWaitingRoom(result.roomCode);
        } else {
            alert(result.error || '配對失敗');
        }
    });

    // 加入房間
    $('btn-join-room').addEventListener('click', async () => {
        const code = $('room-code-input').value.trim();
        if (!code || code.length !== 4) {
            alert('請輸入 4 位數房間碼');
            return;
        }
        if (!initFirebase()) {
            alert('Firebase 連線失敗');
            return;
        }
        mp = new MultiplayerManager('rhythm');
        mp.init();

        const result = await mp.joinRoom(code, playerName);
        if (result.success) {
            showWaitingRoom(code);
        } else {
            alert(result.error);
            mp = null;
        }
    });

    // 等待室邏輯
    function showWaitingRoom(roomCode) {
        showScreen('waiting');
        $('display-room-code').textContent = roomCode;

        // 設定自己的 slot
        if (mp.isHost) {
            $('slot-host-name').textContent = playerName;
            $('slot-host').querySelector('.slot-avatar').textContent = '🎵';
            $('slot-guest-name').textContent = '等待對手...';
            $('slot-guest').querySelector('.slot-avatar').textContent = '❓';
        } else {
            // 取得房主名稱會由 opponentJoined 處理
            $('slot-guest-name').textContent = playerName;
            $('slot-guest').querySelector('.slot-avatar').textContent = '🎵';
        }

        $('btn-ready').style.display = 'none';
        $('btn-start-battle').style.display = 'none';
        $('waiting-message').textContent = '等待對手加入...';

        // 設定事件監聽
        setupBattleListeners();
    }

    function setupBattleListeners() {
        if (!mp) return;

        mp.on('opponentJoined', opp => {
            if (mp.isHost) {
                $('slot-guest-name').textContent = opp.name;
                $('slot-guest').querySelector('.slot-avatar').textContent = '🎶';
            } else {
                $('slot-host-name').textContent = opp.name;
                $('slot-host').querySelector('.slot-avatar').textContent = '🎶';
            }
            $('waiting-message').textContent = '對手已加入！';
            $('btn-ready').style.display = '';
        });

        mp.on('opponentUpdate', opp => {
            const isHostSlot = mp.isHost ? 'guest' : 'host';
            const statusEl = $(`slot-${isHostSlot}-status`);
            const slotEl = $(`slot-${isHostSlot}`);

            if (opp.ready) {
                statusEl.textContent = '✅ 已準備';
                slotEl.classList.add('ready');
            } else {
                statusEl.textContent = '';
                slotEl.classList.remove('ready');
            }
        });

        mp.on('allReady', () => {
            if (mp.isHost) {
                $('btn-start-battle').style.display = '';
                $('waiting-message').textContent = '雙方已準備，可以開始！';
            } else {
                $('waiting-message').textContent = '等待房主開始...';
            }
        });

        mp.on('countdown', () => {
            $('waiting-message').textContent = '即將開始！';
        });

        mp.on('sharedData', data => {
            if (data.beatmapSeed !== undefined) {
                sharedBeatmapSeed = data.beatmapSeed;
            }
        });

        mp.on('gameStart', () => {
            isBattleMode = true;
            startBattleGame();
        });

        mp.on('opponentState', state => {
            // 更新對手狀態條
            if (state.score !== undefined) {
                $('opp-score').textContent = state.score.toLocaleString();
            }
            if (state.combo > 1) {
                $('opp-combo').textContent = `🔥 x${state.combo}`;
            } else {
                $('opp-combo').textContent = '';
            }
        });

        mp.on('opponentFinished', results => {
            opponentFinalResults = results;
        });

        mp.on('gameEnd', () => {
            // 雙方都結束，顯示對比結果
            // (showResults 時會自動處理)
        });
    }

    // 準備按鈕
    $('btn-ready').addEventListener('click', async () => {
        if (!mp) return;
        await mp.setReady(true);
        $('btn-ready').textContent = '✅ 已準備';
        $('btn-ready').disabled = true;

        const mySlot = mp.isHost ? 'host' : 'guest';
        $(`slot-${mySlot}-status`).textContent = '✅ 已準備';
        $(`slot-${mySlot}`).classList.add('ready');
    });

    // 房主開始對戰
    $('btn-start-battle').addEventListener('click', async () => {
        if (!mp || !mp.isHost) return;
        // 生成共用 beatmap seed
        const seed = Math.floor(Math.random() * 1000000);
        await mp.startGame({ beatmapSeed: seed });
    });

    // 離開房間
    $('btn-leave-room').addEventListener('click', async () => {
        if (mp) {
            await mp.leaveRoom();
            mp = null;
        }
        isBattleMode = false;
        showScreen('lobby');
    });

    // =========================================
    // 遊戲流程
    // =========================================

    async function startGame() {
        if (!CONFIG._loaded) await CONFIG.loadRemoteConfig();
        showScreen('game');
        $('hud-player').textContent = playerName;
        $('hud-score').textContent = '0';
        $('hud-combo').className = 'hidden';
        $('opponent-bar').style.display = 'none';

        game.resize();

        countdown(3, () => {
            const beatmap = CONFIG.generateBeatmap();
            setupGameCallbacks(beatmap);
            game.start(beatmap);
        });
    }

    function startBattleGame() {
        showScreen('game');
        $('hud-player').textContent = playerName;
        $('hud-score').textContent = '0';
        $('hud-combo').className = 'hidden';

        // 顯示對手狀態條
        $('opponent-bar').style.display = '';
        $('opp-name').textContent = mp.opponent ? mp.opponent.name : '對手';
        $('opp-score').textContent = '0';
        $('opp-combo').textContent = '';

        opponentFinalResults = null;
        game.resize();

        // 使用共用 seed 生成相同 beatmap
        const beatmap = CONFIG.generateBeatmap(sharedBeatmapSeed);
        setupGameCallbacks(beatmap);

        // 開始定期同步分數
        startSyncLoop();

        game.start(beatmap);
    }

    function setupGameCallbacks() {
        game.onScoreChange = score => {
            $('hud-score').textContent = score.toLocaleString();
        };
        game.onComboChange = combo => {
            const el = $('hud-combo');
            if (combo > 1) {
                el.className = '';
                void el.offsetWidth;
                el.className = 'visible';
                $('combo-count').textContent = combo;
                if (combo % 10 === 0) spawnComboBurst(combo);
            } else {
                el.className = 'hidden';
            }
        };
        game.onGameEnd = results => {
            stopSyncLoop();

            if (isBattleMode && mp) {
                // 同步最終結果
                mp.endGame(results);
                // 等一下讓對手結果到達
                setTimeout(() => showResults(results), 1000);
            } else {
                setTimeout(() => showResults(results), 500);
            }
        };
    }

    function startSyncLoop() {
        stopSyncLoop();
        if (!mp) return;
        syncInterval = setInterval(() => {
            if (game.running && mp) {
                mp.syncState({
                    score: game.score,
                    combo: game.combo,
                    maxCombo: game.maxCombo,
                    stats: { ...game.stats },
                    progress: game.elapsed / CONFIG.gameDuration
                });
            }
        }, 200); // 每 200ms 同步一次
    }

    function stopSyncLoop() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
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
                overlay.offsetHeight;
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

    btnL.addEventListener('touchstart', e => { e.preventDefault(); btnL.classList.add('pressing'); game.pressDown('L'); });
    btnL.addEventListener('touchend', e => { e.preventDefault(); btnL.classList.remove('pressing'); game.pressUp('L'); });
    btnR.addEventListener('touchstart', e => { e.preventDefault(); btnR.classList.add('pressing'); game.pressDown('R'); });
    btnR.addEventListener('touchend', e => { e.preventDefault(); btnR.classList.remove('pressing'); game.pressUp('R'); });

    btnL.addEventListener('mousedown', e => { e.preventDefault(); btnL.classList.add('pressing'); game.pressDown('L'); });
    btnL.addEventListener('mouseup', e => { e.preventDefault(); btnL.classList.remove('pressing'); game.pressUp('L'); });
    btnL.addEventListener('mouseleave', () => { btnL.classList.remove('pressing'); game.pressUp('L'); });
    btnR.addEventListener('mousedown', e => { e.preventDefault(); btnR.classList.add('pressing'); game.pressDown('R'); });
    btnR.addEventListener('mouseup', e => { e.preventDefault(); btnR.classList.remove('pressing'); game.pressUp('R'); });
    btnR.addEventListener('mouseleave', () => { btnR.classList.remove('pressing'); game.pressUp('R'); });

    const keyMap = { d: 'L', arrowleft: 'L', k: 'R', arrowright: 'R', f: 'L', j: 'R' };
    const keyState = {};
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const lane = keyMap[e.key.toLowerCase()];
        if (lane && !keyState[e.key]) {
            keyState[e.key] = true;
            game.pressDown(lane);
            (lane === 'L' ? btnL : btnR).classList.add('pressing');
        }
    });
    document.addEventListener('keyup', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const lane = keyMap[e.key.toLowerCase()];
        if (lane) {
            keyState[e.key] = false;
            game.pressUp(lane);
            (lane === 'L' ? btnL : btnR).classList.remove('pressing');
        }
    });

    window.addEventListener('resize', () => {
        if (game.running) game.resize();
    });

    // =========================================
    // 結算畫面
    // =========================================

    function showResults(results) {
        showScreen('result');
        $('result-score').textContent = results.score.toLocaleString();
        $('result-max-combo').textContent = results.maxCombo;
        $('result-perfect').textContent = results.stats.perfect;
        $('result-good').textContent = results.stats.good;
        $('result-miss').textContent = results.stats.miss;

        if (isBattleMode && opponentFinalResults) {
            // 對戰結果
            $('battle-result-compare').style.display = '';
            $('result-stats').style.display = 'none';
            $('secret-message-area').classList.add('hidden');

            const opp = opponentFinalResults;
            $('compare-opp-name').textContent = mp ? (mp.opponent ? mp.opponent.name : '對手') : '對手';
            $('compare-my-score').textContent = results.score.toLocaleString();
            $('compare-opp-score').textContent = (opp.score || 0).toLocaleString();
            $('compare-my-combo').textContent = results.maxCombo;
            $('compare-opp-combo').textContent = opp.maxCombo || 0;
            $('compare-my-perfect').textContent = results.stats.perfect;
            $('compare-opp-perfect').textContent = opp.stats ? opp.stats.perfect : 0;

            // 標記勝負
            const myScore = results.score;
            const oppScore = opp.score || 0;
            $('compare-my-score').className = 'compare-value ' + (myScore >= oppScore ? 'winner' : 'loser');
            $('compare-opp-score').className = 'compare-value ' + (oppScore >= myScore ? 'winner' : 'loser');

            if (myScore > oppScore) {
                $('result-title').textContent = '🏆 你贏了！';
                $('result-title').style.color = '#ffcc00';
            } else if (myScore < oppScore) {
                $('result-title').textContent = '😢 你輸了';
                $('result-title').style.color = '#ff6ec7';
            } else {
                $('result-title').textContent = '🤝 平手！';
                $('result-title').style.color = '#00d4ff';
            }
        } else if (isBattleMode) {
            // 對手還沒結束
            $('battle-result-compare').style.display = 'none';
            $('result-stats').style.display = '';
            $('result-title').textContent = '⏳ 等待對手結束...';
            $('result-title').style.color = '#aaa';
            $('secret-message-area').classList.add('hidden');

            // 等待對手結果
            if (mp) {
                mp.on('opponentFinished', oppResults => {
                    opponentFinalResults = oppResults;
                    showResults(results);
                });
            }
        } else {
            // 單人模式
            $('battle-result-compare').style.display = 'none';
            $('result-stats').style.display = '';

            if (results.passed) {
                $('result-title').textContent = '🎉 挑戰成功！';
                $('result-title').style.color = '#ffcc00';
                showSecretMessages(playerName);
            } else {
                $('result-title').textContent = '挑戰結束';
                $('result-title').style.color = '#aaa';
                $('secret-message-area').classList.add('hidden');
            }
            submitScore(playerName, results.score);
        }
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

    $('btn-retry').addEventListener('click', async () => {
        game.stop();
        if (isBattleMode && mp) {
            // 對戰模式重玩 → 回等待室
            await mp.setReady(false);
            $('btn-ready').textContent = '✅ 準備';
            $('btn-ready').disabled = false;
            $('btn-start-battle').style.display = 'none';
            const mySlot = mp.isHost ? 'host' : 'guest';
            $(`slot-${mySlot}-status`).textContent = '';
            $(`slot-${mySlot}`).classList.remove('ready');
            showScreen('waiting');
        } else {
            startGame();
        }
    });

    $('btn-home').addEventListener('click', async () => {
        game.stop();
        stopSyncLoop();
        if (mp) {
            await mp.leaveRoom();
            mp = null;
        }
        isBattleMode = false;
        showScreen('start');
    });

    // --- Leaderboard ---
    function getLocalScores() {
        try { return JSON.parse(localStorage.getItem('oc_scores') || '[]'); }
        catch { return []; }
    }
    function saveLocalScore(name, score) {
        const scores = getLocalScores();
        const existing = scores.find(s => s.name === name);
        if (existing) {
            if (score > existing.score) {
                existing.score = score;
                existing.date = new Date().toISOString().slice(0, 10);
            }
        } else {
            scores.push({ name, score, date: new Date().toISOString().slice(0, 10) });
        }
        scores.sort((a, b) => b.score - a.score);
        localStorage.setItem('oc_scores', JSON.stringify(scores.slice(0, 10)));
    }

    async function submitScore(name, score) {
        saveLocalScore(name, score);
        const url = CONFIG.apiUrl;
        if (!url) return;
        try {
            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'addScore', game: 'rhythm', name, score }),
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
                const res = await fetch(`${url}?action=getScores&game=rhythm`);
                const data = await res.json();
                if (Array.isArray(data)) scores = data;
            } catch (e) {
                console.warn('Failed to load remote scores, using local:', e);
            }
        }

        const localScores = getLocalScores();
        const byName = new Map();
        for (const s of [...scores, ...localScores]) {
            const prev = byName.get(s.name);
            if (!prev || s.score > prev.score) {
                byName.set(s.name, s);
            }
        }
        const merged = [...byName.values()];
        merged.sort((a, b) => b.score - a.score);
        const top = merged.slice(0, 10);

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
    $('btn-admin-save').addEventListener('click', async () => {
        const secret = $('admin-secret').value;
        const threshold = $('admin-threshold').value;

        localStorage.setItem('oc_secret', secret);
        localStorage.setItem('oc_threshold', threshold);
        localStorage.setItem('oc_api_url', $('admin-api-url').value);

        $('admin-status').textContent = '儲存中...';
        try {
            await CONFIG.saveRemoteConfig('secretMessage', secret);
            await CONFIG.saveRemoteConfig('passThreshold', threshold);
            $('admin-status').textContent = '✅ 設定已儲存（本機 + 雲端）！';
        } catch (e) {
            $('admin-status').textContent = '⚠️ 本機已存，雲端同步失敗';
        }
        setTimeout(() => $('admin-status').textContent = '', 3000);
    });

    $('btn-admin-back').addEventListener('click', () => {
        window.location.hash = '';
        showScreen('start');
    });
})();
