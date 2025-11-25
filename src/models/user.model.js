import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

// Define the "users" table schema
// with columns: id, name, email, password, role, create_at, update_at
// Each column has its data type and constraints specified
// For example, "id" is a primary key and auto-incremented,
// "email" is unique and not null, and timestamps have default values
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  email: varchar('email', { length: 256 }).notNull().unique(),
  password: varchar('password', { length: 512 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  create_at: timestamp().defaultNow().notNull(),
  update_at: timestamp().defaultNow().notNull(),
});
