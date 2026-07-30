import routers from '@/modules/index';
import { locales } from '@axiosleo/cli-tool';
import { KoaApplication } from '@axiosleo/koapp';
import path from 'path';
import config from './config';
import { startInvokeLogRetention } from './services/retention';

export default class App extends KoaApplication {
  constructor() {
    const debugMode = config.envs.deploy !== 'prod';
    const options = {
      // Stable app_id so koa-session cookie signing survives restarts.
      app_id: 'sql2api-services',
      listen_host: '0.0.0.0',
      debug: debugMode,
      port: config.envs.app.api_port,
      routers,
      body_parser: {
        enableTypes: ['json', 'form', 'text'],
        encode: 'utf-8'
      }
    };
    super(options);
    locales.init({
      format: 'js',
      sets: ['zh-CN', 'en-US'],
      use: 'zh-CN',
      dir: path.join(__dirname, '../locales')
    });
    startInvokeLogRetention();
  }
}
