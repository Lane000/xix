document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                username,
                password
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Успешный вход - перенаправляем на главную страницу
            window.location.href = '/';
        } else {
            showError(data.error || 'Неверное имя пользователя или пароль');
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