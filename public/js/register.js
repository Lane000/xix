document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const fullName = document.getElementById('fullName').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Валидация на клиенте
    if (password !== confirmPassword) {
        showError('Пароли не совпадают');
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, fullName })
        });

        const data = await response.json();

        if (response.ok) {
            window.location.href = '/login?registered=true';
        } else {
            showError(data.error || 'Ошибка регистрации');
        }
    } catch (error) {
        showError('Ошибка соединения с сервером');
    }
});

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}