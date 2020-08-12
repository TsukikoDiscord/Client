const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const Discord = require("discord.js");
const { Neko, OptimizedGuild, OptimizedPresence, OptimizedUser } = require("@amanda/neko");

Discord.Structures.extend("Guild", () => OptimizedGuild);
Discord.Structures.extend("Presence", () => OptimizedPresence);
Discord.Structures.extend("User", () => OptimizedUser);

const CommandManager = require("@amanda/commandmanager");
const Reloader = require("@amanda/reloader");

const passthrough = require("./passthrough.js");
const config = require("./config.js");

const intents = new Discord.Intents(["DIRECT_MESSAGES", "GUILDS", "GUILD_EMOJIS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_MEMBERS"]);
const client = new Neko({ disableMentions: "everyone", ws: { intents }, optimizations: { disablePresences: true, disableMessageCaching: true } });
const reloader = new Reloader(true, __dirname);
const commands = new CommandManager();

(async () => {
	const sql = await sqlite.open({
		filename: "./databases/main.sqlite",
		driver: sqlite3.Database
	});

	Object.assign(passthrough, { client, reloader, commands, config, sql, reloadEvent: reloader.reloadEvent });

	reloader.watch([
		"./sub_modules/utilities.js"
	]);

	reloader.watchAndLoad([
		"./sub_modules/events.js",
		"./sub_modules/stdin.js",
		"./commands/admin.js",
		"./commands/status.js",
		"./commands/roles.js",
		"./commands/meta.js"
	]);

	client.login(config.token);
})();
