import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  PermissionsBitField
} from 'discord.js';

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
  BASE_URL,  // NEU
} = process.env;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Discord Client Setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.login(DISCORD_TOKEN);

client.once('ready', () => {
  console.log(`Discord Client ready: ${client.user.tag}`);
  registerCommands();
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Get the verification link'),
  ].map(cmd => cmd.toJSON());

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
}

// In-memory storage
const verifiedUsers = new Map(); // key: userId, value: username#discriminator
let backupGuildId = ''; // Backup Server Guild ID

// Root Route
app.get('/', (req, res) => {
  res.send(`
    <h1>Discord Verification Server</h1>
    <p>Go to <a href="/verify">/verify</a> to verify yourself.</p>
    <p>Admin? <a href="/admin">Login here</a></p>
  `);
});

// /verify Route -> redirect zu Discord OAuth2 mit State = User ID falls vorhanden
app.get('/verify', (req, res) => {
  const userId = req.query.user_id || '';
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.join',
    state: userId,
    prompt: 'consent',
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

// OAuth2 Callback Route
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const stateUserId = req.query.state;

  if (!code) return res.send('No code received.');

  try {
    const data = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      scope: 'identify guilds.join',
    });

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.send(`Token error: ${tokenData.error_description}`);
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    // Add user to main guild with role
    const addMemberRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`, {
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

    if (!addMemberRes.ok) {
      const errorBody = await addMemberRes.text();
      console.error(`Failed to add member to guild: ${errorBody}`);
      return res.send('Failed to add you to the guild. Make sure the bot has the necessary permissions.');
    }

    // Save user as verified
    verifiedUsers.set(userData.id, `${userData.username}#${userData.discriminator}`);

    res.send(`
      <h1>You are verified!</h1>
      <p>You can now close this page.</p>
      <p><a href="/">Back to Home</a></p>
    `);
  } catch (error) {
    console.error('Verification error:', error);
    res.send('Error during the verification process.');
  }
});

// Admin Login Page
app.get('/admin', (req, res) => {
  res.send(`
    <h1>Admin Login</h1>
    <form method="POST" action="/admin/login">
      <input name="password" type="password" placeholder="Password" required/>
      <button type="submit">Login</button>
    </form>
  `);
});

// Admin Login POST
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.redirect('/admin/dashboard');
  } else {
    res.send('<p>Wrong password. <a href="/admin">Back</a></p>');
  }
});

// Admin Dashboard
app.get('/admin/dashboard', (req, res) => {
  const usersList = [...verifiedUsers.values()]
    .map(u => `<li>${u}</li>`)
    .join('');

  res.send(`
    <h1>Admin Dashboard</h1>

    <h2>Backup Server</h2>
    <form method="POST" action="/admin/set-backup-guild">
      <label>Backup Server Guild ID:</label><br/>
      <input name="guildId" type="text" value="${backupGuildId}" placeholder="Enter Guild ID" required/>
      <button type="submit">Set Backup Server</button>
    </form>

    <h2>Verified Users (${verifiedUsers.size})</h2>
    <ul>${usersList}</ul>

    ${backupGuildId ? `
      <form method="POST" action="/admin/add-all-to-backup">
        <button type="submit">Add all verified users to Backup Server</button>
      </form>
    ` : '<p>No Backup Server set.</p>'}

    <p><a href="/">Back to Home</a></p>
  `);
});

// Set Backup Guild POST
app.post('/admin/set-backup-guild', (req, res) => {
  const { guildId } = req.body;
  if (!guildId) {
    return res.send('<p>Guild ID is required. <a href="/admin/dashboard">Back</a></p>');
  }
  backupGuildId = guildId.trim();
  res.redirect('/admin/dashboard');
});

// Add all verified users to backup guild POST
app.post('/admin/add-all-to-backup', async (req, res) => {
  if (!backupGuildId) {
    return res.send('<p>No Backup Server set. <a href="/admin/dashboard">Back</a></p>');
  }

  let successes = 0;
  let failures = 0;

  for (const [userId] of verifiedUsers) {
    try {
      const response = await fetch(`https://discord.com/api/guilds/${backupGuildId}/members/${userId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roles: [], // Optional: Rollen hinzufügen, falls gewünscht
        }),
      });

      if (response.ok) {
        successes++;
      } else {
        failures++;
        const errorText = await response.text();
        console.error(`Failed to add user ${userId} to backup guild: ${errorText}`);
      }
    } catch (err) {
      failures++;
      console.error(`Error adding user ${userId}:`, err);
    }
  }

  res.send(`
    <p>Added ${successes} users to Backup Server.</p>
    <p>Failed to add ${failures} users.</p>
    <p><a href="/admin/dashboard">Back to Dashboard</a></p>
  `);
});

// Slash Command Interaction
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'verify') {
    const baseUrl = BASE_URL || `http://localhost:${PORT}`;
    const verifyUrl = `https://pluezz-verify-system.onrender.com/verify?user_id=${interaction.user.id}`;

    const embed = new EmbedBuilder()
      .setTitle('Verify')
      .setDescription('Tap the button below to verify yourself and gain access.')
      .setColor(0x00AE86);

    const button = new ButtonBuilder()
      .setLabel('Verify Now')
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
