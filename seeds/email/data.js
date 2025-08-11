// dynamically import all the locale seeds 
// from this folder

const fs = require('fs');
const path = require('path');

let emails = [];
const dir = path.join(__dirname, './'); 

fs.readdirSync(dir).forEach(file => {

  if (file.endsWith('.js') && file !== 'data.js'){

    const content = require(path.join(dir, file));
    emails = [...emails, ...content];
    
  }
});

module.exports = emails;