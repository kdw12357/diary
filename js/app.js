/* ──────────────────────────────────────
   app.js  —  앱 진입점, 전역 모달, 라우팅
────────────────────────────────────── */

/* 본문 텍스트에서 #태그를 강조 span으로 변환 (XSS 안전) */
function renderTextWithTags(text, onTagClick) {
  const frag = document.createDocumentFragment();
  const re = /#([가-힣a-zA-Z0-9_]+)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'tag-highlight';
    span.textContent = m[0];
    const tag = m[1];
    span.addEventListener('click', e => { e.stopPropagation(); onTagClick(tag); });
    frag.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

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
    badge.textContent = nb?.name || '미분류';
    badge.style.background = nb?.color || '#E0E0E0';
    badge.style.setProperty('--nb-dot-color', nb?.color || '#aaa');

    document.getElementById('modal-entry-date').textContent = formatDateKo(entry.date);

    /* 제목 */
    const titleEl = document.getElementById('modal-entry-title');
    titleEl.textContent = entry.title || '';
    titleEl.hidden = !entry.title;

    /* 태그 칩 */
    const tagsEl = document.getElementById('modal-entry-tags');
    const tags = entry.tags || [];
    tagsEl.innerHTML = '';
    if (tags.length > 0) {
      tags.forEach(tag => {
        const chip = document.createElement('button');
        chip.className = 'tag-chip';
        chip.textContent = '#' + tag;
        chip.addEventListener('click', () => {
          EntryModal.close();
          Search.openWithTag(tag);
        });
        tagsEl.appendChild(chip);
      });
      tagsEl.hidden = false;
    } else {
      tagsEl.hidden = true;
    }

    /* 블록 렌더 */
    const body = document.getElementById('entry-modal-body');
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'entry-content-blocks';
    entry.content.forEach(block => {
      const div = document.createElement('div');
      if (block.type === 'text') {
        div.className = 'entry-text-block';
        div.appendChild(renderTextWithTags(block.value, tag => {
          EntryModal.close();
          Search.openWithTag(tag);
        }));
      } else if (block.type === 'image') {
        div.className = 'entry-image-block';
        const img = document.createElement('img');
        img.src = block.value;
        img.loading = 'lazy';
        const sizeMap = { small: '33%', medium: '66%', large: '100%' };
        img.style.width = sizeMap[block.size || 'medium'];
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
   비밀 키 모달
══════════════════════ */
const SecretModal = {
  open() {
    document.getElementById('secret-input').value = Sync.getSecret();
    document.getElementById('secret-modal').hidden = false;
    setTimeout(() => document.getElementById('secret-input').focus(), 80);
  },
  close() {
    document.getElementById('secret-modal').hidden = true;
  },
  save() {
    const key = document.getElementById('secret-input').value.trim();
    Sync.setSecret(key);
    this.close();
    if (key) Sync.pull();
    else     Sync._status('no-key');
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

    /* 헤더 검색 버튼 */
    document.getElementById('btn-search').addEventListener('click', () => {
      dropdown.hidden = true;
      Search.open();
    });

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
    document.getElementById('menu-sync').addEventListener('click', () => {
      dropdown.hidden = true;
      Sync.pull();
    });
    document.getElementById('menu-secret').addEventListener('click', () => {
      dropdown.hidden = true;
      SecretModal.open();
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

    /* 비밀 키 모달 */
    document.getElementById('secret-modal-close').addEventListener('click',  () => SecretModal.close());
    document.getElementById('secret-modal-cancel').addEventListener('click', () => SecretModal.close());
    document.getElementById('secret-modal-save').addEventListener('click',   () => SecretModal.save());
    document.getElementById('secret-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') SecretModal.save();
    });
    document.getElementById('secret-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('secret-modal')) SecretModal.close();
    });

    /* ESC 키로 최상단 모달 닫기 */
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('confirm-modal').hidden)  { Confirm.close(); return; }
      if (!document.getElementById('secret-modal').hidden)   { SecretModal.close(); return; }
      if (!document.getElementById('editor-modal').hidden)   { Editor.close(); return; }
      if (!document.getElementById('entry-modal').hidden)    { EntryModal.close(); return; }
      if (!document.getElementById('search-modal').hidden)   { Search.close(); return; }
      if (!document.getElementById('nb-modal').hidden)       { Notebooks._closeModal(); return; }
      if (!document.getElementById('date-popup').hidden)     { document.getElementById('date-popup').hidden = true; }
    });

    /* 모듈 초기화 */
    Calendar.init();
    Notebooks.init();
    Search.init();

    /* Service Worker 등록 */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }

    /* 동기화 초기화 (캐시 우선 → 백그라운드 pull) */
    Sync.init();
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
    Sync.push();
  },

  refreshCalendar() {
    Calendar.render();
    Sync.push();
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
