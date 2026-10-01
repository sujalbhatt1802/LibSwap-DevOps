// ⭐ Read user securely from shared login keys
const userId = localStorage.getItem("userId");
const fullName = localStorage.getItem("fullName");
const username = localStorage.getItem("username");
const email = localStorage.getItem("email");
const role = localStorage.getItem("role");
const token = localStorage.getItem("token");

// redirect if not logged in
if (!userId || !token) {
  window.location.href = "login.html";
}

// Load initial dashboard sections
loadMyBooks();
loadStudentInfo();
loadCirculation();
loadSwapRequests();

/* -------------------------------------------
   LOGOUT BUTTONS
-------------------------------------------- */
document.querySelectorAll("#logoutBtn, .logout-button, [data-logout]").forEach(btn => {
  btn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });
});

/* -------------------------------------------
   STUDENT INFO (XSS-safe)
-------------------------------------------- */
function loadStudentInfo() {
  const container = document.getElementById("student-details");

  container.innerHTML = `
    <p><strong>Name:</strong> <span id="ui-name"></span></p>
    <p><strong>Username:</strong> <span id="ui-username"></span></p>
    <p><strong>Email:</strong> <span id="ui-email"></span></p>
    <p><strong>Role:</strong> <span id="ui-role"></span></p>
  `;

  document.getElementById("ui-name").textContent = fullName;
  document.getElementById("ui-username").textContent = username;
  document.getElementById("ui-email").textContent = email;
  document.getElementById("ui-role").textContent = role;
}

// All circulation screens use the same authenticated snapshot.
async function circulationRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json();
  if (response.status === 401) {
    window.location.href = 'login.html';
    throw new Error('Your session expired. Please sign in.');
  }
  if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load books.');
  return result;
}

function circulationText(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function loanDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'Not recorded (older loan)';
}

async function loadCirculation() {
  const targets = ['borrowed-list', 'borrowing-history', 'reservation-list', 'borrow-books-container', 'reserve-books-container'];
  const requestNumber = (loadCirculation.requestNumber || 0) + 1;
  loadCirculation.requestNumber = requestNumber;
  targets.forEach(id => document.getElementById(id).setAttribute('aria-busy', 'true'));
  try {
    const result = await circulationRequest('/api/books/circulation');
    if (requestNumber !== loadCirculation.requestNumber) return;
    const borrowed = document.getElementById('borrowed-list');
    const reservations = document.getElementById('reservation-list');
    const history = document.getElementById('borrowing-history');
    targets.forEach(id => document.getElementById(id).replaceChildren());

    result.data.filter(book => book.borrowedByMe).forEach(book => {
      const item = circulationText('li', '');
      item.append(circulationText('strong', `${book.title} by ${book.author}`));
      const status = circulationText('p', `${book.loanStatus === 'overdue' ? 'Overdue' : 'Borrowed'} · Due: ${loanDate(book.dueAt)}`);
      if (book.loanStatus === 'overdue') status.className = 'loan-overdue';
      item.append(status, circulationText('p', `Borrowed: ${loanDate(book.borrowedAt)}`),
        circulationButton(book._id, 'return', 'Return book'));
      borrowed.append(item);
    });
    if (!borrowed.children.length) borrowed.append(circulationText('li', 'You have no borrowed books.'));

    result.history.forEach(loan => {
      const item = circulationText('li', '');
      const status = { returned: 'Returned', borrowed: 'Borrowed', overdue: 'Overdue' }[loan.status];
      item.append(circulationText('strong', loan.title),
        circulationText('p', `${status} · Borrowed: ${loanDate(loan.borrowedAt)} · Due: ${loanDate(loan.dueAt)}`));
      if (loan.returnedAt) item.append(circulationText('p', `Returned: ${loanDate(loan.returnedAt)}`));
      history.append(item);
    });
    if (!history.children.length) history.append(circulationText('li', 'No borrowing history recorded yet.'));

    const mine = result.data.filter(book => book.reservationPosition);
    mine.forEach(book => {
      const item = circulationText('li', '');
      item.append(circulationText('strong', book.title),
        circulationText('p', `${book.reservationStatus === 'ready' ? 'Ready to borrow' : 'Waiting'} · Queue position ${book.reservationPosition} of ${book.reservationCount}`));
      if (book.canBorrow) item.append(circulationButton(book._id, 'borrow', 'Borrow reserved book'));
      reservations.append(item);
    });
    if (!reservations.children.length) reservations.append(circulationText('li', 'You have no reservations.'));
    const ready = mine.filter(book => book.reservationStatus === 'ready');
    document.getElementById('reservation-alert').textContent = ready.length
      ? `Ready for you: ${ready.map(book => book.title).join(', ')}. Open Your Reservations to borrow.` : '';

    renderCirculationChoices(result.data.filter(book => book.canBorrow), 'borrow-books-container', 'borrow');
    renderCirculationChoices(result.data.filter(book => book.canReserve), 'reserve-books-container', 'reserve');
    await loadCirculationNotificationCount();
  } catch (error) {
    if (requestNumber !== loadCirculation.requestNumber) return;
    targets.forEach(id => document.getElementById(id).replaceChildren(circulationText('p', error.message)));
  } finally {
    if (requestNumber === loadCirculation.requestNumber) {
      targets.forEach(id => document.getElementById(id).setAttribute('aria-busy', 'false'));
    }
  }
}

function renderCirculationChoices(books, containerId, action) {
  const container = document.getElementById(containerId);
  books.forEach(book => {
    const card = circulationText('article', '');
    card.className = 'book-card circulation-card';
    card.append(circulationText('h3', book.title), circulationText('p', book.author));
    if (action === 'reserve') card.append(circulationText('p', `Unavailable · ${book.reservationCount} in queue`));
    else if (book.reservationStatus === 'ready') card.append(circulationText('p', 'Held for your reservation'));
    card.append(circulationButton(book._id, action, action === 'borrow' ? 'Borrow book' : 'Reserve book'));
    container.append(card);
  });
  if (!books.length) container.append(circulationText('p',
    action === 'borrow' ? 'No books are available for you to borrow.' : 'No unavailable books to reserve.'));
}

function circulationButton(bookId, action, label) {
  const button = circulationText('button', label);
  button.type = 'button';
  button.className = 'action-btn';
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    const message = document.getElementById('circulation-message');
    message.textContent = 'Saving...';
    try {
      const result = await circulationRequest(`/api/books/${action}/${bookId}`, { method: 'POST' });
      message.textContent = result.message;
    } catch (error) {
      message.textContent = error.message;
    } finally {
      await loadCirculation();
      button.disabled = false;
    }
  });
  return button;
}

async function loadCirculationNotificationCount() {
  try {
    const response = await fetch('/api/notifications/unread-count', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const result = await response.json();
    document.getElementById('circulation-unread').textContent = result.unreadCount ? `(${result.unreadCount})` : '';
  } catch {
    // Notification availability does not prevent borrowing or returning.
  }
}

/* -------------------------------------------
   SWAP REQUESTS
-------------------------------------------- */
async function loadSwapRequests() {
  const sentList = document.getElementById("swap-sent-list");
  const receivedList = document.getElementById("swap-received-list");

  try {
    const res = await fetch(`/swap/all`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();

    if (!result.success) {
      sentList.innerHTML = "<p class='empty-swap-msg'>Error loading swap requests.</p>";
      receivedList.innerHTML = "<p class='empty-swap-msg'>Error loading swap requests.</p>";
      return;
    }

    const { sent, received } = result.data;

    /* ----- SENT REQUESTS ----- */
    sentList.innerHTML = sent.length === 0 ? "<p class='empty-swap-msg'>No sent swap requests.</p>" : "";
    sent.forEach(req => {
      sentList.appendChild(createSwapCard(req, true));
    });

    /* ----- RECEIVED REQUESTS ----- */
    receivedList.innerHTML = received.length === 0 ? "<p class='empty-swap-msg'>No received swap requests.</p>" : "";
    received.forEach(req => {
      receivedList.appendChild(createSwapCard(req, false));
    });

    attachSwapButtons();

  } catch (err) {
    sentList.innerHTML = "<p class='empty-swap-msg'>Error loading swap requests.</p>";
    receivedList.innerHTML = "<p class='empty-swap-msg'>Error loading swap requests.</p>";
  }
}

/* Helper function to generate a swap card element */
function createSwapCard(req, isSent) {
  const li = document.createElement("li");
  li.className = "swap-card";

  const reqLabel = isSent ? "You requested:" : "Requested from you:";
  const offLabel = isSent ? "You offered:" : "They offered:";

  const requestedTitle = req.requestedBookId?.title || "Unknown Book";
  const offeredTitle = req.offeredBookId?.title || "Unknown Book";

  // Book Requested Line
  const p1 = document.createElement("p");
  const strong1 = document.createElement("strong");
  strong1.textContent = `${reqLabel} `;
  p1.appendChild(strong1);
  p1.appendChild(document.createTextNode(requestedTitle));

  // Book Offered Line
  const p2 = document.createElement("p");
  const strong2 = document.createElement("strong");
  strong2.textContent = `${offLabel} `;
  p2.appendChild(strong2);
  p2.appendChild(document.createTextNode(offeredTitle));

  // Status Line
  const p3 = document.createElement("p");
  const strong3 = document.createElement("strong");
  strong3.textContent = "Status: ";
  
  const statusBadge = document.createElement("span");
  statusBadge.className = `swap-status-badge status-${(req.status || "pending").toLowerCase()}`;
  statusBadge.textContent = req.status;

  p3.appendChild(strong3);
  p3.appendChild(statusBadge);

  li.append(p1, p2, p3);

  // Buttons for Pending Status
  if (req.status === "pending") {
    const actions = document.createElement("div");
    actions.className = "swap-actions";

    if (isSent) {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "cancel-btn";
      cancelBtn.dataset.id = req._id;
      cancelBtn.textContent = "Cancel Request";
      actions.appendChild(cancelBtn);
    } else {
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "accept-btn";
      acceptBtn.dataset.id = req._id;
      acceptBtn.textContent = "Accept";

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "reject-btn";
      rejectBtn.dataset.id = req._id;
      rejectBtn.textContent = "Reject";

      actions.append(acceptBtn, rejectBtn);
    }

    li.appendChild(actions);
  }

  return li;
}

/* -------------------------------------------
   SWAP BUTTON HANDLERS
-------------------------------------------- */
function attachSwapButtons() {
  document.querySelectorAll(".accept-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const res = await fetch(`/swap/accept/${btn.dataset.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
          alert(result.message || "Failed to accept swap request.");
        }
      } catch (err) {
        console.error("Error accepting swap:", err);
        alert("Error accepting swap request.");
      } finally {
        // Refresh both swap requests and personal books
        await Promise.all([loadSwapRequests(), loadMyBooks()]);
      }
    });
  });

  document.querySelectorAll(".reject-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const res = await fetch(`/swap/reject/${btn.dataset.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
          alert(result.message || "Failed to reject swap request.");
        }
      } catch (err) {
        console.error("Error rejecting swap:", err);
        alert("Error rejecting swap request.");
      } finally {
        await Promise.all([loadSwapRequests(), loadMyBooks()]);
      }
    });
  });

  document.querySelectorAll(".cancel-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const res = await fetch(`/swap/cancel/${btn.dataset.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
          alert(result.message || "Failed to cancel swap request.");
        }
      } catch (err) {
        console.error("Error canceling swap:", err);
        alert("Error canceling swap request.");
      } finally {
        await Promise.all([loadSwapRequests(), loadMyBooks()]);
      }
    });
  });
}

// Reuse the existing dashboard sections rather than introducing new pages.
for (const [buttonId, sectionId] of [
  ['loadBorrowBooksBtn', 'borrow-section'],
  ['loadReservationBooksBtn', 'reserve-section']
]) {
  document.getElementById(buttonId).addEventListener('click', () => {
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    loadCirculation();
  });
}
document.getElementById('refreshCirculationBtn').addEventListener('click', loadCirculation);
document.querySelectorAll('.sidebar [data-section]').forEach(item => {
  item.addEventListener('click', () => {
    if (['borrowed-books', 'reservations'].includes(item.dataset.section)) loadCirculation();
  });
});
window.addEventListener('focus', loadCirculation);
if (typeof io === 'function') {
  const circulationSocket = io();
  circulationSocket.on('booksChanged', loadCirculation);
  circulationSocket.on('connect', loadCirculation);
}

/* -------------------------------------------
   LOAD MY BOOKS (Owned)
-------------------------------------------- */
async function loadMyBooks() {
  const list = document.getElementById("my-books-list");
  if (!list) return;

  try {
    const res = await fetch(`/dashboard/my-books/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      list.innerHTML = "<li>You haven't added any personal books yet.</li>";
      return;
    }

    list.innerHTML = "";
    result.data.forEach(book => {
      const li = document.createElement("li");

      // Left Container: Title + Author + Badge
      const infoSpan = document.createElement("span");

      const strong = document.createElement("strong");
      strong.textContent = book.title;
      infoSpan.appendChild(strong);
      infoSpan.appendChild(document.createTextNode(` by ${book.author} `));

      // Determine ownership & availability flags
      const isUnavailable = Boolean(book.borrowedBy) || Boolean(book.reservedBy) || !book.available;
      const isOriginalOwner = book.isOriginalUploader !== false;
      const isDeletable = !isUnavailable && isOriginalOwner;

      // Status Badge
      const statusBadge = document.createElement("span");
      statusBadge.className = "status-badge";

      if (isUnavailable) {
        statusBadge.classList.add("badge-not-available");
        statusBadge.textContent = "Not Available";
      } else if (!isOriginalOwner) {
        statusBadge.classList.add("badge-swapped");
        statusBadge.textContent = "Not Original Owner";
      } else {
        statusBadge.classList.add("badge-available");
        statusBadge.textContent = "Available";
      }
      infoSpan.appendChild(statusBadge);

      // Right Container: Delete Button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "Delete";

      if (!isDeletable) {
        deleteBtn.disabled = true;
        deleteBtn.classList.add("disabled-btn");

        if (isUnavailable) {
          deleteBtn.title = "Cannot delete a book that is currently borrowed or reserved.";
        } else if (!isOriginalOwner) {
          deleteBtn.title = "You cannot delete a book acquired through a swap. Only the original uploader can delete it.";
        }
      } else {
        deleteBtn.title = "Delete this personal book";
        deleteBtn.addEventListener("click", () => deleteMyBook(book._id));
      }

      // Append left side and right side to <li>
      li.appendChild(infoSpan);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });

  } catch (err) {
    console.error("Error loading personal books:", err);
    list.innerHTML = "<li>Error loading your books.</li>";
  }
}

/* -------------------------------------------
   ADD BOOK FORM
-------------------------------------------- */
const addBookForm = document.getElementById("dashboardAddBookForm");
if (addBookForm) {
  addBookForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const msg = document.getElementById("addBookMessage");

    const title = document.getElementById("newBookTitle").value.trim();
    const author = document.getElementById("newBookAuthor").value.trim();
    const genre = document.getElementById("newBookGenre").value.trim();

    if (!title || !author) {
      msg.style.color = "red";
      msg.textContent = "Title and Author cannot be empty or just spaces.";
      return;
    }

    const submitBtn = addBookForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding...";
    msg.textContent = "";

    try {
      const res = await fetch(`/dashboard/my-books/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title, author, genre })
      });

      const result = await res.json();

      if (result.success) {
        msg.style.color = "green";
        msg.textContent = "Book added successfully!";
        addBookForm.reset();
        loadMyBooks();
      } else {
        msg.style.color = "red";
        msg.textContent = result.message || "Failed to add book.";
      }

    } catch (err) {
      msg.style.color = "red";
      msg.textContent = "Server error.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add Book";
    }
  });
}

/* -------------------------------------------
   DELETE BOOK
-------------------------------------------- */
async function deleteMyBook(bookId) {
  if (!confirm("Are you sure you want to permanently delete this book?")) return;

  try {
    const res = await fetch(`/dashboard/my-books/${userId}/${bookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();

    if (result.success) {
      loadMyBooks();
    } else {
      alert(result.message || "Failed to delete book.");
    }

  } catch (err) {
    alert("Error deleting book.");
  }
}