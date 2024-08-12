# image-dataset

Tool to build image dataset: collect, classify, review

[![npm Package Version](https://img.shields.io/npm/v/image-dataset)](https://www.npmjs.com/package/image-dataset)

## Key Steps

- [x] Collect images from Google Search
- [ ] Classify images with transfer learning
- [ ] Review the classify result to ensure data quality

## Features

- CLI support for ease of use
- Typescript support
- Works with plain Javascript, Typescript is not mandatory

## Installation

```bash
npm install image-dataset
```

You can also install `image-dataset` with [pnpm](https://pnpm.io/), [yarn](https://yarnpkg.com/), or [slnpm](https://github.com/beenotung/slnpm)

## Usage Example

Usage: `nxp image-dataset [options]`

**Options:**

- `-h, --help` : Show this help message and exit.
- `-v, --version` : Show the version number and exit.
- `-l, --listFile <path>` : Specify a file containing a list of search terms. Each term should be on a new line.
- `-s, --searchTerm "<term>"` : Add a single search term for processing. Use quotes if the term contains spaces.
- `-d, --downloadDir <dir>` : Set the directory where downloads will be saved.

**Notes:**

- At least one search term must be specified, either using `--listFile` or `--searchTerm`.
- If an argument is missing or incorrect, the program will terminate with an error message.

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
