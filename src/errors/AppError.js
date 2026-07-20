class AppError extends Error {
  constructor(code, message, statusCode = 500, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = Boolean(options.retryable);
  }
}

module.exports = AppError;
