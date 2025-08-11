const fs = require('fs');
const path = require('path');
const i18n = require('i18n');

exports.config = function(){

  const translations = {}

  // read all dirs in locales folder
  fs.readdirSync('locales').forEach(entry => {

    const entryPath = path.join('locales', entry);

    // check if entry is a directory before loading it
    if (fs.statSync(entryPath).isDirectory()){

      translations[entry] = load(entry);

    }
  });

  i18n.configure({

    defaultLocale: 'en',
    locales: ['en', 'de'],
    updateFiles: false,
    objectNotation: true,
    staticCatalog: translations

  });
}

function load(locale){

  const translations = {};
  const localePath = `./locales/${locale}`;

  fs.readdirSync(localePath)
  .filter(file => file.endsWith('.json')) // only process `.json` files
  .forEach(file => {

    const fileName = file.replace(`${locale}_`, '').replace('.json', '');
    const filePath = path.join(localePath, file);
    const fileContents = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    translations[fileName] = fileContents;

  });

  return translations;

}

exports.plural = function(path, count){

  const keys = path.split('.');
  const translation = i18n.__(keys.slice(0, -1).join('.'));
  const lastKey = keys[keys.length - 1];
  const pluralKey = count === 1 ? 'one' : 'other';
  return translation[lastKey][pluralKey];

}