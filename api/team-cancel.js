const express = require('express');
const auth = require('../model/auth');
const registeredParticipantController = require('../controller/registerParticipantController');
const api = express.Router();
const use = require('../helper/utility').use;

console.log('[API] Loading dedicated team cancel routes...');

// Test endpoint
api.get('/api/team-test', (req, res) => {
  console.log('[API] Team cancel test route called');
  res.json({ 
    message: 'Team cancel API is working', 
    timestamp: new Date().toISOString(),
    route: 'PUT /api/admin/cancel-team/:teamId'
  });
});

// Team cancellation endpoint
api.put('/api/admin/cancel-team/:teamId', auth.verify('owner'), use(registeredParticipantController.adminCancelTeam));

console.log('[API] Team cancel routes loaded successfully');

module.exports = api;
exports.default = api;