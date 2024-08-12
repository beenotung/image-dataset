import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('keyword'))) {
    await knex.schema.createTable('keyword', table => {
      table.increments('id')
      table.text('keyword').notNullable().unique()
      table.integer('complete_time').nullable()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('domain'))) {
    await knex.schema.createTable('domain', table => {
      table.increments('id')
      table.text('domain').notNullable().unique()
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('page'))) {
    await knex.schema.createTable('page', table => {
      table.increments('id')
      table.text('url').notNullable().unique()
      table.integer('domain_id').unsigned().notNullable().references('domain.id')
      table.timestamps(false, true)
    })
  }

  if (!(await knex.schema.hasTable('image'))) {
    await knex.schema.createTable('image', table => {
      table.increments('id')
      table.integer('page_id').unsigned().notNullable().references('page.id')
      table.text('filename').notNullable().unique()
      table.integer('keyword_id').unsigned().notNullable().references('keyword.id')
      table.text('alt').notNullable()
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('image')
  await knex.schema.dropTableIfExists('page')
  await knex.schema.dropTableIfExists('domain')
  await knex.schema.dropTableIfExists('keyword')
}
