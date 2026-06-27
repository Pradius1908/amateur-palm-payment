async function fetchUsers() {
    try {
        const res = await fetch('/users');
        const users = await res.json();
        renderUsers(users);
    } catch (err) {
        console.error('Error fetching users:', err);
    }
}

function renderUsers(users) {
    const tbody = document.querySelector('#admin-users-table tbody');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.id}</td>
            <td>${u.name}</td>
            <td>${u.balance.toFixed(2)}</td>
            <td>
                <button class="btn edit-btn" onclick="updateBalance(${u.id}, '${u.name}', ${u.balance})">Edit Balance</button>
                <button class="btn delete-btn" onclick="deleteUser(${u.id}, '${u.name}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function updateBalance(id, name, currentBalance) {
    const newBalance = prompt(`Enter new balance for ${name}:`, currentBalance);
    if (newBalance !== null && !isNaN(newBalance)) {
        try {
            const res = await fetch(`/users/${id}/balance?balance=${newBalance}`, {
                method: 'PUT'
            });
            if (res.ok) {
                alert('Balance updated successfully');
                fetchUsers();
            } else {
                const data = await res.json();
                alert(`Error: ${data.detail}`);
            }
        } catch (err) {
            console.error('Update failed:', err);
        }
    }
}

async function deleteUser(id, name) {
    if (confirm(`Are you sure you want to delete user ${name}?`)) {
        try {
            const res = await fetch(`/users/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                alert('User deleted');
                fetchUsers();
            } else {
                alert('Failed to delete user');
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    }
}

// Initial fetch
fetchUsers();
