require('dotenv').config();
const user = require('../../model/user');
const stripe = require('../../model/stripe');
const mail = require('../../helper/mail');
require('../../helper/i18n').config();

// change this to the number of days you want
// to send the email before the trial ends
const DAYS_BEFORE_TRIAL_ENDS = 3; 

// toggle which emails are sent
const SEND_THREE_DAY_EMAIL = true;
const SEND_UPGRADE_EMAIL = true;

exports.run = async function(){

  try {

    const now = new Date();

    // 1. notify customers with trials expiring in 3 days
    if (SEND_THREE_DAY_EMAIL){

      console.log(`🕘 Sending trial expires in ${DAYS_BEFORE_TRIAL_ENDS} days email`);
      const trials = await stripe.subscription.list({ status: 'trialing' }); // get a list of trials
 
      if (trials.length){
        for (sub of trials){

          const s = new Date(sub.trial_end * 1000);  // convert stripe trial_end epoc time to unix timestamp
          const t = new Date(now.setDate(now.getDate() + DAYS_BEFORE_TRIAL_ENDS)); // date to test against 3 days from now

          if ((s.getMonth() === t.getMonth()) && (s.getDate() === t.getDate()) && (s.getFullYear() === t.getFullYear())){

            const userData = await user.get({ email: sub.customer.email });
            await mail.send({ to: sub.customer.email, template: 'trial_expiring', locale: userData?.locale });

          }
        }

        console.log('✅ Trial expiring emails sent.')
        
      }
      else {

        console.log('🔔 No trial expiring emails to send today.')

      }
    }

    // 3. notify customers that have been automatically moved on the paid plan
    if (SEND_UPGRADE_EMAIL){

      console.log('🕘 Sending trial expired emails');

      const created = new Date(now.setDate(now.getDate() - DAYS_BEFORE_TRIAL_ENDS)); // search stripe from trial start
      const upgrades = await stripe.subscription.list({ status: 'active', created: created });

      if (upgrades.length){
        for (sub of upgrades){

          // had trial
          if (sub.trial_end){

            const s = new Date(sub.trial_end * 1000);  // convert stripe trial_end epoc time to unix timestamp
            const t = new Date(); // date to test against

            if ((s.getMonth() === t.getMonth()) && (s.getDate() === t.getDate()) && (s.getFullYear() === t.getFullYear())){

              const userData = await user.get({ email: sub.customer.email });
              await mail.send({ 
                
                to: sub.customer.email, 
                template: 'trial_expired', 
                locale: userData?.locale,
                content: { plan: sub.plan.nickname }
              
              });
            }
          }
        }

        console.log('✅ Trial expired emails sent.')

      }
      else {

        console.log('🔔 No trial expired emails to send today.')

      }
    }
  }
  catch (err){

    console.error(err);

  }
}