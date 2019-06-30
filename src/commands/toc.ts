/**
 * @since 2019-06-30 11:17:05
 * @author vivaxy
 */
import * as path from 'path';
import * as fse from 'fs-extra';
import * as glob from 'fast-glob';
import * as cheerio from 'cheerio';
import { ERROR_TYPES } from '../enums';
import * as log from 'log-util';

export interface Options {
  cwd: string;
  logLevel: number;
  linkPrefix: string;
  keywords: string[];
  readme: string;
}

interface Meta {
  relativePath: string;
  keywords: string[];
  author: string;
  title: string;
  desc: string;
  link: string;
  children: Meta[];
}

async function recursivelyReadMeta({
  cwd,
  linkPrefix,
  relativePath,
  keywords: requiredKeywords,
}: {
  cwd: string;
  linkPrefix: string;
  relativePath: string;
  keywords: string[];
}): Promise<Meta | null> {
  const dirs = await glob(['*'], {
    cwd: path.join(cwd, relativePath),
    onlyDirectories: true,
  });
  const rawChildren = await Promise.all(
    dirs.map(async function(dir) {
      return await recursivelyReadMeta({
        cwd,
        linkPrefix,
        relativePath: path.join(relativePath, dir),
        keywords: requiredKeywords,
      });
    }),
  );
  const children = rawChildren.filter(function(child) {
    return child !== null;
  }) as Meta[];
  const htmlPath = path.join(cwd, relativePath, 'index.html');
  if (!(await fse.pathExists(htmlPath))) {
    return null;
  }
  const $ = cheerio.load(await fse.readFile(htmlPath, 'utf8'));
  const $head = $('head');
  const desc = $head.find('meta[name="description"]').attr('content');
  const keywordsString = $head.find('meta[name="keywords"]').attr('content');
  const author = $head.find('meta[name="author"]').attr('content');
  const title = $head.find('title').html();

  function warn(message: string) {
    log.warn(relativePath + '/index.html', message);
  }

  if (!author) {
    warn(`add <meta name="author" content="YOUR_NAME"/>`);
    throw new Error(ERROR_TYPES.INVALID_META);
  }
  if (!keywordsString) {
    warn(
      `add <meta name="keywords" content="YOUR_NAME,PROJECT_NAME,OTHER_KEYWORD"/>`,
    );
    throw new Error(ERROR_TYPES.INVALID_META);
  }
  if (!desc) {
    warn(`add <meta name="description" content="project description"/>`);
    throw new Error(ERROR_TYPES.INVALID_META);
  }
  if (!title) {
    warn(`add <title>PROJECT_NAME</title>`);
    throw new Error(ERROR_TYPES.INVALID_META);
  }
  const keywords = keywordsString.split(',').map((kw) => kw.trim());
  for (const requiredKeyword of requiredKeywords) {
    if (!keywords.includes(requiredKeyword)) {
      warn(`add keyword ${requiredKeyword}`);
      throw new Error(ERROR_TYPES.MISSING_KEYWORD);
    }
  }
  const link = linkPrefix + path.join(relativePath, 'index.html');
  log.debug(
    'meta:',
    relativePath,
    '; title:',
    title,
    '; desc:',
    desc,
    '; author:',
    author,
    '; keywords:',
    keywords.join(', '),
    '; link:',
    link,
    '; children:',
    children
      .map(function(child) {
        return child.title;
      })
      .join(', '),
  );

  return {
    title,
    desc,
    author,
    keywords,
    relativePath,
    link,
    children,
  };
}

function recursivelyCreateTOC(meta: Meta, depth: number) {
  const toc = `${'  '.repeat(depth)}* [${meta.title}](${meta.link}) ${
    meta.desc
  }`;
  const childrenTOC: string = meta.children
    .map(function(child) {
      return recursivelyCreateTOC(child, depth + 1);
    })
    .join('');
  return toc + '\n' + childrenTOC;
}

function getContent(readme: string, toc: string) {
  if (!readme) {
    return toc;
  }
  if (readme.endsWith('\n\n')) {
    return readme + toc;
  }
  if (readme.endsWith('\n')) {
    return readme + '\n' + toc;
  }
  return readme + '\n\n' + toc;
}

async function generateReadme(
  cwd: string,
  meta: Meta,
  readme: string,
): Promise<void> {
  const toc =
    'Table of contents\n=================\n\n' + recursivelyCreateTOC(meta, 0);
  let content = getContent(readme, toc);
  const readmePath = path.join(cwd, 'README.md');
  log.debug('output', content, 'to', readmePath);
  return await fse.outputFile(readmePath, content);
}

export default async function toc({
  cwd,
  logLevel,
  linkPrefix,
  keywords,
  readme,
}: Options) {
  log.setLevel(logLevel);
  log.debug(
    'cwd',
    cwd,
    'logLevel',
    logLevel,
    'linkPrefix',
    linkPrefix,
    'keywords',
    keywords,
    'readme',
    readme,
  );
  if (!(await fse.pathExists(cwd))) {
    throw new Error(ERROR_TYPES.INVALID_CWD);
  }
  const meta = await recursivelyReadMeta({
    cwd,
    linkPrefix,
    relativePath: '.',
    keywords,
  });
  // log.debug('meta', meta);
  if (!meta) {
    throw new Error(ERROR_TYPES.INVALID_META);
  }
  await generateReadme(cwd, meta, readme);
}
