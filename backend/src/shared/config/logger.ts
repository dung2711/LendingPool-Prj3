import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getFileSink } from "@logtape/file";
import {
  configure,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
  type Logger,
  type LogLevel,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import type { BaseEnv } from "./env";

export type AppName =
  | "http-server"
  | "blc-indexer"
  | "blc-worker"
  | "croner"
  | "noti-worker";

const logFileConfig = {
  maxSize: 10 * 1024 * 1024, // 10MB per file
  formatter: getJsonLinesFormatter(),
  nonBlocking: true,
};
const LOG_DIR = join(process.cwd(), "logs");

async function ensureLogDirectory(): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
}

export async function configureLogger(deps: {
  env: Pick<BaseEnv, "NODE_ENV" | "LOG_LEVEL">;
  appName: AppName;
}): Promise<void> {
  await ensureLogDirectory();

  const { env, appName } = deps;
  const logFile = join(LOG_DIR, `${appName}.log`);
  const lowestLevel = env.LOG_LEVEL.toLowerCase() as LogLevel;

  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: getPrettyFormatter({
          colors: env.NODE_ENV !== "production",
          timestamp: "date-time-tz",
        }),
      }),
      file: getFileSink(logFile, logFileConfig),
    },
    loggers: [
      {
        category: [appName],
        lowestLevel,
        sinks: ["console", "file"],
      },
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: ["console"],
      },
    ],
  });
}

export function getAppLogger(appName: AppName): Logger {
  return getLogger([appName]);
}
