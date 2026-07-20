const { randomUUID } = require('crypto');

function requestId(req, res, next) {
  const supplied = req.get('x-request-id');
  req.requestId = supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  res.set('x-request-id', req.requestId);
  next();
}

module.exports = { requestId };
