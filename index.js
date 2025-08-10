import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  PermissionsBitField,
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const verifiedUsers = new Map();
let backupGuildId = '';

client.login(DISCORD_TOKEN);

// Slash Command Interaction Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    try {
      await interaction.reply({
        content: `Klicke hier zum Verifizieren: ${process.env.BASE_URL || 'https://pluezz-verify-system.onrender.com'}/verify?user_id=${interaction.user.id}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Fehler beim Beantworten des Commands:', error);
    }
  }
});

client.once('ready', async () => {
  console.log(`Discord Client ready: ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const botMember = await guild.members.fetch(client.user.id);

    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      console.error('Bot hat keine Berechtigung "Rollen verwalten" im Server!');
    }
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      console.warn('Bot hat keine Berechtigung "Server verwalten", könnte Probleme machen.');
    }
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageGuildMembers)) {
      console.error('Bot hat keine Berechtigung "Mitglieder verwalten" im Server!');
    }
  } catch (error) {
    console.error('Fehler beim Überprüfen der Berechtigungen:', error);
  }

  await registerCommands();
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
      { body: commands }
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
}

app.get('/', (req, res) => {
  res.send(`
    <h1>Discord Verification Server</h1>
    <p>Gehe zu <a href="/verify">/verify</a>, um dich zu verifizieren.</p>
    <p>Admin? <a href="/admin">Hier einloggen</a></p>
  `);
});

app.get('/verify', (req, res) => {
  const userId = req.query.user_id || '';
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state: userId,
    prompt: 'consent',
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const stateUserId = req.query.state;

  if (!code) return res.send('Kein Code erhalten.');

  try {
    const data = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      scope: 'identify',
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

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    const guild = await client.guilds.fetch(GUILD_ID);
    const botMember = await guild.members.fetch(client.user.id);
    const targetRole = guild.roles.cache.get(ROLE_ID);

    if (!targetRole) {
      return res.send('Die Rolle existiert nicht auf dem Server.');
    }

    if (targetRole.position >= botMember.roles.highest.position) {
      return res.send('Fehler: Bot-Rolle ist zu niedrig, um die Zielrolle zu vergeben. Bitte Rolle höher anordnen.');
    }

    let member;
    try {
      member = await guild.members.fetch(userData.id);
    } catch {
      member = null;
    }

    if (!member) {
      await guild.members.add(userData.id, {
        accessToken: tokenData.access_token,
        roles: [ROLE_ID],
      });
    } else {
      if (!member.roles.cache.has(ROLE_ID)) {
        await member.roles.add(ROLE_ID);
      }
    }

    verifiedUsers.set(userData.id, `${userData.username}#${userData.discriminator}`);

    res.send(`
      <h1>Du bist verifiziert!</h1>
      <p>Diese Seite kannst du jetzt schließen.</p>
      <p><a href="/">Zurück zur Startseite</a></p>
    `);
  } catch (error) {
    console.error('Verifizierungsfehler:', error);
    res.send('Fehler während der Verifizierung. ' + error.message);
  }
});

app.get('/admin', (req, res) => {
  res.send(`
    <h1>Admin Login</h1>
    <form method="POST" action="/admin/login">
      <input name="password" type="password" placeholder="Passwort" required />
      <button type="submit">Login</button>
    </form>
  `);
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.redirect('/admin/dashboard');
  } else {
    res.send('<p>Falsches Passwort. <a href="/admin">Zurück</a></p>');
  }
});

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

app.post('/admin/set-backup-guild', (req, res) => {
  const { guildId } = req.body;
  if (!guildId) {
    return res.send(`
      <p>Guild ID ist erforderlich. <a href="/admin/dashboard">Zurück</a></p>
    `);
  }
  backupGuildId = guildId.trim();
  res.redirect('/admin/dashboard');
});

app.post('/admin/add-all-to-backup', async (req, res) => {
  if (!backupGuildId) {
    return res.send('<p>Kein Backup Server gesetzt. <a href="/admin/dashboard">Zurück</a></p>');
  }

  try {
    const backupGuild = await client.guilds.fetch(backupGuildId);

    const botMember = await backupGuild.members.fetch(client.user.id);
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageGuildMembers)) {
      return res.send('<p>Bot hat keine Berechtigung "Mitglieder verwalten" auf dem Backup Server. Bitte Berechtigungen anpassen. <a href="/admin/dashboard">Zurück</a></p>');
    }

    let addedCount = 0;
    let failedUsers = [];

    for (const userId of verifiedUsers.keys()) {
      try {
        await backupGuild.members.add(userId);
        addedCount++;
      } catch (error) {
        console.error(`Fehler beim Hinzufügen von Nutzer ${userId}:`, error);
        failedUsers.push(userId);
      }
    }

    res.send(`
      <p>Erfolgreich ${addedCount} Nutzer zum Backup Server hinzugefügt.</p>
      ${failedUsers.length > 0 ? `<p>Fehler bei folgenden Nutzern: ${failedUsers.join(', ')}</p>` : ''}
      <p><a href="/admin/dashboard">Zurück zum Dashboard</a></p>
    `);
  } catch (error) {
    console.error('Fehler beim Zugriff auf Backup Server:', error);
    res.send(`<p>Fehler beim Zugriff auf Backup Server: ${error.message}</p><p><a href="/admin/dashboard">Zurück</a></p>`);
