/**
 * Logger Module
 * 
 * 统一日志记录和管理
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || './logs';
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 10;
    
        // 确保日志目录存在 (仅在非 Vercel 环境下)
    if (!process.env.VERCEL && !fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (e) {
        console.warn('Could not create log directory (likely readonly fs):', e.message);
      }
    }

    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };

    this.currentLevel = this.levels[process.env.LOG_LEVEL || 'INFO'];
  }

  /**
   * 获取当前日志文件路径
   */
  getLogPath() {
    if (process.env.VERCEL) return null; // Vercel 不使用文件日志
    
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return path.join(this.logDir, `scheduler-${year}${month}${day}.log`);
  }

  /**
   * 轮转日志文件
   */
  rotateIfNeeded() {
    if (process.env.VERCEL) return;
    
    const logPath = this.getLogPath();
    if (!logPath) return;

    try {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size > this.maxSize) {
          const timestamp = Date.now();
          const backupPath = logPath.replace('.log', `-${timestamp}.log`);
          fs.renameSync(logPath, backupPath);
          
          // 清理旧文件
          this.cleanupOldLogs();
        }
      }
    } catch (e) {
      // ignore fs errors in restricted envs
    }
  }

  /**
   * 清理旧日志文件
   */
  cleanupOldLogs() {
    if (process.env.VERCEL) return;
    try {
      if (!fs.existsSync(this.logDir)) return;
      
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('scheduler-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // 保留最近的maxFiles个文件
      for (let i = this.maxFiles; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
      }
    } catch (err) {
      console.error('Error cleaning up old logs:', err);
    }
  }

  /**
   * 写入日志
   */
  write(level, message, meta = {}) {
    if (this.levels[level] < this.currentLevel) {
      return;
    }

    // 同时输出到控制台
    const prefix = {
      DEBUG: '🔍',
      INFO: 'ℹ️',
      WARN: '⚠️',
      ERROR: '❌'
    }[level];

    console.log(`${prefix} [${level}] ${message}`, meta);

    // 如果是 Vercel 环境，直接返回，不写入文件
    if (process.env.VERCEL) return;

    try {
      this.rotateIfNeeded();

      const timestamp = new Date().toISOString();
      const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
      const logMessage = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

      const logPath = this.getLogPath();
      if (logPath) {
        fs.appendFileSync(logPath, logMessage);
      }
    } catch (e) {
      // ignore file write errors
    }
  }

  debug(message, meta) {
    this.write('DEBUG', message, meta);
  }

  info(message, meta) {
    this.write('INFO', message, meta);
  }

  warn(message, meta) {
    this.write('WARN', message, meta);
  }

  error(message, meta) {
    this.write('ERROR', message, meta);
  }

  /**
   * 获取最近的日志内容
   */
    getRecentLogs(lines = 100) {
    if (process.env.VERCEL) return []; // Vercel has no local logs
    try {
      const logPath = this.getLogPath();
      
      if (!logPath || !fs.existsSync(logPath)) {
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf8');
      return content.split('\n').filter(Boolean).slice(-lines);
    } catch (err) {
      console.error('Error reading logs:', err);
      return [];
    }
  }

  /**
   * 获取所有日志文件列表
   */
    getLogFiles() {
    if (process.env.VERCEL) return [];
    try {
      if (!fs.existsSync(this.logDir)) return [];
      return fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('scheduler-') && f.endsWith('.log'))
        .map(f => {
          const filePath = path.join(this.logDir, f);
          const stats = fs.statSync(filePath);
          return {
            name: f,
            size: stats.size,
            modified: stats.mtime,
            path: f
          };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch (err) {
      console.error('Error listing logs:', err);
      return [];
    }
  }
}

module.exports = new Logger();
