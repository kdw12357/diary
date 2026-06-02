/* ──────────────────────────────────────
   notebooks.js  —  일기장 탭
────────────────────────────────────── */

const Notebooks = {
  currentNbId: undefined, /* undefined = 초기, null = 미분류, string = 일기장 id */

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

    const hasUnclassified = entries.some(e => e.notebookId === null);

    if (nbs.length === 0 && !hasUnclassified) {
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
        <button class="nb-card-delete-btn" title="일기장 삭제">🗑️</button>
      `;
      card.addEventListener('click', e => {
        if (e.target.closest('.nb-card-delete-btn')) return;
        this.showEntries(nb.id);
      });
      card.querySelector('.nb-card-delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        this._confirmDelete(nb.id, nb.name);
      });
      grid.appendChild(card);
    });

    /* 미분류 카드 */
    if (hasUnclassified) {
      const count = entries.filter(e => e.notebookId === null).length;
      const card  = document.createElement('div');
      card.className = 'notebook-card unclassified-card';
      card.innerHTML = `
        <div class="nb-card-color-bar" style="background:#aaa"></div>
        <div class="nb-card-name">미분류</div>
        <div class="nb-card-count">${count}개의 일기</div>
      `;
      card.addEventListener('click', () => this.showEntries(null));
      grid.appendChild(card);
    }
  },

  /* ── 일기장별 일기 목록 ── */
  showEntries(nbId) {
    this.currentNbId = nbId;
    const isUnclassified = nbId === null;
    const nb = isUnclassified ? null : Storage.getNotebookById(nbId);

    /* 헤더 업데이트 */
    document.getElementById('entries-nb-dot').style.background = nb?.color || '#aaa';
    document.getElementById('entries-nb-title').textContent = nb?.name || '미분류';
    /* 미분류일 때 쓰기 버튼 숨김 */
    document.getElementById('btn-write-in-nb').style.display = isUnclassified ? 'none' : '';

    document.getElementById('notebooks-list-view').classList.add('hidden');
    document.getElementById('notebook-entries-view').classList.remove('hidden');
    this.renderEntries(nbId);
  },

  renderEntries(nbId) {
    const list    = document.getElementById('entries-list');
    const nb      = nbId !== null ? Storage.getNotebookById(nbId) : null;
    const entries = Storage.getEntriesByNotebook(nbId);
    const color   = nb?.color || '#aaa';
    list.innerHTML = '';

    if (entries.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>아직 일기가 없어요.</p><p>첫 번째 일기를 써보세요! ✏️</p></div>';
      return;
    }

    /* ── 연도 → 월 그룹화 ── */
    const yearGroups = {};
    entries.forEach(entry => {
      const [y, m] = entry.date.split('-');
      const mo = String(parseInt(m));
      if (!yearGroups[y]) yearGroups[y] = {};
      (yearGroups[y][mo] = yearGroups[y][mo] || []).push(entry);
    });

    const now      = new Date();
    const curYear  = String(now.getFullYear());
    const curMonth = String(now.getMonth() + 1);

    Object.keys(yearGroups).sort((a, b) => b - a).forEach(year => {
      const monthGroups = yearGroups[year];
      const yearTotal   = Object.values(monthGroups).reduce((s, a) => s + a.length, 0);

      const yearDet = document.createElement('details');
      yearDet.className = 'entry-year-group';
      if (year === curYear) yearDet.open = true;

      const yearSum = document.createElement('summary');
      yearSum.className = 'entry-group-header year-header';
      yearSum.textContent = `${year}년 (${yearTotal}개)`;
      yearDet.appendChild(yearSum);

      Object.keys(monthGroups).sort((a, b) => b - a).forEach(month => {
        const monthEntries = monthGroups[month];

        const monthDet = document.createElement('details');
        monthDet.className = 'entry-month-group';
        if (year === curYear && month === curMonth) monthDet.open = true;

        const monthSum = document.createElement('summary');
        monthSum.className = 'entry-group-header month-header';
        monthSum.textContent = `${month}월 (${monthEntries.length}개)`;
        monthDet.appendChild(monthSum);

        monthEntries.forEach(entry => {
          const preview = entry.content.find(b => b.type === 'text')?.value || '';
          const thumb   = entry.content.find(b => b.type === 'image')?.value;

          const item = document.createElement('div');
          item.className = 'entry-list-item';
          item.innerHTML = `
            <span class="entry-list-dot" style="background:${color}"></span>
            <div class="entry-list-info">
              <div class="entry-list-date">${formatDateKo(entry.date)}</div>
              <div class="entry-list-preview">${
                this._esc(preview.slice(0, 50)) || (thumb ? '📷 사진' : '(내용 없음)')
              }</div>
            </div>
            ${thumb ? `<img class="entry-list-thumb" src="${thumb}" alt="">` : ''}
          `;
          item.addEventListener('click', () => EntryModal.open(entry.id));
          monthDet.appendChild(item);
        });

        yearDet.appendChild(monthDet);
      });

      list.appendChild(yearDet);
    });
  },

  showList() {
    this.currentNbId = undefined;
    document.getElementById('notebooks-list-view').classList.remove('hidden');
    document.getElementById('notebook-entries-view').classList.add('hidden');
  },

  /* ── 일기장 삭제 확인 ── */
  _confirmDelete(id, name) {
    Confirm.open(
      `"${name}" 일기장을 삭제할까요?\n이 일기장의 일기들은 '미분류' 상태로 유지됩니다.`,
      () => {
        Storage.deleteNotebook(id);
        this.renderList();
        App.refreshCalendar();
      }
    );
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
    if (this.currentNbId !== undefined) this.renderEntries(this.currentNbId);
  },

  _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },
};
