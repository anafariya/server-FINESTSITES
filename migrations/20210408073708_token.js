
exports.up = function(knex) {
  return knex.schema.createTable('token', table => {

    table.specificType('id', 'char(36) primary key');
    table.string('provider', 64).notNullable();
    table.text('access');
    table.text('refresh');
    table.timestamp('issued_at').notNullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.string('user_id', 36).notNullable().references('id').inTable('user').onDelete('cascade');

  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('token');
};
