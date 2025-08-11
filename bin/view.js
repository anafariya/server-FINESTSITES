require('dotenv').config();
const fs = require('fs').promises;
const client = '../client';
const app = '../app';
const fileHelper = require('../helper/file');

exports.create = async function(args, useClack){

  const name = args[1];
  const isMongo = process.env.DB_CLIENT === 'mongo' ? true : false;
  const capitalisedName = name.charAt(0).toUpperCase() + name.slice(1);

  if (args[1].includes('-')){

    console.log('⛔️ Please provide a name as the first argument');
    return false;

  }

  try {

    // create the model, controller, locales and api endpoints
    const template = isMongo ? 'mongo/model' : 'sql/model';
    await createFile(template, name, './model/' + name + '.js');
    await createFile('controller', name, './controller/' + name + 'Controller.js');
    await createFile('api', name, './api/' + name + '.js');

    // create the locale files
    const locales = await fs.readdir('locales', { withFileTypes: true });

    for (const dirent of locales) {

      if (!dirent.isDirectory()) 
        continue;
      
      const localeName = dirent.name; 
      await createFile('locale/server', name, `locales/${localeName}/${localeName}_${name}.json`, capitalisedName, '.json')

    }

    // create the ui (optional)
    if (args.indexOf('-ui') > -1){

      try {

        await fs.access(client);

        // list view
        await fs.mkdir(`${client}/src/views/${name}`, { recursive: true });
        await createFile('view/web/list', name, `${client}/src/views/${name}/list.jsx`, capitalisedName, '.jsx');

        // detail view
        await createFile('view/web/detail', name, `${client}/src/views/${name}/detail.jsx`, capitalisedName, '.jsx');

        // create the route file
        await createFile('route/web', name, `${client}/src/routes/${name}.js`, capitalisedName);
        await fileHelper.line.insert({ path: `${client}/src/app/app.jsx`, lines: [

          { find: '// routes', insert: `import ${capitalisedName}Routes from 'routes/${name}';` },
          { find: 'const routes = [', insert: `  ...${capitalisedName}Routes,` }
          
        ]})

        // create the locale files
        const locales = await fs.readdir(`${client}/src/locales`, { withFileTypes: true });
        
        for (const dirent of locales){

          // check if it's a directory
          if (!dirent.isDirectory()) 
            continue;   

          const localeName = dirent.name; 
          await createFile('locale/client', name, `${client}/src/locales/${localeName}/${localeName}_${name}.json`, capitalisedName, '.json')

        }
      }
      catch (err){

        // enable this for debugging
        // console.error(err);

      }

      try {

        await fs.access(app);
        await createFile('view-native', name, `${app}/views/` + name + '.js', capitalisedName);

        // create the locale files
        const locales = await fs.readdir(`${app}/locales`, { withFileTypes: true });

        for (const dirent of locales){

          if (!dirent.isDirectory()) 
            continue;

          const localeName = dirent.name; 
          await createFile('locale', `${localeName}_${name}.json`, `${app}/locales/${localeName}/${localeName}_${name}.json`, capitalisedName, '.json')

        }

      } catch (err) {

        // enable this for debugging
        // console.error(err);;

      }
    }

    // create datebase (optional)
    if (args.indexOf('-db') > -1 && !isMongo){

      await createDatabase(name);

    }

    if (useClack)
      return {};

    console.log(`✅ ${name} created`);
    process.exit();

  }
  catch (err){

    if (useClack)
      return { err };

    console.error(err);
    process.exit();

  }
}

async function createFile(templateName, viewName, path, capitalisedName, ext){

  const template = './template/' + templateName + (ext || '.js');
  let file = await fs.readFile(template, 'utf8');
  file = file.replace(/{{view}}/g, viewName);
  file = file.replace(/{{capitalisedName}}/g, capitalisedName);
  await fs.writeFile(path, file, { flag: 'wx' });
  return;

}

async function createDatabase(viewName){

  const db = require('../model/knex')();
  const res = await db.migrate.make(viewName, { stub: 'template/migration.js' });
  const filename = res.substring(res.indexOf('migrations/'));
  
  // inject table table
  let file = await fs.readFile(filename, 'utf8');
  file = file.replace(/{{view}}/g, viewName);
  await fs.writeFile(filename, file);

  return true;

}
