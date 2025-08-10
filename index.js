import express from 'express';
import { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// Umgebungsvariablen aus Render (oder .env)
const {
  TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  GUILD_ID,
  ROLE_ID,
  PORT = 10000,
  REDIRECT_URI,
} = process.env;

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !GUILD_ID || !ROLE_ID || !REDIRECT_URI) {
  console.error('Bitte alle Umgebungsvariablen setzen!');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.login(TOKEN);

client.on('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      {
        body: [
          {
            name: 'verify',
            description: 'Start verification process',
          },
        ],
      },
    );
    console.log('Slash Command /verify registered.');
  } catch (e) {
    console.error(e);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    // OAuth2 Link bauen mit Variablen
    const oauthUrl = new URL('https://discord.com/api/oauth2/authorize');
    oauthUrl.searchParams.set('client_id', CLIENT_ID);
    oauthUrl.searchParams.set('permissions', '0');
    oauthUrl.searchParams.set('scope', 'identify guilds');
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('redirect_uri', REDIRECT_URI);

    const embed = new EmbedBuilder()
      .setTitle('Verify yourself')
      .setDescription('Click the button below to verify and join the server.')
      .setColor('#5865F2')
      .setImage('https://i.imgur.com/lx3H30Q.png'); // Beispielbild

    const button = new ButtonBuilder()
      .setLabel('Verify')
      .setStyle(ButtonStyle.Link)
      .setURL(oauthUrl.toString());

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  }
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  const data = new URLSearchParams();
  data.append('client_id', CLIENT_ID);
  data.append('client_secret', CLIENT_SECRET);
  data.append('grant_type', 'authorization_code');
  data.append('code', code);
  data.append('redirect_uri', REDIRECT_URI);
  data.append('scope', 'identify guilds');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token error:', err);
      return res.status(500).send('Failed to get token');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userRes.json();

    const guild = await client.guilds.fetch(GUILD_ID);

    let member;
    try {
      member = await guild.members.fetch(userData.id);
    } catch {
      // User nicht im Server, kann man nur via Invite hinzufügen (Discord Limitationen)
      // Hier könntest du z.B. eine Nachricht loggen oder User manuell hinzufügen, falls möglich
      console.warn(`User ${userData.id} is not a member of the guild.`);
    }

    if (member) {
      await member.roles.add(ROLE_ID);
    }

    res.send(`
      <html>
        <head><title>Verification complete</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:2rem;">
          <h1>You are verified!</h1>
          <p>You can close this page now.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
