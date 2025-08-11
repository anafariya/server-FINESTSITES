
exports.up = function(knex) {
  return knex.schema.createTable('usage', table => {

    table.specificType('id', 'char(36) primary key');
    table.string('account_id', 36).notNullable().references('id').inTable('account').onDelete('cascade');
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end');
    table.integer('quantity').notNullable().defaultTo(0);
    table.bool('reported').notNullable().defaultTo(0);

  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('usage');
};
