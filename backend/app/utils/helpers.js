const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function parseCookies(cookieHeader) {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce((cookies, item) => {
        const eqIdx = item.indexOf('=');
        if (eqIdx === -1) return cookies;
        const name = item.slice(0, eqIdx).trim();
        const value = item.slice(eqIdx + 1).trim();
        cookies[name] = value;
        return cookies;
    }, {});
}

async function hashPassword(plaintextPassword) {
    return bcrypt.hash(plaintextPassword, 12);
}

async function isCorrectPassword(plaintextPassword, storedHash) {
    // Bcrypt hashes start with $2b$ or $2a$
    if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
        return bcrypt.compare(plaintextPassword, storedHash);
    }
    // Legacy SHA-256 path: migrate existing accounts transparently
    const salt = storedHash.substring(0, 20);
    const storedBase64Hash = storedHash.substring(20);
    const storedHex = Buffer.from(storedBase64Hash, 'base64').toString('hex');
    const checkHex = crypto.createHash('sha256').update(plaintextPassword + salt).digest('hex');
    return checkHex === storedHex;
}

module.exports = { parseCookies, hashPassword, isCorrectPassword };
