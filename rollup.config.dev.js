import typescript from 'rollup-plugin-typescript2';
import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import serve from 'rollup-plugin-serve';
import terser from '@rollup/plugin-terser';
import ignore from './rollup-plugins/ignore';
import {ignoreTextfieldFiles} from './elements/ignore/textfield';
import {ignoreSelectFiles} from './elements/ignore/select';
import {ignoreSwitchFiles} from './elements/ignore/switch';

const serveopts = {
  contentBase: ['./lovelace'],
  host: '0.0.0.0',
  port: 5000,
  allowCrossOrigin: true,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
};

const plugins = [
  resolve({
    extensions: ['.js', '.ts'],
    browser: true,
  }),
  typescript(),
  json(),
  babel({
    exclude: 'node_modules/**',
  }),
  terser(),
  serve(serveopts),
  ignore({
    files: [...ignoreTextfieldFiles, ...ignoreSelectFiles, ...ignoreSwitchFiles].map((file) => require.resolve(file)),
  }),
];

export default {
  input: ['src/electricity-schedule-card.ts'],
  output: {
    dir: './lovelace',
    format: 'es',
  },
  context: 'window',
  plugins: plugins,
};
