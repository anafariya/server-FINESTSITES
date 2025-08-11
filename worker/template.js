require('dotenv').config();
const Queue = require('bull');

// config
const maxJobsPerWorker = 1;

async function run(){

  // start
  console.log('Job worker is running');
  const jobQueue = new Queue('jobs', process.env.REDIS_JOB_URL);

  jobQueue.process(maxJobsPerWorker, async (job, done) => {

    console.log(`Processing job: ${job.id}`);

    try {

      job.progress('processing');

      // TODO: ADD YOUR JOB FUNCTION HERE
      setTimeout(() => {

        job.progress('completed')
        done();

      }, 10000);
    }
    catch (err){

      console.log(err);
      done(new Error(err));

    }
  });
  
  jobQueue.on('completed', (job, result) => {

    console.log(`Job: ${job.id} completed`);

  });
}

run();