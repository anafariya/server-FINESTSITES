const Queue = require('bull');
const utility = require('../helper/utility');
const { v4: uuidv4 } = require('uuid');
const jobQueue = new Queue('jobs', process.env.REDIS_JOB_URL);

/*
* job.create()
* create a new job
*/

exports.create = async function(req, res){
  
  const job = await jobQueue.add({ 
    
    id: uuidv4(), 
    user_id: req.user, 
    account_id: req.account 
  
  });

  job.progress('started');
  return res.status(200).send({ data: job });

}

/*
* job.get()
* get the status of a job
*/
exports.get = async function(req, res){

  utility.assert(req.params.id, res.__('job.invalid_id'));
  
  const job = await jobQueue.getJob(req.params.id);
  return res.status(200).send({ data: job });

}

/*
* job.update()
* update a job
*/
exports.update = async function(req, res){

  utility.assert(req.params.id, res.__('job.invalid_id'));

  const job = await jobQueue.getJob(req.params.id);
  await job.update({ ...req.body, ...job.data });

  return res.status(200).send({ data: job });

}

/*
* job.delete()
* delete a job
*/
exports.delete = async function(req, res){

  utility.assert(req.params.id, res.__('job.invalid_id'));

  const job = await jobQueue.getJob(req.params.id);
  await job.remove();

  return res.status(200).send({ message: res.__('job.removed', { id: req.params.id}) });

}