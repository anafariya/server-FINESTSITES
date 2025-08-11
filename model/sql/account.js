const db = require('./knex')();
const stripe = require('./stripe');
const { v4: uuidv4 } = require('uuid');

/*
* account.create()
* create a new account and return the account id
*/

exports.create = async function({ plan } = {}){

  const data = {

    id: uuidv4(),
    name: 'My Account',
    active: true,
    plan: plan

  }

  await db('account').insert(data);
  return data;

}

/*
* account.get()
* get an account by email or id
*/

exports.get = async function({ id, stripeCustomer }){

  const data = await db('account')
  .select('account.id', 'account.name', 'account.date_created', 
    'stripe_customer_id', 'stripe_subscription_id', 'plan', 'active', 
    'user.email as owner_email', 'user.name as owner_name')
  .join('account_users', 'account_users.account_id', 'account.id')
  .join('user', 'account_users.user_id', 'user.id')
  .modify(q => {

    if (id){

      q.where({ 'account.id': id, permission: 'owner' })
      q.orWhere({ 'account.id': id, permission: 'master' });

    }
    else if (stripeCustomer){

      q.where('stripe_customer_id', stripeCustomer);
      
    }
  })

  return (id || stripeCustomer) ? data[0] : null;

}

/*
* account.subscription()
* get the subscription status for this account
* can pass a full account object or id
* account object will avoid the account db call and be faster
*/

exports.subscription = async function({ id, accountData }){

  let subscription, status; 
  
  // get the account if it wasn't passed by the controller
  if (!accountData){

    accountData = await db('account').select('stripe_subscription_id', 'plan').where({ id: id });
    accountData = accountData[0];

  }

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

  return await db('account_users').select('user_id as id').where({ account_id: id });

}

/*
* account.update()
* update the account profile
*/

exports.update = async function({ id, data }){

  await db('account').update(data).where({ id: id });
  return data;

}

/*
* account.delete()
* delete the account and all its users
*/

exports.delete = async function(id){

  return await db('account').del().where({ id: id });

};
