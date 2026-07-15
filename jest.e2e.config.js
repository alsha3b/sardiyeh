// E2E tests drive a real headless Chromium with the unpacked extension loaded.
// Kept separate from the unit config because these need the node environment
// and a browser, and are slower. Run with: npm run test:e2e
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/e2e/**/*.test.js"],
  testTimeout: 30000,
};
