import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://iptu_user:iptu_password@localhost:5432/lancamento-iptu',
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export default pool;
