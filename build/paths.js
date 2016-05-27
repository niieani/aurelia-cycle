var appRoot = 'src/';
var outputRoot = 'dist/';

module.exports = {
  root: appRoot,
  source: appRoot + '**/*.ts',
  output: outputRoot,
  doc: './doc',
  dtsSrc: [
    './typings/globals/**/*.d.ts',
    './typings/modules/**/*.d.ts',
    './custom_typings/**/*.d.ts'
  ]
}
