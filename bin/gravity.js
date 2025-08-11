#!/usr/bin/env node
const clack = require('@clack/prompts')
const view = require('./view');
const component = require('./component');
const master = require('./master');
const Mocha = require('mocha');
const mocha = new Mocha({});

async function gravity(){

  const args = process.argv.splice(2);
  const command = args[0];

  switch (command){

    case 'create':
    if (args[1] === 'component') component.create(args);
    else if (args[1] === 'master') master.create(args);
    else view.create(args);
    break;

    case 'help':
    showHelp();
    break;

    case 'test':
    runTests();
    break;

    default:
    showHelp();
    break;

  }
}

async function showHelp(){

  clack.intro('Welcome to the Gravity Toolbelt 🔧');
  const spinner = clack.spinner();

  const action = await clack.select({
    message: 'What would you like to do?',
    options: [
      { value: 'view', label: 'Scaffold new MVC', hint: 'New set of model, view, controller and API files' },
      { value: 'component', label: 'Create a new React component' },
      { value: 'master', label: 'Create a new master account' },
    ],
    required: true
  });

  switch (action){
    
    case 'view':
    await createMVC(spinner);
    break;

    case 'master':
    await createMasterAccount(spinner);
    break;

    case 'component':
    await createComponent(spinner);
    break;

  }

  clack.outro('Done');
  process.exit();

}

async function createMVC(spinner){

  const name = await clack.text({

    message: 'What would you like to call your entity?',
    validate(value) { if (value.length === 0) return 'Name is required!' }

  });

  const options = await clack.multiselect({

    message: 'Want anything extra? (press space to select, enter to confirm or skip)',
    options: [
      { value: '-ui', label: 'Create the UI view', hint: 'Add the UI view and route to the React client' },
      { value: '-db', label: 'Create the DB migration', hint: 'Create a new migration file to setup your database table' },
    ],
    required: false

  });

  spinner.start('Creating view');
  const { err } = await view.create(['create', name, ...options], true);

  if (err)
    return clack.log.error(err.message);

  spinner.stop(`${name} created`);

}

async function createMasterAccount(spinner){

  const email = await clack.text({
    message: `What's the account email address?`,
    validate(value) {
      if (value.length === 0) return `Email is required!`;
    },
  });

  const password = await clack.password({
    message: `What's the account password?`,
    validate(value) {
      if (value.length === 0) return `Email is required!`;
    },
  });

  spinner.start('Creating master account');
  const { err } = await master.create(['create', 'master', `${email}:${password}`], true);  

  if (err)
    return clack.log.error(err.message);

  spinner.stop('Master account created');

}

async function createComponent(spinner){

    const name = await clack.text({
      message: 'What would you like to call your component?',
      validate(value) {
        if (value.length === 0) return `Name is required!`;
      },
    });

    spinner.start('Creating component');
    const { err } = await component.create(['create', 'component', name], true);

    if (err)
      return clack.log.error(err.message);

    spinner.stop(`${name} created`);

}

async function runTests(){

  mocha.addFile('./test/run');
  mocha.run().on('end', process.exit);

}

gravity();
