const express = require('express');
const auth = require('../model/auth');
const virtualCurrencyController = require('../controller/virtualCurrencyController');
const api = express.Router();
const use = require('../helper/utility').use;

api.post('/api/virtual-currency/checkout', auth.verify('user'), use(virtualCurrencyController.checkout));

module.exports = api;
