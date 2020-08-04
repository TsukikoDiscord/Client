mod commands;

use std::{
	collections::HashSet,
	env,
	sync::Arc
};
use serenity::{
	client::bridge::gateway::ShardManager,
	framework::{
		StandardFramework,
		standard::macros::group
	},
	model::{event::ResumedEvent, gateway::Ready},
	prelude::*
};
use log::{error, info};

use commands::{
	admin::*
};
struct ShardManagerContainer;

impl TypeMapKey for ShardManagerContainer {
	type Value = Arc<Mutex<ShardManager>>;
}

struct Handler;

impl EventHandler for Handler {
	fn ready(&self, _: Context, client: Ready) {
		info!("Successfully logged in as {}", client.user.name);
	}

	fn resume(&self, _: Context, _: ResumedEvent) {
		info!("Resumed");
	}
}

#[group]
#[commands(quit)]
struct General;

fn main() {
	kankyo::load().expect("Failed to load environment variables");

	env_logger::init();

	let token = env::var("token")
		.expect("No token in the environment variables");

	let mut client = Client::new(&token, Handler).expect("Error constructing client");

	{
		let mut data = client.data.write();
		data.insert::<ShardManagerContainer>(Arc::clone(&client.shard_manager));
	}

	let owners = match client.cache_and_http.http.get_current_application_info() {
		Ok(info) => {
			let mut set = HashSet::new();
			set.insert(info.owner.id);


			set
		},
		Err(why) => panic!("Couldn't get application info: {:?}", why)
	};

	client.with_framework(StandardFramework::new()
		.configure(|c| c
			.owners(owners)
			.prefix("$"))
		.group(&GENERAL_GROUP));

	if let Err(why) = client.start() {
		error!("Client error: {:?}", why);
	}
}
