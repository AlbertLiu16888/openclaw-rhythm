// === Game Configuration ===
// 優先讀取遠端 (Google Sheets Config)，fallback 到 localStorage
const CONFIG = {
    _remote: {},
    _loaded: false,

    // 遊戲識別碼（用於 API 分流）
    gameId: 'rhythm',

    get secretMessage() {
        return this._remote.secretMessage
            || localStorage.getItem('oc_secret')
            || 'openthedoor';
    },
    get passThreshold() {
        const remote = parseInt(this._remote.passThreshold);
        if (!isNaN(remote) && remote > 0) return remote;
        return parseInt(localStorage.getItem('oc_threshold')) || 3000;
    },
    get apiUrl() {
        return localStorage.getItem('oc_api_url') || 'https://script.google.com/macros/s/AKfycbwAhuS5A02qLzdvUIzgCabG0FhTJdxlLpQBmAcJzIOgO3GvzMBEzilIzeblsPCnzi-m/exec';
    },

    // 從 Google Sheets 載入遠端設定
    async loadRemoteConfig() {
        const url = this.apiUrl;
        if (!url) return;
        try {
            const res = await fetch(`${url}?action=getConfig&game=${this.gameId}`);
            const data = await res.json();
            if (data && typeof data === 'object' && !data.error) {
                this._remote = data;
                this._loaded = true;
                console.log('Remote config loaded:', data);
            }
        } catch (e) {
            console.warn('Failed to load remote config, using local:', e);
        }
    },

    // 儲存設定到遠端
    async saveRemoteConfig(key, value) {
        const url = this.apiUrl;
        if (!url) return;
        try {
            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'setConfig', game: this.gameId, key, value }),
            });
            this._remote[key] = value;
        } catch (e) {
            console.warn('Failed to save remote config:', e);
        }
    },

    // 分數設定
    score: {
        perfect: 100,
        good: 50,
        miss: 0,
    },

    // Combo 加分倍率
    comboBonus(combo) {
        if (combo >= 50) return 3.0;
        if (combo >= 30) return 2.5;
        if (combo >= 20) return 2.0;
        if (combo >= 10) return 1.5;
        return 1.0;
    },

    // 判定範圍 (ms)
    timing: {
        perfect: 60,
        good: 120,
    },

    // 長按判定
    longPress: {
        minDuration: 300,
    },

    // 連打判定
    rapid: {
        requiredTaps: 4,
        windowMs: 800,
    },

    // 遊戲時間（ms）
    gameDuration: 60000,

    // 音符下落速度 (px/s)
    noteSpeed: 400,

    // 音符生成
    generateBeatmap() {
        const map = [];
        const duration = this.gameDuration;
        let t = 2000;

        const patterns = [
            () => {
                for (let i = 0; i < 8; i++) {
                    map.push({ time: t, lane: i % 2 === 0 ? 'L' : 'R', type: 'tap' });
                    t += 500;
                }
            },
            () => {
                const lane = Math.random() > 0.5 ? 'L' : 'R';
                for (let i = 0; i < 4; i++) {
                    map.push({ time: t, lane, type: 'tap' });
                    t += 350;
                }
                t += 300;
            },
            () => {
                map.push({ time: t, lane: 'L', type: 'long', holdDuration: 600 });
                t += 800;
                map.push({ time: t, lane: 'R', type: 'long', holdDuration: 800 });
                t += 1000;
            },
            () => {
                map.push({ time: t, lane: Math.random() > 0.5 ? 'L' : 'R', type: 'rapid' });
                t += 1500;
            },
            () => {
                for (let i = 0; i < 6; i++) {
                    map.push({ time: t, lane: i % 2 === 0 ? 'L' : 'R', type: 'tap' });
                    t += 300;
                }
                t += 200;
            },
            () => {
                map.push({ time: t, lane: 'L', type: 'tap' });
                map.push({ time: t, lane: 'R', type: 'tap' });
                t += 600;
                map.push({ time: t, lane: 'L', type: 'long', holdDuration: 500 });
                t += 700;
                map.push({ time: t, lane: 'R', type: 'tap' });
                t += 400;
            },
        ];

        while (t < duration - 3000) {
            const pattern = patterns[Math.floor(Math.random() * patterns.length)];
            pattern();
            t += Math.random() * 300 + 200;
        }

        map.sort((a, b) => a.time - b.time);
        return map;
    }
};
