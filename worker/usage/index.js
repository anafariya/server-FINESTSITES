require('dotenv').config();
const mongo = require('../../model/mongo');
const Queue = require('bull');
const stripe = require('../../model/stripe');
const usage = require('../../model/usage');

// config
const maxJobsPerWorker = 1;

async function run(){

  // start
  console.log('Usage worker is running');
  const usageQueue = new Queue('usage', process.env.REDIS_JOB_URL);
  await mongo.connect();

  usageQueue.process(maxJobsPerWorker, async (job, done) => {

    console.log(`Processing job: ${job.id}`);

    try {

      job.progress('processing');

      // 1. get unreported usage
      const reports = await usage.get({ reported: false });

      // 2. loop report for each account
      if (reports.length){
        for (report of reports){

          // account has stripe subscription
          if (report.stripe_subscription_id){

            // get the subscription item id
            const s = await stripe.subscription(report.stripe_subscription_id);
            const id = s?.items?.data?.[0].id;

            if (id)
              await stripe.subscription.usage.report({ subscription: id, quantity: report.quantity });

          }
          
          // open a new report for next period for this account
          await usage.open({ account: report.account_id })

        }

        // close reported reports
        await usage.close({ id: reports.map(x => { return x.id }) });
        done();

      }
    }
    catch (err){

      console.log(err);
      done(new Error(err));

    }
  });
  
  usageQueue.on('completed', (job, result) => {

    console.log(`Job: ${job.id} completed`);

  });
}

run();