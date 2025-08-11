const express = require('express');
const config = require('config');
const auth = require('../model/auth');
const limiter = require('express-rate-limit');
const accountController = require('../controller/accountController');
const throttle = config.get('throttle');
const api = express.Router();
const use = require('../helper/utility').use;

/* account */
api.post('/api/account', limiter(throttle.signup), use(accountController.create));

api.post('/api/account/plan', auth.verify('owner'), use(accountController.plan));

api.post('/api/account/coupon', auth.verify('owner'), use(accountController.coupon));

api.patch('/api/account/plan', auth.verify('owner', 'billing.update'), use(accountController.plan.update));

api.get('/api/account', auth.verify('owner', 'account.read', 'unverified'), use(accountController.get));

api.get('/api/account/card', auth.verify('owner', 'billing.read'), use(accountController.card));

api.patch('/api/account/card', auth.verify('owner', 'billing.update'), use(accountController.card.update));

api.get('/api/account/invoice', auth.verify('owner', 'billing.read'), use(accountController.invoice))

api.get('/api/account/plans', auth.verify('public'), use(accountController.plans));

api.get('/api/account/users', auth.verify('admin', 'account.read'), use(accountController.users));

api.get('/api/account/subscription', auth.verify('user', 'billing.read'), use(accountController.subscription));

api.get('/api/account/usage', auth.verify('admin', 'billing.read'), use(accountController.usage));

api.post('/api/account/upgrade', auth.verify('owner', 'billing.update'), use(accountController.upgrade));

api.delete('/api/account', auth.verify('owner', 'account.delete', 'unverified'), use(accountController.close));

api.delete('/api/account/:id', auth.verify('owner', 'account.delete'), use(accountController.close));

module.exports = api;
