const express = require('express');
const auth = require('../model/auth');
const jobController = require('../controller/jobController');
const api = express.Router();
const use = require('../helper/utility').use;

/* account */
api.post('/api/job', auth.verify('owner', 'job.create'), use(jobController.create));

api.get('/api/job/:id', auth.verify('owner', 'job.read'), use(jobController.get));

api.patch('/api/job/:id', auth.verify('owner', 'job.update'), use(jobController.update));

api.delete('/api/job/:id', auth.verify('owner', 'job.delete'), use(jobController.delete));

module.exports = api;
