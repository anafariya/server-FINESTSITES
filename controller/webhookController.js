const stripe = require('../model/stripe');
const account = require('../model/account');

exports.stripe = async function(req, res){

  const hook = stripe.webhook.verify(req.body, req.headers['stripe-signature'])

  if (hook.type === 'customer.subscription.deleted'){

    console.log('🪝 Stripe webhook received: ' + hook.type);

    // check if account exists (owner may have deleted it)
    const accountData = await account.get({ stripeCustomer: hook.data.object.customer })

    // downgrade the plan to free 
    if (accountData?.stripe_subscription_id){

      await account.update({ id: accountData.id, data: { stripe_subscription_id: null, plan: 'free' }});
      console.log(`⬇️  ${accountData.owner_email} downgraded to free`);

    }
  }
}