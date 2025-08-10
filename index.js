import express from 'express';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
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

// Discord Client mit Member Intents (wichtig für Rollen)
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', () => {
  console.log(`Discord Bot läuft als ${client.user.tag}`);
});

// Slash Command Listener
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const verifyUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=code&scope=identify%20guilds.join&prompt=consent`;

    const embed = new EmbedBuilder()
      .setTitle('Verify yourself')
      .setDescription('Click the button below to verify and gain access to all channels.')
      .setColor('#5865F2')
      .setImage(
        'https://cdn.discordapp.com/attachments/1381283382855733390/1402443142653022268/917AB148-0FF6-468E-8CF6-C1E7813E1BB6.png'
      );

    const button = new ButtonBuilder()
      .setLabel('Verify with Discord')
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  }
});

client.login(DISCORD_TOKEN);

// Speicher für verified User (Map: userId => { username, discriminator })
const verifiedUsers = new Map();

// Root Route
app.get('/', (req, res) => {
  res.send('<h1>Welcome to Pluezz Verify System</h1><p>Use /verify command in Discord to start verification.</p>');
});

// OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided.');

  try {
    // Token anfordern
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.send(`Error getting token: ${tokenData.error_description || tokenData.error}`);
    }

    // Userdaten holen
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    // User speichern
    verifiedUsers.set(userData.id, { username: userData.username, discriminator: userData.discriminator });

    res.send(`<h2>You are verified, ${userData.username}#${userData.discriminator}!</h2><p>You can close this page now.</p>`);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.send('Error during OAuth process.');
  }
});

// Admin Login Page
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
    res.redirect('/admin/dashboard?auth=1');
  } else {
    res.send('<p>Wrong password!</p><a href="/admin">Back</a>');
  }
});

// Admin Dashboard mit Userliste
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

// Add Users to Guild + Assign Role
app.post('/admin/add-to-guild', async (req, res) => {
  if (req.query.auth !== '1') return res.redirect('/admin');

  const guildId = req.body.guildId || GUILD_ID;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return res.send('<p>Guild not found!</p><a href="/admin/dashboard?auth=1">Back</a>');

  let addedCount = 0;
  let failedUsers = [];

  for (const userId of verifiedUsers.keys()) {
    try {
      // Wenn User schon im Server ist, wird er hier geholt, sonst hinzugefügt
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        // User existiert, Rolle hinzufügen, wenn noch nicht da
        if (!member.roles.cache.has(ROLE_ID)) {
          await member.roles.add(ROLE_ID, 'User verified via Pluezz Verify System');
        }
      } else {
        // User noch nicht im Server, Einladung via guild.members.add()
        await guild.members.add(userId, { roles: [ROLE_ID], reason: 'User verified via Pluezz Verify System' });
      }
      addedCount++;
    } catch (error) {
      console.error(`Failed to add user ${userId}:`, error);
      failedUsers.push(userId);
    }
  }

  res.send(`
    <p>Successfully processed ${addedCount} users.</p>
    ${
      failedUsers.length > 0
        ? `<p>Failed to add these users: ${failedUsers.join(', ')}</p>`
        : ''
    }
    <p><a href="/admin/dashboard?auth=1">Back to dashboard</a></p>
  `);
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
