const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Подключение к базе данных
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the in-memory SQLite database.');
});

// Инициализация базы данных
const initDB = () => {
    db.serialize(() => {
        // Создание таблицы пользователей
        db.run(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('manager', 'executor')),
      full_name TEXT NOT NULL
    )`);

        // Создание таблицы задач
        db.run(`CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL CHECK(status IN ('new', 'in_progress', 'completed', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deadline DATETIME,
      creator_id INTEGER NOT NULL,
      executor_id INTEGER NOT NULL,
      FOREIGN KEY (creator_id) REFERENCES users (id),
      FOREIGN KEY (executor_id) REFERENCES users (id)
    )`);

        // Создание тестовых пользователей
        const salt = bcrypt.genSaltSync(10);
        const managerPassword = bcrypt.hashSync('manager123', salt);
        const executor1Password = bcrypt.hashSync('executor123', salt);
        const executor2Password = bcrypt.hashSync('executor456', salt);

        db.run(`INSERT INTO users (username, password, role, full_name) 
            VALUES (?, ?, ?, ?)`,
            ['manager', managerPassword, 'manager', 'Иван Иванов']);

        db.run(`INSERT INTO users (username, password, role, full_name) 
            VALUES (?, ?, ?, ?)`,
            ['executor1', executor1Password, 'executor', 'Петр Петров']);

        db.run(`INSERT INTO users (username, password, role, full_name) 
            VALUES (?, ?, ?, ?)`,
            ['executor2', executor2Password, 'executor', 'Сергей Сергеев']);

        // Создание тестовых задач
        db.run(`INSERT INTO tasks (title, description, status, creator_id, executor_id) 
            VALUES (?, ?, ?, ?, ?)`,
            ['Разработать дизайн', 'Дизайн главной страницы', 'new', 1, 2]);

        db.run(`INSERT INTO tasks (title, description, status, creator_id, executor_id) 
            VALUES (?, ?, ?, ?, ?)`,
            ['Написать код', 'Реализовать API', 'in_progress', 1, 3]);

        db.run(`INSERT INTO tasks (title, description, status, creator_id, executor_id) 
            VALUES (?, ?, ?, ?, ?)`,
            ['Протестировать', 'Провести unit-тесты', 'completed', 1, 2]);
    });
};

module.exports = { db, initDB };

module.exports = {
    db,
    initDB,
    getUserByUsername: (username, callback) => {
        db.get('SELECT * FROM users WHERE username = ?', [username], callback);
    },
    createUser: (userData, callback) => {
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(userData.password, salt);

        db.run(
            `INSERT INTO users (username, password, role, full_name) 
         VALUES (?, ?, ?, ?)`,
            [userData.username, hashedPassword, userData.role || 'executor', userData.fullName],
            callback
        );
    }
};