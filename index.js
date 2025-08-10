import express from 'express';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fetch from 'node-fetch';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

const {
  ADMIN_PASSWORD,
  BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  DISCORD_TOKEN,
  GUILD_ID,
  REDIRECT_URI,
  ROLE_ID,
} = process.env;

// --- Discord Bot Setup ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', () => {
  console.log(`Discord Bot läuft als ${client.user.tag}`);
});

// Slash Command Handler (einfach nur /verify)
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const verifyUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&prompt=consent`;

    const embed = new EmbedBuilder()
      .setTitle('Verify yourself')
      .setDescription('Click the button below to verify and join the server.')
      .setColor('#5865F2')
      .setImage('https://cdn.discordapp.com/attachments/1381283382855733390/1402443142653022268/917AB148-0FF6-468E-8CF6-C1E7813E1BB6.png?ex=68993475&is=6897e2f5&hm=5e944becc85e3d7732edaebbedb9fbfa63b0dabd148c412cc08ef1af4ea91e18&'); // Beispielbild, kannst du anpassen

    const button = new ButtonBuilder()
      .setLabel('Verify with Discord')
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl);

    const row = new ActionRowBuilder().addComponents(button);

    // Nachricht öffentlich, also nicht ephemeral
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  }
});

client.login(DISCORD_TOKEN);

// --- Webserver für OAuth Callback und Admin-Panel ---
const verifiedUsers = new Map(); // userId => { username, discriminator }

app.get('/', (req, res) => {
  res.send('<h1>Welcome to Pluezz Verify System</h1><p>Use /verify command in Discord to start verification.</p>');
});

// OAuth2 Callback: Discord sendet Code hierher
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided.');

  try {
    // Token holen
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.send(`Error getting token: ${tokenData.error_description}`);

    // Userdaten holen
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    // Nutzer speichern (für Admin-Panel)
    verifiedUsers.set(userData.id, { username: userData.username, discriminator: userData.discriminator });

    res.send(`<h2>You are verified, ${userData.username}#${userData.discriminator}!</h2><p>You can close this page now.</p>`);
  } catch (error) {
    console.error(error);
    res.send('Error during OAuth process.');
  }
});

// Admin Login Page (Passwortgeschützt)
app.get('/admin', (req, res) => {
  res.send(`
    <h1>Admin Login</h1>
    <form method="POST" action="/admin/login">
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Login</button>
    </form>
  `);
});

app.post('/admin/login', (req, res) => {
  const password = req.body.password;
  if (password === ADMIN_PASSWORD) {
    // Einfach Session oder Token hier nicht implementiert, einfach Redirect mit Parameter
    res.redirect('/admin/dashboard?auth=1');
  } else {
    res.send('<p>Wrong password!</p><a href="/admin">Back</a>');
  }
});

// Admin Dashboard mit Liste der Verified Users und Eingabe für Guild-ID
app.get('/admin/dashboard', (req, res) => {
  if (req.query.auth !== '1') return res.redirect('/admin');

  let userListHtml = '';
  for (const [id, user] of verifiedUsers.entries()) {
    userListHtml += `<li>${user.username}#${user.discriminator} (ID: ${id})</li>`;
  }
  if (!userListHtml) userListHtml = '<li>No verified users yet.</li>';

  res.send(`
    <h1>Admin Dashboard</h1>
    <h2>Verified Users:</h2>
    <ul>${userListHtml}</ul>
    <form method="POST" action="/admin/add-to-guild?auth=1">
      <label>Guild ID (default from env):</label><br />
      <input name="guildId" value="${GUILD_ID}" /><br /><br />
      <button type="submit">Add all verified users to Guild & Assign Role</button>
    </form>
  `);
});

// Route zum Hinzufügen der User zum Server + Rolle
app.post('/admin/add-to-guild', async (req, res) => {
  if (req.query.auth !== '1') return res.redirect('/admin');

  const guildId = req.body.guildId || GUILD_ID;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return res.send('<p>Guild not found!</p><a href="/admin/dashboard?auth=1">Back</a>');

  let addedCount = 0;
  let failedUsers = [];

  for (const userId of verifiedUsers.keys()) {
    try {
      await guild.members.add(userId, { roles: [ROLE_ID], reason: 'User verified via Pluezz Verify System' });
      addedCount++;
    } catch {
      failedUsers.push(userId);
    }
  }

  res.send(`
    <p>Successfully added ${addedCount} users to the guild.</p>
    ${failedUsers.length > 0 ? `<p>Failed to add these users: ${failedUsers.join(', ')}</p>` : ''}
    <p><a href="/admin/dashboard?auth=1">Back to dashboard</a></p>
  `);
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
