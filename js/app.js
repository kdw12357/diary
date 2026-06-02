/* ──────────────────────────────────────
   app.js  —  앱 진입점, 전역 모달, 라우팅
────────────────────────────────────── */

/* ══════════════════════
   일기 상세 모달
══════════════════════ */
const EntryModal = {
  id: null,

  open(entryId) {
    const entry = Storage.getEntryById(entryId);
    if (!entry) return;
    this.id = entryId;

    const nb = Storage.getNotebookById(entry.notebookId);

    /* 배지 */
    const badge = document.getElementById('modal-nb-badge');
    badge.textContent = nb?.name || '알 수 없음';
    badge.style.background = nb?.color || '#E8D8C0';
    badge.style.setProperty('--nb-dot-color', nb?.color || '#ccc');

    document.getElementById('modal-entry-date').textContent = formatDateKo(entry.date);

    /* 블록 렌더 */
    const body = document.getElementById('entry-modal-body');
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'entry-content-blocks';
    entry.content.forEach(block => {
      const div = document.createElement('div');
      if (block.type === 'text') {
        div.className = 'entry-text-block';
        div.textContent = block.value;
      } else if (block.type === 'image') {
        div.className = 'entry-image-block';
        const img = document.createElement('img');
        img.src = block.value;
        img.loading = 'lazy';
        div.appendChild(img);
      }
      wrap.appendChild(div);
    });
    body.appendChild(wrap);

    document.getElementById('entry-modal').hidden = false;
  },

  close() {
    document.getElementById('entry-modal').hidden = true;
    this.id = null;
  },

  edit() {
    const id = this.id;
    this.close();
    Editor.open({ entryId: id });
  },

  delete() {
    Confirm.open('이 일기를 삭제할까요?', () => {
      Storage.deleteEntry(this.id);
      this.close();
      App.refresh();
    });
  },
};

/* ══════════════════════
   확인 다이얼로그
══════════════════════ */
const Confirm = {
  _cb: null,

  open(msg, cb) {
    document.getElementById('confirm-msg').textContent = msg;
    this._cb = cb;
    document.getElementById('confirm-modal').hidden = false;
  },

  close() {
    document.getElementById('confirm-modal').hidden = true;
    this._cb = null;
  },

  ok() {
    const cb = this._cb;
    this.close();
    if (cb) cb();
  },
};

/* ══════════════════════
   App
══════════════════════ */
const App = {
  tab: 'calendar',

  init() {
    /* 탭 */
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    /* 헤더 쓰기 버튼 */
    document.getElementById('btn-new-entry').addEventListener('click', () => Editor.open({}));

    /* ☰ 메뉴 */
    const menuBtn  = document.getElementById('btn-menu');
    const dropdown = document.getElementById('menu-dropdown');
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    });
    document.addEventListener('click', () => { dropdown.hidden = true; });

    document.getElementById('menu-export').addEventListener('click', () => this.exportJSON());
    document.getElementById('menu-import').addEventListener('click', () => {
      document.getElementById('import-file-input').click();
      dropdown.hidden = true;
    });
    document.getElementById('import-file-input').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) this.importJSON(f);
      e.target.value = '';
    });

    /* 날짜 팝업 닫기 */
    document.getElementById('date-popup-close').addEventListener('click', () => {
      document.getElementById('date-popup').hidden = true;
    });
    document.addEventListener('click', e => {
      const p = document.getElementById('date-popup');
      if (!p.hidden && !p.contains(e.target)) p.hidden = true;
    });

    /* 일기 상세 모달 */
    document.getElementById('entry-modal-close').addEventListener('click', () => EntryModal.close());
    document.getElementById('modal-edit-btn').addEventListener('click',   () => EntryModal.edit());
    document.getElementById('modal-delete-btn').addEventListener('click', () => EntryModal.delete());
    document.getElementById('entry-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('entry-modal')) EntryModal.close();
    });

    /* 에디터 모달 */
    document.getElementById('editor-modal-close').addEventListener('click', () => Editor.close());
    document.getElementById('editor-cancel').addEventListener('click',       () => Editor.close());
    document.getElementById('editor-save').addEventListener('click',         () => Editor.save());
    document.getElementById('btn-add-text-block').addEventListener('click',  () => Editor.addText());
    document.getElementById('btn-add-image-block').addEventListener('click', () => {
      document.getElementById('image-file-input').click();
    });
    document.getElementById('image-file-input').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) Editor.addImage(f);
      e.target.value = '';
    });
    document.getElementById('editor-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('editor-modal')) Editor.close();
    });

    /* 확인 모달 */
    document.getElementById('confirm-cancel').addEventListener('click', () => Confirm.close());
    document.getElementById('confirm-ok').addEventListener('click',     () => Confirm.ok());
    document.getElementById('confirm-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('confirm-modal')) Confirm.close();
    });

    /* ESC 키로 최상단 모달 닫기 */
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('confirm-modal').hidden)  { Confirm.close(); return; }
      if (!document.getElementById('editor-modal').hidden)   { Editor.close(); return; }
      if (!document.getElementById('entry-modal').hidden)    { EntryModal.close(); return; }
      if (!document.getElementById('nb-modal').hidden)       { Notebooks._closeModal(); return; }
      if (!document.getElementById('date-popup').hidden)     { document.getElementById('date-popup').hidden = true; }
    });

    /* 모듈 초기화 */
    Calendar.init();
    Notebooks.init();

    /* Service Worker 등록 */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  },

  switchTab(tab) {
    this.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-section').forEach(sec => {
      sec.classList.toggle('hidden', sec.id !== `tab-${tab}`);
    });
    if (tab === 'notebooks') Notebooks.renderList();
  },

  refresh() {
    Calendar.render();
    Notebooks.refresh();
  },

  refreshCalendar() {
    Calendar.render();
  },

  /* ── JSON 내보내기 ── */
  exportJSON() {
    document.getElementById('menu-dropdown').hidden = true;
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `diary-backup-${getTodayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /* ── JSON 가져오기 ── */
  importJSON(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        Confirm.open(
          '기존 데이터를 모두 덮어씁니다.\n계속할까요?',
          () => {
            Storage.importAll(data);
            this.refresh();
            alert('가져오기 완료!');
          }
        );
      } catch {
        alert('올바른 JSON 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  },
};

/* ── 시작 ── */
document.addEventListener('DOMContentLoaded', () => App.init());
