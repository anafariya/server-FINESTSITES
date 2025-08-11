function importTest(name, path) {

  describe(name, () => { require(path) });

}

describe('Starting Tests', function () {

  process.env.TESTING=true

  beforeEach(function () {

    // silence console during tests
    console.log = function (){};

  });

  importTest('Testing account', './account');
  importTest('Testing user', './user');
  importTest('Testing feedback', './feedback');
  importTest('Testing API keys', './key');
  importTest('Testing event', './event');
  importTest('Cleaning up', './cleanup');

  after(() => {

    delete console.log
    process.env.TESTING=false

  });
});
