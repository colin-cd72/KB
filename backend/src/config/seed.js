const bcrypt = require('bcryptjs');
const { pool } = require('./database');
require('dotenv').config();

async function seed() {
  try {
    console.log('Seeding database...');

    // Create default admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    await pool.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['admin@kb.local', adminPassword, 'Administrator', 'admin']);

    // Create default categories
    const categories = [
      { name: 'Hardware', description: 'Hardware-related issues', color: '#ef4444' },
      { name: 'Software', description: 'Software and application issues', color: '#3b82f6' },
      { name: 'Network', description: 'Network and connectivity issues', color: '#22c55e' },
      { name: 'Printing', description: 'Printer and printing issues', color: '#f59e0b' },
      { name: 'Audio/Video', description: 'Audio and video equipment issues', color: '#8b5cf6' },
      { name: 'General', description: 'General troubleshooting', color: '#6b7280' }
    ];

    for (const cat of categories) {
      await pool.query(`
        INSERT INTO categories (name, description, color)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [cat.name, cat.description, cat.color]);
    }

    // Create some default tags
    const tags = [
      { name: 'urgent', color: '#ef4444' },
      { name: 'recurring', color: '#f59e0b' },
      { name: 'workaround', color: '#22c55e' },
      { name: 'needs-review', color: '#3b82f6' },
      { name: 'documentation', color: '#8b5cf6' }
    ];

    for (const tag of tags) {
      await pool.query(`
        INSERT INTO tags (name, color)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING
      `, [tag.name, tag.color]);
    }

    console.log('Seed completed successfully!');
    console.log('Default admin credentials:');
    console.log('  Email: admin@kb.local');
    console.log('  Password: admin123');
    console.log('  *** CHANGE THIS PASSWORD IMMEDIATELY ***');
  } catch (error) {
    console.error('Seed error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch(console.error);
}

module.exports = { seed };
