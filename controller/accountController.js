const config = require('config');
const domain = config.get('domain')
const settings = config.get('stripe');
const joi = require('joi');
const auth = require('../model/auth');
const account = require('../model/account');
const user = require('../model/user');
const stripe = require('../model/stripe');
const mail = require('../helper/mail');
const log = require('../model/log');
const token = require('../model/token');
const invite = require('../model/invite');
const usage = require('../model/usage');
const utility = require('../helper/utility');
const notification = require('../model/notification');
const s3 = require('../helper/s3');
const authController = require('../controller/authController');
// const stripe = null

/*
* account.create()
* create a new account part 1: email/pass or social
*/

exports.create = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
    
    email: joi.string().email().required(),
    name: joi.string().required().min(3).max(100),
    password: joi.string().required().pattern(new RegExp(config.get('security.password_rules'))).custom((value, helper) => {

      return value === helper.state.ancestors[0].email ? 
        helper.message(res.__('account.create.password_same_as_email')) : value;

    }),
    confirm_password: joi.string().allow(null),
    verify_view_url: joi.string().allow(null)

  }), req, res);

  // confirm_password field is a dummy field to prevent bot signups
  if (data.hasOwnProperty('confirm_password') && data.confirm_password)
    throw { message: res.__('account.create.denied') };

  // check if user has already registered an account
  let userData = await user.get({ email: data.email });

  if (userData){
    
    // check if user already owns an account
    const userAccounts = await user.account({ id: userData.id });
    const ownerAccount = userAccounts.find(x => x.permission === 'owner');
    utility.assert(!ownerAccount, res.__('account.create.duplicate'))

    // user already owns a child account, verify password
    const verified = await user.password.verify({ id: userData.id, account: userData.account_id, password: data.password });
    utility.assert(verified, res.__('account.create.duplicate_child'))

    // flag for authController to notify onboarding ui
    // that the user's existing account was used
    data.duplicate_user = true; 
    data.has_password = userData.has_password;

    // save the new password if it exists and user doesn't have one
    if (!data.has_password && data.password)
      await user.password.save({ id: userData.id, password: data.password });

  }

  console.log(res.__('account.log.creating', { email: data.email }));

  // create the account
  const accountData = await account.create(data.plan);
  data.account_id = accountData.id; // pass to auth controller to select new account

  // create the user, assign to account and set notification defaults
  data.verified = !config.get('email').user_verification;
  userData = !userData ? await user.create({ user: data, account: accountData.id }) : userData;
  await user.account.add({ id: userData.id, account: accountData.id, permission: 'owner' });
  notification.create({ user: userData.id, account: accountData.id, permission: 'owner' });
  
  console.log(res.__('account.log.created', { email: data.email}));

  const verificationToken = auth.token({ 
    
    data: { 
      timestamp: Date.now(), 
      user_id: userData.id,
      account_id: accountData.id
    }, 
    duration: 3600 
  });

  // send verification email  
  await mail.send({

    to: userData.email,
    locale: req.locale,
    template: (data.duplicate_user && data.has_password) ? 'duplicate_user' : (data.verified ? 'new_account' : 'email_verification'),
    content: { 
      
      name: userData.name, 
      verification_token: verificationToken,
      domain: utility.validateNativeURL(data.verify_view_url) || `${domain}/signup/verify`
    
    }
  });

  // authenticate the user
  return await authController.signup(req, res);

};

/*
* account.plan()
* create a new account part 2: plan
*/

exports.plan = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
    
    plan: joi.string().required(),
    token: joi.object(),
    stripe: joi.object()

  }), req, res); 

  const stripeData = {};

  // check the plan exists
  const plan = settings.plans.find(x => x.id === data.plan);
  utility.assert(plan, res.__('account.plan.invalid'));

  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));

  // check customer isn't on a plan
  utility.assert(!accountData.stripe_subscription_id, res.__('account.plan.plan_exists'));

  // process stripe subscription for non-free accounts
  // if a 2-factor payment hasn't occurred, create the stripe subscription
  if (data.plan !== 'free'){
    if (data.stripe === undefined){

      utility.assert(data.token?.id, res.__('account.card.missing'));

      // create a stripe customer and subscribe them to a plan
      stripeData.customer = await stripe.customer.create({ email: accountData.owner_email, token: data.token.id });
      stripeData.subscription = await stripe.customer.subscribe({ id: stripeData.customer.id, plan: data.plan, trial_period_days: plan.trial_period_days });

      // check for an incomplete payment that requires 2-factor authentication
      if (stripeData.subscription?.latest_invoice?.payment_intent?.status === 'requires_action'){

        console.log(res.__('account.plan.requires_action'));

        return res.status(200).send({

          requires_payment_action: true,
          customer: { id: stripeData.customer.id },
          subscription: { id: stripeData.subscription.id, price: stripeData.subscription.price },
          client_secret: stripeData.subscription.latest_invoice.payment_intent.client_secret

        });
      }
    }

    // stripe info hasn't been passed back as part of 2-factor
    if (!data.stripe)
      data.stripe = stripeData;

  }
  else {

    // nullify stripe data on free accounts
    data.stripe = {

      customer: { id: null },
      subscription: { id: null }

    }
  }

  // update the account with plan details
  await account.update({ id: req.account, data: { 

    plan: data.plan, 
    stripe_customer_id: data.stripe?.customer?.id,  
    stripe_subscription_id: data.stripe?.subscription?.id

  }});

  // send email  
  if (data.plan !== 'free'){
    await mail.send({

      to: accountData.owner_email,
      locale: req.locale,
      template: 'new_plan',
      content: { 
        
        name: accountData.owner_name, 
        plan: plan.name,
        price: `${plan.currency.symbol}${plan.price}`
      
      }
    });
  }

  // open a usage record for tiered plan
  if (plan.type === 'tiered')
    usage.open({ account: accountData.id })

  console.log(res.__('account.log.plan'));
  log.create({ message: res.__('account.log.plan'), body: { plan: plan }, req: req });
  res.status(200).send({ plan: data.plan, subscription: 'active', onboarded: false });

}

/*
* account.plan.update()
* upgrade or downgrade the billing plan
*/

exports.plan.update = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
    
    id: joi.string(), // mission control only
    active: joi.alternatives().try(joi.boolean(), joi.number().valid(0, 1)), 
    plan: joi.string().required(),

  }), req, res); 

  const accountID = req.permission === 'master' ? data.id : req.account;
  const newPlan = settings.plans.find(x => x.id === data.plan);
  utility.assert(newPlan, res.__('account.plan.invalid'));

  const accountData = await account.get({ id: accountID });
  utility.assert(accountData, res.__('account.invalid'));
  const currentPlan = settings.plans.find(x => x.id === accountData.plan);

  // check duplicate plan
  if (currentPlan.id === newPlan.id)
    return res.status(200).send({ message: res.__('account.plan.active', { plan: currentPlan.name }) });
  
  // allow master account to update active status
  if (req.permission === 'master' && (accountData.active) !== parseInt(data.active))
    account.update({ id: data.id, data: { active: parseInt(data.active) }});

  // user is upgrading from free to paid,
  // direct them to the upgrade view
  if (currentPlan.id === 'free' && newPlan.id !== 'free'){

    if (req.permission === 'master'){

      throw ({ message: res.__('account.plan.master_upgrade') });

    }
    else {

      return res.status(402).send({ message: res.__('account.plan.payment_required'), plan: newPlan.id });

    }
  }

  if (newPlan.id === 'free'){

    // user is downgrading - cancel the stripe subscription at the end of the current period
    if (accountData.stripe_subscription_id){

      const subscription = await stripe.subscription(accountData.stripe_subscription_id);

      if (subscription.status !== 'canceled')
        await stripe.subscription.update({ subscription: subscription, cancel_at_period_end: true });
      
    }
  }
  else {

    // user is switching to a different paid plan
    if (accountData.stripe_subscription_id){

      // check for active subscription
      let subscription = await stripe.subscription(accountData.stripe_subscription_id);

      // block switching on a trial
      utility.assert(subscription.status !== 'trialing',
        res.__('account.plan.subscription_trialing'));

      if (subscription.status === 'active'){

        let accountUsers;

        // subscriber customer to a plan
        if (settings.seat_billing)
          accountUsers = await account.users({ id: accountData.id });

        subscription = await stripe.subscription.update({ 
          
          subscription: subscription, 
          plan: newPlan.id,
          quantity: accountUsers ? accountUsers.length : accountUsers,
          cancel_at_period_end: false
        
        });

        await account.update({ id: accountData.id, data: { plan: newPlan.id }});

      }
      else if (subscription.status === 'canceled'){

        return req.permission === 'master' ?
          res.status(500).send({ message: res.__('account.plan.master_upgrade') }) :
          res.status(402).send({ message: res.__('account.plan.subscription_canceled'), plan: currentPlan.id });

      }
    }
  }

  // notify the user
  const send = await notification.get({ account: accountData.id, name: 'plan_updated' });

  if (send){
    await mail.send({

      to: accountData.owner_email,
      locale: req.locale,
      template: newPlan.id === 'free' ? 'plan_updated_free': 'plan_updated',
      content: {

        name: accountData.owner_name,
        plan: newPlan.name

      }
    });
  }

  // done
  return res.status(200).send({

    message: res.__('account.plan.updated', { plan: newPlan.name }),
    data: { plan: newPlan.id }

  });
};

/*
* account.get()
* get the account
*/

exports.get = async function(req, res){

  const data = await account.get({ id: req.account });
  return res.status(200).send({ data: data });

}

/*
* account.subscription()
* get the account subscription state
*/

exports.subscription = async function(req, res){

  const subscription = await account.subscription({ id: req.account });
  utility.assert(subscription, res.__('account.invalid'));

  // format the data 
  if (subscription?.data){

    const start = new Date(subscription.data.current_period_start*1000).toISOString().split('T')[0].split('-');
    const end = new Date(subscription.data.current_period_end*1000).toISOString().split('T')[0].split('-');

    subscription.data = {
      ...settings.seat_billing && {

        seats: subscription.data.items.data[0].quantity,
        seat_price: subscription.data.items.data[0].price.unit_amount,

      },
      interval: subscription.data.items.data[0].price.recurring.interval,
      cancel_at_period_end: subscription.data.cancel_at_period_end,
      currency_symbol: utility.currencySymbol[subscription.data.items.data[0].price.currency],
      current_period_start: `${start[2]} ${utility.convertToMonthName(start[1], req.locale)} ${start[0]}`,
      current_period_end: `${end[2]} ${utility.convertToMonthName(end[1], req.locale)} ${end[0]}`

    };
  }

  return res.status(200).send({ data: {

    status: subscription.status,
    object: subscription.data

  }});
}

/*
* account.usage()
* get usage on the account if using usage billing
*/

exports.usage = async function(req, res){

  const accountData = await account.get({ id: req.account });
  const plan = settings.plans.find(x => x.id === accountData.plan);

  if (plan.type !== 'tiered')
    return res.status(200).send();

  let label = 'units';
  const now = new Date();
  const start = new Date(accountData.date_created);

  // if today is greater registration day, it's the current month
  // otherwise it's still the previous month period
  now.getDate() > start.getDate() ? 
    start.setMonth(now.getMonth()) : 
    start.setMonth(now.getMonth()-1);

  // period ends one month from it starts
  const end = new Date(start);
  end.setMonth(end.getMonth()+1);

  // get usage total for this period
  let total = await usage.get.total({ account: req.account, period_start: start, period_end: end });
  
  if (accountData.plan !== 'free'){

    // show the $ spent on paid plans
    total = `$${plan.price * total}`;
    label = '';

  }

  return res.status(200).send({ data: { total: total, label: label, period: 'month' }});

}

/*
* account.upgrade()
* upgrade a free account to paid subscription plan
*/

exports.upgrade = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
    
    plan: joi.string().required(),
    stripe: joi.object(),
    token: joi.object().required()

  }), req, res); 

  const stripeData = {};
  const newPlan = settings.plans.find(x => x.id === data.plan);
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));

  if (accountData.stripe_customer_id && accountData.stripe_subscription_id){

    // check if customer & subscription already exists
    stripeData.customer = await stripe.customer(accountData.stripe_customer_id);
    stripeData.subscription = await stripe.subscription(accountData.stripe_subscription_id);

    if (stripeData.subscription.id && stripeData.subscription.status == 'active')
      return res.status(500).send({ message: res.__('account.plan.active', { plan: newPlan.name }) });

  }

  // if a 2-factor payment isn't required, create the stripe subscription
  if (data.stripe === undefined){

    utility.assert(data.token?.id, res.__('account.card.missing'));
    let accountUsers;

    // create a stripe customer if it doesnt exist
    stripeData.customer = accountData.stripe_customer_id ? 
      await stripe.customer(accountData.stripe_customer_id) :
      await stripe.customer.create({ email: accountData.owner_email, token: data.token.id });

    // subscriber customer to a plan
    if (settings.seat_billing)
      accountUsers = await account.users({ id: accountData.id });

    stripeData.subscription = await stripe.customer.subscribe({ 
      
      id: stripeData.customer.id, 
      plan: data.plan,
      quantity: accountUsers ? accountUsers.length : accountUsers
    
    });

    // check for an incomplete payment that requires 2-factor authentication
    if (stripeData.subscription?.latest_invoice?.payment_intent?.status === 'requires_action'){

      console.log(res.__('account.plan.requires_action'));

      res.status(200).send({

        requires_payment_action: true,
        customer: { id: stripeData.customer.id },
        subscription: { id: stripeData.subscription.id, price: stripeData.subscription.price },
        client_secret: stripeData.subscription.latest_invoice.payment_intent.client_secret

      });

      return false;

    }
  }

  // stripe info hasn't been passed back as part of 2-factor
  if (!data.stripe)
    data.stripe = stripeData;

  // update account plan
  await account.update({ id: req.account, data: {

    plan: data.plan, 
    stripe_customer_id: data.stripe?.customer?.id,  
    stripe_subscription_id: data.stripe?.subscription?.id

  }});

  // open a usage record if there isn't one
  if (newPlan.type === 'tiered'){

    const usageData = await usage.get({ account: accountData.id, reported: false });
    if (!usageData.length) usage.open({ account: accountData.id })

  }

  // notify the user
  const send = await notification.get({ account: accountData.id, name: 'plan_updated' });

  if (send){
    await mail.send({

      to: accountData.owner_email,
      locale: req.locale,
      template: 'plan_updated',
      content: {

        name: accountData.owner_name,
        plan: newPlan.name

      }
    });
  }

  // done
  return res.status(200).send({

    message: res.__('account.plan.updated', { plan: newPlan.name }),
    data: { plan: data.plan }

  });
};

/*
* account.card()
* get the card details for this account
*/

exports.card = async function(req, res){

  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));

  if (accountData.stripe_customer_id){
    
    const customer = await stripe.customer(accountData.stripe_customer_id);
    card = customer.sources?.data?.[0];

    if (card){
      return res.status(200).send({ data: {

        brand: card.brand,
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year
    
      }});
    }
    else {

      return res.status(200).send({ data: null });

    }
  }

  return res.status(200).send({ data: null });

}

/*
* account.card.update()
* update credit card details
*/

exports.card.update = async function(req, res){

  // validate
  const data = utility.validate(joi.object({
    
    token: joi.object().required()

  }), req, res); 

  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));

  const customer = await stripe.customer.update({ id: accountData.stripe_customer_id, token: data.token.id });

  // notify the user
  const send = await notification.get({ account: accountData.id, name: 'card_updated' });

  if (send){
    await mail.send({

      to: accountData.owner_email,
      locale: req.locale,
      template: 'card_updated',
      content: { name: accountData.owner_name }

    });
  }

  return res.status(200).send({ 
    
    data: customer?.sources?.data?.[0],
    message: res.__('account.card.updated')
  
  });
};

/*
* account.invoice()
* return the past invoices for this customer
*/

exports.invoice = async function(req, res){

  let invoices = null;

  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));

  // get the invoices
  if (accountData.stripe_customer_id){

    invoices = await stripe.customer.invoices({ id: accountData.stripe_customer_id });

    // format the invoices
    if (invoices?.data?.length){
      invoices.data = invoices.data.map(invoice => {

        const total = invoice.total;

        return {

          number: invoice.number,
          date: new Date(invoice.created*1000),
          status: invoice.status,
          invoice_pdf: invoice.invoice_pdf,
          total: `${utility.currencySymbol[invoice.currency]}${(total/100).toFixed(2)}`

        }
      })
    }
  }

  return res.status(200).send({ data: invoices?.data });

}


/*
* account.users()
* return the users and invites on this account
*/

exports.users = async function(req, res){

  return res.status(200).send({ data: {

    users: await user.get({ account: req.account }),
    invites: await invite.get({ account: req.account, returnArray: true, used: false })

  }});
}

/*
* account.close()
* close the account and delete all users associated with it
*/

exports.close = async function(req, res){

  // allow master to close account
  const accountId = req.permission === 'master' ? req.params.id : req.account;  

  // verify password
  const data = utility.validate(joi.object({ password: joi.string().required() }), req, res);
  const verified = await user.password.verify({ id: req.user, account: req.account, password: data.password });
  utility.assert(verified, res.__('account.delete.invalid_password'), 'password');

  const accountData = await account.get({ id: accountId });
  utility.assert(accountData, res.__('account.invalid'));

  const plan = settings.plans.find(x => x.id === accountData.plan);

  if (plan?.id !== 'free' && accountData?.stripe_customer_id){

    await stripe.subscription.delete({ id: accountData.stripe_subscription_id, prorate: plan.type === 'tiered' });

  }

  // get a list of users on this account
  const accountUsers = await user.get({ account: accountData.id });

  if (accountUsers.length){
    for (u of accountUsers){

      // get the other accounts this user is attached to 
      const userAccounts = await user.account({ id: u.id });
      await token.delete({ user: u.id });
      
      // user is on multiple accounts
      if (userAccounts.length > 1){
        
        // if this account is the user's default account
        // update to prevent a redundant default
        if (u.default_account === accountData.id){

          userAccounts.splice(userAccounts.findIndex(x => x.id === accountId), 1);
          await user.update({ id: u.id, account: accountId, data: { default_account: userAccounts[0].id }})

        }

        // un-assign user from this account
        await user.account.delete({ id: u.id, account: accountData.id }); 

      }
      else {

        // delete the user entirely
        const userData = await user.get({ id: u.id, account: accountData.id });
        await user.delete({ id: userData.id, account: accountData.id });

        if (userData.avatar && userData.avatar.includes('amazonaws.com'))
          s3.delete({ url: userData.avatar }) 

      }
    }
  }

  // delete the account
  await account.delete(accountData.id);

  await mail.send({

    to: accountData?.owner_email,
    locale: req.locale,
    template: 'account_closed',
    content: { name: accountData?.owner_name }

  });

  console.log(res.__('account.log.deleted', { email: accountData.owner_email}));
  log.create({ message: res.__('account.log.deleted', { email: accountData.owner_email}), req: req });
  return res.status(200).send({ message: res.__('account.delete.success') });

};

/*
* account.plans()
* return available billing plans
*/

exports.plans = async function(req, res){

  const accountData = req.account ? await account.get({ id: req.account }) : null;

  return res.status(200).send({
    data: {

      plans: settings.plans,
      active: accountData ? accountData.plan : null,

    }
  });
}

/*
* account.coupon()
* check coupon
*/

exports.coupon = async function(req, res){

  const data = req.body;

  utility.assert(data.coupon, res.__('account.plan.no_coupon'));
  

  // check the coupon
  if (data.coupon){ 

    const promos = await stripe.promo({ coupon: data.coupon });
    const promo = promos?.find(x => x.code === data.coupon);
    utility.assert(promo, 'Invalid coupon');
    data.coupon = promo;

  }
  res.status(200).send({ plan: data });

}