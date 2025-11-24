let currentUser = JSON.parse(localStorage.getItem("currentUser")) || null;

// In-memory state for the board (categories + tasks) now backed by MongoDB
let categories = [];
let activeFilter = "all";
let searchQuery = "";
let streak = {
    current: 0,
    best: 0,
    lastDate: null,
};

// Backend API base (adjust port if your server runs elsewhere)
const API_BASE = "http://localhost:5000/api";

function getUserKey(base) {
    const id = currentUser && currentUser.id ? currentUser.id : "guest";
    return `${base}_${id}`;
}

// Small helper for talking to the backend
async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = (data && data.error) || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data;
}

async function loadStateForUser() {
    // Streak remains local per user
    const storedStreak = JSON.parse(localStorage.getItem(getUserKey("streak")) || "null");
    if (storedStreak && typeof storedStreak === "object") {
        streak = {
            current: storedStreak.current || 0,
            best: storedStreak.best || 0,
            lastDate: storedStreak.lastDate || null,
        };
    } else {
        streak = { current: 0, best: 0, lastDate: null };
    }

    categories = [];
    if (!currentUser) return;

    const userId = currentUser.id;
    try {
        const [catsFromServer, tasksFromServer] = await Promise.all([
            api(`/categories?userId=${encodeURIComponent(userId)}`),
            api(`/tasks?userId=${encodeURIComponent(userId)}`),
        ]);

        // Build categories array with tasks grouped by category name
        const catMap = new Map();
        catsFromServer.forEach((c) => {
            catMap.set(c._id, { _id: c._id, name: c.name, tasks: [] });
        });

        // Tasks may reference categories by name; attach them to the matching category by name
        tasksFromServer.forEach((t) => {
            // Find category by name among existing categories
            let target = [...catMap.values()].find((c) => c.name === t.category);
            if (!target) {
                // If no Category document exists (older data), create a temporary one by name
                target = { _id: null, name: t.category || "General", tasks: [] };
                catMap.set(`temp-${t.category}`, target);
            }

            target.tasks.push({
                _id: t._id,
                name: t.title,
                completed: !!t.isComplete,
                priority: t.priority || "medium",
                dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : null,
                image: t.image || null,
            });
        });

        categories = [...catMap.values()];
    } catch (e) {
        console.error("Failed to load state from server", e);
    }
}

function saveStreak() {
    localStorage.setItem(getUserKey("streak"), JSON.stringify(streak));
}

function updateStreakUI() {
    const currentEl = document.getElementById("streakCurrent");
    const bestEl = document.getElementById("streakBest");
    if (currentEl) currentEl.textContent = streak.current || 0;
    if (bestEl) bestEl.textContent = streak.best || 0;
}

function incrementStreakIfNeeded() {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (streak.lastDate === todayStr) {
        return; // already counted for today
    }

    if (!streak.lastDate) {
        streak.current = 1;
    } else {
        const last = new Date(streak.lastDate + "T00:00:00");
        const diffMs = today.setHours(0, 0, 0, 0) - last.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays === 1) {
            streak.current += 1;
        } else if (diffDays > 1) {
            streak.current = 1;
        }
    }

    streak.best = Math.max(streak.best || 0, streak.current || 0);
    streak.lastDate = todayStr;
    saveStreak();
    updateStreakUI();
}

function showKudos(message) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "kudos-toast";
    toast.textContent = message || "Beautiful work – you finished early!✨";

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function taskMatchesFilter(task, catName, today, filter, query) {
    const priority = task.priority || "medium";
    const dueDate = task.dueDate || "";

    const isCompleted = !!task.completed;
    const isPending = !task.completed;
    const isToday = !!dueDate && !task.completed && dueDate === today;
    const isOverdue = !!dueDate && !task.completed && dueDate < today;

    let passesFilter = false;
    switch (filter) {
        case "pending":
            passesFilter = isPending;
            break;
        case "completed":
            passesFilter = isCompleted;
            break;
        case "overdue":
            passesFilter = isOverdue;
            break;
        case "current":
            passesFilter = isToday;
            break;
        case "high":
            passesFilter = priority === "high";
            break;
        case "all":
        default:
            passesFilter = true;
    }

    if (!passesFilter) return false;

    if (!query) return true;

    const haystack = [
        String(task.name || ""),
        String(priority),
        String(dueDate),
        String(catName || ""),
    ]
        .join(" ")
        .toLowerCase();

    return haystack.includes(query.toLowerCase());
}

function render() {
    const container = document.getElementById("categories");
    container.innerHTML = "";

    const today = new Date().toISOString().slice(0, 10);

    if (categories.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No categories yet. Add one to start organizing your tasks.";
        container.appendChild(empty);
        return;
    }

    categories.forEach((cat, cIndex) => {
        const div = document.createElement("div");
        div.className = "category";
        div.draggable = true;
        div.dataset.index = cIndex;

        div.addEventListener("dragstart", () => {
            div.classList.add("dragging");
            div.dataset.index = cIndex;
        });

        div.addEventListener("dragend", () => {
            div.classList.remove("dragging");
        });

        div.innerHTML = `
            <div class="category-header">
                <h2>${cat.name}</h2>
                <div>
                    <button class="complete-category" data-cat="${cIndex}">Complete All</button>
                    <button class="delete-category" data-cat="${cIndex}">Delete</button>
                </div>
            </div>

            <div class="task-input">
                <input type="text" class="task-name-input" placeholder="New Task" data-cat="${cIndex}">
                <select class="priority-input" data-cat="${cIndex}">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                </select>
                <input type="date" class="due-input" data-cat="${cIndex}">
                <input type="file" class="image-input" data-cat="${cIndex}" accept="image/*">
                <button class="add-task" data-cat="${cIndex}">Add</button>
            </div>

            <div class="task-list"></div>
        `;

        const taskList = div.querySelector(".task-list");

        cat.tasks.forEach((task, tIndex) => {
            const t = document.createElement("div");
            t.className = "task";

            const priority = task.priority || "medium";
            const dueDate = task.dueDate || "";
            const isOverdue = dueDate && !task.completed && dueDate < today;

            if (task.completed) t.classList.add("completed");
            if (isOverdue) t.classList.add("overdue");

            t.draggable = true;
            t.dataset.cat = cIndex;
            t.dataset.index = tIndex;

            // Filtering + search
            const visible = taskMatchesFilter(task, cat.name, today, activeFilter, searchQuery);
            if (!visible) {
                t.style.display = "none";
            } else {
                t.style.display = "flex";
            }

            t.addEventListener("dragstart", () => {
                t.classList.add("dragging");
                t.dataset.cat = cIndex;
                t.dataset.index = tIndex;
            });

            t.addEventListener("dragend", () => {
                t.classList.remove("dragging");

                const taskListEl = t.parentElement;
                const lists = Array.from(document.querySelectorAll(".task-list"));
                const catIndex = lists.indexOf(taskListEl);

                if (catIndex > -1) {
                    const newTasks = [];

                    taskListEl.querySelectorAll(".task").forEach((taskEl) => {
                        const oldIndex = Number(taskEl.dataset.index);
                        if (!Number.isNaN(oldIndex) && categories[catIndex].tasks[oldIndex]) {
                            newTasks.push(categories[catIndex].tasks[oldIndex]);
                        }
                    });

                    if (newTasks.length === categories[catIndex].tasks.length) {
                        categories[catIndex].tasks = newTasks;
                        taskListEl.querySelectorAll(".task").forEach((taskEl, index) => {
                            taskEl.dataset.index = index;
                        });
                        save();
                    }
                }
            });

            t.innerHTML = `
                ${task.image ? `<div class="task-thumb" data-full-image="${task.image}"><img src="${task.image}" alt="Task image" /></div>` : ""}
                <div class="task-main">
                    <div class="task-info">
                        <span class="task-title">${task.name}</span>
                        <div class="task-meta">
                            <span class="priority-badge priority-${priority}">${priority}</span>
                            ${dueDate ? `<span class="due-label ${isOverdue ? "overdue-label" : ""}">Due: ${dueDate}</span>` : ""}
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="edit-btn" data-cat="${cIndex}" data-task="${tIndex}">Edit</button>
                        <button class="complete-btn" data-cat="${cIndex}" data-task="${tIndex}">✓</button>
                        <button class="delete-btn" data-cat="${cIndex}" data-task="${tIndex}">X</button>
                    </div>
                </div>
            `;

            taskList.appendChild(t);
        });

        container.appendChild(div);
    });
    dragSort();
}

document.getElementById("addCategory").onclick = async () => {
    const inputEl = document.getElementById("categoryInput");
    let name = inputEl.value.trim();
    if (!name || !currentUser) return;

    try {
        const created = await api("/categories", {
            method: "POST",
            body: JSON.stringify({ name, userId: currentUser.id }),
        });
        categories.push({ _id: created._id, name: created.name, tasks: [] });
        render();
        inputEl.value = "";
    } catch (e) {
        console.error("Failed to create category", e);
        showKudos("Could not create category right now.");
    }
};

document.getElementById("categories").addEventListener("click", (e) => {
    let cat = e.target.dataset.cat;
    let task = e.target.dataset.task;

    if (e.target.classList.contains("delete-category")) {
        const catObj = categories[cat];
        if (!catObj || !catObj._id) {
            categories.splice(cat, 1);
            render();
            return;
        }
        api(`/categories/${catObj._id}`, { method: "DELETE" })
            .then(() => {
                categories.splice(cat, 1);
                render();
            })
            .catch((err) => {
                console.error("Failed to delete category", err);
                showKudos("Could not delete category.");
            });
    }

    if (e.target.classList.contains("complete-category")) {
        let anyNewlyCompleted = false;
        let anyEarly = false;
        const today = new Date().toISOString().slice(0, 10);
        const updates = [];

        categories[cat].tasks.forEach((t) => {
            if (!t.completed) {
                anyNewlyCompleted = true;
                if (t.dueDate && t.dueDate > today) {
                    anyEarly = true;
                }
                t.completed = true;
                if (t._id) {
                    updates.push(
                        api(`/tasks/${t._id}`, {
                            method: "PUT",
                            body: JSON.stringify({ isComplete: true }),
                        })
                    );
                }
            }
        });

        if (anyNewlyCompleted) {
            incrementStreakIfNeeded();
        }
        if (anyEarly) {
            showKudos("You completed your tasks ahead of schedule!✨");
        }

        Promise.all(updates).catch((err) => console.error("Bulk complete error", err));
        render();
    }

    if (e.target.classList.contains("complete-btn")) {
        const tObj = categories[cat].tasks[task];
        const wasCompleted = !!tObj.completed;
        const today = new Date().toISOString().slice(0, 10);

        tObj.completed = !tObj.completed;

        if (!wasCompleted && tObj.completed) {
            incrementStreakIfNeeded();
            if (tObj.dueDate && tObj.dueDate > today) {
                showKudos("Nice! You finished this before its due date.✨");
            }
        }

        if (tObj._id) {
            api(`/tasks/${tObj._id}`, {
                method: "PUT",
                body: JSON.stringify({ isComplete: tObj.completed }),
            }).catch((err) => console.error("Toggle complete error", err));
        }

        render();
    }

    if (e.target.classList.contains("delete-btn")) {
        const tObj = categories[cat].tasks[task];
        if (tObj && tObj._id) {
            api(`/tasks/${tObj._id}`, { method: "DELETE" })
                .then(() => {
                    categories[cat].tasks.splice(task, 1);
                    render();
                })
                .catch((err) => {
                    console.error("Delete task error", err);
                    showKudos("Could not delete task.");
                });
        } else {
            categories[cat].tasks.splice(task, 1);
            render();
        }
    }

    if (e.target.classList.contains("edit-btn")) {
        const tObj = categories[cat].tasks[task];
        let newName = prompt("Edit Task:", tObj.name);
        if (newName && newName.trim()) {
            tObj.name = newName.trim();
            if (tObj._id) {
                api(`/tasks/${tObj._id}`, {
                    method: "PUT",
                    body: JSON.stringify({ title: tObj.name }),
                }).catch((err) => console.error("Edit task error", err));
            }
            render();
        }
    }
});

function addTaskWithOptionalImage(catIndex, taskBase, imageInput) {
    const file = imageInput && imageInput.files && imageInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async () => {
            taskBase.image = reader.result;
            try {
                const created = await api("/tasks", {
                    method: "POST",
                    body: JSON.stringify({
                        title: taskBase.name,
                        category: categories[catIndex].name,
                        priority: taskBase.priority,
                        dueDate: taskBase.dueDate,
                        userId: currentUser.id,
                        image: taskBase.image,
                    }),
                });
                categories[catIndex].tasks.push({
                    _id: created._id,
                    name: created.title,
                    completed: !!created.isComplete,
                    priority: created.priority,
                    dueDate: created.dueDate ? String(created.dueDate).slice(0, 10) : null,
                    image: created.image || null,
                });
                render();
            } catch (e) {
                console.error("Failed to add task with image", e);
                showKudos(e.message || "Could not add task right now.");
            }
        };
        reader.readAsDataURL(file);
    } else {
        api("/tasks", {
            method: "POST",
            body: JSON.stringify({
                title: taskBase.name,
                category: categories[catIndex].name,
                priority: taskBase.priority,
                dueDate: taskBase.dueDate,
                userId: currentUser.id,
            }),
        })
            .then((created) => {
                categories[catIndex].tasks.push({
                    _id: created._id,
                    name: created.title,
                    completed: !!created.isComplete,
                    priority: created.priority,
                    dueDate: created.dueDate ? String(created.dueDate).slice(0, 10) : null,
                    image: created.image || null,
                });
                render();
            })
            .catch((e) => {
                console.error("Failed to add task", e);
                showKudos(e.message || "Could not add task right now.");
            });
    }
}

document.getElementById("categories").addEventListener("click", (e) => {
    if (e.target.classList.contains("add-task")) {
        const cat = e.target.dataset.cat;
        const input = document.querySelector(`input.task-name-input[data-cat="${cat}"]`);
        const prioritySelect = document.querySelector(`select.priority-input[data-cat="${cat}"]`);
        const dueInput = document.querySelector(`input.due-input[data-cat="${cat}"]`);
        const imageInput = document.querySelector(`input.image-input[data-cat="${cat}"]`);

        if (!input) return;

        const val = input.value.trim();
        if (!val) return;

        const priority = prioritySelect ? prioritySelect.value : "medium";
        const dueDate = dueInput && dueInput.value ? dueInput.value : null;

        const taskBase = {
            name: val,
            completed: false,
            priority,
            dueDate,
        };

        addTaskWithOptionalImage(Number(cat), taskBase, imageInput);

        input.value = "";
        if (dueInput) dueInput.value = "";
        if (prioritySelect) prioritySelect.value = "medium";
        if (imageInput) imageInput.value = "";
    }
});

document.getElementById("search").addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase();
    render();
});

const darkToggleBtn = document.getElementById("darkToggle");

function updateThemeButtonText() {
    if (!darkToggleBtn) return;
    darkToggleBtn.textContent = document.body.classList.contains("dark")
        ? "Light Mode"
        : "Dark Mode";
}

document.getElementById("darkToggle").onclick = () => {
    document.body.classList.toggle("dark");
    updateThemeButtonText();
};

document.querySelectorAll(".bg-options img").forEach((img) => {
    img.onclick = () => {
        document.body.style.backgroundImage = `url(${img.dataset.bg})`;
    };
});

const sidebarFilters = document.getElementById("sidebarFilters");
if (sidebarFilters) {
    sidebarFilters.addEventListener("click", (e) => {
        const btn = e.target.closest(".filter-btn");
        if (!btn) return;

        if (btn.id === "logoutBtn") {
            // Logout handled separately
            return;
        }

        activeFilter = btn.dataset.filter || "all";
        document.querySelectorAll(".filter-btn").forEach((b) => {
            if (b.id === "logoutBtn") return;
            b.classList.toggle("active", b === btn);
        });
        render();
    });
}

function dragSort() {
    const catArea = document.getElementById("categories");

    if (!catArea) return;

    catArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        const dragging = document.querySelector(".category.dragging");
        const after = [...catArea.querySelectorAll(".category:not(.dragging)")].find(
            (card) => e.clientY <= card.offsetTop + card.offsetHeight / 2
        );
        if (after) catArea.insertBefore(dragging, after);
        else catArea.appendChild(dragging);
    });

    document.querySelectorAll(".task-list").forEach((taskList) => {
        taskList.addEventListener("dragover", (e) => {
            e.preventDefault();
            const dragging = document.querySelector(".task.dragging");
            const after = [...taskList.querySelectorAll(".task:not(.dragging)")].find(
                (t) => e.clientY <= t.offsetTop + t.offsetHeight / 2
            );
            if (after) taskList.insertBefore(dragging, after);
            else taskList.appendChild(dragging);
        });
    });
}

const imageModal = document.getElementById("imageModal");
const imageModalImg = document.getElementById("imageModalImg");

function openImageModal(src) {
    if (!imageModal || !imageModalImg || !src) return;
    imageModalImg.src = src;
    imageModal.classList.add("open");
}

function closeImageModal() {
    if (!imageModal) return;
    imageModal.classList.remove("open");
}

if (imageModal) {
    imageModal.addEventListener("click", (e) => {
        if (e.target === imageModal || e.target.classList.contains("image-modal-backdrop")) {
            closeImageModal();
        }
    });
}

document.addEventListener("click", (e) => {
    const thumb = e.target.closest(".task-thumb");
    if (!thumb) return;
    const src = thumb.dataset.fullImage;
    openImageModal(src);
});

// Auth handling
const authPage = document.getElementById("authPage");
const appShell = document.querySelector(".app-shell");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authError = document.getElementById("authError");
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const registerNameInput = document.getElementById("registerName");
const registerEmailInput = document.getElementById("registerEmail");
const registerPasswordInput = document.getElementById("registerPassword");
const rememberCheckbox = document.getElementById("rememberCredentials");
const authTabs = document.querySelectorAll(".auth-tab");
const logoutBtn = document.getElementById("logoutBtn");

function showAuth() {
    if (authPage) authPage.style.display = "block";
    if (appShell) appShell.style.display = "none";

    // Prefill login from saved credentials, if any
    const saved = JSON.parse(localStorage.getItem("savedCredentials") || "null");
    if (saved && loginEmailInput && loginPasswordInput) {
        loginEmailInput.value = saved.email || "";
        loginPasswordInput.value = saved.password || "";
    }
}

function updateBoardTitle() {
    const titleEl = document.getElementById("boardTitle");
    if (!titleEl) return;

    const base = "To Do List";
    if (!currentUser) {
        titleEl.textContent = "Vision Board " + base;
        return;
    }

    const name = currentUser.name || (currentUser.id ? currentUser.id.split("@")[0] : "");
    if (!name) {
        titleEl.textContent = "Vision Board " + base;
        return;
    }

    titleEl.textContent = `${name}'s To Do List`;
}

async function showApp() {
    if (authPage) authPage.style.display = "none";
    if (appShell) appShell.style.display = "flex";
    await loadStateForUser();
    updateStreakUI();
    updateThemeButtonText();
    updateBoardTitle();
    render();
}

authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        const mode = tab.dataset.mode;
        authTabs.forEach((t) => t.classList.toggle("active", t === tab));
        if (mode === "login") {
            loginForm.classList.add("active");
            registerForm.classList.remove("active");
        } else {
            registerForm.classList.add("active");
            loginForm.classList.remove("active");
        }
        if (authError) authError.textContent = "";
    });
});

// Password eye toggles
const eyeButtons = document.querySelectorAll(".password-eye");
eyeButtons.forEach((btn) => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    btn.addEventListener("click", () => {
        const hidden = input.type === "password";
        input.type = hidden ? "text" : "password";
        // 👁 when hidden, 🙈 when visible
        btn.textContent = hidden ? "👁" : "👁";
    });
});

if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (authError) authError.textContent = "";
        const email = (loginEmailInput.value || "").trim().toLowerCase();
        const password = loginPasswordInput.value || "";
        if (!email || !password) return;

        try {
            const user = await api("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });

            currentUser = { id: user.id, name: user.name };
            localStorage.setItem("currentUser", JSON.stringify(currentUser));

            // Save credentials if checkbox selected
            if (rememberCheckbox && rememberCheckbox.checked) {
                localStorage.setItem("savedCredentials", JSON.stringify({ email, password }));
            } else {
                localStorage.removeItem("savedCredentials");
            }

            const helloName = user.name || email;
            showKudos(`Hello ${helloName}! You are logged in.`);
            await loadStateForUser();
            showApp();
        } catch (err) {
            console.error("Login failed", err);
            if (authError) authError.textContent = err.message || "Login failed";
        }
    });
}

if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (authError) authError.textContent = "";
        const name = (registerNameInput.value || "").trim();
        const email = (registerEmailInput.value || "").trim().toLowerCase();
        const password = registerPasswordInput.value || "";
        if (!name || !email || !password) return;

        try {
            const user = await api("/auth/register", {
                method: "POST",
                body: JSON.stringify({ name, email, password }),
            });

            // Save credentials if checkbox selected
            if (rememberCheckbox && rememberCheckbox.checked) {
                localStorage.setItem("savedCredentials", JSON.stringify({ email, password }));
            } else {
                localStorage.removeItem("savedCredentials");
            }

            currentUser = { id: user.id, name: user.name };
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            showKudos(`Hello ${user.name}! Your account is ready.`);
            await loadStateForUser();
            showApp();
        } catch (err) {
            console.error("Register failed", err);
            if (authError) authError.textContent = err.message || "Registration failed";
        }
    });
}

if (currentUser) {
    showApp();
} else {
    showAuth();
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        currentUser = null;
        localStorage.removeItem("currentUser");
        updateBoardTitle();
        showAuth();
    });
}
