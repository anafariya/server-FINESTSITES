const config = require('config');
const settings = config.get('stripe');
const stripe = require('stripe')(process.env.STRIPE_SECRET_API_KEY);

/*
* stripe.subscription()
* return a stripe subscription
*/

exports.subscription = async function(id){

  return await stripe.subscriptions.retrieve(id, {

    expand: ['latest_invoice.payment_intent', 'schedule']

  });
}

/*
* stripe.plan()
* return a stripe plan
*/

exports.plan = async function(id){

  return await stripe.plans.retrieve(id);
}

/*
* stripe.schedule()
* return a schedule subscription
*/

exports.schedule = async function(id){

  // Create a subscription schedule with the existing subscription
  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: id,
  });
  return schedule;
}

/*
* stripe.schedule()
* return a schedule subscription
*/

exports.schedule.update = async function({schedule, subscription, plan, quantity, cancel_at_period_end, coupon}){

  // Update the schedule with the new phase
  const subscriptionSchedule = await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      phases: [
        {
          items: [
            {
              price: subscription.plan.id,
              quantity: subscription.quantity,
            },
          ],
          start_date: subscription.current_period_start,
          end_date: subscription.current_period_end,
        },
        {
          ...cancel_at_period_end !== undefined && { cancel_at_period_end: cancel_at_period_end },
          items: [{ 
            price: plan,
            ...quantity != undefined && { quantity: quantity },
            
          }],
          ...coupon && { coupon },
          iterations: 1,
        },
      ],
    }
  );
  return subscriptionSchedule;
}

/*
* stripe.subscription.list()
* return a list of stripe subscriptions
*/

exports.subscription.list = async function({ status, created, price } = {}){

  const result = [];

  for await (
    const sub of stripe.subscriptions.list({ 
    
    ...status && { status: status },
    ...created && { created: { gte: created }},
    ...price && { price: price },
    expand: ['data.customer', 'data.latest_invoice'],
  
    })
  ){ 
    result.push(sub);
  }

  return result;

}

/*
* stripe.subscription.update
* upgrade or downgrade the stripe subscription to a different plan
*/

exports.subscription.update = async function({ subscription, plan, quantity, cancel_at_period_end, coupon, isUpgrade }){

  const subscriptionData = await stripe.subscriptions.retrieve(subscription.id)

  if(subscriptionData.schedule){
    await stripe.subscriptionSchedules.release(subscriptionData.schedule);
  }

  return await stripe.subscriptions.update(subscription.id, {

    ...cancel_at_period_end !== undefined && { cancel_at_period_end: cancel_at_period_end },
    items: [{
      id: subscription.items.data[0].id, 
      plan: plan,
      ...quantity != undefined && { quantity: quantity },
    }],
    ...isUpgrade && { proration_behavior: 'always_invoice', billing_cycle_anchor: "now"},
    ...coupon && { coupon },
  });
}

/*
* stripe.subscription.updateCancel
* toggle cancel at end period the stripe subscription
*/

function removeNullValues(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeNullValues); // Recursively clean arrays
  } else if (typeof obj === "object" && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value !== null) // Remove null values
        .map(([key, value]) => [key, removeNullValues(value)]) // Recursively clean objects
    );
  }
  return obj; // Return non-object values as-is
}

exports.subscription.updateCancel = async function({ id, cancel_at_period_end }){
  const subscription = await stripe.subscriptions.retrieve(id)

  if(subscription.schedule){
    await stripe.subscriptionSchedules.release(subscription.schedule);
    return await stripe.subscriptions.update(id, {
      cancel_at_period_end, 
    });
  }
  return await stripe.subscriptions.update(id, {
    cancel_at_period_end, 
  });
}


/*
* stripe.subscription.usage()
* get the subscription usage report from stripe
*/

exports.subscription.usage = async function(id){

  return await await stripe.subscriptionItems.listUsageRecordSummaries(id);

}

/*
* stripe.subscription.usage.report()
* report the subscription usage 
*/

exports.subscription.usage.report = async function({ subscription, quantity }){

  await stripe.subscriptionItems.createUsageRecord(subscription, 
    { quantity: quantity, }
  );
}


/*
* stripe.subscription.delete()
* cancel a stripe subscription
*/

exports.subscription.delete = async function({ id, prorate }){

  return await stripe.subscriptions.cancel(id, {
    ...prorate && { prorate: true, invoice_now: true }}
  );
}

/*
* stripe.customer()
* return a stripe customer
*/

exports.customer = async function(id){

  return await stripe.customers.retrieve(id, {

    expand: ['sources'],

  });
}

/*
* stripe.customer.create()
* create a new stripe customer
* token: passed from front-end payment form
*/

exports.customer.create = async function({ email, name, token, address }){
  console.log(email, name, token, address, 'email, name, token, address');
  
  return await stripe.customers.create({

    email: email,
    ...name && {name},
    ...token && { source: token },
    ...address && { address }

  });
};

/*
* stripe.customer.create()
* create a new stripe customer
* token: passed from front-end payment form
*/

exports.paymentIntent = async function({ amount, id, userId, payment_method }){

  return await stripe.paymentIntents.create({
    amount: amount,
    currency: 'eur',
    customer: id,
    setup_future_usage: 'off_session', // Save payment method for later
    payment_method_types: ['card', 'sepa_debit'], // Accept card or SEPA
    description: 'One-time purchase with stored payment',
    metadata: {
      // order_id: '123456',
      user_id: userId
    },
    ...payment_method && {payment_method}
  });
};


/* stripe.customer.update(){
* update the customers card details
* token: passed from the front-end
*/

exports.customer.update = async function({ id, token }){

  return await stripe.customers.update(id, {

    source: token

  });
}

/*
* stripe.customer.invoices()
* list the invoices paid by this customer
*/

exports.customer.invoices = async function({ id, limit }){

  return await stripe.invoices.list({

    customer: id,
    limit: limit,

  });
}

/*
* stripe.customer.subscribe()
* subscribe the stripe customer to a plan
*/

exports.customer.subscribe = async function({ id, plan, trial_period_days, quantity, payment_behavior, coupon }){

  const subscription = await stripe.subscriptions.create({

    customer: id,
    items: [{ plan: plan, ...quantity != undefined && { quantity: quantity } }],
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    payment_settings: { save_default_payment_method: 'on_subscription' },
    ...trial_period_days && { trial_period_days },
    ...payment_behavior && { payment_behavior: payment_behavior },
    ...!payment_behavior && { enable_incomplete_payments: true },
    ...coupon && { coupon: coupon }

  });

  // add the price
  subscription.price = settings.currencySymbol +
  (subscription.items.data[0].plan.amount / 100).toFixed(2);

  return subscription;

}

/*
* stripe.customer.delete()
* deletes a stripe customer
*/

exports.customer.delete = async function(id){
  try {
    const customer = await stripe.customers.retrieve(id);
    return  await stripe.customers.del(id);
  } catch (error) {
    return null;
  }
};

/*
* stripe.customer.delete.subscription()
* deletes a stripe customer subscription
*/

exports.customer.delete.subscription = async function(id){
  try {
    const customer = await stripe.subscriptions.retrieve(id);
    return  await stripe.subscriptions.del(id);
  } catch (error) {
    return null;
  }
};

exports.webhook = {};

/*
* stripe.webhook.verify()
* verify a webhook from stripe
*/

exports.webhook.verify = function(body, sig){

  return stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);

}

/*
* stripe.coupon()
* list the stripe coupons
*/

exports.promo = async function(){

  const promos = await stripe.promotionCodes.list();
  return promos.data;

}

/*
* stripe.updateSource()
* update source credit card
*/
exports.updateSource = async function(id, cardId, data, isDefault){
  const update = await stripe.customers.updateSource(id, cardId, data);

  if(update && isDefault){
    await stripe.customers.update(id, {
      invoice_settings: {
        default_payment_method: cardId,
      },
    })
  }
  return update;
}

/*
* stripe.updateAddress()
* update Address credit card
*/
exports.updateAddress = async function(id, address){
  return await stripe.customers.update(id, {
    address
  })
}

/*
* stripe.customer.updateEmail()
* update email customer
*/

exports.customer.updateEmail = async function({ id, email }){

  return await stripe.customers.update(id, {

    email

  });
}

/*
* stripe.customer.updateName()
* update customer's name
*/

exports.customer.updateName = async function({ id, name }){

  return await stripe.customers.update(id, {

    name

  });
}

/*
* stripe.customer.sepaSettings()
* add SEPA account
*/

exports.customer.sepaSettings = async function(paymentId, customerId, isDefault){
  const data = await stripe.paymentMethods.attach(paymentId, {
    customer: customerId,
  });

  if(data && isDefault){
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentId,
      },
    });
  }

  return data
}

/*
* stripe.sepa()
* get list source of customer account
*/

exports.sepa = async function(customerId, data){
  return await stripe.customers.listSources(customerId, data)
}

/*
* stripe.customer.createSource()
* create souce of customer account
*/

exports.customer.createSource = async function(customerId, id){
  return await stripe.customers.createSource(customerId, {
    source: id
  })
}

/*
* stripe.customer.setappIntents()
* create intent of new payment method
*/

exports.customer.setappIntents = async function(customerId, method){
  
  return await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: method,
  })
}

/*
* stripe.customer.paymentMethod()
* get list payment methods
*/

exports.customer.paymentMethod = async function(customerId, method){
  
  return await stripe.paymentMethods.list({
    customer: customerId,
    type: method,
  });
  
}

/*
* stripe.customer.paymentMethod.exist()
* check if payment method exists
*/

exports.customer.paymentMethod.exist = async function(paymentId){
  
  return await stripe.paymentMethods.retrieve(paymentId)
  
}

/*
* stripe.customer.paymentMethod.updateName()
* update name on payment method and make default on invoice / subscriptions
*/

exports.customer.paymentMethod.updateName = async function(customerId, paymentId, name, isDefault){
  let newData = {
    name
  };
  const datas =  await stripe.paymentMethods.update(paymentId, { billing_details: newData })

  if(datas && isDefault){
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentId,
      },
    })
  }
  return newData
}

/*
* stripe.customer.paymentMethod.update()
* update payment method and make default on invoice / subscriptions
*/

exports.customer.paymentMethod.update = async function(customerId, paymentId, data){
  let newData = { 
    address: {
      line1: data.address.line1,
      city: data.address.city,
      postal_code: data.address.postal_code,
      country: data.address.country,
      state: data.address.state,
    },
  };
  const datas =  await stripe.paymentMethods.update(paymentId, { billing_details: newData })

  if(datas){
    await stripe.customers.update(customerId, {
      address: newData.address,
    })
  }
  return data
}