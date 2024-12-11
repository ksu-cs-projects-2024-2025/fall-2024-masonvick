# DuelGames

This project is a site where users can create accounts and play simple javascript games against one another.

The platform consists of:
- A **frontend** built with HTML, CSS, and JavaScript.
- A **backend** powered by Node.js, Express, and Socket.IO.
- A SQL Server **database** for user and game data storage.

---

## Getting Started

Follow the steps below to set up the platform on your local machine.

### Prerequisites

Ensure you have the following installed:

- **Node.js** (v14 or later)
- **npm** (Node Package Manager, comes with Node.js)
- **SQL Server** (local or remote instance)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository_url>
   cd <repository_folder>
   ```

2. Install the required Node.js modules:
   ```bash
   npm install
   ```

3. Set up the SQL database:
   - Create a new SQL database (e.g., `siteDB`).
   - Run the database creation script provided in `scripts/createDatabase.sql`.

     #### To run the script in SQL Server Management Studio (SSMS):
     1. Open SSMS and connect to your SQL Server instance.
     2. File > Open > createDatabase.sql
     3. Execute the script.

4. Update the database configuration in `backend/server.js`:
   ```javascript
   const dbConfig = {
       user: 'your_username',
       password: 'your_password',
       server: 'your_server',
       database: 'siteDB',
       options: {
           encrypt: true, // Use true if using Azure
           trustServerCertificate: true // For self-signed certificates or localhost
       }
   };
   ```

5. Launch the frontend:
   - Open the `frontend/html` directory in your browser or use a development server (e.g., Live Server in VS Code).

### Running the Backend

Start the backend server using `nodemon` for live updates during development:
```bash
npx nodemon backend/server.js
```

The backend will run on `http://localhost:3000` by default.

---

### Adding New Games
1. Define the game logic in `backend/gameFactory.js`.
2. Add matchmaking logic in `backend/matchmakingManager.js`.
3. Create a new route and controller for the game.
4. Create frontend html and css file for the game.

### Troubleshooting

1. **Database Connection Issues:**
   - Verify the `dbConfig` values in `backend/server.js`.
   - Ensure the SQL Server instance is running and accessible.

2. **Missing Node Modules:**
   - Run `npm install` to install all dependencies.

3. **Port Conflicts:**
   - Ensure no other service is using port 3000. Change the port in `backend/server.js` if needed.

---
