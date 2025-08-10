import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';

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

// Discord Client zum Verwalten
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.login(DISCORD_TOKEN);
client.once('ready', () => {
  console.log(`Discord Client ready: ${client.user.tag}`);
});

// In-Memory Speicher für verifizierte User (username oder id)
const verifiedUsers = new Set();

// Root Route: einfache Info-Seite
app.get('/', (req, res) => {
  res.send(`
    <h1>Discord Verification Server</h1>
    <p>Gehe zu <a href="/verify">/verify</a> um dich zu verifizieren.</p>
    <p>Admin? <a href="/admin">Hier einloggen</a></p>
  `);
});

// /verify Route: zeige Link zum Discord OAuth2 Login mit user_id param (optional)
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
    <p>Klicke auf den Link, um dich via Discord zu verifizieren:</p>
    <a href="${discordAuthUrl}">Discord Login</a>
  `);
});

// OAuth2 Callback Route
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const stateUserId = req.query.state;

  if (!code) return res.send('Kein Code erhalten.');

  try {
    // Token anfordern
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
      return res.send(`Fehler beim Token: ${tokenData.error_description}`);
    }

    // Userdaten abfragen
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    // User zum Guild hinzufügen mit Rolle
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

    // User als verifiziert speichern
    verifiedUsers.add(`${userData.username}#${userData.discriminator}`);

    // Erfolgsseite anzeigen
    res.send(`
      <h1>Du bist verifiziert!</h1>
      <p>Du kannst diese Seite jetzt schließen.</p>
    `);
  } catch (error) {
    console.error(error);
    res.send('Fehler während des Verifizierungsprozesses.');
  }
});

// Admin Login Seite
app.get('/admin', (req, res) => {
  res.send(`
    <h1>Admin Login</h1>
    <form method="POST" action="/admin/login">
      <input name="password" type="password" placeholder="Passwort" required/>
      <button type="submit">Login</button>
    </form>
  `);
});

// Admin Login POST (ohne Sessions, sehr simpel)
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
  res.send(`
    <h1>Admin Dashboard</h1>
    <h2>Verifizierte User</h2>
    <ul>
      ${[...verifiedUsers].map(u => `<li>${u}</li>`).join('')}
    </ul>
    <p><a href="/">Zur Startseite</a></p>
  `);
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
