class HttpError extends Error {
  // `field` (optional) names the form field the message belongs to.
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

module.exports = HttpError;
