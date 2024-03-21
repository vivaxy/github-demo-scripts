#!/usr/bin/env node

import * as yargs from 'yargs';
import * as log from 'log-util';
import * as updateNotifier from 'update-notifier';

function configureYargs() {
  yargs.commandDir('commands').demandCommand().help().version().argv;
}

(function () {
  try {
    configureYargs();
    updateNotifier({ pkg: require('../package.json') }).notify();
  } catch (e) {
    log.error(e.message);
    log.debug(e.stack);
    process.exit(1);
  }
})();
