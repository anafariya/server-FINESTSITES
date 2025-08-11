const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../server');
const should = chai.should();
const config = require('./config');

chai.use(chaiHttp);

// delete the paid account
describe('DELETE /account', () => {
  it ('should delete the paid account', done => {

    chai.request(server)
    .delete('/api/account')
    .set(config.auth, process.env.token)
    .send({ password: config.account.paid.password })
    .end((err, res) => {

      res.should.have.status(200);
      done();

    })
  }).timeout(config.timeout);
});

// delete the free account
describe('DELETE /account', () => {
  it ('should delete the free account', done => {

    chai.request(server)
    .delete('/api/account')
    .set(config.auth, process.env.free_token)
    .send({ password: config.account.free.password })
    .end((err, res) => {

      res.should.have.status(200);
      done();

    })
  }).timeout(config.timeout)
});

// delete invite
describe ('DELETE /invite', () => {
  it ('should delete the invite', done => {

    chai.request(server)
    .delete(`/api/invite/${process.env.invite}`)
    .set(config.auth, process.env.token)
    .end((err, res) => {

      res.should.have.status(200);
      done();

    });
  }).timeout(config.timeout);
});
