// @ts-check

const passthrough = require("../passthrough.js");
const { config, client, sync, commands } = passthrough;

/**
 * @type {import("../sub_modules/utilities")}
 */
const utils = sync.require("../sub_modules/utilities.js");

const updateTime = 5 * 60 * 1000;
let starting = true;
if (client.readyAt != null) starting = false;

const messages = [
	{ id: 1, dates: null, users: "classic", message: "with roles", type: 0, demote: 1 },
	{ id: 2, dates: null, users: "classic", message: "in a box", type: 0, demote: 1 },
	{ id: 3, dates: null, users: "classic", message: "people join", type: 3, demote: 1 }
];
const ranges = [
	{ label: "4july", startmonth: 7, startday: 4, endmonth: 7, endday: 4 },
	{ label: "christmasday", startmonth: 12, startday: 25, endmonth: 12, endday: 25 },
	{ label: "halloween", startmonth: 10, startday: null, endmonth: 10, endday: null },
	{ label: "thanksgiving", startmonth: 11, startday: 22, endmonth: 11, endday: 22 },
	{ label: "papibday", startmonth: 1, startday: 16, endmonth: 1, endday: 16 }
];
const users = [
	{ label: "classic", userID: "709907646387322932" },
	{ label: "prod", userID: "709907646387322932" }
];
let updateInterval, enqueued;

/**
 * @param {number} duration
 * @param {string} message
 */
function startAnnouncement(duration, message) {
	clearInterval(updateInterval);
	client.user.setActivity(message, { type: "PLAYING" });
	enqueued = setTimeout(() => {
		update();
		updateInterval = setInterval(() => update(), updateTime);
	}, duration);
}

commands.assign([
	{
		usage: "<duration: number (ms)> <message>",
		description: "Make an announcement with the client activity",
		category: "admin",
		aliases: ["announce"],
		examples: ["^announce 60000 sub to papiophidian on twitch | ^help"],
		process(msg, suffix) {
			const allowed = config.owners.includes(msg.author.id);
			if (!allowed) return;
			if (enqueued) {
				clearTimeout(enqueued);
				enqueued = undefined;
			}
			const args = suffix.split(" ");
			if (!args[0]) return msg.channel.send("You need to provide a duration in ms and a message to announce");
			const dur = args[0];
			const duration = Number(dur);
			if (isNaN(duration) || duration === 0) return msg.channel.send("That's not a valid duration");
			if (!args[1]) return msg.channel.send("You need to provide a message to announce");
			const message = suffix.substring(args[0].length + 1);
			startAnnouncement(duration, message);
		}
	}
]);

client.once("ready", () => {
	const firstStart = starting;
	starting = false;
	if (firstStart) {
		update();
		updateInterval = setInterval(() => update(), updateTime);
	}
});

/** @return {Array<string>} */
function getCurrentGroups() {
	return users.filter(o => o.userID == client.user.id).map(o => o.label);
}

function getCurrentRanges() {
	const date = new Date();
	const currentMonth = date.getMonth() + 1;
	const currentDate = date.getDate();
	return ranges.filter(range => {
		// Four types of matching:
		// 1. If months specified and dates specified, convert DB data to timestamp and compare
		// 2. If months specified and dates not, check month within range
		// 3. If dates specified and months not, check dates within range
		// 4. If nothing specified, date is always within range.
		const monthSpecified = !(range.startmonth == null || range.endmonth == null);
		const dateSpecified = !(range.startday == null || range.endday == null);
		if (monthSpecified && dateSpecified) {
			// Case 1
			const startDate = new Date();
			startDate.setHours(0, 0, 0);
			startDate.setMonth(range.startmonth - 1, range.startday);
			const endDate = new Date();
			endDate.setHours(0, 0, 0);
			endDate.setMonth(range.endmonth - 1, range.endday);
			if (endDate < startDate) endDate.setFullYear(startDate.getFullYear() + 1);
			endDate.setTime(endDate.getTime() + 1000 * 60 * 60 * 24);
			return startDate <= date && endDate > date;
		} else if (monthSpecified) {
			// Case 2
			return range.startmonth <= currentMonth && range.endmonth >= currentMonth;
		} else if (dateSpecified) {
			// Case 3
			return range.startday <= currentDate && range.endday >= currentDate;
		} else {
			// Case 4
			return true;
		}
	}).map(range => range.label);
}

function getMatchingMessages() {
	const currentRanges = getCurrentRanges();
	const groupsBotIsIn = getCurrentGroups();
	const regional = [];
	let constant = [];
	messages.forEach(message => {
		if (message.dates && !currentRanges.includes(message.dates)) return false; // criteria exists and didn't match
		if (message.users && !groupsBotIsIn.includes(message.users)) return false; // criteria exists and didn't match
		if (message.dates) regional.push(message); // this is regional, it already matched, so it gets priority
		if (!message.dates) constant.push(message); // this isn't regional, so it doesn't get priority
	});
	if (regional.length) constant = constant.filter(message => message.demote == 0); // if regional statuses are available, filter out demotable non-regional. (demote has no effect on regional)
	return regional.concat(constant);
}

function update() {
	const choices = getMatchingMessages();
	const choice = utils.arrayRandom(choices);
	if (choice) client.user.setActivity(`${choice.message} | ${config.prefixes[0]}help`, { type: choice.type, url: "https://www.twitch.tv/papiophidian/" });
	else console.error("Warning: no status messages available!");
}
