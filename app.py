"""
StudySync - Smart Study Planner
Flask Backend with SQLite Database

This application provides a RESTful API for managing study courses
and generating optimized study schedules based on priority algorithms.
"""

from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict, Any
import json

app = Flask(__name__)

# Database configuration
DATABASE = 'studysync.db'

def get_db_connection():
    """
    Creates and returns a connection to the SQLite database.
    Each connection uses Row factory for dict-like access to rows.
    """
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

def init_db():
    """
    Initializes the database with the courses table.
    Called on app startup to ensure the table exists.
    
    Table Schema:
    - id: Primary key (auto-increment)
    - name: Course name (TEXT)
    - exam_date: Exam/assignment date (TEXT, ISO format)
    - difficulty: Difficulty rating 1-5 (INTEGER)
    - confidence: Confidence level 1-5 (INTEGER)
    """
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            exam_date TEXT NOT NULL,
            difficulty INTEGER NOT NULL,
            confidence INTEGER NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS assignments (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title     TEXT NOT NULL,
            due_date  TEXT NOT NULL,
            type      TEXT NOT NULL CHECK(type IN ('quiz', 'homework', 'project')),
            completed INTEGER NOT NULL DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()
    print("Database initialized successfully!")

# Initialize database on startup
init_db()

# ============================================
# WEB ROUTES (HTML Pages)
# ============================================

@app.route('/')
def index():
    """Landing page route"""
    return render_template('index.html')

@app.route('/planner')
def planner():
    """Main planner interface route"""
    return render_template('planner.html')

# ============================================
# API ROUTES (JSON Endpoints)
# ============================================

@app.route('/api/courses', methods=['GET'])
def get_courses():
    """
    GET /api/courses
    Returns all courses from the database as JSON array.
    
    Response format:
    [
        {
            "id": 1,
            "name": "Math",
            "exam_date": "2026-04-15",
            "difficulty": 5,
            "confidence": 2
        },
        ...
    ]
    """
    conn = get_db_connection()
    courses = conn.execute('SELECT * FROM courses ORDER BY exam_date ASC').fetchall()
    conn.close()
    
    # Convert Row objects to dictionaries
    courses_list = [dict(course) for course in courses]
    return jsonify(courses_list)

@app.route('/api/add-course', methods=['POST'])
def add_course():
    """
    POST /api/add-course
    Adds a new course to the database.
    
    Expected JSON body:
    {
        "name": "Math",
        "exam_date": "2026-04-15",
        "difficulty": 5,
        "confidence": 2
    }
    
    Returns: The created course with its new ID
    """
    data = request.get_json()
    
    # Validate required fields
    if not all(k in data for k in ['name', 'exam_date', 'difficulty', 'confidence']):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Validate difficulty and confidence are in range 1-5
    if not (1 <= data['difficulty'] <= 5 and 1 <= data['confidence'] <= 5):
        return jsonify({'error': 'Difficulty and confidence must be between 1 and 5'}), 400
    
    conn = get_db_connection()
    cursor = conn.execute(
        'INSERT INTO courses (name, exam_date, difficulty, confidence) VALUES (?, ?, ?, ?)',
        (data['name'], data['exam_date'], data['difficulty'], data['confidence'])
    )
    conn.commit()
    course_id = cursor.lastrowid
    conn.close()
    
    return jsonify({
        'id': course_id,
        'name': data['name'],
        'exam_date': data['exam_date'],
        'difficulty': data['difficulty'],
        'confidence': data['confidence']
    }), 201

@app.route('/api/courses/<int:course_id>', methods=['DELETE'])
def delete_course(course_id):
    """
    DELETE /api/courses/<id>
    Deletes a course by ID.
    
    Returns: Success message or error
    """
    conn = get_db_connection()
    result = conn.execute('DELETE FROM courses WHERE id = ?', (course_id,))
    conn.commit()
    conn.close()
    
    if result.rowcount == 0:
        return jsonify({'error': 'Course not found'}), 404
    
    return jsonify({'message': 'Course deleted successfully'}), 200


@app.route('/api/courses/<int:course_id>/assignments', methods=['GET'])
def get_assignments(course_id):
    conn = get_db_connection()
    course = conn.execute('SELECT id FROM courses WHERE id = ?', (course_id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Course not found'}), 404
    assignments = conn.execute(
        'SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC',
        (course_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(a) for a in assignments])


@app.route('/api/courses/<int:course_id>/assignments', methods=['POST'])
def add_assignment(course_id):
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'due_date', 'type']):
        return jsonify({'error': 'Missing required fields'}), 400
    if data['type'] not in ('quiz', 'homework', 'project'):
        return jsonify({'error': 'Invalid type'}), 400
    try:
        datetime.strptime(data['due_date'], '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Invalid due_date format'}), 400

    conn = get_db_connection()
    course = conn.execute('SELECT id FROM courses WHERE id = ?', (course_id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Course not found'}), 404

    cursor = conn.execute(
        'INSERT INTO assignments (course_id, title, due_date, type, completed) VALUES (?, ?, ?, ?, 0)',
        (course_id, data['title'], data['due_date'], data['type'])
    )
    conn.commit()
    assignment_id = cursor.lastrowid
    conn.close()

    return jsonify({
        'id': assignment_id,
        'course_id': course_id,
        'title': data['title'],
        'due_date': data['due_date'],
        'type': data['type'],
        'completed': 0
    }), 201


@app.route('/api/assignments/<int:assignment_id>', methods=['DELETE'])
def delete_assignment(assignment_id):
    conn = get_db_connection()
    result = conn.execute('DELETE FROM assignments WHERE id = ?', (assignment_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        return jsonify({'error': 'Assignment not found'}), 404
    return jsonify({'message': 'Assignment deleted successfully'}), 200


@app.route('/api/assignments/<int:assignment_id>/complete', methods=['PATCH'])
def complete_assignment(assignment_id):
    if not request.is_json:
        return jsonify({'error': 'Missing completed field'}), 400
    data = request.get_json()
    if not data or 'completed' not in data:
        return jsonify({'error': 'Missing completed field'}), 400
    if data['completed'] not in (0, 1):
        return jsonify({'error': 'Invalid completed value'}), 400

    conn = get_db_connection()
    result = conn.execute(
        'UPDATE assignments SET completed = ? WHERE id = ?',
        (data['completed'], assignment_id)
    )
    conn.commit()
    if result.rowcount == 0:
        conn.close()
        return jsonify({'error': 'Assignment not found'}), 404
    assignment = conn.execute('SELECT * FROM assignments WHERE id = ?', (assignment_id,)).fetchone()
    conn.close()
    return jsonify(dict(assignment)), 200

@app.route('/api/load-demo', methods=['POST'])
def load_demo():
    """
    POST /api/load-demo
    Loads demo data into the database for quick testing.
    Clears existing courses first, then adds 4 sample courses.
    
    Demo courses demonstrate varied difficulty, confidence, and deadlines
    to showcase the scheduling algorithm.
    """
    conn = get_db_connection()
    conn.execute('DELETE FROM courses')

    today = datetime.now()
    demo_courses = [
        {'name': 'Calculus Exam', 'exam_date': (today + timedelta(days=10)).strftime('%Y-%m-%d'), 'difficulty': 5, 'confidence': 2},
        {'name': 'Physics Final', 'exam_date': (today + timedelta(days=7)).strftime('%Y-%m-%d'), 'difficulty': 4, 'confidence': 3},
        {'name': 'History Essay', 'exam_date': (today + timedelta(days=14)).strftime('%Y-%m-%d'), 'difficulty': 2, 'confidence': 4},
        {'name': 'Programming Project', 'exam_date': (today + timedelta(days=5)).strftime('%Y-%m-%d'), 'difficulty': 5, 'confidence': 4},
    ]

    course_ids = {}
    for course in demo_courses:
        cursor = conn.execute(
            'INSERT INTO courses (name, exam_date, difficulty, confidence) VALUES (?, ?, ?, ?)',
            (course['name'], course['exam_date'], course['difficulty'], course['confidence'])
        )
        course_ids[course['name']] = cursor.lastrowid

    demo_assignments = [
        {'course': 'Calculus Exam',      'title': 'Problem Set 5',  'type': 'homework', 'days': 3},
        {'course': 'Calculus Exam',      'title': 'Chapter Quiz',   'type': 'quiz',     'days': 7},
        {'course': 'Physics Final',      'title': 'Lab Report',     'type': 'homework', 'days': 4},
        {'course': 'Physics Final',      'title': 'Midterm Review', 'type': 'homework', 'days': 6},
        {'course': 'History Essay',      'title': 'Outline Draft',  'type': 'homework', 'days': 2},
        {'course': 'Programming Project','title': 'Code Review',    'type': 'project',  'days': 3},
    ]

    for a in demo_assignments:
        due_date = (today + timedelta(days=a['days'])).strftime('%Y-%m-%d')
        conn.execute(
            'INSERT INTO assignments (course_id, title, due_date, type, completed) VALUES (?, ?, ?, ?, 0)',
            (course_ids[a['course']], a['title'], due_date, a['type'])
        )

    conn.commit()
    conn.close()
    return jsonify({'message': 'Demo data loaded successfully', 'count': len(demo_courses)}), 200

@app.route('/api/generate-schedule', methods=['POST'])
def generate_schedule_endpoint():
    """
    POST /api/generate-schedule
    Generates an optimized study schedule based on the priority algorithm.
    
    Expected JSON body:
    {
        "available_hours": 4
    }
    
    Returns: Complete schedule with daily breakdowns and summary statistics
    """
    data = request.get_json()
    available_hours = data.get('available_hours', 4)
    
    # Validate available hours
    if not (1 <= available_hours <= 12):
        return jsonify({'error': 'Available hours must be between 1 and 12'}), 400
    
    # Get all courses from database
    conn = get_db_connection()
    courses = conn.execute('SELECT * FROM courses ORDER BY exam_date ASC').fetchall()
    conn.close()
    
    if len(courses) == 0:
        return jsonify({'error': 'No courses added yet'}), 400
    
    # Convert to list of dicts for algorithm
    courses_list = [dict(course) for course in courses]
    
    # Generate the optimized schedule
    schedule_data = generate_optimized_schedule(courses_list, available_hours)
    
    return jsonify(schedule_data), 200

# ============================================
# SCHEDULING ALGORITHM
# ============================================

def generate_optimized_schedule(courses: List[Dict], available_hours: float) -> Dict[str, Any]:
    """
    Core scheduling algorithm that generates an optimized daily study plan.
    
    Algorithm Overview:
    1. Calculate priority score for each course based on difficulty, confidence, and deadline
    2. For each day from today until the earliest exam:
       - Filter out courses whose exams have passed
       - Recalculate priorities (they change as days_until_exam decreases)
       - Normalize priorities to percentages
       - Allocate available hours proportionally
       - Round to 0.5-hour blocks with minimum 0.5 hours per course
    
    Priority Formula:
    priority = difficulty × (6 - confidence) / days_until_exam
    
    Rationale:
    - Higher difficulty → needs more time
    - Lower confidence → needs more time
    - Closer deadline → more urgent
    
    Args:
        courses: List of course dictionaries with name, exam_date, difficulty, confidence
        available_hours: Daily study hours available (e.g., 4.0)
    
    Returns:
        Dictionary with 'schedule' (day-by-day breakdown) and 'summary' (statistics)
    """
    
    # Color palette for courses (cycles through these)
    colors = ['#4361ee', '#06ffa5', '#f72585', '#7209b7', '#fb5607', '#38b000']
    
    # Fetch incomplete assignments for each course
    conn = get_db_connection()
    course_assignments = {}
    for course in courses:
        rows = conn.execute(
            'SELECT * FROM assignments WHERE course_id = ? AND completed = 0',
            (course['id'],)
        ).fetchall()
        course_assignments[course['id']] = [dict(r) for r in rows]
    conn.close()
    
    # Assign consistent colors to each course
    course_colors = {}
    for idx, course in enumerate(courses):
        course_colors[course['name']] = colors[idx % len(colors)]
    
    # Parse today's date
    today = datetime.now().date()
    
    # Find the earliest exam date to determine schedule end date
    exam_dates = [datetime.strptime(course['exam_date'], '%Y-%m-%d').date() for course in courses]
    earliest_exam = min(exam_dates)
    
    # If earliest exam is in the past, return error
    if earliest_exam < today:
        return {
            'error': 'All exams are in the past',
            'schedule': [],
            'summary': {}
        }
    
    # Initialize schedule and summary tracking
    schedule = []
    total_hours_scheduled = 0
    hours_per_subject = {course['name']: 0 for course in courses}
    days_until_exams = {}
    
    # Calculate days until each exam (for summary)
    for course in courses:
        exam_date = datetime.strptime(course['exam_date'], '%Y-%m-%d').date()
        days_until = (exam_date - today).days
        days_until_exams[course['name']] = days_until
    
    # Generate daily schedule from today until earliest exam
    current_date = today
    
    while current_date <= earliest_exam:
        # Filter courses that still have upcoming exams
        active_courses = []
        for course in courses:
            exam_date = datetime.strptime(course['exam_date'], '%Y-%m-%d').date()
            if exam_date >= current_date:
                active_courses.append(course)
        
        # If no active courses, skip this day
        if not active_courses:
            current_date += timedelta(days=1)
            continue
        
        # Calculate priority score for each active course
        priorities = {}
        for course in active_courses:
            exam_date = datetime.strptime(course['exam_date'], '%Y-%m-%d').date()
            days_until = (exam_date - current_date).days
            
            incomplete = course_assignments.get(course['id'], [])
            # Preserve existing floor: exam today counts as 0.5 days
            if days_until == 0:
                days_until = 0.5
            base_priority = course['difficulty'] * (6 - course['confidence']) / days_until

            if not incomplete:
                priority = base_priority * 0.75
            else:
                assignment_boost = 0.0
                for a in incomplete:
                    due_date = datetime.strptime(a['due_date'], '%Y-%m-%d').date()
                    days_until_due = (due_date - current_date).days
                    if days_until_due <= 14:
                        days_until_due = max(0.5, float(days_until_due))
                        assignment_boost += 1.0 / days_until_due
                priority = base_priority + assignment_boost
            priorities[course['name']] = priority
        
        # Calculate total priority for normalization
        total_priority = sum(priorities.values())
        
        # If total priority is 0 (shouldn't happen with valid data), skip
        if total_priority == 0:
            current_date += timedelta(days=1)
            continue
        
        # Allocate hours proportionally based on priority
        day_blocks = []
        allocated_hours = 0
        
        for course in active_courses:
            course_name = course['name']
            priority_percentage = priorities[course_name] / total_priority
            
            # Calculate hours for this course (proportional to priority)
            course_hours = available_hours * priority_percentage
            
            # Round to nearest 0.5 hour, with minimum of 0.5
            course_hours = max(0.5, round(course_hours * 2) / 2)
            
            allocated_hours += course_hours
            
            day_blocks.append({
                'course': course_name,
                'hours': course_hours,
                'color': course_colors[course_name]
            })
            
            # Track total hours per subject
            hours_per_subject[course_name] += course_hours
        
        # Adjust if we've allocated more than available hours due to rounding
        # Proportionally reduce each block
        if allocated_hours > available_hours:
            adjustment_factor = available_hours / allocated_hours
            for block in day_blocks:
                old_hours = block['hours']
                block['hours'] = max(0.5, round(old_hours * adjustment_factor * 2) / 2)
                
                # Update tracking
                hours_per_subject[block['course']] -= old_hours
                hours_per_subject[block['course']] += block['hours']
        
        # Recalculate total hours for this day
        day_total = sum(block['hours'] for block in day_blocks)
        total_hours_scheduled += day_total
        
        # Add this day to the schedule
        schedule.append({
            'date': current_date.strftime('%Y-%m-%d'),
            'blocks': day_blocks
        })
        
        # Move to next day
        current_date += timedelta(days=1)
    
    # Build summary statistics
    summary = {
        'total_hours': round(total_hours_scheduled, 1),
        'hours_per_subject': {k: round(v, 1) for k, v in hours_per_subject.items()},
        'days_until_exams': days_until_exams
    }
    
    return {
        'schedule': schedule,
        'summary': summary
    }

# ============================================
# RUN APPLICATION
# ============================================

if __name__ == '__main__':
    print("Starting StudySync application...")
    print("Access the app at: http://localhost:5001")
    app.run(debug=True, port=5001)
