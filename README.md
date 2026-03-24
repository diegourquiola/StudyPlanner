# StudySync — Smart Study Planner

A full-stack web application that helps students optimize their study time by generating personalized, priority-based daily study schedules.

## Features

- **Smart Course Management**: Add courses with exam dates, difficulty ratings, and confidence levels
- **Intelligent Scheduling Algorithm**: Prioritizes study time based on:
  - Course difficulty (1-5 scale)
  - Your confidence level (1-5 scale)
  - Days until exam deadline
- **Visual Schedule**: Day-by-day study plan with color-coded time blocks
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Demo Data**: Quick demo mode for testing and presentations

## Tech Stack

- **Backend**: Python 3 with Flask framework
- **Frontend**: Vanilla HTML, CSS, and JavaScript (no frameworks)
- **Database**: SQLite (persistent storage)
- **Styling**: Modern CSS with Inter font, navy/blue color scheme

## Installation

1. **Clone or download this project**

2. **Create a virtual environment**:
   ```bash
   python3 -m venv venv
   ```

3. **Activate the virtual environment**:
   - On macOS/Linux:
     ```bash
     source venv/bin/activate
     ```
   - On Windows:
     ```bash
     venv\Scripts\activate
     ```

4. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Application

1. **Start the Flask server**:
   ```bash
   python app.py
   ```

2. **Open your browser** and navigate to:
   ```
   http://localhost:5000
   ```

3. **Get started**:
   - Click "Get Started" on the landing page
   - Add your courses or click "Load Demo Data" for a quick demo
   - Set your available study hours per day
   - Click "Generate Schedule" to see your optimized study plan

## Project Structure

```
studysync/
├── app.py                 # Flask backend with API routes and scheduling algorithm
├── requirements.txt       # Python dependencies (Flask)
├── studysync.db          # SQLite database (auto-created on first run)
├── static/
│   ├── css/
│   │   └── style.css     # All styling with responsive design
│   └── js/
│       └── app.js        # Frontend logic and API communication
└── templates/
    ├── index.html        # Landing page
    └── planner.html      # Main planner interface
```

## How the Algorithm Works

The scheduling algorithm uses a priority-based approach:

### Priority Calculation Formula
```
priority = difficulty × (6 - confidence) / days_until_exam
```

### Priority Factors
- **Higher difficulty** → More study time needed
- **Lower confidence** → More study time needed
- **Closer deadline** → Higher urgency

### Daily Allocation
1. For each day from today until the earliest exam:
   - Calculate priority scores for all active courses
   - Normalize priorities into percentages
   - Allocate available hours proportionally
   - Round to 0.5-hour blocks (minimum 0.5 hours per course)

### Example
For a student with 4 hours available per day and these courses:

| Course | Difficulty | Confidence | Days Until | Priority Score | Allocated Time |
|--------|-----------|-----------|------------|----------------|----------------|
| Math   | 5         | 2         | 7          | 2.86          | 2.0 hours      |
| Physics| 4         | 4         | 3          | 2.67          | 2.0 hours      |
| History| 2         | 5         | 14         | 0.14          | 0.5 hours (min)|

## API Endpoints

- `GET /` - Landing page
- `GET /planner` - Main planner interface
- `GET /api/courses` - Get all courses
- `POST /api/add-course` - Add a new course
- `DELETE /api/courses/<id>` - Delete a course
- `POST /api/load-demo` - Load demo data
- `POST /api/generate-schedule` - Generate optimized schedule

## Demo Data

The "Load Demo Data" button populates the app with 4 sample courses:
1. **Calculus Exam** - High difficulty (5), Low confidence (2), 10 days away
2. **Physics Final** - Medium-high difficulty (4), Medium confidence (3), 7 days away
3. **History Essay** - Low difficulty (2), High confidence (4), 14 days away
4. **Programming Project** - High difficulty (5), Medium-high confidence (4), 5 days away

This demonstrates how the algorithm prioritizes urgent, difficult courses while still allocating time to all subjects.

## Design Highlights

- **Color Palette**: Navy (#1a1a2e), Accent Blue (#4361ee), Success Green (#06ffa5)
- **Typography**: Inter font family from Google Fonts
- **UI Components**: Card-based layout with smooth transitions and hover effects
- **Responsive**: Mobile-first design with breakpoints at 768px and 1024px

## Code Comments

The code is extensively commented to explain:
- Database schema and initialization
- API endpoint functionality
- Scheduling algorithm logic (step-by-step)
- Frontend functions and event handlers

This makes it easy to walk through the implementation in presentations or code reviews.

## Future Enhancements

Potential features for future development:
- User authentication and persistent user accounts
- Study session tracking and analytics
- Calendar integration (Google Calendar, iCal)
- Study technique recommendations
- Mobile app version
- Export schedule to PDF

## License

This project is created for educational purposes.

---

**Built with ❤️ for students who want to study smarter, not harder.**
