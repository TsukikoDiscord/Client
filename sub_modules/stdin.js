// @ts-check

const Discord = require("discord.js");
const path = require("path");
const repl = require("repl");
const util = require("util");
const vm = require("vm");

const passthrough = require("../passthrough");
const { config, client, commands, sql, reloader, reloadEvent } = passthrough;

const utils = require("./utilities.js");
reloader.sync("./sub_modules/utilities.js", utils);

let starting = true;
if (client.readyAt != null) starting = false;

/**
 * @param {string} input
 * @param {vm.Context} context
 * @param {string} filename
 * @param {(err: Error|null, result: any) => any} callback
 */
async function customEval(input, context, filename, callback) {
	let depth = 0;
	if (input == "exit\n") return process.exit();
	if (input.startsWith(":")) {
		const depthOverwrite = input.split(" ")[0];
		depth = +depthOverwrite.slice(1);
		input = input.slice(depthOverwrite.length + 1);
	}
	const result = await eval(input);
	const output = util.inspect(result, false, depth, true);
	return callback(undefined, output);
}

reloadEvent.once(path.basename(__filename), () => {
	console.log("stdin.js does not auto-reload.");
});

client.once("ready", () => {
	const firstStart = starting;
	starting = false;
	if (firstStart) {
		const cli = repl.start({ prompt: "> ", eval: customEval, writer: s => s });

		Object.assign(cli.context, passthrough, { Discord });

		cli.once("exit", () => {
			if (client.shard) client.shard.killAll();
			else process.exit();
		});
	}
});
