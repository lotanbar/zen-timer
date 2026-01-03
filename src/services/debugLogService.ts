import * as FileSystem from 'expo-file-system';

const LOG_FILE = `${FileSystem.documentDirectory}audio_debug.log`;
const MAX_LOG_SIZE = 500 * 1024; // 500KB max, then rotate

class DebugLogService {
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isWriting = false;

  async log(tag: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${tag}] ${message}\n`;

    // Also log to console
    console.log(`[${tag}] ${message}`);

    // Buffer the log
    this.buffer.push(line);

    // Debounce writes to avoid too many disk operations
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 1000);
    }
  }

  private async flush(): Promise<void> {
    this.flushTimer = null;
    if (this.isWriting || this.buffer.length === 0) return;

    this.isWriting = true;
    const linesToWrite = [...this.buffer];
    this.buffer = [];

    try {
      // Check if file exists and its size
      const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);

      if (fileInfo.exists && fileInfo.size && fileInfo.size > MAX_LOG_SIZE) {
        // Rotate: keep last half
        const content = await FileSystem.readAsStringAsync(LOG_FILE);
        const lines = content.split('\n');
        const halfLines = lines.slice(Math.floor(lines.length / 2)).join('\n');
        await FileSystem.writeAsStringAsync(LOG_FILE, halfLines + '\n--- LOG ROTATED ---\n');
      }

      // Append new logs
      const existingContent = fileInfo.exists
        ? await FileSystem.readAsStringAsync(LOG_FILE)
        : '';
      await FileSystem.writeAsStringAsync(LOG_FILE, existingContent + linesToWrite.join(''));
    } catch (err) {
      console.error('[DebugLog] Failed to write log file:', err);
    } finally {
      this.isWriting = false;
    }
  }

  async getLogPath(): Promise<string> {
    return LOG_FILE;
  }

  async readLogs(): Promise<string> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
      if (!fileInfo.exists) return '(No logs yet)';
      return await FileSystem.readAsStringAsync(LOG_FILE);
    } catch {
      return '(Failed to read logs)';
    }
  }

  async clearLogs(): Promise<void> {
    try {
      await FileSystem.deleteAsync(LOG_FILE, { idempotent: true });
      this.buffer = [];
    } catch {
      // Ignore
    }
  }

  // Force immediate write (call before app goes to background)
  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export const debugLog = new DebugLogService();
