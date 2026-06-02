/* ──────────────────────────────────────
   calendar.js  —  달력 탭
────────────────────────────────────── */

const Calendar = {
  year: 0,
  month: 0,

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

    /* 날짜별 entry 그룹화 */
    const byDate = {};
    entries.forEach(e => {
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });

    /* 월 첫 요일, 일수 */
    const firstDow   = new Date(this.year, this.month - 1, 1).getDay();
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const daysInPrev  = new Date(this.year, this.month - 1, 0).getDate();

    const prevYear  = this.month === 1  ? this.year - 1 : this.year;
    const prevMonth = this.month === 1  ? 12 : this.month - 1;
    const nextYear  = this.month === 12 ? this.year + 1 : this.year;
    const nextMonth = this.month === 12 ? 1  : this.month + 1;

    grid.innerHTML = '';

    /* 항상 6행 × 7열 = 42셀 */
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
          const nb  = nbs.find(n => n.id === entry.notebookId);
          const row = document.createElement('div');
          row.className = 'cal-dot-row';
          row.innerHTML = `
            <span class="dot-circle" style="background:${nb?.color || '#ccc'}"></span>
            <span class="dot-nb-name">${nb?.name || ''}</span>
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

      /* 클릭 핸들러 — 현재 달 셀 또는 entry 있는 다른 달 셀 */
      if (isCur || cellEntries.length > 0) {
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', e => {
          e.stopPropagation();
          this._onCellClick(dateStr, cellEntries, cell);
        });
      }

      grid.appendChild(cell);
    }
  },

  /* ── 셀 클릭 → 팝업 ── */
  _onCellClick(dateStr, cellEntries, cellEl) {
    const popup      = document.getElementById('date-popup');
    const labelEl    = document.getElementById('date-popup-label');
    const bodyEl     = document.getElementById('date-popup-body');
    const nbs        = Storage.getNotebooks();

    labelEl.textContent = formatDateKo(dateStr);
    bodyEl.innerHTML = '';

    /* 기존 entry 카드 */
    cellEntries.forEach(entry => {
      const nb      = nbs.find(n => n.id === entry.notebookId);
      const preview = entry.content.find(b => b.type === 'text')?.value || '';
      const hasImg  = entry.content.some(b => b.type === 'image');

      const card = document.createElement('div');
      card.className = 'popup-entry-card';
      card.innerHTML = `
        <span class="popup-entry-dot" style="background:${nb?.color || '#ccc'}"></span>
        <div class="popup-entry-info">
          <div class="popup-entry-nb">${nb?.name || '알 수 없음'}</div>
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

    /* 쓰기 버튼 */
    const writeBtn = document.createElement('button');
    writeBtn.className = 'popup-write-btn';
    writeBtn.textContent = cellEntries.length > 0 ? '+ 이 날 일기 추가' : '✏️ 일기 쓰기';
    writeBtn.addEventListener('click', e => {
      e.stopPropagation();
      this._hidePopup();
      Editor.open({ date: dateStr });
    });
    bodyEl.appendChild(writeBtn);

    /* 팝업 위치 계산 (데스크톱) */
    const rect = cellEl.getBoundingClientRect();
    popup.hidden = false;

    /* 모바일에서는 CSS로 바텀시트 처리됨 — 데스크톱만 위치 설정 */
    if (window.innerWidth > 520) {
      const pw = 270;
      let left = rect.left + window.scrollX;
      let top  = rect.bottom + window.scrollY + 5;

      /* 화면 바깥으로 나가면 보정 */
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      if (left < 8) left = 8;

      /* 아래 공간 없으면 위로 */
      popup.style.left = left + 'px';
      popup.style.top  = top  + 'px';
      popup.style.bottom = '';

      /* 렌더 후 높이 재계산 */
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
