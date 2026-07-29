#!/usr/bin/env node

'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { App } = require('@axiosleo/cli-tool');
const app = new App({
  name: 'sql2api',
  version: '0.0.0',
  desc: 'sql2api cli tools',
  commands_dir: path.join(__dirname, '../packages/commands'),
  commands_sort: ['help']
});

app.start();
