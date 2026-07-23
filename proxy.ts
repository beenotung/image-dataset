/**
 * This file is auto generated, do not edit it manually.
 *
 * update command: npm run db:update
 */

import { proxySchema } from 'better-sqlite3-proxy'
import { db } from './db'

export type Keyword = {
  id?: null | number
  keyword: string
  complete_time: null | number
}

export type Domain = {
  id?: null | number
  domain: string
}

export type Page = {
  id?: null | number
  url: string
  domain_id: number
  domain?: Domain
}

export type Image = {
  id?: null | number
  page_id: null | number
  page?: Page
  filename: string
  keyword_id: null | number
  keyword?: Keyword
  alt: null | string
  embedding: null | string
}

export type ImageKeyword = {
  id?: null | number
  image_id: number
  image?: Image
  keyword_id: number
  keyword?: Keyword
}

export type ImagePage = {
  id?: null | number
  image_id: number
  image?: Image
  page_id: number
  page?: Page
}

export type DBProxy = {
  keyword: Keyword[]
  domain: Domain[]
  page: Page[]
  image: Image[]
  image_keyword: ImageKeyword[]
  image_page: ImagePage[]
}

export let proxy = proxySchema<DBProxy>({
  db,
  tableFields: {
    keyword: [],
    domain: [],
    page: [
      /* foreign references */
      ['domain', { field: 'domain_id', table: 'domain' }],
    ],
    image: [
      /* foreign references */
      ['page', { field: 'page_id', table: 'page' }],
      ['keyword', { field: 'keyword_id', table: 'keyword' }],
    ],
    image_keyword: [
      /* foreign references */
      ['image', { field: 'image_id', table: 'image' }],
      ['keyword', { field: 'keyword_id', table: 'keyword' }],
    ],
    image_page: [
      /* foreign references */
      ['image', { field: 'image_id', table: 'image' }],
      ['page', { field: 'page_id', table: 'page' }],
    ],
  },
})
