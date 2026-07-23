/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  testEnvironment: "node",
  // The processors here are Prisma-heavy grouping/creation logic verified via
  // live integration testing against a real Postgres instance (see
  // docs/implementation/IMPLEMENTATION_STATUS.md) rather than mocked unit
  // tests. passWithNoTests keeps `pnpm test` green until isolated unit tests
  // are added, instead of silently succeeding with a misleading test count.
  passWithNoTests: true,
};
