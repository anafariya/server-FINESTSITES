require('dotenv').config();
const emails = require('./email/data');
const mongo = require('../model/mongo');
const Email = require('../model/email').schema;

async function seed(){

  try {

    await mongo.connect();
    await Email.insertMany(emails);
    console.log('✅ Database seeded')
    return process.exit(0)

  }
  catch (err){

    console.error(err);
    return process.exit(1)

  }
}

seed();