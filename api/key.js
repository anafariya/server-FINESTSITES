const express = require('express');
const auth = require('../model/auth');
const keyController = require('../controller/keyController');
const api = express.Router();
const use = require('../helper/utility').use;

api.post('/api/key', auth.verify('developer', 'key.create'), use(keyController.create));

api.get('/api/key', auth.verify('developer', 'key.read'), use(keyController.get));

api.get('/api/key/scopes', auth.verify('developer', 'key.read'), use(keyController.scopes));

api.get('/api/key/:id', auth.verify('developer', 'key.read'), use(keyController.get));

api.patch('/api/key/:id', auth.verify('developer', 'key.update'), use(keyController.update));

api.delete('/api/key', auth.verify('developer', 'key.delete'), use(keyController.delete));

module.exports = api;
