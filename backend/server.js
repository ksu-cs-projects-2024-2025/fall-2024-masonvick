//import basic requirements for server stuff
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
