// backend/controllers/lightbikesController.js

const { connect } = require('http2');
const matchmakingManager = require('../matchmakingManager');
const sql = require('mssql');
const connectedPlayers = {};
const WIDTH = 100;
const HEIGHT = 100;

// Function to find or create a match
exports.findMatch = (io, socket, gameType, userId) => {
    console.log(`Looking for a match for player ${userId} in game type ${gameType}`);

    connectedPlayers[userId] = socket.id;

    const match = matchmakingManager.findLightbikesMatch(io, userId, connectedPlayers);

    if (match) {
        const { gameId, players } = match;
        
        players.forEach(playerId => {
            const playerSocket = io.of('/lightbikes').sockets.get(connectedPlayers[playerId]);
            if (playerSocket) {
                playerSocket.join(gameId);
                console.log(`Player ${playerId} joined room ${gameId}`);
                playerSocket.emit('matchFound', { gameId, players }); // Notify both players of the match
            } else {
                console.error(`Socket not found for player ${playerId}`);
            }
        });

        exports.emitGameState(io, gameId); // Emit initial game state
        exports.startGame(io, gameId); // Start game loop
    } else {
        console.log(`User ${userId} is waiting for a match in ${gameType}`);
    }
};



// Start the game
exports.startGame = (io, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found.`);
        return;
    }

    // Initialize game state and players' starting positions
    game.gameState = game.initializeGameState();
    game.state = new Uint8Array(WIDTH * HEIGHT); // Store the grid as a 1D array for trails

    game.players.forEach((playerId, index) => {
        const startingPosition = getRandomStartingPosition();
        
        // Initialize player positions and trails
        game.gameState.playerPositions[playerId] = {
            x: startingPosition.x,
            y: startingPosition.y,
            direction: getRandomDirection(),
            trail: [{ x: startingPosition.x, y: startingPosition.y }],
            color: index === 0 ? 'red' : 'blue'  // Color-code players
        };
        console.log(`Initialized player ${playerId} at position:`, game.gameState.playerPositions[playerId]);
    });

    // Emit the initialized game state to players before starting the loop
    exports.emitGameState(io, gameId);
    console.log(`Starting lightbikes game ${gameId} with players:`, game.players);

    // Set up the main game loop to move players and check for collisions
    game.interval = setInterval(() => {
        // Stop the loop if the game is over
        if (game.gameState.gameOver) {
            clearInterval(game.interval);
            clearInterval(game.interval);  // Stop the loop if the game is over
            const endTime = new Date();    // Capture game end time
            const moves = JSON.stringify(game.gameState.moves);  // Convert moves to string for database storage

            // Store game in the database
            storeLightbikesGameInDB(
                game.players[0],                  // Player 1 ID
                game.players[1],                  // Player 2 ID
                getOpponent(game.gameState.winner, game), // Winner ID
                moves,                            // Serialized moves
                game.startTime,
                endTime
            );
            return;
        }

        console.log(`Game loop running for gameId ${gameId}`);

        game.players.forEach(playerId => {
            const player = game.gameState.playerPositions[playerId];
            console.log(`Moving player ${playerId} in direction ${player.direction}`);

            // Update player position based on current direction
            switch (player.direction) {
                case 'up': player.y--; break;
                case 'down': player.y++; break;
                case 'left': player.x--; break;
                case 'right': player.x++; break;
                default:
                    console.error(`Invalid direction for player ${playerId}: ${player.direction}`);
                    break;
            }

            console.log(`Player ${playerId} new position: (${player.x}, ${player.y})`);

            // Add current position to player's trail
            player.trail.push({ x: player.x, y: player.y });

            // Check for collisions with walls, other players, or trails
            if (checkCollision(game, player)) {
                game.gameState.gameOver = true;
                io.of('/lightbikes').to(gameId).emit('gameOver', { winner: getOpponent(playerId, game) });
                console.log(`Game over due to collision for player ${playerId}`);
                return;
            }

            // Update grid position for the player's trail
            game.state[player.y * WIDTH + player.x] = playerId;
        });

        // Emit the updated game state after all players have moved
        exports.emitGameState(io, gameId);
    }, 100);  // Game loop interval for real-time updates
};



// Emit the game state to all players
exports.emitGameState = (io, gameId) => {
    const game = matchmakingManager.games[gameId];
    if (game) {
        //const gameState = game.gameState;
        console.log(`Emitting game state for gameId ${gameId} to room ${gameId}`); 
        io.of('/lightbikes').to(gameId).emit('gameState', game.gameState);  // Emit to all players in the room
    } else {
        console.error(`Game with ID ${gameId} not found.`);
    }
};


// Handle steering when arrow keys are pressed
exports.handleSteer = (io, socket, { gameId, direction }) => {
    console.log(`Received steering input: ${direction} for gameId: ${gameId}`);  // Debugging log

    const game = matchmakingManager.games[gameId];
    
    if (game && game.gameState.playerPositions[socket.userId]) {
        console.log(`Updating direction for player ${socket.userId} to ${direction}`);  // Debugging log
        
        // Update the player's direction in the game state
        game.gameState.playerPositions[socket.userId].direction = direction;

        // Emit updated game state to all players after the direction change
        io.of('/lightbikes').to(gameId).emit('gameState', game.gameState);
        console.log(`Player ${socket.userId}'s new direction: ${game.gameState.playerPositions[socket.userId].direction}`);
    } else {
        console.error(`Player ${socket.userId} or game ${gameId} not found.`);
    }
};


// Function to store Lightbikes game data in the database
async function storeLightbikesGameInDB(player1Id, player2Id, winnerId, moves, startTime, endTime) {
    try {
        // Ensure both player IDs are provided
        if (!player1Id || !player2Id) {
            throw new Error('Could not retrieve one or both player IDs');
        }

        // Log data for debugging
        console.log('Data to insert:', { player1Id, player2Id, winnerId, moves, startTime, endTime });

        // Insert the game record into the LightbikesGames table
        await sql.query`INSERT INTO LightbikesGames (Player1Id, Player2Id, WinnerId, Moves, StartTime, EndTime)
                        VALUES (${player1Id}, ${player2Id}, ${winnerId}, ${moves}, ${startTime}, ${endTime})`;

        console.log('Lightbikes game successfully stored in the database');
    } catch (err) {
        console.error('Error inserting Lightbikes game data into the database:', err);
    }
}


// Get random starting positions, ensuring players aren't too close to each other or walls
function getRandomStartingPosition(game) {
    const gridSize = 100;  // Assuming the grid is 100x100
    const buffer = 10;     // Buffer distance from the walls and between players

    let x, y;
    let validPosition = false;

    while (!validPosition) {
        x = Math.floor(Math.random() * (gridSize - 2 * buffer)) + buffer;  // Avoid walls
        y = Math.floor(Math.random() * (gridSize - 2 * buffer)) + buffer;

        // Check if the position is too close to other players
        validPosition = true;
        for (const playerId in game.gameState.playerPositions) {
            const otherPosition = game.gameState.playerPositions[playerId];
            const distance = Math.sqrt(Math.pow(x - otherPosition.x, 2) + Math.pow(y - otherPosition.y, 2));
            if (distance < buffer) {
                validPosition = false;  // Too close to another player
                break;
            }
        }
    }

    return { x, y };
}

// Function to handle a player joining a game room
exports.joinGame = (io, socket, gameId) => {
    const game = matchmakingManager.games[gameId];

    if (game) {
        console.log(`Player joined game ${gameId}`);
        socket.join(gameId);  // Ensure the socket joins the room
        // Emit the initial game state to the player who joined
        const gameState = game.initializeGameState();
        socket.emit('gameState', gameState);  // Emit directly to the socket
    } else {
        console.error(`Game with ID ${gameId} not found`);
    }
};





// Utility functions for collision detection, random starting positions, etc.
function checkCollision(game, playerPosition) {
    const { x, y } = playerPosition;

    // Check for collision with walls
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
        return true;
    }

    // Check for collision with other players' trails
    if (game.state[y * WIDTH + x] !== 0) {
        return true;
    }

    return false;
}

function getRandomStartingPosition() {
    const buffer = 10;
    return {
        x: Math.floor(Math.random() * (WIDTH - 2 * buffer)) + buffer,
        y: Math.floor(Math.random() * (HEIGHT - 2 * buffer)) + buffer
    };
}

function getRandomDirection() {
    const directions = ['up', 'down', 'left', 'right'];
    return directions[Math.floor(Math.random() * directions.length)];
}

function getOpponent(playerId, game) {
    return game.players.find(id => id !== playerId);
}
