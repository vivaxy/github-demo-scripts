/**
 * @since 2019-06-30 11:17:05
 * @author vivaxy
 */
import * as path from 'path';
import * as fse from 'fs-extra';
import * as glob from 'fast-glob';
import * as cheerio from 'cheerio';
import { deepEqual } from 'fast-equals';
import humanString from 'humanize-string';
import { ERROR_TYPES } from '../enums';
import * as log from 'log-util';

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
    log.info(
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
    log.info(
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
    log.info(
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
  log.info(`[${relativePath}] update ${name} tag, content = ${newContent}`);
  updateContent($element, newContent);
  return {
    content: defaultContent,
    modified: true,
  };
}

async function recursivelyReadMeta({
  cwd,
  linkPrefix,
  relativePath,
}: {
  cwd: string;
  linkPrefix: string;
  relativePath: string;
}): Promise<Meta | null> {
  const dirs = await glob(['!node_modules', '*'], {
    cwd: path.join(cwd, relativePath),
    onlyDirectories: true,
  });
  const rawChildren = await Promise.all(
    dirs.map(async function(dir) {
      return await recursivelyReadMeta({
        cwd,
        linkPrefix,
        relativePath: path.join(relativePath, dir),
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

  const pkgPath = path.join(cwd, 'package.json');
  if (!(await fse.pathExists(pkgPath))) {
    throw new Error(ERROR_TYPES.MISSING_PACKAGE_JSON);
  }
  const pkg = require(pkgPath);
  const cwdDirname = path.basename(path.join(cwd, relativePath));

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
    defaultContent: pkg.author || '',
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
    defaultContent: Array.from(new Set([...pkg.keywords, cwdDirname])),
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
      defaultContent.forEach(function(kw) {
        keywordsSet.add(kw);
      });
      return Array.from(keywordsSet);
    },
  });
  const desc = getMetaContent<string>({
    relativePath,
    name: 'description',
    $parent: $head,
    defaultContent: title.content || pkg.description || '',
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

  const link = linkPrefix + path.join(relativePath, 'index.html');
  log.debug(
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
      .map(function(child) {
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
    .map(function(child) {
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
    '\n\n_(TOC generated by [@vivaxy/github-demo-scripts](https://github.com/vivaxy/github-demo-scripts))_\n';
  const readmePath = path.join(cwd, 'README.md');
  log.debug('output', content, 'to', readmePath);
  return await fse.outputFile(readmePath, content);
}

export default async function toc({
  cwd,
  logLevel,
  linkPrefix,
  readmePrefix,
  readmeSuffix,
}: Options) {
  log.setLevel(logLevel);
  log.debug(
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
  const meta = await recursivelyReadMeta({
    cwd,
    linkPrefix,
    relativePath: '.',
  });
  // log.debug('meta', meta);
  if (!meta) {
    throw new Error(ERROR_TYPES.INVALID_META);
  }
  await generateReadme(cwd, meta, readmePrefix, readmeSuffix);
}
