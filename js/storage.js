/**
 * Storage & Data Manager for Uber Time & Order Tracker
 * Strictly isolates data by date (YYYY-MM-DD)
 * Daily sequence strictly resets to Order #1 each day
 * Multi-sheet Excel (.xlsx) export with separate tabs for each day
 * Dual Persistence: LocalStorage + Optional Server Sync (/api/data)
 */

const StorageKeys = {
  ACTIVE_ORDERS: 'uber_timer_active_orders',
  COMPLETED_ORDERS: 'uber_timer_completed_orders'
};

const StorageManager = {
  // Sync to local server file (data/orders.json) when hosted via server.js
  syncToServer() {
    if (window.location.protocol.startsWith('http')) {
      try {
        const payload = {
          activeOrders: this.getActiveOrders(),
          completedOrders: this.getCompletedOrders()
        };
        fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (e) {}
    }
  },

  async initSync() {
    if (window.location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/data');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.completedOrders) && data.completedOrders.length > 0) {
            localStorage.setItem(StorageKeys.COMPLETED_ORDERS, JSON.stringify(data.completedOrders));
          }
          if (Array.isArray(data.activeOrders)) {
            localStorage.setItem(StorageKeys.ACTIVE_ORDERS, JSON.stringify(data.activeOrders));
          }
        }
      } catch (e) {}
    }
  },

  /**
   * Get all currently running active orders
   */
  getActiveOrders() {
    try {
      const data = localStorage.getItem(StorageKeys.ACTIVE_ORDERS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading active orders:', e);
      return [];
    }
  },

  /**
   * Save active orders list
   */
  saveActiveOrders(orders) {
    try {
      localStorage.setItem(StorageKeys.ACTIVE_ORDERS, JSON.stringify(orders));
      this.syncToServer();
    } catch (e) {
      console.error('Error saving active orders:', e);
    }
  },

  /**
   * Add a new active order
   */
  addActiveOrder(order) {
    const orders = this.getActiveOrders();
    orders.push(order);
    this.saveActiveOrders(orders);
    return orders;
  },

  /**
   * Remove an active order by id
   */
  removeActiveOrder(orderId) {
    const orders = this.getActiveOrders().filter(o => o.id !== orderId);
    this.saveActiveOrders(orders);
    return orders;
  },

  /**
   * Get all completed orders, strictly filtered by date (YYYY-MM-DD) if provided
   */
  getCompletedOrders(dateStr = null) {
    try {
      const data = localStorage.getItem(StorageKeys.COMPLETED_ORDERS);
      const orders = data ? JSON.parse(data) : [];
      if (!dateStr) return orders;
      return orders.filter(o => o.date === dateStr);
    } catch (e) {
      console.error('Error reading completed orders:', e);
      return [];
    }
  },

  /**
   * Save full completed orders array
   */
  saveCompletedOrders(orders) {
    try {
      localStorage.setItem(StorageKeys.COMPLETED_ORDERS, JSON.stringify(orders));
      this.syncToServer();
    } catch (e) {
      console.error('Error saving completed orders:', e);
    }
  },

  /**
   * Calculate next order number for a specific date (strictly starts from 1 each day)
   */
  getNextOrderNumber(dateStr) {
    const completed = this.getCompletedOrders(dateStr);
    const active = this.getActiveOrders().filter(o => (o.date || TimerUtils.getTodayString()) === dateStr);
    return completed.length + active.length + 1;
  },

  /**
   * Re-index completed orders for a date chronologically from #1 to #N
   */
  reindexDateOrders(dateStr) {
    const allOrders = this.getCompletedOrders();
    const dayOrders = allOrders.filter(o => o.date === dateStr);
    const otherOrders = allOrders.filter(o => o.date !== dateStr);

    dayOrders.sort((a, b) => a.startTime - b.startTime);
    dayOrders.forEach((order, idx) => {
      order.orderNumber = idx + 1;
      order.label = `第 ${idx + 1} 單`;
    });

    const updatedDayOrders = [...dayOrders].reverse();
    this.saveCompletedOrders([...updatedDayOrders, ...otherOrders]);
  },

  /**
   * Add a newly finished order to history and ensure clean sequence
   */
  addCompletedOrder(order) {
    const orders = this.getCompletedOrders();
    orders.unshift(order);
    this.saveCompletedOrders(orders);
    this.reindexDateOrders(order.date);
    return this.getCompletedOrders(order.date);
  },

  /**
   * Delete a single completed order by id and re-index the day
   */
  deleteCompletedOrder(orderId) {
    const allOrders = this.getCompletedOrders();
    const target = allOrders.find(o => o.id === orderId);
    const dateStr = target ? target.date : null;

    const remaining = allOrders.filter(o => o.id !== orderId);
    this.saveCompletedOrders(remaining);

    if (dateStr) {
      this.reindexDateOrders(dateStr);
    }
    return remaining;
  },

  /**
   * Clear all records for a specific date (今日歸零)
   */
  clearCompletedOrdersForDate(dateStr) {
    const orders = this.getCompletedOrders().filter(o => o.date !== dateStr);
    this.saveCompletedOrders(orders);
    return orders;
  },

  /**
   * Compute comprehensive daily statistics (isolated strictly by date)
   */
  getDailyStats(dateStr) {
    const orders = this.getCompletedOrders(dateStr);
    const activeOrders = this.getActiveOrders().filter(o => o.date === dateStr);
    const completedCount = orders.length;
    const activeCount = activeOrders.length;
    const totalAcceptedCount = completedCount + activeCount;

    if (completedCount === 0) {
      return {
        date: dateStr,
        completedCount: 0,
        activeCount,
        totalAcceptedCount,
        totalSeconds: 0,
        avgSeconds: 0,
        minSeconds: 0,
        maxSeconds: 0,
        orders: []
      };
    }

    const totalSeconds = orders.reduce((sum, o) => sum + (o.durationSeconds || 0), 0);
    const avgSeconds = Math.round(totalSeconds / completedCount);

    let minSeconds = Infinity;
    let maxSeconds = 0;

    orders.forEach(o => {
      const dur = o.durationSeconds || 0;
      if (dur < minSeconds) minSeconds = dur;
      if (dur > maxSeconds) maxSeconds = dur;
    });

    if (minSeconds === Infinity) minSeconds = 0;

    return {
      date: dateStr,
      completedCount,
      activeCount,
      totalAcceptedCount,
      totalSeconds,
      avgSeconds,
      minSeconds,
      maxSeconds,
      orders
    };
  },

  /**
   * Export orders to Excel (.xlsx) partitioned with a separate Sheet/Tab for each day
   */
  exportToExcelWithDailySheets(targetDate = null) {
    const allOrders = this.getCompletedOrders();
    if (allOrders.length === 0) {
      alert(targetDate ? `${targetDate} 尚無任何已完成的跑單紀錄！` : '目前尚無任何跑單紀錄！');
      return;
    }

    const grouped = {};
    allOrders.forEach(o => {
      const d = o.date || '未分類日期';
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(o);
    });

    const datesToExport = targetDate 
      ? [targetDate] 
      : Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    if (datesToExport.length === 0 || (targetDate && (!grouped[targetDate] || grouped[targetDate].length === 0))) {
      alert(`${targetDate || ''} 尚無任何紀錄可匯出！`);
      return;
    }

    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();

      if (!targetDate && datesToExport.length > 1) {
        const summaryData = [
          ['Uber 每日跑單總覽彙整報表'],
          ['匯出時間：' + new Date().toLocaleString()],
          [],
          ['日期', '跑單總單數', '跑單總時長', '平均每單耗時', '總時長(秒)']
        ];

        datesToExport.forEach(d => {
          const stats = this.getDailyStats(d);
          summaryData.push([
            d,
            `${stats.completedCount} 單`,
            TimerUtils.formatReadable(stats.totalSeconds),
            TimerUtils.formatReadable(stats.avgSeconds),
            stats.totalSeconds
          ]);
        });

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, '每日總覽彙整');
      }

      datesToExport.forEach(d => {
        const dayOrders = (grouped[d] || []).sort((a, b) => a.startTime - b.startTime);
        const stats = this.getDailyStats(d);

        const sheetData = [
          [`【${d}】跑單明細報表`],
          [`當日總單數：${stats.completedCount} 單`, `當日總時長：${TimerUtils.formatReadable(stats.totalSeconds)}`, `平均每單耗時：${TimerUtils.formatReadable(stats.avgSeconds)}`],
          [],
          ['單號', '開始時間', '結束時間', '跑單耗時(秒)', '跑單耗時(易讀時分秒)']
        ];

        dayOrders.forEach((o, idx) => {
          sheetData.push([
            `第 ${o.orderNumber || (idx + 1)} 單`,
            TimerUtils.formatTime(o.startTime),
            TimerUtils.formatTime(o.endTime),
            o.durationSeconds || 0,
            TimerUtils.formatReadable(o.durationSeconds || 0)
          ]);
        });

        sheetData.push([]);
        sheetData.push([
          '當日合計',
          `${stats.completedCount} 單`,
          '',
          stats.totalSeconds,
          TimerUtils.formatReadable(stats.totalSeconds)
        ]);

        const wsDay = XLSX.utils.aoa_to_sheet(sheetData);
        const safeSheetName = d.replace(/[:\\/?*\[\]]/g, '-').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, wsDay, safeSheetName);
      });

      const fileName = targetDate 
        ? `Uber跑單明細_${targetDate}.xlsx` 
        : `Uber每日跑單分頁報表_${TimerUtils.getTodayString()}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } else {
      this.exportFallbackCSV(targetDate);
    }
  },

  exportFallbackCSV(dateStr = null) {
    const orders = this.getCompletedOrders(dateStr);
    if (orders.length === 0) {
      alert('尚無資料可匯出！');
      return;
    }
    const sorted = [...orders].sort((a, b) => a.startTime - b.startTime);
    const headers = ['日期', '單號', '開始時間', '結束時間', '跑單耗時(秒)', '跑單耗時(易讀時分秒)'];
    const rows = sorted.map((o, idx) => [
      `"${o.date || ''}"`,
      `"第 ${o.orderNumber || (idx + 1)} 單"`,
      `"${TimerUtils.formatTime(o.startTime)}"`,
      `"${TimerUtils.formatTime(o.endTime)}"`,
      o.durationSeconds || 0,
      `"${TimerUtils.formatReadable(o.durationSeconds || 0)}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = dateStr ? `Uber跑單_${dateStr}.csv` : `Uber全部跑單_${TimerUtils.getTodayString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

window.StorageManager = StorageManager;
