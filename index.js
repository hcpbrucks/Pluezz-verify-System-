const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const redirectUri = process.env.REDIRECT_URI || "http://localhost/callback"; // fallback

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Slash Command Definition
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Sends a verification message with the verify button')
    .toJSON()
];

// Register Slash Commands
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

// Bot ready Event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    // Create Embed
    const embed = new EmbedBuilder()
      .setTitle('Verify')
      .setDescription('Please verify to gain access to all channels and also to get added to the new server **if** this server gets banned.')
      .setColor(0xFF0000) // Rot
      .setThumbnail('https://cdn.discordapp.com/attachments/1381283382855733390/1402443142653022268/917AB148-0FF6-468E-8CF6-C1E7813E1BB6.png');

    // Create Button with OAuth2 invite link (Beispiel für Backup Server-Link, den du später anpassen kannst)
    // Du kannst den Link über die Webseite dann austauschen
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel('Verify')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  }
});

// Handle Button Interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'verify_button') {
    // Hier kannst du speichern, dass der User sich verifiziert hat (z.B. in DB oder JSON)
    // Für das Beispiel senden wir ihm nur eine DM
    try {
      await interaction.user.send('You have successfully verified! You will receive a DM with more information.');
      await interaction.reply({ content: 'Verification successful! Check your DMs.', ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: 'I could not send you a DM! Please check your privacy settings.', ephemeral: true });
    }
  }
});

client.login(token);
