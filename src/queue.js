/**
 * Task Queue Manager
 * 
 * 用于管理并发任务，避免资源过度消耗
 * - 限制并发任务数量
 * - 队列等待执行
 * - 重试失败的任务
 */

class TaskQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0
    };
  }

  /**
   * 添加任务到队列
   * @param {Function} fn - 异步函数
   * @param {Array} args - 函数参数
   * @param {Number} maxRetries - 最大重试次数
   */
  async add(fn, args = [], maxRetries = 2) {
    return new Promise((resolve, reject) => {
      const task = {
        fn,
        args,
        maxRetries,
        attempts: 0,
        resolve,
        reject
      };
      
      this.queue.push(task);
      this.stats.total++;
      this.process();
    });
  }

  async process() {
    // 如果已达到并发限制，等待
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();

    try {
      const result = await task.fn(...task.args);
      this.stats.completed++;
      task.resolve(result);
    } catch (err) {
      task.attempts++;

      // 重试失败的任务
      if (task.attempts < task.maxRetries) {
        console.log(`Task failed (attempt ${task.attempts}/${task.maxRetries}), retrying...`);
        // 重新加入队列进行重试
        this.queue.push(task);
      } else {
        this.stats.failed++;
        console.error(`Task failed after ${task.attempts} attempts:`, err.message);
        task.reject(err);
      }
    } finally {
      this.running--;
      // 继续处理队列中的下一个任务
      setImmediate(() => this.process());
    }
  }

  /**
   * 获取队列统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queued: this.queue.length,
      running: this.running,
      pending: this.queue.length + this.running
    };
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
  }

  /**
   * 等待所有任务完成
   */
  async drain() {
    return new Promise(resolve => {
      const check = () => {
        if (this.running === 0 && this.queue.length === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

module.exports = TaskQueue;
