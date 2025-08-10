import express from 'express';
import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from 'discord.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Deine Discord-Bot-Token und Variablen (aus Render env vars)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;      // z.B. "DISCO Token"
const GUILD_ID = process.env.GUILD_ID;                // z.B. "Guild ID"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;    // z.B. "Secret ID" als Admin-Passwort

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Discord Bot Setup ---

client.once('ready', async () => {
  console.log(`Discord Bot ist online als ${client.user.tag}`);

  // Hier kannst du z.B. die "public" Embed-Message in deinem Server posten/aktualisieren
  // oder beim Slash-Befehl auslösen lassen (siehe weiter unten)
});

// Slash-Command /verify zum Senden der Embed-Message mit Button an alle
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Welcome to the Verification!')
      .setDescription('Click the button below to verify yourself and get access to the server.')
      .setFooter({ text: 'Pluezz Verify System' });

    const button = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('Verify Me')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: false }); // öffentlich sichtbar
  }
});

// Button-Handler: Wenn Nutzer auf "Verify Me" klicken
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'verify_button') {
    const userId = interaction.user.id;
    // Hier leite ich auf deine Webseite weiter mit User-ID
    await interaction.reply({
      content: `You are verified! Please continue your verification on the website: https://pluezz-verify-system.onrender.com/verify?user=${userId}`,
      ephemeral: true, // Nur der Klicker sieht das
    });
  }
});

// --- Express Webserver ---
// Startseite (optional)
app.get('/', (req, res) => {
  res.send('<h1>Pluezz Verify System</h1><p>Bitte nutze die /verify Funktion im Discord.</p>');
});

// Verifizierungsseite, auf der User nach Klick vom Discord weitergeleitet werden
app.get('/verify', (req, res) => {
  const userId = req.query.user;
  if (!userId) {
    return res.send('<p>Keine User-ID übergeben!</p>');
  }
  // Hier kannst du z.B. nach erfolgreicher Verifizierung den Nutzerstatus speichern
  res.send(`
    <h2>You are verified!</h2>
    <p>You can now close this page or return to Discord.</p>
  `);
});

// Admin-Panel zum Einsehen, wer sich verifiziert hat, und Guild-ID eingeben
app.get('/admin', (req, res) => {
  res.send(`
    <h1>Admin Panel - Login</h1>
    <form method="POST" action="/admin/login">
      <input type="password" name="password" placeholder="Admin Password" required/>
      <button type="submit">Login</button>
    </form>
  `);
});

let loggedIn = false;

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    loggedIn = true;
    res.redirect('/admin/dashboard');
  } else {
    res.send('<p>Falsches Passwort. <a href="/admin">Zurück</a></p>');
  }
});

app.get('/admin/dashboard', (req, res) => {
  if (!loggedIn) {
    return res.redirect('/admin');
  }

  // Hier kannst du z.B. deine verifizierten Nutzer aus einer DB oder in-memory Liste ausgeben
  // Beispiel:
  const verifiedUsers = ['123456789012345678', '987654321098765432']; // Platzhalter

  res.send(`
    <h1>Admin Dashboard</h1>
    <p>Verifizierte Nutzer:</p>
    <ul>
      ${verifiedUsers.map(id => `<li>${id}</li>`).join('')}
    </ul>
    <form method="POST" action="/admin/add-to-guild">
      <input name="guildId" placeholder="Guild ID eingeben" required/>
      <button type="submit">Nutzer zum Server hinzufügen</button>
    </form>
  `);
});

// Endpoint zum Hinzufügen der User zum Discord-Server via Bot
app.post('/admin/add-to-guild', async (req, res) => {
  if (!loggedIn) return res.redirect('/admin');

  const { guildId } = req.body;

  if (!guildId) {
    return res.send('<p>Keine Guild ID eingegeben! <a href="/admin/dashboard">Zurück</a></p>');
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return res.send('<p>Guild nicht gefunden! <a href="/admin/dashboard">Zurück</a></p>');

    // Beispiel: Alle verifizierten Nutzer hinzufügen (hier statisch)
    const verifiedUsers = ['123456789012345678', '987654321098765432']; // Muss dynamisch aus deiner DB kommen

    let addedCount = 0;
    const failedUsers = [];

    for (const userId of verifiedUsers) {
      try {
        const member = await guild.members.fetch(userId);
        if (!member) {
          // Mitglied hinzufügen (Einladung erstellen oder Bot-Invite)
          // Hier kannst du auch eine Einladung per DM senden, falls Bot nicht direkt hinzufügen kann
          // ACHTUNG: Discord-Bots können Nutzer nicht einfach zu Guilds hinzufügen, Einladung notwendig!
          // Alternative: Einladung generieren und Link an Nutzer senden
          // Hier nur Beispiel-Logik
          console.log(`Kann Nutzer ${userId} nicht direkt hinzufügen, Einladung manuell senden.`);
          failedUsers.push(userId);
          continue;
        }
        addedCount++;
      } catch {
        failedUsers.push(userId);
      }
    }

    res.send(`
      <p>Erfolgreich ${addedCount} Nutzer zum Backup Server hinzugefügt.</p>
      ${failedUsers.length > 0 ? `<p>Fehler bei folgenden Nutzern: ${failedUsers.join(', ')}</p>` : ''}
      <p><a href="/admin/dashboard">Zurück zum Dashboard</a></p>
    `);
  } catch (error) {
    console.error('Fehler beim Zugriff auf Guild:', error);
    res.send(`<p>Fehler beim Zugriff auf Guild: ${error.message}</p><p><a href="/admin/dashboard">Zurück</a></p>`);
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});

client.login(DISCORD_TOKEN);
