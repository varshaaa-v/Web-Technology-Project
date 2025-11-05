const api = "http://localhost:5000/api/tasks";

async function loadTasks() {
  const res = await fetch(api);
  const tasks = await res.json();

  const list = document.getElementById("taskList");
  list.innerHTML = "";

  tasks.forEach(t => {
    list.innerHTML += `
      <li class="d-flex justify-content-between list-group-item">
        <span>${t.title}</span>
        <div>
          <button onclick="completeTask('${t._id}', ${!t.isComplete})" class="btn btn-success btn-sm">✅</button>
          <button onclick="deleteTask('${t._id}')" class="btn btn-danger btn-sm">❌</button>
        </div>
      </li>
    `;
  });
}

async function addTask() {
  const title = document.getElementById("taskInput").value;
  await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  loadTasks();
}

async function completeTask(id, isComplete) {
  await fetch(`${api}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isComplete })
  });
  loadTasks();
}

async function deleteTask(id) {
  await fetch(`${api}/${id}`, { method: "DELETE" });
  loadTasks();
}

loadTasks();
