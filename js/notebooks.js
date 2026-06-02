/* ──────────────────────────────────────
   notebooks.js  —  일기장 탭
────────────────────────────────────── */

const Notebooks = {
  currentNbId: null,

  init() {
    document.getElementById('btn-add-notebook').addEventListener('click', () => this.openAddModal());
    document.getElementById('btn-back-notebooks').addEventListener('click', () => this.showList());
    document.getElementById('btn-write-in-nb').addEventListener('click', () => {
      Editor.open({ notebookId: this.currentNbId });
    });

    document.getElementById('nb-modal-close').addEventListener('click',  () => this._closeModal());
    document.getElementById('nb-modal-cancel').addEventListener('click', () => this._closeModal());
    document.getElementById('nb-modal-save').addEventListener('click',   () => this._saveNotebook());
    document.getElementById('nb-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('nb-modal')) this._closeModal();
    });
    document.getElementById('nb-name-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._saveNotebook();
    });

    this._buildColorPalette();
    this.renderList();
  },

  /* ── 일기장 카드 목록 ── */
  renderList() {
    const grid    = document.getElementById('notebooks-grid');
    const nbs     = Storage.getNotebooks();
    const entries = Storage.getEntries();
    grid.innerHTML = '';

    if (nbs.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>아직 일기장이 없어요.</p><p>일기장을 만들어 보세요! 📔</p></div>';
      return;
    }

    nbs.forEach(nb => {
      const count = entries.filter(e => e.notebookId === nb.id).length;
      const card  = document.createElement('div');
      card.className = 'notebook-card';
      card.innerHTML = `
        <div class="nb-card-color-bar" style="background:${nb.color}"></div>
        <div class="nb-card-name">${this._esc(nb.name)}</div>
        <div class="nb-card-count">${count}개의 일기</div>
      `;
      card.addEventListener('click', () => this.showEntries(nb.id));
      grid.appendChild(card);
    });
  },

  /* ── 일기장별 일기 목록 ── */
  showEntries(nbId) {
    this.currentNbId = nbId;
    const nb = Storage.getNotebookById(nbId);
    if (!nb) return;
    document.getElementById('entries-nb-title').textContent = nb.name;
    document.getElementById('notebooks-list-view').classList.add('hidden');
    document.getElementById('notebook-entries-view').classList.remove('hidden');
    this.renderEntries(nbId);
  },

  renderEntries(nbId) {
    const list    = document.getElementById('entries-list');
    const nb      = Storage.getNotebookById(nbId);
    const entries = Storage.getEntriesByNotebook(nbId);
    list.innerHTML = '';

    if (entries.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>아직 일기가 없어요.</p><p>첫 번째 일기를 써보세요! ✏️</p></div>';
      return;
    }

    entries.forEach(entry => {
      const preview = entry.content.find(b => b.type === 'text')?.value || '';
      const thumb   = entry.content.find(b => b.type === 'image')?.value;

      const item = document.createElement('div');
      item.className = 'entry-list-item';
      item.innerHTML = `
        <span class="entry-list-dot" style="background:${nb?.color || '#ccc'}"></span>
        <div class="entry-list-info">
          <div class="entry-list-date">${formatDateKo(entry.date)}</div>
          <div class="entry-list-preview">${
            this._esc(preview.slice(0, 50)) || (thumb ? '📷 사진' : '(내용 없음)')
          }</div>
        </div>
        ${thumb ? `<img class="entry-list-thumb" src="${thumb}" alt="">` : ''}
      `;
      item.addEventListener('click', () => EntryModal.open(entry.id));
      list.appendChild(item);
    });
  },

  showList() {
    this.currentNbId = null;
    document.getElementById('notebooks-list-view').classList.remove('hidden');
    document.getElementById('notebook-entries-view').classList.add('hidden');
  },

  /* ── 일기장 추가 모달 ── */
  openAddModal() {
    document.getElementById('nb-name-input').value = '';
    this._autoSelectColor();
    document.getElementById('nb-modal').hidden = false;
    setTimeout(() => document.getElementById('nb-name-input').focus(), 80);
  },

  _closeModal() {
    document.getElementById('nb-modal').hidden = true;
  },

  _saveNotebook() {
    const name = document.getElementById('nb-name-input').value.trim();
    if (!name) { alert('일기장 이름을 입력해 주세요.'); return; }
    const color = document.querySelector('.color-swatch.selected')?.dataset.color || PALETTE[0];
    Storage.addNotebook(name, color);
    this._closeModal();
    this.renderList();
    App.refreshCalendar();
  },

  /* ── 색상 팔레트 ── */
  _buildColorPalette() {
    const wrap = document.getElementById('color-palette');
    PALETTE.forEach((color, i) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
      sw.dataset.color = color;
      sw.style.background = color;
      sw.title = color;
      sw.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      wrap.appendChild(sw);
    });
  },

  _autoSelectColor() {
    const next = Storage.getNextColor();
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === next);
    });
  },

  /* ── 리프레시 ── */
  refresh() {
    this.renderList();
    if (this.currentNbId) this.renderEntries(this.currentNbId);
  },

  _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },
};
