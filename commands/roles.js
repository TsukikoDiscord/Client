const Discord = require("discord.js");

const { client, commands, sql, reloader } = require("../passthrough.js");

const utils = require("../sub_modules/utilities.js");
reloader.sync("./sub_modules/utilities.js", utils);

const ArgumentAnalyser = require("@amanda/arganalyser");

commands.assign([
	{
		usage: "<Channel:Channel> <Message ID> [\"add\"|\"delete\"] [Role:Role|\"all\"] [Emoji]",
		description: "Main ReactionRole interface command",
		aliases: ["reactionrole", "rr"],
		category: "roles",
		example: "^rr general 012345678987654 add \"cool people\" 😎",
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			const args = ArgumentAnalyser.format(suffix.split(" "));
			const validator = new ArgumentAnalyser({ message: msg, definition: this.usage, args: args, length: 5, findFunctions: { role: utils.findRole, channel: utils.findChannel } }, { search: true, checkViewable: true });
			await validator.validate();
			if (!validator.usable) return;
			const data = validator.collected;
			/** @type {[Discord.TextChannel, string, string, Discord.Role, string]} */
			const [channel, ID, mode, role, emoji] = data;
			/** @type {Array<{ channelID: string, messageID: string, emojiID: string, roleID: string }>} */
			const channeldata = await sql.all("SELECT * FROM ReactionRoles WHERE channelID =? AND messageID =?", [channel.id, ID]);
			if (channeldata && channeldata.length == 0 && !mode) return msg.channel.send(`${msg.author.username}, there is no reaction role data for the message ID specified. Try adding one like:\n${this.example}`);
			if (mode && (mode == "add" || mode == "delete")) {
				if (!msg.member.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage this server's Reaction Roles (Manage Roles)`);
				if (!role) return msg.channel.send(`${msg.author.username}, you need to provide a role`);
				if (role.position >= msg.member.roles.highest.position && !msg.guild.ownerID == msg.author.id) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);
				if (!emoji && !(mode == "delete" && role == "all")) return msg.channel.send(`${msg.author.username}, you also need to provide an emoji`);
				/** @type {Discord.Message} */
				let message;
				try {
					message = await channel.messages.fetch(ID);
				} catch (e) {
					return msg.channel.send(`${msg.author.username}, that's not a valid message ID`);
				}
				if (mode == "add") {
					const emojiid = utils.emojiID(Discord.Util.parseEmoji(emoji));
					if (!emojiid || !emojiid.usable) return msg.channel.send(`${msg.author.username}, that's not a valid emoji`);
					if (channeldata && channeldata.length > 0 && channeldata.find(item => item.channelID == channel.id && item.messageID == message.id && item.emojiID == emojiid && item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role already exists for that emoji`);
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
					if (!emojiid || !emojiid.usable) return msg.channel.send(`${msg.author.username}, that's not a valid emoji`);
					if (channeldata.find(item => item.channelID == channel.id && item.messageID == message.id && item.emojiID == emojiid && item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role does not exist for that emoji`);
					await sql.run("DELETE FROM ReactionRoles WHERE channelID =? AND messageID =? AND emojiID =? AND roleID =?", [channel.id, message.id, emojiid, role.id]);
					if (channel.permissionsFor(client.user).has("MANAGE_MESSAGES") && (!emojiid.custom ? true : client.emojis.cache.get(emojiid.unique)) && message.reactions.cache.get(emojiid.usable) && !channeldata.filter(item => item.emojiID == emojiid.unique).length > 1) {
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
				const embed = new Discord.MessageEmbed()
					.setAuthor(`Reaction Roles for ${msg.guild.name}`)
					.setColor("36393E");
				if (channeldata.length <= 22 && channeldata.join("\n").length <= 2000) {
					embed.setDescription(channeldata.map(item => `Emoji ${item.emojiID} > ${msg.guild.roles.cache.get(item.roleID) ? msg.guild.roles.cache.get(item.roleID).name : item.roleID}`).join("\n"));
					msg.channel.send(utils.contentify(msg.channel, embed));
				} else {
					/** @type {Array<Array<{ channelID: string, messageID: string, emojiID: string, roleID: string }>>} */
					const pages = [];
					let currentPage = [];
					let currentPageLength = 0;
					const currentPageMaxLength = 2000;
					const itemsPerPage = 20;
					const itemsPerPageTolerance = 2;
					for (let i = 0; i < channeldata.length; i++) {
						const row = channeldata[i];
						if ((currentPage.length >= itemsPerPage && channeldata.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
							pages.push(currentPage);
							currentPage = [];
							currentPageLength = 0;
						}
						currentPage.push(row);
						currentPageLength += row.length + 1;
					}
					utils.paginate(msg.channel, pages.length, page => {
						embed.setFooter(`Page ${page + 1} of ${pages.length}`);
						embed.setDescription(pages[page].map(item => `Emoji ${item.emojiID} > ${msg.guild.roles.cache.get(item.roleID) ? msg.guild.roles.cache.get(item.roleID).name : item.roleID}`).join("\n"));
						return utils.contentify(msg.channel, embed);
					});
				}
			}
		}
	},
	{
		usage: "[Role:Role] [\"add\"|\"delete\"]",
		description: "Main Self Assignable Role interface command",
		aliases: ["selfassign", "sar", "iam", "iamnot"],
		category: "roles",
		example: "^sar \"cool people\"",
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			/** @type {Array<string>} */
			const data = await sql.all("SELECT roleID FROM SelfRoles WHERE guildID =?", msg.guild.id).then(d => d.map(item => item.roleID));
			if (!suffix) {
				if (!data || data.length == 0) return msg.channel.send(`${msg.author.username}, there are no self assignable roles set up in this server.`);
				const embed = new Discord.MessageEmbed()
					.setAuthor(`Self Assignable Roles for ${msg.guild.name}`)
					.setColor("36393E")
					.setFooter("Use `^selfassign <Role>` to give yourself a role`");
				if (data.length <= 22 && data.join("\n").length <= 1970) {
					embed.setDescription(data.map((item, index) => `${index + 1}. ${msg.guild.roles.cache.get(item) ? msg.guild.roles.cache.get(item).name : item}`).join("\n"));
					msg.channel.send(utils.contentify(msg.channel, embed));
				} else {
					/** @type {Array<Array<string>>} */
					const pages = [];
					let currentPage = [];
					let currentPageLength = 0;
					const currentPageMaxLength = 1970;
					const itemsPerPage = 20;
					const itemsPerPageTolerance = 2;
					for (let i = 0; i < data.length; i++) {
						const row = data[i];
						if ((currentPage.length >= itemsPerPage && data.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
							pages.push(currentPage);
							currentPage = [];
							currentPageLength = 0;
						}
						currentPage.push(row);
						currentPageLength += row.length + 1;
					}
					utils.paginate(msg.channel, pages.length, page => {
						embed.setFooter(`Page ${page + 1} of ${pages.length}`);
						embed.setDescription(pages[page].map((item, index) => `${index + 1 + (page > 1 ? page * itemsPerPage : 0)}. ${msg.guild.roles.cache.get(item) ? msg.guild.roles.cache.get(item).name : item}`).join("\n"));
						return utils.contentify(msg.channel, embed);
					});
				}
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
					if (role.position >= msg.member.roles.highest.position && !msg.guild.ownerID == msg.author.id) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);

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
		usage: "[Role:Role] [\"add\"|\"delete\"] [addafter] [removeafter]",
		description: "Main Auto Join Role interface command",
		aliases: ["join", "jr"],
		category: "roles",
		example: "^join \"cool people\" add 10min",
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			const args = ArgumentAnalyser.format(suffix.split(" "));
			const validator = new ArgumentAnalyser({ message: msg, definition: this.usage, args: args, length: 4, findFunctions: { role: utils.findRole } }, { search: true });
			await validator.validate();
			if (args.length > 1 && !validator.usable) return;
			/** @type {[Discord.Role, "add" | "delete", string, string]} */
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
				if (role.position >= msg.member.roles.highest.position && !msg.guild.ownerID == msg.author.id) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that role since it is higher than or equal to your highest`);

				let addafter, removeafter;
				if (mode == "add") {
					if (data && data.length > 0 && data.find(item => item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role is already set up to be added to someone when they join.`);

					if (addtimeout) addafter = utils.parseTime(addtimeout);
					if (removetimeout) removeafter = utils.parseTime(removetimeout);

					if ((addtimeout || removetimeout) && ((addtimeout && !addafter && addafter !== 0) || (removetimeout && !removeafter && addafter !== 0))) return msg.channel.send(`${msg.author.username}, your duration for argument \`${!addtimeout ? "add after" : "remove after"}\` was not a valid duration.`);
					if ((addtimeout || removetimeout) && ((addafter > 1000 * 60 * 60 * 24 * 7) || (removeafter > 1000 * 60 * 60 * 24 * 7))) return msg.channel.send(`${msg.author.username}, the longest duration allowed for \`add after\` or \`remove after\` is 1 week.`);

					await sql.all("INSERT INTO JoinRoles (guildID, roleID, timeout, removeAfter) VALUES (?, ?, ?, ?)", [msg.guild.id, role.id, addafter || 0, removeafter || 0]);
				} else {
					if (data && data.length > 0 && !data.find(item => item.roleID == role.id)) return msg.channel.send(`${msg.author.username}, that role does not exist in this server's join role list and does not need to be deleted.`);
					await sql.all("DELETE FROM JoinRoles WHERE guildID =? AND roleID =?", [msg.guild.id, role.id]);
				}
				return msg.channel.send(`Alright! ${role.name} was ${mode == "add" ? "added to" : "deleted from"} the auto join role list. ${mode == "add" && addafter && addafter !== 0 ? `Add after: ${utils.shortTime(addafter, "ms")}` : ""} ${mode == "add" && removeafter && removeafter !== 0 ? `Remove after: ${utils.shortTime(removeafter, "ms")}` : ""}`);
			} else {
				if (!data || data.length == 0) return msg.channel.send(`${msg.author.username}, there are no auto join roles set up in this server.`);
				const embed = new Discord.MessageEmbed()
					.setAuthor(`Join Roles for ${msg.guild.name}`)
					.setColor("36393E");
				if (data.length <= 22 && data.join("\n").length <= 1970) {
					embed.setDescription(data.map((item, index) => `${index + 1}. ${msg.guild.roles.cache.get(item.roleID) ? msg.guild.roles.cache.get(item.roleID).name : item.roleID} (Add Timeout: ${item.timeout ? utils.shortTime(item.timeout, "ms") : 0}) (Remove Timeout: ${item.removeAfter ? utils.shortTime(item.removeAfter, "ms") : 0})`).join("\n"));
					msg.channel.send(utils.contentify(msg.channel, embed));
				} else {
					/** @type {Array<Array<{ guildID: string, roleID: string, timeout: number, removeAfter: number }>>} */
					const pages = [];
					let currentPage = [];
					let currentPageLength = 0;
					const currentPageMaxLength = 1970;
					const itemsPerPage = 20;
					const itemsPerPageTolerance = 2;
					for (let i = 0; i < data.length; i++) {
						const row = data[i];
						if ((currentPage.length >= itemsPerPage && data.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
							pages.push(currentPage);
							currentPage = [];
							currentPageLength = 0;
						}
						currentPage.push(row);
						currentPageLength += row.length + 1;
					}
					utils.paginate(msg.channel, pages.length, page => {
						embed.setFooter(`Page ${page + 1} of ${pages.length}`);
						embed.setDescription(pages[page].map((item, index) => `${index + 1 + (page > 1 ? page * itemsPerPage : 0)}. ${msg.guild.roles.cache.get(item.roleID) ? msg.guild.roles.cache.get(item.roleID).name : item.roleID} Add Timeout: ${item.timeout ? utils.shortTime(item.timeout, "ms") : 0}) (Remove Timeout: ${item.removeAfter ? utils.shortTime(item.removeAfter, "ms") : 0})`).join("\n"));
						return utils.contentify(msg.channel, embed);
					});
				}
			}
		}
	},
	{
		usage: "<Role:Role>",
		description: "Displays a list of who is in a role",
		aliases: ["inrole", "in"],
		category: "roles",
		example: "^inrole Members",
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			const role = await utils.findRole(msg, suffix);
			if (!role) return msg.channel.send(`${msg.author.username}, that's not a valid role.`);
			const members = msg.guild.members.cache.filter(mem => mem.roles.cache.has(role.id));
			if (members.size == 0) return msg.channel.send(`${msg.author.username}, there are no members in that role.`);
			const marray = members.array();
			const embed = new Discord.MessageEmbed()
				.setAuthor(`Members in ${role.name}`)
				.setColor("36393E");
			if (marray.length <= 22 && marray.length <= 1970) {
				embed.setDescription(marray.map((member, index) => `${index + 1}. ${member.user.tag}`).join("\n"));
				msg.channel.send(utils.contentify(msg.channel, embed));
			} else {
				/** @type {Array<Array<Discord.GuildMember>>} */
				const pages = [];
				let currentPage = [];
				let currentPageLength = 0;
				const currentPageMaxLength = 1970;
				const itemsPerPage = 20;
				const itemsPerPageTolerance = 2;
				for (let i = 0; i < marray.length; i++) {
					const row = marray[i];
					if ((currentPage.length >= itemsPerPage && marray.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
						pages.push(currentPage);
						currentPage = [];
						currentPageLength = 0;
					}
					currentPage.push(row);
					currentPageLength += row.length + 1;
				}
				utils.paginate(msg.channel, pages.length, page => {
					embed.setFooter(`Page ${page + 1} of ${pages.length}`);
					embed.setDescription(pages[page].map((member, index) => `${index + 1 + (page > 1 ? page * itemsPerPage : 0)}. ${member.user.tag}`).join("\n"));
					return utils.contentify(msg.channel, embed);
				});
			}
		}
	},
	{
		usage: "<Role:Role> [User:User]",
		description: "Staff command to manage a member's roles",
		aliases: ["role"],
		category: "roles",
		example: "^role PapiOphidian Members",
		async process(msg, suffix) {
			if (msg.channel instanceof Discord.DMChannel) return msg.channel.send("This command does not work in DMs.");
			if (!msg.member.permissions.has("MANAGE_ROLES")) return msg.channel.send(`${msg.author.username}, you don't have permissions to manage that person's roles (Manage Roles)`);
			const args = ArgumentAnalyser.format(suffix.split(" "));
			const role = await utils.findRole(msg, args[0] || "");
			const member = await msg.guild.findMember(msg, args[1] || "", true);
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
