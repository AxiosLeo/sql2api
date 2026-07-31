import dotenv from 'dotenv';
dotenv.config();

const aiProviderRaw = (process.env.AI_PROVIDER || 'local').toLowerCase();
const aiProvider = aiProviderRaw === 'ollama' ? 'ollama' : 'local';

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
    invoke_log: {
      retention_days: process.env.INVOKE_LOG_RETENTION_DAYS
        ? parseInt(process.env.INVOKE_LOG_RETENTION_DAYS, 10)
        : 30
    },
    ai: {
      provider: aiProvider as 'local' | 'ollama',
      model_path: process.env.LLAMA_MODEL_PATH || '',
      ollama: {
        base_url: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
        model: process.env.OLLAMA_MODEL || 'gpt-oss:20b',
        timeout_ms: process.env.OLLAMA_TIMEOUT_MS
          ? parseInt(process.env.OLLAMA_TIMEOUT_MS, 10)
          : 120000,
        api_key: process.env.OLLAMA_API_KEY || ''
      }
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
