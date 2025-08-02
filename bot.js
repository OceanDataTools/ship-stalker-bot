const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

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

const validCommands = new Set(['!everyship', ...Object.keys(shipHandlers).map(k => `!${k}`)]);

function formatSecondsToHHMMSS(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function generateMap({ lat, lng }) {
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+ff0000(${lng},${lat})/${lng},${lat},${ZOOM}/${WIDTH}x${HEIGHT}?access_token=${process.env.MAPBOX_TOKEN}`;
}

// Ship data fetchers
const shipHandlers = {
  falkor: async () => {
    const url = 'https://soi-vessel-tracker-default-rtdb.firebaseio.com/FKt5/users.json?orderBy="$key"&limitToLast=1';
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

  okeanos: async () => {
    const url = 'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/Okeanos_Explorer_Position/FeatureServer/0/query?where=1%3D1&f=pgeojson';
    const res = await fetch(url);
    const data = await res.json();
    const latest = data.features[0];

    return {
      symbol: '🌀',
      vessel: 'NOAA Ship Okeanos Explorer',
      lat: latest.geometry.coordinates[1].toFixed(6),
      lng: latest.geometry.coordinates[0].toFixed(6),
      timestamp: new Date().toISOString(),
    };
  },

  nautilus: async () => {
    const url = 'https://maps.ccom.unh.edu/server/rest/services/Hosted/vehicle_positions_view_only/FeatureServer/0/query?where=1=1&f=geojson';
    const res = await fetch(url);
    const data = await res.json();
    const latest = data.features[4];

    return {
      symbol: '🧭',
      vessel: 'E/V Nautilus',
      lat: latest.geometry.coordinates[1].toFixed(6),
      lng: latest.geometry.coordinates[0].toFixed(6),
      timestamp: new Date().toISOString(),
    };
  },
};

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const command = message.content.toLowerCase();
  if (!validCommands.has(command)) return;

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
  command === '!everyship'
    ? Object.keys(shipHandlers)
    : [command.slice(1)]; // removes '!' prefix

  for (const ship of ships) {
    try {
      const position = await shipHandlers[ship]();
      const mapUrl = await generateMap(position);

      const embed = new EmbedBuilder()
        .setTitle(`${position.symbol} ${position.vessel} Position`)
        .setDescription(`**Lat:** ${position.lat}\n**Lng:** ${position.lng}`)
        .setImage(mapUrl)
        .setFooter({ text: `Last updated: ${new Date(position.timestamp).toLocaleString()}` });

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await message.channel.send(`⚠️ Failed to fetch position for ${shipHandlers[ship]?.().vessel ?? ship}.`);
    }
  }
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
