/**
 * @since 2024-03-21
 * @author vivaxy
 */
import chalk from 'chalk';
import * as figures from 'figures';
import * as logSymbols from 'log-symbols';
import { createLogger, levels, setLevel } from 'log-util';

function createLoggerInner(commandName: string) {
  const debug = createLogger(
    levels.debug,
    `${chalk.grey(
      figures.pointerSmall,
    )} @vivaxy/github-pages-scripts:${commandName}`,
  );
  const info = createLogger(
    levels.info,
    `${logSymbols.info} @vivaxy/github-pages-scripts:${commandName}`,
  );
  const success = createLogger(
    levels.success,
    `${logSymbols.success} @vivaxy/github-pages-scripts:${commandName}`,
  );
  const warn = createLogger(
    levels.warn,
    `${logSymbols.warning} @vivaxy/github-pages-scripts:${commandName}`,
  );
  const error = createLogger(
    levels.error,
    `${logSymbols.error} @vivaxy/github-pages-scripts:${commandName}`,
  );

  return {
    debug,
    info,
    success,
    warn,
    error,
  };
}

export { createLoggerInner as createLogger, setLevel as setLogLevel };
