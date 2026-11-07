/**
 * Timer Utilities for Uber Time & Order Tracker
 * High precision based on epoch timestamps (Date.now())
 */

const TimerUtils = {
  /**
   * Calculate elapsed seconds since startTimestamp (ms)
   * @param {number} startTimestamp - epoch timestamp in ms
   * @returns {number} elapsed seconds
   */
  getElapsedSeconds(startTimestamp) {
    if (!startTimestamp) return 0;
    const now = Date.now();
    return Math.max(0, Math.floor((now - startTimestamp) / 1000));
  },

  /**
   * Format duration into digital clock style (MM:SS or HH:MM:SS)
   * @param {number} totalSeconds
   * @returns {string} e.g. "14:25" or "01:32:10"
   */
  formatDigital(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    const pad = (n) => String(n).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  },

  /**
   * Format duration into human-readable Chinese text
   * @param {number} totalSeconds
   * @returns {string} e.g. "1 小時 25 分 10 秒" or "15 分 30 秒" or "45 秒"
   */
  formatReadable(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours} 小時`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes} 分`);
    parts.push(`${seconds} 秒`);

    return parts.join(' ');
  },

  /**
   * Format epoch timestamp to localized time string (HH:mm:ss)
   * @param {number} timestamp
   * @returns {string} e.g. "14:32:05"
   */
  formatTime(timestamp) {
    if (!timestamp) return '--:--:--';
    const d = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },

  /**
   * Format date object or timestamp to "YYYY-MM-DD"
   * @param {Date|number} [date]
   * @returns {string} "YYYY-MM-DD"
   */
  formatDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Get formatted local time for today
   */
  getTodayString() {
    return this.formatDate(new Date());
  }
};

window.TimerUtils = TimerUtils;
