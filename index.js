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
  ActionRowBuilder 
} from 'discord.js';

dotenv.config();

// Umgebungsvariablen laden
const {
  DISCORD_TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  GUILD_ID,
  ROLE_ID,
  ADMIN_PASSWORD,
  PORT = 10000,
  BASE_URL,
} = process.env;

// Express Setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Discord Client Setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Zwischenspeicher für verifizierte Nutzer (userId => username#discriminator)
const verifiedUsers = new Map();
let backupGuildId = ''; // Backup-Guild ID

// Bot Login
client.login(DISCORD_TOKEN);

// Sobald Discord-Client bereit ist
client.once('ready', () => {
  console.log(`Discord Client ready: ${client.user.tag}`);
  registerCommands();
});

// Slash Command registrieren (/verify)
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
      { body: commands }
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
}

// === Express Routes ===

// Startseite
app.get('/', (req, res) => {
  res.send(`
    <h1>Discord Verification Server</h1>
    <p>Gehe zu <a href="/verify">/verify</a>, um dich zu verifizieren.</p>
    <p>Admin? <a href="/admin">Hier einloggen</a></p>
  `);
});

// OAuth2 Authorization Redirect
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

// OAuth2 Callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const stateUserId = req.query.state;

  if (!code) return res.send('Kein Code erhalten.');

  try {
    // Access Token anfordern
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
      return res.send(`Token-Fehler: ${tokenData.error_description}`);
    }

    // Userdaten abfragen
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    // User zum Server hinzufügen und Rolle geben
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
      console.error(`Fehler beim Hinzufügen des Mitglieds: ${errorBody}`);
      return res.send('Fehler beim Hinzufügen zum Server. Stelle sicher, dass der Bot die nötigen Rechte hat.');
    }

    // User als verifiziert speichern
    verifiedUsers.set(userData.id, `${userData.username}#${userData.discriminator}`);

    // Erfolgsmeldung
    res.send(`
      <h1>Du bist verifiziert!</h1>
      <p>Diese Seite kannst du jetzt schließen.</p>
      <p><a href="/">Zurück zur Startseite</a></p>
    `);
  } catch (error) {
    console.error('Verifizierungsfehler:', error);
    res.send('Fehler während der Verifizierung.');
  }
});

// Admin Login Seite
app.get('/admin', (req, res) => {
  res.send(`
    <h1>Admin Login</h1>
    <form method="POST" action="/admin/login">
      <input name="password" type="password" placeholder="Passwort" required />
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
    res.send('<p>Falsches Passwort. <a href="/admin">Zurück</a></p>');
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
      <input name="guildId" type="text" value="${backupGuildId}" placeholder="Guild ID eingeben" required/>
      <button type="submit">Backup Server setzen</button>
    </form>

    <h2>Verifizierte Nutzer (${verifiedUsers.size})</h2>
    <ul>${usersList}</ul>

    ${backupGuildId ? `
      <form method="POST" action="/admin/add-all-to-backup">
        <button type="submit">Alle verifizierten Nutzer zum Backup Server hinzufügen</button>
      </form>
    ` : '<p>Kein Backup Server gesetzt.</p>'}

    <p><a href="/">Zurück zur Startseite</a></p>
  `);
});

// Backup Guild setzen
app.post('/admin/set-backup-guild', (req, res) => {
  const { guildId } = req.body;
  if (!guildId) {
    return res.send('<p>Guild ID ist erforderlich. <a href="/admin/dashboard">Zurück</a></p>');
  }
  backupGuildId = guildId.trim();
  res.redirect('/admin/dashboard');
});

// Alle verifizierten Nutzer zum Backup Server hinzufügen
app.post('/admin/add-all-to-backup', async (req, res) => {
  if (!backupGuildId) {
    return res.send('<p>Kein Backup Server gesetzt. <a href="/admin/dashboard">Zurück</a></p>');
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
          roles: [], // Optional Rollen hier hinzufügen
        }),
      });

      if (response.ok) {
        successes++;
      } else {
        failures++;
        const errText = await response.text();
        console.error(`Fehler beim Hinzufügen von Nutzer ${userId}: ${errText}`);
      }
    } catch (err) {
      failures++;
      console.error(`Fehler beim Hinzufügen von Nutzer ${userId}:`, err);
    }
  }

  res.send(`
    <p>${successes} Nutzer zum Backup Server hinzugefügt.</p>
    <p>${failures} Nutzer konnten nicht hinzugefügt werden.</p>
    <p><a href="/admin/dashboard">Zurück zum Dashboard</a></p>
  `);
});

// Slash Command /verify Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'verify') {
    const baseUrl = BASE_URL || `http://localhost:${PORT}`;
    const verifyUrl = `${baseUrl}/verify?user_id=${interaction.user.id}`;

    const embed = new EmbedBuilder()
      .setTitle('Verifizierung')
      .setDescription('Klicke auf den Button unten, um dich zu verifizieren und Zugriff zu erhalten.')
      .setColor(0x00AE86);

    const button = new ButtonBuilder()
      .setLabel('Jetzt Verifizieren')
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

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
