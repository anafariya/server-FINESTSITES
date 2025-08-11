const i18n = require('i18n');
const mongoose = require('mongoose');

// HOF to catch errors
exports.use = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
  
exports.convertToMonthName = function(month, locale){

  locale && i18n.setLocale(locale);
  const monthNames = i18n.__('global.months').split(',')
  return monthNames[month-1];

}

exports.formatDateString = function (d){
    const formatter = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date(d));

  }

exports.validate = function(schema, req, res){

  req.locale && i18n.setLocale(req.locale);
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error){

    const messages = error.details.map(err => {

      const field = err.context.key;

      // handle "required" errors
      if (err.type.includes('required')) 
        return res.__('global.validation.required', { field });

      // handle "string.min" errors
      if (err.type === 'string.min') 
        return res.__('global.validation.min_length', { field, min: err.context.limit });

      // handle "string.max" errors
      if (err.type === 'string.max')
        return res.__('global.validation.max_length', { field, max: err.context.limit });

      // handle "string.email" errors
      if (err.type === 'string.email')
        return res.__('global.validation.invalid_email', { field });

      // handle "number.min" errors
      if (err.type === 'number.min')
        return res.__('global.validation.min_value', { field, min: err.context.limit });

      if (field === 'password' && err.type === 'custom')
        return err.message;

      // Handle "string.pattern.base" specifically for password pattern
      if ((field === 'password' || field === 'confirm_password') && err.type === 'string.pattern.base') 
        return res.__('global.validation.password', { field });

      // handle "number.max" error
      if (err.type === 'number.max')
        return res.__('global.validation.max_value', { field, max: err.context.limit });

      // default error message if none of the above match
      return res.__('global.validation.default', { field });

    });

    // throw error with joined messages or return messages as array
    throw { message: messages.join(', ') };

  }

  return value;

}

exports.sanitize = {}

/*
* sanitize.error()
* remove sensitive info from error messages
*/

exports.sanitize.error = function({ err, translate }){

  let message = err.message;

  const sqlKeywords = [
    'select', 'insert', 'update', 'delete', 'from', 'where', 
    'knex', 'sql', 'constraint', 'violates', 'column', 'table'
  ];

  if (err instanceof mongoose.Error.ValidationError || 
      err instanceof mongoose.Error.CastError || 
      err instanceof mongoose.Error.DocumentNotFoundError || 
      err instanceof mongoose.Error.MongooseServerSelectionError || 
      err.code === 11000){

        return translate('global.error'); // generic message for mongoose

  } // end mongoose error
  
  // intercept sql errors
  if (sqlKeywords.some(keyword => err.message.toLowerCase().includes(keyword)))
    return translate('global.error');

  return message; // message is not sensitive

}

exports.assert = function(data, err, input){

  if (!data)
    throw { message: err, ...input && { inputError: input }};

  return true;

}

exports.base64 = {};

exports.base64.encode = function(data){

  return Buffer.from(data).toString('base64');

}

exports.base64.decode = function(data){

  return Buffer.from(data, 'base64').toString('utf-8');

}

exports.dedupeArray = function(arr){
  return arr.filter(function(elem, index, self){

    return index === self.indexOf(elem);

  });
}

exports.currencySymbol = {

  usd: '$',
  gbp: '£',
  eur: '€',
  aud: '$',
  cad: '$'

}

exports.mask = function(s){

  return `${s.slice(0, 3)}...${s.slice(s.length-3, s.length)}`;

}

exports.validateNativeURL = function(url, scheme){

  return url && (url.includes('exp://') || url.includes(`${scheme}://`)) ? url : false;

}

exports.clean = function(data){

  // cleanup objects with nully strings
  // passed via multer
  const res = {};

  if (Object.keys(data).length){
    Object.keys(data).forEach(key => {
    
      if (data[key] === 'undefined') data[key] = undefined;
      if (data[key] === 'false') data[key] = false;
      if (data[key] === 'true') data[key] = true;
      if (data[key] === 'null') data[key] = null;
      if (!isNaN(parseFloat(data[key])) && typeof data[key] !== 'string') data[key] = parseFloat(data[key]);
      res[key] = data[key];

    })
  }

  return res;

}

exports.timestamp = {};

exports.timestamp.utc = function(date){

  return date ? 
    date.toISOString().slice(0, 19).replace('T', ' ') : 
    new Date().toISOString().slice(0, 19).replace('T', ' ');

}