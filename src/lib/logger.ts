import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {
        // JSON output for production — no transport needed
      }),
});

export default logger;
