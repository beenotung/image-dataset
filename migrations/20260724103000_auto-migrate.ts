import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('keyword_engine'))) {
    await knex.schema.createTable('keyword_engine', table => {
      table.increments('id')
      table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
      table.text('engine').notNullable()
      table.integer('complete_time').nullable()
      table.unique(['keyword_id', 'engine'])
      table.timestamps(false, true)
    })
  }

  if (await knex.schema.hasColumn('keyword', 'complete_time')) {
    await knex.raw(/* sql */ `
      insert into keyword_engine (keyword_id, engine, complete_time, created_at, updated_at)
      select keyword.id, 'google', keyword.complete_time, datetime('now'), datetime('now')
      from keyword
      where keyword.complete_time is not null
      and not exists (
        select 1 from keyword_engine
        where keyword_engine.keyword_id = keyword.id
        and keyword_engine.engine = 'google'
      )
    `)
    await knex.raw('alter table `keyword` drop column `complete_time`')
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('keyword_engine')
  if (!(await knex.schema.hasColumn('keyword', 'complete_time'))) {
    await knex.raw('alter table `keyword` add column `complete_time` integer null')
  }
}
