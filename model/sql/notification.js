const db = require('./knex')();
const config = require('config');
const permissions = config.get('permissions')
const defaults = config.get('notifications');

/*
* notification.create()
* create a new set of default nofication 
* settings for a new user
*/

exports.create = async function({ user, account, data, permission }){

  // get permission stack as array
  // only save notifications this user has permission for
  const perms = Object.keys(permissions[permission]).filter(key => permissions[permission][key]);

  const insert = data || Object.keys(defaults).reduce((acc, key) => {

    if (perms.includes(defaults[key].permission)) {
      acc.push({

        name: key,
        active: defaults[key].active,
        user_id: user,
        account_id: account

      });
    }
    return acc;
  }, []);
  
  await db('notification').insert(insert)

}

/*
* notification.get()
* get a single notifcation setting or all
* for a specific user
*/

exports.get = async function({ user, account, name }){

  const data = await db('notification')
  .select('name', 'active')
  .where({ 
    
    ...name && { name: name },
    ...user && { user_id: user },
    ...account && { account_id: account },
  
  });

  // return a bool for a single name check, or list for the rest
  return name ? data[0].active : data;

}

/*
* notification.update()
* update a users notification settings
*/

exports.update = async function({ user, account, data }){

  await db('notification')
  .where({ user_id: user, account_id: account })
  .then(currentData => {

    const updates = [];

    // determine which rows have changed
    Object.keys(data).forEach(key => {

      const currentItem = currentData.find(item => item.name === key);

      if (currentItem.active !== data[key])
        updates.push({ name: key, active: data[key] });

    });

    // execute update queries for changed rows
    const promises = updates.map(item => {

      return db('notification')
      .where({ user_id: user, account_id: account, name: item.name })
      .update(item);

    });

    return Promise.all(promises);

  })  
}