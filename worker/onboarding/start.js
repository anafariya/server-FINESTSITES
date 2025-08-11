require('dotenv').config();
const config = require('config');
const Queue = require('bull');
const onboardingQueue = new Queue('onboarding', process.env.REDIS_JOB_URL);

async function run(){

  try {
    
    // start the worker and add daily jobs
    await onboardingQueue.add(false, { 
      
      repeat: config.get('worker_schedule.onboarding'),

    });

    console.log('✅ Onboarding jobs started')
    process.exit(0);

  }
  catch (err){

    console.log(err)
    process.exit(1);

  }
}

run();