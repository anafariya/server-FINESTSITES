const db = require('./knex')();
const { v4: uuidv4 } = require('uuid');

/*
* usage.open();
* open a new usage report for this period starting now
*/

exports.open = async function({ account }){
  
  await db('usage').insert({ 
    
    id: uuidv4(), 
    account_id: account, 
    quantity: 0,
    period_start: new Date()
  
  });
}

/*
* usage.get();
* get the usage for an account between 
*/

exports.get = async function({ account, period_start, period_end, reported }){

  return await db('usage')
  .select('usage.id', 'account_id', 'period_start', 'period_end', 'quantity', 'reported', 'stripe_subscription_id')
  .join('account', 'usage.account_id', 'account.id')
  .modify(q => {

    if (account)
      q.where({ account_id: account })

    if (period_start || period_end){

      q.andWhere('period_start', '>=', period_start)
      q.andWhere('period_end', '<=', period_end).orWhere('period_end', null); // include open reports
    
    }

    if (reported !== undefined)
      q.andWhere('reported', reported)

  });
}

/*
* usage.get.total();
* get the total usage for an account
* returns just one total, not all rows 
*/

exports.get.total = async function({ account, period_start, period_end }){

  const data = await db('usage')
  .sum('quantity as total')
  .where({ account_id: account })
  .modify(q => {

    if (period_start || period_end){

      q.andWhere('period_start', '>=', period_start)
      q.andWhere('period_end', '<=', period_end).orWhere('period_end', null); // include open reports
    
    }
  });

  return data?.[0]?.total || 0;

}

/*
* usage.increment();
* increment the usage for an account for the current period
* a new period starts when the the usage is reported to stripe 
* the reporting interval is defined in config.worker_schedule.usage
*/

exports.increment = async function({ account, quantity }){ 

  return await db('usage')
  .increment('quantity', quantity || 1)
  .where({ account_id: account })
  .andWhere('reported', false)
  .andWhere('period_end', null)

}

/*
* usage.close();
* close a usage report
*/

exports.close = async function({ id }){

  return await db('usage').update({

    period_end: new Date(),
    reported: true

  }).whereIn('id', id);
}