#!/bin/bash

# StudySync Quick Start Script
# This script sets up and runs the StudySync application

echo "================================"
echo "StudySync - Smart Study Planner"
echo "================================"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate
echo "✓ Virtual environment activated"

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt --quiet
echo "✓ Dependencies installed"

# Start the application
echo ""
echo "================================"
echo "Starting StudySync..."
echo "================================"
echo ""
echo "The application will be available at:"
echo "http://localhost:5000"
echo ""
echo "Press CTRL+C to stop the server"
echo ""

python app.py
