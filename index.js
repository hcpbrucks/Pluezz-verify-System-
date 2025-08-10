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

// Registriere den /verify Slash-Command nur für deinen Server (Guild)
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

// In-Memory storage for verified users (username or id)
const verifiedUsers = new Set();

// Express Routes

// Root Route
app.get('/', (req, res) => {
  res.send(`
    <h1>Discord Verification Server</h1>
    <p>Go to <a href="/verify">/verify</a> to verify yourself.</p>
    <p>Admin? <a href="/admin">Login here</a></p>
  `);
});

// /verify route - shows verification link
app.get('/verify', (req, res) => {
  const userId = req.query.user_id || 'unknown';
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.join',
    state: userId,
    prompt: 'consent',
  });
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

  res.send(`
    <h1>Verification</h1>
    <p>Click the link below to verify yourself via Discord:</p>
    <a href="${discordAuthUrl}">Discord Login</a>
  `);
});

// OAuth2 Callback Route
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const stateUserId = req.query.state;

  if (!code) return res.send('No code received.');

  try {
    // Request token
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

    // Get user data
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    // Add user to guild with role
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

    // Save user as verified
    verifiedUsers.add(`${userData.username}#${userData.discriminator}`);

    // Success page
    res.send(`
      <h1>You are verified!</h1>
      <p>You can now close this page.</p>
    `);
  } catch (error) {
    console.error(error);
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
  res.send(`
    <h1>Admin Dashboard</h1>
    <h2>Verified Users</h2>
    <ul>
      ${[...verifiedUsers].map(u => `<li>${u}</li>`).join('')}
    </ul>
    <p><a href="/">Back to Home</a></p>
  `);
});

// Slash Command Interaction
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'verify') {
    // Check admin permission
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "You need Administrator permission to use this command.",
        ephemeral: true,
      });
    }

    // Create Embed
    const embed = new EmbedBuilder()
      .setTitle('Verify')
      .setDescription('Tap the button below to verify yourself and gain access.')
      .setColor(0x00AE86);

    // Button with link
    const verifyUrl = `https://pluezz-verify-system.onrender.com/verify?user_id=${interaction.user.id}`;

    const button = new ButtonBuilder()
      .setLabel('Verify Now')
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl);

    const row = new ActionRowBuilder().addComponents(button);

    // Send public message
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
