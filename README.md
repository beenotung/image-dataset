# image-dataset

Tool to build image dataset: collect, classify, review

[![npm Package Version](https://img.shields.io/npm/v/image-dataset)](https://www.npmjs.com/package/image-dataset)

## Key Steps

- [x] Collect images from Google Search
- [x] Augment images to increase robustness (using [augment-image](https://github.com/beenotung/augment-image) cli)
- [x] Classify images with transfer learning
- [x] Review the classify result to ensure data quality and evaluate model accuracy

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

Usage: `npx image-dataset [options]`

### Cli Options

**General:**

- `-h, --help` : Show this help message and exit.
- `-v, --version` : Show the version number and exit.

**Download Mode:**

- `-l, --listFile <path>` : Specify a file containing a list of search terms. Each term should be on a new line.
- `-s, --searchTerm "<term>"` : Add a single search term for processing. Use quotes if the term contains spaces.
- `-d, --downloadDir <dir>` : Set the directory where downloads will be saved. Default is "./downloaded".

**Analysis Mode:**

- `-a, --analysis`: Run analysis mode instead of download mode.

**Rename Mode:**

- `-r, --rename`: Rename image filenames by content hash.
- `-u, --restore`: Restore unclassified images to downloaded directory.

**Web UI Mode:**

- `-w, --webUI`: Launch the web-based user interface.
- `-p, --port <number>`: Set the port for the web UI. Default is 8100.
- `-d, --difficulty <number>`: Set the difficulty for image classifier model. Over-complex setting may result in over-fitting.
  - 1 for low complexity (default)
  - 2-3 for moderate complexity
  - 4-5 for high complexity

**Notes:**

- In download mode, at least one search term must be specified, either using `--listFile` or `--searchTerm`.
- A mode is automatically selected when a mode-specific option is given. If none are selected, the help message will guide you.

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
