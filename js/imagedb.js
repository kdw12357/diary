/* ──────────────────────────────────────
   imagedb.js  —  IndexedDB 이미지 저장소 + 표시 헬퍼
   DB "diary-images" / store "images" (keyPath "id")
   레코드: { id, blob, createdAt }
────────────────────────────────────── */

const ImageDB = {
  DB_NAME: 'diary-images',
  STORE:   'images',
  _dbPromise: null,

  /* DB 열기 (없으면 생성). 실패하면 다음 호출에서 재시도할 수 있도록 캐시를 비운다 */
  openDB() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB 미지원')); return; }
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); this._dbPromise = null; };
        resolve(db);
      };
      req.onerror   = () => reject(req.error || new Error('IndexedDB 열기 실패'));
      req.onblocked = () => reject(new Error('IndexedDB가 다른 탭에서 사용 중'));
    }).catch(err => { this._dbPromise = null; throw err; });
    return this._dbPromise;
  },

  /* 트랜잭션 헬퍼: fn(store) 이 반환한 IDBRequest 의 결과를, 트랜잭션 완료 후 resolve */
  async _run(mode, fn) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, mode);
      let result;
      const req = fn(tx.objectStore(this.STORE));
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror    = () => reject(tx.error || (req && req.error));
      tx.onabort    = () => reject(tx.error || new Error('트랜잭션 중단'));
    });
  },

  newId() {
    return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  },

  async saveImage(blob) {
    const id = this.newId();
    await this._run('readwrite', s => s.put({ id, blob, createdAt: new Date().toISOString() }));
    return id;
  },

  /* 복원용: id 를 지정해서 저장 */
  async putRecord(rec) {
    await this._run('readwrite', s => s.put(rec));
  },

  async getImage(id) {
    const rec = await this._run('readonly', s => s.get(id));
    return rec && rec.blob ? rec.blob : null;
  },

  async hasImage(id) {
    const key = await this._run('readonly', s => s.getKey(id));
    return key !== undefined;
  },

  async deleteImage(id) {
    await this._run('readwrite', s => s.delete(id));
  },

  async deleteImages(ids) {
    if (!ids.length) return;
    await this._run('readwrite', s => { ids.forEach(id => s.delete(id)); });
  },

  async getAllImageIds() {
    return (await this._run('readonly', s => s.getAllKeys())) || [];
  },

  /* 백업 / 용량 계산용 (Blob 핸들만 들어 있어 내용은 메모리에 올라오지 않음) */
  async getAllRecords() {
    return (await this._run('readonly', s => s.getAll())) || [];
  },

  /* ── 변환 유틸 ── */
  dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('잘못된 dataURL');
    const meta = dataUrl.slice(5, comma);
    const mime = meta.split(';')[0] || 'application/octet-stream';
    const body = dataUrl.slice(comma + 1);
    if (/;base64$/i.test(meta)) {
      const bin = atob(body);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    }
    return new Blob([decodeURIComponent(body)], { type: mime });
  },

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  },
};

/* ══════════════════════
   ObjectURL 수명 관리
   scope 별로 만든 URL 을 모아두었다가 reset(scope) 시 한꺼번에 revoke.
   reset 이후에 도착한 비동기 결과는 폐기(세대 번호 비교)해서 누수를 막는다.
══════════════════════ */
const ImageURL = {
  _urls: {},
  _gen:  {},

  reset(scope) {
    (this._urls[scope] || []).forEach(u => URL.revokeObjectURL(u));
    this._urls[scope] = [];
    this._gen[scope]  = (this._gen[scope] || 0) + 1;
  },

  async resolve(scope, imageId) {
    const gen = this._gen[scope] || 0;
    let blob = null;
    try { blob = await ImageDB.getImage(imageId); } catch { /* DB 오류 → 없음 처리 */ }
    if (!blob) return null;
    if ((this._gen[scope] || 0) !== gen) return null;
    const url = URL.createObjectURL(blob);
    (this._urls[scope] = this._urls[scope] || []).push(url);
    return url;
  },
};

/* ══════════════════════
   이미지 블록 표시
   mountImage(block, scope, { width, cls, onMissing }) → <img> (동기 반환, src 는 비동기로 채움)
   호출자가 반환된 img 를 DOM 에 붙인 뒤 이미지가 없으면 "이미지 없음" 플레이스홀더로 교체
   (onMissing:'remove' 이면 그냥 제거 — 썸네일용)
══════════════════════ */
function mountImage(block, scope, opts = {}) {
  const img = document.createElement('img');
  if (opts.cls)   img.className = opts.cls;
  if (opts.width) img.style.width = opts.width;
  img.alt = '';
  if (opts.lazy)  img.loading = 'lazy';

  /* 마이그레이션 전/실패 상태의 구버전 블록 */
  if (block.value && String(block.value).startsWith('data:image')) {
    img.src = block.value;
    return img;
  }

  const missing = () => {
    if (opts.onMissing === 'remove') { img.remove(); return; }
    const ph = document.createElement('div');
    ph.className = 'img-missing';
    if (opts.width) ph.style.width = opts.width;
    ph.textContent = '🖼️ 이미지 없음';
    img.replaceWith(ph);
  };

  if (!block.imageId) { Promise.resolve().then(missing); return img; }

  ImageURL.resolve(scope, block.imageId).then(url => {
    if (url) img.src = url;
    else if (img.isConnected) missing();
  });
  return img;
}
