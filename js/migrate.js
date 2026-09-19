/* ──────────────────────────────────────
   migrate.js  —  구버전(base64) 이미지 → IndexedDB 마이그레이션

   안전 원칙
   1) diary_entries(원본)는 모든 이미지가 IndexedDB 에 저장·검증된 뒤에야 한 번만 교체한다.
   2) 어느 단계든 실패하면 원본이 그대로 남고, 이번 실행에서 만든 IDB 레코드만 지운다.
   3) 커밋 직전 원본이 바뀌었는지(사용자 편집/다른 탭) 확인하고, 바뀌었으면 중단한다.
────────────────────────────────────── */

const MIGRATE_FLAG = 'diary_imagesMigrated';

const Migrate = {
  _promise: null,

  get running() { return this._promise !== null; },

  /* 로컬 entries 에 구버전 base64 이미지가 남아 있는지 (빠른 문자열 검사) */
  hasLegacy() {
    const raw = localStorage.getItem(EN_KEY);
    return !!raw && raw.includes('"data:image');
  },

  /* force=false: 플래그가 있으면 건너뜀(앱 시작 시).
     force=true : pull / JSON 가져오기 직후처럼 base64 가 다시 들어왔을 수 있을 때 항상 스캔 */
  async run({ force = false } = {}) {
    if (this._promise) await this._promise.catch(() => {});
    if (!force && localStorage.getItem(MIGRATE_FLAG) === '1') return { status: 'skipped' };

    this._promise = this._run().catch(err => {
      console.error('[migrate]', err);
      return { status: 'error', error: err };
    });
    try { return await this._promise; }
    finally { this._promise = null; }
  },

  /* entries 에서 구버전 이미지 블록 위치 수집 */
  _scan(entries) {
    const targets = [];
    entries.forEach((entry, e) => {
      if (!entry || !Array.isArray(entry.content)) return;
      entry.content.forEach((block, b) => {
        if (block && block.type === 'image' && typeof block.value === 'string'
            && block.value.startsWith('data:image')) {
          targets.push({ e, b, dataUrl: block.value, size: block.size || 'medium' });
        }
      });
    });
    return targets;
  },

  _setFlag() {
    try { localStorage.setItem(MIGRATE_FLAG, '1'); } catch { /* 용량 한도 → 다음 실행에 다시 스캔 (무해) */ }
  },

  async _run() {
    /* 1. 스캔 */
    const raw = localStorage.getItem(EN_KEY);
    if (!raw || !raw.includes('"data:image')) { this._setFlag(); return { status: 'none' }; }

    let entries;
    try { entries = JSON.parse(raw); } catch { return { status: 'error', reason: 'parse' }; }
    if (!Array.isArray(entries)) return { status: 'error', reason: 'shape' };

    const targets = this._scan(entries);
    if (!targets.length) { this._setFlag(); return { status: 'none' }; }

    /* 2. IndexedDB 준비 — 실패하면 아무것도 건드리지 않고 종료 */
    try { await ImageDB.openDB(); }
    catch {
      Toast.show('이미지 저장소를 열 수 없어 변환을 미뤘어요 (데이터는 그대로예요)', 'error');
      return { status: 'error', reason: 'idb' };
    }

    this._showProgress(0, targets.length);
    const created = [];        /* 이번 실행에서 만든 IDB id (롤백 대상) */
    let committed = false;

    try {
      /* 3. 변환 & IDB 저장 — localStorage 는 건드리지 않음 */
      const uniq = new Map();  /* dataUrl → { id, size }  (동일 이미지 중복 저장 방지) */
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        let rec = uniq.get(t.dataUrl);
        if (!rec) {
          const blob = ImageDB.dataUrlToBlob(t.dataUrl);
          if (!blob.size) throw new Error('빈 이미지');
          const id = await ImageDB.saveImage(blob);
          created.push(id);
          rec = { id, size: blob.size };
          uniq.set(t.dataUrl, rec);
        }
        t.id = rec.id;
        this._showProgress(i + 1, targets.length);
        if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));   /* UI 갱신 여유 */
      }

      /* 4. 검증 — 방금 저장한 모든 이미지를 다시 읽어 크기까지 대조 */
      for (const rec of uniq.values()) {
        const b = await ImageDB.getImage(rec.id);
        if (!b || !b.size || b.size !== rec.size) throw new Error('저장 검증 실패');
      }

      /* 5. 새 entries 를 메모리에서 조립 */
      for (const t of targets) {
        entries[t.e].content[t.b] = { type: 'image', imageId: t.id, size: t.size };
      }
      if (this._scan(entries).length) throw new Error('변환 누락');
      const next = JSON.stringify(entries);

      /* 6. 커밋 직전, 원본이 그동안 바뀌지 않았는지 확인 */
      if (localStorage.getItem(EN_KEY) !== raw) {
        /* 사용자 편집이 우선 — localStorage 는 그대로 두고 IDB 레코드만 정리. 다음 실행에서 재시도 */
        await ImageDB.deleteImages(created).catch(() => {});
        return { status: 'error', reason: 'changed' };
      }

      /* 7. 커밋 (setItem 은 원자적. 용량 초과 시 throw → catch 에서 롤백) */
      localStorage.setItem(EN_KEY, next);
      committed = true;

      /* 8. 커밋 후 검증 */
      const back = localStorage.getItem(EN_KEY);
      if (back !== next) throw new Error('커밋 검증 실패');
      const reparsed = JSON.parse(back);
      const okCount = reparsed.reduce((n, en) =>
        n + ((en.content || []).filter(bl => bl.type === 'image' && bl.imageId).length), 0);
      if (reparsed.length !== entries.length || okCount !== targets.length) {
        throw new Error('커밋 검증 실패');
      }

      this._setFlag();
      this._hideProgress();
      Toast.show(`이미지 ${uniq.size}개를 새 저장소로 옮겼어요`);
      return { status: 'migrated', count: uniq.size };

    } catch (err) {
      console.error('[migrate] 실패, 롤백', err);
      let restored = true;
      if (committed) {
        /* 커밋 후 검증에서 실패한 경우: 원본 문자열 복원 시도 */
        try { localStorage.setItem(EN_KEY, raw); } catch { restored = false; }
      }
      if (restored) {
        try { await ImageDB.deleteImages(created); } catch { /* 고아로 남으면 "저장공간 정리"가 회수 */ }
        Toast.show('이미지 변환에 실패해 원래 상태를 유지했어요', 'error');
      } else {
        /* 원본 복원까지 실패하면 새 데이터가 유효할 수 있으므로 IDB 이미지를 지우지 않음 */
        Toast.show('이미지 변환 중 문제가 생겼어요. 백업 파일을 확인해 주세요', 'error');
      }
      return { status: 'error', error: err };

    } finally {
      this._hideProgress();
    }
  },

  /* ── 진행 표시 ── */
  _showProgress(n, total) {
    const ov = document.getElementById('migrate-overlay');
    if (!ov) return;
    ov.hidden = false;
    document.getElementById('migrate-text').textContent = `저장공간 정리 중... ${n}/${total}`;
    document.getElementById('migrate-bar-fill').style.width = `${total ? Math.round(n / total * 100) : 0}%`;
  },
  _hideProgress() {
    const ov = document.getElementById('migrate-overlay');
    if (ov) ov.hidden = true;
  },
};
