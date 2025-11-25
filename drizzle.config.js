import 'dotenv/config'; // Load environment variables from .env file

// Drizzle configuration for database schema and connection
export default {
  schema: './src/models/*.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
