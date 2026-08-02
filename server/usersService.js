const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail } = require('./emailService');

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const usersFilePath = path.join(BASE_DIR, 'users.json');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function _readUsers() {
  if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify([]));
  }
  try {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function _writeUsers(users) {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

function getUsers() {
  const users = _readUsers();
  return users.map(({ passwordHash, verificationToken, ...u }) => u);
}

function findUser(usernameOrEmail) {
  if (!usernameOrEmail) return null;
  const users = _readUsers();
  const target = usernameOrEmail.toLowerCase();
  return users.find(u => 
    u.username.toLowerCase() === target || 
    (u.email && u.email.toLowerCase() === target)
  );
}

async function createUser({ username, email, password, baseUrl }) {
  const users = _readUsers();
  const lowerName = username.toLowerCase();
  const lowerEmail = email ? email.toLowerCase() : null;
  
  const existingUser = users.find(u => 
    u.username.toLowerCase() === lowerName || 
    (lowerEmail && u.email && u.email.toLowerCase() === lowerEmail)
  );

  if (existingUser) {
    // Standard error to prevent user enumeration
    const err = new Error('Username or email is already taken');
    err.code = 'USER_EXISTS';
    throw err;
  }

  // Hash password using bcrypt
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  // Require email verification unless REQUIRE_EMAIL_VERIFICATION is explicitly false
  const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';

  const newUser = {
    id: crypto.randomUUID(),
    username,
    email: email || '',
    passwordHash,
    emailVerified: !requireVerification || !email, // auto-verify if no email or disabled
    verificationToken,
    failedLoginAttempts: 0,
    lockoutUntil: null,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  _writeUsers(users);

  let emailResult = null;
  if (email && requireVerification) {
    emailResult = await sendVerificationEmail({
      email,
      username,
      token: verificationToken,
      baseUrl
    });
  }

  const { passwordHash: _, verificationToken: __, ...userToReturn } = newUser;
  return { user: userToReturn, emailResult };
}

function verifyEmail(token) {
  if (!token) return { success: false, message: 'Invalid verification token' };
  const users = _readUsers();
  const userIndex = users.findIndex(u => u.verificationToken === token);

  if (userIndex === -1) {
    return { success: false, message: 'Invalid or expired verification token' };
  }

  users[userIndex].emailVerified = true;
  users[userIndex].verificationToken = null;
  _writeUsers(users);

  return { success: true, username: users[userIndex].username };
}

function verifyPassword(usernameOrEmail, password) {
  const users = _readUsers();
  const target = usernameOrEmail ? usernameOrEmail.toLowerCase() : '';
  const userIndex = users.findIndex(u => 
    u.username.toLowerCase() === target || 
    (u.email && u.email.toLowerCase() === target)
  );

  if (userIndex === -1) {
    return { success: false, reason: 'invalid_credentials' };
  }

  const user = users[userIndex];

  // Check account lockout
  if (user.lockoutUntil && Date.now() < user.lockoutUntil) {
    const remainingSecs = Math.ceil((user.lockoutUntil - Date.now()) / 1000);
    return { 
      success: false, 
      reason: 'account_locked', 
      message: `Account locked due to multiple failed login attempts. Try again in ${Math.ceil(remainingSecs / 60)} minutes.` 
    };
  }

  // Support legacy scrypt hash migration if needed, otherwise bcrypt compare
  let isPasswordValid = false;
  if (user.passwordHash.includes(':')) {
    const [salt, storedHash] = user.passwordHash.split(':');
    const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
    isPasswordValid = derivedHash === storedHash;
    if (isPasswordValid) {
      // Rehash with bcrypt
      const newSalt = bcrypt.genSaltSync(10);
      users[userIndex].passwordHash = bcrypt.hashSync(password, newSalt);
    }
  } else {
    isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
  }

  if (!isPasswordValid) {
    users[userIndex].failedLoginAttempts = (users[userIndex].failedLoginAttempts || 0) + 1;
    if (users[userIndex].failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      users[userIndex].lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    _writeUsers(users);
    
    if (users[userIndex].lockoutUntil) {
      return { 
        success: false, 
        reason: 'account_locked', 
        message: 'Account locked due to multiple failed login attempts. Try again in 15 minutes.' 
      };
    }

    return { success: false, reason: 'invalid_credentials' };
  }

  // Password is valid - check email verification requirement
  const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';
  if (requireVerification && user.email && !user.emailVerified) {
    return { 
      success: false, 
      reason: 'email_not_verified',
      message: 'Please verify your email address before logging in.',
      verificationToken: user.verificationToken
    };
  }

  // Reset lockout counters on success
  users[userIndex].failedLoginAttempts = 0;
  users[userIndex].lockoutUntil = null;
  _writeUsers(users);

  const { passwordHash: _, verificationToken: __, ...cleanUser } = users[userIndex];
  return { success: true, user: cleanUser };
}

function hasAnyUsers() {
  const users = _readUsers();
  return users.length > 0;
}

module.exports = {
  getUsers,
  findUser,
  createUser,
  verifyEmail,
  verifyPassword,
  hasAnyUsers
};
