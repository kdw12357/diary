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

/* ── Notebooks ── */
const NB_KEY = 'diary_notebooks';
const EN_KEY = 'diary_entries';

const Storage = {
  /* Notebooks */
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
    this._saveEntries(this.getEntries().filter(e => e.notebookId !== id));
  },
  getNotebookById(id) {
    return this.getNotebooks().find(n => n.id === id) || null;
  },
  getNextColor() {
    const used = this.getNotebooks().map(n => n.color);
    return PALETTE.find(c => !used.includes(c)) || PALETTE[0];
  },

  /* Entries */
  getEntries() {
    return JSON.parse(localStorage.getItem(EN_KEY) || '[]');
  },
  _saveEntries(arr) {
    localStorage.setItem(EN_KEY, JSON.stringify(arr));
  },
  addEntry(notebookId, date, content) {
    const list = this.getEntries();
    const now = new Date().toISOString();
    const entry = { id: genId(), notebookId, date, content, createdAt: now, updatedAt: now };
    list.push(entry);
    this._saveEntries(list);
    return entry;
  },
  updateEntry(id, patch) {
    const list = this.getEntries();
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
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
  getEntriesByNotebook(nbId) {
    return this.getEntries()
      .filter(e => e.notebookId === nbId)
      .sort((a, b) => b.date.localeCompare(a.date));
  },
  getEntriesInMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return this.getEntries().filter(e => e.date.startsWith(prefix));
  },

  /* Export / Import */
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
