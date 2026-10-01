// ⭐ Read user securely from shared login keys
const userId = localStorage.getItem("userId");
const token = localStorage.getItem("token");

// redirect if not logged in
if (!userId || !token) {
  window.location.href = "login.html";
}

document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

let selectedBookId = null;
let selectedMyBookId = null;
let selectedBookOwnerId = null;

// Load available books
loadAvailableBooks();

// Load my books
loadMyBooks();

/* -------------------------------------------
   LOAD AVAILABLE BOOKS
-------------------------------------------- */
async function loadAvailableBooks() {
  const container = document.getElementById("availableBooks");
  container.innerHTML = "Loading...";

  try {
    const res = await fetch(`/api/books`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const books = await res.json();

    // ⭐ Handle null ownerId safely
    const filtered = books.filter(b => b.ownerId && b.ownerId.toString() !== userId);

    container.innerHTML = "";

    filtered.forEach(book => {
      const div = document.createElement("div");
      div.className = "book-card";
      div.innerHTML = `
        <h3>${book.title}</h3>
        <p>Author: ${book.author}</p>
        <button>Select</button>
      `;

      div.querySelector("button").addEventListener("click", () => {
        selectedBookId = book._id;
        selectedBookOwnerId = book.ownerId;
        highlightSelection(container, div);
        enableSendButton();
      });

      container.appendChild(div);
    });

  } catch (err) {
    container.textContent = "Error loading books.";
  }
}

/* -------------------------------------------
   LOAD MY BOOKS
-------------------------------------------- */
async function loadMyBooks() {
  const container = document.getElementById("myBooks");
  container.innerHTML = "Loading...";

  try {
    const res = await fetch(`/dashboard/my-books/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();
    const books = result.data;

    container.innerHTML = "";

    books.forEach(book => {
      const div = document.createElement("div");
      div.className = "book-card";
      div.innerHTML = `
        <h3>${book.title}</h3>
        <p>Author: ${book.author}</p>
        <button>Select</button>
      `;

      div.querySelector("button").addEventListener("click", () => {
        selectedMyBookId = book._id;
        highlightSelection(container, div);
        enableSendButton();
      });

      container.appendChild(div);
    });

  } catch (err) {
    container.textContent = "Error loading your books.";
  }
}

/* -------------------------------------------
   HIGHLIGHT SELECTED CARD
-------------------------------------------- */
function highlightSelection(container, selectedDiv) {
  [...container.children].forEach(div => div.classList.remove("selected"));
  selectedDiv.classList.add("selected");
}

/* -------------------------------------------
   ENABLE SEND BUTTON
-------------------------------------------- */
function enableSendButton() {
  const btn = document.getElementById("sendRequestBtn");
  btn.disabled = !(selectedBookId && selectedMyBookId);
}

/* -------------------------------------------
   SEND SWAP REQUEST
-------------------------------------------- */
document.getElementById("sendRequestBtn").addEventListener("click", async () => {
  const statusMsg = document.getElementById("statusMsg");

  try {
    const res = await fetch(`/swap/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        requestedBookId: selectedBookId,
        offeredBookId: selectedMyBookId,
        ownerId: selectedBookOwnerId
      })
    });

    const result = await res.json();

    if (!result.success) {
      statusMsg.textContent = result.message;
      statusMsg.style.color = "red";
      return;
    }

    statusMsg.textContent = "Swap request sent successfully!";
    statusMsg.style.color = "green";

    selectedBookId = null;
    selectedMyBookId = null;
    selectedBookOwnerId = null;
    enableSendButton();

  } catch (err) {
    statusMsg.textContent = "Error sending request.";
    statusMsg.style.color = "red";
  }
});
