const AppError = require('../errors/AppError');

function notFound(req, res, next) {
  next(new AppError('NOT_FOUND', 'The requested resource was not found.', 404));
}

function errorHandler(logger = console) {
  return (error, req, res, _next) => {
    let appError = error instanceof AppError
      ? error
      : new AppError('INTERNAL_ERROR', 'An unexpected error occurred.', 500, { cause: error });

    if (error?.type === 'entity.too.large') {
      appError = new AppError('REQUEST_TOO_LARGE', 'The request body is too large.', 413);
    } else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      appError = new AppError('INVALID_JSON', 'The request body must be valid JSON.', 400);
    }

    const log = {
      event: 'request_error',
      requestId: req.requestId,
      videoId: req.videoId,
      applicationErrorCode: appError.code,
      statusCode: appError.statusCode,
      retryable: appError.retryable,
    };
    (appError.statusCode >= 500 ? logger.error : logger.warn)?.(JSON.stringify(log));

    res.status(appError.statusCode).json({
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        requestId: req.requestId,
      },
    });
  };
}

module.exports = { errorHandler, notFound };
