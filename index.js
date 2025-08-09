require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch@2
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const guildId = process.env.GUILD_ID;
const redirectUri = process.env.REDIRECT_URI;

const PORT = process.env.PORT || 3000;

const app = express();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

// Express OAuth2 Callback Route
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Kein Code erhalten.");

  try {
    // 1. Tausche Code gegen Access Token
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('scope', 'identify guilds.join');

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return res.status(500).send("Token konnte nicht abgerufen werden: " + errorText);
    }

    const tokenJson = await tokenResponse.json();
    const accessToken = tokenJson.access_token;

    // 2. Hole User-Daten
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      return res.status(500).send("User-Daten konnten nicht geladen werden.");
    }

    const user = await userResponse.json();

    // 3. Füge User zum Server hinzu
    const guild = await client.guilds.fetch(guildId);

    try {
      await guild.members.add(user.id, { accessToken });
      console.log(`User ${user.username}#${user.discriminator} wurde hinzugefügt.`);
      res.send(`Hallo ${user.username}, du wurdest erfolgreich verifiziert und dem Server hinzugefügt!`);
    } catch (e) {
      console.error("Fehler beim Hinzufügen des Users:", e);
      res.status(500).send("User konnte nicht hinzugefügt werden. Bitte überprüfe die Bot-Berechtigungen.");
    }
  } catch (err) {
    console.error("Unbekannter Fehler im OAuth2 Callback:", err);
    res.status(500).send("Ein unerwarteter Fehler ist aufgetreten.");
  }
});

// Starte Express Server
app.listen(PORT, () => {
  console.log(`Express Server läuft auf Port ${PORT}`);
});

// Slash Command Definition
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Sendet eine Verifizierungs-Nachricht mit Button')
    .toJSON(),
];

// Slash Commands registrieren
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registriere Slash Commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Slash Commands registriert.');
  } catch (error) {
    console.error('Fehler beim Registrieren der Commands:', error);
  }
})();

// Bot ready Event
client.once('ready', () => {
  console.log(`Bot eingeloggt als ${client.user.tag}`);
});

// Slash Command Handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const embed = new EmbedBuilder()
      .setTitle('Verifizierung')
      .setDescription('Please Tap on The button Below to gain access to all channels! ')
      .setColor(0xff0000)
      .setThumbnail('https://cdn.discordapp.com/attachments/1381283382855733390/1402443142653022268/917AB148-0FF6-468E-8CF6-C1E7813E1BB6.png');

    // OAuth2 URL mit guilds.join Scope!
    const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=0&scope=identify%20guilds.join&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Verifizieren')
        .setStyle(ButtonStyle.Link)
        .setURL(oauthUrl)
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  }
});

// Bot Login starten
client.login(token);
