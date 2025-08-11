require('dotenv').config();
const mongo = require('../../model/mongo');
const trialsExpiring = require('./trials_expiring').run;
const unverifiedUsers = require('./unverified_users').run;
const Queue = require('bull');

// config
const maxJobsPerWorker = 1;

async function run(){

  // start
  console.log('Onboarding worker is running');
  const onboardingQueue = new Queue('onboarding', process.env.REDIS_JOB_URL);
  await mongo.connect();

  onboardingQueue.process(maxJobsPerWorker, async (job, done) => {

    console.log(`Processing job: ${job.id}`);

    try {

      job.progress('processing');

      // execute
      await trialsExpiring();
      await unverifiedUsers();
      done();

    }
    catch (err){

      console.log(err);
      done(new Error(err));

    }
  });
  
  onboardingQueue.on('completed', (job, result) => {

    console.log(`Job: ${job.id} completed`);

  });
}

run();