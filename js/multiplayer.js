// ============================================
// 共用多人對戰模組 (Firebase Realtime Database)
// 適用於：節奏遊戲、小精靈、廚神大挑戰
// ============================================

class MultiplayerManager {
  constructor(gameType) {
    this.gameType = gameType; // "rhythm" | "pacman" | "chef"
    this.db = null;
    this.roomId = null;
    this.playerId = this._generateId();
    this.playerName = '';
    this.isHost = false;
    this.opponent = null;
    this.roomRef = null;
    this._listeners = [];
    this._disconnectRef = null;
    this._callbacks = {};
  }

  // === 初始化 Firebase ===
  init() {
    if (!window.firebase || !firebase.database) {
      console.error('Firebase SDK not loaded');
      return false;
    }
    this.db = firebase.database();
    return true;
  }

  // === 房間操作 ===

  // 建立房間
  async createRoom(playerName, config = {}) {
    if (!this.db) return null;
    this.playerName = playerName;
    this.isHost = true;

    // 產生 4 位數房間碼
    const code = this._generateRoomCode();
    this.roomId = code;
    this.roomRef = this.db.ref(`rooms/${code}`);

    await this.roomRef.set({
      game: this.gameType,
      status: 'waiting',
      config,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      hostId: this.playerId,
      players: {
        [this.playerId]: {
          name: playerName,
          ready: false,
          score: 0,
          connected: true,
          joinedAt: firebase.database.ServerValue.TIMESTAMP
        }
      }
    });

    // 斷線自動清理
    this._setupDisconnect();
    // 開始監聽
    this._watchRoom();

    return code;
  }

  // 加入房間
  async joinRoom(roomCode, playerName) {
    if (!this.db) return { success: false, error: '未連線' };
    this.playerName = playerName;
    this.isHost = false;
    this.roomId = roomCode;
    this.roomRef = this.db.ref(`rooms/${roomCode}`);

    // 檢查房間是否存在
    const snapshot = await this.roomRef.once('value');
    const room = snapshot.val();

    if (!room) return { success: false, error: '找不到房間' };
    if (room.status !== 'waiting') return { success: false, error: '遊戲已開始' };
    if (room.game !== this.gameType) return { success: false, error: '遊戲類型不符' };

    const playerCount = Object.keys(room.players || {}).length;
    if (playerCount >= 2) return { success: false, error: '房間已滿' };

    // 加入房間
    await this.roomRef.child(`players/${this.playerId}`).set({
      name: playerName,
      ready: false,
      score: 0,
      connected: true,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    this._setupDisconnect();
    this._watchRoom();

    return { success: true, config: room.config };
  }

  // 快速配對
  async quickMatch(playerName, config = {}) {
    if (!this.db) return { success: false, error: '未連線' };
    this.playerName = playerName;

    // 尋找等待中的房間
    const roomsRef = this.db.ref('rooms');
    const snapshot = await roomsRef
      .orderByChild('status')
      .equalTo('waiting')
      .limitToFirst(10)
      .once('value');

    const rooms = snapshot.val();
    if (rooms) {
      for (const [code, room] of Object.entries(rooms)) {
        if (room.game !== this.gameType) continue;
        const playerCount = Object.keys(room.players || {}).length;
        if (playerCount === 1) {
          // 找到可加入的房間
          const result = await this.joinRoom(code, playerName);
          if (result.success) return { success: true, roomCode: code, mode: 'joined' };
        }
      }
    }

    // 沒有可用房間，自己建立
    const code = await this.createRoom(playerName, config);
    return { success: true, roomCode: code, mode: 'created' };
  }

  // === 玩家狀態 ===

  // 設定準備狀態
  async setReady(ready = true) {
    if (!this.roomRef) return;
    await this.roomRef.child(`players/${this.playerId}/ready`).set(ready);
  }

  // 同步遊戲狀態（分數、combo 等）
  syncState(state) {
    if (!this.roomRef) return;
    this.roomRef.child(`players/${this.playerId}/state`).set(state);
  }

  // 更新分數
  syncScore(score) {
    if (!this.roomRef) return;
    this.roomRef.child(`players/${this.playerId}/score`).set(score);
  }

  // === 房間控制（房主） ===

  // 房主開始遊戲
  async startGame(sharedData = {}) {
    if (!this.isHost || !this.roomRef) return;
    await this.roomRef.update({
      status: 'countdown',
      startedAt: firebase.database.ServerValue.TIMESTAMP,
      sharedData
    });

    // 3 秒後正式開始
    setTimeout(() => {
      if (this.roomRef) {
        this.roomRef.child('status').set('playing');
      }
    }, 3500);
  }

  // 結束遊戲
  async endGame(results) {
    if (!this.roomRef) return;
    await this.roomRef.child(`players/${this.playerId}/finalResults`).set(results);
    // 檢查雙方都結束了
    const snap = await this.roomRef.child('players').once('value');
    const players = snap.val();
    const allDone = Object.values(players).every(p => p.finalResults);
    if (allDone) {
      await this.roomRef.child('status').set('ended');
    }
  }

  // === 監聽事件 ===

  on(event, callback) {
    this._callbacks[event] = callback;
  }

  _emit(event, data) {
    if (this._callbacks[event]) this._callbacks[event](data);
  }

  _watchRoom() {
    if (!this.roomRef) return;

    // 監聽玩家加入/離開
    const playersRef = this.roomRef.child('players');
    const playerListener = playersRef.on('value', snapshot => {
      const players = snapshot.val();
      if (!players) return;

      const entries = Object.entries(players);
      const opponentEntry = entries.find(([id]) => id !== this.playerId);

      if (opponentEntry) {
        const [oppId, oppData] = opponentEntry;
        const isNew = !this.opponent;
        this.opponent = { id: oppId, ...oppData };

        if (isNew) {
          this._emit('opponentJoined', this.opponent);
        }

        this._emit('opponentUpdate', this.opponent);

        // 對手的即時遊戲狀態
        if (oppData.state) {
          this._emit('opponentState', oppData.state);
        }

        // 對手已結束
        if (oppData.finalResults) {
          this._emit('opponentFinished', oppData.finalResults);
        }
      }

      // 檢查全員就緒
      const allReady = entries.length >= 2 && entries.every(([, p]) => p.ready);
      if (allReady) {
        this._emit('allReady', true);
      }
    });
    this._listeners.push({ ref: playersRef, event: 'value', listener: playerListener });

    // 監聽房間狀態
    const statusRef = this.roomRef.child('status');
    const statusListener = statusRef.on('value', snapshot => {
      const status = snapshot.val();
      this._emit('statusChange', status);

      if (status === 'countdown') {
        this._emit('countdown', true);
      }
      if (status === 'playing') {
        this._emit('gameStart', true);
      }
      if (status === 'ended') {
        this._emit('gameEnd', true);
      }
    });
    this._listeners.push({ ref: statusRef, event: 'value', listener: statusListener });

    // 監聽共享資料（如 beatmap seed）
    const sharedRef = this.roomRef.child('sharedData');
    const sharedListener = sharedRef.on('value', snapshot => {
      const data = snapshot.val();
      if (data) this._emit('sharedData', data);
    });
    this._listeners.push({ ref: sharedRef, event: 'value', listener: sharedListener });
  }

  // === 離開房間 ===

  async leaveRoom() {
    // 移除所有監聽器
    for (const { ref, event, listener } of this._listeners) {
      ref.off(event, listener);
    }
    this._listeners = [];

    if (this.roomRef && this.playerId) {
      await this.roomRef.child(`players/${this.playerId}`).remove();

      // 如果房間沒人了，刪除房間
      const snap = await this.roomRef.child('players').once('value');
      if (!snap.exists() || Object.keys(snap.val() || {}).length === 0) {
        await this.roomRef.remove();
      }
    }

    this.roomId = null;
    this.roomRef = null;
    this.opponent = null;
    this.isHost = false;
    this._callbacks = {};
  }

  // === 工具方法 ===

  _generateId() {
    return 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  _generateRoomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  _setupDisconnect() {
    if (!this.roomRef) return;
    const playerRef = this.roomRef.child(`players/${this.playerId}`);
    playerRef.child('connected').onDisconnect().set(false);
  }

  // 取得房間狀態摘要
  async getRoomInfo() {
    if (!this.roomRef) return null;
    const snap = await this.roomRef.once('value');
    return snap.val();
  }

  // 靜態方法：清理過期房間（超過 1 小時）
  static async cleanupOldRooms(db) {
    const cutoff = Date.now() - 3600000;
    const snap = await db.ref('rooms').orderByChild('createdAt').endAt(cutoff).once('value');
    const updates = {};
    snap.forEach(child => {
      updates[`rooms/${child.key}`] = null;
    });
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }
  }
}
