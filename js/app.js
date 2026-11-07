/**
 * Main Application Logic for Uber Time & Order Tracker
 * Direct single-click finish without typing, daily reset, multi-order concurrency
 * Multi-sheet Excel (.xlsx) export
 */

// Sound Synthesizer via Web Audio API
const SoundEffects = {
  ctx: null,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playStartSound() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  },

  playCompleteSound() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.07;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.26);
      });
    } catch (e) {}
  },

  vibrate(pattern = [80, 40, 80]) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }
};

const App = {
  currentDate: TimerUtils.getTodayString(),
  timerInterval: null,

  async init() {
    this.currentDate = TimerUtils.getTodayString();

    // Sync with server file if hosted via server.js
    if (window.StorageManager && window.StorageManager.initSync) {
      await window.StorageManager.initSync();
    }

    const dateInput = document.getElementById('selectedDateInput');
    if (dateInput) {
      dateInput.value = this.currentDate;
      dateInput.addEventListener('change', (e) => {
        this.currentDate = e.target.value || TimerUtils.getTodayString();
        this.renderStatsAndHistory();
        this.renderActiveOrders();
      });
    }

    this.bindEvents();
    this.renderActiveOrders();
    this.renderStatsAndHistory();
    this.startTickLoop();
  },

  bindEvents() {
    // 1-Click Order Launchers
    document.getElementById('btnStartOne')?.addEventListener('click', () => {
      this.startSingleOrder();
    });

    document.getElementById('btnStartDouble')?.addEventListener('click', () => {
      this.startBatchOrders(2, '雙單');
    });

    document.getElementById('btnStartTriple')?.addEventListener('click', () => {
      this.startBatchOrders(3, '三單');
    });

    document.getElementById('btnAddMoreTrip')?.addEventListener('click', () => {
      this.startSingleOrder('夾單');
    });

    // Date Switchers
    document.getElementById('btnDateToday')?.addEventListener('click', () => {
      this.setDateToToday();
    });

    // Excel Multi-sheet Export
    document.getElementById('btnExportExcelSheets')?.addEventListener('click', () => {
      StorageManager.exportToExcelWithDailySheets(null);
    });

    document.getElementById('btnExportExcelToday')?.addEventListener('click', () => {
      StorageManager.exportToExcelWithDailySheets(this.currentDate);
    });

    // Reset / Delete Day Data
    document.getElementById('btnClearDayData')?.addEventListener('click', () => {
      this.confirmClearDateData();
    });
  },

  setDateToToday() {
    this.currentDate = TimerUtils.getTodayString();
    const dateInput = document.getElementById('selectedDateInput');
    if (dateInput) dateInput.value = this.currentDate;
    this.renderStatsAndHistory();
    this.renderActiveOrders();
  },

  startTickLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateActiveTimersDisplay();
    }, 1000);
  },

  /**
   * Start 1 new order (strictly 1-based index per day)
   */
  startSingleOrder(labelTag = '') {
    SoundEffects.playStartSound();
    SoundEffects.vibrate([90]);

    const todayStr = TimerUtils.getTodayString();
    const orderNum = StorageManager.getNextOrderNumber(todayStr);
    const orderId = 'trip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const displayName = labelTag ? `第 ${orderNum} 單 (${labelTag})` : `第 ${orderNum} 單`;

    const newOrder = {
      id: orderId,
      date: todayStr,
      orderNumber: orderNum,
      label: displayName,
      startTime: Date.now()
    };

    StorageManager.addActiveOrder(newOrder);
    this.renderActiveOrders();
    this.renderStatsAndHistory();
  },

  /**
   * Start 2 or 3 orders simultaneously
   */
  startBatchOrders(count, modeLabel) {
    SoundEffects.playStartSound();
    SoundEffects.vibrate([120, 60, 120]);

    const todayStr = TimerUtils.getTodayString();
    const now = Date.now();

    for (let i = 1; i <= count; i++) {
      const orderNum = StorageManager.getNextOrderNumber(todayStr);
      const orderId = 'trip_' + now + '_' + i + '_' + Math.random().toString(36).substring(2, 6);

      const newOrder = {
        id: orderId,
        date: todayStr,
        orderNumber: orderNum,
        label: `第 ${orderNum} 單 (${modeLabel}-${i})`,
        startTime: now
      };
      StorageManager.addActiveOrder(newOrder);
    }

    this.renderActiveOrders();
    this.renderStatsAndHistory();
  },

  /**
   * Direct 1-Click Finish Order: No popup, no notes needed!
   */
  finishActiveOrder(orderId) {
    const orders = StorageManager.getActiveOrders();
    const target = orders.find(o => o.id === orderId);
    if (!target) return;

    const endTime = Date.now();
    const durationSeconds = TimerUtils.getElapsedSeconds(target.startTime);
    const todayStr = target.date || TimerUtils.getTodayString();

    const completedRecord = {
      id: target.id,
      date: todayStr,
      orderNumber: target.orderNumber,
      label: target.label,
      startTime: target.startTime,
      endTime: endTime,
      durationSeconds: durationSeconds
    };

    StorageManager.removeActiveOrder(orderId);
    StorageManager.addCompletedOrder(completedRecord);

    SoundEffects.playCompleteSound();
    SoundEffects.vibrate([100, 50, 150]);

    this.renderActiveOrders();
    this.renderStatsAndHistory();
  },

  /**
   * Cancel/delete an active order if tapped by mistake
   */
  cancelActiveOrder(orderId) {
    const orders = StorageManager.getActiveOrders();
    const target = orders.find(o => o.id === orderId);
    const label = target ? target.label : '此單';

    if (confirm(`確定要刪除或取消【${label}】的計時嗎？`)) {
      StorageManager.removeActiveOrder(orderId);
      this.renderActiveOrders();
      this.renderStatsAndHistory();
    }
  },

  /**
   * Render running orders cards
   */
  renderActiveOrders() {
    const activeOrders = StorageManager.getActiveOrders();
    const container = document.getElementById('activeOrdersList');
    const emptyState = document.getElementById('activeEmptyState');
    const runningBadge = document.getElementById('runningOrdersBadge');
    const addMoreBtn = document.getElementById('btnAddMoreTrip');

    if (!container) return;

    if (activeOrders.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (runningBadge) runningBadge.classList.add('hidden');
      if (addMoreBtn) addMoreBtn.classList.add('hidden');
      document.title = 'Uber 跑單時間計算器';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (runningBadge) {
      runningBadge.classList.remove('hidden');
      runningBadge.innerHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 status-dot-blink mr-1.5"></span> 進行中：${activeOrders.length} 單`;
    }
    if (addMoreBtn) addMoreBtn.classList.remove('hidden');

    document.title = `(${activeOrders.length}單跑單中) Uber 計時器`;

    container.innerHTML = activeOrders.map((order) => {
      const elapsed = TimerUtils.getElapsedSeconds(order.startTime);
      const digitalTime = TimerUtils.formatDigital(elapsed);
      const startTimeStr = TimerUtils.formatTime(order.startTime);

      return `
        <div id="card_${order.id}" class="bg-slate-800 border-2 border-amber-500 rounded-2xl p-4 sm:p-5 shadow-xl active-card-pulse flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <span class="w-2 h-2 rounded-full bg-amber-400 status-dot-blink mr-1.5"></span>
                  跑單中
                </span>
                <span class="font-black text-white text-lg">${order.label}</span>
              </div>
              <button onclick="App.cancelActiveOrder('${order.id}')" class="text-slate-400 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-slate-700/50 transition-colors" title="刪除此單計時">
                ✕ 取消
              </button>
            </div>

            <div class="text-xs text-slate-400 mb-3 flex items-center justify-between">
              <span>開始時間：<strong class="text-slate-200">${startTimeStr}</strong></span>
              <span class="text-amber-400/90 font-medium">即時計時中</span>
            </div>

            <!-- Digital Timer -->
            <div class="bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-center my-1 shadow-inner">
              <div id="timer_${order.id}" class="font-timer text-4xl sm:text-5xl font-black tracking-wider text-amber-300">
                ${digitalTime}
              </div>
            </div>
          </div>

          <!-- Direct 1-Click Finish Button -->
          <div class="mt-4 pt-1">
            <button onclick="App.finishActiveOrder('${order.id}')"
              class="btn-press-effect w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xl py-4 px-4 rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all cursor-pointer">
              <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
              <span>直接結束 (${order.label})</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Tick loop: updates active timers without full re-render
   */
  updateActiveTimersDisplay() {
    const activeOrders = StorageManager.getActiveOrders();
    if (activeOrders.length === 0) return;

    activeOrders.forEach(order => {
      const el = document.getElementById(`timer_${order.id}`);
      if (el) {
        const elapsed = TimerUtils.getElapsedSeconds(order.startTime);
        el.textContent = TimerUtils.formatDigital(elapsed);
      }
    });
  },

  /**
   * Delete a single completed order
   */
  deleteCompletedOrder(orderId) {
    const orders = StorageManager.getCompletedOrders();
    const target = orders.find(o => o.id === orderId);
    const label = target ? target.label : '此筆紀錄';

    if (confirm(`確定要刪除【${label}】的這筆紀錄嗎？`)) {
      StorageManager.deleteCompletedOrder(orderId);
      this.renderStatsAndHistory();
    }
  },

  /**
   * Reset all data for current date (今日歸零)
   */
  confirmClearDateData() {
    const isToday = this.currentDate === TimerUtils.getTodayString();
    const label = isToday ? '今天' : this.currentDate;

    if (confirm(`【確認歸零】確定要清空【${label}】的所有跑單紀錄嗎？\n此動作會將【${label}】的所有紀錄清空並重設為第 1 單！`)) {
      StorageManager.clearCompletedOrdersForDate(this.currentDate);
      this.renderStatsAndHistory();
      this.renderActiveOrders();
    }
  },

  /**
   * Render daily stats and list
   */
  renderStatsAndHistory() {
    const stats = StorageManager.getDailyStats(this.currentDate);
    const isToday = this.currentDate === TimerUtils.getTodayString();

    // Summary Headings
    const dateLabelEl = document.getElementById('currentDateHeading');
    if (dateLabelEl) {
      dateLabelEl.textContent = isToday ? `今日數據彙整 (${this.currentDate})` : `${this.currentDate} 數據紀錄`;
    }

    // Stat Cards
    const acceptedCountEl = document.getElementById('statTotalAccepted');
    const completedCountEl = document.getElementById('statCompletedCount');
    const runningCountEl = document.getElementById('statRunningCount');
    const totalTimeEl = document.getElementById('statTotalTime');
    const avgTimeEl = document.getElementById('statAvgTime');

    if (acceptedCountEl) acceptedCountEl.textContent = stats.totalAcceptedCount;
    if (completedCountEl) completedCountEl.textContent = stats.completedCount;
    if (runningCountEl) runningCountEl.textContent = stats.activeCount;
    if (totalTimeEl) totalTimeEl.textContent = stats.totalSeconds > 0 ? TimerUtils.formatReadable(stats.totalSeconds) : '0 秒';
    if (avgTimeEl) avgTimeEl.textContent = stats.avgSeconds > 0 ? TimerUtils.formatReadable(stats.avgSeconds) : '0 秒';

    // History Table
    const listContainer = document.getElementById('completedOrdersList');
    const emptyHistory = document.getElementById('historyEmptyState');

    if (!listContainer) return;

    if (stats.orders.length === 0) {
      listContainer.innerHTML = '';
      if (emptyHistory) emptyHistory.classList.remove('hidden');
      return;
    }

    if (emptyHistory) emptyHistory.classList.add('hidden');

    listContainer.innerHTML = stats.orders.map((order) => {
      const startStr = TimerUtils.formatTime(order.startTime);
      const endStr = TimerUtils.formatTime(order.endTime);
      const readableDur = TimerUtils.formatReadable(order.durationSeconds);
      const digitalDur = TimerUtils.formatDigital(order.durationSeconds);

      return `
        <div class="bg-slate-800/90 hover:bg-slate-800 border border-slate-700 rounded-xl p-3 sm:p-4 transition-all flex items-center justify-between gap-3 shadow-md">
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-base border border-emerald-500/30">
              #${order.orderNumber}
            </div>
            <div class="min-w-0">
              <div class="font-extrabold text-white text-base truncate">${order.label}</div>
              <div class="text-xs text-slate-400 mt-0.5">
                起訖：<span class="text-slate-300 font-mono">${startStr}</span> ~ <span class="text-slate-300 font-mono">${endStr}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            <div class="text-right">
              <div class="font-timer text-lg sm:text-xl font-black text-amber-400">${digitalDur}</div>
              <div class="text-[11px] text-slate-400 font-medium">${readableDur}</div>
            </div>

            <!-- Delete Button -->
            <button onclick="App.deleteCompletedOrder('${order.id}')"
              class="px-2.5 py-1.5 text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 rounded-lg border border-red-500/30 transition-all flex items-center gap-1 cursor-pointer"
              title="刪除這筆紀錄">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              <span>刪除</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
