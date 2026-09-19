/* ──────────────────────────────────────
   sync.js  —  자동 동기화 + 토스트
────────────────────────────────────── */

const SYNC_URL  = 'https://reading-proxy.kdw12357.workers.dev/sync?key=diary';
const SECRET_LS = 'syncSecret';

/* ══════════════════════
   Toast
══════════════════════ */
const Toast = {
  show(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ` toast-${type}` : '');
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 280);
    }, 2800);
  },
};

/* ══════════════════════
   Sync
══════════════════════ */
const Sync = {
  _isPulling: false,

  getSecret() { return localStorage.getItem(SECRET_LS) || ''; },
  setSecret(v) { localStorage.setItem(SECRET_LS, v); },

  /* 앱 시작 시 호출 */
  init() {
    if (!this.getSecret()) { this._status('no-key'); return; }
    this.pull();
  },

  /* GET: 서버 → 로컬 */
  async pull() {
    const secret = this.getSecret();
    if (!secret) { this._status('no-key'); return; }

    this._status('syncing');
    this._isPulling = true;
    try {
      const res = await fetch(SYNC_URL, {
        headers: { 'X-Sync-Secret': secret },
      });

      if (res.status === 401) {
        this._status('no-key');
        Toast.show('비밀 키를 확인해 주세요', 'error');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data  = await res.json();
      const diary = data.diary;

      if (diary && typeof diary === 'object' && !Array.isArray(diary)) {
        Storage.importAll({
          notebooks: Array.isArray(diary.notebooks) ? diary.notebooks : [],
          entries:   Array.isArray(diary.entries)   ? diary.entries   : [],
        });
        /* 서버에 구버전(base64) 데이터가 있었다면 다시 IndexedDB 로 변환 */
        await Migrate.run({ force: true });
        App.refresh();
      }

      this._status('success');
      if (data.updatedAt) {
        const at = new Date(data.updatedAt).toLocaleString('ko-KR', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        Toast.show(`동기화됨 · ${at}`);
      }
    } catch {
      this._status(navigator.onLine ? 'error' : 'offline');
      if (navigator.onLine) Toast.show('동기화 실패', 'error');
    } finally {
      this._isPulling = false;
    }
  },

  /* POST: 로컬 → 서버 */
  async push() {
    if (this._isPulling) return;           /* pull 중 재진입 방지 */
    const secret = this.getSecret();
    if (!secret) return;
    /* 이미지 변환 중이거나 base64 가 남아 있으면 전송하지 않음 (변환 완료 후 다음 저장 때 전송) */
    if (Migrate.running || Migrate.hasLegacy()) return;

    this._status('syncing');
    try {
      const res = await fetch(SYNC_URL, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Secret': secret,
        },
        body: JSON.stringify({
          diary: {
            notebooks: Storage.getNotebooks(),
            entries:   Storage.getEntries(),   /* 이미지 블록은 imageId 만 포함 */
          },
        }),
      });

      if (res.status === 401) { this._status('no-key'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._status('success');
    } catch {
      this._status(navigator.onLine ? 'error' : 'offline');
      if (navigator.onLine) Toast.show('동기화 실패', 'error');
    }
  },

  _status(s) {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    el.className = `sync-indicator ${s}`;
    const labels = {
      syncing:  '동기화 중...',
      success:  '동기화됨',
      error:    '동기화 실패',
      offline:  '오프라인',
      'no-key': '비밀 키 미설정',
    };
    el.title = labels[s] || '';
  },
};
