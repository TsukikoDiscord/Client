// @ts-check

/**
 * @typedef {Object} Passthrough
 * @property {import("discord.js").Client} client
 * @property {import("heatsync")} sync
 * @property {import("@amanda/commandmanager")<[import("discord.js").Message, string]>} commands
 * @property {import("./config.js")} config
 * @property {import("sqlite").Database} sql
 */

/** @type {Passthrough} */
// @ts-ignore
const passthrough = {};

module.exports = passthrough;
