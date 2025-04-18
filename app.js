const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { db, initDB } = require('./database');

// Инициализация базы данных
initDB();

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    },
    name: 'taskManager.sid'
}));

// Проверка аутентификации
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        if (req.xhr || req.headers.accept?.includes('json')) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }
        return res.redirect('/login');
    }
    next();
};

// Маршруты
app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');

    const registered = req.query.registered === 'true';
    const loginHTML = fs.readFileSync(path.join(__dirname, 'views', 'login.html'), 'utf8');
    const modifiedHTML = loginHTML.replace(
        '<div id="errorMessage"',
        registered ? '<div class="success-message">Регистрация успешна! Войдите в систему.</div><div id="errorMessage"'
            : '<div id="errorMessage"'
    );
    res.send(modifiedHTML);
});

app.get('/register', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'tasks.html'));
});

app.get('/api/user', requireAuth, (req, res) => {
    res.json({
        id: req.session.userId,
        role: req.session.role,
        fullName: req.session.fullName
    });
});

app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
        console.log(`Запрос задач для ${req.session.role} ID:${req.session.userId}`);

        let sql = `SELECT t.*, u1.full_name as creator_name, u2.full_name as executor_name 
               FROM tasks t
               JOIN users u1 ON t.creator_id = u1.id
               JOIN users u2 ON t.executor_id = u2.id`;
        const params = [];

        if (req.session.role === 'executor') {
            sql += ' WHERE t.executor_id = ?';
            params.push(req.session.userId);
        } else if (req.query.executor && req.query.executor !== 'all') {
            sql += ' WHERE t.executor_id = ?';
            params.push(req.query.executor);
        }

        if (req.query.status && req.query.status !== 'all') {
            sql += params.length ? ' AND' : ' WHERE';
            sql += ' t.status = ?';
            params.push(req.query.status);
        }

        sql += ' ORDER BY t.created_at DESC';

        console.log('Выполняем SQL:', sql, 'Параметры:', params);

        const tasks = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('SQL error:', err);
                    reject(err);
                } else {
                    console.log('Найдено задач:', rows.length);
                    resolve(rows);
                }
            });
        });

        res.json(tasks);
    } catch (err) {
        console.error('Ошибка получения задач:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/executors', requireAuth, async (req, res) => {
    if (req.session.role !== 'manager') {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }

    try {
        const executors = await new Promise((resolve, reject) => {
            db.all('SELECT id, full_name FROM users WHERE role = "executor"', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(executors);
    } catch (err) {
        console.error('Ошибка получения исполнителей:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});