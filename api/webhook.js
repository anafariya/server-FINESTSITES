const express = require('express');
const webhookController = require('../controller/webhookController');
const api = express.Router();
const use = require('../helper/utility').use;

/* stripe */
api.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), use(webhookController.stripe));

module.exports = api;
