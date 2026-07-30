import dotenv from 'dotenv';
dotenv.config();

export default {
  envs: {
    deploy: process.env.DEPLOY_ENV || 'local',
    app: {
      web_public: process.env.APP_WEB_PUBLIC || '../web/dist',
      api_port: process.env.API_PORT ? parseInt(process.env.API_PORT) : 13334,
      secret: process.env.APP_SECRET || 'sql2api-dev-secret-change-me'
    },
    admin: {
      username: process.env.ADMIN_USERNAME || 'admin',
      // Empty password disables login (forces explicit configuration).
      password: process.env.ADMIN_PASSWORD || ''
    },
    sqlite: {
      path: process.env.SQLITE_PATH || './data/sql2api.db'
    },
    ai: {
      model_path: process.env.LLAMA_MODEL_PATH || ''
    },
    mysql: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 13306,
      user: process.env.MYSQL_USER || 'root',
      pass: process.env.MYSQL_PASS || '3AQqZTfmww=Ftj',
      db: process.env.MYSQL_DB || 'sql2spi-services',
    }
  }
};
