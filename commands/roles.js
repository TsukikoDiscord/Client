// @ts-check

const Discord = require("discord.js");

const { client, commands, sql, sync } = require("../passthrough.js");

/**
 * @type {import("../sub_modules/utilities")}
 */
const utils = sync.require("../sub_modules/utilities.js");

const ArgumentAnalyser = require("@amanda/arganalyser");

commands.assign([
	{
		usage: "<Channel:Channel> <Message ID> [\"add\" | \"delete\"] [Role:Role | \"all\"] [Emoji]",
		description: "Main ReactionRole interface command",
		aliases: ["reactionrole", "rr"],
		category: "roles",
		examples: ["^rr general 012345678987654 add \"cool people\" 😎"],
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			const args = ArgumentAnalyser.format(suffix.split(" "));
			// @ts-ignore
			const validator = new ArgumentAnalyser({ message: msg, definition: this.usage, args: args, length: 5, findFunctions: { role: utils.findRole, channel: utils.findChannel } }, { search: true, checkViewable: true });
			await validator.validate();
			if (!validator.usable) return;
			const data = validator.collected;
			/** @type {[Discord.TextChannel, string, string, Discord.Role | "all", string]} */
			// @ts-ignore
			const [channel, ID, mode, role, emoji] = data;
			/** @type {Array<{ channelID: string, messageID: string, emojiID: string, roleID: string }>} */
			const channeldata = await sql.all("SELECT * FROM ReactionRoles WHERE channelID =? AND messageID =?", [channel.id, ID]);
			if (channeldata && channeldata.length == 0 && !mode) return msg.channel.send(`${msg.author.username}, there is no reaction role data for the message ID specified. Try adding one like:\n${this.examples.join("\n")}`);
			if (mode && (mode == "add" || mode == "delete")) {
				if (!msg.member.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage this server's Reaction Roles (Manage Roles)`);
				if (!role) return msg.channel.send(`${msg.author.username}, you need to provide a role`);
				if (typeof role !== "string" && role.position >= msg.member.roles.highest.position && msg.guild.ownerID !== msg.author.id) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);
				if (!emoji && !(mode == "delete" && role == "all")) return msg.channel.send(`${msg.author.username}, you also need to provide an emoji`);
				/** @type {Discord.Message} */
				let message;
				try {
					message = await channel.messages.fetch(ID);
				} catch (e) {
					return msg.channel.send(`${msg.author.username}, that's not a valid message ID`);
				}
				if (mode == "add" && typeof role !== "string") {
					const emojiid = utils.emojiID(Discord.Util.parseEmoji(emoji));
					if (!emojiid || !emojiid.unique) return msg.channel.send(`${msg.author.username}, that's not a valid emoji`);
					if (channeldata && channeldata.length > 0 && channeldata.find(item => item.channelID == channel.id && item.messageID == message.id && item.emojiID == emojiid.unique && item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role already exists for that emoji`);
					await sql.run("INSERT INTO ReactionRoles (channelID, messageID, emojiID, roleID) VALUES (?, ?, ?, ?)", [channel.id, message.id, emojiid.unique, role.id]);
					if (channel.permissionsFor(client.user).has("ADD_REACTIONS") && (!emojiid.custom ? true : client.emojis.cache.get(emojiid.unique)) && !message.reactions.cache.get(emojiid.usable)) {
						msg.channel.send("One last thing; It looks like that message does not have that emoji reacted to it. Would you like me to react to that message?\ntype yes to confirm or anything else to deny");
						const collector = channel.createMessageCollector((m => m.author.id == msg.author.id), { max: 1, time: 60000 });
						await collector.next.then(newmessage => {
							if (newmessage.content.toLowerCase() == "yes") return message.react(emojiid.usable);
						// eslint-disable-next-line no-empty-function
						}).catch(() => {});
					}
					msg.channel.send(`Alright! People who react to that message with ${emojiid.custom ? (client.emojis.cache.get(emojiid.unique) ? client.emojis.cache.get(emojiid.unique).toString() : "that emoji") : emojiid.usable} will receive ${role.name}`);
				} else if (mode == "delete") {
					if (!channeldata || channeldata.length == 0) return msg.channel.send(`${msg.author.username}, there are no reaction roles to manage on that message`);
					if (typeof role == "string" && role == "all") {
						await sql.run("DELETE FROM ReactionRoles WHERE channelID =? AND messageID =?", [channel.id, message.id]);
						return msg.channel.send("Alright! All of the reaction roles on that message have been deleted.");
					}
					const emojiid = utils.emojiID(Discord.Util.parseEmoji(emoji));
					if (!emojiid || !emojiid.unique) return msg.channel.send(`${msg.author.username}, that's not a valid emoji`);
					if (channeldata.find(item => item.channelID == channel.id && item.messageID == message.id && item.emojiID == emojiid.unique && item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role does not exist for that emoji`);
					await sql.run("DELETE FROM ReactionRoles WHERE channelID =? AND messageID =? AND emojiID =? AND roleID =?", [channel.id, message.id, emojiid, role.id]);
					if (channel.permissionsFor(client.user).has("MANAGE_MESSAGES") && (!emojiid.custom ? true : client.emojis.cache.get(emojiid.unique)) && message.reactions.cache.get(emojiid.usable) && channeldata.filter(item => item.emojiID == emojiid.unique).length < 1) {
						msg.channel.send("One last thing; It looks like that message has that emoji reacted to it and there are no other reaction roles bound to that emoji. Would you like me to remove all of the reactions of that emoji from that message?\ntype yes to confirm or anything else to deny");
						const collector = channel.createMessageCollector((m => m.author.id == msg.author.id), { max: 1, time: 60000 });
						await collector.next.then(newmessage => {
							if (newmessage.content.toLowerCase() == "yes") return message.reactions.cache.get(emojiid.usable).remove();
						// eslint-disable-next-line no-empty-function
						}).catch(() => {});
					}
					msg.channel.send("Alright! Reaction role deleted");
				}
			} else {
				if (!channeldata || channeldata.length == 0) return msg.channel.send(`${msg.author.username}, there are no reaction roles set up for that message`);
				return utils.createPagination(msg.channel,
					["Role Name", "Role ID", "Emoji"],
					channeldata.map(i => [
						msg.guild.roles.cache.get(i.roleID) ? msg.guild.roles.cache.get(i.roleID).name : "Unknown",
						i.roleID,
						String.fromCodePoint(Number(i.emojiID)) ? String.fromCodePoint(Number(i.emojiID)) : (client.emojis.cache.get(i.emojiID) ? client.emojis.cache.get(i.emojiID).toString() : i.emojiID)
					]),
					["left", "left", "left"],
					2000,
					"Reaction Roles for Message"
				);
			}
		}
	},
	{
		usage: "[Role:Role] [\"add\" | \"delete\"]",
		description: "Main Self Assignable Role interface command",
		aliases: ["selfassign", "sar", "iam", "iamnot"],
		category: "roles",
		examples: ["^sar \"cool people\""],
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			/** @type {Array<string>} */
			const data = await sql.all("SELECT roleID FROM SelfRoles WHERE guildID =?", msg.guild.id).then(d => d.map(item => item.roleID));
			if (!suffix) {
				if (!data || data.length == 0) return msg.channel.send(`${msg.author.username}, there are no self assignable roles set up in this server.`);
				return utils.createPagination(msg.channel,
					["Role Name", "Role ID"],
					data.map(i => [msg.guild.roles.cache.get(i) ? msg.guild.roles.cache.get(i).name : "Unknown", i]),
					["left", "left"],
					2000,
					`Self Assignable Roles for ${msg.guild.name}`,
					"Use ^selfassign <Role> to give yourself a role"
				);
			} else {
				const args = ArgumentAnalyser.format(suffix.split(" "));
				let name = args[0];
				if (!msg.member.permissions.has("MANAGE_ROLES") && args[1]) name = args.join(" ");
				const role = await utils.findRole(msg, name);
				if (!role) return msg.channel.send(`${msg.author.username}, that is not a valid role.`);
				let createmode;
				if (msg.member.permissions.has("MANAGE_ROLES")) createmode = args[1];
				if (createmode && (!["add", "delete"].includes(createmode))) return msg.channel.send(`${msg.author.username}, your mode for managing the self assignable role needs to be either \`add\` or \`delete\``);
				if (createmode) {
					if (!msg.member.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage this server's Self Assignable Roles (Manage Roles)`);
					if (role.position >= msg.member.roles.highest.position && msg.guild.ownerID !== msg.author.id) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);

					if (createmode == "add") {
						if (data.find(item => role.id == item)) return msg.channel.send(`${msg.author.username}, that role is already set up for self assignable roles.`);
						await sql.all("INSERT INTO SelfRoles (guildID, roleID) VALUES (?, ?)", [msg.guild.id, role.id]);
					} else {
						if (!data.find(item => role.id == item)) return msg.channel.send(`${msg.author.username}, that role does not exist in this server's self assignable role list and does not need to be deleted.`);
						await sql.all("DELETE FROM SelfRoles WHERE guildID =? AND roleID =?", [msg.guild.id, role.id]);
					}
					return msg.channel.send(`Alright! ${role.name} was ${createmode == "add" ? "added to" : "removed from"} the list of self assignable roles.`);
				}
				if (!data.includes(role.id)) return msg.channel.send(`${msg.author.username}, that role is not in the self assignable role list`);
				if (!role.editable) return msg.channel.send(`${msg.author.username}, that role is either higher than mine or is my highest role, so I cannot give it to you.`);
				if (!msg.guild.me.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, I don't have the manage roles permission.`);
				const mode = msg.member.roles.cache.has(role.id) ? "remove" : "add";
				try {
					if (mode == "add") await msg.member.roles.add(role.id, "Self assigned role");
					else await msg.member.roles.remove(role.id, "Self removed role");
				} catch {
					return msg.channel.send("There was an error when attempting to manage your roles.");
				}
				return msg.channel.send(`Role ${mode == "add" ? "added" : "removed"}.`);
			}
		}
	},
	{
		usage: "[Role:Role] [\"add\" | \"delete\"] [addafter] [removeafter]",
		description: "Manage what roles to give to members after joining",
		aliases: ["join", "jr"],
		category: "roles",
		examples: ["^join \"cool people\" add 10min"],
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			const args = ArgumentAnalyser.format(suffix.split(" "));
			const validator = new ArgumentAnalyser({ message: msg, definition: this.usage, args: args, length: 4, findFunctions: { role: utils.findRole } }, { search: true });
			await validator.validate();
			if (args.length > 1 && !validator.usable) return;
			/** @type {[Discord.Role, "add" | "delete", string, string]} */
			// @ts-ignore
			const [role, mode, addtimeout, removetimeout] = validator.collected;
			/** @type {Array<{ guildID: string, roleID: string, timeout: number, removeAfter: number }>} */
			const data = await sql.all("SELECT * FROM JoinRoles WHERE guildID =?", msg.guild.id);
			if (role) {
				if (!mode) {
					if (!data || data.length == 0) return msg.channel.send(`${msg.author.username}, there are no auto join roles set up in this server.`);
					const roledata = data.find(item => item.roleID == role.id);
					if (!roledata) return msg.channel.send(`${msg.author.username}, that role is not set up for auto role. If you would like to add it, try it like \`^join ${role.name.includes(" ") ? `"${role.name}"` : role.name} add [addafter] [removeafter]\`.`);
					return msg.channel.send(`${role.name}\n	Add after ${utils.shortTime(roledata.timeout, "ms")}\n	Remove after: ${utils.shortTime(roledata.removeAfter, "ms")}`);
				}
				if (!msg.member.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage this server's Join Roles (Manage Roles)`);
				if (role.position >= msg.member.roles.highest.position && msg.guild.ownerID !== msg.author.id) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);

				let addafter, removeafter;
				if (mode == "add") {
					if (data && data.length > 0 && data.find(item => item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role is already set up to be added to someone when they join.`);

					if (addtimeout) addafter = utils.parseTime(addtimeout);
					if (removetimeout) removeafter = utils.parseTime(removetimeout);

					if ((addtimeout || removetimeout) && ((addtimeout && !addafter && addafter !== 0) || (removetimeout && !removeafter && addafter !== 0))) return msg.channel.send(`${msg.author.username}, your duration for argument \`${!addtimeout ? "add after" : "remove after"}\` was not a valid duration.`);
					if ((addtimeout || removetimeout) && ((addafter > 1000 * 60 * 60 * 24 * 7) || (removeafter > 1000 * 60 * 60 * 24 * 7))) return msg.channel.send(`${msg.author.username}, the longest duration allowed for \`add after\` or \`remove after\` is 1 week.`);

					await sql.all("INSERT INTO JoinRoles (guildID, roleID, timeout, removeAfter) VALUES (?, ?, ?, ?)", [msg.guild.id, role.id, addafter || 0, removeafter || 0]);
				} else if (mode == "delete") {
					if (data && data.length > 0 && !data.find(item => item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role does not exist in this server's join role list and does not need to be deleted.`);
					await sql.all("DELETE FROM JoinRoles WHERE guildID =? AND roleID =?", [msg.guild.id, role.id]);
				}
				return msg.channel.send(`Alright! ${role.name} was ${mode == "add" ? "added to" : "deleted from"} the auto join role list. ${mode == "add" && addafter && addafter !== 0 ? `Add after: ${utils.shortTime(addafter, "ms")}` : ""} ${mode == "add" && removeafter && removeafter !== 0 ? `Remove after: ${utils.shortTime(removeafter, "ms")}` : ""}`);
			} else {
				if (!data || data.length == 0) return msg.channel.send(`${msg.author.username}, there are no auto join roles set up in this server.`);
				return utils.createPagination(msg.channel,
					["Role Name", "Role ID", "Add After", "Remove After"],
					data.map(i =>
						[msg.guild.roles.cache.get(i.roleID) ? msg.guild.roles.cache.get(i.roleID).name : "Unknown",
							i.roleID,
							i.timeout ? utils.shortTime(i.timeout, "ms") : String(0),
							i.removeAfter ? utils.shortTime(i.removeAfter, "ms") : String(0)]),
					["left", "left", "left", "left"],
					2000,
					`Join Roles for ${msg.guild.name}`
				);
			}
		}
	},
	{
		usage: "[Role:Role] [Channel:Channel] [\"add\" | \"delete\"] [\"add\" | \"remove\"] [\"join\" | \"leave\"] [toggleafter]",
		description: "Modify what roles to give or remove to users when they join or leave a voice channel",
		aliases: ["vcroles", "vcr"],
		category: "roles",
		examples: [
			"^vcroles \"no mic access\" talking-vc add add join",
			"^vcroles muted going-to-brazil remove leave"
		],
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			const args = ArgumentAnalyser.format(suffix.split(" "));
			// @ts-ignore
			const validator = new ArgumentAnalyser({ message: msg, definition: this.usage, args: args, length: 6, findFunctions: { role: utils.findRole, channel: utils.findChannel } }, { search: true });
			await validator.validate();
			if (args.length > 1 && !validator.usable) return;
			/** @type {[Discord.Role, Discord.VoiceChannel, "add" | "delete", "add" | "remove", "join" | "leave", string]} */
			// @ts-ignore
			const [role, channel, mode, rolemode, condition, toggletimeout] = validator.collected;
			const data = await sql.all("SELECT * FROM VoiceRoles WHERE guildID =?", [msg.guild.id]);
			if (!role) {
				if (!data || data.length == 0) return msg.channel.send(`${msg.author.username}, there are no auto voice channel roles set up in this server.`);
				return utils.createPagination(msg.channel,
					["Channel", "Role", "Condition", "Mode"],
					data.sort((a, b) => Number(a.channelID) + Number(b.channelID)).map(r => [msg.guild.channels.cache.get(r.channelID) ? msg.guild.channels.cache.get(r.channelID).name : `Deleted Voice Channel (${r.channelID})`, msg.guild.roles.cache.get(r.roleID) ? msg.guild.roles.cache.get(r.roleID).name : `Deleted Role (${r.roleID})`, r.condition === 0 ? "On join" : "On leave", r.action === 0 ? "Give" : "Take"]),
					["left", "left", "left", "left"],
					2000,
					`Voice Channel Roles for ${msg.guild.name}`
				);
			}

			if (!channel) return msg.channel.send(`${msg.author.username}, you need to provide a valid channel to modify or view configuration`);
			if (!(channel instanceof Discord.VoiceChannel)) return msg.channel.send(`${msg.author.username}, the channel you provided is not a voice channel`);

			if (!mode) {
				const channeldata = data.filter(r => r.channelID === channel.id);
				if (!channeldata.length) return msg.channel.send(`${msg.author.username}, there is no roles set up for that voice channel`);
				return utils.createPagination(msg.channel,
					["Role", "Condition", "Mode"],
					channeldata.map(r => [msg.guild.roles.cache.get(r.roleID) ? msg.guild.roles.cache.get(r.roleID).name : `Deleted Role (${r.roleID})`, r.condition === 0 ? "On join" : "On leave", r.action === 0 ? "Give" : "Take"]),
					["left", "left", "left"],
					2000,
					`Roles configured for ${channel.name}`
				);
			}

			let toggle = 0;
			if (rolemode === "remove") toggle = 1;
			let toggleCondition = 0;
			if (condition === "leave") toggleCondition = 1;
			let toggleafter = 0;
			if (toggletimeout) toggleafter = utils.parseTime(toggletimeout);

			if (!msg.member.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage this server's Voice Channel Roles (Manage Roles)`);
			if (role.position >= msg.member.roles.highest.position && msg.guild.ownerID !== msg.author.id) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);

			if (!["add", "delete"].includes(mode)) return msg.channel.send(`${msg.author.username}, you didn't provide a valid mode to add a config or delete one. Valid modes are add or delete`);

			if (mode === "add") {
				if (data && data.length && data.find(r => r.channelID === channel.id && r.roleID === role.id && r.action === toggle)) return msg.channel.send(`${msg.author.username}, that role is already set to be ${toggle === 0 ? "added" : "removed"} on join or leave in that channel.`);
				await sql.all("INSERT INTO VoiceRoles (channelID, guildID, roleID, action, condition, timeout) VALUES (?, ?, ?, ?, ?, ?)", [channel.id, msg.guild.id, role.id, toggle, toggleCondition, toggleafter]);
			} else {
				if (!data || data.length == 0) return msg.channel.send(`${msg.author.username}, there are no auto voice channel roles set up in this server.`);
				if (!data.find(r => r.channelID === channel.id && r.roleID === role.id && r.action === toggle)) return msg.channel.send(`${msg.author.username}, that role isn't set up ${toggle === 0 ? "added" : "removed"} on join or leave in that channel`);
				await sql.run("DELETE FROM VoiceRoles WHERE channelID =? AND roleID =? AND action =?", [channel.id, role.id, toggle]);
			}
			return msg.channel.send(`Alright! ${role.name} will ${mode === "add" ? "now" : "no longer"} be ${rolemode === "add" ? "added" : "removed"} when a member ${mode === "add" ? (toggleCondition === 0 ? "joins" : "leaves") : "joins or leaves"} ${channel.name}${mode === "add" ? ` with ${toggleafter === 0 ? "no delay" : `a delay of ${utils.shortTime(toggleafter, "ms")}`} ` : ""}.`);
		}
	},
	{
		usage: "<Role:Role>",
		description: "Displays a list of who is in a role",
		aliases: ["inrole", "in"],
		category: "roles",
		examples: ["^inrole Members"],
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			const role = await utils.findRole(msg, suffix);
			if (!role) return msg.channel.send(`${msg.author.username}, that's not a valid role.`);
			const members = msg.guild.members.cache.filter(mem => mem.roles.cache.has(role.id));
			if (members.size == 0) return msg.channel.send(`${msg.author.username}, there are no members in that role.`);
			return utils.createPagination(msg.channel,
				["User tag", "User ID"],
				members.map(m => [m.user ? m.user.tag : m.displayName, `(${m.id})`]),
				["left", "left"],
				2000,
				`Members in ${role.name}`
			);
		}
	},
	{
		usage: "<Role:Role> [User:User]",
		description: "Staff command to manage a member's roles",
		aliases: ["role"],
		category: "roles",
		examples: ["^role Members PapiOphidian"],
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			if (!msg.member.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that person's roles (Manage Roles)`);
			const args = ArgumentAnalyser.format(suffix.split(" "));
			const role = await utils.findRole(msg, args[0] || "");
			const member = await utils.findMember(msg, args[1] || "", true);
			if (!role) return msg.channel.send(`${msg.author.username}, that's not a valid role`);
			if (!member) return msg.channel.send(`${msg.author.username}, that's not a valid user`);
			if (role.position >= msg.member.roles.highest.position) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);
			if (!role.editable) return msg.channel.send(`${msg.author.username}, that role is either higher than mine or is my highest role, so I cannot give it to you.`);
			const mode = member.roles.cache.has(role.id) ? "remove" : "add";
			try {
				if (mode == "add") await member.roles.add(role.id, `Given by ${msg.author.tag}`);
				else await member.roles.remove(role.id, `Removed by ${msg.author.tag}`);
			} catch {
				return msg.channel.send("There was an error when attempting to manage that person's roles.");
			}
			return msg.channel.send(`Role ${mode == "add" ? `added. Gave ${role.name}` : `removed. Took ${role.name}`}.`);
		}
	}
]);
