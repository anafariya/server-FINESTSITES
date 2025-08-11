const fs = require('fs').promises;
const utility = require('../helper/utility');
const fileHelper = require('../helper/file');
const developmentSettingsFile = '../config/default.json';
const productionSettingsFile = '../config/production.json';

exports.database = {};

/*
* setup.database()
* create the database tables
*/

exports.database.sql = async function(settings){

  const db = require('./knex')(settings);
  await db.migrate.latest();

  // remove mongo seed file
  try {

    await fs.access('./seeds/mongo.js');
    await fs.unlink('./seeds/mongo.js');

  }
  catch (err) { /* do nothing */ }

  // seed the db
  await db.seed.run();

  // move model files to root folder
  const files = await fs.readdir('./model/sql');

  for (file of files)
    await fs.copyFile('./model/sql/' + file, './model/' + file);

  return;

};

exports.database.mongo = async function(host){

  // move model files to root folder
  const files = await fs.readdir('./model/mongo');

  for (const file of files)
    await fs.copyFile(`./model/mongo/${file}`, `./model/${file}`);

  // remove sql seed file
  try {

    await fs.access('./seeds/sql.js');
    await fs.unlink('./seeds/sql.js');

  }
  catch (err) { /* do nothing */ }

  // remove +srv from connection string on localhost
  if (host.includes('localhost') || host.includes('127.0.0.1'))
    await fileHelper.replace({ path: './model/mongo.js', find: '+srv', replace: '' });

  // inject lines to server.js
  await fileHelper.line.insert({ path: './server.js', lines: [

    { find: 'model/log', insert: "const mongo = require('./model/mongo');" },
    { find: 'model/mongo', insert: "const mongoSanitize = require('express-mongo-sanitize');" },
    { find: 'express.urlencoded', insert: '\n// mongo sanitise \napp.use(mongoSanitize());' },
    { find: "console.log(i18n.__('global.welcome'))", insert: '  await mongo.connect();' },
    
  ]})

  // inject lines into workers
  await fileHelper.line.insert({ path: 'worker/onboarding/index.js', lines: [

    { find: "require('dotenv').config();", insert: "const mongo = require('../../model/mongo');" },
    { find: 'new Queue', insert: '  await mongo.connect();' }
    
  ]})

  await fileHelper.line.insert({ path: 'worker/usage/index.js', lines: [

    { find: "require('dotenv').config();", insert: "const mongo = require('../../model/mongo');" },
    { find: 'new Queue', insert: '  await mongo.connect();' }
    
  ]})

  // add connection to bin/master
  await fileHelper.line.insert({ path: 'bin/master.js', lines: [

    { find: 'const account = require(\'../model/account\');', insert: 'const mongo = require(\'../model/mongo\');' },
    { find: 'try {', insert: '    await mongo.connect();' }
    
  ]})

  // move template
  await fs.copyFile('./template/mongo/model.js', './template/model.js');

  // remove knex file
  return await fileHelper.delete('./model/knex.js');

}

/*
* setup.stripe()
* get the stripe product and plans
*/

exports.stripe = async function({ secretAPIKey, freePlan }){

  const stripe = require('stripe')(secretAPIKey);
  
  let stripeConfig = { seat_billing: false, plans: [] }
  const plans = await stripe.prices.list({ expand: ['data.tiers'] });

  if (secretAPIKey.includes('test') && !plans.data.length)
    throw ({ message: 'Please set up a Stripe product and billing plans in your Stripe dashboard or skip this step' });

  if (freePlan){
    stripeConfig.plans.push({

      id: 'free',
      name: 'Free',
      type: 'free',
      price: 0,
      interval: plans.data[0].recurring?.interval,
      currency: {
        name: plans.data[0].currency,
        symbol: utility.currencySymbol[plans.data[0].currency]
      },
      features: [
        { name: 'Awesome feature', checked: true },
        { name: 'Another amazing feature', checked: true },
        { name: 'The best feature ever', checked: true }
      ]
    });
  }

  plans.data.forEach((plan, i) => {

    const type = plan.tiers_mode ? 'tiered' : 'standard';

    if (utility.currencySymbol[plan.currency]){
      stripeConfig.plans.push({

        id: plan.id,
        name: plan.nickname || `Plan ${i+1}`,
        type: type,
        price: (type === 'tiered' ? plan.tiers?.[0]?.unit_amount : plan.unit_amount) / 100,
        interval: type === 'tiered' ? 'unit' : plan.recurring?.interval,
        currency: { 
          
          name: plan.currency, 
          symbol: utility.currencySymbol[plan.currency] 
        
        },
        features: [
          { name: 'Awesome feature', checked: true },
          { name: 'Another amazing feature', checked: true },
          { name: 'The best feature ever', checked: true }
        ]
      });
    }
    else {

      throw { message: 'Please add your currency to /helper/utility.currencySymbol and try again' }

    }
  })

  return stripeConfig

}

/*
* setup.client()
* save the stripe publishable key for React
*/

exports.client = async function(data, mode){

  let settingsFile = require('../../client/src/settings.json');

  Object.keys(data).map(key => {

    settingsFile[mode || 'development'][key] = data[key]

  })

  return await fs.writeFile('../client/src/settings.json', JSON.stringify(settingsFile, null, 2));

}

/*
* setup.settings()
* update the configuration settings
*/

exports.settings = async function({ key, value, mode }){

  let file = 'config/default.json';
  let settings = require(developmentSettingsFile)

  if (mode === 'production'){

    file = 'config/production.json';
    settings = require(productionSettingsFile);

  }

  // update the key/value
  settings[key] = value;
  await fs.writeFile(file, JSON.stringify(settings, null, ' '))
  return ({ message: key.charAt(0).toUpperCase() });

}

/*
* setup.settings()
* update package.json
*/

exports.package = async function({ add, remove }){

  let package = require('../package.json');

  remove.forEach(key => {
    if (package.dependencies.hasOwnProperty(key)){

      delete package.dependencies[key];

    }
  });

  await fs.writeFile('package.json', JSON.stringify(package, null, ' '));
  return;

}

/*
* setup.settings()
* update the env file
*/

exports.env = async function({ key, value }){

  let didUpdate = false;
  let file = await fs.readFile('./.env', 'utf8');
  file = file.split('\n');

  // edit existing key
  if (file.length){
    file.forEach((line, index) => {
      if (line.includes(key)){

        file[index] = `${key}=${value}`;
        didUpdate = true;

      }
    });

    // create a new key
    if (!didUpdate){

      file.push(`${key}=${value}`)

    }

    file = file.join('\n');
    await fs.writeFile('./.env', file);

  }

  return;

}