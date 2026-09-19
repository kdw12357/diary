/* ──────────────────────────────────────
   editor.js  —  블록 에디터 + 이미지 압축(→ IndexedDB)
────────────────────────────────────── */

const IMG_SIZE_MAP = { small: '33%', medium: '66%', large: '100%' };
const IMG_SIZE_LABEL = { small: '소', medium: '중', large: '대' };

const Editor = {
  blocks: [],
  editingId: null,
  originalImageIds: [],   /* 수정 시작 시점에 이 일기가 참조하던 이미지 */
  newImageIds: [],        /* 이 편집 세션에서 새로 업로드한 이미지 */

  /* ── 열기 ── */
  open(opts = {}) {
    this.blocks = [];
    this.editingId = opts.entryId || null;
    this.originalImageIds = [];
    this.newImageIds = [];

    if (opts.entryId) {
      const entry = Storage.getEntryById(opts.entryId);
      if (entry) {
        this.blocks = JSON.parse(JSON.stringify(entry.content));
        this.originalImageIds = Storage.imageIdsOf(entry.content);
        document.getElementById('editor-date').value = entry.date;
        document.getElementById('editor-title').value = entry.title || '';
        this._fillNotebookSelect(entry.notebookId);
        document.getElementById('editor-modal-title').textContent = '일기 수정';
      }
    } else {
      this.blocks = [{ type: 'text', value: '' }];
      document.getElementById('editor-date').value = opts.date || getTodayStr();
      document.getElementById('editor-title').value = '';
      this._fillNotebookSelect(opts.notebookId || null);
      document.getElementById('editor-modal-title').textContent = '일기 쓰기';
    }

    document.getElementById('editor-modal').hidden = false;
    this._render();
    setTimeout(() => {
      const first = document.querySelector('#editor-blocks .block-textarea');
      if (first) first.focus();
    }, 80);
  },

  close() {
    document.getElementById('editor-modal').hidden = true;
    /* 이번 세션에서 올렸지만 어떤 일기도 참조하지 않게 된 이미지 정리
       (저장된 경우엔 일기가 참조 중이므로 releaseImages 가 남겨 둔다) */
    Storage.releaseImages(this.newImageIds);
    ImageURL.reset('editor');
    this.blocks = [];
    this.editingId = null;
    this.originalImageIds = [];
    this.newImageIds = [];
  },

  /* ── 일기장 드롭다운 ── */
  _fillNotebookSelect(selectedId) {
    const sel = document.getElementById('editor-nb-select');
    sel.innerHTML = '';
    const nbs = Storage.getNotebooks();

    /* 미분류 옵션 (항상 첫 번째) */
    const unOpt = document.createElement('option');
    unOpt.value = '';
    unOpt.textContent = '— 미분류 —';
    if (!selectedId) unOpt.selected = true;
    sel.appendChild(unOpt);

    nbs.forEach(nb => {
      const opt = document.createElement('option');
      opt.value = nb.id;
      opt.textContent = nb.name;
      if (nb.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  },

  /* ── 블록 렌더 ── */
  _render() {
    const container = document.getElementById('editor-blocks');
    container.innerHTML = '';
    ImageURL.reset('editor');

    this.blocks.forEach((block, idx) => {
      const item = document.createElement('div');
      item.className = 'editor-block-item';

      /* 컨트롤: ▲ ▼ ✕ */
      const ctrl = document.createElement('div');
      ctrl.className = 'block-controls';
      ctrl.innerHTML = `
        <button class="block-ctrl-btn" data-action="up"   data-idx="${idx}" title="위로">▲</button>
        <button class="block-ctrl-btn" data-action="down" data-idx="${idx}" title="아래로">▼</button>
        <button class="block-ctrl-btn del-btn" data-action="del" data-idx="${idx}" title="삭제">✕</button>
      `;
      item.appendChild(ctrl);

      const content = document.createElement('div');
      content.className = 'block-content';

      if (block.type === 'text') {
        const ta = document.createElement('textarea');
        ta.className = 'block-textarea';
        ta.placeholder = '내용을 입력하세요...';
        ta.value = block.value;
        ta.dataset.idx = idx;
        ta.addEventListener('input', e => {
          this.blocks[idx].value = e.target.value;
          this._autoResize(e.target);
        });
        content.appendChild(ta);
        setTimeout(() => this._autoResize(ta), 0);

      } else if (block.type === 'image') {
        const wrap = document.createElement('div');
        wrap.className = 'block-img-wrap';

        if (block.imageId || block.value) {
          const currentSize = block.size || 'medium';
          wrap.appendChild(mountImage(block, 'editor', { width: IMG_SIZE_MAP[currentSize] }));

          /* [소] [중] [대] 버튼 */
          const sizeBtns = document.createElement('div');
          sizeBtns.className = 'img-size-btns';
          Object.keys(IMG_SIZE_MAP).forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'img-size-btn' + (s === currentSize ? ' active' : '');
            btn.textContent = IMG_SIZE_LABEL[s];
            btn.dataset.action = 'size';
            btn.dataset.idx = String(idx);
            btn.dataset.size = s;
            sizeBtns.appendChild(btn);
          });
          wrap.appendChild(sizeBtns);
        } else {
          const proc = document.createElement('div');
          proc.className = 'block-processing';
          proc.textContent = '처리 중...';
          wrap.appendChild(proc);
        }
        content.appendChild(wrap);
      }

      item.appendChild(content);
      container.appendChild(item);
    });

    /* 이벤트 위임 */
    container.onclick = e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      if (action === 'up')   this._move(idx, -1);
      if (action === 'down') this._move(idx,  1);
      if (action === 'del')  this._delete(idx);
      if (action === 'size') this._setImageSize(idx, btn.dataset.size);
    };
  },

  _autoResize(ta) {
    if (ta.scrollHeight > ta.clientHeight) {
      ta.style.height = ta.scrollHeight + 'px';
      return;
    }
    const container = document.getElementById('editor-blocks');
    const savedScrollTop = container.scrollTop;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    container.scrollTop = savedScrollTop;
    // 모바일 브라우저는 레이아웃 후 비동기로 scrollTop을 덮어씀.
    // scroll 이벤트로 직접 가로채고 rAF에서도 복원.
    const restore = () => { container.scrollTop = savedScrollTop; };
    container.addEventListener('scroll', restore, { once: true });
    requestAnimationFrame(() => {
      container.removeEventListener('scroll', restore);
      container.scrollTop = savedScrollTop;
    });
  },

  _move(idx, dir) {
    const ni = idx + dir;
    if (ni < 0 || ni >= this.blocks.length) return;
    [this.blocks[idx], this.blocks[ni]] = [this.blocks[ni], this.blocks[idx]];
    this._render();
  },

  _delete(idx) {
    this.blocks.splice(idx, 1);
    this._render();
  },

  _setImageSize(idx, size) {
    this.blocks[idx].size = size;
    this._render();
  },

  /* ── 블록 추가 ── */
  addText() {
    this.blocks.push({ type: 'text', value: '' });
    this._render();
    setTimeout(() => {
      const tas = document.querySelectorAll('#editor-blocks .block-textarea');
      if (tas.length) tas[tas.length - 1].focus();
    }, 60);
  },

  /* 파일 → Canvas 압축 → Blob → IndexedDB 저장 → 블록에는 imageId 만 기록 */
  async addImage(file) {
    /* 처리 중 블록을 이동/삭제해도 안전하도록 인덱스가 아닌 객체 참조로 추적 */
    const block = { type: 'image', imageId: null, size: 'medium' };
    this.blocks.push(block);
    this._render();
    try {
      const blob = await this._compress(file);
      const id   = await ImageDB.saveImage(blob);
      this.newImageIds.push(id);
      if (!this.blocks.includes(block)) {       /* 처리 중 에디터에서 삭제/닫힘 */
        Storage.releaseImages([id]);
        return;
      }
      block.imageId = id;
      this._render();
    } catch (err) {
      console.error('[image]', err);
      const i = this.blocks.indexOf(block);
      if (i !== -1) this.blocks.splice(i, 1);
      if (!document.getElementById('editor-modal').hidden) this._render();
      Toast.show('사진을 저장하지 못했어요', 'error');
    }
  },

  /* ── Canvas API 이미지 압축 (최대 1000px, JPEG 0.65) → Blob ── */
  _compress(file) {
    return new Promise((resolve, reject) => {
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(src);
        const MAX = 1000;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('이미지 압축 실패'))),
          'image/jpeg', 0.65
        );
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('이미지 로드 실패')); };
      img.src = src;
    });
  },

  /* ── 저장 ── */
  save() {
    const date  = document.getElementById('editor-date').value;
    const nbId  = document.getElementById('editor-nb-select').value || null;
    const title = document.getElementById('editor-title').value.trim();

    if (!date) { alert('날짜를 선택해 주세요.'); return false; }

    if (this.blocks.some(b => b.type === 'image' && !b.imageId && !b.value)) {
      alert('사진을 처리 중입니다. 잠시 후 다시 시도해 주세요.'); return false;
    }

    const content = this.blocks.filter(b => b.type === 'image' || b.value !== '');

    if (this.editingId) {
      Storage.updateEntry(this.editingId, { date, notebookId: nbId, title, content });
    } else {
      Storage.addEntry(nbId, date, content, title);
    }

    /* 편집 중 삭제된 이미지 정리: (원래 참조 + 새로 올림) − 최종 content.
       다른 일기가 참조 중인 이미지는 releaseImages 가 남겨 둔다 */
    const kept = new Set(Storage.imageIdsOf(content));
    Storage.releaseImages([...this.originalImageIds, ...this.newImageIds].filter(id => !kept.has(id)));

    this.close();
    App.refresh();
    return true;
  },
};
