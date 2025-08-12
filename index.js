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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: ['CHANNEL'], // Für DMs
});

client.once('ready', () => {
  console.log(`Discord Bot läuft als ${client.user.tag}`);
});

// Verified Users Map speichert username, discriminator, accessToken
const verifiedUsers = new Map();

// --- RED NEON CSS ---
const redNeonCSS = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

    body {
      background-color: #000;
      color: #ff073a;
      font-family: 'Share Tech Mono', monospace;
      text-align: center;
      padding: 2rem;
      user-select: none;
    }
    h1, h2 {
      color: #ff073a;
      text-shadow:
        0 0 5px #ff073a,
        0 0 10px #ff073a,
        0 0 20px #ff073a,
        0 0 40px #ff073a;
      margin-bottom: 1rem;
    }
    p, li, label {
      font-size: 1.2rem;
      margin-bottom: 0.8rem;
      text-shadow: 0 0 5px #ff073a;
    }
    a {
      color: #ff073a;
      text-decoration: none;
      font-weight: bold;
      text-shadow: 0 0 10px #ff073a;
    }
    a:hover {
      text-decoration: underline;
    }
    input, button {
      font-family: 'Share Tech Mono', monospace;
      font-size: 1.1rem;
      padding: 0.5rem 1rem;
      border: 2px solid #ff073a;
      background: transparent;
      color: #ff073a;
      box-shadow:
        0 0 5px #ff073a,
        0 0 10px #ff073a,
        0 0 20px #ff073a;
      border-radius: 5px;
      transition: all 0.3s ease;
      outline: none;
      user-select: text;
    }
    input:focus, button:hover {
      background-color: #ff073a;
      color: #000;
      box-shadow:
        0 0 10px #ff073a,
        0 0 20px #ff073a,
        0 0 30px #ff073a;
      cursor: pointer;
    }
    form {
      margin-top: 1.5rem;
      margin-bottom: 2rem;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 1rem auto;
      max-width: 500px;
      text-align: left;
    }
    #status {
      margin-top: 1rem;
      font-weight: bold;
      color: #ff073a;
      text-shadow: 0 0 10px #ff073a;
    }
  </style>
`;

// Slash Command: /verify
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const verifyUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=code&scope=identify%20guilds.join&prompt=consent`;

    const embed = new EmbedBuilder()
      .setTitle('Verify yourself')
      .setDescription('Click the button below to verify and gain access to all channels.')
      .setColor('#ff073a')
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

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pluezz Verify System</title>
    ${redNeonCSS}
    </head><body>
      <h1>Welcome to Pluezz Verify System</h1>
      <p>Use the <strong>/verify</strong> command in Discord to start verification.</p>
    </body></html>
  `);
});

// OAuth Callback: Access Token holen und User speichern
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided.');

  try {
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

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    // Verified User speichern mit Access Token für Guild-Join
    verifiedUsers.set(userData.id, {
      username: userData.username,
      discriminator: userData.discriminator,
      accessToken: tokenData.access_token,
    });

    res.send(`
      <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Verification Complete</title>
      ${redNeonCSS}
      </head><body>
        <h2>You are verified, ${userData.username}#${userData.discriminator}!</h2>
        <p>You can close this page now.</p>
      </body></html>
    `);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.send('Error during OAuth process.');
  }
});

// Admin Login Seite
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin Login</title>
    ${redNeonCSS}
    </head><body>
      <h1>Admin Login</h1>
      <form method="POST" action="/admin/login">
        <input name="password" type="password" placeholder="Password" required autocomplete="off" />
        <button type="submit">Login</button>
      </form>
    </body></html>
  `);
});

app.post('/admin/login', (req, res) => {
  const password = req.body.password;
  if (password === ADMIN_PASSWORD) {
    res.redirect('/admin/dashboard?auth=1');
  } else {
    res.send(`
      <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Admin Login Failed</title>
      ${redNeonCSS}
      </head><body>
        <p>Wrong password!</p>
        <a href="/admin">Back</a>
      </body></html>
    `);
  }
});

// Admin Dashboard mit Nutzerliste, Rolle vergeben & Einladungen verschicken
app.get('/admin/dashboard', (req, res) => {
  if (req.query.auth !== '1') return res.redirect('/admin');

  let userListHtml = '';
  for (const [id, user] of verifiedUsers.entries()) {
    userListHtml += `<li>${user.username}#${user.discriminator} (ID: ${id})</li>`;
  }
  if (!userListHtml) userListHtml = '<li>No verified users yet.</li>';

  res.send(`
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin Dashboard</title>
    ${redNeonCSS}
    </head><body>
      <h1>Admin Dashboard</h1>
      <h2>Verified Users:</h2>
      <ul>${userListHtml}</ul>

      <form method="POST" action="/admin/add-to-guild?auth=1">
        <label>Guild ID (default from env):</label><br />
        <input name="guildId" value="${GUILD_ID}" autocomplete="off" /><br /><br />
        <button type="submit">Add all verified users to Guild & Assign Role</button>
      </form>

      <hr />

      <h2>Send Backup Server Invites</h2>
      <form id="inviteForm">
        <input type="text" id="inviteInput" placeholder="Discord invite link (z.B. https://discord.gg/abc123)" style="width:300px;" required autocomplete="off" />
        <button type="submit">Send Invite to Verified Users</button>
      </form>
      <p id="status"></p>

      <script>
        const form = document.getElementById('inviteForm');
        const status = document.getElementById('status');

        form.onsubmit = async (e) => {
          e.preventDefault();
          const inviteLink = document.getElementById('inviteInput').value.trim();
          if (!inviteLink) {
            alert('Please enter an invite link.');
            return;
          }
          status.textContent = 'Sending invites...';

          try {
            const res = await fetch('/admin/invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invite_link: inviteLink }),
            });
            const data = await res.json();
            if (data.success) {
              status.textContent = \`Invites sent to \${data.sent} users.\`;
            } else {
              status.textContent = \`Error: \${data.error}\`;
            }
          } catch (err) {
            status.textContent = 'Request failed.';
          }
        };
      </script>
    </body></html>
  `);
});

// Alle verifizierten User zur Guild hinzufügen und Rolle zuweisen
app.post('/admin/add-to-guild', async (req, res) => {
  if (req.query.auth !== '1') return res.redirect('/admin');

  const guildId = req.body.guildId || GUILD_ID;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return res.send(`
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Error</title>
    ${redNeonCSS}
    </head><body>
      <p>Guild not found!</p>
      <a href="/admin/dashboard
