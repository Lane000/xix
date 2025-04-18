let currentUser = {};
let tasks = [];
let executors = [];

// DOM элементы
const tasksContainer = document.getElementById('tasksContainer');
const filterForm = document.getElementById('filterForm');
const taskForm = document.getElementById('taskForm');
const editForm = document.getElementById('editForm');
const editModal = document.getElementById('editModal');

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadUserData();
        await loadInitialData();
        setupEventListeners();
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка загрузки данных');
    }
});

async function loadUserData() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login';
                return;
            }
            throw new Error('Ошибка загрузки данных пользователя');
        }
        currentUser = await response.json();
        console.log('Текущий пользователь:', currentUser);
        document.getElementById('userFullName').textContent = currentUser.fullName;

        if (currentUser.role === 'manager') {
            document.getElementById('executorFilter').style.display = 'block';
            document.getElementById('taskFormContainer').style.display = 'block';
            await loadExecutorsForForm();
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
        throw error;
    }
}

async function loadInitialData() {
    try {
        await Promise.all([
            loadTasks(),
            currentUser.role === 'manager' ? loadExecutors() : Promise.resolve()
        ]);
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        throw error;
    }
}

async function loadTasks() {
    try {
        console.log('Загрузка задач для:', currentUser);

        let url = '/api/tasks';
        if (currentUser.role === 'manager') {
            const executor = document.getElementById('executor')?.value || 'all';
            const status = document.getElementById('status').value;

            const params = new URLSearchParams();
            if (executor !== 'all') params.append('executor', executor);
            if (status !== 'all') params.append('status', status);

            url += `?${params.toString()}`;
        }

        const response = await fetch(url);

        console.log('Ответ сервера:', response);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка загрузки задач');
        }

        tasks = await response.json();
        console.log('Получены задачи:', tasks);
        renderTasks();
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
        showError(error.message);
    }
}

function renderTasks() {
    console.log('Рендеринг задач:', tasks);
    tasksContainer.innerHTML = '';

    if (tasks.length === 0) {
        tasksContainer.innerHTML = '<div class="no-tasks">Нет задач для отображения</div>';
        return;
    }

    tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = `task-card ${task.status}`;

        taskElement.innerHTML = `
      <h3>${task.title}</h3>
      ${task.description ? `<p>${task.description}</p>` : ''}
      <div class="task-meta">
        <span class="status">Статус: ${getStatusText(task.status)}</span>
        <span class="creator">Создатель: ${task.creator_name}</span>
        <span class="executor">Исполнитель: ${task.executor_name}</span>
        <span class="date">Дата: ${new Date(task.created_at).toLocaleDateString()}</span>
      </div>
      <div class="task-actions">
        ${renderTaskActions(task)}
      </div>
    `;

        tasksContainer.appendChild(taskElement);
    });
}


// Добавляем стиль для сообщения "Нет задач"
const style = document.createElement('style');
style.textContent = `
  .no-tasks {
    padding: 20px;
    text-align: center;
    color: #666;
    font-size: 1.2em;
  }
`;
document.head.appendChild(style);