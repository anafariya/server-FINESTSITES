exports.up = function(knex) {
  return knex.schema.createTable('notification', table => {

    table.increments('id').primary().unsigned();
    table.string('name').notNullable();
    table.bool('active').defaultTo(1);
    table.string('user_id', 36).notNullable().references('id').inTable('user').onDelete('cascade');
    table.string('account_id', 36).notNullable().references('id').inTable('account').onDelete('cascade');
    
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('notification');
};
