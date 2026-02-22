const helmet = require('helmet');
const crypto = require('crypto');

function nonceMiddleware(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('hex');
  next();
}

function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,
          "https://cdn.jsdelivr.net",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com"
        ],
        styleSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,
          "https://fonts.googleapis.com"
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "https://nyibucket.s3.amazonaws.com", "data:"],  
        mediaSrc: ["'self'", "https://nyibucket.s3.amazonaws.com"],
        connectSrc: [
          "'self'",
          "ws://localhost:8000",
          "https://podsolic-merri-indivertibly.ngrok-free.dev", 
          "http://localhost:5005",
          "https://cdn.jsdelivr.net"
        ],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  });
}

module.exports = {
  nonceMiddleware,
  helmetMiddleware
};
