/* ──────────────────────────────────────
   editor.js  —  블록 에디터 + 이미지 압축
────────────────────────────────────── */

const IMG_SIZE_MAP = { small: '33%', medium: '66%', large: '100%' };
const IMG_SIZE_LABEL = { small: '소', medium: '중', large: '대' };

const Editor = {
  blocks: [],
  editingId: null,

  /* ── 열기 ── */
  open(opts = {}) {
    this.blocks = [];
    this.editingId = opts.entryId || null;

    if (opts.entryId) {
      const entry = Storage.getEntryById(opts.entryId);
      if (entry) {
        this.blocks = JSON.parse(JSON.stringify(entry.content));
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
    this.blocks = [];
    this.editingId = null;
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

        if (block.value) {
          const currentSize = block.size || 'medium';
          const img = document.createElement('img');
          img.src = block.value;
          img.style.width = IMG_SIZE_MAP[currentSize];
          wrap.appendChild(img);

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
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
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

  addImage(file) {
    const idx = this.blocks.length;
    this.blocks.push({ type: 'image', value: null, size: 'medium' });
    this._render();
    this._compress(file).then(dataUrl => {
      this.blocks[idx].value = dataUrl;
      this._render();
    });
  },

  /* ── Canvas API 이미지 압축 ── */
  _compress(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
            else        { w = Math.round(w * MAX / h); h = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /* ── 저장 ── */
  save() {
    const date  = document.getElementById('editor-date').value;
    const nbId  = document.getElementById('editor-nb-select').value || null;
    const title = document.getElementById('editor-title').value.trim();

    if (!date) { alert('날짜를 선택해 주세요.'); return false; }

    if (this.blocks.some(b => b.type === 'image' && b.value === null)) {
      alert('사진을 처리 중입니다. 잠시 후 다시 시도해 주세요.'); return false;
    }

    const content = this.blocks.filter(b => b.type === 'image' || b.value !== '');

    if (this.editingId) {
      Storage.updateEntry(this.editingId, { date, notebookId: nbId, title, content });
    } else {
      Storage.addEntry(nbId, date, content, title);
    }

    this.close();
    App.refresh();
    return true;
  },
};
