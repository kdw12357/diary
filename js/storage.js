/* ──────────────────────────────────────
   storage.js  —  localStorage CRUD
────────────────────────────────────── */

const PALETTE = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
  '#D4BAFF', '#B5EAD7', '#FFDAC1', '#C7CEEA', '#F2C4CE',
];

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateKo(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
}

const NB_KEY = 'diary_notebooks';
const EN_KEY = 'diary_entries';

const Storage = {
  /* ── Notebooks ── */
  getNotebooks() {
    return JSON.parse(localStorage.getItem(NB_KEY) || '[]');
  },
  _saveNotebooks(arr) {
    localStorage.setItem(NB_KEY, JSON.stringify(arr));
  },
  addNotebook(name, color) {
    const list = this.getNotebooks();
    const nb = { id: genId(), name, color, createdAt: new Date().toISOString() };
    list.push(nb);
    this._saveNotebooks(list);
    return nb;
  },
  deleteNotebook(id) {
    this._saveNotebooks(this.getNotebooks().filter(n => n.id !== id));
    /* 해당 일기장의 entries는 삭제하지 않고 미분류(null)로 변경 */
    const updated = this.getEntries().map(e =>
      e.notebookId === id ? { ...e, notebookId: null } : e
    );
    this._saveEntries(updated);
  },
  getNotebookById(id) {
    return this.getNotebooks().find(n => n.id === id) || null;
  },
  getNextColor() {
    const used = this.getNotebooks().map(n => n.color);
    return PALETTE.find(c => !used.includes(c)) || PALETTE[0];
  },

  /* ── Entries ── */
  getEntries() {
    return JSON.parse(localStorage.getItem(EN_KEY) || '[]');
  },
  _saveEntries(arr) {
    localStorage.setItem(EN_KEY, JSON.stringify(arr));
  },
  addEntry(notebookId, date, content, title = '') {
    const list = this.getEntries();
    const now = new Date().toISOString();
    const tags = this.extractTags(content);
    /* notebookId가 null이면 미분류로 저장 */
    const entry = { id: genId(), notebookId: notebookId || null, date, title, content, tags, createdAt: now, updatedAt: now };
    list.push(entry);
    this._saveEntries(list);
    return entry;
  },
  updateEntry(id, patch) {
    const list = this.getEntries();
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const updated = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    if (patch.content) updated.tags = this.extractTags(patch.content);
    list[idx] = updated;
    this._saveEntries(list);
    return list[idx];
  },
  deleteEntry(id) {
    this._saveEntries(this.getEntries().filter(e => e.id !== id));
  },
  getEntryById(id) {
    return this.getEntries().find(e => e.id === id) || null;
  },
  getEntriesByDate(date) {
    return this.getEntries().filter(e => e.date === date);
  },
  /* nbId === null 이면 미분류 조회 */
  getEntriesByNotebook(nbId) {
    return this.getEntries()
      .filter(e => nbId === null ? e.notebookId === null : e.notebookId === nbId)
      .sort((a, b) => b.date.localeCompare(a.date));
  },
  getEntriesInMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return this.getEntries().filter(e => e.date.startsWith(prefix));
  },
  hasUnclassified() {
    return this.getEntries().some(e => e.notebookId === null);
  },

  /* ── 태그 ── */
  extractTags(content) {
    const tags = new Set();
    for (const block of content) {
      if (block.type !== 'text') continue;
      for (const m of block.value.matchAll(/#([가-힣a-zA-Z0-9_]+)/g)) {
        tags.add(m[1]);
      }
    }
    return [...tags];
  },

  getAllTags() {
    const counts = {};
    for (const entry of this.getEntries()) {
      for (const tag of (entry.tags || [])) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },

  searchEntries(query, notebookId) {
    if (!query.trim()) return [];
    const q = query.trim();
    const isTagSearch = q.startsWith('#');
    const tagQ  = isTagSearch ? q.slice(1).toLowerCase() : '';
    const textQ = isTagSearch ? '' : q.toLowerCase();

    return this.getEntries()
      .filter(entry => {
        if (notebookId && entry.notebookId !== notebookId) return false;
        if (isTagSearch) {
          return tagQ.length > 0 && (entry.tags || []).some(t => t.toLowerCase() === tagQ);
        }
        return (entry.title || '').toLowerCase().includes(textQ)
          || (entry.tags || []).some(t => t.toLowerCase().includes(textQ))
          || entry.content.some(b => b.type === 'text' && b.value.toLowerCase().includes(textQ));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  /* ── Export / Import ── */
  exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      notebooks: this.getNotebooks(),
      entries: this.getEntries(),
    };
  },
  importAll(data) {
    if (Array.isArray(data.notebooks)) this._saveNotebooks(data.notebooks);
    if (Array.isArray(data.entries))   this._saveEntries(data.entries);
  },
};
