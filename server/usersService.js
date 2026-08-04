/**
 * User Service Facade
 * Passes through user database operations from dbService.
 */
const dbService = require('./dbService');

module.exports = {
  /** Check if any users exist in the system */
  hasAnyUsers: dbService.hasAnyUsers,

  /** Fetch user by username */
  getUserByUsername: dbService.getUserByUsername,

  /** Fetch user by email address */
  getUserByEmail: dbService.getUserByEmail,

  /** Create a new user account */
  createUser: dbService.createUser,

  /** Verify password and manage account lockout */
  verifyPassword: dbService.verifyPassword,

  /** Verify email using verification token */
  verifyEmail: dbService.verifyEmail,

  /** Retrieve list of all registered users */
  getAllUsers: dbService.getAllUsers
};
