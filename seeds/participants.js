require('dotenv').config();
const mongoose = require('mongoose');
const users = require('./user-custom/data');
const mongo = require('../model/mongo');
const user = require('../model/user');
const account = require('../model/account');
const registeredParticipant = require('../model/registered-participant');
const transaction = require('../model/transaction');

const eventId = '6896dcd41cf97a5cf5485404';

async function seed(){

  try {

    await mongo.connect();
    await Promise.all(users.map(async(usr) => {
      const saveAccount = await account.create();
      const saveUser = await user.create({
        user: {
          account: [
            {
              id: saveAccount.id,
              permission: "owner",
              onboarded: true,
            },
          ],
          name: usr.name,
          email: usr.email,
          avatar: null,
          verified: true,
          is_invited: false,
          gender: usr.gender,
          date_of_birth: usr.date_of_birth,
          looking_for: usr.looking_for,
          relationship_goal: usr.relationship_goal,
          children: usr.children,
          kind_of_person: usr.kind_of_person,
          feel_around_new_people: usr.feel_around_new_people,
          prefer_spending_time: usr.prefer_spending_time,
          describe_you_better: usr.describe_you_better,
          describe_role_in_relationship: usr.describe_role_in_relationship,
          password: 'asdasdasd?',
          step: 3,
          onboarded: true,
          first_name: usr.first_name,
          last_name: usr.last_name,
        }, 
        default_account: saveAccount.id,
      })
      if(saveUser){
        const saveEventRegistration = await registeredParticipant.create({
          user_id: new mongoose.Types.ObjectId(saveUser._id),
          event_id: new mongoose.Types.ObjectId(eventId),
          first_name: usr.first_name,
          last_name: usr.last_name,
          gender: usr.gender,
          date_of_birth: usr.date_of_birth,
          email: usr.email,
          status: 'registered',
          is_main_user: true,
          looking_for: usr.looking_for,
          relationship_goal: usr.relationship_goal,
          children: usr.children,
          kind_of_person: usr.kind_of_person,
          feel_around_new_people: usr.feel_around_new_people,
          prefer_spending_time: usr.prefer_spending_time,
          describe_you_better: usr.describe_you_better,
          describe_role_in_relationship: usr.describe_role_in_relationship,
          is_test: true
        })

        if(saveEventRegistration){
          const saveTransaction = await transaction.create({
            user_id: new mongoose.Types.ObjectId(saveUser._id),
            participant_id: new mongoose.Types.ObjectId(saveEventRegistration._id),
            type: 'Register Event',
            amount: 20,
            event_id: new mongoose.Types.ObjectId(eventId),
            status: 'paid'
          })
        }
      }
    }))
    console.log('✅ Database seeded')
    return process.exit(0)

  }
  catch (err){

    console.error(err);
    return process.exit(1)

  }
}

seed();