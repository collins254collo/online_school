const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
const { validateAdmissionNo } = require('../config/admissionParser');

const SECRET       = process.env.JWT_SECRET      || 'dev_secret_change_me';
const EXPIRES_IN   = process.env.JWT_EXPIRES_IN  || '8h';
const ADMIN_EXPIRY = process.env.JWT_ADMIN_EXPIRES_IN || '4h';

// ── Helper ───────────────────────────────────────────────────────
function signToken(payload, expiresIn) {
  return jwt.sign(payload, SECRET, { expiresIn });
}

async function getKnownFacultyCodes() {
  const { rows } = await pool.query('SELECT code FROM faculties');
  return rows.map((r) => r.code);
}

// ================================================================
//  STUDENT REGISTRATION
//  POST /api/auth/register
// ================================================================
async function registerStudent(req, res) {
  const { admission_no, full_name, email, password } = req.body;

  if (!admission_no || !full_name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // 1. Parse & validate admission number → derive faculty + year
  const knownCodes = await getKnownFacultyCodes();
  const check = validateAdmissionNo(admission_no.toUpperCase(), knownCodes);

  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  const { facultyCode, year } = check;

  // 2. Lookup faculty id
  const { rows: facRows } = await pool.query(
    'SELECT id, name FROM faculties WHERE code = $1',
    [facultyCode]
  );
  if (!facRows.length) {
    return res.status(400).json({ error: 'Faculty not found.' });
  }
  const faculty = facRows[0];

  // 3. Check duplicate admission or email
  const { rows: existing } = await pool.query(
    'SELECT id FROM students WHERE admission_no = $1 OR email = $2',
    [admission_no.toUpperCase(), email.toLowerCase()]
  );
  if (existing.length) {
    return res.status(409).json({ error: 'Admission number or email already registered.' });
  }

  // 4. Hash password
  const password_hash = await bcrypt.hash(password, 12);

  // 5. Insert student
  const { rows: inserted } = await pool.query(
    `INSERT INTO students
       (admission_no, full_name, email, password_hash, faculty_id, year_of_study)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, admission_no, full_name, email, faculty_id, year_of_study`,
    [admission_no.toUpperCase(), full_name, email.toLowerCase(), password_hash, faculty.id, year]
  );

  const student = inserted[0];

  // 6. Issue token
  const token = signToken(
    {
      id:          student.id,
      role:        'student',
      admissionNo: student.admission_no,
      facultyId:   student.faculty_id,
      facultyCode,
      year:        student.year_of_study,
    },
    EXPIRES_IN
  );

  return res.status(201).json({
    message: 'Registration successful.',
    token,
    student: {
      id:           student.id,
      admission_no: student.admission_no,
      full_name:    student.full_name,
      email:        student.email,
      faculty:      { id: faculty.id, code: facultyCode, name: faculty.name },
      year_of_study: student.year_of_study,
    },
  });
}

// ================================================================
//  STUDENT LOGIN
//  POST /api/auth/login
// ================================================================
async function loginStudent(req, res) {
  const { admission_no, password } = req.body;

  if (!admission_no || !password) {
    return res.status(400).json({ error: 'Admission number and password are required.' });
  }

  // 1. Find student
  const { rows } = await pool.query(
    `SELECT s.*, f.code AS faculty_code, f.name AS faculty_name
     FROM students s
     JOIN faculties f ON f.id = s.faculty_id
     WHERE s.admission_no = $1`,
    [admission_no.toUpperCase()]
  );

  if (!rows.length) {
    return res.status(401).json({ error: 'Invalid admission number or password.' });
  }

  const student = rows[0];

  if (!student.is_active) {
    return res.status(403).json({ error: 'Your account has been deactivated. Contact admin.' });
  }

  // 2. Verify password
  const match = await bcrypt.compare(password, student.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid admission number or password.' });
  }

  // 3. Issue token — segmentation info embedded
  const token = signToken(
    {
      id:          student.id,
      role:        'student',
      admissionNo: student.admission_no,
      facultyId:   student.faculty_id,
      facultyCode: student.faculty_code,
      year:        student.year_of_study,
    },
    EXPIRES_IN
  );

  return res.status(200).json({
    message: 'Login successful.',
    token,
    student: {
      id:            student.id,
      admission_no:  student.admission_no,
      full_name:     student.full_name,
      email:         student.email,
      faculty:       { id: student.faculty_id, code: student.faculty_code, name: student.faculty_name },
      year_of_study: student.year_of_study,
    },
  });
}

// ================================================================
//  ADMIN LOGIN
//  POST /api/auth/admin/login
// ================================================================
async function loginAdmin(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM admins WHERE username = $1',
    [username]
  );

  if (!rows.length) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const admin = rows[0];
  const match = await bcrypt.compare(password, admin.password_hash);

  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = signToken(
    { id: admin.id, role: admin.role, username: admin.username },
    ADMIN_EXPIRY
  );

  return res.status(200).json({
    message: 'Admin login successful.',
    token,
    admin: { id: admin.id, username: admin.username, role: admin.role },
  });
}

//  GET /api/auth/me
async function getMe(req, res) {
  const { rows } = await pool.query(
    `SELECT s.id, s.admission_no, s.full_name, s.email, s.year_of_study,
            f.id AS faculty_id, f.code AS faculty_code, f.name AS faculty_name
     FROM students s
     JOIN faculties f ON f.id = s.faculty_id
     WHERE s.id = $1`,
    [req.user.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Student not found.' });

  const s = rows[0];
  return res.json({
    id:            s.id,
    admission_no:  s.admission_no,
    full_name:     s.full_name,
    email:         s.email,
    year_of_study: s.year_of_study,
    faculty: { id: s.faculty_id, code: s.faculty_code, name: s.faculty_name },
  });
}

module.exports = { registerStudent, loginStudent, loginAdmin, getMe };