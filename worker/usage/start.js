require('dotenv').config();
const config = require('config');
const Queue = require('bull');
const usageQueue = new Queue('usage', process.env.REDIS_JOB_URL);

async function run(){

  try {
    
    // start the worker and add jobs based on config interval
    await usageQueue.add(false, { 
      
      repeat: config.get('worker_schedule.usage'),

    });

    console.log('✅ Usage jobs started')
    process.exit(0);

  }
  catch (err){

    console.log(err)
    process.exit(1);

  }
}

run();