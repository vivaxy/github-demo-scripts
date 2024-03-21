/**
 * @since 2019-06-30 11:17:05
 * @author vivaxy
 */
import * as path from 'path';
import * as yargs from 'yargs';
import * as fse from 'fs-extra';
import * as glob from 'fast-glob';
import * as cheerio from 'cheerio';
import { deepEqual } from 'fast-equals';
import humanString from 'humanize-string';
import { getAllSubmodules } from '@vivaxy/git';
import { ERROR_TYPES } from '../enums';
import { createLogger, setLogLevel } from '../utils/logger';
import { createCommandBuilder } from '../utils/command-builder';

export const command = 'toc';
const logger = createLogger(command);

export interface Options {
  cwd: string;
  logLevel: number;
  linkPrefix: string;
  readmePrefix: string;
  readmeSuffix: string;
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

function getMetaContent<T>({
  relativePath,
  name,
  $parent,
  defaultContent,
  getElement,
  getContent,
  createElement,
  updateContent,
  mergeContent,
}: {
  relativePath: string;
  name: string;
  $parent: Cheerio;
  defaultContent: T;
  getElement: ($parent: Cheerio) => Cheerio;
  getContent: ($element: Cheerio) => T | null;
  createElement: (defaultContent: T) => string;
  updateContent: ($parent: Cheerio, defaultContent: T) => void;
  mergeContent: (current: T, defaultContent: T) => T;
}): { content: T; modified: boolean } {
  const $element = getElement($parent);
  if ($element.length === 0) {
    logger.info(
      `[${relativePath}] add a new ${name} tag, content = ${defaultContent}`,
    );
    $parent.append(createElement(defaultContent));
    return {
      content: defaultContent,
      modified: true,
    };
  }
  if ($element.length > 1) {
    $element.remove();
    logger.info(
      `[${relativePath}] remove all ${name} tag and add a new ${name} tag, content = ${defaultContent}`,
    );
    $parent.append(createElement(defaultContent));
    return {
      content: defaultContent,
      modified: true,
    };
  }
  const currentContent = getContent($element);
  if (!currentContent) {
    logger.info(
      `[${relativePath}] update ${name} tag, content = ${defaultContent}`,
    );
    updateContent($element, defaultContent);
    return {
      content: defaultContent,
      modified: true,
    };
  }
  const newContent = mergeContent(currentContent, defaultContent);
  if (deepEqual(newContent, currentContent)) {
    return {
      content: currentContent,
      modified: false,
    };
  }
  logger.info(`[${relativePath}] update ${name} tag, content = ${newContent}`);
  updateContent($element, newContent);
  return {
    content: defaultContent,
    modified: true,
  };
}

async function getSubmodulePaths({ cwd }: { cwd: string }) {
  const submodules = await getAllSubmodules({ cwd });
  logger.debug('submodules', submodules);
  return submodules.map(function (submodule) {
    return submodule.path;
  });
}

async function recursivelyReadMeta({
  wd,
  linkPrefix,
  relativePath,
  ignoreGlobs,
  parentKeywords,
  parentAuthor,
  parentDescription,
  parentTitle,
}: {
  wd: string;
  linkPrefix: string;
  relativePath: string;
  ignoreGlobs: string[];
  parentKeywords: string[];
  parentAuthor: string;
  parentDescription: string;
  parentTitle: string;
}): Promise<Meta | null> {
  const cwd = path.join(wd, relativePath);
  const cwdDirname = path.basename(cwd);

  const pkg = getPkg(cwd);
  const htmlPath = path.join(cwd, 'index.html');
  if (!(await fse.pathExists(htmlPath))) {
    return null;
  }

  const $ = cheerio.load(await fse.readFile(htmlPath, 'utf8'), {
    decodeEntities: false,
  });
  const $head = $('head');
  const title = getMetaContent<string>({
    relativePath,
    name: 'title',
    $parent: $head,
    defaultContent: humanString(cwdDirname),
    getElement($parent) {
      return $parent.find('title');
    },
    getContent($element) {
      return $element.html();
    },
    createElement(content) {
      return `<title>${content}</title>`;
    },
    updateContent($element, content) {
      $element.html(content);
    },
    mergeContent(current, defaultContent) {
      return current || defaultContent;
    },
  });
  const author = getMetaContent<string>({
    relativePath,
    name: 'author',
    $parent: $head,
    defaultContent: pkg.author || parentAuthor || '',
    getElement($parent) {
      return $parent.find('meta[name="author"]');
    },
    getContent($element) {
      return $element.attr('content');
    },
    createElement(content) {
      return `<meta name="author" content="${content}" />`;
    },
    updateContent($element, content) {
      $element.attr('content', content);
    },
    mergeContent(current, defaultContent) {
      return current || defaultContent;
    },
  });
  const keywords = getMetaContent<string[]>({
    relativePath,
    name: 'keywords',
    $parent: $head,
    defaultContent: Array.from(
      new Set([...parentKeywords, ...(pkg.keywords || []), cwdDirname]),
    ),
    getElement($parent) {
      return $parent.find('meta[name="keywords"]');
    },
    getContent($element) {
      const keywords = ($element.attr('content') || '')
        .split(',')
        .map((kw) => kw.trim());
      return Array.from(new Set(keywords));
    },
    createElement(content) {
      return `<meta name="keywords" content="${content.join(',')}" />`;
    },
    updateContent($element, content) {
      $element.attr('content', content.join(','));
    },
    mergeContent(current, defaultContent) {
      const keywordsSet = new Set(current);
      defaultContent.forEach(function (kw) {
        keywordsSet.add(kw);
      });
      return Array.from(keywordsSet);
    },
  });
  const desc = getMetaContent<string>({
    relativePath,
    name: 'description',
    $parent: $head,
    defaultContent: pkg.description || title.content || parentDescription || '',
    getElement($parent) {
      return $parent.find('meta[name="description"]');
    },
    getContent($element) {
      return $element.attr('content');
    },
    createElement(content) {
      return `<meta name="description" content="${content}" />`;
    },
    updateContent($element, content) {
      $element.attr('content', content);
    },
    mergeContent(current, defaultContent) {
      return current || defaultContent;
    },
  });

  if (title.modified || author.modified || keywords.modified || desc.modified) {
    await fse.outputFile(htmlPath, $.html());
  }

  const link = linkPrefix + path.join(relativePath) + '/';

  const dirs = await glob([...ignoreGlobs, '*'], {
    cwd: path.join(wd, relativePath),
    onlyDirectories: true,
  });
  const rawChildren = await Promise.all(
    dirs.map(async function (dir) {
      return await recursivelyReadMeta({
        wd,
        linkPrefix,
        relativePath: path.join(relativePath, dir),
        ignoreGlobs: ['!node_modules'],
        parentKeywords: keywords.content,
        parentAuthor: author.content,
        parentDescription: desc.content,
        parentTitle: title.content,
      });
    }),
  );
  const children = rawChildren.filter(function (child) {
    return child !== null;
  }) as Meta[];

  logger.debug(
    'meta:',
    relativePath,
    '; title:',
    title.content,
    '; desc:',
    desc.content,
    '; author:',
    author.content,
    '; keywords:',
    keywords.content.join(', '),
    '; link:',
    link,
    '; children:',
    children
      .map(function (child) {
        return child.title;
      })
      .join(', '),
  );

  return {
    title: title.content,
    author: author.content,
    keywords: keywords.content,
    desc: desc.content,
    relativePath,
    link,
    children,
  };
}

function recursivelyCreateTOC(meta: Meta, depth: number) {
  const childrenTOC: string = meta.children
    .map(function (child) {
      return recursivelyCreateTOC(child, depth + 1);
    })
    .join('');
  if (depth < 0) {
    return childrenTOC;
  }
  const toc = `${'  '.repeat(depth)}* [${meta.title}](${meta.link}) ${
    meta.desc
  }`;
  return toc + '\n' + childrenTOC;
}

function trimStart(str: string, search: string) {
  while (str.startsWith(search)) {
    str = str.slice(search.length);
  }
  return str;
}

function trimEnd(str: string, search: string) {
  while (str.endsWith(search)) {
    str = str.slice(0, -search.length);
  }
  return str;
}

function trim(str: string, search: string) {
  return trimEnd(trimStart(str, search), search);
}

function getContent(readmePrefix: string, toc: string, readmeSuffix: string) {
  toc = trim(toc, '\n');
  readmePrefix = trimEnd(readmePrefix, '\n');
  readmeSuffix = trimStart(readmeSuffix, '\n');
  if (!readmePrefix && !readmeSuffix) {
    return toc;
  }
  if (!readmePrefix) {
    return toc + '\n\n' + readmeSuffix;
  }
  if (!readmeSuffix) {
    return readmePrefix + '\n\n' + toc;
  }
  return readmePrefix + '\n\n' + toc + '\n\n' + readmeSuffix;
}

function getPkg(cwd: string) {
  const pkgPath = path.join(cwd, 'package.json');
  try {
    return require(pkgPath);
  } catch (e) {
    return {
      keywords: [],
      author: '',
      description: '',
    };
  }
}

async function generateReadme(
  cwd: string,
  meta: Meta,
  readmePrefix: string,
  readmeSuffix: string,
): Promise<void> {
  const toc =
    'Table of contents\n=================\n\n' + recursivelyCreateTOC(meta, -1);
  let content =
    getContent(readmePrefix, toc, readmeSuffix) +
    '\n\n#\n\nTOC generated by [@vivaxy/github-pages-scripts](https://github.com/vivaxy/github-pages-scripts)\n';
  const readmePath = path.join(cwd, 'README.md');
  logger.debug('output', content, 'to', readmePath);
  return await fse.outputFile(readmePath, content);
}

export const desc = 'Generate TOC in Readme.md and normalize HTML tags';

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
    readmePrefix: {
      type: 'string',
      desc: 'readme content before TOC',
      default: '',
    },
    readmeSuffix: {
      type: 'string',
      desc: 'readme content after TOC',
      default: '',
    },
  });
}

export async function handler({
  cwd,
  logLevel,
  linkPrefix,
  readmePrefix,
  readmeSuffix,
}: Options) {
  setLogLevel(logLevel);
  logger.debug(
    'cwd',
    cwd,
    'logLevel',
    logLevel,
    'linkPrefix',
    linkPrefix,
    'readmePrefix',
    readmePrefix,
    'readmeSuffix',
    readmeSuffix,
  );
  if (!(await fse.pathExists(cwd))) {
    throw new Error(ERROR_TYPES.INVALID_CWD);
  }
  const submodulePaths = await getSubmodulePaths({ cwd });
  logger.debug('submodulePaths', submodulePaths);

  const pkg = getPkg(cwd);
  const meta = await recursivelyReadMeta({
    wd: cwd,
    linkPrefix,
    relativePath: '.',
    ignoreGlobs: submodulePaths.map((s) => `!${s}`).concat('!node_modules'),
    parentKeywords: pkg.keywords || [],
    parentAuthor: pkg.author || '',
    parentDescription: pkg.description || '',
    parentTitle: humanString(path.dirname(cwd)),
  });

  if (!meta) {
    throw new Error(ERROR_TYPES.INVALID_META);
  }
  await generateReadme(cwd, meta, readmePrefix, readmeSuffix);
}
