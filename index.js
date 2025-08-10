import express from 'express';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import axios from 'axios';

const {
  CLIENT_ID,
  CLIENT_SECRET,
  BOT_TOKEN,
  GUILD_ID,
  ROLE_ID,
  REDIRECT_URI,
  ADMIN_PASSWORD,
} = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !BOT_TOKEN || !GUILD_ID || !ROLE_ID || !REDIRECT_URI || !ADMIN_PASSWORD) {
  console.error('ERROR: Bitte alle Umgebungsvariablen setzen!');
  process.exit(1);
}

const app = express();
app.use(express.json());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.login(BOT_TOKEN);

const verifiedUsers = new Set();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// /verify Command simulieren (Discord-Command-Handling kann man noch erweitern)
app.get('/verify-link', (req, res) => {
  // Sende einfach den OAuth2 Link
  const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=0&scope=identify%20guilds.join&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.send(`
    <h1>Verify</h1>
    <p>Click here to verify your Discord account:</p>
    <a href="${oauthUrl}">Verify with Discord</a>
  `);
});

// OAuth2 Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    // Token anfragen
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      scope: 'identify guilds.join'
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token } = tokenResponse.data;

    // User Daten holen
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const user = userResponse.data;

    // User zum Server hinzufügen mit Scope guilds.join
    await axios.put(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`, {
      access_token
    }, {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // Rolle vergeben
    await axios.put(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}/roles/${ROLE_ID}`, {}, {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`
      }
    });

    verifiedUsers.add(user.username + '#' + user.discriminator);

    // Erfolgsseite anzeigen
    res.send(`
      <h1>You are verified!</h1>
      <p>You can close this page now.</p>
    `);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Verification failed.');
  }
});

// Admin Panel: Verifizierte User ansehen & Invite-Link an alle senden
app.get('/admin', (req, res) => {
  const pass = req.headers['authorization'];
  if (pass !== ADMIN_PASSWORD) return res.status(401).send('Unauthorized');

  res.send(`
    <h1>Admin Panel</h1>
    <h2>Verified Users</h2>
    <ul>
      ${[...verifiedUsers].map(u => `<li>${u}</li>`).join('')}
    </ul>
    <form method="POST" action="/admin/invite">
      <input type="text" name="invite" placeholder="Discord invite link" required />
      <button type="submit">Send Invite to Verified Users</button>
    </form>
  `);
});

app.post('/admin/invite', express.urlencoded({ extended: true }), async (req, res) => {
  const pass = req.headers['authorization'];
  if (pass !== ADMIN_PASSWORD) return res.status(401).send('Unauthorized');

  const inviteLink = req.body.invite;
  if (!inviteLink) return res.status(400).send('No invite link provided');

  // Hier würdest du z.B. die verifizierten User benachrichtigen, 
  // aber da wir nur einen Bot-User haben, ist das nur als Beispiel:
  try {
    for (const username of verifiedUsers) {
      // Zum Beispiel per DM oder andere Logik
      // await client.users.fetch(userid).then(user => user.send(`Invite: ${inviteLink}`));
      console.log(`Would send invite to ${username}: ${inviteLink}`);
    }
    res.send('Invites sent (simulated)');
  } catch (e) {
    res.status(500).send('Error sending invites');
  }
});

// Simpler /verify Command (für Discord Slash Command braucht man noch discord.js/REST-Setup)
app.get('/send-verify-message', (req, res) => {
  // Beispiel: Einfach im Terminal gestartet, um zu zeigen wie der Bot eine Nachricht senden könnte
  const channelId = 'DEIN_CHANNEL_ID'; // Hier Channel-ID mitlesen oder setzen
  const channel = client.channels.cache.get(channelId);
  if (!channel) return res.send('Channel not found');
  const embed = new EmbedBuilder()
    .setTitle('Please verify yourself')
    .setDescription('Click the link to verify your account: https://deine-app.onrender.com/verify-link')
    .setColor('Blue');
  channel.send({ embeds: [embed] });
  res.send('Verify message sent.');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
