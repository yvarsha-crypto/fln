module.exports = {
  projects: [
    {
      displayName: 'server',
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
      },
      testMatch: ['<rootDir>/server/__tests__/**/*.test.ts'],
      moduleFileExtensions: ['ts', 'js', 'json']
    },
    {
      displayName: 'client',
      testEnvironment: 'jsdom',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
      },
      testMatch: ['<rootDir>/src/__tests__/**/*.test.tsx'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json']
    }
  ]
};
