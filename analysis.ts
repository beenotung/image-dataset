import { db } from './db'
import { csv_to_table_text, json_to_csv } from '@beenotung/tslib/csv'

let select_counts = db.prepare(/* sql */ `
select
  keyword_id
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

let json = select_counts.all()
let csv = json_to_csv(json)
let text = csv_to_table_text(csv)

console.log(text)
