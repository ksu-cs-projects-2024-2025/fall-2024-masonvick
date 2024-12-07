// frontend/authCheck.js
function checkSession() {
    fetch('/api/session', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            const loginIndicator = document.getElementById('loginIndicator');
            if (data.isAuthenticated) {
                loginIndicator.textContent = `Logged in as ${data.username}`;
                loginIndicator.style.color = "green";
            } else {
                loginIndicator.textContent = 'Not logged in';
                loginIndicator.style.color = "red";
            }
        })
        .catch(error => {
            console.error('Error checking session:', error);
            const loginIndicator = document.getElementById('loginIndicator');
            if (loginIndicator) {
                loginIndicator.textContent = 'Error checking session';
                loginIndicator.style.color = "red";
            }
        });
}

// Automatically check session when the page loads
document.addEventListener('DOMContentLoaded', checkSession);

