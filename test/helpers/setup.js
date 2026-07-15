// Installs a fresh chrome mock on global. Assigned at top level (works whether
// loaded via setupFiles or setupFilesAfterEach) and, when the test framework is
// available, refreshed before each test so storage state never leaks.
const { createChromeMock } = require("./chrome-mock");

global.chrome = createChromeMock();

if (typeof beforeEach === "function") {
  beforeEach(() => {
    global.chrome = createChromeMock();
  });
}
