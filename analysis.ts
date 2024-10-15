import { existsSync } from 'fs'
import { config } from './config'
import { db } from './db'
import { csv_to_table_text, json_to_csv } from '@beenotung/tslib/csv'
import { join } from 'path'
import { format_percentage } from '@beenotung/tslib/format'
import { getDirFilenamesSync } from '@beenotung/tslib/fs'

let select_counts = db.prepare<
  void[],
  {
    id: number
    keyword: string
    image_count: number
    page_count: number
    site_count: number
  }
>(/* sql */ `
select
  keyword_id as id
, keyword
, count(distinct image.id) as image_count
, count(distinct page_id) as page_count
, count(distinct domain_id) as site_count
from image
inner join keyword on keyword.id = keyword_id
inner join page on page.id = page_id
group by keyword_id
order by keyword_id asc
`)

function scanImageDir(dir: string) {
  let filenames = getDirFilenamesSync(dir)

  let downloaded = filenames.length
  let removed = 0

  let removeDirnames = ['remove', 'removed', 'delete', 'deleted']
  for (let removeDirname of removeDirnames) {
    downloaded--
    if (filenames.includes(removeDirname)) {
      removed += getDirFilenamesSync(join(dir, removeDirname)).length
    }
  }

  let passed = downloaded - removed

  return {
    downloaded,
    passed: `${passed} (${format_percentage(passed / downloaded)})`,
    removed: `${removed} (${format_percentage(removed / downloaded)})`,
  }
}

export function analysis() {
  let rows: { keyword: string }[] = select_counts.all()
  if (rows.length == 0 && existsSync(config.rootDir)) {
    let keywords = getDirFilenamesSync(config.rootDir)
    rows = keywords.map(keyword => ({ keyword }))
  }
  if (rows.length == 0) {
    console.error('Error: no images downloaded yet')
    process.exit(1)
  }
  for (let row of rows) {
    let dir = join(config.rootDir, row.keyword)
    if (!existsSync(dir)) {
      continue
    }
    let extra = scanImageDir(dir)
    Object.assign(row, extra)
  }
  showTable(rows)
}

function showTable(rows: object[]) {
  let csv = json_to_csv(rows)
  let text = csv_to_table_text(csv)
  console.log(text)
}

if (process.argv[1] == __filename) {
  analysis()
}
