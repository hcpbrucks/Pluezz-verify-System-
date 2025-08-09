import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits } from 'discord.js';

const app = express();

const CLIENT_ID = 'DEINE_CLIENT_ID'; // Discord App Client ID
const CLIENT_SECRET = 'DEIN_CLIENT_SECRET'; // Discord App Client Secret
const BOT_TOKEN = 'DEIN_BOT_TOKEN'; // Bot Token
const GUILD_ID = 'DEINE_GUILD_ID'; // Server ID, wo User hinzugefügt werden
const ROLE_ID = '1381289341279670342'; // Rolle, die vergeben wird

const REDIRECT_URI = 'https://pluezz-verify-system.onrender.com/oauth/callback'; // URL der Callback-Route (muss im Discord Dev Portal eingetragen sein)

// Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.login(BOT_TOKEN);

client.on('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// OAuth Startseite
app.get('/', (req, res) => {
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;
  res.send(`<h2>Discord Verify</h2><a href="${discordAuthUrl}">Login with Discord to Verify</a>`);
});

// OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    // 1. Code gegen Token tauschen
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('scope', 'identify guilds.join');

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(400).send('Failed to get access token');
    }

    const accessToken = tokenData.access_token;

    // 2. User Daten holen
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const user = await userResponse.json();

    // 3. User zum Server hinzufügen
    const guild = await client.guilds.fetch(GUILD_ID);
    // Discord.js Methode um User hinzuzufügen (funktioniert nur mit guilds.join scope)
    await guild.members.add(user.id, { accessToken });

    // 4. Rolle vergeben
    const member = await guild.members.fetch(user.id);
    await member.roles.add(ROLE_ID);

    // 5. Erfolgseite
    res.send(`<h1>You are verified! You can close this page now.</h1>`);

  } catch (error) {
    console.error(error);
    res.status(500).send('Verification failed.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
