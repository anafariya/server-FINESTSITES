/* delete me after setup */
const express = require('express');
const setupController = require('../controller/setupController');
const api = express.Router();
const use = require('../helper/utility').use;

api.get('/api/setup/database', use(setupController.database));

api.post('/api/setup/database', use(setupController.database.update));

api.get('/api/setup/domain', use(setupController.domain));

api.post('/api/setup/domain', use(setupController.domain.update));

api.get('/api/setup/stripe', use(setupController.stripe));

api.post('/api/setup/stripe', use(setupController.stripe.update));

api.post('/api/setup/auth', use(setupController.auth));

api.get('/api/setup/mailgun', use(setupController.mailgun));

api.post('/api/setup/mailgun', use(setupController.mailgun.update));

module.exports = api;
