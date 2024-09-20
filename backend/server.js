//import basic requirements for server stuff
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

//create express app
const app = express();

//make server using express & socketio server using the server
const server = http.createServer(app);
const io = new Server(server);

// making the gamestate to store game info
let gameState = {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    winner: null,  
};

// Serve static files from the frontend/html directory (not sure if this is needed... confused how it works)
app.use(express.static(path.join(__dirname, '../frontend/html')));

// Handle new WebSocket connections (when a client connects to the server)
io.on('connection', (socket) => {
    console.log('A user connected');

    // Send the initial game state to the newly connected user.
    // Best to do upon connection
    socket.emit('gameState', gameState);

    // Handle player moves
    socket.on('makeMove', (index) => {
        //check if a square is occupied
        if (gameState.board[index] || gameState.winner) return;

        // Update game state
        gameState.board[index] = gameState.currentPlayer;
        gameState.winner = checkWinner(gameState.board);

        if (!gameState.winner) {
            gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
        }

        // Broadcast the updated game state to all connected users
        io.emit('gameState', gameState);
    });

    // Handle game reset (currently just clear the board)
    socket.on('resetGame', () => {
        //put gamestate back to initial values
        gameState = {
            board: Array(9).fill(null),
            currentPlayer: 'X',
            winner: null,
        };
        io.emit('gameState', gameState);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Function to check if there's a winner
function checkWinner(board) {
    const winningCombinations = [
        //winning combinations
        [0, 1, 2],[3, 4, 5],[6, 7, 8], //horizontals
        [0, 3, 6],[1, 4, 7],[2, 5, 8], //verticals
        [0, 4, 8],[2, 4, 6], //diagonals
    ];

    //loop for each winning combination
    for (let combination of winningCombinations) {
        //turn each one into a,b,c (instead of specific numbers)
        const [a, b, c] = combination;
        //see if that combination consists of 3 of the same letter
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }

    return null; //no winner
}





///////////////// Google Sign in Stuff

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


//////////////SQL database stuff
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



// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
