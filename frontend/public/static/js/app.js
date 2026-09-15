// ==========================================================================
// SchoolHub - Full-Stack Application Client (Connected to MongoDB Atlas API)
// ==========================================================================

// Dynamically resolve API URL:
// 1. window.API_BASE (if injected via route.ts from NEXT_PUBLIC_API_URL)
// 2. Relative "/api" (which Next.js automatically rewrites to BACKEND_URL or localhost:8000)
// 3. Direct localhost only if opened directly from local filesystem (file://)
const API_BASE = (typeof window !== "undefined" && window.API_BASE)
    ? window.API_BASE
    : (typeof window !== "undefined" && window.location.protocol === 'file:' 
        ? "http://localhost:8000/api" 
        : "/api");


// Global In-Memory Cache (Synchronized with MongoDB Atlas)
let StandardsList = [];
let AppStore = {
    students: [],
    timetables: {},
    exams: []
};

let Session = {
    currentUserType: null, // 'staff' | 'student' | null
    currentStudentRoll: null,
    userRole: null          // 'admin' | 'staff' | 'student'
};

// ------------------ API Helper Functions ------------------
async function apiRequest(endpoint, options = {}) {
    try {
        const url = `${API_BASE}${endpoint}`;
        // Attach X-User-Role header to every request so the backend can
        // enforce role-based access on write endpoints.
        const roleHeader = Session.userRole ? { 'X-User-Role': Session.userRole } : {};
        const defaultHeaders = {
            'Content-Type': 'application/json',
            ...roleHeader
        };

        const response = await fetch(url, {
            ...options,
            headers: {
                ...defaultHeaders,
                ...(options.headers || {})
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(errorData.detail || `Request failed with status ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error(`[API Error] ${endpoint}:`, err);
        throw err;
    }
}

// ------------------ Data Initialization from MongoDB ------------------
async function initStore() {
    try {
        // 1. Fetch Standards from MongoDB
        try {
            StandardsList = await apiRequest('/standards');
        } catch (e) {
            console.warn("Could not fetch standards from API, using defaults:", e);
            StandardsList = [
                "Pre-KG", "LKG", "UKG",
                "1st Standard", "2nd Standard", "3rd Standard", "4th Standard", "5th Standard",
                "6th Standard", "7th Standard", "8th Standard", "9th Standard", "10th Standard",
                "11th Standard", "12th Standard"
            ];
        }

        // 2. Fetch Students from MongoDB
        // If the session is already restored (page reload), use the role-scoped endpoint.
        try {
            const savedRole = sessionStorage.getItem("userRole");
            const savedRoll = sessionStorage.getItem("currentStudentRoll");
            if (savedRole === 'student' && savedRoll) {
                // Student: only load own data to prevent data leakage
                const myData = await apiRequest(`/students/me/${encodeURIComponent(savedRoll)}`);
                AppStore.students = [myData];
            } else {
                AppStore.students = await apiRequest('/students');
            }
        } catch (e) {
            console.warn("Could not fetch students from API:", e);
            AppStore.students = [];
        }

        // 3. Fetch Timetables from MongoDB
        try {
            AppStore.timetables = await apiRequest('/timetables');
        } catch (e) {
            console.warn("Could not fetch timetables from API:", e);
            AppStore.timetables = {};
        }

        // 4. Fetch Exam Schedules from MongoDB
        try {
            AppStore.exams = await apiRequest('/exams');
        } catch (e) {
            AppStore.exams = [];
        }

    } catch (e) {
        console.error("Initialization error:", e);
    }
}

async function refreshStudentsFromAPI() {
    try {
        // Students only fetch their own record via /me endpoint;
        // staff/admin fetch all students.
        if (Session.userRole === 'student' && Session.currentStudentRoll) {
            const myData = await apiRequest(`/students/me/${encodeURIComponent(Session.currentStudentRoll)}`);
            AppStore.students = [myData];
        } else {
            AppStore.students = await apiRequest('/students');
        }
        updateStaffDashboardCounters();
        return AppStore.students;
    } catch (e) {
        console.error("Failed to refresh students:", e);
        return AppStore.students;
    }
}

// ------------------ Page Lifecycle & DOM Ready ------------------
document.addEventListener("DOMContentLoaded", async () => {
    initThemes();
    await initStore();
    populateFormOptions();

    // Set default date to today for attendance
    const todayStr = new Date().toISOString().split('T')[0];
    const dateSelect = document.getElementById('attendance-date-select');
    if (dateSelect) {
        dateSelect.value = todayStr;
    }

    // ── Restore session from sessionStorage on page reload ────────────────
    const savedUserType = sessionStorage.getItem("currentUserType");
    const savedRole     = sessionStorage.getItem("userRole");
    const savedRoll     = sessionStorage.getItem("currentStudentRoll");
    if (savedUserType) {
        Session.currentUserType    = savedUserType;
        Session.userRole           = savedRole || savedUserType;  // restore role
        Session.currentStudentRoll = savedRoll || null;
        showPage(savedUserType === 'staff' ? 'staff-dashboard' : 'student-dashboard');
    } else {
        showPage('home');
    }
});

// ------------------ Theme Management ------------------
function initThemes() {
    const isDark = localStorage.getItem("darkMode") === "true";
    const html = document.documentElement;
    const darkIcon = document.getElementById("dark-icon");
    if (isDark) {
        html.classList.add("dark-mode");
        if (darkIcon) darkIcon.className = "fas fa-sun";
    } else {
        html.classList.remove("dark-mode");
        if (darkIcon) darkIcon.className = "fas fa-moon";
    }
}

function toggleDarkMode() {
    const html = document.documentElement;
    const darkIcon = document.getElementById("dark-icon");
    const isDark = html.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", isDark ? "true" : "false");
    if (darkIcon) darkIcon.className = isDark ? "fas fa-sun" : "fas fa-moon";
}

// ------------------ Routing / Page Navigation ------------------
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    if (pageId === 'home') document.getElementById('nav-home')?.classList.add('active');
    if (pageId === 'staff-login') document.getElementById('nav-login-staff')?.classList.add('active');
    if (pageId === 'student-login') document.getElementById('nav-login-student')?.classList.add('active');

    // If going to home and logged in, redirect to active dashboard
    if (pageId === 'home' && Session.currentUserType) {
        showPage(Session.currentUserType === 'staff' ? 'staff-dashboard' : 'student-dashboard');
        return;
    }

    updateHeaderNav();

    if (pageId === 'staff-dashboard') {
        updateStaffDashboardCounters();
        loadStaffActiveTab();
    } else if (pageId === 'student-dashboard') {
        loadStudentPortal();
    }
    window.scrollTo(0, 0);
}

function updateHeaderNav() {
    const navLoginStaff = document.getElementById("nav-login-staff");
    const navLoginStudent = document.getElementById("nav-login-student");
    const navUserInfo = document.getElementById("nav-user-info");
    const navUserBadge = document.getElementById("nav-user-badge");
    const navLogout = document.getElementById("nav-logout");
    const btnAddStudent = document.getElementById("btn-add-student");

    if (Session.currentUserType) {
        if (navLoginStaff) navLoginStaff.style.display = "none";
        if (navLoginStudent) navLoginStudent.style.display = "none";
        if (navUserInfo) navUserInfo.style.display = "block";
        if (navLogout) navLogout.style.display = "flex";

        const userRole = Session.userRole || Session.currentUserType;

        if (userRole === 'admin') {
            if (navUserBadge) navUserBadge.innerHTML = `<i class="fas fa-shield-halved" style="color: var(--warning);"></i> Role: Admin (Full Access)`;
            if (btnAddStudent) btnAddStudent.style.display = "inline-flex";
        } else if (userRole === 'staff') {
            if (navUserBadge) navUserBadge.innerHTML = `<i class="fas fa-chalkboard-user" style="color: var(--secondary);"></i> Role: Staff Member`;
            if (btnAddStudent) btnAddStudent.style.display = "inline-flex";
        } else {
            const student = AppStore.students.find(s => s.rollNumber === Session.currentStudentRoll);
            if (navUserBadge) {
                navUserBadge.innerHTML = `<i class="fas fa-user-graduate"></i> Student: ${student ? student.name : Session.currentStudentRoll}`;
            }
            if (btnAddStudent) btnAddStudent.style.display = "none";
        }
    } else {
        if (navLoginStaff) navLoginStaff.style.display = "flex";
        if (navLoginStudent) navLoginStudent.style.display = "flex";
        if (navUserInfo) navUserInfo.style.display = "none";
        if (navLogout) navLogout.style.display = "none";
    }
}

// ------------------ Authentication (MongoDB Backend) ------------------
async function handleStaffLogin(event) {
    event.preventDefault();
    const user = document.getElementById("staff-user").value.trim();
    const pass = document.getElementById("staff-pass").value.trim();
    const err = document.getElementById("staff-error");

    try {
        const response = await apiRequest('/auth/staff-login', {
            method: 'POST',
            body: JSON.stringify({ username: user, password: pass })
        });

        if (response.success) {
            err.style.display = "none";
            Session.currentUserType = "staff";
            Session.userRole = response.role || (response.userType === 'admin' ? 'admin' : 'staff');
            Session.currentStudentRoll = null;
            sessionStorage.setItem("currentUserType", Session.currentUserType);
            sessionStorage.setItem("userRole", Session.userRole);  // persist role
            sessionStorage.removeItem("currentStudentRoll");

            document.getElementById("staff-user").value = "";
            document.getElementById("staff-pass").value = "";
            await refreshStudentsFromAPI();
            showPage("staff-dashboard");
        }
    } catch (e) {
        err.style.display = "flex";
        err.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${e.message || "Invalid credentials."}`;
    }
}

async function handleStudentLogin(event) {
    event.preventDefault();
    const roll = document.getElementById("student-roll").value.trim();
    const pass = document.getElementById("student-pass").value.trim();
    const err = document.getElementById("student-error");

    try {
        const response = await apiRequest('/auth/student-login', {
            method: 'POST',
            body: JSON.stringify({ rollNumber: roll, password: pass })
        });

        if (response.success) {
            err.style.display = "none";
            Session.currentUserType = "student";
            Session.userRole = "student";
            Session.currentStudentRoll = roll;
            sessionStorage.setItem("currentUserType", "student");
            sessionStorage.setItem("userRole", "student");         // persist role
            sessionStorage.setItem("currentStudentRoll", roll);

            document.getElementById("student-roll").value = "";
            document.getElementById("student-pass").value = "";
            await refreshStudentsFromAPI();
            showPage("student-dashboard");
        }
    } catch (e) {
        err.style.display = "flex";
        err.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${e.message || "Roll number not found."}`;
    }
}

function logout() {
    Session.currentUserType = null;
    Session.userRole = null;
    Session.currentStudentRoll = null;
    sessionStorage.removeItem("currentUserType");
    sessionStorage.removeItem("userRole");
    sessionStorage.removeItem("currentStudentRoll");
    showPage("home");
}

// ------------------ Form Dropdowns Population ------------------
function populateFormOptions() {
    const standardSelectors = [
        document.getElementById('student-filter-standard'),
        document.getElementById('modal-input-standard'),
        document.getElementById('attendance-standard-select'),
        document.getElementById('marks-standard-select'),
        document.getElementById('ranks-standard-select'),
        document.getElementById('timetable-standard-select'),
        document.getElementById('fees-filter-standard'),
        document.getElementById('exams-filter-standard'),
        document.getElementById('exam-modal-standard')
    ];

    standardSelectors.forEach(select => {
        if (select) {
            const firstOption = (select.id === 'student-filter-standard' || select.id === 'fees-filter-standard' || select.id === 'exams-filter-standard')
                ? '<option value="All">All Standards</option>'
                : '';
            select.innerHTML = firstOption + StandardsList.map(std => `<option value="${escapeHtml(std)}">${escapeHtml(std)}</option>`).join('');
        }
    });

    // Populate reviews student selector
    populateReviewsStudentSelect();
}

function populateReviewsStudentSelect() {
    const revSelect = document.getElementById('reviews-student-select');
    if (revSelect) {
        const sorted = [...AppStore.students].sort((a, b) => a.name.localeCompare(b.name));
        if (sorted.length === 0) {
            revSelect.innerHTML = `<option value="">No students available</option>`;
        } else {
            revSelect.innerHTML = sorted.map(s => `<option value="${escapeHtml(s.rollNumber)}">${escapeHtml(s.name)} (${escapeHtml(s.rollNumber)} - ${escapeHtml(s.standard)})</option>`).join('');
        }
    }
}

// ------------------ Staff Dashboard State Sync ------------------
let activeStaffTab = "standards";

function switchStaffTab(tabName) {
    activeStaffTab = tabName;

    document.querySelectorAll('.sidebar-menu button').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.dashboard-section').forEach(sec => {
        sec.classList.remove('active');
    });
    const activeSec = document.getElementById(`sec-${tabName}`);
    if (activeSec) activeSec.classList.add('active');

    loadStaffActiveTab();
}

async function loadStaffActiveTab() {
    switch (activeStaffTab) {
        case "standards":
            renderStandardsTab();
            break;
        case "students":
            await renderStudentsTable();
            break;
        case "attendance":
            loadAttendanceForSelectedDate();
            break;
        case "marks":
            loadMarksTable();
            break;
        case "performance":
            updatePerformanceMetrics();
            break;
        case "ranks":
            loadRanksDashboard();
            break;
        case "fees":
            renderFeesTable();
            break;
        case "exams":
            renderExamsTable();
            break;
        case "timetable":
            renderTimetableGrid();
            break;
        case "reviews":
            loadStudentReviewsInStaff();
            break;
    }
}

// Calculations for Staff Stats Row
function updateStaffDashboardCounters() {
    const total = AppStore.students.length;
    const totalElem = document.getElementById("stat-total-students");
    if (totalElem) totalElem.innerText = total;

    let totalPresences = 0;
    let totalRecords = 0;
    AppStore.students.forEach(s => {
        Object.values(s.attendance || {}).forEach(status => {
            totalRecords++;
            if (status === 'P') totalPresences++;
        });
    });
    const rate = totalRecords > 0 ? Math.round((totalPresences / totalRecords) * 100) : 0;
    const rateElem = document.getElementById("stat-attendance-rate");
    if (rateElem) rateElem.innerText = `${rate}%`;
}

// ------------------ 1. Standards Module ------------------
function renderStandardsTab() {
    const container = document.getElementById("standards-container");
    if (!container) return;

    container.innerHTML = StandardsList.map(std => {
        const count = AppStore.students.filter(s => s.standard === std).length;
        return `
            <div class="standard-card glass" onclick="filterByStandardCard('${escapeHtml(std)}')">
                <i class="fas fa-school-flag"></i>
                <span>${escapeHtml(std)}</span>
                <small>${count} Student${count === 1 ? '' : 's'} enrolled</small>
            </div>
        `;
    }).join('');
}

function filterByStandardCard(std) {
    const setSelect = (id) => {
        const el = document.getElementById(id);
        if (el) el.value = std;
    };
    setSelect('student-filter-standard');
    setSelect('attendance-standard-select');
    setSelect('marks-standard-select');
    setSelect('ranks-standard-select');
    setSelect('timetable-standard-select');

    switchStaffTab("students");
}

// ------------------ 2. Student Management Module ------------------
function switchModalTab(tabName) {
    document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.modal-tab-pane').forEach(pane => pane.classList.remove('active'));

    const activeBtn = document.getElementById(`modal-tab-btn-${tabName}`);
    const activePane = document.getElementById(`modal-tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activePane) activePane.classList.add('active');
}

async function renderStudentsTable() {
    const search = (document.getElementById("student-search-query")?.value || "").toLowerCase().trim();
    const filterStandard = document.getElementById("student-filter-standard")?.value || "All";
    const filterSection = document.getElementById("student-filter-section")?.value || "All";
    const filterFees = document.getElementById("student-filter-fees")?.value || "All";
    const tbody = document.getElementById("students-table")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const filteredList = AppStore.students.filter(s => {
        const p = s.parent || {};
        const matchesSearch = !search || 
            (s.name && s.name.toLowerCase().includes(search)) ||
            (s.rollNumber && s.rollNumber.toLowerCase().includes(search)) ||
            (s.studentId && s.studentId.toLowerCase().includes(search)) ||
            (s.email && s.email.toLowerCase().includes(search)) ||
            (s.phone && s.phone.toLowerCase().includes(search)) ||
            (p.fatherName && p.fatherName.toLowerCase().includes(search)) ||
            (p.fatherPhone && p.fatherPhone.toLowerCase().includes(search)) ||
            (p.motherName && p.motherName.toLowerCase().includes(search)) ||
            (p.motherPhone && p.motherPhone.toLowerCase().includes(search)) ||
            (p.emergencyContactName && p.emergencyContactName.toLowerCase().includes(search)) ||
            (p.emergencyContactPhone && p.emergencyContactPhone.toLowerCase().includes(search));

        const matchesStandard = filterStandard === "All" || s.standard === filterStandard;
        const matchesSection = filterSection === "All" || (s.section || "A") === filterSection;
        const matchesFees = filterFees === "All" || (s.feesStatus || "Paid") === filterFees;

        return matchesSearch && matchesStandard && matchesSection && matchesFees;
    });

    if (filteredList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No student records found matching the search/filter criteria.</td></tr>`;
        return;
    }

    const isStaffOrAdmin = Session.userRole === 'admin' || Session.userRole === 'staff' || Session.currentUserType === 'staff';

    filteredList.forEach((s) => {
        const feesStatus = s.feesStatus || "Paid";
        const feeBadgeClass = feesStatus === "Paid" ? "badge-success" : feesStatus === "Partially Paid" ? "badge-warning" : "badge-danger";
        const parent = s.parent || {};
        const parentPhone = parent.fatherPhone || parent.motherPhone || parent.emergencyContactPhone || s.phone || "Not provided";
        const parentName = parent.fatherName || parent.motherName || parent.emergencyContactName || "Parent";

        tbody.innerHTML += `
            <tr>
                <td>
                    <strong>${escapeHtml(s.name)}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${escapeHtml(s.studentId || ('STU-' + s.rollNumber))}</div>
                </td>
                <td><code>${escapeHtml(s.rollNumber)}</code></td>
                <td>${escapeHtml(s.standard)}</td>
                <td><span class="badge badge-success">Section ${escapeHtml(s.section || 'A')}</span></td>
                <td>${escapeHtml(s.group || 'General')}</td>
                <td>
                    <div style="font-size: 0.85rem; font-weight: 600;">
                        <i class="fas fa-phone" style="color: var(--primary); font-size: 0.75rem;"></i> ${escapeHtml(parentPhone)}
                    </div>
                    <small style="color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(parentName)}</small>
                </td>
                <td><span class="badge ${feeBadgeClass}">${escapeHtml(feesStatus)}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-secondary btn-icon" onclick="openViewStudentModal('${escapeHtml(s.rollNumber)}')" title="View Full Profile">
                            <i class="fas fa-eye" style="color: var(--secondary);"></i>
                        </button>
                        ${isStaffOrAdmin ? `
                        <button class="btn btn-secondary btn-icon" onclick="openEditStudentModal('${escapeHtml(s.rollNumber)}')" title="Edit Student & Parent">
                            <i class="fas fa-edit" style="color: var(--primary);"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon" onclick="deleteStudent('${escapeHtml(s.rollNumber)}')" title="Delete Student">
                            <i class="fas fa-trash-can" style="color: var(--danger);"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    });
}

function openAddStudentModal() {
    document.getElementById("modal-student-title").innerHTML = `<i class="fas fa-user-plus"></i> Add New Student`;
    document.getElementById("modal-student-index").value = "-1";
    
    // Reset Student Info
    document.getElementById("modal-input-name").value = "";
    document.getElementById("modal-input-roll").value = "";
    document.getElementById("modal-input-roll").removeAttribute("readonly");
    document.getElementById("modal-input-studentid").value = "";
    document.getElementById("modal-input-dob").value = "";
    document.getElementById("modal-input-gender").value = "Male";
    document.getElementById("modal-input-standard").selectedIndex = 0;
    document.getElementById("modal-input-section").selectedIndex = 0;
    document.getElementById("modal-input-group").selectedIndex = 0;
    document.getElementById("modal-input-admission").value = new Date().toISOString().split('T')[0];
    document.getElementById("modal-input-email").value = "";
    document.getElementById("modal-input-phone").value = "";
    document.getElementById("modal-input-address").value = "";
    document.getElementById("modal-input-fees").value = "Paid";
    document.getElementById("modal-input-fees-amount").value = "25000";
    document.getElementById("modal-input-fees-paid").value = "25000";
    document.getElementById("modal-input-comment").value = "";

    // Reset Simplified Parent Info
    document.getElementById("modal-input-father-name").value = "";
    document.getElementById("modal-input-father-phone").value = "";
    document.getElementById("modal-input-mother-name").value = "";
    document.getElementById("modal-input-mother-phone").value = "";

    switchModalTab('student');
    const saveBtn = document.getElementById("modal-student-save-btn");
    if (saveBtn) {
        saveBtn.innerHTML = `<i class="fas fa-floppy-disk"></i> Save Student to Database`;
    }
    document.getElementById("student-crud-modal").classList.add("active");
}

function openEditStudentModal(rollNumber) {
    const student = AppStore.students.find(s => s.rollNumber === rollNumber);
    if (!student) return;

    document.getElementById("modal-student-title").innerHTML = `<i class="fas fa-user-pen"></i> Edit Student & Parent Details`;
    document.getElementById("modal-student-index").value = rollNumber;
    
    // Populate Student Details
    document.getElementById("modal-input-name").value = student.name || "";
    document.getElementById("modal-input-roll").value = student.rollNumber || "";
    document.getElementById("modal-input-roll").setAttribute("readonly", "true");
    document.getElementById("modal-input-studentid").value = student.studentId || ("STU-" + student.rollNumber);
    document.getElementById("modal-input-dob").value = student.dob || "";
    document.getElementById("modal-input-gender").value = student.gender || "Male";
    document.getElementById("modal-input-standard").value = student.standard;
    document.getElementById("modal-input-section").value = student.section || "A";
    document.getElementById("modal-input-group").value = student.group || "General";
    document.getElementById("modal-input-admission").value = student.admissionDate || "";
    document.getElementById("modal-input-email").value = student.email || "";
    document.getElementById("modal-input-phone").value = student.phone || "";
    document.getElementById("modal-input-address").value = student.address || "";
    document.getElementById("modal-input-fees").value = student.feesStatus || "Paid";
    document.getElementById("modal-input-fees-amount").value = student.feesAmount !== undefined ? student.feesAmount : 25000;
    document.getElementById("modal-input-fees-paid").value = student.feesPaid !== undefined ? student.feesPaid : 25000;
    document.getElementById("modal-input-comment").value = student.performanceComment || "";

    // Populate Simplified Parent Details
    const p = student.parent || {};
    document.getElementById("modal-input-father-name").value = p.fatherName || "";
    document.getElementById("modal-input-father-phone").value = p.fatherPhone || "";
    document.getElementById("modal-input-mother-name").value = p.motherName || "";
    document.getElementById("modal-input-mother-phone").value = p.motherPhone || "";

    switchModalTab('student');
    closeViewStudentModal();
    const saveBtn = document.getElementById("modal-student-save-btn");
    if (saveBtn) {
        saveBtn.innerHTML = `<i class="fas fa-floppy-disk"></i> Update Student in Database`;
    }
    document.getElementById("student-crud-modal").classList.add("active");
}

function closeStudentModal() {
    document.getElementById("student-crud-modal").classList.remove("active");
}

function openViewStudentModal(rollNumber) {
    const s = AppStore.students.find(stud => stud.rollNumber === rollNumber);
    if (!s) return;

    const modalBody = document.getElementById("view-student-modal-body");
    const editBtn = document.getElementById("view-modal-edit-btn");
    if (!modalBody) return;

    const p = s.parent || {};
    const feesStatus = s.feesStatus || "Paid";
    const feeBadgeClass = feesStatus === "Paid" ? "badge-success" : feesStatus === "Partially Paid" ? "badge-warning" : "badge-danger";

    modalBody.innerHTML = `
        <div class="view-profile-header">
            <div class="view-profile-avatar">${escapeHtml((s.name || 'S').charAt(0).toUpperCase())}</div>
            <div class="view-profile-info">
                <h3>${escapeHtml(s.name)}</h3>
                <p>Roll No: <strong>${escapeHtml(s.rollNumber)}</strong> • ID: <strong>${escapeHtml(s.studentId || ('STU-' + s.rollNumber))}</strong> • Class: <strong>${escapeHtml(s.standard)} (Section ${escapeHtml(s.section || 'A')})</strong></p>
                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center;">
                    <span class="badge ${feeBadgeClass}">Fees: ${escapeHtml(feesStatus)}</span>
                    <span class="badge badge-success">${escapeHtml(s.group || 'General')}</span>
                </div>
            </div>
        </div>

        <h4 style="font-weight: 800; font-size: 1rem; color: var(--primary); margin-bottom: 0.8rem;">
            <i class="fas fa-user-graduate"></i> Student Information
        </h4>
        <div class="view-info-grid">
            <div class="view-info-item"><label>Date of Birth</label><span>${escapeHtml(s.dob || 'Not specified')}</span></div>
            <div class="view-info-item"><label>Gender</label><span>${escapeHtml(s.gender || 'Not specified')}</span></div>
            <div class="view-info-item"><label>Admission Date</label><span>${escapeHtml(s.admissionDate || 'Not specified')}</span></div>
            <div class="view-info-item"><label>Student Email</label><span>${escapeHtml(s.email || 'Not provided')}</span></div>
            <div class="view-info-item"><label>Student Phone</label><span>${escapeHtml(s.phone || 'Not provided')}</span></div>
            <div class="view-info-item"><label>Total / Paid Fee</label><span>₹${s.feesAmount || 0} / ₹${s.feesPaid || 0}</span></div>
            <div class="view-info-item" style="grid-column: 1 / -1;"><label>Address</label><span>${escapeHtml(s.address || 'Not specified')}</span></div>
            <div class="view-info-item" style="grid-column: 1 / -1;"><label>Faculty Remarks</label><span>"${escapeHtml(s.performanceComment || 'No remarks')}"</span></div>
        </div>

        <h4 style="font-weight: 800; font-size: 1rem; color: var(--primary); margin-top: 1.5rem; margin-bottom: 0.8rem;">
            <i class="fas fa-people-roof"></i> Parent & Guardian Details
        </h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
            <div class="parent-sub-card">
                <div class="parent-sub-card-header"><i class="fas fa-person"></i> Father / Guardian</div>
                <p style="font-size: 0.85rem; margin-bottom: 0.3rem;"><strong>Name:</strong> ${escapeHtml(p.fatherName || 'Not specified')}</p>
                <p style="font-size: 0.85rem; margin-bottom: 0.3rem;"><strong>Phone:</strong> <a href="tel:${escapeHtml(p.fatherPhone || '')}">${escapeHtml(p.fatherPhone || 'Not provided')}</a></p>
            </div>
            <div class="parent-sub-card">
                <div class="parent-sub-card-header"><i class="fas fa-person-dress"></i> Mother / Guardian</div>
                <p style="font-size: 0.85rem; margin-bottom: 0.3rem;"><strong>Name:</strong> ${escapeHtml(p.motherName || 'Not specified')}</p>
                <p style="font-size: 0.85rem; margin-bottom: 0.3rem;"><strong>Phone:</strong> <a href="tel:${escapeHtml(p.motherPhone || '')}">${escapeHtml(p.motherPhone || 'Not provided')}</a></p>
            </div>
        </div>
    `;

    const isStaffOrAdmin = Session.userRole === 'admin' || Session.userRole === 'staff' || Session.currentUserType === 'staff';

    if (editBtn) {
        if (isStaffOrAdmin) {
            editBtn.style.display = 'inline-flex';
            editBtn.onclick = () => openEditStudentModal(rollNumber);
        } else {
            editBtn.style.display = 'none';
        }
    }

    document.getElementById("student-view-modal").classList.add("active");
}

function closeViewStudentModal() {
    document.getElementById("student-view-modal")?.classList.remove("active");
}

function isValidPhone(phoneStr) {
    if (!phoneStr || !phoneStr.trim()) return true;
    const digits = phoneStr.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
}

async function handleStudentFormSubmit(event) {
    event.preventDefault();
    const isEditMode = document.getElementById("modal-student-index").value !== "-1";
    
    // Student basic fields
    const name = document.getElementById("modal-input-name").value.trim();
    const roll = document.getElementById("modal-input-roll").value.trim();
    const studentId = document.getElementById("modal-input-studentid").value.trim() || `STU-${roll}`;
    const dob = document.getElementById("modal-input-dob").value;
    const gender = document.getElementById("modal-input-gender").value;
    const standard = document.getElementById("modal-input-standard").value;
    const section = document.getElementById("modal-input-section").value;
    const group = document.getElementById("modal-input-group").value;
    const admissionDate = document.getElementById("modal-input-admission").value;
    const email = document.getElementById("modal-input-email").value.trim();
    const phone = document.getElementById("modal-input-phone").value.trim();
    const address = document.getElementById("modal-input-address").value.trim();
    const feesStatus = document.getElementById("modal-input-fees")?.value || "Paid";
    const feesAmount = parseFloat(document.getElementById("modal-input-fees-amount")?.value) || 25000.0;
    const feesPaid = parseFloat(document.getElementById("modal-input-fees-paid")?.value) || 25000.0;
    const comment = document.getElementById("modal-input-comment").value.trim();

    // Simplified parent details
    const fatherName = document.getElementById("modal-input-father-name").value.trim();
    const fatherPhone = document.getElementById("modal-input-father-phone").value.trim();
    const motherName = document.getElementById("modal-input-mother-name").value.trim();
    const motherPhone = document.getElementById("modal-input-mother-phone").value.trim();

    // Validation checks
    if (!name) {
        alert("Student Name is required.");
        switchModalTab('student');
        document.getElementById("modal-input-name").focus();
        return;
    }
    if (!roll) {
        alert("Roll Number is required.");
        switchModalTab('student');
        document.getElementById("modal-input-roll").focus();
        return;
    }
    if (!standard) {
        alert("Standard Level is required.");
        switchModalTab('student');
        return;
    }
    if (phone && !isValidPhone(phone)) {
        alert("Please enter a valid student phone number (7 to 15 digits).");
        switchModalTab('student');
        document.getElementById("modal-input-phone").focus();
        return;
    }
    if (fatherPhone && !isValidPhone(fatherPhone)) {
        alert("Please enter a valid Father/Guardian phone number (7 to 15 digits).");
        switchModalTab('parent');
        document.getElementById("modal-input-father-phone").focus();
        return;
    }
    if (motherPhone && !isValidPhone(motherPhone)) {
        alert("Please enter a valid Mother/Guardian phone number (7 to 15 digits).");
        switchModalTab('parent');
        document.getElementById("modal-input-mother-phone").focus();
        return;
    }

    const parentPayload = {
        fatherName: fatherName,
        fatherPhone: fatherPhone,
        motherName: motherName,
        motherPhone: motherPhone
    };

    const saveBtn = document.getElementById("modal-student-save-btn");
    const originalText = saveBtn.innerHTML;
    // Prevent multiple submissions
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving to MongoDB...`;
    saveBtn.disabled = true;

    try {
        if (!isEditMode) {
            // Create in MongoDB
            await apiRequest('/students', {
                method: 'POST',
                body: JSON.stringify({
                    name: name,
                    rollNumber: roll,
                    studentId: studentId,
                    dob: dob,
                    gender: gender,
                    standard: standard,
                    section: section,
                    group: group,
                    admissionDate: admissionDate,
                    email: email,
                    phone: phone,
                    address: address,
                    feesStatus: feesStatus,
                    feesAmount: feesAmount,
                    feesPaid: feesPaid,
                    performanceComment: comment || "Enrolled recently.",
                    parent: parentPayload
                })
            });
        } else {
            // Update in MongoDB
            await apiRequest(`/students/${encodeURIComponent(roll)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: name,
                    studentId: studentId,
                    dob: dob,
                    gender: gender,
                    standard: standard,
                    section: section,
                    group: group,
                    admissionDate: admissionDate,
                    email: email,
                    phone: phone,
                    address: address,
                    feesStatus: feesStatus,
                    feesAmount: feesAmount,
                    feesPaid: feesPaid,
                    performanceComment: comment,
                    parent: parentPayload
                })
            });
        }

        // Success: refresh list, close modal, update UI
        await refreshStudentsFromAPI();
        closeStudentModal();
        populateReviewsStudentSelect();
        renderStudentsTable();
        renderStandardsTab();

        alert(isEditMode ? "Student updated successfully!" : "Student added successfully!");
    } catch (e) {
        alert("Error saving student to MongoDB: " + e.message);
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

async function deleteStudent(rollNumber) {
    const student = AppStore.students.find(s => s.rollNumber === rollNumber);
    if (!student) return;

    if (confirm(`Are you sure you wish to delete student ${student.name} (Roll: ${student.rollNumber})? This will permanently remove their academic and parent details from MongoDB.`)) {
        try {
            await apiRequest(`/students/${encodeURIComponent(rollNumber)}`, {
                method: 'DELETE'
            });
            await refreshStudentsFromAPI();
            populateReviewsStudentSelect();
            renderStudentsTable();
            renderStandardsTab();
        } catch (e) {
            alert("Error deleting student from MongoDB: " + e.message);
        }
    }
}

// ------------------ 3. Attendance Management Module ------------------
function loadAttendanceForSelectedDate() {
    const date = document.getElementById("attendance-date-select")?.value;
    const tbody = document.getElementById("attendance-marking-table")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!date) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">Please select a valid date.</td></tr>`;
        return;
    }

    const sortedStudents = [...AppStore.students].sort((a, b) => a.name.localeCompare(b.name));

    if (sortedStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No student enrollments found.</td></tr>`;
        updateAttendanceDateStats(sortedStudents, date);
        return;
    }

    sortedStudents.forEach(s => {
        const status = (s.attendance && s.attendance[date]) || "";

        tbody.innerHTML += `
            <tr>
                <td><code>${escapeHtml(s.rollNumber)}</code></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${escapeHtml(s.standard)}</td>
                <td>
                    <div class="toggle-btn-group">
                        <button class="toggle-btn present ${status === 'P' ? 'active' : ''}" onclick="toggleStudentAttendance('${escapeHtml(s.rollNumber)}', '${escapeHtml(date)}', 'P')">Present</button>
                        <button class="toggle-btn absent ${status === 'A' ? 'active' : ''}" onclick="toggleStudentAttendance('${escapeHtml(s.rollNumber)}', '${escapeHtml(date)}', 'A')">Absent</button>
                    </div>
                </td>
            </tr>
        `;
    });

    updateAttendanceDateStats(sortedStudents, date);
}

async function toggleStudentAttendance(roll, date, newStatus) {
    try {
        const response = await apiRequest('/students/attendance/toggle', {
            method: 'POST',
            body: JSON.stringify({
                rollNumber: roll,
                date: date,
                status: newStatus
            })
        });

        // Update local store immediately
        const student = AppStore.students.find(s => s.rollNumber === roll);
        if (student) {
            if (!student.attendance) student.attendance = {};
            if (response.status) {
                student.attendance[date] = response.status;
            } else {
                delete student.attendance[date];
            }
        }

        loadAttendanceForSelectedDate();
        updateStaffDashboardCounters();
    } catch (e) {
        alert("Error saving attendance to MongoDB: " + e.message);
    }
}

function updateAttendanceDateStats(filteredStudents, date) {
    let present = 0;
    let absent = 0;

    filteredStudents.forEach(s => {
        const status = (s.attendance && s.attendance[date]) || "";
        if (status === 'P') present++;
        else if (status === 'A') absent++;
    });

    const totalMarked = present + absent;
    const rate = totalMarked > 0 ? Math.round((present / totalMarked) * 100) : 0;

    document.getElementById("attendance-date-present").innerText = present;
    document.getElementById("attendance-date-absent").innerText = absent;
    document.getElementById("attendance-date-rate").innerText = `${rate}%`;
}

// ------------------ 4. Test Marks Management Module ------------------
function loadMarksTable() {
    const testType = document.getElementById("marks-test-type")?.value || "weekly";
    const standard = document.getElementById("marks-standard-select")?.value;
    const tbody = document.getElementById("marks-input-table")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const students = AppStore.students.filter(s => s.standard === standard);

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No student enrollments in ${escapeHtml(standard || 'selected class')}.</td></tr>`;
        document.getElementById("marks-class-average").innerText = "0%";
        return;
    }

    let classTotalPercentages = 0;

    students.forEach((s) => {
        const scores = (s.marks && s.marks[testType]) || { english: 0, math: 0, science: 0, history: 0 };
        const total = (scores.english || 0) + (scores.math || 0) + (scores.science || 0) + (scores.history || 0);
        const percent = Math.round((total / 400) * 100);
        classTotalPercentages += percent;

        tbody.innerHTML += `
            <tr data-roll="${escapeHtml(s.rollNumber)}">
                <td><code>${escapeHtml(s.rollNumber)}</code></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td><input type="number" min="0" max="100" class="marks-input eng" value="${scores.english || 0}" oninput="recalculateRowMarks(this)"></td>
                <td><input type="number" min="0" max="100" class="marks-input math" value="${scores.math || 0}" oninput="recalculateRowMarks(this)"></td>
                <td><input type="number" min="0" max="100" class="marks-input sci" value="${scores.science || 0}" oninput="recalculateRowMarks(this)"></td>
                <td><input type="number" min="0" max="100" class="marks-input hist" value="${scores.history || 0}" oninput="recalculateRowMarks(this)"></td>
                <td><span class="row-total" style="font-weight: 700;">${total}</span></td>
                <td><span class="row-percent badge ${percent >= 75 ? 'badge-success' : percent >= 45 ? 'badge-warning' : 'badge-danger'}">${percent}%</span></td>
            </tr>
        `;
    });

    const classAvg = Math.round(classTotalPercentages / students.length);
    document.getElementById("marks-class-average").innerText = `${classAvg}%`;
}

function recalculateRowMarks(inputElem) {
    const row = inputElem.closest("tr");
    const eng = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.eng").value) || 0));
    const math = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.math").value) || 0));
    const sci = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.sci").value) || 0));
    const hist = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.hist").value) || 0));

    const total = eng + math + sci + hist;
    const percent = Math.round((total / 400) * 100);

    row.querySelector(".row-total").innerText = total;
    const percentBadge = row.querySelector(".row-percent");
    percentBadge.innerText = `${percent}%`;
    percentBadge.className = "row-percent badge " + (percent >= 75 ? "badge-success" : percent >= 45 ? "badge-warning" : "badge-danger");
}

async function saveActiveMarks() {
    const testType = document.getElementById("marks-test-type").value;
    const rows = document.querySelectorAll("#marks-input-table tbody tr");
    if (rows.length === 0) return;

    let savedCount = 0;
    for (const row of rows) {
        const roll = row.getAttribute("data-roll");
        if (!roll) continue;

        const eng = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.eng").value) || 0));
        const math = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.math").value) || 0));
        const sci = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.sci").value) || 0));
        const hist = Math.min(100, Math.max(0, parseInt(row.querySelector(".marks-input.hist").value) || 0));

        try {
            await apiRequest(`/students/${encodeURIComponent(roll)}/marks`, {
                method: 'PUT',
                body: JSON.stringify({
                    testType: testType,
                    marks: { english: eng, math: math, science: sci, history: hist }
                })
            });

            // Update local memory
            const student = AppStore.students.find(s => s.rollNumber === roll);
            if (student) {
                if (!student.marks) student.marks = {};
                student.marks[testType] = { english: eng, math: math, science: sci, history: hist };
            }
            savedCount++;
        } catch (e) {
            console.error(`Failed to save marks for ${roll}:`, e);
        }
    }

    if (savedCount > 0) {
        loadMarksTable();
        alert(`Academic marksheet updated in MongoDB Atlas for ${savedCount} students.`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEES MANAGEMENT MODULE (Staff/Admin)
// ─────────────────────────────────────────────────────────────────────────────
function renderFeesTable() {
    const search   = (document.getElementById('fees-search-query')?.value || '').toLowerCase().trim();
    const fStatus  = document.getElementById('fees-filter-status')?.value  || 'All';
    const fStd     = document.getElementById('fees-filter-standard')?.value || 'All';
    const tbody    = document.getElementById('fees-management-table')?.querySelector('tbody');
    if (!tbody) return;

    const filtered = AppStore.students.filter(s => {
        const matchSearch  = !search || s.name?.toLowerCase().includes(search) || s.rollNumber?.toLowerCase().includes(search);
        const matchStatus  = fStatus === 'All' || (s.feesStatus || 'Paid') === fStatus;
        const matchStd     = fStd === 'All' || s.standard === fStd;
        return matchSearch && matchStatus && matchStd;
    });

    // Update summary stats (all students, not just filtered)
    const paid    = AppStore.students.filter(s => (s.feesStatus || 'Paid') === 'Paid').length;
    const partial = AppStore.students.filter(s => s.feesStatus === 'Partially Paid').length;
    const pending = AppStore.students.filter(s => s.feesStatus === 'Pending').length;
    const paidEl = document.getElementById('fees-stat-paid');
    const partEl = document.getElementById('fees-stat-partial');
    const pendEl = document.getElementById('fees-stat-pending');
    if (paidEl) paidEl.innerText = paid;
    if (partEl) partEl.innerText = partial;
    if (pendEl) pendEl.innerText = pending;

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No students match the current filter.</td></tr>`;
        return;
    }

    filtered.forEach(s => {
        const total   = s.feesAmount || 0;
        const paidAmt = s.feesPaid   || 0;
        const balance = Math.max(0, total - paidAmt);
        const status  = s.feesStatus || 'Paid';
        const badgeCls = status === 'Paid' ? 'badge-success' : status === 'Partially Paid' ? 'badge-warning' : 'badge-danger';

        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHtml(s.name)}</strong><div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(s.studentId || 'STU-'+s.rollNumber)}</div></td>
                <td><code>${escapeHtml(s.rollNumber)}</code></td>
                <td>${escapeHtml(s.standard)}</td>
                <td style="font-weight:700;">&#8377;${total.toLocaleString('en-IN')}</td>
                <td style="font-weight:700;color:var(--success);">&#8377;${paidAmt.toLocaleString('en-IN')}</td>
                <td style="font-weight:700;color:${balance > 0 ? 'var(--danger)' : 'var(--success)'};">&#8377;${balance.toLocaleString('en-IN')}</td>
                <td><span class="badge ${badgeCls}">${escapeHtml(status)}</span></td>
                <td>
                    <button class="btn btn-secondary btn-icon" onclick="openFeesModal('${escapeHtml(s.rollNumber)}')" title="Update Fees">
                        <i class="fas fa-edit" style="color:var(--primary);"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

function openFeesModal(rollNumber) {
    const s = AppStore.students.find(st => st.rollNumber === rollNumber);
    if (!s) return;
    document.getElementById('fees-modal-roll').value         = rollNumber;
    document.getElementById('fees-modal-student-name').innerText = s.name;
    document.getElementById('fees-modal-status').value       = s.feesStatus || 'Paid';
    document.getElementById('fees-modal-total').value        = s.feesAmount  || 0;
    document.getElementById('fees-modal-paid').value         = s.feesPaid    || 0;
    document.getElementById('fees-edit-modal').classList.add('active');
}

function closeFeesModal() {
    document.getElementById('fees-edit-modal').classList.remove('active');
}

async function handleFeesFormSubmit(event) {
    event.preventDefault();
    const roll    = document.getElementById('fees-modal-roll').value;
    const status  = document.getElementById('fees-modal-status').value;
    const total   = parseFloat(document.getElementById('fees-modal-total').value) || 0;
    const paid    = parseFloat(document.getElementById('fees-modal-paid').value)  || 0;

    const saveBtn = document.getElementById('fees-modal-save-btn');
    const orig    = saveBtn.innerHTML;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    saveBtn.disabled  = true;

    try {
        await apiRequest(`/students/${encodeURIComponent(roll)}/fees`, {
            method: 'PUT',
            body: JSON.stringify({ feesStatus: status, feesAmount: total, feesPaid: paid })
        });

        // Update local store
        const student = AppStore.students.find(s => s.rollNumber === roll);
        if (student) {
            student.feesStatus  = status;
            student.feesAmount  = total;
            student.feesPaid    = paid;
        }

        closeFeesModal();
        renderFeesTable();
        alert(`Fees updated successfully in MongoDB for ${roll}.`);
    } catch (e) {
        alert('Error updating fees: ' + e.message);
    } finally {
        saveBtn.innerHTML = orig;
        saveBtn.disabled  = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAM SCHEDULE MANAGEMENT MODULE (Staff/Admin)
// ─────────────────────────────────────────────────────────────────────────────
async function renderExamsTable() {
    const fStd  = document.getElementById('exams-filter-standard')?.value || 'All';
    const tbody = document.getElementById('exams-management-table')?.querySelector('tbody');
    if (!tbody) return;

    // Refresh from API to get latest
    try {
        AppStore.exams = await apiRequest('/exams' + (fStd !== 'All' ? `?standard=${encodeURIComponent(fStd)}` : ''));
    } catch (e) { /* use cached */ }

    const filtered = fStd === 'All' ? AppStore.exams : AppStore.exams.filter(e => e.standard === fStd);

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No exam schedules found. Click "Add Exam" to create one.</td></tr>`;
        return;
    }

    filtered.forEach(ex => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHtml(ex.testName)}</strong></td>
                <td>${escapeHtml(ex.standard)}</td>
                <td>${escapeHtml(ex.subject)}</td>
                <td><code>${escapeHtml(ex.examDate)}</code></td>
                <td>${escapeHtml(ex.startTime || '09:30 AM')}</td>
                <td>${ex.durationMinutes || 90} min</td>
                <td>${ex.maxMarks || 100}</td>
                <td>
                    <button class="btn btn-secondary btn-icon" onclick="deleteExam('${escapeHtml(ex.id)}')" title="Delete Exam">
                        <i class="fas fa-trash-can" style="color:var(--danger);"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

function openAddExamModal() {
    document.getElementById('exam-modal-name').value     = '';
    document.getElementById('exam-modal-subject').value  = '';
    document.getElementById('exam-modal-date').value     = '';
    document.getElementById('exam-modal-time').value     = '09:30 AM';
    document.getElementById('exam-modal-duration').value = '90';
    document.getElementById('exam-modal-maxmarks').value = '100';
    if (StandardsList.length > 0) {
        const sel = document.getElementById('exam-modal-standard');
        if (sel) sel.value = StandardsList[0];
    }
    document.getElementById('exam-add-modal').classList.add('active');
}

function closeAddExamModal() {
    document.getElementById('exam-add-modal').classList.remove('active');
}

async function handleExamFormSubmit(event) {
    event.preventDefault();
    const saveBtn = document.getElementById('exam-modal-save-btn');
    const orig    = saveBtn.innerHTML;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    saveBtn.disabled  = true;

    try {
        const newExam = await apiRequest('/exams', {
            method: 'POST',
            body: JSON.stringify({
                testName:        document.getElementById('exam-modal-name').value.trim(),
                standard:        document.getElementById('exam-modal-standard').value,
                subject:         document.getElementById('exam-modal-subject').value.trim(),
                examDate:        document.getElementById('exam-modal-date').value,
                startTime:       document.getElementById('exam-modal-time').value.trim() || '09:30 AM',
                durationMinutes: parseInt(document.getElementById('exam-modal-duration').value) || 90,
                maxMarks:        parseInt(document.getElementById('exam-modal-maxmarks').value) || 100
            })
        });
        AppStore.exams.push(newExam);
        closeAddExamModal();
        renderExamsTable();
        alert('Exam schedule saved to MongoDB Atlas!');
    } catch (e) {
        alert('Error saving exam: ' + e.message);
    } finally {
        saveBtn.innerHTML = orig;
        saveBtn.disabled  = false;
    }
}

async function deleteExam(examId) {
    if (!confirm('Delete this exam schedule from MongoDB?')) return;
    try {
        await apiRequest(`/exams/${encodeURIComponent(examId)}`, { method: 'DELETE' });
        AppStore.exams = AppStore.exams.filter(e => e.id !== examId);
        renderExamsTable();
    } catch (e) {
        alert('Error deleting exam: ' + e.message);
    }
}

// ------------------ 5. Performance Analysis Module ------------------
let activePerformanceFilter = "excellent";

function updatePerformanceMetrics() {
    let counts = { excellent: 0, improved: 0, good: 0, warning: 0, decreased: 0 };

    AppStore.students.forEach(s => {
        const metrics = getStudentAveragesAndTrend(s);
        if (metrics.average >= 90) counts.excellent++;
        if (metrics.avgMonthly > metrics.avgWeekly) counts.improved++;
        if (metrics.average >= 75 && metrics.average < 90) counts.good++;
        if (metrics.average < 50) counts.warning++;
        if (metrics.avgMonthly < metrics.avgWeekly) counts.decreased++;
    });

    document.getElementById("perf-cnt-excellent").innerText = counts.excellent;
    document.getElementById("perf-cnt-improved").innerText = counts.improved;
    document.getElementById("perf-cnt-good").innerText = counts.good;
    document.getElementById("perf-cnt-warning").innerText = counts.warning;
    document.getElementById("perf-cnt-decreased").innerText = counts.decreased;

    filterPerformance(activePerformanceFilter);
}

function filterPerformance(filterType) {
    activePerformanceFilter = filterType;

    document.querySelectorAll(".perf-card").forEach(c => c.classList.remove("active"));
    document.getElementById(`perf-btn-${filterType}`)?.classList.add("active");

    const headings = {
        excellent: "Top Achievers (Average Marks > 90%)",
        improved: "Upward Trend (Monthly test grades higher than weekly)",
        good: "Consistent Performers (Average Marks 75% - 90%)",
        warning: "Requires Immediate Tutoring (Average Marks Below 50%)",
        decreased: "Performance Slump (Monthly marks dropped below weekly tests)"
    };

    document.getElementById("performance-table-heading").innerText = headings[filterType] || "Performance List";

    const tbody = document.getElementById("performance-students-table")?.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const matchedList = AppStore.students.filter(s => {
        const m = getStudentAveragesAndTrend(s);
        if (filterType === 'excellent' && m.average >= 90) return true;
        if (filterType === 'improved' && m.avgMonthly > m.avgWeekly) return true;
        if (filterType === 'good' && m.average >= 75 && m.average < 90) return true;
        if (filterType === 'warning' && m.average < 50) return true;
        if (filterType === 'decreased' && m.avgMonthly < m.avgWeekly) return true;
        return false;
    });

    if (matchedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No student records matched this filter.</td></tr>`;
        return;
    }

    matchedList.forEach(s => {
        const m = getStudentAveragesAndTrend(s);
        const diff = m.avgMonthly - m.avgWeekly;
        let diffStr = "-";
        let diffClass = "";

        if (diff > 0) {
            diffStr = `+${diff}% <i class="fas fa-arrow-trend-up"></i>`;
            diffClass = "badge-success";
        } else if (diff < 0) {
            diffStr = `${diff}% <i class="fas fa-arrow-trend-down"></i>`;
            diffClass = "badge-danger";
        }

        tbody.innerHTML += `
            <tr>
                <td><code>${escapeHtml(s.rollNumber)}</code></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${escapeHtml(s.standard)}</td>
                <td>${m.avgWeekly}%</td>
                <td>${m.avgMonthly}%</td>
                <td><span class="badge ${diffClass}">${diffStr}</span></td>
            </tr>
        `;
    });
}

function getStudentAveragesAndTrend(student) {
    const weekly = student.marks?.weekly || { english: 0, math: 0, science: 0, history: 0 };
    const monthly = student.marks?.monthly || { english: 0, math: 0, science: 0, history: 0 };

    const totalW = (weekly.english || 0) + (weekly.math || 0) + (weekly.science || 0) + (weekly.history || 0);
    const totalM = (monthly.english || 0) + (monthly.math || 0) + (monthly.science || 0) + (monthly.history || 0);

    const avgW = Math.round((totalW / 400) * 100);
    const avgM = Math.round((totalM / 400) * 100);

    return {
        avgWeekly: avgW,
        avgMonthly: avgM,
        average: Math.round((avgW + avgM) / 2)
    };
}

// ------------------ 6. Rank Management Module ------------------
function loadRanksDashboard() {
    const standard = document.getElementById("ranks-standard-select")?.value;
    const tbody = document.getElementById("ranks-table")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const students = AppStore.students.filter(s => s.standard === standard);

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No student enrollments to rank in ${escapeHtml(standard || '')}.</td></tr>`;
        document.getElementById("ranks-top-scorer").innerText = "N/A";
        return;
    }

    const rankedList = students.map(s => {
        const metrics = getStudentAveragesAndTrend(s);
        return {
            student: s,
            avg: metrics.average,
            math: s.marks?.monthly?.math || 0,
            science: s.marks?.monthly?.science || 0
        };
    }).sort((a, b) => b.avg - a.avg);

    const top = rankedList[0];
    document.getElementById("ranks-top-scorer").innerText = `${top.student.name} (${top.avg}%)`;

    rankedList.forEach((item, index) => {
        const rankNum = index + 1;
        let medalClass = "normal";
        let badge = rankNum;

        if (rankNum === 1) { medalClass = "gold"; badge = '<i class="fas fa-trophy"></i>'; }
        else if (rankNum === 2) { medalClass = "silver"; badge = '<i class="fas fa-medal"></i>'; }
        else if (rankNum === 3) { medalClass = "bronze"; badge = '<i class="fas fa-award"></i>'; }

        const grade = item.avg >= 90 ? 'A+' : item.avg >= 75 ? 'A' : item.avg >= 50 ? 'B' : 'Needs Assistance';
        const gradeClass = item.avg >= 75 ? 'badge-success' : item.avg >= 50 ? 'badge-warning' : 'badge-danger';

        tbody.innerHTML += `
            <tr>
                <td><span class="rank-medal ${medalClass}">${badge}</span></td>
                <td><strong>${escapeHtml(item.student.name)}</strong></td>
                <td><code>${escapeHtml(item.student.rollNumber)}</code></td>
                <td>${item.math}/100</td>
                <td>${item.science}/100</td>
                <td><span style="font-weight: 800; color: var(--primary);">${item.avg}%</span></td>
                <td><span class="badge ${gradeClass}">${grade}</span></td>
            </tr>
        `;
    });
}

function getStudentRankInClass(rollNum, standard) {
    const classmates = AppStore.students.filter(s => s.standard === standard);
    const mapped = classmates.map(s => ({
        roll: s.rollNumber,
        avg: getStudentAveragesAndTrend(s).average
    })).sort((a, b) => b.avg - a.avg);

    const index = mapped.findIndex(m => m.roll === rollNum);
    return {
        rank: index !== -1 ? index + 1 : 'N/A',
        total: classmates.length
    };
}

// ------------------ 7. Timetable Management Module ------------------
let isTimetableEditingActive = false;

const DEFAULT_TIMETABLE_FALLBACK = [
    { period: "Period 1 (08:30 - 09:15)", mon: "Mathematics", tue: "Science", wed: "English", thu: "History", fri: "Mathematics" },
    { period: "Period 2 (09:20 - 10:05)", mon: "Science", tue: "Mathematics", wed: "History", thu: "English", fri: "Science" },
    { period: "Period 3 (10:10 - 10:55)", mon: "English", tue: "History", wed: "Mathematics", thu: "Science", fri: "English" },
    { period: "Break (10:55 - 11:30)", mon: "Break", tue: "Break", wed: "Break", thu: "Break", fri: "Break" },
    { period: "Period 4 (11:30 - 12:15)", mon: "History", tue: "English", wed: "Science", thu: "Mathematics", fri: "Physical Ed" },
    { period: "Period 5 (12:20 - 01:05)", mon: "Computer Sci", tue: "Computer Sci", wed: "Art & Music", thu: "Library", fri: "Assembly" }
];

function getTimetableForStandard(standard) {
    if (AppStore.timetables && AppStore.timetables[standard]) {
        return AppStore.timetables[standard];
    }
    return AppStore.timetables["Default"] || DEFAULT_TIMETABLE_FALLBACK;
}

function renderTimetableGrid() {
    const standard = document.getElementById("timetable-standard-select")?.value;
    const table = document.getElementById("timetable-editor-grid");
    const tbody = table?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const tableRows = getTimetableForStandard(standard);

    tableRows.forEach((row, rowIndex) => {
        const isBreak = row.mon === "Break";

        if (isBreak) {
            tbody.innerHTML += `
                <tr data-row="${rowIndex}">
                    <td><code>${escapeHtml(row.period)}</code></td>
                    <td colspan="5" style="text-align: center; font-weight: 700; background: var(--bg-main); letter-spacing: 5px;">BREAK PERIOD</td>
                </tr>
            `;
        } else {
            const days = ["mon", "tue", "wed", "thu", "fri"];
            let cellsHTML = "";

            days.forEach(day => {
                const cellVal = row[day] || "-";
                if (isTimetableEditingActive) {
                    cellsHTML += `<td><input type="text" class="timetable-cell-edit" data-day="${day}" value="${escapeHtml(cellVal)}"></td>`;
                } else {
                    cellsHTML += `<td><strong>${escapeHtml(cellVal)}</strong></td>`;
                }
            });

            tbody.innerHTML += `
                <tr data-row="${rowIndex}">
                    <td><code>${escapeHtml(row.period)}</code></td>
                    ${cellsHTML}
                </tr>
            `;
        }
    });
}

async function toggleTimetableEditing() {
    const btn = document.getElementById("timetable-toggle-edit-btn");
    const status = document.getElementById("timetable-edit-status");
    const select = document.getElementById("timetable-standard-select");

    if (!isTimetableEditingActive) {
        isTimetableEditingActive = true;
        btn.innerHTML = `<i class="fas fa-floppy-disk"></i> Lock & Save`;
        btn.className = "btn btn-success";
        status.style.display = "block";
        select.setAttribute("disabled", "true");
        renderTimetableGrid();
    } else {
        const standard = select.value;
        const rows = document.querySelectorAll("#timetable-editor-grid tbody tr");
        const currentTimetable = JSON.parse(JSON.stringify(getTimetableForStandard(standard)));

        rows.forEach(tr => {
            const rowIdx = parseInt(tr.getAttribute("data-row"));
            const inputs = tr.querySelectorAll(".timetable-cell-edit");

            inputs.forEach(input => {
                const dayKey = input.getAttribute("data-day");
                if (currentTimetable[rowIdx]) {
                    currentTimetable[rowIdx][dayKey] = input.value.trim() || "-";
                }
            });
        });

        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
        btn.disabled = true;

        try {
            await apiRequest(`/timetables/${encodeURIComponent(standard)}`, {
                method: 'PUT',
                body: JSON.stringify(currentTimetable)
            });

            if (!AppStore.timetables) AppStore.timetables = {};
            AppStore.timetables[standard] = currentTimetable;

            isTimetableEditingActive = false;
            btn.innerHTML = `<i class="fas fa-edit"></i> Edit Timetable`;
            btn.className = "btn btn-primary";
            btn.disabled = false;
            status.style.display = "none";
            select.removeAttribute("disabled");
            renderTimetableGrid();
            alert(`Timetable saved successfully in MongoDB Atlas for ${standard}`);
        } catch (e) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-floppy-disk"></i> Lock & Save`;
            alert("Error saving timetable to MongoDB: " + e.message);
        }
    }
}

function openImportTimetableModal() {
    const standard = document.getElementById("timetable-standard-select")?.value;
    const currentTimetable = getTimetableForStandard(standard);
    document.getElementById("timetable-import-json").value = JSON.stringify(currentTimetable, null, 2);
    document.getElementById("timetable-import-modal").classList.add("active");
}

function closeImportTimetableModal() {
    document.getElementById("timetable-import-modal").classList.remove("active");
}

async function importTimetableJSON() {
    const jsonText = document.getElementById("timetable-import-json").value;
    const standard = document.getElementById("timetable-standard-select").value;

    try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            alert("Invalid JSON format. Timetable must be a non-empty array of objects.");
            return;
        }

        await apiRequest(`/timetables/${encodeURIComponent(standard)}`, {
            method: 'PUT',
            body: JSON.stringify(parsed)
        });

        if (!AppStore.timetables) AppStore.timetables = {};
        AppStore.timetables[standard] = parsed;

        closeImportTimetableModal();
        renderTimetableGrid();
        alert(`Custom timetable imported to MongoDB Atlas for ${standard}!`);
    } catch (e) {
        alert("Error importing timetable: " + e.message);
    }
}

// ------------------ 8. Student Reviews Module ------------------
let selectedReviewRating = 5;

function setReviewRating(rating) {
    selectedReviewRating = rating;
    const inputRating = document.getElementById("review-input-rating");
    if (inputRating) inputRating.value = rating;

    const stars = document.querySelectorAll("#review-interactive-stars i");
    stars.forEach(star => {
        const val = parseInt(star.getAttribute("data-value"));
        if (val <= rating) {
            star.classList.remove("fa-regular");
            star.classList.add("fa-solid");
            star.style.color = "var(--warning)";
        } else {
            star.classList.remove("fa-solid");
            star.classList.add("fa-regular");
            star.style.color = "var(--text-muted)";
        }
    });
}

async function loadStudentReviewsInStaff() {
    const roll = document.getElementById("reviews-student-select")?.value;
    const nameDisplay = document.getElementById("reviews-student-name-display");
    const container = document.getElementById("reviews-list-container");
    const summaryBlock = document.getElementById("reviews-summary-block");
    if (!container) return;

    if (!roll) {
        container.innerHTML = `<p style="color: var(--text-muted);">Select a student from the dropdown above to inspect reviews.</p>`;
        return;
    }

    const student = AppStore.students.find(s => s.rollNumber === roll);
    if (nameDisplay && student) {
        nameDisplay.innerText = `${student.name} (${student.rollNumber})`;
    }

    setReviewRating(5);

    try {
        const reviews = await apiRequest(`/students/${encodeURIComponent(roll)}/reviews`);
        renderReviewsList(container, summaryBlock, reviews);
    } catch (e) {
        container.innerHTML = `<p style="color: var(--danger);">Failed to load reviews from database: ${escapeHtml(e.message)}</p>`;
    }
}

function renderReviewsList(container, summaryBlock, reviews) {
    if (!reviews || reviews.length === 0) {
        if (summaryBlock) summaryBlock.style.display = "none";
        container.innerHTML = `<p style="color: var(--text-muted); font-style: italic; padding: 1rem 0;">No reviews published for this student yet.</p>`;
        return;
    }

    const avg = (reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / reviews.length).toFixed(1);
    if (summaryBlock) {
        summaryBlock.style.display = "flex";
        document.getElementById("reviews-average-rating-num").innerText = avg;
        document.getElementById("reviews-average-stars").innerHTML = getStarsHTML(Math.round(avg));
        document.getElementById("reviews-total-count").innerText = `(${reviews.length} review${reviews.length === 1 ? '' : 's'})`;
    }

    container.innerHTML = reviews.map(rev => `
        <div style="background: var(--bg-main); border: 1px solid var(--border-card); border-radius: 8px; padding: 1rem; margin-bottom: 0.8rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <span style="font-weight: 700; color: var(--primary);"><i class="fas fa-user-shield"></i> ${escapeHtml(rev.reviewer || 'Administrator')}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(rev.createdAt || '')}</span>
            </div>
            <div style="display: flex; gap: 0.6rem; align-items: center; margin-bottom: 0.5rem;">
                <span class="badge badge-success" style="font-size: 0.75rem;">${escapeHtml(rev.category || 'Academic')}</span>
                <span style="font-size: 0.85rem;">${getStarsHTML(rev.rating || 5)}</span>
            </div>
            <p style="font-size: 0.9rem; color: var(--text-main); margin: 0; line-height: 1.4;">${escapeHtml(rev.comment)}</p>
        </div>
    `).join('');
}

function getStarsHTML(rating) {
    let stars = "";
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += `<i class="fa-solid fa-star" style="color: var(--warning);"></i>`;
        } else {
            stars += `<i class="fa-regular fa-star" style="color: var(--text-muted);"></i>`;
        }
    }
    return stars;
}

async function handleReviewFormSubmit(event) {
    event.preventDefault();
    const roll = document.getElementById("reviews-student-select")?.value;
    if (!roll) {
        alert("Please select a student first.");
        return;
    }

    const reviewer = document.getElementById("review-input-reviewer").value.trim();
    const category = document.getElementById("review-input-category").value;
    const comment = document.getElementById("review-input-comment").value.trim();

    try {
        await apiRequest(`/students/${encodeURIComponent(roll)}/reviews`, {
            method: 'POST',
            body: JSON.stringify({
                reviewer: reviewer,
                category: category,
                rating: selectedReviewRating,
                comment: comment
            })
        });

        document.getElementById("review-input-comment").value = "";
        await refreshStudentsFromAPI();
        loadStudentReviewsInStaff();
        alert("Review published successfully to MongoDB Atlas!");
    } catch (e) {
        alert("Error publishing review: " + e.message);
    }
}

// ------------------ 9. Student Dashboard Portal System ------------------
let activeStudentTab = "overview";

function switchStudentTab(tabName) {
    activeStudentTab = tabName;

    document.querySelectorAll('.sidebar-menu button').forEach(btn => {
        btn.classList.remove('active');
    });
    const btn = document.getElementById(`tab-stud-${tabName}`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.dashboard-section').forEach(sec => {
        sec.classList.remove('active');
    });
    const sec = document.getElementById(`sec-stud-${tabName}`);
    if (sec) sec.classList.add('active');

    loadStudentPortal();
}

async function loadStudentPortal() {
    const roll = Session.currentStudentRoll;
    if (!roll) return;

    let student = AppStore.students.find(s => s.rollNumber === roll);
    if (!student) {
        try {
            student = await apiRequest(`/students/${encodeURIComponent(roll)}`);
        } catch (e) {
            console.error("Could not fetch student portal data:", e);
            return;
        }
    }

    // Header & Welcome
    const welcomeElem = document.getElementById("stud-welcome-name");
    if (welcomeElem) welcomeElem.innerText = student.name;

    // Key Stats
    // 1. Attendance Percentage
    let presentCount = 0;
    let totalRecordedDays = 0;
    Object.values(student.attendance || {}).forEach(status => {
        totalRecordedDays++;
        if (status === 'P') presentCount++;
    });
    const attRate = totalRecordedDays > 0 ? Math.round((presentCount / totalRecordedDays) * 100) : 0;
    const attCard = document.getElementById("stud-card-attendance");
    if (attCard) attCard.innerText = `${attRate}%`;

    // 2. Average Marks
    const metrics = getStudentAveragesAndTrend(student);
    const avgCard = document.getElementById("stud-card-average");
    if (avgCard) avgCard.innerText = `${metrics.average}%`;

    // 3. Class Rank
    const rankDetails = getStudentRankInClass(roll, student.standard);
    const rankCard = document.getElementById("stud-card-rank");
    if (rankCard) rankCard.innerText = `${rankDetails.rank} / ${rankDetails.total}`;

    // Tab-Specific Renderers
    if (activeStudentTab === 'overview') {
        const pbContainer = document.getElementById("student-subject-progress-bars");
        const monthly = student.marks?.monthly || { english: 0, math: 0, science: 0, history: 0 };

        const subjects = [
            { name: "English Language", val: monthly.english || 0 },
            { name: "Mathematics", val: monthly.math || 0 },
            { name: "General Science", val: monthly.science || 0 },
            { name: "Social History", val: monthly.history || 0 }
        ];

        if (pbContainer) {
            pbContainer.innerHTML = subjects.map(sub => {
                const gradeClass = sub.val >= 75 ? 'high' : sub.val >= 50 ? 'medium' : 'low';
                return `
                    <div class="progress-bar-container">
                        <div class="progress-bar-label">
                            <span>${escapeHtml(sub.name)}</span>
                            <span>${sub.val}/100</span>
                        </div>
                        <div class="progress-bar-outer">
                            <div class="progress-bar-inner ${gradeClass}" style="width: ${sub.val}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        const commentArea = document.getElementById("student-comments-area");
        if (commentArea) {
            commentArea.innerText = `"${student.performanceComment || 'No remarks recorded.'}"`;
        }

    } else if (activeStudentTab === 'attendance') {
        const tbody = document.getElementById("student-attendance-log-table")?.querySelector("tbody");
        if (tbody) {
            tbody.innerHTML = "";
            const dates = Object.keys(student.attendance || {}).sort((a, b) => new Date(b) - new Date(a));

            if (dates.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 1.5rem;">No attendance check logs recorded in database.</td></tr>`;
            } else {
                dates.forEach(dStr => {
                    const status = student.attendance[dStr];
                    const isP = status === 'P';
                    const day = new Date(dStr).toLocaleDateString('en-US', { weekday: 'long' });
                    tbody.innerHTML += `
                        <tr>
                            <td><code>${escapeHtml(dStr)}</code></td>
                            <td>${escapeHtml(day)}</td>
                            <td>
                                <span class="badge ${isP ? 'badge-success' : 'badge-danger'}">
                                    ${isP ? '<i class="fas fa-circle-check"></i> Present' : '<i class="fas fa-circle-xmark"></i> Absent'}
                                </span>
                            </td>
                        </tr>
                    `;
                });
            }
        }

    } else if (activeStudentTab === 'marks') {
        const wBody = document.getElementById("student-weekly-marks-table")?.querySelector("tbody");
        if (wBody) {
            wBody.innerHTML = "";
            renderStudMarksRow(wBody, student.marks?.weekly || { english: 0, math: 0, science: 0, history: 0 });
        }

        const mBody = document.getElementById("student-monthly-marks-table")?.querySelector("tbody");
        if (mBody) {
            mBody.innerHTML = "";
            renderStudMarksRow(mBody, student.marks?.monthly || { english: 0, math: 0, science: 0, history: 0 });
        }

    } else if (activeStudentTab === 'timetable') {
        const tbody = document.getElementById("student-timetable-grid")?.querySelector("tbody");
        if (tbody) {
            tbody.innerHTML = "";
            const rows = getTimetableForStandard(student.standard);
            rows.forEach(r => {
                const isB = r.mon === 'Break';
                if (isB) {
                    tbody.innerHTML += `
                        <tr>
                            <td><code>${escapeHtml(r.period)}</code></td>
                            <td colspan="5" style="text-align: center; font-weight: 700; background: var(--bg-main); letter-spacing: 5px;">BREAK</td>
                        </tr>
                    `;
                } else {
                    tbody.innerHTML += `
                        <tr>
                            <td><code>${escapeHtml(r.period)}</code></td>
                            <td><strong>${escapeHtml(r.mon || '-')}</strong></td>
                            <td><strong>${escapeHtml(r.tue || '-')}</strong></td>
                            <td><strong>${escapeHtml(r.wed || '-')}</strong></td>
                            <td><strong>${escapeHtml(r.thu || '-')}</strong></td>
                            <td><strong>${escapeHtml(r.fri || '-')}</strong></td>
                        </tr>
                    `;
                }
            });
        }

    } else if (activeStudentTab === 'fees') {
        // Student views their own fees status
        const feesCont = document.getElementById('stud-fees-content');
        if (feesCont) {
            const fStatus  = student.feesStatus  || 'Paid';
            const fTotal   = student.feesAmount   || 0;
            const fPaid    = student.feesPaid     || 0;
            const fBalance = Math.max(0, fTotal - fPaid);
            const badgeCls = fStatus === 'Paid' ? 'badge-success' : fStatus === 'Partially Paid' ? 'badge-warning' : 'badge-danger';

            feesCont.innerHTML = `
                <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg); max-width: 600px;">
                    <h4 style="font-weight:800; font-size:1.1rem; color:var(--primary); margin-bottom:1.5rem;">
                        <i class="fas fa-receipt"></i> Fee Details for ${escapeHtml(student.name)}
                    </h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:1.5rem;">
                        <div>
                            <label style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:0.3rem;">Total Fee</label>
                            <span style="font-size:1.4rem;font-weight:800;color:var(--text-main);">&#8377;${fTotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:0.3rem;">Amount Paid</label>
                            <span style="font-size:1.4rem;font-weight:800;color:var(--success);">&#8377;${fPaid.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:0.3rem;">Balance Due</label>
                            <span style="font-size:1.4rem;font-weight:800;color:${fBalance > 0 ? 'var(--danger)' : 'var(--success)'};">&#8377;${fBalance.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:0.3rem;">Status</label>
                            <span class="badge ${badgeCls}" style="font-size:1rem;padding:0.4rem 0.8rem;">${escapeHtml(fStatus)}</span>
                        </div>
                    </div>
                    ${fBalance > 0 ? `<div style="background:rgba(var(--danger-rgb,220,53,69),0.08);border-left:4px solid var(--danger);padding:1rem;border-radius:6px;"><i class="fas fa-triangle-exclamation" style="color:var(--danger);"></i> <strong>Outstanding balance of &#8377;${fBalance.toLocaleString('en-IN')} is due.</strong> Please contact the school office to clear your fees.</div>` : `<div style="background:rgba(var(--success-rgb,40,167,69),0.08);border-left:4px solid var(--success);padding:1rem;border-radius:6px;"><i class="fas fa-circle-check" style="color:var(--success);"></i> <strong>All fees are fully paid.</strong> Your account is up to date.</div>`}
                </div>
            `;
        }

    } else if (activeStudentTab === 'exams') {
        // Student views exams for their standard
        const tbody = document.getElementById('stud-exams-table')?.querySelector('tbody');
        if (tbody) {
            tbody.innerHTML = '';
            try {
                const exams = await apiRequest(`/exams?standard=${encodeURIComponent(student.standard)}`);
                if (!exams || exams.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No exam schedules have been published for your class yet.</td></tr>`;
                } else {
                    exams.sort((a, b) => new Date(a.examDate) - new Date(b.examDate)).forEach(ex => {
                        const isUpcoming = new Date(ex.examDate) >= new Date(new Date().toDateString());
                        tbody.innerHTML += `
                            <tr>
                                <td><strong>${escapeHtml(ex.testName)}</strong></td>
                                <td>${escapeHtml(ex.subject)}</td>
                                <td><code style="color:${isUpcoming ? 'var(--primary)' : 'var(--text-muted)'}">${escapeHtml(ex.examDate)}</code>${isUpcoming ? ' <span class="badge badge-success" style="font-size:0.7rem;">Upcoming</span>' : ''}</td>
                                <td>${escapeHtml(ex.startTime || '09:30 AM')}</td>
                                <td>${ex.durationMinutes || 90} min</td>
                                <td>${ex.maxMarks || 100}</td>
                            </tr>
                        `;
                    });
                }
            } catch (e) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:1rem;">Could not load exam schedule.</td></tr>`;
            }
        }

    } else if (activeStudentTab === 'profile') {
        document.getElementById("stud-profile-full-name").innerText = student.name;
        document.getElementById("stud-profile-subtitle").innerText = `Roll Number: ${student.rollNumber} • Class: ${student.standard}`;
        document.getElementById("stud-profile-standard").innerText = student.standard;
        document.getElementById("stud-profile-section").innerText = `Section ${student.section || 'A'}`;
        document.getElementById("stud-profile-group").innerText = student.group || 'General';
        document.getElementById("stud-profile-email").innerText = `${student.name.toLowerCase().replace(/\s+/g, '')}@schoolhub.edu`;
        document.getElementById("stud-profile-avatar-letters").innerText = student.name.charAt(0).toUpperCase();

        const feeBadge = document.getElementById("stud-profile-fees");
        if (feeBadge) {
            const fStatus = student.feesStatus || "Paid";
            feeBadge.innerText = fStatus;
            feeBadge.className = "badge " + (fStatus === "Paid" ? "badge-success" : fStatus === "Partially Paid" ? "badge-warning" : "badge-danger");
        }

    } else if (activeStudentTab === 'reviews') {
        const container = document.getElementById("stud-reviews-list-container");
        if (!container) return;

        try {
            const reviews = await apiRequest(`/students/${encodeURIComponent(roll)}/reviews`);
            const avg = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / reviews.length).toFixed(1) : "0.0";

            document.getElementById("stud-reviews-avg-rating-val").innerText = avg;
            document.getElementById("stud-reviews-avg-stars-container").innerHTML = getStarsHTML(Math.round(parseFloat(avg)));
            document.getElementById("stud-reviews-count-text").innerText = `Based on ${reviews.length} faculty evaluations`;

            if (reviews.length === 0) {
                container.innerHTML = `<p style="color: var(--text-muted); font-style: italic; padding: 1.5rem 0;">No reviews published for your profile yet.</p>`;
            } else {
                container.innerHTML = reviews.map(r => `
                    <div class="glass" style="padding: 1.5rem; margin-bottom: 1rem; border-left: 4px solid var(--primary);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <span style="font-weight: 700; color: var(--primary);"><i class="fas fa-chalkboard-user"></i> ${escapeHtml(r.reviewer || 'Administrator')}</span>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(r.createdAt || '')}</span>
                        </div>
                        <div style="display: flex; gap: 0.8rem; align-items: center; margin-bottom: 0.6rem;">
                            <span class="badge badge-success">${escapeHtml(r.category || 'Academic')}</span>
                            <span>${getStarsHTML(r.rating || 5)}</span>
                        </div>
                        <p style="font-size: 0.95rem; color: var(--text-main); margin: 0; line-height: 1.5;">"${escapeHtml(r.comment)}"</p>
                    </div>
                `).join('');
            }
        } catch (e) {
            container.innerHTML = `<p style="color: var(--danger);">Could not load reviews.</p>`;
        }
    }
}

function renderStudMarksRow(tbody, marksObj) {
    const subs = [
        { name: "English Language", val: marksObj.english || 0 },
        { name: "Mathematics", val: marksObj.math || 0 },
        { name: "General Science", val: marksObj.science || 0 },
        { name: "Social History", val: marksObj.history || 0 }
    ];

    let sum = 0;
    subs.forEach(s => {
        sum += s.val;
        const statusClass = s.val >= 75 ? 'badge-success' : s.val >= 50 ? 'badge-warning' : 'badge-danger';
        const grade = s.val >= 90 ? 'A+' : s.val >= 75 ? 'A' : s.val >= 50 ? 'B' : 'Needs tutoring';

        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${s.val}</td>
                <td>100</td>
                <td><span class="badge ${statusClass}">${grade}</span></td>
            </tr>
        `;
    });

    tbody.innerHTML += `
        <tr style="background: var(--bg-main); border-top: 2px solid var(--border-card);">
            <td><strong>TOTAL (Aggregate)</strong></td>
            <td><strong>${sum}</strong></td>
            <td><strong>400</strong></td>
            <td><span style="font-weight: 800; color: var(--primary);">${Math.round((sum / 400) * 100)}%</span></td>
        </tr>
    `;
}

// ------------------ Utility: XSS Escaper ------------------
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
