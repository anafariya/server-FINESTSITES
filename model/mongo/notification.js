const mongoose = require('mongoose');
const config = require('config');
const permissions = config.get('permissions')
const defaults = config.get('notifications');
const Schema = mongoose.Schema;

// define schema
const NotificationSchema = new Schema({

  name: { type: String, required: true },
  active: { type: Boolean, required: true },
  account_id: { type: String, required: true },
  user_id: { type: String, required: true }

});


const Notification = mongoose.model('Notification', NotificationSchema, 'notification');

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

  return await Notification.insertMany(insert)

}

/*
* notification.get()
* get a single notifcation setting or all
* for a specific user
*/

exports.get = async function({ user, account, name }){

  const data = await Notification.find({

    ...name && { name: name },
    ...user && { user_id: user },
    ...account && { account_id: account },

  })

  // return a bool for a single name check, or list for the rest
  return name ? data[0].active : data;

}

/*
* notification.update()
* update a users notification settings
*/

exports.update = async function({ user, account, data }){

  const currentData = await Notification.find({ user_id: user, account_id: account });

    // determine which documents have changed
    const updates = Object.keys(data).reduce((acc, key) => {
        
      const currentItem = currentData.find(item => item.name === key);
      
      if (currentItem && currentItem.active !== data[key]) {
        acc.push({
          updateOne: {
            filter: { user_id: user, account_id: account, name: key },
            update: { $set: { active: data[key] } }
          }
        });
      }

      return acc;

  }, []);

  await Notification.bulkWrite(updates);

}