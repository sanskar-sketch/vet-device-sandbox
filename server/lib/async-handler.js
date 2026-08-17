/**
 * Wraps an async Express handler/middleware so a rejected promise reaches
 * Express's error handling instead of hanging the request (Express 4 has no
 * built-in async/await support).
 */
function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { ah };
