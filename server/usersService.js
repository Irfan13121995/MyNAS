const dbService = require('./dbService');

module.exports = {
  hasAnyUsers: dbService.hasAnyUsers,
  getUserByUsername: dbService.getUserByUsername,
  getUserByEmail: dbService.getUserByEmail,
  createUser: dbService.createUser,
  verifyPassword: dbService.verifyPassword,
  verifyEmail: dbService.verifyEmail,
  getAllUsers: dbService.getAllUsers
};
