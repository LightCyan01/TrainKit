import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

export type LogLevel = "debug" | "info" | "success" | "warning" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

class Logger {
  private logDir: string;
  private logFile: string;
  private sessionId: string;
  private writeStream: fs.WriteStream | null = null;
  private listeners: Array<(entry: LogEntry) => void> = [];

  constructor() {
    // Create logs folder in user data directory
    this.logDir = path.join(app.getPath("userData"), "logs");
    
    // Generate session ID with timestamp
    const now = new Date();
    this.sessionId = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.logFile = path.join(this.logDir, `session-${this.sessionId}.log`);
    
    this.ensureLogDir();
    this.initWriteStream();
    this.cleanOldLogs();
    
    this.info("logger", `Log file: ${this.logFile}`);
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private initWriteStream(): void {
    try {
      this.writeStream = fs.createWriteStream(this.logFile, { flags: "a" });
      this.writeStream.on("error", (err) => {
        console.error(`[Logger] Write stream error: ${err.message}`);
      });
    } catch (err) {
      console.error(`[Logger] Failed to create log file: ${err}`);
    }
  }

  private cleanOldLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith("session-") && f.endsWith(".log"))
        .sort()
        .reverse();
      
      for (let i = 10; i < files.length; i++) {
        fs.unlinkSync(path.join(this.logDir, files[i]));
      }
    } catch {
      // Ignore
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatLogLine(entry: LogEntry): string {
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`;
  }

  private write(level: LogLevel, source: string, message: string): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      source,
      message,
    };

    const line = this.formatLogLine(entry);
    
    console.log(line);
    
    if (this.writeStream) {
      this.writeStream.write(line + "\n");
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Ignore
      }
    }
  }

  debug(source: string, message: string): void {
    this.write("debug", source, message);
  }

  info(source: string, message: string): void {
    this.write("info", source, message);
  }

  success(source: string, message: string): void {
    this.write("success", source, message);
  }

  warning(source: string, message: string): void {
    this.write("warning", source, message);
  }

  error(source: string, message: string): void {
    this.write("error", source, message);
  }

  addListener(callback: (entry: LogEntry) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getLogFilePath(): string {
    return this.logFile;
  }

  getLogsDir(): string {
    return this.logDir;
  }

  readCurrentLog(): string {
    try {
      return fs.readFileSync(this.logFile, "utf-8");
    } catch {
      return "";
    }
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

export function closeLogger(): void {
  if (loggerInstance) {
    loggerInstance.close();
    loggerInstance = null;
  }
}

export type { LogEntry };
