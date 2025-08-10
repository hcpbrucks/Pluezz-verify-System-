import express from 'express';
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from 'discord.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  GUILD_ID,
  ROLE_ID,
  ADMIN_PASSWORD,
  PORT = 10000,
} = process.env;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Discord Client Setup
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.login(DISCORD_TOKEN);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Slash Command Registrierung
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      {
        body: [
          {
            name: 'verify',
            description: 'Get your verification link',
          },
        ],
      }
    );
    console.log('Slash command registered.');
  } catch (error) {
    console.error(error);
  }
})();

// In-Memory verifizierte User speichern (für Demo)
const verifiedUsers = new Set();

// Discord Interaction Handler
app.post('/interactions', async (req, res) => {
  const interaction = req.body;

  if (interaction.type === 1) { // PING
    return res.json({ type: 1 });
  }

  if (interaction.type === 2) { // Application Command
    if (interaction.data.name === 'verify') {
      // Antwort mit Embed und Link zur Verifizierung
      const verifyUrl = `https://${process.env.RENDER_INTERNAL_HOSTNAME || 'your-render-url'}/oauth/verify?user_id=${interaction.member.user.id}`;

      const embed = new EmbedBuilder()
        .setTitle('Verify Yourself')
        .setDescription(`Click the button below to verify and get access to the server!`)
        .setColor('Blue')
        .setImage('https://i.imgur.com/AfFp7pu.png'); // Beispielbild

      return res.json({
        type: 4,
        data: {
          embeds: [embed.toJSON()],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: 'Verify Here',
                  url: verifyUrl,
                },
              ],
            },
          ],
        },
      });
    }
  }

  res.sendStatus(404);
});

// OAuth2 Route (Discord Login)
app.get('/oauth/verify', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.send('Invalid request');

  // Hier zeigen wir einfach die OAuth2-URL zum Login an
  // oder redirecten direkt
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.join',
    state: userId,
    prompt: 'consent',
  });

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

  res.redirect(discordAuthUrl);
});

// OAuth2 Callback (Discord sendet Code)
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const stateUserId = req.query.state; // unsere user_id

  if (!code) return res.send('No code provided');

  // Token holen
  const data = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    scope: 'identify guilds.join',
  });

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.send(`Error getting token: ${tokenData.error_description}`);
    }

    // Nutzerinfos holen
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    // Rolle zum Server hinzufügen (guilds.join scope)
    await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: tokenData.access_token,
        roles: [ROLE_ID],
      }),
    });

    // Als verifiziert speichern (in-memory)
    verifiedUsers.add(userData.username);

    // Erfolgsseite
    res.send(`
      <h1>You are verified!</h1>
      <p>You can close this page now.</p>
    `);
  } catch (error) {
    console.error(error);
    res.send('Error during verification process.');
  }
});

// Admin Bereich (passwortgeschützt)
app.get('/admin', (req, res) => {
  res.send(`
    <h1>Admin Login</h1>
    <form method="POST" action="/admin/login">
      <input name="password" type="password" placeholder="Password" />
      <button type="submit">Login</button>
    </form>
  `);
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.redirect('/admin/dashboard');
  } else {
    res.send('Wrong password');
  }
});

app.get('/admin/dashboard', (req, res) => {
  // Einfach Liste der verifizierten User anzeigen
  res.send(`
    <h1>Admin Dashboard</h1>
    <h2>Verified Users</h2>
    <ul>
      ${[...verifiedUsers].map(u => `<li>${u}</li>`).join('')}
    </ul>
  `);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
