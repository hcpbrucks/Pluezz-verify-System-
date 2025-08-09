const express = require('express');
const fetch = require('node-fetch'); // Für API Calls, falls noch nicht installiert: npm install node-fetch@2
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const redirectUri = process.env.REDIRECT_URI || "http://localhost/oauth/callback";

const PORT = process.env.PORT || 3000;

const app = express();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

// Express OAuth2 Callback Route
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code provided");

  try {
    // 1. Tausche code gegen Access Token
    const data = new URLSearchParams();
    data.append('client_id', clientId);
    data.append('client_secret', process.env.CLIENT_SECRET);
    data.append('grant_type', 'authorization_code');
    data.append('code', code);
    data.append('redirect_uri', redirectUri);
    data.append('scope', 'identify guilds');

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return res.status(500).send("Failed to get access token: " + errorText);
    }

    const tokenJson = await tokenResponse.json();
    const accessToken = tokenJson.access_token;

    // 2. Hol Nutzerdaten
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const user = await userResponse.json();

    // 3. User zum Server hinzufügen (Backup Server)
    // Dazu brauchst du ein Bot Token mit Berechtigung "guilds.members.add"
    // Achtung: Endpoint ist nur mit Bot Token möglich (hier also über deinen Bot-Client)

    await client.guilds.fetch(guildId).then(async guild => {
      // Einladung via Member hinzufügen
      // Die Funktion guild.members.add() ist noch experimentell in discord.js v14+
      // Falls nicht verfügbar, kannst du stattdessen einen Invite-Link schicken
      try {
        await guild.members.add(user.id, { accessToken });
        console.log(`User ${user.username} wurde hinzugefügt.`);
      } catch (e) {
        console.error('User konnte nicht hinzugefügt werden:', e);
      }
    });

    res.send(`Hi ${user.username}, du wurdest verifiziert und dem Backup-Server hinzugefügt!`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Ein Fehler ist aufgetreten.');
  }
});

// Express Server starten
app.listen(PORT, () => {
  console.log(`Express server läuft auf Port ${PORT}`);
});

// Slash Command Definition
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Sendet eine Verifizierungs-Nachricht mit Button')
    .toJSON()
];

// Register Slash Commands
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
    console.error(error);
  }
})();

// Bot ready
client.once('ready', () => {
  console.log(`Eingeloggt als ${client.user.tag}`);
});

// Slash Command Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const embed = new EmbedBuilder()
      .setTitle('Verifizieren')
      .setDescription('Klicke auf den Button, um dich zu verifizieren und Zugriff zu bekommen.')
      .setColor(0xff0000)
      .setThumbnail('https://cdn.discordapp.com/attachments/1381283382855733390/1402443142653022268/917AB148-0FF6-468E-8CF6-C1E7813E1BB6.png');

    // OAuth2 URL mit Scope & Redirect Uri
    const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=0&scope=identify%20guilds&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Verifizieren')
          .setStyle(ButtonStyle.Link)
          .setURL(oauthUrl)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  }
});

client.login(token);
