export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);

  if (statusCode >= 500) {
    console.error('[Server Error]', err);
  }

  let message = err.message || 'Internal Server Error';
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `An account or record with that ${field} already exists.`;
  } else if (err.name === 'ValidationError') {
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('. ');
  }

  const payload = {
    success: false,
    message,
    ...(err.code ? { code: err.code } : {}),
    ...(err.execution ? { execution: err.execution } : {}),
  };

  res.status(err.code === 11000 ? 409 : statusCode).json(payload);
}
