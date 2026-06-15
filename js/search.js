/* ──────────────────────────────────────
   search.js  —  태그 시스템 + 전문 검색
────────────────────────────────────── */

const Search = {
  _debounceTimer: null,

  /* ── 초기화 ── */
  init() {
    document.getElementById('search-input').addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._doSearch(), 300);
    });
    document.getElementById('search-nb-filter').addEventListener('change', () => this._doSearch());
    document.getElementById('search-close').addEventListener('click', () => this.close());
    document.getElementById('search-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('search-modal')) this.close();
    });
  },

  /* ── 열기 ── */
  open() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    this._buildNbFilter();
    this._renderFrequentTags();
    document.getElementById('search-tags-section').hidden = false;
    document.getElementById('search-modal').hidden = false;
    setTimeout(() => document.getElementById('search-input').focus(), 80);
  },

  /* ── 태그로 바로 검색 열기 ── */
  openWithTag(tag) {
    this.open();
    document.getElementById('search-input').value = '#' + tag;
    this._doSearch();
  },

  /* ── 닫기 ── */
  close() {
    document.getElementById('search-modal').hidden = true;
    clearTimeout(this._debounceTimer);
  },

  /* ── 일기장 필터 드롭다운 빌드 ── */
  _buildNbFilter() {
    const sel = document.getElementById('search-nb-filter');
    sel.innerHTML = '<option value="">전체 일기장</option>';
    Storage.getNotebooks().forEach(nb => {
      const opt = document.createElement('option');
      opt.value = nb.id;
      opt.textContent = nb.name;
      sel.appendChild(opt);
    });
  },

  /* ── 자주 쓴 태그 렌더 ── */
  _renderFrequentTags() {
    const tags = Storage.getAllTags();
    const section = document.getElementById('search-tags-section');
    const wrap = document.getElementById('search-frequent-tags');
    wrap.innerHTML = '';
    if (tags.length === 0) { section.hidden = true; return; }
    section.hidden = false;
    tags.forEach(({ tag, count }) => {
      const chip = document.createElement('button');
      chip.className = 'tag-chip';
      chip.textContent = '#' + tag;
      chip.title = count + '개의 일기';
      chip.addEventListener('click', () => {
        document.getElementById('search-input').value = '#' + tag;
        this._doSearch();
      });
      wrap.appendChild(chip);
    });
  },

  /* ── 검색 실행 ── */
  _doSearch() {
    const query = document.getElementById('search-input').value;
    const nbId  = document.getElementById('search-nb-filter').value;
    const section = document.getElementById('search-tags-section');
    const resultsEl = document.getElementById('search-results');

    if (!query.trim()) {
      section.hidden = false;
      this._renderFrequentTags();
      resultsEl.innerHTML = '';
      return;
    }

    section.hidden = true;
    const entries = Storage.searchEntries(query, nbId || '');
    this._renderResults(entries, query);
  },

  /* ── 결과 카드 렌더 ── */
  _renderResults(entries, query) {
    const container = document.getElementById('search-results');
    container.innerHTML = '';

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = '검색 결과가 없습니다';
      container.appendChild(empty);
      return;
    }

    const q = query.trim();
    const isTagSearch = q.startsWith('#');
    const tagName = isTagSearch ? q.slice(1) : '';

    /* 결과 요약 */
    const summary = document.createElement('div');
    summary.className = 'search-summary';
    summary.textContent = isTagSearch
      ? `태그 '#${tagName}'에 해당하는 일기 ${entries.length}개`
      : `검색 결과 ${entries.length}개`;
    container.appendChild(summary);

    entries.forEach(entry => {
      const nb    = Storage.getNotebookById(entry.notebookId);
      const color = nb?.color || '#aaa';
      const nbName = nb?.name || '미분류';

      /* 미리보기 텍스트 추출 */
      const preview = this._getPreview(entry, q, isTagSearch);

      /* 카드 */
      const card = document.createElement('div');
      card.className = 'search-result-card';

      /* 헤더 행: 동그라미 + 일기장 + 날짜 */
      const headerRow = document.createElement('div');
      headerRow.className = 'search-card-header';

      const dot = document.createElement('span');
      dot.className = 'search-card-dot';
      dot.style.background = color;

      const nbEl = document.createElement('span');
      nbEl.className = 'search-card-nb';
      nbEl.textContent = nbName;

      const dateEl = document.createElement('span');
      dateEl.className = 'search-card-date';
      dateEl.textContent = formatDateKo(entry.date);

      headerRow.appendChild(dot);
      headerRow.appendChild(nbEl);
      headerRow.appendChild(dateEl);
      card.appendChild(headerRow);

      /* 제목 */
      if (entry.title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'search-card-title';
        titleEl.appendChild(isTagSearch
          ? document.createTextNode(entry.title)
          : this._highlightNode(entry.title, q));
        card.appendChild(titleEl);
      }

      /* 미리보기 */
      if (preview) {
        const previewEl = document.createElement('div');
        previewEl.className = 'search-card-preview';
        previewEl.appendChild(this._highlightNode(preview, q));
        card.appendChild(previewEl);
      }

      /* 태그 칩 */
      const tags = entry.tags || [];
      if (tags.length > 0) {
        const tagsEl = document.createElement('div');
        tagsEl.className = 'search-card-tags';
        tags.forEach(tag => {
          const chip = document.createElement('span');
          chip.className = 'tag-chip tag-chip-sm';
          chip.textContent = '#' + tag;
          tagsEl.appendChild(chip);
        });
        card.appendChild(tagsEl);
      }

      card.addEventListener('click', () => {
        this.close();
        EntryModal.open(entry.id);
      });

      container.appendChild(card);
    });
  },

  /* ── 미리보기 텍스트 추출 ── */
  _getPreview(entry, q, isTagSearch) {
    const lq = q.toLowerCase();
    for (const block of entry.content) {
      if (block.type !== 'text') continue;
      const idx = block.value.toLowerCase().indexOf(lq);
      if (idx !== -1) {
        const start = Math.max(0, idx - 30);
        const end   = Math.min(block.value.length, idx + lq.length + 60);
        return (start > 0 ? '…' : '') + block.value.slice(start, end) + (end < block.value.length ? '…' : '');
      }
    }
    /* 매칭 위치 없으면 첫 텍스트 블록 앞부분 */
    const first = entry.content.find(b => b.type === 'text');
    return first ? first.value.slice(0, 80) + (first.value.length > 80 ? '…' : '') : '';
  },

  /* ── 키워드 하이라이트 (DOM 조작, XSS 안전) ── */
  _highlightNode(text, query) {
    const frag = document.createDocumentFragment();
    if (!query) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.className = 'search-hl';
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  },
};
