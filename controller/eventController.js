const joi = require('joi');
const event = require('../model/event');
const chart = require('../helper/chart');
const utility = require('../helper/utility');

exports.create = async function(req, res){

  if (process.env.STORE_EVENT_LOGS === 'true'){

    // validate
    const data = utility.validate(joi.object({
      
      name: joi.string().required(),
      metadata: joi.object()

    }), req, res); 
    
    const eventData = await event.create({ data, user: req.user, account: req.account });
    return res.status(200).send({ message: res.__('event.create.success'), data: eventData });

  }

  res.status(200).send();

}

exports.get = async function(req, res){

  const list = await event.get(req.params.id, req.query);

  if (req.query.name){

    // create a chart
    let chartData;
    const times = await event.times(req.query.name);

    if (times?.length){
      chartData = times.map(x => {
        return {

          label: x.time,
          value: x.total
          
        }
      });
    }
           
    return res.status(200).send({ data: { 

      list: list,
      chart: chartData ? chart.create({ datasets: chartData }) : null

    }});
  }

  res.status(200).send({ data: list });

}

exports.delete = async function(req, res){

  utility.assert(req.params.id, res.__('event.delete.id_required'));
  
  await event.delete(req.params.id);
  res.status(200).send({ message: res.__('event.delete.success') });

}
