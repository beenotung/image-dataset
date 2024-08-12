import { resolveFile } from './file'
import Knex from 'knex'

export async function setupDB() {
  let config = require('./knexfile').development
  let knex = Knex(config)
  let dir = resolveFile('migrations')
  await knex.migrate.latest({ directory: dir })
  await knex.destroy()
}
