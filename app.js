require('dotenv').config();
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

// Конфигурация
const SECRET_MANAGER_CODE = process.env.MANAGER_SECRET || 'DEV_MANAGER_CODE_123';

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Настройка CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Настройка сессии
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 день
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

// Маршруты представлений
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

// API Endpoints
app.get('/api/user', requireAuth, (req, res) => {
    res.json({
        id: req.session.userId,
        role: req.session.role,
        fullName: req.session.fullName
    });
});

app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
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

        const tasks = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
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

// Аутентификация
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }

        req.session.regenerate((err) => {
            if (err) {
                console.error('Ошибка сессии:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }

            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.fullName = user.full_name;

            req.session.save((err) => {
                if (err) {
                    console.error('Ошибка сохранения сессии:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json({ success: true });
            });
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/register', async (req, res) => {
    try {
        const { username, password, fullName, secretCode } = req.body;

        if (!username || !password || !fullName) {
            return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        }

        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const role = secretCode === SECRET_MANAGER_CODE ? 'manager' : 'executor';
        const hashedPassword = await bcrypt.hash(password, 10);

        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, role, fullName],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Ошибка регистрации:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Ошибка выхода:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        res.redirect('/login');
    });
});

// Управление задачами
app.post('/tasks', requireAuth, async (req, res) => {
    if (req.session.role !== 'manager') {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const { title, description, executor_id } = req.body;

    try {
        const taskId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO tasks (title, description, status, creator_id, executor_id) VALUES (?, ?, ?, ?, ?)',
                [title, description || '', 'new', req.session.userId, executor_id],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        res.json({ success: true, taskId });
    } catch (err) {
        console.error('Ошибка создания задачи:', err);
        res.status(500).json({ error: 'Ошибка создания задачи' });
    }
});

app.post('/tasks/:id/update', requireAuth, async (req, res) => {
    if (req.session.role !== 'manager') {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const { title, description, executor_id, status } = req.body;

    try {
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE tasks SET title = ?, description = ?, executor_id = ?, status = ? WHERE id = ?',
                [title, description || '', executor_id, status, req.params.id],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления задачи:', err);
        res.status(500).json({ error: 'Ошибка обновления задачи' });
    }
});

app.post('/tasks/:id/delete', requireAuth, async (req, res) => {
    if (req.session.role !== 'manager') {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления задачи:', err);
        res.status(500).json({ error: 'Ошибка удаления задачи' });
    }
});

app.post('/tasks/:id/status', requireAuth, async (req, res) => {
    if (req.session.role !== 'executor') {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const { status } = req.body;

    try {
        const task = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM tasks WHERE id = ? AND executor_id = ?',
                [req.params.id, req.session.userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
        });

        if (!task) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE tasks SET status = ? WHERE id = ?',
                [status, req.params.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления статуса:', err);
        res.status(500).json({ error: 'Ошибка обновления статуса' });
    }
});

// Обработка 404
app.use((req, res) => {
    res.status(404).send('Страница не найдена');
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка приложения:', err.stack);
    res.status(500).send('Что-то сломалось!');
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log(`Секретный код для менеджеров: ${SECRET_MANAGER_CODE}`);
});