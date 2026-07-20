const AppError = require('../errors/AppError');

function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  const clients = new Map();
  return function rateLimit(req, _res, next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const currentTime = now();
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= currentTime) entry = { count: 0, resetAt: currentTime + windowMs };
    entry.count += 1;
    clients.set(key, entry);

    if (clients.size > 10000) {
      for (const [clientKey, clientEntry] of clients) {
        if (clientEntry.resetAt <= currentTime) clients.delete(clientKey);
      }
    }
    if (entry.count > max) {
      return next(new AppError('RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.', 429, { retryable: true }));
    }
    next();
  };
}

module.exports = { createRateLimiter };
