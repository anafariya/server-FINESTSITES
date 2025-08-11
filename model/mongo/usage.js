const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Schema = mongoose.Schema;

// define schema
const UsageSchema = new Schema({

  id: { type: String, required: true, unique: true },
  account_id: { type: String, required: true },
  period_start: { type: Date, required: true },
  period_end: { type: Date, required: false },
  quantity: { type: Number, required: true, default: 0 },
  reported: { type: Boolean, required: true, default: 0 },

});

const Usage = mongoose.model('Usage', UsageSchema, 'usage');

/*
* usage.open();
* open a new usage report for this period starting now
*/

exports.open = async function({ account }){

  const newUsageReport = Usage({
    
    id: uuidv4(),
    account_id: account, 
    quantity: 0,
    period_start: new Date()

  });

  return await newUsageReport.save();

}

/*
* usage.get();
* get the usage for an account between 
*/

exports.get = async function({ account, period_start, period_end, reported }){

  const match = {

    ...account && { account_id: account }, 
    ...(reported !== undefined) && { reported: reported }

  }

  const date = {};

  if (period_start || period_end){

    date.period_start = { $gte: new Date(period_start) };
    date.$or = [ { period_end: { $lte: new Date(period_end) }}, { period_end: null }];

  }

  const data = await Usage.aggregate([
    { $match: { ...match, ...date }},
    { $project: { id: 1, account_id: 1, period_start: 1, period_end: 1, quantity: 1, reported: 1 }},
    { $lookup: {

      from: 'account',
      localField: 'account_id',
      foreignField: 'id',
      as: 'account_data'
        
     }},
  ]);

  if (data.length){
    data.forEach(report => {

      report.stripe_subscription_id = report.account_data[0].stripe_subscription_id;
      delete report.account_data;

    })
  } 

  return data;

}

/*
* usage.get.total();
* get the total usage for an account
* returns just one total, not all rows 
*/

exports.get.total = async function({ account, period_start, period_end }){

  const date = {};

  if (period_start || period_end){

    date.period_start = { $gte: new Date(period_start) };
    date.$or = [ { period_end: { $lte: new Date(period_end) }}, { period_end: null }];

  }

  const result = await Usage.aggregate([
    { $match: { 
      
      ...{ account_id: account },
      ...date 
    
    }},
    { $group: {
      _id: null,
      total: { $sum: "$quantity" }
    }}
  ]);

  return result.length > 0 ? result[0].total : 0;

}

/*
* usage.increment();
* increment the usage for an account for the current period
* a new period starts when the the usage is reported to stripe 
* the reporting interval is defined in config.worker_schedule.usage
*/

exports.increment = async function({ account, quantity }){ 

  await Usage.findOneAndUpdate({

    account_id: account,
    reported: false,
    period_end: null

  },{

    $inc: { quantity: quantity || 1 }

  });
}

/*
* usage.close();
* close a usage report
*/

exports.close = async function({ id }){

  await Usage.updateMany({ id: id },{

    period_end: new Date(),
    reported: true

  });
}