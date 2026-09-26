module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  testTimeout: 30000,
  collectCoverageFrom: ['SessionManager.js', 'Database.js', 'sentimentAnalyzer.js', 'bot/*.js', 'ws/handler.js'],
  coverageDirectory: 'coverage',
};
