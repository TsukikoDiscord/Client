const Discord = require("discord.js");
const util = require("util");
const ReactionMenu = require("@amanda/reactionmenu");

const passthrough = require("../passthrough.js");

const { client, reloadEvent } = passthrough;

const utils = {
	/**
	 * @param {events.EventEmitter} target
	 * @param {string} name
	 * @param {string} filename
	 * @param {(...args: Array<any>) => any} code
	 */
	addTemporaryListener: function(target, name, filename, code, targetListenMethod = "on") {
		console.log(`added event ${name}`);
		target[targetListenMethod](name, code);
		reloadEvent.once(filename, () => {
			target.removeListener(name, code);
			console.log(`removed event ${name}`);
		});
	},
	/**
	 * @param {any} data
	 * @param {number} [depth=0]
	 * @returns {Promise<string>}
	 */
	stringify: async function(data, depth = 0) {
		/** @type {string} */
		let result;
		if (data === undefined) result = "(undefined)";
		else if (data === null) result = "(null)";
		else if (typeof (data) == "function") result = "(function)";
		else if (typeof (data) == "string") result = `"${data}"`;
		else if (typeof (data) == "number") result = data.toString();
		else if (data instanceof Promise) return utils.stringify(await data, depth);
		else if (data.constructor && data.constructor.name && data.constructor.name.toLowerCase().includes("error")) {
			const errorObject = {};
			Object.entries(data).forEach(e => {
				errorObject[e[0]] = e[1];
			});
			result = `\`\`\`\n${data.stack}\`\`\` ${await utils.stringify(errorObject)}`;
		} else result = `\`\`\`js\n${util.inspect(data, { depth: depth })}\`\`\``;

		if (result.length >= 2000) {
			if (result.startsWith("```")) result = result.slice(0, 1995).replace(/`+$/, "").replace(/\n\s+/ms, "") + "…```";
			else result = `${result.slice(0, 1998)}…`;
		}
		return result;
	},
	/**
	 * @param {Discord.TextChannel|Discord.DMChannel} channel
	 * @param {string|Discord.MessageEmbed} content
	 */
	contentify: function(channel, content) {
		if (channel.type != "text") return content;
		let value = "";
		let permissions;
		if (channel instanceof Discord.TextChannel) permissions = channel.permissionsFor(client.user);
		if (content instanceof Discord.MessageEmbed) {
			if (permissions && !permissions.has("EMBED_LINKS")) {
				value = `${content.author ? `${content.author.name}\n` : ""}${content.title ? `${content.title}${content.url ? ` - ${content.url}` : ""}\n` : ""}${content.description ? `${content.description}\n` : ""}${content.fields.length > 0 ? content.fields.map(f => `${f.name}\n${f.value}`).join("\n") + "\n" : ""}${content.image ? `${content.image.url}\n` : ""}${content.footer ? content.footer.text : ""}`;
				if (value.length > 2000) value = `${value.slice(0, 1960)}…`;
				value += "\nPlease allow me to embed content";
			} else return content;
		} else if (typeof (content) == "string") {
			value = content;
			if (value.length > 2000) value = `${value.slice(0, 1998)}…`;
		}
		return value.replace(/\[(.+?)\]\((https?:\/\/.+?)\)/gs, "$1: $2");
	},
	findUser:
	/**
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search users by
	 * @param {boolean} [self=false] If the function should return the `message` author's user Object
	 * @returns {Promise<Discord.User>}
	 */
	function(message, string, self = false) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async resolve => {
			let permissions;
			if (message.channel instanceof Discord.TextChannel) permissions = message.channel.permissionsFor(client.user);
			string = string.toLowerCase();
			if (/<@!?(\d+)>/.exec(string)) string = /<@!?(\d+)>/.exec(string)[1];
			/** @type {Array<(user: Discord.User) => boolean>} */
			let matchFunctions = [];
			matchFunctions = matchFunctions.concat([
				user => user.id == string,
				user => user.tag.toLowerCase() == string,
				user => user.username.toLowerCase() == string,
				user => user.username.toLowerCase().includes(string)
			]);
			if (!string) {
				if (self) return resolve(message.author);
				else return resolve(null);
			} else {
				if (client.users.cache.get(string)) return resolve(client.users.cache.get(string));
				const list = [];
				matchFunctions.forEach(i => client.users.cache.filter(u => i(u))
					.forEach(us => {
						if (!list.includes(us) && list.length < 10) list.push(us);
					}));
				if (list.length == 1) return resolve(list[0]);
				if (list.length == 0) return resolve(null);
				const embed = new Discord.MessageEmbed().setTitle("User selection").setDescription(list.map((item, i) => `${i + 1}. ${item.tag}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
				const selectmessage = await message.channel.send(utils.contentify(message.channel, embed));
				const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 });
				// eslint-disable-next-line no-return-await
				return await collector.next.then(newmessage => {
					const index = Number(newmessage.content);
					if (!index || !list[index - 1]) return resolve(null);
					selectmessage.delete();
					// eslint-disable-next-line no-empty-function
					if (message.channel.type != "dm") newmessage.delete().catch(() => {});
					return resolve(list[index - 1]);
				}).catch(() => {
					embed.setTitle("User selection cancelled").setDescription("").setFooter("");
					selectmessage.edit(utils.contentify(selectmessage.channel, embed));
					return resolve(null);
				});
			}
		});
	},
	findChannel:
	/**
	 * Find a channel in a guild
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search channels by
	 * @param {boolean} [self=false] If the function should return `message`.channel
	 * @returns {Promise<Discord.TextChannel>}
	 */
	function(message, string, self) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async resolve => {
			if (message.channel instanceof Discord.DMChannel) return resolve(null);
			string = string.toLowerCase();
			if (/<#(\d+)>/.exec(string)) string = /<#(\d+)>/.exec(string)[1];
			/** @type {Array<(channel: Discord.TextChannel) => boolean>} */
			let matchFunctions = [];
			matchFunctions = matchFunctions.concat([
				channel => channel.id == string,
				channel => channel.name.toLowerCase() == string,
				channel => channel.name.toLowerCase().includes(string)
			]);
			if (!string) {
				// @ts-ignore
				if (self) resolve(message.channel);
				else resolve(null);
			} else {
				// @ts-ignore
				if (message.guild.channels.cache.get(string)) return resolve(message.guild.channels.cache.get(string));
				/** @type {Array<Discord.TextChannel>} */
				const list = [];
				const channels = message.guild.channels.cache.filter(c => c.type == "text");
				matchFunctions.forEach(i => channels
					// @ts-ignore
					.filter(c => i(c))
					.forEach(ch => {
						// @ts-ignore
						if (!list.includes(ch) && list.length < 10) list.push(ch);
					}));
				if (list.length == 1) return resolve(list[0]);
				if (list.length == 0) return resolve(null);
				const embed = new Discord.MessageEmbed().setTitle("Channel selection").setDescription(list.map((item, i) => `${i + 1}. ${item.name}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
				const selectmessage = await message.channel.send(utils.contentify(message.channel, embed));
				const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 });
				// eslint-disable-next-line no-return-await
				return await collector.next.then(newmessage => {
					const index = Number(newmessage.content);
					if (!index || !list[index - 1]) return resolve(null);
					selectmessage.delete();
					// eslint-disable-next-line no-empty-function
					newmessage.delete().catch(() => {});
					return resolve(list[index - 1]);
				}).catch(() => {
					embed.setTitle("Channel selection cancelled").setDescription("").setFooter("");
					selectmessage.edit(utils.contentify(selectmessage.channel, embed));
					return resolve(null);
				});
			}
		});
	},
	findRole:
	/**
	 * Find a channel in a guild
	 * @param {Discord.Message} message Message Object
	 * @param {string} string String to search roles by
	 * @returns {Promise<Discord.Role>}
	 */
	function(message, string) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async resolve => {
			if (message.channel instanceof Discord.DMChannel) return resolve(null);
			string = string.toLowerCase();
			if (/<@&(\d+)>/.exec(string)) string = /<@&(\d+)>/.exec(string)[1];
			/** @type {Array<(role: Discord.Role) => boolean>} */
			let matchFunctions = [];
			matchFunctions = matchFunctions.concat([
				role => role.id == string,
				role => role.name.toLowerCase() == string,
				role => role.name.toLowerCase().includes(string)
			]);
			if (!string) resolve(null);
			else {
				// @ts-ignore
				if (message.guild.roles.cache.get(string)) return resolve(message.guild.roles.cache.get(string));
				/** @type {Array<Discord.Role>} */
				const list = [];
				const roles = message.guild.roles.cache;
				matchFunctions.forEach(i => roles
					// @ts-ignore
					.filter(r => i(r))
					.forEach(r => {
						// @ts-ignore
						if (!list.includes(r) && list.length < 10) list.push(r);
					}));
				if (list.length == 1) return resolve(list[0]);
				if (list.length == 0) return resolve(null);
				const embed = new Discord.MessageEmbed().setTitle("Role selection").setDescription(list.map((item, i) => `${i + 1}. ${item.name} - ${item.id}`).join("\n")).setFooter(`Type a number between 1 - ${list.length}`).setColor("36393E");
				const selectmessage = await message.channel.send(utils.contentify(message.channel, embed));
				const collector = message.channel.createMessageCollector((m => m.author.id == message.author.id), { max: 1, time: 60000 });
				// eslint-disable-next-line no-return-await
				return await collector.next.then(newmessage => {
					const index = Number(newmessage.content);
					if (!index || !list[index - 1]) return resolve(null);
					selectmessage.delete();
					// eslint-disable-next-line no-empty-function
					newmessage.delete().catch(() => {});
					return resolve(list[index - 1]);
				}).catch(() => {
					embed.setTitle("Role selection cancelled").setDescription("").setFooter("");
					selectmessage.edit(utils.contentify(selectmessage.channel, embed));
					return resolve(null);
				});
			}
		});
	},
	/**
	 * A function to replace wildcard (%string) strings with information from lang
	 * @param {string} string The string from lang
	 * @param {Object.<string, any>} properties example: `{ "username": "PapiOphidian" }`
	 * @returns {string}
	 */
	replace: function(string, properties = {}) {
		let value = string.slice(0, string.length);
		Object.keys(properties).forEach(item => {
			const index = value.indexOf(`%${item}`);
			if (index != -1) value = value.slice(0, index) + properties[item] + value.slice(index + item.length + 1);
		});
		return value;
	},
	getStats: function() {
		const ram = process.memoryUsage();
		return {
			ping: client.ws.ping,
			uptime: process.uptime(),
			ram: ram.rss - (ram.heapTotal - ram.heapUsed),
			users: client.users.cache.size,
			guilds: client.guilds.cache.size,
			channels: client.channels.cache.size
		};
	},
	/**
	 * Get a random element from an array.
	 * @param {Array<T>} array
	 * @return {T}
	 * @template T
	 */
	arrayRandom: function(array) {
		const index = Math.floor(Math.random() * array.length);
		return array[index];
	},
	/**
	 * @param {string[][]} rows
	 * @param {any[]} align
	 * @param {(currentLine?: number) => string} surround
	 * @param {string} spacer
	 * @returns {string[]}
	 */
	tableifyRows: function(rows, align, surround = () => "", spacer = " ") { // SC: en space
		/** @type {string[]} */
		const output = [];
		const maxLength = [];
		for (let i = 0; i < rows[0].length; i++) {
			let thisLength = 0;
			for (let j = 0; j < rows.length; j++) {
				if (thisLength < rows[j][i].length) thisLength = rows[j][i].length;
			}
			maxLength.push(thisLength);
		}
		for (let i = 0; i < rows.length; i++) {
			let line = "";
			for (let j = 0; j < rows[0].length; j++) {
				if (align[j] == "left" || align[j] == "right") {
					line += surround(i);
					if (align[j] == "left") {
						const pad = " ​";
						const padding = pad.repeat(maxLength[j] - rows[i][j].length);
						line += rows[i][j] + padding;
					} else if (align[j] == "right") {
						const pad = "​ ";
						const padding = pad.repeat(maxLength[j] - rows[i][j].length);
						line += padding + rows[i][j];
					}
					line += surround(i);
				} else {
					line += rows[i][j];
				}
				if (j < rows[0].length - 1) line += spacer;
			}
			output.push(line);
		}
		return output;
	},
	/**
	 * @param {{ name: string, id: string }} emoji
	 */
	emojiID: function(emoji) {
		if (emoji.id) return { unique: emoji.id, usable: emoji.id, custom: true };
		else if (emoji.name) {
			const match = emoji.name.match(utils.twemojiRegex);
			let name;
			if (match && match[0]) name = String(emoji.name.codePointAt(0));
			else name = emoji.name;
			return { unique: name, usable: name === emoji.name ? emoji.name : String.fromCodePoint(name), custom: false };
		} else return null;
	},
	/**
	 * @param {string[]} rows
	 * @param {number} maxLength
	 * @param {number} itemsPerPage
	 * @param {number} itemsPerPageTolerance
	 */
	createPages: function(rows, maxLength, itemsPerPage, itemsPerPageTolerance) {
		const pages = [];
		let currentPage = [];
		let currentPageLength = 0;
		const currentPageMaxLength = maxLength;
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if ((currentPage.length >= itemsPerPage && rows.length - i > itemsPerPageTolerance) || currentPageLength + row.length + 1 > currentPageMaxLength) {
				pages.push(currentPage);
				currentPage = [];
				currentPageLength = 0;
			}
			currentPage.push(row);
			currentPageLength += row.length + 1;
		}
		pages.push(currentPage);
		return pages;
	},
	/**
	 * @param {Discord.TextChannel|Discord.DMChannel} channel
	 * @param {string[]} title
	 * @param {string[][]} rows
	 * @param {Array<"left" | "right">} align
	 * @param {number} maxLength
	 * @param {string} author
	 * @param {string} [footer]
	 */
	createPagination: function(channel, title, rows, align, maxLength, author, footer) {
		let alignedRows = utils.tableifyRows([title].concat(rows), align, () => "`");
		const formattedTitle = alignedRows[0].replace(/`.+?`/g, sub => `__**\`${sub}\`**__`);
		alignedRows = alignedRows.slice(1);
		const pages = utils.createPages(alignedRows, maxLength - formattedTitle.length - 1, 16, 4);
		utils.paginate(channel, pages.length, page => {
			return utils.contentify(channel,
				new Discord.MessageEmbed()
					.setTitle(author)
					.setColor(0x36393f)
					.setDescription(`${formattedTitle}\n${pages[page].join("\n")}`)
					.setFooter(`Page ${page + 1} of ${pages.length}${footer ? `\n${footer}` : ""}`)
			);
		});
	},
	/**
	 * @param {Discord.TextChannel|Discord.DMChannel} channel
	 * @param {number} pageCount
	 * @param {(page: number) => any} callback
	 */
	paginate: async function(channel, pageCount, callback) {
		let page = 0;
		const msg = await channel.send(callback(page));
		if (pageCount > 1) {
			let reactionMenuExpires;
			const reactionMenu = new ReactionMenu(msg, [
				{ emoji: "◀️", remove: "user", actionType: "js", actionData: () => {
					page--;
					if (page < 0) page = pageCount - 1;
					msg.edit(callback(page));
					makeTimeout();
				} },
				{ emoji: "▶️", remove: "user", actionType: "js", actionData: () => {
					page++;
					if (page >= pageCount) page = 0;
					msg.edit(callback(page));
					makeTimeout();
				} }
			]);
			// eslint-disable-next-line no-inner-declarations
			function makeTimeout() {
				clearTimeout(reactionMenuExpires);
				reactionMenuExpires = setTimeout(() => {
					reactionMenu.destroy(true);
				}, 10 * 60 * 1000);
			}
			makeTimeout();
		}
	},
	shortTime:
	/**
	 * @param {number} number
	 * @param {"ms" | "sec"} scale
	 */
	function(number, scale, precision = ["d", "h", "m", "s"]) {
		if (isNaN(number)) throw new TypeError("Input provided is NaN");
		if (!scale) throw new RangeError("Missing scale");
		if (scale.toLowerCase() == "ms") number = Math.floor(number);
		else if (scale.toLowerCase() == "sec") number = Math.floor(number * 1000);
		else throw new TypeError("Invalid scale provided");
		const days = Math.floor(number / 1000 / 60 / 60 / 24);
		number -= days * 1000 * 60 * 60 * 24;
		const hours = Math.floor(number / 1000 / 60 / 60);
		number -= hours * 1000 * 60 * 60;
		const mins = Math.floor(number / 1000 / 60);
		number -= mins * 1000 * 60;
		const secs = Math.floor(number / 1000);
		let timestr = "";
		if (days > 0 && precision.includes("d")) timestr += `${days}d `;
		if (hours > 0 && precision.includes("h")) timestr += `${hours}h `;
		if (mins > 0 && precision.includes("m")) timestr += `${mins}m `;
		if (secs > 0 && precision.includes("s")) timestr += `${secs}s`;
		if (!timestr) timestr = "0" + precision.slice(-1)[0];
		return timestr;
	},
	parseTime:
	/**
	 * Parses user duration inputs and converts it to MS
	 * @param {string} input
	 */
	function(input) {
		if (!input) return null;
		const individual = input.split(/(?! [^\d]+) /g);
		let totalTime = 0;
		for (const frame of individual) {
			const reg = /([\d]+) ?([\w]+)?/;
			const test = frame.match(reg);
			if (test == null) return null;
			if (!test[1]) return null;
			/** @type [string, string, string] */
			const [inp, duration, identifier] = test;
			const num = Number(duration);
			if (isNaN(num)) return null;
			let multiply = 1;
			if (identifier) {
				if (identifier.startsWith("w")) multiply = 1000 * 60 * 60 * 24 * 7;
				else if (identifier.startsWith("d")) multiply = 1000 * 60 * 60 * 24;
				else if (identifier.startsWith("h")) multiply = 1000 * 60 * 60;
				else if (identifier.startsWith("ms") || identifier.startsWith("mil")) multiply = 1000;
				else if (identifier.startsWith("m")) multiply = 1000 * 60;
				else if (identifier.startsWith("s")) multiply = 1000;
			}
			totalTime += num * multiply;
		}
		return totalTime;
	},
	twemojiRegex: /(?:\ud83d\udc68\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c\udffb|\ud83d\udc68\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb\udffc]|\ud83d\udc68\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffd]|\ud83d\udc68\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffe]|\ud83d\udc69\ud83c\udffb\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffc-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb\udffd-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c\udffb|\ud83d\udc69\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb\udffc\udffe\udfff]|\ud83d\udc69\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffb\udffc]|\ud83d\udc69\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffd\udfff]|\ud83d\udc69\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffb-\udffd]|\ud83d\udc69\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffe]|\ud83d\udc69\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffb-\udffe]|\ud83e\uddd1\ud83c\udffb\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c\udffb|\ud83e\uddd1\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb\udffc]|\ud83e\uddd1\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udffd]|\ud83e\uddd1\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udffe]|\ud83e\uddd1\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udfff]|\ud83e\uddd1\u200d\ud83e\udd1d\u200d\ud83e\uddd1|\ud83d\udc6b\ud83c[\udffb-\udfff]|\ud83d\udc6c\ud83c[\udffb-\udfff]|\ud83d\udc6d\ud83c[\udffb-\udfff]|\ud83d[\udc6b-\udc6d])|(?:\ud83d[\udc68\udc69])(?:\ud83c[\udffb-\udfff])?\u200d(?:\u2695\ufe0f|\u2696\ufe0f|\u2708\ufe0f|\ud83c[\udf3e\udf73\udf93\udfa4\udfa8\udfeb\udfed]|\ud83d[\udcbb\udcbc\udd27\udd2c\ude80\ude92]|\ud83e[\uddaf-\uddb3\uddbc\uddbd])|(?:\ud83c[\udfcb\udfcc]|\ud83d[\udd74\udd75]|\u26f9)((?:\ud83c[\udffb-\udfff]|\ufe0f)\u200d[\u2640\u2642]\ufe0f)|(?:\ud83c[\udfc3\udfc4\udfca]|\ud83d[\udc6e\udc71\udc73\udc77\udc81\udc82\udc86\udc87\ude45-\ude47\ude4b\ude4d\ude4e\udea3\udeb4-\udeb6]|\ud83e[\udd26\udd35\udd37-\udd39\udd3d\udd3e\uddb8\uddb9\uddcd-\uddcf\uddd6-\udddd])(?:\ud83c[\udffb-\udfff])?\u200d[\u2640\u2642]\ufe0f|(?:\ud83d\udc68\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68|\ud83d\udc68\u200d\ud83d\udc68\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc68\u200d\ud83d\udc68\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d[\udc68\udc69]|\ud83d\udc69\u200d\ud83d\udc69\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc69\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\u2764\ufe0f\u200d\ud83d\udc68|\ud83d\udc68\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc68\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\ud83d\udc68\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\u2764\ufe0f\u200d\ud83d[\udc68\udc69]|\ud83d\udc69\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\ud83d\udc69\u200d\ud83d[\udc66\udc67]|\ud83c\udff3\ufe0f\u200d\ud83c\udf08|\ud83c\udff4\u200d\u2620\ufe0f|\ud83d\udc15\u200d\ud83e\uddba|\ud83d\udc41\u200d\ud83d\udde8|\ud83d\udc68\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\ud83d[\udc66\udc67]|\ud83d\udc6f\u200d\u2640\ufe0f|\ud83d\udc6f\u200d\u2642\ufe0f|\ud83e\udd3c\u200d\u2640\ufe0f|\ud83e\udd3c\u200d\u2642\ufe0f|\ud83e\uddde\u200d\u2640\ufe0f|\ud83e\uddde\u200d\u2642\ufe0f|\ud83e\udddf\u200d\u2640\ufe0f|\ud83e\udddf\u200d\u2642\ufe0f)|[#*0-9]\ufe0f?\u20e3|(?:[©®\u2122\u265f]\ufe0f)|(?:\ud83c[\udc04\udd70\udd71\udd7e\udd7f\ude02\ude1a\ude2f\ude37\udf21\udf24-\udf2c\udf36\udf7d\udf96\udf97\udf99-\udf9b\udf9e\udf9f\udfcd\udfce\udfd4-\udfdf\udff3\udff5\udff7]|\ud83d[\udc3f\udc41\udcfd\udd49\udd4a\udd6f\udd70\udd73\udd76-\udd79\udd87\udd8a-\udd8d\udda5\udda8\uddb1\uddb2\uddbc\uddc2-\uddc4\uddd1-\uddd3\udddc-\uddde\udde1\udde3\udde8\uddef\uddf3\uddfa\udecb\udecd-\udecf\udee0-\udee5\udee9\udef0\udef3]|[\u203c\u2049\u2139\u2194-\u2199\u21a9\u21aa\u231a\u231b\u2328\u23cf\u23ed-\u23ef\u23f1\u23f2\u23f8-\u23fa\u24c2\u25aa\u25ab\u25b6\u25c0\u25fb-\u25fe\u2600-\u2604\u260e\u2611\u2614\u2615\u2618\u2620\u2622\u2623\u2626\u262a\u262e\u262f\u2638-\u263a\u2640\u2642\u2648-\u2653\u2660\u2663\u2665\u2666\u2668\u267b\u267f\u2692-\u2697\u2699\u269b\u269c\u26a0\u26a1\u26aa\u26ab\u26b0\u26b1\u26bd\u26be\u26c4\u26c5\u26c8\u26cf\u26d1\u26d3\u26d4\u26e9\u26ea\u26f0-\u26f5\u26f8\u26fa\u26fd\u2702\u2708\u2709\u270f\u2712\u2714\u2716\u271d\u2721\u2733\u2734\u2744\u2747\u2757\u2763\u2764\u27a1\u2934\u2935\u2b05-\u2b07\u2b1b\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299])(?:\ufe0f|(?!\ufe0e))|(?:(?:\ud83c[\udfcb\udfcc]|\ud83d[\udd74\udd75\udd90]|[\u261d\u26f7\u26f9\u270c\u270d])(?:\ufe0f|(?!\ufe0e))|(?:\ud83c[\udf85\udfc2-\udfc4\udfc7\udfca]|\ud83d[\udc42\udc43\udc46-\udc50\udc66-\udc69\udc6e\udc70-\udc78\udc7c\udc81-\udc83\udc85-\udc87\udcaa\udd7a\udd95\udd96\ude45-\ude47\ude4b-\ude4f\udea3\udeb4-\udeb6\udec0\udecc]|\ud83e[\udd0f\udd18-\udd1c\udd1e\udd1f\udd26\udd30-\udd39\udd3d\udd3e\uddb5\uddb6\uddb8\uddb9\uddbb\uddcd-\uddcf\uddd1-\udddd]|[\u270a\u270b]))(?:\ud83c[\udffb-\udfff])?|(?:\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f|\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc73\udb40\udc63\udb40\udc74\udb40\udc7f|\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc77\udb40\udc6c\udb40\udc73\udb40\udc7f|\ud83c\udde6\ud83c[\udde8-\uddec\uddee\uddf1\uddf2\uddf4\uddf6-\uddfa\uddfc\uddfd\uddff]|\ud83c\udde7\ud83c[\udde6\udde7\udde9-\uddef\uddf1-\uddf4\uddf6-\uddf9\uddfb\uddfc\uddfe\uddff]|\ud83c\udde8\ud83c[\udde6\udde8\udde9\uddeb-\uddee\uddf0-\uddf5\uddf7\uddfa-\uddff]|\ud83c\udde9\ud83c[\uddea\uddec\uddef\uddf0\uddf2\uddf4\uddff]|\ud83c\uddea\ud83c[\udde6\udde8\uddea\uddec\udded\uddf7-\uddfa]|\ud83c\uddeb\ud83c[\uddee-\uddf0\uddf2\uddf4\uddf7]|\ud83c\uddec\ud83c[\udde6\udde7\udde9-\uddee\uddf1-\uddf3\uddf5-\uddfa\uddfc\uddfe]|\ud83c\udded\ud83c[\uddf0\uddf2\uddf3\uddf7\uddf9\uddfa]|\ud83c\uddee\ud83c[\udde8-\uddea\uddf1-\uddf4\uddf6-\uddf9]|\ud83c\uddef\ud83c[\uddea\uddf2\uddf4\uddf5]|\ud83c\uddf0\ud83c[\uddea\uddec-\uddee\uddf2\uddf3\uddf5\uddf7\uddfc\uddfe\uddff]|\ud83c\uddf1\ud83c[\udde6-\udde8\uddee\uddf0\uddf7-\uddfb\uddfe]|\ud83c\uddf2\ud83c[\udde6\udde8-\udded\uddf0-\uddff]|\ud83c\uddf3\ud83c[\udde6\udde8\uddea-\uddec\uddee\uddf1\uddf4\uddf5\uddf7\uddfa\uddff]|\ud83c\uddf4\ud83c\uddf2|\ud83c\uddf5\ud83c[\udde6\uddea-\udded\uddf0-\uddf3\uddf7-\uddf9\uddfc\uddfe]|\ud83c\uddf6\ud83c\udde6|\ud83c\uddf7\ud83c[\uddea\uddf4\uddf8\uddfa\uddfc]|\ud83c\uddf8\ud83c[\udde6-\uddea\uddec-\uddf4\uddf7-\uddf9\uddfb\uddfd-\uddff]|\ud83c\uddf9\ud83c[\udde6\udde8\udde9\uddeb-\udded\uddef-\uddf4\uddf7\uddf9\uddfb\uddfc\uddff]|\ud83c\uddfa\ud83c[\udde6\uddec\uddf2\uddf3\uddf8\uddfe\uddff]|\ud83c\uddfb\ud83c[\udde6\udde8\uddea\uddec\uddee\uddf3\uddfa]|\ud83c\uddfc\ud83c[\uddeb\uddf8]|\ud83c\uddfd\ud83c\uddf0|\ud83c\uddfe\ud83c[\uddea\uddf9]|\ud83c\uddff\ud83c[\udde6\uddf2\uddfc]|\ud83c[\udccf\udd8e\udd91-\udd9a\udde6-\uddff\ude01\ude32-\ude36\ude38-\ude3a\ude50\ude51\udf00-\udf20\udf2d-\udf35\udf37-\udf7c\udf7e-\udf84\udf86-\udf93\udfa0-\udfc1\udfc5\udfc6\udfc8\udfc9\udfcf-\udfd3\udfe0-\udff0\udff4\udff8-\udfff]|\ud83d[\udc00-\udc3e\udc40\udc44\udc45\udc51-\udc65\udc6a-\udc6d\udc6f\udc79-\udc7b\udc7d-\udc80\udc84\udc88-\udca9\udcab-\udcfc\udcff-\udd3d\udd4b-\udd4e\udd50-\udd67\udda4\uddfb-\ude44\ude48-\ude4a\ude80-\udea2\udea4-\udeb3\udeb7-\udebf\udec1-\udec5\uded0-\uded2\uded5\udeeb\udeec\udef4-\udefa\udfe0-\udfeb]|\ud83e[\udd0d\udd0e\udd10-\udd17\udd1d\udd20-\udd25\udd27-\udd2f\udd3a\udd3c\udd3f-\udd45\udd47-\udd71\udd73-\udd76\udd7a-\udda2\udda5-\uddaa\uddae-\uddb4\uddb7\uddba\uddbc-\uddca\uddd0\uddde-\uddff\ude70-\ude73\ude78-\ude7a\ude80-\ude82\ude90-\ude95]|[\u23e9-\u23ec\u23f0\u23f3\u267e\u26ce\u2705\u2728\u274c\u274e\u2753-\u2755\u2795-\u2797\u27b0\u27bf\ue50a])|\ufe0f/g,
	userFlagEmojis:
	/**
	 * @param {Discord.User} user
	 * @returns {Array<string>}
	 */
	function userFlagEmojis(user) {
		const flags = user.flags; // All of these emojis are from Papi's Dev House.
		const arr = []; // The emojis are pushed to the array in order of which they'd appear in Discord.
		if (!flags) return arr;
		if (flags.has("DISCORD_EMPLOYEE")) arr.push("<:staff:433155028895793172>");
		if (flags.has("DISCORD_PARTNER")) arr.push("<:partner:421802275326001152>");
		if (flags.has("HYPESQUAD_EVENTS")) arr.push("<:HypesquadEvents:719628242449072260>");
		if (flags.has("HOUSE_BALANCE")) arr.push("<:balance:479939338696654849>");
		if (flags.has("HOUSE_BRAVERY")) arr.push("<:bravery:479939311593324557>");
		if (flags.has("HOUSE_BRILLIANCE")) arr.push("<:brilliance:479939329104412672>");
		if (flags.has("VERIFIED_DEVELOPER")) arr.push("<:VerifiedDeveloper:699408396591300618>");
		if (flags.has("BUGHUNTER_LEVEL_2")) arr.push("<:BugCatcherlvl2:678721839488434203>");
		if (flags.has("BUGHUNTER_LEVEL_1") && !flags.has("BUGHUNTER_LEVEL_2")) arr.push("<:BugCatcher:434087337488678921>");
		if (flags.has("EARLY_SUPPORTER")) arr.push("<:EarlySupporter:585638218255564800>");
		return arr;
	}
};

module.exports = utils;
