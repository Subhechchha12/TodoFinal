const { Redis } = require('@upstash/redis');

// Singleton Upstash Redis client (HTTP-based, no persistent connection needed)
const upstash = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// The Redis Set key that holds all registered usernames
const USERNAME_SET = 'registered_usernames';

/**
 * Check if a username already exists in the set — O(1) via SISMEMBER
 * @param {string} username
 * @returns {Promise<boolean>}
 */
async function usernameExists(username) {
  const result = await upstash.sismember(USERNAME_SET, username);
  return result === 1;
}

/**
 * Add a username to the set — called after successful registration
 * @param {string} username
 */
async function addUsername(username) {
  await upstash.sadd(USERNAME_SET, username);
}

/**
 * Remove a username from the set — call on account deletion if needed
 * @param {string} username
 */
async function removeUsername(username) {
  await upstash.srem(USERNAME_SET, username);
}

module.exports = { upstash, usernameExists, addUsername, removeUsername };
