// bot.js

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const globalCooldowns = new Map();
const COOLDOWN_TIME = 600 * 1000; // 5 minute cooldown

const WIDTH = 1280;
const HEIGHT = 720;
const ZOOM = 5;

function formatSecondsToHHMMSS(seconds) {
  // const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  // const paddedHrs = hrs.toString().padStart(2, '0');
  const paddedMins = mins.toString().padStart(2, '0');
  const paddedSecs = secs.toString().padStart(2, '0');

  // return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
  return `${paddedMins}:${paddedSecs}`;
}


async function getLatestPosition(ship) {

  async function _falkorPosition() {
    const url = 'https://soi-vessel-tracker-default-rtdb.firebaseio.com/FKt5/users.json?orderBy="$key"&limitToLast=1';
    const res = await fetch(url);
    const data = await res.json();

    const latestKey = Object.keys(data)[0];
    const latest = data[latestKey];
    console.log("latest :", latest)

    return {
      symbol: '🐉',
      vessel: 'R/V Falkor (too)',
      lat: latest.FKt_5min_location.latitude.toFixed(6),
      lng: latest.FKt_5min_location.longitude.toFixed(6),
      // spd: latest.FKt_5min_location.speed,
      timestamp: latest.FKt_5min_location.influxtime,
    };
  }

  async function _nautilusLatestPosition() {
    //const url = 'https://maps.ccom.unh.edu/server/rest/services/Hosted/Nautilus_position/MapServer/0/query?where=1=1&f=json'
    const url = 'https://maps.ccom.unh.edu/server/rest/services/Hosted/vehicle_positions_view_only/FeatureServer/0/query?where=1=1&f=geojson'
    const res = await fetch(url);
    const data = await res.json();

    let latest = data['features'][4];
    let latestTime = new Date().toISOString();

    // for (const f of data['features']) {
    //   if (!f) continue;

    //   const ts = f.attributes?.timestamp;
    //   const x = f.geometry?.x;
    //   const y = f.geometry?.y;

      // Check geometry is valid
    //   if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      // Check timestamp is valid ISO8601
    //   const parsed = new Date(ts);
    //   if (!ts || isNaN(parsed)) continue;

      // First valid feature or newer than current latest
    //   if (!latestTime || parsed > latestTime) {
    //     latest = f;
    //     latestTime = parsed;
    //   }
    // }

    // if (!latest) {
    //   throw new Error('No valid feature with geometry and timestamp.');
    // }

    return {
      symbol: '🧭',
      vessel: 'E/V Nautilus',
      lat: latest.geometry.coordinates[1].toFixed(6),
      lng: latest.geometry.coordinates[0].toFixed(6),
      timestamp: latestTime
    };
  }

  if (ship == 'falkor'){
    return await _falkorPosition()
  }

  if (ship == 'nautilus'){
    return await _nautilusLatestPosition()
  }

  return null
}

async function generateMap({ lat, lng }) {
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+ff0000(${lng},${lat})/${lng},${lat},${ZOOM}/${WIDTH}x${HEIGHT}?access_token=${process.env.MAPBOX_TOKEN}`;

}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const command = message.content.toLowerCase();
  if (command !== '!falkor' && command !== '!nautilus' && command !== '!everyship') return;

  let positions = []

  const now = Date.now();

  // Check global cooldown for this command
  if (globalCooldowns.has(command)) {
    const expirationTime = globalCooldowns.get(command) + COOLDOWN_TIME;
    if (now < expirationTime) {
      const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
      return message.reply(`⏳ Please wait ${formatSecondsToHHMMSS(timeLeft)} before using "${command}" again.`);
    }
  }

  // Set the new cooldown time for this command
  globalCooldowns.set(command, now);

  if (message.content === '!falkor' || message.content === '!everyship') {
    try {
        positions.push(await getLatestPosition('falkor'));
    } catch (err) {
      console.error(err);
      await message.channel.send('⚠️ Failed to fetch position for R/V Falkor (too).');
    }    
  }

  if (message.content === '!nautilus' || message.content === '!everyship') {
    try {
      positions.push(await getLatestPosition('nautilus'));
    } catch (err) {
      console.error(err);
      await message.channel.send('⚠️ Failed to fetch position for E/V Nautilus.');
    }
  }

  for (const position of positions) {
    try {
      const mapUrl = await generateMap(position);

      const embed = new EmbedBuilder()
        .setTitle(`${position.symbol} ${position.vessel} Position`)
        .setDescription(`**Lat:** ${position.lat}\n**Lng:** ${position.lng}`)
        .setImage(mapUrl)
        .setFooter({ text: `Last updated: ${new Date(position.timestamp).toLocaleString()}` });

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await message.channel.send('⚠️ Failed to render ship position.');
    }
  }  

});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
