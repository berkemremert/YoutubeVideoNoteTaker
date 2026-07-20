const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');

function createNotesRoutes({ controller, rateLimitConfig }) {
  const router = express.Router();
  router.post(
    '/generate-notes',
    controller.validateRequest,
    createRateLimiter(rateLimitConfig),
    controller.generateNotes,
  );
  return router;
}

module.exports = { createNotesRoutes };
