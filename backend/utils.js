// backend/utils.js
const sql = require('mssql');

async function getPlayerSkillRating(userId, gameType) {
    let query;

    if (gameType === 'tic-tac-toe') {
        query = sql.query`SELECT COUNT(*) AS Wins FROM TicTacToeGames WHERE WinnerId = ${userId};
                           SELECT COUNT(*) AS Total FROM TicTacToeGames WHERE Player1Id = ${userId} OR Player2Id = ${userId};`;
    } else if (gameType === 'lightbikes') {
        query = sql.query`SELECT COUNT(*) AS Wins FROM LightbikesGames WHERE WinnerId = ${userId};
                           SELECT COUNT(*) AS Total FROM LightbikesGames WHERE Player1Id = ${userId} OR Player2Id = ${userId};`;
    }

    const result = await query;
    const wins = result.recordsets[0][0].Wins;
    const total = result.recordsets[1][0].Total;

    // If no games played, default rating
    if (total === 0) return 1000;

    const winRatio = wins / total;
    const rating = 1000 + winRatio * 500;

    return Math.floor(rating); 
}


module.exports = {
    getPlayerSkillRating
};
