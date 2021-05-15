// @ts-check

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const Discord = require("discord.js");
const { Neko, OptimizedGuild, OptimizedPresence, OptimizedUser } = require("@amanda/neko");

// @ts-ignore
Discord.Structures.extend("Guild", () => OptimizedGuild);
// @ts-ignore
Discord.Structures.extend("Presence", () => OptimizedPresence);
// @ts-ignore
Discord.Structures.extend("User", () => OptimizedUser);

const CommandManager = require("@amanda/commandmanager");
const Heatsync = require("heatsync");

const passthrough = require("./passthrough.js");
const config = require("./config.js");

const intents = new Discord.Intents(["DIRECT_MESSAGES", "GUILDS", "GUILD_EMOJIS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_MEMBERS", "GUILD_VOICE_STATES"]);
const client = new Neko({ disableMentions: "everyone", ws: { intents }, optimizations: { disablePresences: true, disableMessageCaching: true } });
const sync = new Heatsync();
const commands = new CommandManager();

(async () => {
	const sql = await sqlite.open({
		filename: "./databases/main.sqlite",
		driver: sqlite3.Database
	});

	Object.assign(passthrough, { client, sync, commands, config, sql });

	sync.require([
		"./sub_modules/events.js",
		"./sub_modules/stdin.js",
		"./commands/admin.js",
		"./commands/status.js",
		"./commands/roles.js",
		"./commands/meta.js"
	]);

	client.login(config.token);
})();
