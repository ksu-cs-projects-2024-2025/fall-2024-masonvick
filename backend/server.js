// backend/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// using ip address instead of domain name for db connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

//google login
const passport = require('passport');
const GOOGLE_CLIENT_ID = '1057299967062-eio17t4tmo4nmbm7pfaakfehcli75flk.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

//encryption for other login
const bcrypt = require('bcrypt');  // Add bcrypt for password hashing
const saltRounds = 10;

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

app.use(express.json());  // To parse JSON bodies
app.use(express.urlencoded({ extended: true }));  // To parse URL-encoded bodies (for form submissions)

console.log('Initializing Tic-Tac-Toe Router...');
const ticTacToeRouter = require('./routes/tictactoe')(io);
console.log('Tic-Tac-Toe Router Initialized');

console.log('Initializing Lightbikes Router...');
const lightbikesRouter = require('./routes/lightbikes')(io);
console.log('Lightbikes Router Initialized');

// game routers (middleware registration)
app.use('/tic-tac-toe', ticTacToeRouter);  // Tic-Tac-Toe
app.use('/lightbikes', lightbikesRouter);  // Lightbikes

/////////////////////////////database stuff
const sql = require('mssql');

// Configuration object for SQL Server connection
///*
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
//*/

// Configuration object for SQL Server connection
/*
const dbConfig = {
    user: 'DGUser',         // Your SQL Server username
    password: 'J4v!wD8#tA8n4$',     // Your SQL Server password
    server: '162.214.201.153',          // Your SQL Server instance
    database: 'DuelGames',          // The database you created
    options: {
        encrypt: false,            // Required if you're using Azure
        trustServerCertificate: false // Use this for self-signed certificates or localhost
    }
};
*/

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
    console.log("Google profile:", profile);
    return done(null, profile);
  }
));

// Serialize the user ID to store in the session
passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.Id);  // Log user ID
    done(null, user.Id);  // Store the user ID in the session
});

// Deserialize the user by finding them in the database using the user ID
passport.deserializeUser(async (id, done) => {
    //console.log('Deserializing user with ID:', id);
    try {
        const result = await sql.query`SELECT * FROM Users WHERE Id = ${id}`;
        if (result.recordset.length === 0) {
            return done(new Error('User not found'), null);
        }
        const user = result.recordset[0];
        done(null, user);  // Attach the user object to the request
    } catch (err) {
        done(err, null);
    }
});

// Set up session management
app.use(session({
    secret: 'your-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,      // Prevent JavaScript access to the cookie
        secure: false,       // Use true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 1 day session lifetime
    }
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
        const username = email.split('@')[0];  // Extract the username from the email

        try {
            // Check if the user exists in the Users table
            const result = await sql.query`SELECT * FROM Users WHERE GoogleId = ${id}`;

            if (result.recordset.length === 0) {
                // Insert the user into the Users table with their GoogleId
                await sql.query`
                    INSERT INTO Users (GoogleId, Username, Name, Email)
                    VALUES (${id}, ${username}, ${displayName}, ${email})`;

                console.log('New Google user inserted into the database');
            } else {
                console.log('Google user already exists in the database');
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
        // Send back the logged-in user's ID
        return res.json({ userId: req.user.Id });
    } else {
        // If the user is not authenticated, return an error
        return res.status(401).json({ message: 'User not authenticated' });
    }
});

//api endpoint to verify if the user is logged in
app.get('/api/session', (req, res) => {
    if (req.isAuthenticated()) { // This assumes you're using a library like Passport.js
        res.json({
            isAuthenticated: true,
            userId: req.user.Id,      // Replace with your user object property
            username: req.user.Username // Replace with your user object property
        });
    } else {
        res.json({
            isAuthenticated: false
        });
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

// Handle user registration
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    console.log('Received registration request:', { username, email, password });

    // Default Name and GoogleId to NULL for non-Google users
    const name = null;
    const googleId = null;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    try {
        // Check if the username or email already exists
        const existingUser = await sql.query`
            SELECT * FROM Users WHERE Username = ${username} OR Email = ${email}`;
        
        if (existingUser.recordset.length > 0) {
            const isUsernameTaken = existingUser.recordset.some(user => user.Username === username);
            const isEmailTaken = existingUser.recordset.some(user => user.Email === email);

            if (isUsernameTaken) {
                return res.status(400).json({ message: 'Username is already taken' });
            }
            if (isEmailTaken) {
                return res.status(400).json({ message: 'Email is already registered' });
            }
        }

        // Hash the password before saving it to the database
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const createdAt = new Date();

        console.log('Inserting user with:', { username, email, hashedPassword, createdAt, name, googleId });

        // Insert the user into the Users table
        await sql.query`
            INSERT INTO Users (Username, Email, Password, CreatedAt, Name, GoogleId)
            VALUES (${username}, ${email}, ${hashedPassword}, ${createdAt}, ${name}, ${googleId})`;

        res.status(200).json({ message: 'User registered successfully!' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


app.post('/login', async (req, res) => {
    const { emailOrUsername, password } = req.body;

    console.log('Login request received:', { emailOrUsername, password });

    if (!emailOrUsername || !password) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    try {
        // SQL query to check user credentials
        const request = new sql.Request();
        request.input('emailOrUsername', sql.NVarChar, emailOrUsername);

        const result = await request.query(`
            SELECT * FROM Users 
            WHERE Email = @emailOrUsername OR Username = @emailOrUsername
        `);

        if (result.recordset.length === 0) {
            return res.status(400).json({ message: 'User not found' });
        }

        const user = result.recordset[0];
        const isMatch = await bcrypt.compare(password, user.Password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        console.log('Password match success! Logging in...');

        req.login(user, function(err) {
            if (err) {
                console.error('Login error:', err);
                return res.status(500).json({ message: 'Error logging in' });
            }

            // **NEW**: Send the userId back to the frontend after successful login
            return res.status(200).json({
                success: true,
                userId: user.Id,  // Send the userId to the client
                username: user.Username  // Send the username for display if needed
            });
        });

    } catch (error) {
        console.error('Error logging in user:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
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


// Add the leaderboard route
/*app.get('/leaderboard/:game', async (req, res) => {
    const gameType = req.params.game;

    try {
        // Fetch leaderboard data for the specified game type (e.g., Tic Tac Toe)
        const result = await sql.query`
            SELECT 
                Users.Id AS UserId,
                Users.Username AS UserName,
                -- Calculate total wins for the user
                SUM(CASE WHEN TicTacToeGames.WinnerId = Users.Id THEN 1 ELSE 0 END) AS TotalWins,
                -- Calculate total losses for the user
                SUM(CASE WHEN (TicTacToeGames.Player1Id = Users.Id OR TicTacToeGames.Player2Id = Users.Id) AND TicTacToeGames.WinnerId != Users.Id THEN 1 ELSE 0 END) AS TotalLosses,
                -- Only include users who have played games (either wins or losses)
                COUNT(TicTacToeGames.GameId) AS TotalGames,
                -- Calculate the average moves per game, cast to float for precision
                CAST(AVG(CAST(LEN(TicTacToeGames.Moves) / 2.0 AS FLOAT)) AS DECIMAL(10, 2)) AS AverageMovesPerGame,
                -- Calculate the average game length in seconds, cast to float for precision
                CAST(AVG(CAST(DATEDIFF(SECOND, TicTacToeGames.StartTime, TicTacToeGames.EndTime) AS FLOAT)) AS DECIMAL(10, 2)) AS AverageGameLengthInSeconds
            FROM 
                Users
            LEFT JOIN 
                TicTacToeGames ON Users.Id IN (TicTacToeGames.Player1Id, TicTacToeGames.Player2Id)
            -- Exclude users with 0 total games (no wins or losses)
            WHERE 
                TicTacToeGames.GameId IS NOT NULL
            GROUP BY 
                Users.Id, Users.Username
            HAVING 
                SUM(CASE WHEN TicTacToeGames.WinnerId = Users.Id OR TicTacToeGames.WinnerId != Users.Id THEN 1 ELSE 0 END) > 0
            ORDER BY 
                TotalWins DESC, AverageMovesPerGame ASC;
        `;

        res.json(result.recordset);  // Send the leaderboard data as JSON
    } catch (err) {
        console.error('Error fetching leaderboard data:', err);
        res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
    }
});*/

app.get('/leaderboard/:game', async (req, res) => {
    const gameType = req.params.game;

    try {
        let query;
        if (gameType === 'tic-tac-toe') {
            query = `
                SELECT 
                    Users.Id AS UserId,
                    Users.Username AS UserName,
                    SUM(CASE WHEN TicTacToeGames.WinnerId = Users.Id THEN 1 ELSE 0 END) AS TotalWins,
                    SUM(CASE WHEN (TicTacToeGames.Player1Id = Users.Id OR TicTacToeGames.Player2Id = Users.Id) AND TicTacToeGames.WinnerId != Users.Id THEN 1 ELSE 0 END) AS TotalLosses,
                    COUNT(TicTacToeGames.GameId) AS TotalGames,
                    CAST(AVG(CAST(LEN(TicTacToeGames.Moves) / 2.0 AS FLOAT)) AS DECIMAL(10, 2)) AS AverageMovesPerGame,
                    CAST(AVG(CAST(DATEDIFF(SECOND, TicTacToeGames.StartTime, TicTacToeGames.EndTime) AS FLOAT)) AS DECIMAL(10, 2)) AS AverageGameLengthInSeconds
                FROM 
                    Users
                LEFT JOIN 
                    TicTacToeGames ON Users.Id IN (TicTacToeGames.Player1Id, TicTacToeGames.Player2Id)
                WHERE 
                    TicTacToeGames.GameId IS NOT NULL
                GROUP BY 
                    Users.Id, Users.Username
                ORDER BY 
                    TotalWins DESC, AverageMovesPerGame ASC;
            `;
        } else if (gameType === 'lightbikes') {
            query = `
                SELECT 
                    Users.Id AS UserId,
                    Users.Username AS UserName,
                    -- Total Wins
                    SUM(CASE WHEN LightbikesGames.WinnerId = Users.Id THEN 1 ELSE 0 END) AS TotalWins,
                    -- Total Losses
                    SUM(CASE WHEN 
                        (LightbikesGames.Player1Id = Users.Id OR LightbikesGames.Player2Id = Users.Id) 
                        AND LightbikesGames.WinnerId != Users.Id 
                    THEN 1 ELSE 0 END) AS TotalLosses,
                    -- Win/Loss Ratio
                    CAST(SUM(CASE WHEN LightbikesGames.WinnerId = Users.Id THEN 1 ELSE 0 END) AS FLOAT) /
                    NULLIF(SUM(CASE WHEN (LightbikesGames.Player1Id = Users.Id OR LightbikesGames.Player2Id = Users.Id) THEN 1 ELSE 0 END), 0) AS WinLossRatio,
                    -- Average Steers Per Game
                    CAST(SUM(CASE 
                        WHEN LightbikesGames.Player1Id = Users.Id 
                            THEN LEN(LightbikesGames.Player1Steers) - LEN(REPLACE(LightbikesGames.Player1Steers, ',', '')) + 1
                        WHEN LightbikesGames.Player2Id = Users.Id 
                            THEN LEN(LightbikesGames.Player2Steers) - LEN(REPLACE(LightbikesGames.Player2Steers, ',', '')) + 1
                    END) AS FLOAT) /
                    NULLIF(SUM(CASE 
                        WHEN LightbikesGames.Player1Id = Users.Id OR LightbikesGames.Player2Id = Users.Id THEN 1 ELSE 0 
                    END), 0) AS AverageSteersPerGame,
                    -- Average Trail Length
                    CAST(AVG(CASE 
                        WHEN LightbikesGames.Player1Id = Users.Id 
                            THEN CAST(LightbikesGames.Player1TrailLength AS FLOAT)
                        WHEN LightbikesGames.Player2Id = Users.Id 
                            THEN CAST(LightbikesGames.Player2TrailLength AS FLOAT)
                    END) AS DECIMAL(10, 2)) AS AverageTrailLength,
                    -- Longest Trail Length
                    MAX(CASE 
                        WHEN LightbikesGames.Player1Id = Users.Id 
                            THEN CAST(LightbikesGames.Player1TrailLength AS FLOAT)
                        WHEN LightbikesGames.Player2Id = Users.Id 
                            THEN CAST(LightbikesGames.Player2TrailLength AS FLOAT)
                    END) AS LongestTrailLength
                FROM 
                    Users
                LEFT JOIN 
                    LightbikesGames ON Users.Id IN (LightbikesGames.Player1Id, LightbikesGames.Player2Id)
                WHERE 
                    LightbikesGames.GameId IS NOT NULL
                GROUP BY 
                    Users.Id, Users.Username
                ORDER BY 
                    TotalWins DESC, AverageSteersPerGame ASC;
            `;
        } else {
            return res.status(400).json({ error: 'Unsupported game type' });
        }

        const result = await sql.query(query);
        res.json(result.recordset); // Send the leaderboard data as JSON
    } catch (err) {
        console.error('Error fetching leaderboard data:', err);
        res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
    }
});


app.get('/api/user-stats', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const userId = req.user.Id;
        const stats = await sql.query`
            SELECT 
                (SELECT COUNT(*) FROM TicTacToeGames WHERE WinnerId = ${userId}) AS TicTacToeWins,
                (SELECT COUNT(*) FROM TicTacToeGames WHERE (Player1Id = ${userId} OR Player2Id = ${userId}) AND WinnerId != ${userId}) AS TicTacToeLosses,
                (SELECT COUNT(*) FROM LightbikesGames WHERE WinnerId = ${userId}) AS LightbikesWins,
                (SELECT COUNT(*) FROM LightbikesGames WHERE (Player1Id = ${userId} OR Player2Id = ${userId}) AND WinnerId != ${userId}) AS LightbikesLosses
        `;
        res.json(stats.recordset[0]);
    } catch (err) {
        console.error('Error fetching user stats:', err);
        res.status(500).json({ error: 'Failed to retrieve stats' });
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
