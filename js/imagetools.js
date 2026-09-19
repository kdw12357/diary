/* ──────────────────────────────────────
   imagetools.js  —  이미지 백업/복원, 저장공간 정리, 사용량 표시
────────────────────────────────────── */

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

const ImageTools = {
  /* ── 백업 / 복원 모달 ── */
  openModal() {
    document.getElementById('image-backup-modal').hidden = false;
  },
  closeModal() {
    document.getElementById('image-backup-modal').hidden = true;
  },

  /* ── 백업: 모든 이미지를 JSON 한 파일로 (ZIP 없음) ──
     Blob 은 JSON 에 넣을 수 없어 파일 안에서만 dataURL 로 변환.
     문자열을 조각(parts)으로 모아 Blob 으로 합쳐 메모리 사용을 줄인다. */
  async backup() {
    let records;
    try { records = await ImageDB.getAllRecords(); }
    catch { Toast.show('이미지 저장소를 열 수 없어요', 'error'); return; }
    if (!records.length) { Toast.show('백업할 이미지가 없어요'); return; }

    Toast.show(`이미지 ${records.length}개 백업 중...`);
    try {
      const parts = [`{"version":2,"kind":"diary-images","exportedAt":${JSON.stringify(new Date().toISOString())},"images":[`];
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const dataUrl = await ImageDB.blobToDataUrl(r.blob);
        parts.push((i ? ',' : '') + JSON.stringify({ id: r.id, dataUrl, createdAt: r.createdAt }));
      }
      parts.push(']}');

      const blob = new Blob(parts, { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `diary-images-${getTodayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      Toast.show(`이미지 ${records.length}개 백업 완료 (${fmtBytes(blob.size)})`);
    } catch (err) {
      console.error('[backup]', err);
      Toast.show('이미지 백업에 실패했어요', 'error');
    }
  },

  /* ── 복원: 이미 있는 id 는 건너뜀 (덮어쓰기 없음) ── */
  async restore(file) {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { Toast.show('올바른 이미지 백업 파일이 아니에요', 'error'); return; }
    if (!data || !Array.isArray(data.images)) {
      Toast.show('올바른 이미지 백업 파일이 아니에요', 'error');
      return;
    }

    let restored = 0, skipped = 0, failed = 0;
    try {
      for (const item of data.images) {
        if (!item || typeof item.id !== 'string' || typeof item.dataUrl !== 'string'
            || !item.dataUrl.startsWith('data:image')) { failed++; continue; }
        try {
          if (await ImageDB.hasImage(item.id)) { skipped++; continue; }
          const blob = ImageDB.dataUrlToBlob(item.dataUrl);
          await ImageDB.putRecord({ id: item.id, blob, createdAt: item.createdAt || new Date().toISOString() });
          restored++;
        } catch { failed++; }
      }
    } catch {
      Toast.show('이미지 복원에 실패했어요', 'error');
      return;
    }

    this.closeModal();
    Calendar.render();
    Notebooks.refresh();
    Toast.show(`${restored}개 복원, ${skipped}개 건너뜀` + (failed ? `, ${failed}개 실패` : ''),
               failed ? 'error' : '');
  },

  /* ── 저장공간 정리: 어느 일기에도 참조되지 않는 고아 이미지 삭제 ── */
  async _findOrphans() {
    const ids  = await ImageDB.getAllImageIds();
    const used = Storage.getReferencedImageIds();
    return ids.filter(id => !used.has(id));
  },

  async cleanup() {
    if (!document.getElementById('editor-modal').hidden) {
      Toast.show('일기 작성을 마친 뒤에 정리해 주세요');
      return;
    }
    let orphans;
    try { orphans = await this._findOrphans(); }
    catch { Toast.show('이미지 저장소를 열 수 없어요', 'error'); return; }
    if (!orphans.length) { Toast.show('정리할 이미지가 없어요 ✨'); return; }

    const orphanSet = new Set(orphans);
    const bytes = (await ImageDB.getAllRecords())
      .filter(r => orphanSet.has(r.id))
      .reduce((n, r) => n + (r.blob ? r.blob.size : 0), 0);

    Confirm.open(
      `어느 일기에도 쓰이지 않는 이미지 ${orphans.length}개(${fmtBytes(bytes)})를 삭제할까요?`,
      async () => {
        try {
          /* 확인을 누른 시점 기준으로 다시 계산 (그 사이 일기가 바뀌었을 수 있음) */
          const fresh = await this._findOrphans();
          await ImageDB.deleteImages(fresh);
          Toast.show(`이미지 ${fresh.length}개를 정리했어요`);
        } catch {
          Toast.show('정리에 실패했어요', 'error');
        }
      }
    );
  },

  /* ── 저장공간 표시 (☰ 메뉴 하단) ── */
  async updateUsage() {
    const el = document.getElementById('menu-usage');
    if (!el) return;

    let lsAll = 0, lsDiary = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const bytes = (k.length + (localStorage.getItem(k) || '').length) * 2;   /* UTF-16 */
      lsAll += bytes;
      if (k.startsWith('diary_')) lsDiary += bytes;
    }

    const lines = [`📦 localStorage ${fmtBytes(lsDiary)} (도메인 전체 ${fmtBytes(lsAll)} / 약 5MB)`];
    el.replaceChildren(...lines.map(t => Object.assign(document.createElement('div'), { textContent: t })));

    const add = t => el.appendChild(Object.assign(document.createElement('div'), { textContent: t }));

    try {
      const recs = await ImageDB.getAllRecords();
      const sum  = recs.reduce((n, r) => n + (r.blob ? r.blob.size : 0), 0);
      add(`🖼️ 이미지 ${recs.length}개 · ${fmtBytes(sum)}`);
    } catch { /* IndexedDB 사용 불가 → 표시 생략 */ }

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { usage, quota } = await navigator.storage.estimate();
        if (quota) add(`💾 브라우저 저장소 ${fmtBytes(usage || 0)} / ${fmtBytes(quota)}`);
      } catch { /* 무시 */ }
    }
  },
};
