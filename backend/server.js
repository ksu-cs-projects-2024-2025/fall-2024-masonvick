// backend/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

//google login
const passport = require('passport');
const GOOGLE_CLIENT_ID = '1057299967062-eio17t4tmo4nmbm7pfaakfehcli75flk.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

// Import the matchmaking manager
const matchmakingManager = require('./matchmakingManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the frontend/html directory (e.g., HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../frontend/html')));

//if you're using different ports (Cross-Origin Resource Sharing)
const cors = require('cors');
app.use(cors()); // Use this BEFORE your route definitions


console.log('Initializing Tic-Tac-Toe Router...');
const ticTacToeRouter = require('./routes/tictactoe')(io);
console.log('Tic-Tac-Toe Router Initialized');

console.log('Initializing Battleship Router...');
const battleshipRouter = require('./routes/battleship')(io);
console.log('Battleship Router Initialized');

// game routers (middleware registration)
app.use('/tic-tac-toe', ticTacToeRouter);  // Tic-Tac-Toe
app.use('/battleship', battleshipRouter);  // Battleship (empty for now)


/////////////////////////////database stuff
const sql = require('mssql');

// Configuration object for SQL Server connection
const dbConfig = {
    user: 'sa',         // Your SQL Server username
    password: 'pw',     // Your SQL Server password
    server: 'DESKTOP-6MJKC5D',          // Your SQL Server instance
    database: 'siteDB',          // The database you created
    options: {
        encrypt: true,            // Required if you're using Azure
        trustServerCertificate: true // Use this for self-signed certificates or localhost
    }
};

// Function to connect to the SQL Server database
async function connectToDatabase() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to SQL Server');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}

// Call the connect function when your app starts
connectToDatabase();



// Configure Passport.js
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    // Save user info to database.
    // for now, return the profile
    return done(null, profile);
  }
));

// Serialize and deserialize user
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Set up session management
app.use(session({
    secret: 'your-session-secret',
    resave: false,
    saveUninitialized: true,
}));

// Initialize Passport.js
app.use(passport.initialize());
app.use(passport.session());

// Routes for Google OAuth
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);
  
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    async (req, res) => {
        const { id, displayName, emails } = req.user;  // Extract user info from Google
        const email = emails[0].value;

        try {
            // Check if the user exists in the Users table
            const result = await sql.query`SELECT * FROM Users WHERE GoogleId = ${id}`;
            
            if (result.recordset.length === 0) {
                // If the user doesn't exist, insert them into the Users table
                await sql.query`INSERT INTO Users (GoogleId, Name, Email) VALUES (${id}, ${displayName}, ${email})`;
                console.log('New user inserted into the database');
            } else {
                console.log('User already exists in the database');
            }

            res.redirect('/account');  // Redirect to the user's account page
        } catch (err) {
            console.error('Error interacting with the database:', err);
            res.redirect('/');
        }
    }
);

// Send user data via an API route (for Google ID)
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        // Send the authenticated user's info (Google ID)
        res.json({ userId: req.user.id });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// account routers
app.get('/account', (req, res) => {
    if (req.isAuthenticated()) {
        console.log('Logged in user:', req.user);  // Display logged in user
        //res.json({ user: req.user });  // Send user info to frontend
        res.sendFile(path.join(__dirname, '../frontend/html/account.html'));
    } else {
      res.redirect('/');
    }
  });

app.post('/register', (req, res) => {
const { username, email, password } = req.body;

// This info will be stored in a database eventually
if (username && email && password) {
    res.status(200).json({ message: 'User registered successfully!' });
} else {
    res.status(400).json({ message: 'All fields are required!' });
}
});

app.get('/check-login', (req, res) => {
    res.json({ loggedIn: req.isAuthenticated() });
});




// Endpoint to create a new game session of a specific type
app.post('/create-game', (req, res) => {
    if (!req.body.gameType) {
        return res.status(400).send({ error: 'Game type is required' });
    }
    try {
        const gameType = req.body.gameType;
        const gameId = matchmakingManager.createGameSession(gameType);
        res.json({ gameId });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to create game session' });
    }
});

// Endpoint to join a specific game using a gameId
app.post('/join-game', (req, res) => {
    const { gameId, playerId } = req.body;
    if (!gameId || !playerId) {
        return res.status(400).send({ error: 'Game ID and Player ID are required' });
    }
    try {
        if (matchmakingManager.joinGame(gameId, playerId)) {
            res.json({ success: true, gameId });
        } else {
            res.status(404).send({ error: 'Game not found or is full.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to join game' });
    }
});

// Endpoint for quick match
app.post('/quick-match', (req, res) => {
    const { gameType, playerId } = req.body;
    const gameId = matchmakingManager.findMatch(gameType, playerId, io);
    if (gameId) {
        console.log(`Game ID ${gameId} created, notifying players`);
        res.json({ success: true, gameId });
    } else {
        res.status(202).send({ message: "Added to quick match queue." });
    }
});



app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
