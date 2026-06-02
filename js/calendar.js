/* ──────────────────────────────────────
   calendar.js  —  달력 탭 + 공휴일 표시
────────────────────────────────────── */

const Calendar = {
  year: 0,
  month: 0,
  /* 공휴일 캐시: { 'YYYY-M': { 'YYYYMMDD': '공휴일명' } } */
  _holidayCache: {},

  init() {
    const now = new Date();
    this.year  = now.getFullYear();
    this.month = now.getMonth() + 1;

    this._buildYearSelect();
    this._buildMonthSelect();

    document.getElementById('cal-prev').addEventListener('click', () => this.navigate(-1));
    document.getElementById('cal-next').addEventListener('click', () => this.navigate( 1));
    document.getElementById('cal-year-select').addEventListener('change', e => {
      this.year = parseInt(e.target.value);
      this.render();
    });
    document.getElementById('cal-month-select').addEventListener('change', e => {
      this.month = parseInt(e.target.value);
      this.render();
    });

    this.render();
  },

  _buildYearSelect() {
    const sel = document.getElementById('cal-year-select');
    sel.innerHTML = '';
    const cur = new Date().getFullYear();
    for (let y = cur - 10; y <= cur + 3; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y}년`;
      if (y === this.year) opt.selected = true;
      sel.appendChild(opt);
    }
  },

  _buildMonthSelect() {
    const sel = document.getElementById('cal-month-select');
    sel.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${m}월`;
      if (m === this.month) opt.selected = true;
      sel.appendChild(opt);
    }
  },

  navigate(dir) {
    this.month += dir;
    if (this.month > 12) { this.month = 1;  this.year++; }
    if (this.month < 1)  { this.month = 12; this.year--; }
    document.getElementById('cal-year-select').value  = this.year;
    document.getElementById('cal-month-select').value = this.month;
    this.render();
  },

  render() {
    const grid    = document.getElementById('calendar-grid');
    const today   = getTodayStr();
    const nbs     = Storage.getNotebooks();
    const entries = Storage.getEntriesInMonth(this.year, this.month);

    const byDate = {};
    entries.forEach(e => {
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });

    const firstDow    = new Date(this.year, this.month - 1, 1).getDay();
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const daysInPrev  = new Date(this.year, this.month - 1, 0).getDate();

    const prevYear  = this.month === 1  ? this.year - 1 : this.year;
    const prevMonth = this.month === 1  ? 12 : this.month - 1;
    const nextYear  = this.month === 12 ? this.year + 1 : this.year;
    const nextMonth = this.month === 12 ? 1  : this.month + 1;

    grid.innerHTML = '';

    for (let i = 0; i < 42; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';

      let day, dateStr, isCur;
      const dow = i % 7;

      if (i < firstDow) {
        day = daysInPrev - firstDow + i + 1;
        dateStr = `${prevYear}-${String(prevMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        isCur = false;
        cell.classList.add('other-month');
      } else if (i >= firstDow + daysInMonth) {
        day = i - firstDow - daysInMonth + 1;
        dateStr = `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        isCur = false;
        cell.classList.add('other-month');
      } else {
        day = i - firstDow + 1;
        dateStr = `${this.year}-${String(this.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        isCur = true;
      }

      if (dow === 0) cell.classList.add('sun-col');
      if (dow === 6) cell.classList.add('sat-col');
      if (dateStr === today) cell.classList.add('today');

      /* 공휴일 적용을 위해 data-date 저장 */
      cell.dataset.date = dateStr;

      /* 날짜 숫자 */
      const num = document.createElement('div');
      num.className = 'cal-day-num';
      num.textContent = day;
      cell.appendChild(num);

      /* entry 점 표시 */
      const cellEntries = byDate[dateStr] || [];
      if (cellEntries.length > 0) {
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'cal-dots';
        const maxShow = 2;

        cellEntries.slice(0, maxShow).forEach(entry => {
          const nb          = nbs.find(n => n.id === entry.notebookId);
          const displayText = entry.title || nb?.name || '';
          const row = document.createElement('div');
          row.className = 'cal-dot-row';
          row.innerHTML = `
            <span class="dot-circle" style="background:${nb?.color || '#ccc'}"></span>
            <span class="dot-nb-name">${displayText}</span>
          `;
          dotsWrap.appendChild(row);
        });

        if (cellEntries.length > maxShow) {
          const more = document.createElement('div');
          more.className = 'dot-more';
          more.textContent = `+${cellEntries.length - maxShow}개`;
          dotsWrap.appendChild(more);
        }
        cell.appendChild(dotsWrap);
      }

      if (isCur || cellEntries.length > 0) {
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', e => {
          e.stopPropagation();
          this._onCellClick(dateStr, cellEntries, cell);
        });
      }

      grid.appendChild(cell);
    }

    /* 공휴일 비동기 적용 (달력 렌더 후 별도 업데이트) */
    this._fetchHolidays(this.year, this.month);
  },

  /* ── 공휴일 fetch ── */
  _fetchHolidays(year, month) {
    const key = `${year}-${month}`;
    if (this._holidayCache[key]) {
      this._applyHolidays(this._holidayCache[key]);
      return;
    }
    fetch(`https://reading-proxy.kdw12357.workers.dev/holidays?year=${year}&month=${month}`)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(data => {
        const map = {};
        (data.holidays || []).forEach(h => {
          if (h.isHoliday) map[h.date] = h.name;
        });
        this._holidayCache[key] = map;
        /* 렌더된 달과 여전히 같은 달인지 확인 후 적용 */
        if (this.year === year && this.month === month) {
          this._applyHolidays(map);
        }
      })
      .catch(() => { /* 조용히 무시 */ });
  },

  _applyHolidays(map) {
    Object.entries(map).forEach(([date8, name]) => {
      /* 'YYYYMMDD' → 'YYYY-MM-DD' */
      const dateStr = `${date8.slice(0,4)}-${date8.slice(4,6)}-${date8.slice(6,8)}`;
      const cell = document.querySelector(`.cal-cell[data-date="${dateStr}"]`);
      if (!cell) return;
      cell.classList.add('holiday');

      /* 공휴일 이름 span (중복 방지, 일기 점보다 위에 표시) */
      if (!cell.querySelector('.cal-holiday-name')) {
        const nameEl = document.createElement('div');
        nameEl.className = 'cal-holiday-name';
        nameEl.textContent = name;
        const dotsWrap = cell.querySelector('.cal-dots');
        if (dotsWrap) {
          cell.insertBefore(nameEl, dotsWrap);
        } else {
          cell.appendChild(nameEl);
        }
      }
    });
  },

  /* ── 셀 클릭 → 팝업 ── */
  _onCellClick(dateStr, cellEntries, cellEl) {
    const popup   = document.getElementById('date-popup');
    const labelEl = document.getElementById('date-popup-label');
    const bodyEl  = document.getElementById('date-popup-body');
    const nbs     = Storage.getNotebooks();

    labelEl.textContent = formatDateKo(dateStr);
    bodyEl.innerHTML = '';

    cellEntries.forEach(entry => {
      const nb      = nbs.find(n => n.id === entry.notebookId);
      const preview = entry.content.find(b => b.type === 'text')?.value || '';
      const hasImg  = entry.content.some(b => b.type === 'image');

      const card = document.createElement('div');
      card.className = 'popup-entry-card';
      card.innerHTML = `
        <span class="popup-entry-dot" style="background:${nb?.color || '#aaa'}"></span>
        <div class="popup-entry-info">
          <div class="popup-entry-nb">${nb?.name || '미분류'}</div>
          <div class="popup-entry-preview">${
            preview.slice(0, 38) || (hasImg ? '📷 사진' : '(내용 없음)')
          }</div>
        </div>
      `;
      card.addEventListener('click', e => {
        e.stopPropagation();
        this._hidePopup();
        EntryModal.open(entry.id);
      });
      bodyEl.appendChild(card);
    });

    const writeBtn = document.createElement('button');
    writeBtn.className = 'popup-write-btn';
    writeBtn.textContent = cellEntries.length > 0 ? '+ 이 날 일기 추가' : '✏️ 일기 쓰기';
    writeBtn.addEventListener('click', e => {
      e.stopPropagation();
      this._hidePopup();
      Editor.open({ date: dateStr });
    });
    bodyEl.appendChild(writeBtn);

    const rect = cellEl.getBoundingClientRect();
    popup.hidden = false;

    if (window.innerWidth > 520) {
      const pw = 270;
      let left = rect.left + window.scrollX;
      let top  = rect.bottom + window.scrollY + 5;

      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      if (left < 8) left = 8;

      popup.style.left   = left + 'px';
      popup.style.top    = top  + 'px';
      popup.style.bottom = '';

      requestAnimationFrame(() => {
        const ph = popup.offsetHeight;
        if (rect.bottom + ph + 5 > window.innerHeight) {
          popup.style.top = Math.max(4, rect.top + window.scrollY - ph - 5) + 'px';
        }
      });
    } else {
      popup.style.left   = '';
      popup.style.top    = '';
      popup.style.bottom = '0';
    }
  },

  _hidePopup() {
    document.getElementById('date-popup').hidden = true;
  },
};
