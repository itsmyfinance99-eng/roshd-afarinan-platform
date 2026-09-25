export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Persian subjects and long URLs in bodies are fine
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
