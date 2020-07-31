const Discord = require("discord.js");
const ReactionMenu = require("@amanda/reactionmenu");

const passthrough = require("../passthrough");
const { client, config, commands, reloader } = passthrough;

const utils = require("../sub_modules/utilities.js");
reloader.sync("./sub_modules/utilities.js", utils);

commands.assign([
	{
		usage: "None",
		description: "Displays detailed statistics",
		aliases: ["statistics", "stats"],
		category: "meta",
		example: "^stats",
		async process(msg, suffix) {
			const embed = new Discord.MessageEmbed().setColor("36393E");
			const leadingIdentity = `${client.user.tag} <:online:606664341298872324>`;
			const leadingSpace = "​ ";
			const stats = utils.getStats();
			const nmsg = await msg.channel.send("Waiting on Discord...");
			embed
				.addFields([
					{
						name: leadingIdentity,
						value: `**❯ Heartbeat:**\n${stats.ping.toFixed(0)}ms\n`
						+ `**❯ Latency:**\n${nmsg.createdTimestamp - msg.createdTimestamp}ms\n`
						+ `**❯ Uptime:**\n${utils.shortTime(stats.uptime, "sec")}\n`
						+ `**❯ RAM Usage:**\n${bToMB(stats.ram)}`,
						inline: true
					},
					{
						name: leadingSpace,
						value: `**❯ User Count**\n${stats.users}\n`
						+ `**❯ Server Count**\n${stats.guilds}\n`
						+ `**❯ Channel Count**\n${stats.channels}`,
						inline: true
					}
				]);
			const content = utils.contentify(msg.channel, embed);
			if (typeof content === "string") nmsg.edit(content);
			else if (content instanceof Discord.MessageEmbed) nmsg.edit("", content);
			function bToMB(number) {
				return `${((number / 1024) / 1024).toFixed(2)}MB`;
			}
		}
	},
	{
		usage: "None",
		description: "You know what this does",
		aliases: ["ping", "pong"],
		category: "meta",
		example: "^ping",
		async process(msg, suffix) {
			const nmsg = await msg.channel.send("Waiting on Discord...");
			const embed = new Discord.MessageEmbed().setAuthor("Pong!").addFields([{ name: "Heartbeat:", value: `${client.ws.ping.toFixed(0)}ms`, inline: true }, { name: "Latency:", value: `${nmsg.createdTimestamp - msg.createdTimestamp}ms`, inline: true }]).setColor("36393E");
			const content = utils.contentify(msg.channel, embed);
			if (typeof content == "string") nmsg.edit(content);
			else if (content instanceof Discord.MessageEmbed) nmsg.edit("", content);
		}
	},
	{
		usage: "None",
		description: "Add Amanda to a server",
		aliases: ["invite", "inv"],
		category: "meta",
		example: "^invite",
		process(msg, suffix) {
			const embed = new Discord.MessageEmbed()
				.setTitle("Wanna invite me?")
				.setDescription("Notice: You must have manage server permissions to invite me.\nI don't ask for many permissions. Just what I need. You can invite me [here](https://discord.com/api/oauth2/authorize?client_id=709907646387322932&permissions=268714048&scope=bot)")
				.setColor(0x36393f);
			msg.channel.send(utils.contentify(msg.channel, embed));
		}
	},
	{
		usage: "None",
		description: "Displays information about Amanda",
		aliases: ["info", "inf"],
		category: "meta",
		example: "^info",
		async process(msg, suffix) {
			const creator = await client.users.fetch("320067006521147393", true);
			const embed = new Discord.MessageEmbed()
				.setDescription("Thanks for choosing me <3")
				.addFields([
					{
						name: "Creators",
						value: `${creator.tag} ${utils.userFlagEmojis(creator).join(" ")} <:NitroBadge:421774688507920406>\n`
					},
					{
						name: "Code",
						value: `[node.js](https://nodejs.org/) ${process.version} + [discord.js](https://www.npmjs.com/package/discord.js) ${Discord.version}`
					},
					{
						name: "Links",
						value: "Invite: [here](https://discord.com/api/oauth2/authorize?client_id=709907646387322932&permissions=268714048&scope=bot)"
					}
				])
				.setColor("36393E");
			return msg.channel.send(utils.contentify(msg.channel, embed));
		}
	},
	{
		usage: "[command|category]",
		description: "Your average help command",
		aliases: ["help", "h", "commands", "cmds"],
		category: "meta",
		example: "^help audio",
		process(msg, suffix) {
			let embed, permissions;
			if (msg.channel instanceof Discord.TextChannel) permissions = msg.channel.permissionsFor(client.user);
			/**
			 * @param {Discord.Message} mesg
			 */
			const reply = (mesg) => { if (mesg.channel.type != "dm") return mesg.channel.send("I sent you a DM"); };
			if (suffix) {
				suffix = suffix.toLowerCase();
				const command = commands.cache.find(c => c.aliases.includes(suffix));
				if (command) {
					const def = command.usage.replace(/["'`]/g, "").replace(/:(?:\w)+(?=[>\]|])/g, "");
					embed = new Discord.MessageEmbed()
						.setAuthor(`Help for ${command.aliases[0]}`)
						.setDescription(`Arguments: ${def}\nDescription: ${command.description}\nAliases: ${command.aliases.map(a => `\`${a}\``).join(", ")}\nCategory: ${command.category}\nExample: ${command.example || "N.A."}`)
						.setFooter("<> = Required, [] = Optional, | = Or. Do not include <>, [], or | in your input.\nTip: If you want to treat multiple words separated by a space as 1, use quotation marks (\", ' or `)")
						.setColor("36393E");
					msg.channel.send(utils.contentify(msg.channel, embed));
				} else if (commands.categories.get(suffix)) {
					const cat = commands.categories.get(suffix);
					const maxLength = cat.reduce((acc, cur) => Math.max(acc, cur.length), 0);
					embed = new Discord.MessageEmbed()
						.setAuthor(`Command Category: ${suffix}`)
						.setDescription(
							cat.sort((a, b) => {
								const cmda = commands.cache.get(a);
								const cmdb = commands.cache.get(b);
								if (cmda.order !== undefined && cmdb.order !== undefined) { // both are numbers, sort based on that, lowest first
									return cmda.order - cmdb.order;
								} else if (cmda.order !== undefined) { // a is defined, sort a first
									return -1;
								} else if (cmdb.order !== undefined) { // b is defined, sort b first
									return 1;
								} else { // we don't care
									return 0;
								}
							}).map(c => {
								const cmd = commands.cache.get(c);
								return `\`${cmd.aliases[0]}${" ​".repeat(maxLength - cmd.aliases[0].length)}\` ${cmd.description}`;
							}).join("\n") +
						"\n\nType `^help [command]` to see more information about a command")
						.setColor(0x36393f);
					if (permissions && permissions.has("ADD_REACTIONS")) embed.setFooter("Click the reaction for a mobile-compatible view");
					try {
						msg.author.send(embed).then(() => reply(msg));
					} catch (e) {
						msg.channel.send(utils.contentify(msg.channel, embed));
					}
				} else {
					embed = new Discord.MessageEmbed().setDescription(`${msg.author.tag}, I couldn't find the help panel for that command`).setColor("B60000");
					msg.channel.send(utils.contentify(msg.channel, embed));
				}
			} else {
				embed = new Discord.MessageEmbed()
					.setAuthor("Command Categories")
					.setDescription(
						`❯ ${Array.from(commands.categories.keys()).filter(c => c != "admin").join("\n❯ ")}\n\n${"Type `^help [category]` to see all commands in that category."
						+ "\nType `^help [command]` to see more information about a command."}`)
					.setColor("36393E");
				try {
					msg.author.send(embed).then(m => reply(msg));
				} catch (e) {
					msg.channel.send(utils.contentify(msg.channel, embed)).catch(console.error);
				}
			}
		}
	}
]);
