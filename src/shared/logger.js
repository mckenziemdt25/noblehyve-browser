const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs');
    this.sessionId = Date.now().toString();
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFile() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `noblehyve-${date}.log`);
  }

  write(level, message, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      level,
      message,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code
        }
      })
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(this.getLogFile(), logLine);
    
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${level}] ${message}`, error || '');
    }
  }

  info(message) {
    this.write('INFO', message);
  }

  warn(message) {
    this.write('WARN', message);
  }

  error(message, error) {
    this.write('ERROR', message, error);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      this.write('DEBUG', message, data);
    }
  }
}

module.exports = new Logger();