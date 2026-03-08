module.exports = {
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'https://www.csfd.cz/',
  },
  testMatch: ['**/tests/**/*.test.cjs', '**/tests/**/*.spec.cjs'],
};
