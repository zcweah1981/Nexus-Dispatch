/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/__tests__', '<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/node_modules/',
    '<rootDir>/tests/legacy/',
    '<rootDir>/src/webui/dist/',
    '<rootDir>/src/webui/node_modules/',
    '<rootDir>/src/gateway/node_modules/',
    '<rootDir>/.git/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/node_modules/',
    '<rootDir>/src/webui/dist/',
    '<rootDir>/src/webui/node_modules/',
    '<rootDir>/src/gateway/node_modules/',
  ],
  watchPathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/node_modules/',
    '<rootDir>/data/',
    '<rootDir>/prisma/data/',
    '<rootDir>/logs/',
    '<rootDir>/proofs/',
    '<rootDir>/.hermes/proofs/',
  ],
  moduleNameMapper: {
    '^uuid$': require.resolve('uuid'),
  },
};
