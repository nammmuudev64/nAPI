const sql = require('mssql');
require('dotenv').config();

const isTrusted = process.env.DB_TRUSTED_CONNECTION === 'true';

const config = {
  server:   process.env.DB_SERVER || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME   || 'crud_db',
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    enableArithAbort:       true,
  },
  pool: {
    max:               10,
    min:               0,
    idleTimeoutMillis: 30000,
  },
};

if (isTrusted) {
  config.options.trustedConnection = true;
} else {
  config.user     = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD;
}

let pool;

const getPool = async () => {
  if (pool) return pool;
  try {
    pool = await sql.connect(config);
    console.log('✅  SQL Server connected successfully');
    return pool;
  } catch (err) {
    console.error('❌  SQL Server connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = { getPool, sql };
