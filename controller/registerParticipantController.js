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
const moment = require('moment-timezone');
const log = require('../model/log');

const RegisteredParticipant = mongoose.model("RegisteredParticipant");

const checkEventFull = async (eventId) => {
  const eventData = await event.getById({ id: eventId });
  if (eventData?.is_canceled) {
    throw { message: 'This event has been canceled. Registration is not allowed.' };
  }
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
      coupon: joi.string().allow(null, ''),
  
    }), req, res); 
  
    const stripeData = {};
  
    const accountData = await account.get({ id: req.account });
    utility.assert(accountData, res.__('account.invalid'));

    const transactionUser = await transaction.getById({id: new mongoose.Types.ObjectId(id)})
    utility.assert(transactionUser, res.__('event.already_paid'));

    
    
    // Check if coupon covers full amount for free registration
    let totalAfterCoupon = transactionUser.amount;
    let couponData = null;
    
    if (data.coupon) {
      try {
        couponData = await stripe.coupon(data.coupon);
        
        if (couponData && couponData.valid) {
          const originalAmountCents = transactionUser.amount * 100;
          const discountCents = couponData.amount_off;
          const finalAmountCents = Math.max(0, originalAmountCents - discountCents);
          totalAfterCoupon = finalAmountCents / 100;
        } else {
        }
      } catch (couponError) {
      }
    } else {
    }

    // If account=true OR coupon covers full amount, skip payment processing
    const skipPayment = data.account || (totalAfterCoupon <= 0 && couponData);
    
    

    if(transactionUser && !skipPayment){
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

      // Block payment if event has been canceled by admin
      if (eventData.is_canceled) {
        return res.status(400).send({ error: res.__('event.canceled_by_admin', 'This event has been canceled. Payment is not allowed.') });
      }
    }


    if (data.stripe === undefined && !skipPayment){

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

    // Handle free registration with voucher
    if (skipPayment && couponData && totalAfterCoupon <= 0) {
      
      // Complete the registration directly without payment
      try {
        await exports.successPayment({ 
          body: { transaction: id },
          user: req.user,
          account: req.account,
          locale: req.locale
        }, {
          __: res.__,
          status: (code) => ({ send: (data) => { 
            return res.status(200).send({ 
              free_registration: true, 
              message: 'Registration completed with voucher',
              voucher_used: data.coupon,
              amount_saved: couponData.amount_off / 100
            });
          }})
        });
        return;
      } catch (error) {
        return res.status(500).send({ error: 'Failed to complete free registration' });
      }
    } else if (skipPayment) {
      
    }

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
  
  
  const sepaPayment = await stripe.customer.sepaSettings(req.body.paymentId, accountData.stripe_customer_id, req.body.prefer_payment_method);

  let paymentIntent;
  const transactionUser = await transaction.getById({id: new mongoose.Types.ObjectId(req.body.transaction)})
  

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

        

        // Get all admin users (users whose default_account matches admin account IDs)
        const adminUserIds = adminAccounts.map(account => account.id);
        const adminUsers = await mongoose.model("User").find({
          default_account: { $in: adminUserIds }
        }).select('email name').lean();

        

        // Send email to all admin users
        for (const adminUser of adminUsers) {
          
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
        }

        await mongoose
          .model("EventManagement")
          .findByIdAndUpdate(transactionUser.event_id, { capacity_warning_sent: true });
      } catch (emailError) {
        
      }
    } else {
      if (currentRegistrations >= totalCapacity * 0.9) {
        
      } else {
      }
    }
  }

  return res.status(200).send({
    data: {},
    message: res.__("account.sepa.updated"),
  });
};

/*
 * registerParticipant.cancelRegistration()
 * Cancel user event registration with voucher/refund logic
 */
exports.cancelRegistration = async function (req, res) {
  try {
    const userId = req.user;
    const eventId = req.body.eventId;

    utility.assert(eventId, res.__('register_participant.event_id_required'));

    const userData = await user.get({ id: userId });
    utility.assert(userData, res.__('user.not_found'));

    // Find the user's registration for this event
    const registration = await RegisteredParticipant.findOne({
      user_id: userData._id,
      event_id: new mongoose.Types.ObjectId(eventId),
      status: 'registered',
      is_cancelled: { $in: [false, null] }
    }).populate({
      path: 'event_id',
      populate: {
        path: 'city',
        select: 'name'
      }
    });

    utility.assert(registration, res.__('register_participant.registration_not_found'));

    const eventData = registration.event_id;
    utility.assert(eventData, res.__('event.not_found'));

    // Calculate hours until event start (using Berlin timezone)
    // Parse the event date and start time properly
    const eventDateForTime = moment(eventData.date).format('YYYY-MM-DD');
    const startTime = eventData.start_time || '19:00'; // Default to 7 PM if no start time
    const eventDateTime = moment.tz(`${eventDateForTime} ${startTime}`, 'YYYY-MM-DD HH:mm', 'Europe/Berlin');
    const nowBerlin = moment.tz('Europe/Berlin');
    const hoursUntilEvent = eventDateTime.diff(nowBerlin, 'hours', true);

    // Mark registration as cancelled
    await RegisteredParticipant.findByIdAndUpdate(registration._id, {
      status: 'canceled',
      is_cancelled: true,
      cancel_date: new Date()
    });

    let voucherData = null;

    if (hoursUntilEvent > 24) {
      // Create voucher using Stripe
      try {
        // Get event price from transaction or use default
        const Transaction = mongoose.model('Transaction');
        const transactionData = await Transaction.findOne({
          event_id: eventId,
          user_id: userData._id,
          status: 'paid'
        });
        
        const eventPrice = transactionData?.amount || 25; // Use transaction amount or default
        
        const eventName = eventData.city?.name ? 
          `${eventData.city.name} Event - ${moment(eventData.date).format('DD.MM.YYYY')}` :
          `Bar-Hopping Event - ${moment(eventData.date).format('DD.MM.YYYY')}`;

        voucherData = await stripe.createCoupon({
          userId: userData._id.toString(),
          eventName: eventName,
          amount: eventPrice
        });

      } catch (stripeError) {
        // Continue with cancellation even if voucher creation fails
      }
    } 
    // Send confirmation email
    const emailTemplateBase = voucherData ? 'event_cancelled_with_voucher' : 'event_cancelled_no_voucher';
    const emailTemplate = (userData.locale || 'en').toString().toLowerCase().startsWith('de') 
      ? `${emailTemplateBase}_de` 
      : emailTemplateBase;
    const eventName = eventData.city?.name || 'Bar-Hopping';
    const eventDate = moment(eventData.date).format('DD.MM.YYYY');
    
    const emailContent = {
      name: userData.first_name || userData.name,
      body: voucherData ? 
        res.__('register_participant.cancelled_with_voucher.body', 'Your registration for the {{event_name}} on {{event_date}} has been successfully cancelled. Since you cancelled more than 24 hours before the event, we\'ve generated a voucher for you to use on future events.', {
          event_name: `${eventName} Event`,
          event_date: eventDate
        }) :
        res.__('register_participant.cancelled_no_voucher.body', 'Your registration for the {{event_name}} on {{event_date}} has been cancelled. Unfortunately, since you cancelled within 24 hours of the event start time, no refund or voucher can be issued.', {
          event_name: `${eventName} Event`,
          event_date: eventDate
        }),
      event_name: `${eventName} Event`,
      event_date: eventDate,
      domain: process.env.CLIENT_URL || 'http://localhost:3000',
      ...(voucherData && {
        voucher_code: voucherData.id,
        voucher_amount: `€${voucherData.amount_off / 100}`,
        voucher_expiry: moment.unix(voucherData.redeem_by).format('DD.MM.YYYY')
      })
    };

    await mail.send({
      to: userData.email,
      locale: userData.locale || 'en',
      html_template: emailTemplate,
      subject: voucherData ? 
        res.__('register_participant.cancelled_with_voucher.subject', 'Event Cancelled - Voucher Issued') : 
        res.__('register_participant.cancelled_no_voucher.subject', 'Event Cancelled - No Refund Available'),
      content: emailContent
    });

    const responseMessage = voucherData ? 
      res.__('register_participant.cancelled_with_voucher') : 
      res.__('register_participant.cancelled_no_voucher');

    return res.status(200).send({
      message: responseMessage,
      data: {
        cancelled: true,
        voucher_issued: !!voucherData,
        voucher_code: voucherData?.id,
        hours_until_event: hoursUntilEvent
      }
    });

  } catch (error) {
    return res.status(500).send({
      message: error.message || res.__('register_participant.cancellation_failed')
    });
  }
};