import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  {
    // alter column (image.page_id) to be nullable
    // alter column (image.keyword_id) to be nullable
    // alter column (image.alt) to be nullable
    // add column (image.embedding)

    let image_rows = await knex.select('*').from('image')

    await knex.schema.dropTable('image')

    if (!(await knex.schema.hasTable('image'))) {
      await knex.schema.createTable('image', table => {
        table.increments('id')
        table.integer('page_id').unsigned().nullable().references('page.id')
        table.text('filename').notNullable().unique()
        table.integer('keyword_id').unsigned().nullable().references('keyword.id')
        table.text('alt').nullable()
        table.text('embedding').nullable()
        table.timestamps(false, true)
      })
    }

    for (let row of image_rows) {
      await knex.insert(row).into('image')
    }
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw('alter table `image` drop column `embedding`')

  {
    // alter column (image.page_id) to be non-nullable
    // alter column (image.keyword_id) to be non-nullable
    // alter column (image.alt) to be non-nullable

    let image_rows = await knex.select('*').from('image')

    await knex.schema.dropTable('image')

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

    for (let row of image_rows) {
      await knex.insert(row).into('image')
    }
  }
}
