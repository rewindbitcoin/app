module.exports = {
  extends: [
    './node_modules/@bitcoinerlab/configs/eslintConfig',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  plugins: ['react', 'react-hooks'],
  rules: {
    // Add any specific rules you want to override or enforce
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-hooks/refs': 'warn' // change from 'error' to 'warn'
  },
  settings: {
    react: {
      version: 'detect' // Automatically detect the React version
    }
  }
};
