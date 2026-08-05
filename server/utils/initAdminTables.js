const pool = require('../db');

const DDL = `
  CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    system_name VARCHAR(255) NOT NULL DEFAULT 'Work Immersion Monitoring System',
    logo_url TEXT,
    school_name VARCHAR(255),
    school_address TEXT,
    academic_year VARCHAR(50),
    semester VARCHAR(50),
    attendance_time_in TIME DEFAULT '08:00',
    attendance_time_out TIME DEFAULT '17:00',
    announcements TEXT,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT one_settings_row CHECK (id = 1)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT false,
    action_url TEXT,
    related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    evaluator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    evaluation_type VARCHAR(100) NOT NULL,
    rating INTEGER CHECK (rating BETWEEN 1 AND 10),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  INSERT INTO system_settings (id, system_name)
    SELECT 1, 'Work Immersion Monitoring System'
    WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1);
`;

async function initAdminTables() {
  await pool.query(DDL);
}

module.exports = { initAdminTables, DDL };
