import postgres from 'postgres';

// Connect to the default 'postgres' database to create our new database
const sql = postgres({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: 'postgres',
  ssl: false,
});

async function main() {
  try {
    // Check if database already exists
    const existing = await sql`
      SELECT 1 FROM pg_database WHERE datname = 'agent_monitor'
    `;
    
    if (existing.length > 0) {
      console.log('Database "agent_monitor" already exists.');
    } else {
      // CREATE DATABASE cannot run inside a transaction, use unsafe
      await sql.unsafe('CREATE DATABASE agent_monitor');
      console.log('Database "agent_monitor" created successfully.');
    }
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log('Database "agent_monitor" already exists.');
    } else {
      console.error('Error creating database:', err.message);
      process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

main();
