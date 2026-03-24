/**
 * StudySync - Frontend JavaScript
 * Handles all API communication, user interactions, and dynamic rendering
 */

// ============================================
// Global State
// ============================================
let courses = [];
const courseColors = ['#4361ee', '#06ffa5', '#f72585', '#7209b7', '#fb5607', '#38b000'];

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', function() {
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
// API Functions
// ============================================

/**
 * Fetches all courses from the backend API
 * Updates global state and re-renders the course list
 */
async function loadCourses() {
    try {
        const response = await fetch('/api/courses');
        if (!response.ok) {
            throw new Error('Failed to load courses');
        }
        
        courses = await response.json();
        renderCourses();
    } catch (error) {
        console.error('Error loading courses:', error);
        showNotification('Failed to load courses', 'error');
    }
}

/**
 * Adds a new course via API
 * @param {Event} event - Form submit event
 */
async function handleAddCourse(event) {
    event.preventDefault();
    
    // Get form values
    const courseName = document.getElementById('course-name').value.trim();
    const examDate = document.getElementById('exam-date').value;
    const difficulty = parseInt(document.getElementById('difficulty').value);
    const confidence = parseInt(document.getElementById('confidence').value);
    
    // Validate inputs
    if (!courseName || !examDate) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    // Check if exam date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(examDate);
    
    if (selectedDate < today) {
        showNotification('Exam date must be in the future', 'error');
        return;
    }
    
    // Prepare course data
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
        
        // Reset form
        document.getElementById('course-form').reset();
        document.getElementById('difficulty-value').textContent = '3';
        document.getElementById('confidence-value').textContent = '3';
        
        // Reload courses
        await loadCourses();
        
        showNotification('Course added successfully!', 'success');
    } catch (error) {
        console.error('Error adding course:', error);
        showNotification('Failed to add course', 'error');
    }
}

/**
 * Deletes a course via API
 * @param {number} courseId - ID of course to delete
 */
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
        
        // Hide schedule if it was showing
        const scheduleSection = document.getElementById('schedule-section');
        if (scheduleSection && courses.length === 0) {
            scheduleSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error deleting course:', error);
        showNotification('Failed to delete course', 'error');
    }
}

/**
 * Loads demo data via API
 */
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

/**
 * Generates the optimized schedule via API
 */
async function handleGenerateSchedule() {
    // Check if there are courses
    if (courses.length === 0) {
        showNotification('Please add at least one course first', 'error');
        return;
    }
    
    const availableHours = parseFloat(document.getElementById('available-hours').value);
    
    // Validate available hours
    if (availableHours < 1 || availableHours > 12) {
        showNotification('Available hours must be between 1 and 12', 'error');
        return;
    }
    
    // Show loading spinner
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
        
        // Check for errors in response
        if (scheduleData.error) {
            throw new Error(scheduleData.error);
        }
        
        renderSchedule(scheduleData);
        showNotification('Schedule generated successfully!', 'success');
        
        // Scroll to schedule section
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
// Rendering Functions
// ============================================

/**
 * Renders the list of courses
 */
function renderCourses() {
    const coursesList = document.getElementById('courses-list');
    const courseCount = document.getElementById('course-count');
    
    // Update course count
    courseCount.textContent = courses.length;
    
    // Clear existing content
    coursesList.innerHTML = '';
    
    // Show empty state if no courses
    if (courses.length === 0) {
        coursesList.innerHTML = `
            <div class="empty-state">
                <p>No courses added yet. Add your first course to get started!</p>
            </div>
        `;
        return;
    }
    
    // Render each course card
    courses.forEach((course, index) => {
        const courseCard = createCourseCard(course, index);
        coursesList.appendChild(courseCard);
    });
}

/**
 * Creates a course card DOM element
 * @param {Object} course - Course data object
 * @param {number} index - Index for color assignment
 * @returns {HTMLElement} Course card element
 */
function createCourseCard(course, index) {
    const card = document.createElement('div');
    card.className = 'course-card';
    
    const color = assignCourseColor(index);
    
    // Format date for display
    const examDate = new Date(course.exam_date);
    const formattedDate = examDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
    
    // Calculate days until exam
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
    
    card.innerHTML = `
        <div class="course-color-bar" style="background: ${color};"></div>
        <div class="course-card-header">
            <h3 class="course-name">${escapeHtml(course.name)}</h3>
            <button class="delete-btn" onclick="deleteCourse(${course.id})" aria-label="Delete course">
                ×
            </button>
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
                <div class="difficulty-indicator">
                    ${createIndicatorDots(course.difficulty)}
                </div>
            </div>
            <div class="course-detail-row">
                <span class="course-detail-label">Confidence:</span>
                <div class="confidence-indicator">
                    ${createIndicatorDots(course.confidence)}
                </div>
            </div>
        </div>
    `;
    
    return card;
}

/**
 * Creates indicator dots for difficulty/confidence display
 * @param {number} value - Value from 1-5
 * @returns {string} HTML string of dots
 */
function createIndicatorDots(value) {
    let dots = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= value ? 'filled' : '';
        dots += `<span class="indicator-dot ${filled}"></span>`;
    }
    return dots;
}

/**
 * Renders the complete schedule
 * @param {Object} scheduleData - Schedule data from API
 */
function renderSchedule(scheduleData) {
    const scheduleSection = document.getElementById('schedule-section');
    const scheduleSummary = document.getElementById('schedule-summary');
    const scheduleTimeline = document.getElementById('schedule-timeline');
    
    // Show schedule section
    scheduleSection.style.display = 'block';
    
    // Render summary
    renderScheduleSummary(scheduleData.summary, scheduleSummary);
    
    // Render timeline
    renderScheduleTimeline(scheduleData.schedule, scheduleTimeline);
}

/**
 * Renders the schedule summary section
 * @param {Object} summary - Summary data
 * @param {HTMLElement} container - Container element
 */
function renderScheduleSummary(summary, container) {
    let subjectHoursHtml = '';
    
    // Build course color mapping
    const courseColorMap = {};
    courses.forEach((course, index) => {
        courseColorMap[course.name] = assignCourseColor(index);
    });
    
    // Generate subject hours list
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

/**
 * Renders the day-by-day schedule timeline
 * @param {Array} schedule - Array of daily schedule objects
 * @param {HTMLElement} container - Container element
 */
function renderScheduleTimeline(schedule, container) {
    container.innerHTML = '';
    
    schedule.forEach(day => {
        const dayCard = createDayCard(day);
        container.appendChild(dayCard);
    });
}

/**
 * Creates a day card DOM element
 * @param {Object} day - Day schedule object
 * @returns {HTMLElement} Day card element
 */
function createDayCard(day) {
    const card = document.createElement('div');
    card.className = 'day-card';
    
    // Format date header
    const date = new Date(day.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
    });
    
    // Create blocks HTML
    let blocksHtml = '';
    day.blocks.forEach(block => {
        blocksHtml += `
            <div class="block-item" style="background: linear-gradient(135deg, ${block.color} 0%, ${adjustColorBrightness(block.color, 20)} 100%);">
                <span class="block-course-name">${escapeHtml(block.course)}</span>
                <span class="block-hours">${block.hours}h</span>
            </div>
        `;
    });
    
    card.innerHTML = `
        <div class="day-header">${formattedDate}</div>
        <div class="day-blocks">
            ${blocksHtml}
        </div>
    `;
    
    return card;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Assigns a consistent color to a course based on its index
 * @param {number} index - Course index
 * @returns {string} Hex color code
 */
function assignCourseColor(index) {
    return courseColors[index % courseColors.length];
}

/**
 * Adjusts color brightness for gradients
 * @param {string} color - Hex color code
 * @param {number} percent - Percentage to adjust (positive = lighter)
 * @returns {string} Adjusted hex color code
 */
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

/**
 * Escapes HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
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

/**
 * Shows a notification to the user
 * @param {string} message - Message to display
 * @param {string} type - Type of notification ('success' or 'error')
 */
function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
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
    
    // Add to body
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications
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
