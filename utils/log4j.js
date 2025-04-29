/**
 * 日志存储的封装
 */

const log4js = require("log4js");
// 定义常量
const levels = {
  trace: log4js.levels.TRACE,
  debug: log4js.levels.DEBUG,
  info: log4js.levels.INFO,
  warn: log4js.levels.WARN,
  error: log4js.levels.ERROR,
  fatal: log4js.levels.FATAL,
};
log4js.configure({
  // 追加器 相当于配置不能类型我要打印到哪里
  appenders: {
    console: { type: "console" },
    info: { type: "file", filename: "logs/all-logs.log" },
    // 文件名追加年月日
    error: {
      type: "dateFile",
      filename: "logs/log",
      parent: "yyyy-MM-dd.log",
      alwaysIncludePattern: true,
    },
  },
  categories: {
    default: { appenders: ["console"], level: "debug" },
    info: { appenders: ["info", "console"], level: "info" },
    error: { appenders: ["console", "error"], level: "error" },
  },
});
/**
 * 日志输出
 * @param {string} content
 */
exports.debug = (content) => {
  let logger = log4js.getLogger();
  logger.level = levels.debug;
  logger.debug(content);
};
exports.info = (content) => {
  let logger = log4js.getLogger("info");
  logger.level = levels.info;
  logger.info(content);
};
exports.error = (content) => {
  let logger = log4js.getLogger("error");
  logger.level = levels.error;
  logger.error(content);
};
