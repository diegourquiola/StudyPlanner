/**
 * StudySync - Frontend JavaScript
 * Handles all API communication, user interactions, and dynamic rendering
 */

// ============================================
// Global State
// ============================================
let courses = [];
const courseColors = ['#4361ee', '#06ffa5', '#f72585', '#7209b7', '#fb5607', '#38b000'];
let lastScheduleData = null;
let calendarMonth = new Date().getMonth();
let calendarYear  = new Date().getFullYear();
let expandedCalendarCell = null;

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initCalendar();
    initBanner();
    
    // Set minimum date for exam date picker to today
    const examDateInput = document.getElementById('exam-date');
    if (examDateInput) {
        const today = new Date().toISOString().split('T')[0];
        examDateInput.setAttribute('min', today);
    }
    
    // Update slider value displays in real-time
    const difficultySlider = document.getElementById('difficulty');
    const confidenceSlider = document.getElementById('confidence');
    
    if (difficultySlider) {
        difficultySlider.addEventListener('input', function() {
            document.getElementById('difficulty-value').textContent = this.value;
        });
    }
    
    if (confidenceSlider) {
        confidenceSlider.addEventListener('input', function() {
            document.getElementById('confidence-value').textContent = this.value;
        });
    }
    
    // Event Listeners
    const courseForm = document.getElementById('course-form');
    if (courseForm) {
        courseForm.addEventListener('submit', handleAddCourse);
    }
    
    const loadDemoBtn = document.getElementById('load-demo-btn');
    if (loadDemoBtn) {
        loadDemoBtn.addEventListener('click', handleLoadDemo);
    }
    
    const generateBtn = document.getElementById('generate-schedule-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerateSchedule);
    }
    
    // Load existing courses on page load
    loadCourses();
});

// ============================================
// Tab Switching
// ============================================

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Restore tab from hash on load
    const hash = window.location.hash.slice(1);
    const validTabs = ['courses', 'calendar', 'schedule'];
    switchTab(validTabs.includes(hash) ? hash : 'courses', false);

    window.addEventListener('hashchange', () => {
        const tab = window.location.hash.slice(1);
        if (['courses', 'calendar', 'schedule'].includes(tab)) {
            switchTab(tab, false);
        }
    });
}

function switchTab(tabName, updateHash = true) {
    document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const panel = document.getElementById(`tab-${tabName}`);
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (panel) panel.hidden = false;
    if (btn) btn.classList.add('active');

    if (updateHash) window.location.hash = tabName;
    if (tabName === 'calendar') renderCalendar();
}

// ============================================
// Outdated Schedule Banner
// ============================================

function showOutdatedBanner() {
    document.getElementById('outdated-banner').style.display = 'flex';
}

function initBanner() {
    document.getElementById('banner-dismiss-btn').addEventListener('click', () => {
        document.getElementById('outdated-banner').style.display = 'none';
    });
    document.getElementById('banner-regenerate-btn').addEventListener('click', () => {
        document.getElementById('outdated-banner').style.display = 'none';
        switchTab('schedule');
        handleGenerateSchedule();
    });
}

// ============================================
// API Functions
// ============================================

async function loadCourses() {
    try {
        const response = await fetch('/api/courses');
        if (!response.ok) throw new Error('Failed to load courses');
        courses = await response.json();

        // Fetch assignments for each course and attach to course object
        await Promise.all(courses.map(async course => {
            const resp = await fetch(`/api/courses/${course.id}/assignments`);
            course.assignments = resp.ok ? await resp.json() : [];
        }));

        renderCourses();

        // Re-render calendar if it's visible
        const calPanel = document.getElementById('tab-calendar');
        if (calPanel && !calPanel.hidden) renderCalendar();

    } catch (error) {
        console.error('Error loading courses:', error);
        showNotification('Failed to load courses', 'error');
    }
}

async function handleAddCourse(event) {
    event.preventDefault();
    
    const courseName = document.getElementById('course-name').value.trim();
    const examDate = document.getElementById('exam-date').value;
    const difficulty = parseInt(document.getElementById('difficulty').value);
    const confidence = parseInt(document.getElementById('confidence').value);
    
    if (!courseName || !examDate) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(examDate);
    
    if (selectedDate < today) {
        showNotification('Exam date must be in the future', 'error');
        return;
    }
    
    const courseData = {
        name: courseName,
        exam_date: examDate,
        difficulty: difficulty,
        confidence: confidence
    };
    
    try {
        const response = await fetch('/api/add-course', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(courseData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to add course');
        }
        
        document.getElementById('course-form').reset();
        document.getElementById('difficulty-value').textContent = '3';
        document.getElementById('confidence-value').textContent = '3';
        
        await loadCourses();
        
        showNotification('Course added successfully!', 'success');
    } catch (error) {
        console.error('Error adding course:', error);
        showNotification('Failed to add course', 'error');
    }
}

async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/courses/${courseId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete course');
        }
        
        await loadCourses();
        showNotification('Course deleted successfully!', 'success');
        
        const scheduleSection = document.getElementById('schedule-section');
        if (scheduleSection && courses.length === 0) {
            scheduleSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error deleting course:', error);
        showNotification('Failed to delete course', 'error');
    }
}

async function handleLoadDemo() {
    try {
        const response = await fetch('/api/load-demo', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load demo data');
        }
        
        await loadCourses();
        showNotification('Demo data loaded successfully!', 'success');
    } catch (error) {
        console.error('Error loading demo data:', error);
        showNotification('Failed to load demo data', 'error');
    }
}

async function handleGenerateSchedule() {
    if (courses.length === 0) {
        showNotification('Please add at least one course first', 'error');
        return;
    }
    
    const availableHours = parseFloat(document.getElementById('available-hours').value);
    
    if (availableHours < 1 || availableHours > 12) {
        showNotification('Available hours must be between 1 and 12', 'error');
        return;
    }
    
    const generateBtn = document.getElementById('generate-schedule-btn');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    generateBtn.disabled = true;
    loadingSpinner.style.display = 'flex';
    
    try {
        const response = await fetch('/api/generate-schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                available_hours: availableHours
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate schedule');
        }
        
        const scheduleData = await response.json();
        
        if (scheduleData.error) {
            throw new Error(scheduleData.error);
        }
        
        renderSchedule(scheduleData);
        lastScheduleData = scheduleData;
        showNotification('Schedule generated successfully!', 'success');
        
        document.getElementById('schedule-section').scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    } catch (error) {
        console.error('Error generating schedule:', error);
        showNotification(error.message || 'Failed to generate schedule', 'error');
    } finally {
        generateBtn.disabled = false;
        loadingSpinner.style.display = 'none';
    }
}

// ============================================
// Assignment CRUD
// ============================================

async function handleAddAssignment(event, courseId) {
    event.preventDefault();
    const form = event.target;
    const [titleInput, dateInput, typeSelect] = form.querySelectorAll('input, select');

    try {
        const resp = await fetch(`/api/courses/${courseId}/assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: titleInput.value.trim(),
                due_date: dateInput.value,
                type: typeSelect.value
            })
        });
        if (!resp.ok) {
            const err = await resp.json();
            showNotification(err.error || 'Failed to add assignment', 'error');
            return;
        }
        form.reset();
        await loadCourses();
        showNotification('Assignment added!', 'success');
    } catch {
        showNotification('Failed to add assignment', 'error');
    }
}

async function deleteAssignment(assignmentId, courseId) {
    if (!confirm('Delete this assignment?')) return;
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
        if (!resp.ok) { showNotification('Failed to delete assignment', 'error'); return; }
        await loadCourses();
        showNotification('Assignment deleted', 'success');
    } catch {
        showNotification('Failed to delete assignment', 'error');
    }
}

async function toggleAssignment(assignmentId, completed, courseId) {
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}/complete`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: completed ? 1 : 0 })
        });
        if (!resp.ok) { showNotification('Failed to update assignment', 'error'); return; }

        const course = courses.find(c => c.id === courseId);
        if (course && course.assignments) {
            const a = course.assignments.find(a => a.id === assignmentId);
            if (a) a.completed = completed ? 1 : 0;
        }

        const item = document.getElementById(`assignment-item-${assignmentId}`);
        if (item) item.classList.toggle('completed', completed);

        if (lastScheduleData) showOutdatedBanner();

    } catch {
        showNotification('Failed to update assignment', 'error');
    }
}

async function toggleAssignmentFromCalendar(assignmentId, completed, courseId) {
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}/complete`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: completed ? 1 : 0 })
        });
        if (!resp.ok) { 
            showNotification('Failed to update assignment', 'error'); 
            return; 
        }

        const course = courses.find(c => c.id === courseId);
        if (course && course.assignments) {
            const a = course.assignments.find(a => a.id === assignmentId);
            if (a) a.completed = completed ? 1 : 0;
        }

        renderCalendar();
        
        const item = document.getElementById(`assignment-item-${assignmentId}`);
        if (item) item.classList.toggle('completed', completed);

        if (lastScheduleData) showOutdatedBanner();

        showNotification(completed ? 'Assignment marked as done!' : 'Assignment unmarked', 'success');

    } catch {
        showNotification('Failed to update assignment', 'error');
    }
}

async function toggleAssignmentFromSchedule(assignmentId, completed, courseId) {
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}/complete`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: completed ? 1 : 0 })
        });
        if (!resp.ok) { 
            showNotification('Failed to update assignment', 'error'); 
            return; 
        }

        const course = courses.find(c => c.id === courseId);
        if (course && course.assignments) {
            const a = course.assignments.find(a => a.id === assignmentId);
            if (a) a.completed = completed ? 1 : 0;
        }

        if (lastScheduleData) {
            renderScheduleTimeline(lastScheduleData.schedule, document.getElementById('schedule-timeline'));
        }
        
        const item = document.getElementById(`assignment-item-${assignmentId}`);
        if (item) item.classList.toggle('completed', completed);

        const calPanel = document.getElementById('tab-calendar');
        if (calPanel && !calPanel.hidden) renderCalendar();

        showNotification(completed ? 'Assignment marked as done!' : 'Assignment unmarked', 'success');

    } catch {
        showNotification('Failed to update assignment', 'error');
    }
}

// ============================================
// Calendar
// ============================================

function initCalendar() {
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        calendarMonth--;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
        renderCalendar();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        calendarMonth++;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
        renderCalendar();
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('calendar-month-label');
    if (!grid || !label) return;

    Array.from(grid.children).forEach(child => {
        if (!child.classList.contains('calendar-day-header')) child.remove();
    });

    expandedCalendarCell = null;

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    label.textContent = new Date(calendarYear, calendarMonth, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-cell empty';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = 'calendar-cell' + (dateStr === todayStr ? ' today' : '');

        const dayNum = document.createElement('span');
        dayNum.className = 'calendar-day-num';
        dayNum.textContent = day;
        cell.appendChild(dayNum);

        const chips = collectChipsForDate(dateStr);
        renderCellChips(cell, chips);

        grid.appendChild(cell);
    }
}

function collectChipsForDate(dateStr) {
    const chips = [];

    courses.forEach(course => {
        const color = getCourseColor(course);
        
        (course.assignments || []).forEach(a => {
            if (a.due_date === dateStr) {
                chips.push({
                    type: 'assignment',
                    text: `[${a.type}] ${course.name}`,
                    color: color,
                    completed: a.completed,
                    assignmentId: a.id,
                    courseId: course.id
                });
            }
        });
    });

    if (lastScheduleData && lastScheduleData.schedule) {
        const dayData = lastScheduleData.schedule.find(d => d.date === dateStr);
        if (dayData) {
            dayData.blocks.forEach(b => {
                chips.push({
                    type: 'schedule',
                    text: `${b.course} ${b.hours}h`,
                    color: b.color
                });
            });
        }
    }

    return chips;
}

function renderCellChips(cell, chips) {
    const maxVisible = 3;
    const visible = chips.slice(0, maxVisible);
    const hidden = chips.slice(maxVisible);

    visible.forEach(chip => {
        const el = document.createElement('div');
        el.className = 'chip' + (chip.completed ? ' completed' : '');
        if (chip.type === 'assignment') {
            el.className += ' chip-clickable';
            el.dataset.assignmentId = chip.assignmentId;
            el.dataset.courseId = chip.courseId;
            el.style.cursor = 'pointer';
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleAssignmentFromCalendar(chip.assignmentId, !chip.completed, chip.courseId);
            });
        }
        el.style.background = chip.color;
        el.textContent = chip.text;
        cell.appendChild(el);
    });

    if (hidden.length > 0) {
        const btn = document.createElement('button');
        btn.className = 'more-chips-btn';
        btn.textContent = `+${hidden.length} more`;
        btn.addEventListener('click', () => toggleCellExpand(cell, hidden));
        cell.appendChild(btn);
    }
}

function toggleCellExpand(cell, hiddenChips) {
    if (expandedCalendarCell === cell) {
        Array.from(cell.children).forEach(c => {
            if (c.classList.contains('chip') && hiddenChips.some(h => h.text === c.textContent)) {
                cell.removeChild(c);
            }
        });
        const btn = cell.querySelector('.more-chips-btn');
        if (btn) btn.textContent = `+${hiddenChips.length} more`;
        expandedCalendarCell = null;
    } else {
        if (expandedCalendarCell) toggleCellExpand(expandedCalendarCell, []);
        
        const btn = cell.querySelector('.more-chips-btn');
        if (btn) btn.parentElement.removeChild(btn);
        
        hiddenChips.forEach(chip => {
            const el = document.createElement('div');
            el.className = 'chip' + (chip.completed ? ' completed' : '');
            if (chip.type === 'assignment') {
                el.className += ' chip-clickable';
                el.dataset.assignmentId = chip.assignmentId;
                el.dataset.courseId = chip.courseId;
                el.style.cursor = 'pointer';
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleAssignmentFromCalendar(chip.assignmentId, !chip.completed, chip.courseId);
                });
            }
            el.style.background = chip.color;
            el.textContent = chip.text;
            cell.appendChild(el);
        });
        
        expandedCalendarCell = cell;
    }
}

// ============================================
// Rendering Functions
// ============================================

function renderCourses() {
    const coursesList = document.getElementById('courses-list');
    const courseCount = document.getElementById('course-count');
    
    courseCount.textContent = courses.length;
    
    coursesList.innerHTML = '';
    
    if (courses.length === 0) {
        coursesList.innerHTML = `
            <div class="empty-state">
                <p>No courses added yet. Add your first course to get started!</p>
            </div>
        `;
        return;
    }
    
    courses.forEach((course, index) => {
        const courseCard = createCourseCard(course, index);
        coursesList.appendChild(courseCard);
    });
}

function createCourseCard(course, index) {
    const card = document.createElement('div');
    card.className = 'course-card';
    
    const color = getCourseColor(course);
    
    const examDate = new Date(course.exam_date);
    const formattedDate = examDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
    
    card.innerHTML = `
        <div class="course-color-bar" style="background: ${color};"></div>
        <div class="course-card-header">
            <h3 class="course-name">${escapeHtml(course.name)}</h3>
            <div style="display:flex;gap:0.5rem;align-items:center;">
                <button class="expand-toggle" data-course-id="${course.id}">
                    Assignments (${course.assignments ? course.assignments.length : 0})
                </button>
                <button class="delete-btn" onclick="deleteCourse(${course.id})" aria-label="Delete course">×</button>
            </div>
        </div>
        <div class="course-details">
            <div class="course-detail-row">
                <span class="course-detail-label">Exam Date:</span>
                <span class="course-detail-value">${formattedDate}</span>
            </div>
            <div class="course-detail-row">
                <span class="course-detail-label">Days Until:</span>
                <span class="course-detail-value">${daysUntil} days</span>
            </div>
            <div class="course-detail-row">
                <span class="course-detail-label">Difficulty:</span>
                <div class="difficulty-indicator">${createIndicatorDots(course.difficulty)}</div>
            </div>
            <div class="course-detail-row">
                <span class="course-detail-label">Confidence:</span>
                <div class="confidence-indicator">${createIndicatorDots(course.confidence)}</div>
            </div>
        </div>
        <div class="assignments-panel" id="assignments-panel-${course.id}" style="display:none;">
            ${renderAssignmentList(course.assignments || [], course.id)}
        </div>
    `;

    card.querySelector('.expand-toggle').addEventListener('click', function() {
        const panel = document.getElementById(`assignments-panel-${course.id}`);
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        this.textContent = `Assignments (${course.assignments ? course.assignments.length : 0})${isHidden ? ' ▲' : ''}`;
    });
    
    return card;
}

function renderAssignmentList(assignments, courseId) {
    const listItems = assignments.map(a => `
        <li class="assignment-item ${a.completed ? 'completed' : ''}" id="assignment-item-${a.id}">
            <input type="checkbox" ${a.completed ? 'checked' : ''}
                onchange="toggleAssignment(${a.id}, this.checked, ${courseId})">
            <span class="type-badge ${a.type}">${a.type}</span>
            <span class="assignment-title">${escapeHtml(a.title)}</span>
            <span class="assignment-due">${formatDate(a.due_date)}</span>
            <button class="delete-assignment-btn" onclick="deleteAssignment(${a.id}, ${courseId})" aria-label="Delete assignment">×</button>
        </li>
    `).join('');

    return `
        <ul class="assignment-list">${listItems.length ? listItems : '<li style="color:var(--text-light);font-size:0.85rem;padding:0.4rem 0;">No assignments yet.</li>'}</ul>
        <form class="add-assignment-form" onsubmit="handleAddAssignment(event, ${courseId})">
            <input type="text" placeholder="Assignment title" required>
            <input type="date" required>
            <select required>
                <option value="">Type</option>
                <option value="quiz">Quiz</option>
                <option value="homework">Homework</option>
                <option value="project">Project</option>
            </select>
            <button type="submit" class="btn btn-primary btn-sm">Add</button>
        </form>
    `;
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function createIndicatorDots(value) {
    let dots = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= value ? 'filled' : '';
        dots += `<span class="indicator-dot ${filled}"></span>`;
    }
    return dots;
}

function renderSchedule(scheduleData) {
    const scheduleSection = document.getElementById('schedule-section');
    const scheduleSummary = document.getElementById('schedule-summary');
    const scheduleTimeline = document.getElementById('schedule-timeline');
    
    scheduleSection.style.display = 'block';
    
    renderScheduleSummary(scheduleData.summary, scheduleSummary);
    renderScheduleTimeline(scheduleData.schedule, scheduleTimeline);
}

function renderScheduleSummary(summary, container) {
    let subjectHoursHtml = '';
    
    const courseColorMap = {};
    courses.forEach(course => {
        courseColorMap[course.name] = getCourseColor(course);
    });
    
    for (const [subject, hours] of Object.entries(summary.hours_per_subject)) {
        const color = courseColorMap[subject] || courseColors[0];
        subjectHoursHtml += `
            <div class="subject-hours-item">
                <div class="subject-name-with-color">
                    <span class="subject-color-dot" style="background: ${color};"></span>
                    <span>${escapeHtml(subject)}</span>
                </div>
                <strong>${hours}h</strong>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="summary-grid">
            <div class="summary-item">
                <h3>Total Study Hours</h3>
                <p>${summary.total_hours}h</p>
            </div>
            <div class="summary-item">
                <h3>Number of Courses</h3>
                <p>${Object.keys(summary.hours_per_subject).length}</p>
            </div>
            <div class="summary-item">
                <h3>Study Days</h3>
                <p>${Math.max(...Object.values(summary.days_until_exams))}</p>
            </div>
        </div>
        <div class="summary-breakdown">
            <h3>Hours per Subject</h3>
            <div class="subject-hours-list">
                ${subjectHoursHtml}
            </div>
        </div>
    `;
}

function renderScheduleTimeline(schedule, container) {
    container.innerHTML = '';
    
    schedule.forEach(day => {
        const dayCard = createDayCard(day);
        container.appendChild(dayCard);
    });
}

function createDayCard(day) {
    const card = document.createElement('div');
    card.className = 'day-card';
    
    const date = new Date(day.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
    });
    
    let blocksHtml = '';
    day.blocks.forEach(block => {
        blocksHtml += `
            <div class="block-item" style="background: linear-gradient(135deg, ${block.color} 0%, ${adjustColorBrightness(block.color, 20)} 100%);">
                <span class="block-course-name">${escapeHtml(block.course)}</span>
                <span class="block-hours">${block.hours}h</span>
            </div>
        `;
    });
    
    // Find assignments for this date
    const assignmentsForDay = [];
    courses.forEach(course => {
        const color = getCourseColor(course);
        (course.assignments || []).forEach(a => {
            if (a.due_date === day.date) {
                assignmentsForDay.push({
                    id: a.id,
                    title: a.title,
                    type: a.type,
                    completed: a.completed,
                    courseName: course.name,
                    courseId: course.id,
                    color: color
                });
            }
        });
    });
    
    let assignmentsHtml = '';
    if (assignmentsForDay.length > 0) {
        assignmentsHtml = '<div class="schedule-assignments">';
        assignmentsForDay.forEach(assignment => {
            assignmentsHtml += `
                <div class="schedule-assignment-item ${assignment.completed ? 'completed' : ''}" 
                     style="border-left: 3px solid ${assignment.color};"
                     onclick="toggleAssignmentFromSchedule(${assignment.id}, ${!assignment.completed}, ${assignment.courseId})">
                    <input type="checkbox" ${assignment.completed ? 'checked' : ''} 
                           onclick="event.stopPropagation(); toggleAssignmentFromSchedule(${assignment.id}, this.checked, ${assignment.courseId})">
                    <span class="type-badge ${assignment.type}">${assignment.type}</span>
                    <span class="schedule-assignment-title">${escapeHtml(assignment.title)}</span>
                    <span class="schedule-assignment-course">${escapeHtml(assignment.courseName)}</span>
                </div>
            `;
        });
        assignmentsHtml += '</div>';
    }
    
    card.innerHTML = `
        <div class="day-header">${formattedDate}</div>
        <div class="day-blocks">
            ${blocksHtml}
        </div>
        ${assignmentsHtml}
    `;
    
    return card;
}

// ============================================
// Helper Functions
// ============================================

function getCourseColor(course) {
    return courseColors[course.id % courseColors.length];
}

function adjustColorBrightness(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    return '#' + (
        0x1000000 + 
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '1rem 1.5rem',
        borderRadius: '8px',
        color: '#fff',
        fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: '9999',
        animation: 'slideIn 0.3s ease',
        background: type === 'success' ? '#06ffa5' : '#f72585'
    });
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
