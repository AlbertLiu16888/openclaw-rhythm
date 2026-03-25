// === Game Configuration ===
const CONFIG = {
    // 管理設定（可透過 #admin 後台調整）
    get secretMessage() {
        return localStorage.getItem('oc_secret') || 'openthedoor';
    },
    get passThreshold() {
        return parseInt(localStorage.getItem('oc_threshold')) || 3000;
    },
    get apiUrl() {
        return localStorage.getItem('oc_api_url') || 'https://script.google.com/macros/s/AKfycbwHvZvRb3ivgQJWKL6jHlwVfohgKvo9g9j_yLn-kwe7yFeacwyNw3PcVpvyzQMfkl2s/exec';
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
        perfect: 60,   // ±60ms
        good: 120,     // ±120ms
    },

    // 長按判定
    longPress: {
        minDuration: 300,  // 至少按住 300ms 才算長按
    },

    // 連打判定
    rapid: {
        requiredTaps: 4,      // 需要按 4 次
        windowMs: 800,        // 在 800ms 內完成
    },

    // 遊戲時間（ms）
    gameDuration: 60000,

    // 音符下落速度 (px/s) - 會根據螢幕高度動態調整
    noteSpeed: 400,

    // 音符生成：預設曲譜（時間點 ms, 軌道 'L'/'R', 類型 'tap'/'long'/'rapid'）
    generateBeatmap() {
        const map = [];
        const duration = this.gameDuration;
        let t = 2000; // 開始於 2 秒

        // 生成節奏型態：交替、同步、密集段
        const patterns = [
            // 基礎單點交替
            () => {
                for (let i = 0; i < 8; i++) {
                    map.push({ time: t, lane: i % 2 === 0 ? 'L' : 'R', type: 'tap' });
                    t += 500;
                }
            },
            // 同側連續
            () => {
                const lane = Math.random() > 0.5 ? 'L' : 'R';
                for (let i = 0; i < 4; i++) {
                    map.push({ time: t, lane, type: 'tap' });
                    t += 350;
                }
                t += 300;
            },
            // 長按
            () => {
                map.push({ time: t, lane: 'L', type: 'long', holdDuration: 600 });
                t += 800;
                map.push({ time: t, lane: 'R', type: 'long', holdDuration: 800 });
                t += 1000;
            },
            // 連打
            () => {
                map.push({ time: t, lane: Math.random() > 0.5 ? 'L' : 'R', type: 'rapid' });
                t += 1500;
            },
            // 快速交替
            () => {
                for (let i = 0; i < 6; i++) {
                    map.push({ time: t, lane: i % 2 === 0 ? 'L' : 'R', type: 'tap' });
                    t += 300;
                }
                t += 200;
            },
            // 密集混合
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
            t += Math.random() * 300 + 200; // 間隔
        }

        // 依時間排序
        map.sort((a, b) => a.time - b.time);
        return map;
    }
};
