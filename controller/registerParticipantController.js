const config = require('config');
const domain = config.get('domain');
const event = require('../model/event-management');
const registeredParticipant = require('../model/registered-participant');
const user = require('../model/user');
const auth = require('../model/auth');
const transaction = require('../model/transaction');
const utility = require('../helper/utility');
const mongoose = require('mongoose');
const s3 = require('../helper/s3');
const path = require('path');
const stripe = require('../model/stripe');
const joi = require('joi');
const account = require('../model/account');
const mail = require('../helper/mail');
const token = require('../model/token');

const RegisteredParticipant = mongoose.model("RegisteredParticipant");

const checkEventFull = async (eventId) => {
  const eventData = await event.getById({ id: eventId });
  const registeredCount = await RegisteredParticipant.countDocuments({
    event_id: eventId,
    status: "registered",
  });

  const totalCapacity = eventData.bars.reduce(
    (sum, bar) => sum + bar.available_spots,
    0
  );

  if (registeredCount >= totalCapacity) {
    throw { message: "Event is full. No more registrations allowed." };
  }

  return true;
};

const checkCapacityWithWarning = async (eventId) => {
  const eventData = await event.getById({ id: eventId });
  const currentRegistrations = await RegisteredParticipant.countDocuments({
    event_id: eventId,
    status: "registered",
  });

  const allRegistrations = await RegisteredParticipant.find({
    event_id: eventId,
    status: "registered",
  }).populate("user_id", "first_name last_name email");

  const totalCapacity = eventData.bars.reduce(
    (sum, bar) => sum + bar.available_spots,
    0
  );
  if (currentRegistrations >= totalCapacity) {
    throw { message: "Event is full. No more registrations allowed." };
  }

  return {
    current: currentRegistrations,
    total: totalCapacity,
    available: totalCapacity - currentRegistrations,
    registrations: allRegistrations.map((reg) => ({
      participant_id: reg._id,
      user_name: `${reg.user_id.first_name} ${reg.user_id.last_name}`,
      email: reg.user_id.email,
      status: reg.status,
      is_main_user: reg.is_main_user,
      registered_at: reg.createdAt,
    })),
  };
};

/*
 * registerParticipant.create()
 */
exports.create = async function (req, res) {
  try {
    const idUser = req.user;
    utility.assert(req.body, ['mainUser', 'friend', 'id'] , res.__('register_participant.invalid'));
    const { mainUser, friend, id } = req.body

    await checkEventFull(id);

    const userData = await user.get({ id: idUser });
    let registerFriend;
    let friendAdded;
    if(friend?.email){
      if (mainUser.email === friend.email)
       throw ({ message: res.__('user.create.duplicate') })

      const friendData = await user.get({ email: friend.email});
      
      if(!friendData){
        friend.verified = true
        friend.default_account = null
        friend.is_invited = true
        friend.name = `${friend.first_name} ${friend.last_name}`
        friend.children = friend.children === 'Yes' ? true : false;
        friendAdded = await user.create({ user: friend })
        console.log(friendAdded, 'friendAdded');
        
        console.log('====get id users', idUser);
      } else {
        friendAdded = friendData;
      }
      registerFriend = await registeredParticipant.create({
        user_id: friendAdded._id,
        event_id: id,
        first_name: friend.first_name,
        last_name: friend.last_name,
        gender: friend.gender || null,
        date_of_birth: friend.date_of_birth,
        children: friend.children === 'Yes' ? true : false,
        email: friend.email,
        is_main_user: false,
        relationship_goal: friend.relationship_goal,
        kind_of_person: friend.kind_of_person,
        feel_around_new_people: friend.feel_around_new_people,
        prefer_spending_time: friend.prefer_spending_time,
        describe_you_better: friend.describe_you_better,
        describe_role_in_relationship: friend.describe_role_in_relationship,
        looking_for: friend.looking_for,
        status: 'process'
      })
      console.log(registerFriend, 'registerFriend');
      
    }
    const registerMainUser = await registeredParticipant.create({
        user_id: userData._id,
        event_id: id,
        first_name: mainUser.first_name,
        last_name: mainUser.last_name,
        gender: mainUser.gender || null,
        date_of_birth: mainUser.date_of_birth,
        children: mainUser.children === 'Yes' ? true : false,
        email: mainUser.email,
        is_main_user: true,
        relationship_goal: mainUser.relationship_goal,
        kind_of_person: mainUser.kind_of_person,
        feel_around_new_people: mainUser.feel_around_new_people,
        prefer_spending_time: mainUser.prefer_spending_time,
        describe_you_better: mainUser.describe_you_better,
        describe_role_in_relationship: mainUser.describe_role_in_relationship,
        looking_for: mainUser.looking_for,
        status: 'process'
    })

    await user.update({ 
      _id: new mongoose.Types.ObjectId(userData._id),
      data: {
        kind_of_person: mainUser.kind_of_person,
        feel_around_new_people: mainUser.feel_around_new_people,
        prefer_spending_time: mainUser.prefer_spending_time,
        describe_you_better: mainUser.describe_you_better,
        describe_role_in_relationship: mainUser.describe_role_in_relationship
      }
    })

    console.log(registerMainUser, 'registerMainUser');
    const payment = await transaction.create({
      user_id: userData._id,
      participant_id: registerMainUser._id,
      ...registerFriend && {sub_participant_id: [registerFriend._id]},
      ...registerFriend && {invited_user_id: registerFriend.user_id},
      type: 'Register Event',
      amount: registerFriend ? 40 : 20,
      event_id: id,
      status: 'unpaid'
    })
    
    // const register = await registeredParticipant.create();
    return res.status(200).send({ data: {
      id: payment._id
    } });
  } catch (err) {
    console.log(err, 'err');
    
    return res.status(500).send({ error: err.message });
  }
};


/*
 * registerParticipant.pay()
 */
exports.pay = async function (req, res) {
  // validate
  const id = req.params.id;
  utility.assert(id, res.__('account.card.missing'));

    const data = utility.validate(joi.object({
      token: joi.object(),
      stripe: joi.object(),
      account_holder_name: joi.string(),
      sepaForm: joi.boolean(),
      credit_card_name: joi.string(),
      account: joi.boolean(),
  
    }), req, res); 
  
    const stripeData = {};
  
    const accountData = await account.get({ id: req.account });
    utility.assert(accountData, res.__('account.invalid'));

    const transactionUser = await transaction.getById({id: new mongoose.Types.ObjectId(id)})
    utility.assert(transactionUser, res.__('event.already_paid'));

    if(transactionUser && !data.account){
      const eventData = await event.getById({id: new mongoose.Types.ObjectId(transactionUser.event_id)})
      await checkCapacityWithWarning(transactionUser.event_id);

      // Get today's date at 00:00
      const today = new Date();
      today.setHours(0, 0, 0, 0);
  
      // Get event date and normalize to 00:00
      const eventDate = new Date(eventData.date);
      eventDate.setHours(0, 0, 0, 0);
  
      // If event date is before today, it's in the past
      if (eventDate < today) {
        utility.assert(eventData, res.__('event.already_held'));
      }
    }


    if (data.stripe === undefined){

      utility.assert(data.token?.id, res.__('account.card.missing'));

      // create a stripe customer
      stripeData.customer = accountData.stripe_customer_id || await stripe.customer.create({ email: accountData.owner_email, name: data.sepaForm ? data.account_holder_name : data.credit_card_name, ...!data.sepaForm && { token: data.token.id } });
      let paymentIntent, paymentSepa;
      if(data.sepaForm){
        paymentSepa = await stripe.customer.setappIntents(accountData.stripe_customer_id, ['sepa_debit']);

      } else {
        if(transactionUser){
          paymentIntent = await stripe.paymentIntent({
            amount: transactionUser.amount * 100,
            id: accountData.stripe_customer_id || stripeData.customer.id,
            userId: req.user.id,
            payment_method_types: ['card'],
            // payment_method: req.body.paymentId,
          })
        }
      }
      await account.update({
        id: req.account,
        data: { stripe_customer_id: accountData.stripe_customer_id || stripeData.customer.id }
      })
      
      return res.status(200).send({

        requires_payment_action: true,
        customer: { id: accountData.stripe_customer_id || stripeData.customer.id },
        client_secret: (data.sepaForm ? paymentSepa : paymentIntent)?.client_secret,
        method: data.sepaForm ? 'directdebit' : 'card',
        account_holder_name: data.account_holder_name,
        email: accountData.owner_email,
        type: data.sepaForm ? 'setup' : null,
        transaction: id

      });
    }

    console.log(res.__('account.log.event'));
    log.create({ message: res.__('account.log.event'), body: {  }, req: req });
    res.status(200).send({ event: data, onboarded: false });
};

/*
* account.sepa()
* update sepa details
*/

exports.sepa = async function(req, res){

  utility.validate(req.body);
  
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));
  
  if(!accountData.stripe_customer_id){
    utility.assert(req.body.token, res.__('account.sepa.missing'), 'token');
  }

  const useExisting = req.body.useExisting;

  const setupIntent = !useExisting && await stripe.customer.setappIntents(accountData.stripe_customer_id, ['sepa_debit']);
  const customer = await stripe.customer(accountData.stripe_customer_id);

  return res.status(200).send(useExisting ? {
    message: res.__('account.sepa.updated'),
    data: true
  } : { 
    requires_payment_action: true,
    method: 'directdebit',
    type: 'setup',
    client_secret: setupIntent.client_secret,
    billing_details: {
      email: req.body.email,
      name: req.body.account_holder_name,
    },
    // prefer_payment_method: req.body.prefer_payment_method,
    message: res.__('account.sepa.updated')
  });
};

/*
* account.sepa.attach()
* attach sepa payment to customer
*/

exports.sepa.attach = async function(req, res){

  // utility.validate(req.body);
  utility.assert(req.body.transaction, res.__('account.invalid'));
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));
  
  if(!accountData.stripe_customer_id){
    utility.assert(req.body.token, res.__('account.sepa.missing'), 'token');
  }
  console.log(accountData);
  
  const sepaPayment = await stripe.customer.sepaSettings(req.body.paymentId, accountData.stripe_customer_id, req.body.prefer_payment_method);

  let paymentIntent;
  const transactionUser = await transaction.getById({id: new mongoose.Types.ObjectId(req.body.transaction)})
  console.log(transactionUser);

  if(transactionUser){
    paymentIntent = await stripe.paymentIntent({
      amount: transactionUser.amount * 100,
      id: accountData.stripe_customer_id,
      userId: req.user.id,
      payment_method: req.body.paymentId,
    })
  }

  return res.status(200).send({ 
    
    requires_payment_action: true,
    method: 'directdebit',
    client_secret: paymentIntent.client_secret,
    billing_details: {
      email: req.body.email,
      name: req.body.account_holder_name,
    },
    transaction: req.body.transaction,
    message: res.__('account.sepa.updated')
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
    
    const sepa = await stripe.customer.paymentMethod(accountData.stripe_customer_id, 'sepa_debit');
    
    if (card || sepa){
      let data = {};
      if(sepa.data?.[0]){
        data.sepa_debit = {
          brand: 'sepa_debit',
          last4: sepa.data[0].sepa_debit.last4,
          name: sepa.data[0].billing_details?.name,
          prefer_payment_method: customer.invoice_settings.default_payment_method === sepa.data[0].id
        }
      } 
      if (card) {
        data.card = {
          brand: card.brand,
          last4: card.last4,
          exp_month: card.exp_month,
          exp_year: card.exp_year,
          name: card.name,
          prefer_payment_method: customer.invoice_settings.default_payment_method ? customer.invoice_settings.default_payment_method === card.id : true
        }
      }
      data.address = {
        city: customer.address?.city || '',
        country: customer.address?.country  || '',
        street: customer.address?.line1  || '',
        state: customer.address?.state  || '',
        state_2: customer.address?.postal_code  || '',
      }
      data.invoice_recipient =  customer.name
      data.email = customer.email
      
      return res.status(200).send({ data });
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

  utility.validate(req.body);
  
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__('account.invalid'));
  
  if(!accountData.stripe_customer_id){
    utility.assert(req.body.token, res.__('account.card.missing'), 'token');
  }

  const customer = req.body.token?.id && await stripe.customer.update({ id: accountData.stripe_customer_id, token: req.body.token.id });

  const getCustomer = await stripe.customer(accountData.stripe_customer_id);
  card = getCustomer.sources?.data?.[0];

  if(req.body.section === 'payment_method'){
    const customerSource = await stripe.updateSource(
      accountData.stripe_customer_id,
      card.id,
      {
        name: req.body.credit_card_name,
      },
      req.body.prefer_payment_method
    )
    // notify the user
    const send = await notification.get({ account: accountData.id, name: 'card_updated' });

    if (send){
      await mail.send({

        to: accountData.owner_email,
        locale: req.locale,
        custom: true,
        template: 'card_updated',
        content: { name: accountData.owner_name }

      });
    }
  } else if (req.body.section === 'email'){
    const updateEmail = await stripe.customer.updateEmail({id: accountData.stripe_customer_id, email: req.body.email})
  }  else if (req.body.section === 'invoice_recipient'){
    const updateName = await stripe.customer.updateName({id: accountData.stripe_customer_id, name: req.body.invoice_recipient})
  }  else if (req.body.section === 'address'){
    const customerAddress = await stripe.updateAddress(
      accountData.stripe_customer_id,
      {
        city: req.body.city,
        country: req.body.country,
        line1: req.body.street,
        state: req.body.state,
        postal_code: req.body.state_2,
      }
    )
  }

  return res.status(200).send({ 
    
    data: customer?.sources?.data?.[0],
    message: res.__('account.card.updated')
  
  });
};

/*
* registerParticipant.successPayment()
* attach sepa payment to customer
*/

exports.successPayment = async function (req, res) {
  // utility.validate(req.body);
  utility.assert(req.body.transaction, res.__("account.invalid"));
  const accountData = await account.get({ id: req.account });
  utility.assert(accountData, res.__("account.invalid"));

  if (!accountData.stripe_customer_id) {
    utility.assert(
      accountData.stripe_customer_id,
      res.__("account.sepa.missing")
    );
  }

  const transactionUser = await transaction.findOneAndUpdate(
    { id: new mongoose.Types.ObjectId(req.body.transaction) },
    {
      status: "paid",
    }
  );

  const eventUser = await event.getById({
    id: new mongoose.Types.ObjectId(transactionUser.event_id),
  });

  if (transactionUser && eventUser) {
    const mainUser = await registeredParticipant.findOneAndUpdate(
      { id: new mongoose.Types.ObjectId(transactionUser.participant_id) },
      {
        status: "registered",
      }
    );
    const mainUserUpdated = await user.update({
      id: req.user,
      account: req.account,
      data: {
        onboarded: true,
      },
    });

    // send email
    await mail.send({
      to: mainUser.email,
      locale: req.locale,
      custom: true,
      template: "event_registered",
      subject: `${eventUser.city.name} - ${res.__(
        "payment.registered_event.subject"
      )}`,
      content: {
        name: `${mainUser.first_name} ${mainUser.last_name}`,
        body: res.__("payment.registered_event.body", {
          name: eventUser.city.name,
          event: eventUser.city.name,
          date: utility.formatDateString(eventUser.date || new Date()),
        }),
        button_url: process.env.CLIENT_URL,
        button_label: res.__("payment.registered_event.button"),
      },
    });

    const data =
      transactionUser?.sub_participant_id &&
      Array.isArray(transactionUser?.sub_participant_id) &&
      (await Promise.all(
        transactionUser.sub_participant_id?.map(async (idSub) => {
          const subUser = await registeredParticipant.findOneAndUpdate(
            { id: new mongoose.Types.ObjectId(idSub) },
            {
              status: "registered",
            }
          );
          // send email
          await mail.send({
            to: subUser.email,
            locale: req.locale,
            custom: true,
            template: "event_registered",
            subject: `${eventUser.city.name} - ${res.__(
              "payment.registered_event.subject"
            )}`,
            content: {
              name: `${subUser.first_name} ${subUser.last_name}`,
              body: res.__("payment.registered_event.body", {
                name: eventUser.city.name,
                event: eventUser.city.name,
                date: utility.formatDateString(eventUser.date || new Date()),
              }),
              button_url: process.env.CLIENT_URL,
              button_label: res.__("payment.registered_event.button"),
            },
          });
          const existed = await user.get({ email: subUser.email });

          if (existed) {
            const accountData = await account.create();
            // const hash = await user.password({ id: subUser.id, account: accountData.id });
            const currentUser = await user.update({
              _id: new mongoose.Types.ObjectId(existed._id),
              data: {
                account: [
                  {
                    id: accountData.id,
                    permission: "owner",
                    onboarded: false,
                  },
                ],
                default_account: accountData.id,
              },
            });

            const token = await auth.token({
              data: { timestamp: Date.now(), user_id: existed.id },
              secret: process.env.TOKEN_SECRET,
              duration: 7200000000,
            });

            await mail.send({
              to: subUser.email,
              locale: req.locale,
              custom: true,
              template: "join_meetlocal",
              subject: `${res.__("payment.join_meetlocal.subject")}`,
              content: {
                name: `${subUser.first_name} ${subUser.last_name}`,
                body: res.__("payment.join_meetlocal.body", {
                  name: eventUser.city.name,
                  event: eventUser.city.name,
                  date: utility.formatDateString(eventUser.date || new Date()),
                }),
                button_url: `${process.env.CLIENT_URL}/resetpassword?token=${token}`,
                button_label: res.__("payment.join_meetlocal.button"),
              },
            });
          }
          return { ...subUser };
        })
      ));

    // Check capacity and send warning email after all participants are registered
    const currentRegistrations = await RegisteredParticipant.countDocuments({
      event_id: transactionUser.event_id,
      status: "registered",
    });

    const totalCapacity = eventUser.bars.reduce(
      (sum, bar) => sum + bar.available_spots,
      0
    );

    if (
      currentRegistrations >= totalCapacity * 0.9 &&
      !eventUser.capacity_warning_sent
    ) {
   
      try {
        // Get all admin accounts (accounts with name "Master")
        const adminAccounts = await mongoose.model("Account").find({
          name: "Master",
          active: true
        }).select('id').lean();

        console.log(`📧 Found ${adminAccounts.length} admin accounts:`, adminAccounts.map(acc => acc.id));

        // Get all admin users (users whose default_account matches admin account IDs)
        const adminUserIds = adminAccounts.map(account => account.id);
        const adminUsers = await mongoose.model("User").find({
          default_account: { $in: adminUserIds }
        }).select('email name').lean();

        console.log(`👥 Found ${adminUsers.length} admin users:`, adminUsers.map(user => ({ email: user.email, name: user.name })));

        // Send email to all admin users
        for (const adminUser of adminUsers) {
          console.log(`📤 Sending email to: ${adminUser.email} (${adminUser.name || 'Admin'})`);
          
          const emailData = {
            to: adminUser.email,
            template: "event_registered",
            subject: `🚨 Event Capacity Warning - ${eventUser.tagline}`,
            custom: true,
            content: {
              name: adminUser.name || "Admin",
              body: `
                <h2 style="color: #e74c3c; margin-bottom: 20px;">⚠️ Event Capacity Warning</h2>
                <p style="margin-bottom: 15px;"><strong>Event Details:</strong></p>
                <ul style="margin-bottom: 20px; padding-left: 20px;">
                  <li><strong>Event:</strong> ${eventUser.tagline}</li>
                  <li><strong>Date:</strong> ${new Date(
                    eventUser.date
                  ).toLocaleDateString()}</li>
                  <li><strong>Time:</strong> ${eventUser.start_time} - ${
                eventUser.end_time
              }</li>
                  <li><strong>City:</strong> ${eventUser.city.name}</li>
                  <li><strong>Current Registrations:</strong> ${currentRegistrations}</li>
                  <li><strong>Total Capacity:</strong> ${totalCapacity}</li>
                  <li><strong>Available Spots:</strong> ${
                    totalCapacity - currentRegistrations
                  }</li>
                  <li><strong>Capacity Percentage:</strong> ${Math.round(
                    (currentRegistrations / totalCapacity) * 100
                  )}%</li>
                </ul>
                <p style="margin-bottom: 15px;"><strong>Bar Details:</strong></p>
                <ul style="margin-bottom: 20px; padding-left: 20px;">
                  ${eventUser.bars
                    .map(
                      (bar) => `
                    <li><strong>${bar._id.name}:</strong> ${bar.available_spots} spots available</li>
                  `
                    )
                    .join("")}
                </ul>
                <p style="color: #e74c3c; font-weight: bold; margin-bottom: 20px;">
                  ⚠️ This event has reached 90% capacity! Consider taking action to manage registrations.
                </p>
                <p style="margin-bottom: 20px;">
                  <strong>Action Required:</strong> Monitor registration activity closely. The event may reach full capacity soon.
                </p>
              `,
              button_url: `${process.env.MISSION_CONTROL_CLIENT}/event-management`,
              button_label: "View Event Dashboard",
            },
          };

          await mail.send(emailData);
          console.log(`✅ Email sent successfully to: ${adminUser.email}`);
        }

        await mongoose
          .model("EventManagement")
          .findByIdAndUpdate(transactionUser.event_id, { capacity_warning_sent: true });
      } catch (emailError) {
        console.error("❌ EMAIL SEND FAILED:", emailError);
      }
    } else {
      if (currentRegistrations >= totalCapacity * 0.9) {
        console.log("ℹ️ 90% reached but warning already sent");
      } else {
        console.log("ℹ️ Not yet at 90% capacity");
      }
    }
  }

  return res.status(200).send({
    data: {},
    message: res.__("account.sepa.updated"),
  });
};