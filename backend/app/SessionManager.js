const crypto = require('crypto');

class SessionError extends Error {}

function SessionManager () {
	const CookieMaxAgeMs = 600000;
	this.sessions = {};
	this.createSession = function(response, username, maxAge = CookieMaxAgeMs) {
		const token = crypto.randomBytes(32).toString('hex');
		const session = { username: username, createdAt: Date.now(), maxAge: maxAge };
		this.sessions[token] = session;
	
		console.log('[DEBUG] Session created:', this.sessions);
	
		const cookieOptions = {
			maxAge: maxAge,
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			path: '/'
		};
		response.cookie("cpen322-session", token, cookieOptions);
	
		setTimeout(() => {
			console.log(`[DEBUG] Deleting session: ${token}`);
			delete this.sessions[token];
		}, maxAge);
	
		return token;
	};

	const BOT_USERNAME = "Nav-Mini";
	this.initializeBotSession = function() {
		const botToken = crypto.randomBytes(32).toString('hex');
		const botSession = { username: BOT_USERNAME, createdAt: Date.now(), isBot: true };
		this.sessions[botToken] = botSession;

		console.log('[DEBUG] Bot session initialized:', botSession);
		return botToken; // Return bot token for reference
	};

	this.deleteSession = (req) => {
		delete req.username;
		delete this.sessions[req.session];	
		delete req.session;
		console.log('[DEBUG] Attempting to delete session:', req.session);
		if (!this.sessions[req.session]) {
			console.error('[ERROR] Session not found:', req.session);
		}
	};

/* 	this.middleware = (req, res, next) => {
		const cookieHeader = req.headers.cookie;
		if (!cookieHeader) {
			next(new SessionError("Cookie header not found"));
			return;
		}
	
		const cookies = cookieHeader.split(';').map(cookie => {
			const parts = cookie.split('=');
			return {name: parts[0].trim(), value: parts[1]?.trim()};
		});
		const sessionCookie = cookies.find(cookie => cookie.name === "cpen322-session");
	
		if (!sessionCookie) {
			next(new SessionError("Session cookie not found"));
			return;
		}
	
		const session = this.sessions[sessionCookie.value];
	
		if (!session) {
			next(new SessionError("Session not found"));
			return;
		}
	
		req.session = sessionCookie.value;
		req.username = session.username;
		next();	
	}; */

	this.middleware = (req, res, next) => {
		console.log('Incoming request headers:', req.headers); 
	
		const cookieHeader = req.headers.cookie;
		if (!cookieHeader) {
			console.error('[DEBUG] Missing cookie header in request:', req.headers);
			return next(new SessionError("Cookie header not found"));
		}
		const cookies = cookieHeader.split(';').map(cookie => {
			const parts = cookie.split('=');
			return { name: parts[0].trim(), value: parts[1]?.trim() };
		});
		console.log('Parsed cookies:', cookies); 
	
		const sessionCookie = cookies.find(cookie => cookie.name === "cpen322-session");
	
		if (!sessionCookie) {
			console.error("Error: Session cookie not found"); 
			return next(new SessionError("Session cookie not found"));
		}
	
		const session = this.sessions[sessionCookie.value];
		console.log('Found session:', session); 
	
		if (!session) {
			console.error(`[DEBUG] Session not found for token: ${sessionCookie.value}`);
			console.error("[DEBUG] Active sessions:", this.sessions);
			next(new SessionError("Session not found"));
			return;
		}
	
		req.session = sessionCookie.value;
		req.username = session.username;
		console.log('Middleware passed: username =', req.username); 
	
		next();
	};
	
	this.getUsername = (token) => ((token in this.sessions) ? this.sessions[token].username : null);
};


SessionManager.Error = SessionError;
module.exports = SessionManager;
