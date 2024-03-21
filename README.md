# @vivaxy/github-pages-scripts

[![Build Status][travis-image]][travis-url]
[![NPM Version][npm-version-image]][npm-url]
[![NPM Downloads][npm-downloads-image]][npm-url]
[![MIT License][license-image]][license-url]
[![Standard Version][standard-version-image]][standard-version-url]
[![Codecov][codecov-image]][codecov-url]

# Usage

## Run in standalone

`npx @vivaxy/github-pages-scripts`

## Install and run with pre-commit hook

1. `npm install @vivaxy/github-pages-scripts husky --save-dev`
2. Edit `package.json`

```diff
{
+ "husky": {
+   "hooks": {
+     "pre-commit": "gps toc && gps sitemap && git add ."
+   }
+ }
}
```

# Config

## readme-prefix

Readme prefix string.

## readme-suffix

Readme suffix string.

## link-prefix

Site root path. As the link prefix.

#

Project created by [create-n](https://github.com/vivaxy/create-n).

[travis-image]: https://img.shields.io/travis/vivaxy/github-pages-scripts.svg?style=flat-square
[travis-url]: https://travis-ci.org/vivaxy/github-pages-scripts
[npm-version-image]: https://img.shields.io/npm/v/@vivaxy/github-pages-scripts.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/@vivaxy/github-pages-scripts
[npm-downloads-image]: https://img.shields.io/npm/dt/@vivaxy/github-pages-scripts.svg?style=flat-square
[license-image]: https://img.shields.io/npm/l/@vivaxy/github-pages-scripts.svg?style=flat-square
[license-url]: LICENSE
[standard-version-image]: https://img.shields.io/badge/release-standard%20version-brightgreen.svg?style=flat-square
[standard-version-url]: https://github.com/conventional-changelog/standard-version
[codecov-image]: https://img.shields.io/codecov/c/github/vivaxy/github-pages-scripts.svg?style=flat-square
[codecov-url]: https://codecov.io/gh/vivaxy/github-pages-scripts
