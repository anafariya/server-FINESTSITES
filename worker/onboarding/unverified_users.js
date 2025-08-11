require('dotenv').config();
const db = require('../../model/knex')();
const mail = require('../../helper/mail');
const auth = require('../../model/auth');

exports.run = async function(){

  try {

    console.log('Sending unverified user emails...');

    const now = new Date();
    const today = new Date();
    const yesterday = new Date(now.setDate(now.getDate() - 1));

    // get a list of unverified users created yesterday
    const users = await db('user').select('id', 'email')
    .where('verified', false)
    .where('date_created', '>', yesterday.toISOString().split('T')[0])
    .where('date_created', '<', today.toISOString().split('T')[0]);

    if (users.length){
      for (user of users){

        const token = auth.token({ data: { timestamp: today, user_id: user.id }, duration: 3600 });
        await mail.send({

          to: user.email,
          locale: req.locale,
          template: 'unverified_account',
          content: { verification_token: token }
          
        });
      }

      console.log('✅ Unverified user emails sent.')

    }
    else {

      console.log('🔔 No unverified user emails to send today.')

    }
  }
  catch (err){

    console.error(err);

  }
}