// Loads TEST_DATABASE_URL from .env.test when present. Absent in CI or on a
// fresh clone, in which case DB-backed tests skip rather than fail.
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env.test');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}
