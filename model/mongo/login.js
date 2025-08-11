const { v4: uuidv4 } = require('uuid');
const UAParser = require('ua-parser-js');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// define schema
const LoginSchema = new Schema({

  id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  ip: { type: String, required: true },
  time: { type: Date, required: true },
  browser: { type: String },
  device: { type: String }

});

const Login = mongoose.model('Login', LoginSchema, 'login');
exports.schema = Login;

/* login.create()
*  store a new user login
*/

exports.create = async function({ user, req }){

  const parser = new UAParser();
  let device, browser;

  // get ip address
  let ip = (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || 
  req.connection?.remoteAddress || req.socket?.remoteAddress || 
  req.connection?.socket?.remoteAddress;

  if (ip.startsWith('::ffff:')) 
    ip = ip.split(':').pop();

  // get the user agent
  const ua = parser.setUA(req.headers['user-agent']).getResult();

  if (ua){
  
    device = (ua.device.vendor && ua.device.model) ? 
      `${ua.device.vendor} ${ua.device.model}` : 'Desktop'
      
    browser = `${ua.browser.name}`

  }

  const newLogin = Login({

    id: uuidv4(),
    user_id: user,
    ip: ip, 
    time: new Date(),
    browser: browser,
    device: device,

  });

  return await newLogin.save();

}

/*
* login.verify()
* check for a suspicious login based on ip, device or browser
* notify the user when a flag has been set but continue login
* the risk level increases with reach flag set
* if the risk level reaches 3, the login should be blocked
*/

exports.verify = async function({ user, current }){ 

  let riskLevel = 0;

  const flag = {

    ip: current?.ip,
    device: current?.device,
    browser: current?.browser?.split('/')[0]

  }

  const history = await Login.find({ user_id: user, id: { $ne: current.id }})
  .select().limit(200);
  
  // if this isn't the users first log in: perform security checks
  if (history.length){

    // has the user logged in from this IP address before?
    if (history.findIndex(x => x.ip === current.ip) < 0)
      riskLevel++;

    // has the user logged in with this browser before?
    if (history.findIndex(x => x.browser === current.browser) < 0)
      riskLevel++;

    // if this is a third device, set maximum risk level
    const devices = history.filter(x => x.device !== current.device)?.length;
    if (devices > 1) riskLevel++;

  }

  let time = new Date(current.time).toISOString().split('T');
  time = `${time[0]} ${time[1].split('.')[0]}`;

  return {

    flag: flag,
    level: riskLevel,
    time: time
    
  }
}