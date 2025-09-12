import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const COOLDOWN_TIME = 600_000; // 10 minutes
const globalCooldowns = new Map();

const WIDTH = 1280;
const HEIGHT = 720;
const ZOOM = 5;

const permissions = 2048; // Send Messages
const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=${permissions}&scope=bot`;


function formatSecondsToHHMMSS(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function generateMap({ lat, lng }) {
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+ff0000(${lng},${lat})/${lng},${lat},${ZOOM}/${WIDTH}x${HEIGHT}?access_token=${process.env.MAPBOX_TOKEN}`;
}

function buildCoriolixTimestamp() {
  const timestamp = new Date(Date.now() - 5000).toISOString()
  return timestamp
}

async function getCoriolixLatest(url) {
  let attempts = 0;
  let latest = null;

  while (attempts < 3) {
    attempts++;
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0 && data[0]?.point?.coordinates) {
        latest = data[0];
        break;
      }
    } catch (err) {
      console.error(`Attempt ${attempts} failed:`, err.message);
    }
    if (attempts < 3) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return latest
}

// Ship data fetchers
const shipHandlers = {
  falkor: {
    symbol: '🐉',
    vessel: 'R/V Falkor (too)',
    handler: async () => {
      const url =
        'https://soi-vessel-tracker-default-rtdb.firebaseio.com/FKt5/users.json?orderBy="$key"&limitToLast=1';
      const res = await fetch(url);
      const data = await res.json();
      const latest = data[Object.keys(data)[0]].FKt_5min_location;

      return {
        symbol: '🐉',
        vessel: 'R/V Falkor (too)',
        lat: latest.latitude.toFixed(6),
        lng: latest.longitude.toFixed(6),
        timestamp: latest.influxtime,
      };
    },
  },

  okeanos: {
    vessel: "NOAA Ship Okeanos Explorer",
    symbol: "🌀",
    handler: async () => {
      const url =
        "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/Okeanos_Explorer_Position/FeatureServer/0/query?where=1%3D1&f=pgeojson";
      const res = await fetch(url);
      const data = await res.json();
      const latest = data.features[0];

      return {
        symbol: "🌀",
        vessel: "NOAA Ship Okeanos Explorer",
        lat: latest.geometry.coordinates[1].toFixed(6),
        lng: latest.geometry.coordinates[0].toFixed(6),
        timestamp: new Date().toISOString(),
      };
    },
  },

  nautilus: {
    vessel: "E/V Nautilus",
    symbol: "🧭",
    handler: async () => {
      const url =
        "https://maps.ccom.unh.edu/server/rest/services/Hosted/vehicle_positions_view_only/FeatureServer/0/query?where=1=1&f=geojson";
      const res = await fetch(url);
      const data = await res.json();
      const latest = data.features[4];

      return {
        symbol: "🧭",
        vessel: "E/V Nautilus",
        lat: latest.geometry.coordinates[1].toFixed(6),
        lng: latest.geometry.coordinates[0].toFixed(6),
        timestamp: new Date().toISOString(),
      };
    },
  },

  sikuliaq: {
    vessel: "R/V Sikuliaq",
    symbol: "⛴",
    handler: async () => {
      const timestamp = buildCoriolixTimestamp();
      const url = `https://coriolix.sikuliaq.alaska.edu/api/gnss_gga_bow/?format=json&date_after=${encodeURIComponent(timestamp)}`;

      const latest = await getCoriolixLatest(url)

      if (!latest) {
        throw new Error("Failed to fetch valid data after 3 attempts.");
      }

      return {
        symbol: "⛴",
        vessel: "R/V Sikuliaq",
        lat: latest.point.coordinates[1].toFixed(6),
        lng: latest.point.coordinates[0].toFixed(6),
        timestamp: new Date().toISOString(),
      };
    },
  },

  endeavor: {
    vessel: "R/V Endeavor",
    symbol: "⛴",
    handler: async () => {
      const timestamp = buildCoriolixTimestamp();
      const url = `https://coriolix.ceoas.oregonstate.edu/endeavor/api/gnss_gga_bow/?format=json&date_after=${encodeURIComponent(timestamp)}`;

      const latest = await getCoriolixLatest(url)

      if (!latest) {
        throw new Error("Failed to fetch valid data after 3 attempts.");
      }

      return {
        symbol: "⛴",
        vessel: "R/V Endeavor",
        lat: latest.point.coordinates[1].toFixed(6),
        lng: latest.point.coordinates[0].toFixed(6),
        timestamp: new Date().toISOString(),
      };
    },
  },

  savannah: {
    vessel: "R/V Savannah",
    symbol: "⛴",
    handler: async () => {
      const timestamp = buildCoriolixTimestamp();
      const url = `https://coriolix.savannah.skio.uga.edu/api/gnss_gga_bow/?format=json&date_after=${encodeURIComponent(timestamp)}`;

      const latest = await getCoriolixLatest(url)

      if (!latest) {
        throw new Error("Failed to fetch valid data after 3 attempts.");
      }

      return {
        symbol: "⛴",
        vessel: "R/V Savannah",
        lat: latest.point.coordinates[1].toFixed(6),
        lng: latest.point.coordinates[0].toFixed(6),
        timestamp: new Date().toISOString(),
      };
    },
  },

}

const validCommands = new Set(['!everyship', '!help', ...Object.keys(shipHandlers).map(k => `!${k}`)]);

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const command = message.content.toLowerCase();
  if (!validCommands.has(command)) return;

  if (command === '!help') {
    const shipCommands = [...Object.keys(shipHandlers).map(k => `!${k}`)].join(', ');
    return message.reply(
      `🛠️ **Available Commands:**\n` +
      `- !help — Show this list\n` +
      `- !everyship — Show all ship positions\n` +
      `- ${shipCommands} — Individual ship positions`
    );
  }

  const now = Date.now();
  if (globalCooldowns.has(command)) {
    const expires = globalCooldowns.get(command) + COOLDOWN_TIME;
    if (now < expires) {
      const timeLeft = ((expires - now) / 1000);
      return message.reply(`⏳ Please wait ${formatSecondsToHHMMSS(timeLeft)} before using "${command}" again.`);
    }
  }
  globalCooldowns.set(command, now);

  const ships =
    command === "!everyship"
      ? Object.keys(shipHandlers)
      : [command.slice(1)]; // removes '!' prefix

  for (const ship of ships) {
    const { vessel, handler } = shipHandlers[ship] ?? {};
    if (!handler) {
      await message.channel.send(`⚠️ Unknown ship: ${ship}`);
      continue;
    }

    try {
      const position = await handler();
      const mapUrl = await generateMap(position);

      const embed = new EmbedBuilder()
        .setTitle(`${position.symbol} ${position.vessel} Position`)
        .setDescription(`**Lat:** ${position.lat}\n**Lng:** ${position.lng}`)
        .setImage(mapUrl)
        .setFooter({
          text: `Last updated: ${new Date(position.timestamp).toLocaleString()}`,
        });

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await message.channel.send(`⚠️ Failed to fetch position for ${vessel ?? ship}.`);
    }
  }
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🔗 Invite the bot to your server:\n${inviteUrl}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);

// ---- Graceful shutdown handlers ----
process.on('SIGINT', async () => {
  console.log('Caught SIGINT, shutting down...');
  await client.destroy();
});

process.on('SIGTERM', async () => {
  console.log('Caught SIGTERM, shutting down...');
  await client.destroy();
});
