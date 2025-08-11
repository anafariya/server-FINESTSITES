const express = require('express');
const auth = require('../model/auth');
const transactionController = require('../controller/transactionController');
const registeredParticipantController = require('../controller/registerParticipantController');
const api = express.Router();
const use = require('../helper/utility').use;

api.get('/api/transaction/:id', auth.verify('user'), use(transactionController.getById));

api.post('/api/transaction/success', auth.verify('user'), use(transactionController.successPayment));

api.post('/api/transaction/payment/:id', auth.verify('user'), use(registeredParticipantController.pay));

module.exports = api;
