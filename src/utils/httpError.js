class HttpError extends Error {
  // `field` (optional) names the form field the message belongs to.
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

// 422 with several field messages: { fieldName: 'message' }.
HttpError.validation = (fields) => {
  const error = new HttpError(422, 'Les données envoyées sont invalides.');
  error.fields = fields;
  return error;
};

module.exports = HttpError;
