// @ts-check

const Discord = require("discord.js");
const path = require("path");
const ReactionMenu = require("@amanda/reactionmenu");

const passthrough = require("../passthrough.js");

const { client, sync, sql, config, commands } = passthrough;

/**
 * @type {import("./utilities")}
 */
const utils = sync.require("./utilities.js");

const lastAttemptedLogins = [];
let starting = true;
if (client.readyAt != null) starting = false;

if (starting) sync.addTemporaryListener(client, "ready", manageReady);
sync.addTemporaryListener(client, "message", manageMessage);
sync.addTemporaryListener(client, "messageUpdate", data => {
	if (data instanceof Discord.Message) return manageMessage(data);
	if (data && data.id && data.channel_id && data.content && data.author) {
		const channel = client.channels.cache.get(data.channel_id);
		if (channel instanceof Discord.DMChannel || (channel instanceof Discord.TextChannel && data.member)) {
			const message = new Discord.Message(client, data, channel);
			manageMessage(message);
		}
	}
});
sync.addTemporaryListener(client, "guildMemberAdd", manageGuildMemberAdd);
sync.addTemporaryListener(client, "messageReactionAdd", manageReactionAdd);
sync.addTemporaryListener(client, "messageReactionRemove", manageReactionRemove);
sync.addTemporaryListener(client, "shardDisconnected", (reason) => {
	if (reason) console.log(`Disconnected with ${reason.code} at ${reason.path}.`);
	if (lastAttemptedLogins.length) console.log(`Previous disconnection was ${Math.floor(Date.now() - lastAttemptedLogins.slice(-1)[0] / 1000)} seconds ago.`);
	lastAttemptedLogins.push(Date.now());
	new Promise(resolve => {
		if (lastAttemptedLogins.length >= 3) {
			const oldest = lastAttemptedLogins.shift();
			const timePassed = Date.now() - oldest;
			const timeout = 30000;
			if (timePassed < timeout) return setTimeout(() => resolve(), timeout - timePassed);
		}
		return resolve();
	}).then(() => {
		client.login(config.bot_token);
	});
});
sync.addTemporaryListener(client, "error", manageError);
sync.addTemporaryListener(process, "unhandledRejection", manageError);

/**
 * @param {Discord.Message} msg
 */
async function manageMessage(msg) {
	if (msg.author.bot) return;
	if (msg.content == `<@${client.user.id}>`.replace(" ", "") || msg.content == `<@!${client.user.id}>`.replace(" ", "")) return msg.channel.send(`Hey there! My prefix is \`${config.prefixes[0]}\` or \`@${client.user.tag}\`. Try using \`${config.prefixes[0]}help\` for a complete list of my commands.`);
	const prefix = config.prefixes.find(p => msg.content.startsWith(p));
	if (!prefix) return;
	if (msg.guild) await msg.guild.members.fetch(client.user);
	const cmdTxt = msg.content.substring(prefix.length).split(" ")[0];
	const suffix = msg.content.substring(cmdTxt.length + prefix.length + 1);
	const cmd = commands.cache.find(c => c.aliases.includes(cmdTxt));

	if (cmd) {
		try {
			await cmd.process(msg, suffix);
		} catch (e) {
			if (e && e.code) {
				if (e.code == 10008) return;
				if (e.code == 50013) return;
			}
			console.error(e);
			const msgTxt = `command ${cmdTxt} failed\n` + (await utils.stringify(e));
			const embed = new Discord.MessageEmbed()
				.setDescription(msgTxt)
				.setColor(0xdd2d2d);
			if (config.owners.includes(msg.author.id)) msg.channel.send(embed);
			else msg.channel.send(`There was an error with the command ${cmdTxt}. The developers have been notified. If you use this command again and you see this message, please allow a reasonable time frame for this to be fixed`);
		}
	}
}

async function manageReady() {
	const firstStart = starting;
	starting = false;
	if (firstStart) {
		console.log(`Successfully logged in as ${client.user.username}`);
		process.title = client.user.username;

		/** @type {Array<{ guildID: string, userID: string, roleID: string, action: string, date: number }>} */
		const missedEvents = await sql.all("SELECT * FROM OfflineEvents");
		if (!missedEvents || missedEvents.length < 1) return;
		/** @type {Array<string>} */
		const deletedGuilds = [];
		/**
		 * Could be very bad for memory. Not sure how NodeJS sweeps this kind of stuff. Look into when over 1k guilds I guess???
		 * @type {Array<{ guildID: string, userID: string }>}
		 */
		const doneUsers = [];
		for (const event of missedEvents) {
			if (deletedGuilds.includes(event.guildID)) continue;
			if (doneUsers.find(e => e.guildID == event.guildID && e.userID == event.userID)) continue;
			const guild = client.guilds.cache.get(event.guildID);
			if (!guild) {
				await Promise.all([
					sql.all("DELETE FROM OfflineEvents WHERE guildID =?", event.guildID),
					sql.all("DELETE FROM JoinRoles WHERE guildID =?", event.guildID)
				]);
				deletedGuilds.push(event.guildID);
				continue;
			}
			const member = guild.members.cache.get(event.userID);
			if (!member) continue;
			const roles = missedEvents.filter(e => e.guildID === guild.id && e.userID === member.id);
			const add = roles.filter(r => r.action === "add").map(e => { return { roleID: e.roleID, timeout: ((event.date - Date.now()) >= 0 ? (event.date - Date.now()) : 0), removeAfter: 0 };});
			const remove = roles.filter(r => r.action === "remove").map(e => { return { roleID: e.roleID, removeAfter: ((event.date - Date.now()) >= 0 ? (event.date - Date.now()) : 0) };});
			await sql.run("DELETE FROM OfflineEvents WHERE guildID =? AND userID =?", [guild.id, member.id]);
			if (add.length > 0) await addRoles(add, member);
			if (remove.length > 0) await removeRoles(remove, member);
			doneUsers.push({ guildID: guild.id, userID: member.id });
		}
	} else console.log("Client entered ready state");
}

/**
 * @param {Discord.GuildMember} member
 */
async function manageGuildMemberAdd(member) {
	if (member.user.bot) return;
	/** @type {Array<{ guildID: string, roleID: string, timeout: number, removeAfter: number }>} */
	const roles = await sql.all("SELECT * FROM JoinRoles WHERE guildID =?", member.guild.id);
	if (!roles || roles.length === 0) return;
	addRoles(roles, member);
}

/**
 * @param {import("@amanda/neko").DiscordReactionData} data
 * @param {Discord.DMChannel | Discord.TextChannel} channel
 * @param {Discord.User} user
 */
async function manageReactionAdd(data, channel, user) {
	if (user.bot) return;
	// @ts-ignore
	ReactionMenu.handler(data, channel, user, client);
	if (channel instanceof Discord.DMChannel) return;
	// @ts-ignore
	const id = utils.emojiID(data.emoji);
	/** @type {Array<{ emojiID: string, roleID: string }>} */
	const reactions = await sql.all("SELECT emojiID, roleID FROM ReactionRoles WHERE messageID =? AND emojiID =?", [data.message_id, id.unique]);
	if (!reactions || reactions.length == 0) return;
	let member = channel.guild.members.cache.get(data.user_id);
	if (!member) member = await channel.guild.members.fetch(data.user_id);
	addRoles(reactions.map(reaction => { return { roleID: reaction.roleID, timeout: 0, removeAfter: 0 }; }), member);
}

/**
 * @param {import("@amanda/neko").DiscordReactionData} data
 * @param {Discord.DMChannel | Discord.TextChannel} channel
 * @param {Discord.User} user
 */
async function manageReactionRemove(data, channel, user) {
	if (!(channel instanceof Discord.TextChannel)) return;
	if (user.bot) return;
	// @ts-ignore
	const id = utils.emojiID(data.emoji);
	/** @type {Array<{ emojiID: string, roleID: string }>} */
	const reactions = await sql.all("SELECT emojiID, roleID FROM ReactionRoles WHERE messageID =? AND emojiID =?", [data.message_id, id.unique]);
	if (!reactions || reactions.length == 0) return;
	let member = channel.guild.members.cache.get(data.user_id);
	if (!member) member = await channel.guild.members.fetch(data.user_id);
	removeRoles(reactions.map(reaction => { return { roleID: reaction.roleID, removeAfter: 0 }; }), member);
}

function manageError(reason) {
	let shouldIgnore = false;
	if (reason && reason.code) {
		if ([500, 10003, 10008, 50001, 50013].includes(reason.code)) shouldIgnore = true;
		if (reason.code == 500 && reason.name != "AbortError") shouldIgnore = false;
	}
	if (shouldIgnore) return;
	if (reason) console.error(reason);
	else console.log("There was an error but no reason");
}

/**
 * @param {Array<{ roleID: string, removeAfter?: number }>} roles
 * @param {Discord.GuildMember} member
 */
async function removeRoles(roles, member) {
	if (!roles || roles.length === 0) return;
	const guild = member.guild;
	for (const role of roles) {
		if (!guild.roles.cache.get(role.roleID)) {
			await sql.run("DELETE FROM JoinRoles WHERE guildID =? AND roleID =?", [guild.id, role.roleID]);
			continue;
		}
		const dRole = member.guild.roles.cache.get(role.roleID);
		if (role.removeAfter !== 0) {
			sql.run("INSERT INTO OfflineEvents (guildID, userID, roleID, action, date) VALUES (?, ?, ?, ?, ?)", [guild.id, member.id, role.roleID, "remove", (Date.now() + role.removeAfter)]);
			setTimeout(() => {
				if (!member.roles.cache.get(role.roleID)) return;
				if (!guild.members.cache.get(member.id)) return;
				if (!dRole.editable) return;
				member.roles.remove(role.roleID, `${client.user.username} auto-role`);
				sql.run("DELETE FROM OfflineEvents WHERE guildID =? AND userID =? AND roleID =?", [guild.id, member.id, role.roleID]);
			}, role.removeAfter);
		} else {
			if (!guild.members.cache.get(member.id)) return;
			if (!dRole.editable) continue;
			member.roles.remove(role.roleID, `${client.user.username} auto-role`);
		}
	}
}

/**
 * @param {Array<{ roleID: string, timeout?: number, removeAfter?: number }>} roles
 * @param {Discord.GuildMember} member
 */
async function addRoles(roles, member) {
	if (!roles || roles.length === 0) return;
	const guild = member.guild;
	for (const role of roles) {
		if (!guild.roles.cache.get(role.roleID)) {
			await sql.run("DELETE FROM JoinRoles WHERE guildID =? AND roleID =?", [guild.id, role.roleID]);
			continue;
		}
		const dRole = member.guild.roles.cache.get(role.roleID);
		if (member.roles.cache.get(role.roleID)) continue;
		if (role.timeout !== 0) {
			sql.run("INSERT INTO OfflineEvents (guildID, userID, roleID, action, date) VALUES (?, ?, ?, ?, ?)", [guild.id, member.id, role.roleID, "add", (Date.now() + role.timeout)]);
			setTimeout(() => {
				if (!guild.members.cache.get(member.id)) return;
				if (!dRole.editable) return;
				member.roles.add(role.roleID, `${client.user.username} auto-role`);
				sql.run("DELETE FROM OfflineEvents WHERE guildID =? AND userID =? AND roleID =?", [guild.id, member.id, role.roleID]);
			}, role.timeout);
		} else {
			if (!guild.members.cache.get(member.id)) return;
			if (!dRole.editable) continue;
			member.roles.add(role.roleID, `${client.user.username} auto-role`);
		}

		if (role.removeAfter !== 0) {
			removeRoles([{ roleID: role.roleID, removeAfter: role.timeout ? role.timeout + role.removeAfter : role.removeAfter }], member);
		}
	}
}
