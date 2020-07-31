/**
 * @typedef {Object} Passthrough
 * @property {import("discord.js").Client} client
 * @property {import("@amanda/reloader")} reloader
 * @property {import("events").EventEmitter} reloadEvent
 * @property {import("@amanda/commandmanager")} commands
 * @property {import("./config.js")} config
 * @property {import("sqlite").Database} sql
 */

/** @type {Passthrough} */
const passthrough = {};

module.exports = passthrough;
