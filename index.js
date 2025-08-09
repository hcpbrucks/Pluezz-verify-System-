import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from 'discord.js';

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  PORT = 10000,
  DOMAIN // z.B. "pluezz-verify-system.onrender.com"
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID || !DOMAIN) {
  console.error("Bitte setze DISCORD_TOKEN, CLIENT_ID, GUILD_ID und DOMAIN in deinen Umgebungsvariablen!");
  process.exit(1);
}

// --- Discord Client Setup ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// --- Slash Command Registration ---
const commands = [
  {
    name: 'verify',
    description: 'Send verification message with link',
  },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// --- Handle Interaction ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'verify') {
    const verifyUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(`https://${DOMAIN}/oauth/callback`)}&response_type=code&scope=identify%20guilds`;

    const embed = new EmbedBuilder()
      .setTitle("Please verify")
      .setDescription("Click the button below to verify yourself and get access to the server.")
      .setColor("#5865F2")
      .setImage("https://i.imgur.com/wSTFkRM.png");

    await interaction.reply({
      embeds: [embed],
      components: [
        {
          type: 1, // ActionRow
          components: [
            {
              type: 2, // Button
              label: "Verify Now",
              style: 5, // Link Button
              url: verifyUrl,
            },
          ],
        },
      ],
      ephemeral: false, // sichtbar für alle
    });
  }
});

// --- Express Webserver für OAuth Callback ---
const app = express();

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("No code provided");
  }

  // TODO: OAuth Token gegen Discord tauschen, User-Info holen,
  // Rolle vergeben via Discord API
  // Hier minimal Beispiel-Response:

  // Zum Beispiel hier Token holen, User-ID, dann Rolle vergeben...

  // Sobald fertig:
  res.send(`
    <h1>You are verified!</h1>
    <p>You can close this page now.</p>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// --- Login Bot ---
client.login(DISCORD_TOKEN);
