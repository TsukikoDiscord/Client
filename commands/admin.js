// @ts-check

const Discord = require("discord.js");
const util = require("util");
const path = require("path");
const ReactionMenu = require("@amanda/reactionmenu");

const passthrough = require("../passthrough");
const { config, client, commands, sql, sync } = passthrough;

/**
 * @type {import("../sub_modules/utilities")}
 */
const utils = sync.require("../sub_modules/utilities.js");

const ArgumentAnalyser = require("@amanda/arganalyser");

commands.assign([
	{
		usage: "<code>",
		description: "Executes arbitrary JavaScript in the bot process. Requires bot owner permissions",
		aliases: ["evaluate", "eval"],
		category: "admin",
		examples: ["^eval client.token"],
		async process(msg, suffix) {
			const allowed = config.owners.includes(msg.author.id);
			if (allowed) {
				if (!suffix) return msg.channel.send("No input");
				let result, depth;
				depth = suffix.split("--depth:")[1];
				if (depth) depth = depth.substring(0).split(" ")[0];
				if (!depth) depth = 0;
				else {
					depth = Math.floor(Number(depth));
					if (isNaN(depth)) depth = 0;
					suffix = suffix.replace(`--depth:${suffix.split("--depth:")[1].substring(0).split(" ")[0]}`, "");
				}
				try {
					result = eval(suffix.replace(/client.token/g, `"${config.fake_token}"`));
				} catch (e) {
					result = e;
				}
				const output = await utils.stringify(result, depth);
				const nmsg = await msg.channel.send(output.replace(new RegExp(client.token, "g"), config.fake_token));
				const menu = new ReactionMenu(nmsg, [{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
				return setTimeout(() => menu.destroy(true), 5 * 60 * 1000);
			} else return;
		}
	},
	{
		usage: "<code>",
		description: "Executes a shell operation",
		aliases: ["execute", "exec"],
		category: "admin",
		examples: ["^exec rm -rf /"],
		async process(msg, suffix) {
			const allowed = await config.owners.includes(msg.author.id);
			if (!allowed) return;
			if (!suffix) return msg.channel.send("No input");
			// @ts-ignore
			await msg.channel.sendTyping();
			require("child_process").exec(suffix, async (error, stdout, stderr) => {
				const result = new Discord.MessageEmbed();
				if (error) {
					result.setTitle(`Command exited with status code ${error.code}`);
					result.setColor(0xdd2d2d);
				} else {
					result.setTitle("Command exited with status code 0 (success)");
					result.setColor(0x2ddd2d);
				}
				function formatOutput(out) {
					if (typeof out !== "string") out = "";
					out = out.replace(/\x1B\[[0-9;]*[JKmsu]/g, "");
					if (out.length > 1000) out = `${out.slice(0, 999)}…`;
					return out;
				}
				if (stdout) result.addFields({ name: "stdout:", value: formatOutput(stdout) });
				if (stderr) result.addFields({ name: "stderr:", value: formatOutput(stderr) });
				if (!stdout && !stderr) result.setDescription("No output.");
				// @ts-ignore
				const nmsg = await msg.channel.send(utils.contentify(msg.channel, result));
				const menu = new ReactionMenu(nmsg, [{ emoji: "🗑", allowedUsers: [msg.author.id], remove: "message" }]);
				return setTimeout(() => menu.destroy(true), 5 * 60 * 1000);
			});
			return;
		}
	}
]);
