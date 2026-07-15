// Unit + DOM tests run in jsdom. E2E (puppeteer) uses jest.e2e.config.js.
// setupFilesAfterEach isn't a valid jest option; we load the chrome mock via
// setupFiles (top-level assignment = fresh per test file) and stateful tests
// refresh it in their own beforeEach.
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/test/unit/**/*.test.js"],
  setupFiles: ["<rootDir>/test/helpers/setup.js"],
  clearMocks: true,
};
