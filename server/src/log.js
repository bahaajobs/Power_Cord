const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const write = (level, scope, args) =>
  console.log(`${stamp()} ${level.padEnd(5)} [${scope}]`, ...args);

export const logger = (scope) => ({
  info: (...a) => write('info', scope, a),
  warn: (...a) => write('warn', scope, a),
  error: (...a) => write('error', scope, a),
});
