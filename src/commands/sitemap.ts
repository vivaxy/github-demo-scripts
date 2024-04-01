/**
 * @since 2024-03-21
 * @author vivaxy
 */
import * as execa from 'execa';
import * as path from 'path';
import * as yargs from 'yargs';
import * as fse from 'fs-extra';
import { SitemapStream, streamToPromise } from 'sitemap';
import { setLogLevel, createLogger } from '../utils/logger';
import { createCommandBuilder } from '../utils/command-builder';

type Options = {
  cwd: string;
  logLevel: number;
  linkPrefix: string;
};

export const command = 'sitemap';
export const desc = 'Generate sitemap.xml';
const logger = createLogger(command);

export async function builder(yargs: yargs.Argv<Options>) {
  return await createCommandBuilder<Options>(yargs, {
    cwd: {
      type: 'string',
      default: process.cwd(),
      desc: 'working directory',
    },
    logLevel: {
      type: 'number',
      default: 1,
      desc: 'log level',
    },
    linkPrefix: {
      type: 'string',
      demandOption: 'linkPrefix is required',
      desc: 'link prefix',
    },
  });
}

type Page = {
  url: string;
  lastModified: string;
};

async function getLastModifiedTime(wd: string): Promise<string> {
  const { stdout: diff } = await execa.command(`git status --short -- ${wd}`);
  if (diff) {
    return new Date().toISOString();
  }
  const { stdout: dateString } = await execa.command(
    `git log -1 --date=local --format="%aI" -- ${wd}`,
    {
      shell: true,
    },
  );
  return dateString;
}

/**
 * @ref https://webmasters.stackexchange.com/questions/18243/can-a-sitemap-index-contain-other-sitemap-indexes
 *  > Incorrect Sitemap index format: Nested Sitemap indexes
 *
 * - Read root `menu.json`
 * - Visit each `item.link`, if any directory contains `menu.json`, mark as a page.
 * - Collect every page, generate one big sitemap.
 * - Concat `loc` with host.
 * - Create `lastmod` with `git log -1 --date=local --format="%as" -- ${path}`
 */
async function getSitemapData({
  wd,
  url,
}: {
  wd: string;
  url: string;
}): Promise<Array<Page>> {
  const menuJSONPath = path.join(wd, 'menu.json');
  if (!(await fse.pathExists(menuJSONPath))) {
    const lastModified = await getLastModifiedTime(wd);
    const page = { url, lastModified };
    logger.debug('page', page);
    return [page];
  }
  const json = await fse.readJSON(menuJSONPath);
  const results: Array<Array<Page>> = await Promise.all(
    json.map(async function ({
      link,
    }: {
      name: string;
      link: string;
    }): Promise<Array<Page>> {
      const parsedLink = path.parse(link);
      const subPath = parsedLink.ext ? path.dirname(link) : link;
      const localWd = path.join(wd, subPath);
      const subURL = path.join(url, link);
      if (localWd === wd) {
        logger.warn('wrong link', wd, link);
        return [];
      }
      return await getSitemapData({ wd: localWd, url: subURL });
    }),
  );
  return results.flat();
}

export async function handler({ cwd, logLevel, linkPrefix }: Options) {
  setLogLevel(logLevel);
  logger.debug('cwd', cwd, 'logLevel', logLevel, 'linkPrefix', linkPrefix);

  const sitemapData = await getSitemapData({ wd: cwd, url: '' });
  const sitemap = new SitemapStream({
    hostname: linkPrefix,
    xmlns: {
      news: false,
      xhtml: false,
      image: false,
      video: false,
    },
  });
  sitemapData.forEach(function ({ url, lastModified }) {
    sitemap.write({ url, lastmod: lastModified });
  });
  sitemap.end();
  const buffer = await streamToPromise(sitemap);
  await fse.writeFile(path.join(cwd, 'sitemap.xml'), buffer.toString());
}
