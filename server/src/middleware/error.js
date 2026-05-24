export function notFound(req, res) {
  res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.statusCode || error.status || 500;
  const message = status >= 500 ? 'Something went wrong' : error.message;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({ message });
}
