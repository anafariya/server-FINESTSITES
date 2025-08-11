const express = require('express');
const auth = require('../model/auth');
const matchingPhaseController = require('../controller/matchingPhaseController');
const api = express.Router();
const use = require('../helper/utility').use;

api.get('/api/matching/participants/:id', auth.verify('user'), use(matchingPhaseController.getParticipants));
api.post('/api/matching/swipe', auth.verify('user'), use(matchingPhaseController.handleSwipe));
api.post('/api/matching/swipe/undo', auth.verify('user'), use(matchingPhaseController.undoSwipe));
api.post('/api/matching/superlike/confirm', auth.verify('user'), use(matchingPhaseController.confirmSuperlike));
api.get('/api/matching/incoming-superlikes/:eventId', auth.verify('user'), use(matchingPhaseController.getIncomingSuperlikes));
api.get('/api/matching/matches', auth.verify('user'), use(matchingPhaseController.getMatchesWithChats));
api.get('/api/matching/unmatched', auth.verify('user'), use(matchingPhaseController.getUnMatched));
api.post('/api/matching/unlock-chat', auth.verify('user'), use(matchingPhaseController.unlockChat));

module.exports = api;
