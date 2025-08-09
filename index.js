// index.js
import express from 'express';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import fetch from 'node-fetch'; // Falls node-fetch in Render nicht v17+ unterstützt, einfach normal import

const app = express();
const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.CLIENT_ID;      // Discord App Client ID
const CLIENT_SECRET = process.env.CLIENT_SECRET;  // Discord App Client Secret
const BOT_TOKEN = process.env.BOT_TOKEN;      // Discord Bot Token
const GUILD_ID = process.env.GUILD_ID;        // Deine Server-ID
const ROLE_ID = process.env.ROLE_ID;          // Rolle, die der User nach Verif bekommt

if (!CLIENT_ID || !CLIENT_SECRET || !BOT_TOKEN || !GUILD_ID || !ROLE_ID) {
  console.error("⚠️ Bitte alle Env-Variablen setzen: CLIENT_ID, CLIENT_SECRET, BOT_TOKEN, GUILD_ID, ROLE_ID");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.login(BOT_TOKEN);

// Express: OAuth2 Callback Endpoint
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    // Token Request
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', `https://${req.headers.host}/oauth/callback`);
    params.append('scope', 'identify guilds');

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      console.error("Token Error:", tokenData);
      return res.status(400).send('Failed to get access token');
    }

    // User Info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userResponse.json();

    // Check if user is in the guild
    const member = await client.guilds.cache.get(GUILD_ID)?.members.fetch(userData.id).catch(() => null);
    if (!member) {
      return res.status(403).send("You must be a member of the server to verify.");
    }

    // Add role
    await member.roles.add(ROLE_ID);

    // Respond Webseite
    res.send(`
      <h1>You are verified!</h1>
      <p>You can close this page now.</p>
    `);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Slash Command Registrierung (optional, wenn du Commands brauchst)
const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      {
        body: [
          {
            name: 'verify',
            description: 'Shows verification instructions',
          }
        ],
      },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// Einfacher Command-Handler für /verify (optional)
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  if (interaction.commandName === 'verify') {
    await interaction.reply({
      content: `To verify, please click this link and login:\n\n` +
        `https://${process.env.DOMAIN}/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=https%3A%2F%2F${process.env.DOMAIN}%2Foauth%2Fcallback&response_type=code&scope=identify%20guilds`,
      ephemeral: true,
    });
  }
});

// OAuth2 Authorize Link - Du musst in deinem Discord Application Dashboard
// Redirect URI als https://your-domain/oauth/callback eintragen!
// Und im .env oder Render env folgende Variablen anlegen:
// BOT_TOKEN=xxx
// CLIENT_ID=xxx
// CLIENT_SECRET=xxx
// GUILD_ID=xxx
// ROLE_ID=xxx
// DOMAIN=deinedomain.tld

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
