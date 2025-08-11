const { v4: uuidv4 } = require('uuid');
const stripe = require('./stripe');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const User = require('./user').schema;

// define schema
const AccountSchema = new Schema({

  id: { type: String, required: true, unique: true },
  plan: { type: String },
  name: { type: String },
  active: { type: Boolean, required: true },
  stripe_subscription_id: { type: String },
  stripe_customer_id: { type: String },
  date_created: { type: Date, required: true },

});

const Account = mongoose.model('Account', AccountSchema, 'account');
exports.schema = Account;

/*
* account.create()
* create a new account and return the account id
*/

exports.create = async function({ plan } = {}){

  const data = Account({

    id: uuidv4(),
    name: 'My Account',
    active: true,
    date_created: new Date(),

  });

  const newAccount = Account(data);
  await newAccount.save();
  return data;

}

/*
* account.get()
* get an account by email or id
*/

exports.get = async function({ id, stripeCustomer }){

  // get the account and add the users name
  const accountData = await Account.findOne({ 
    
    ...id && { id: id },
    ...stripeCustomer && { stripe_customer_id: stripeCustomer }
  
  }).lean();

  if (accountData){
  
    const userData = await User.findOne({ 
      
      'account.id': id,
      $or: [{ 'account.permission': 'owner' }, { 'account.permission': 'master' }]
    
    }).select({ name: 1, email: 1 });

    if (userData){

      accountData.owner_email = userData.email;
      accountData.owner_name = userData.name;

    }
  }

  return accountData;

}

/*
* account.subscription()
* get the subscription status for this account
*/

exports.subscription = async function({ id, accountData }){

  let subscription, status;

  // get the account if it wasn't passed by the controller
  accountData = accountData || await Account.findOne({ id: id });

  if (!accountData)
    return false;

  if (accountData.plan !== 'free' && accountData.stripe_subscription_id){

    subscription = await stripe.subscription(accountData.stripe_subscription_id);
    status = subscription.status;

  }
  else if (accountData.plan === 'free'){

    status = 'active';

  }

  return {

    status: status,
    data: subscription

  }
 }

 /*
* account.users()
* return the users on this account
*/

exports.users = async function({ id }){

  return await User.find({ 'account.id': id }).select({ id: 1 });

}

/*
* account.update()
* update the account profile
*/

exports.update = async function({ id, data }){

  return await Account.findOneAndUpdate({ id: id }, data);

}

/*
* account.delete()
* delete the account and all its users
*/

exports.delete = async function(id){

  return await Account.findOneAndDelete({ id: id });

};
