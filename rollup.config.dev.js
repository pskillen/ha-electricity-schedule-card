import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
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
  nodeResolve({
    extensions: ['.js', '.ts'],
    browser: true,
  }),
  commonjs(),
  typescript(),
  json(),
  babel({
    exclude: 'node_modules/**',
  }),
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
