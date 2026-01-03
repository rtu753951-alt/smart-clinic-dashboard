import csv
import random
from datetime import datetime, timedelta

# Configuration
NUM_RECORDS = 500
START_DATE = datetime.now() - timedelta(days=45)
END_DATE = datetime.now() + timedelta(days=15) # Future appointments

DOCTORS = ["Dr. Wang", "Dr. Lee", "Dr. Chen"]
NURSES = ["Nurse A", "Nurse B", "Nurse C", "Therapist X", "Therapist Y"]
TREATMENTS = [
    {"name": "Pico Laser", "price": 3000, "duration": 30, "type": "Laser"},
    {"name": "Thermage", "price": 60000, "duration": 90, "type": "Lifting"},
    {"name": "Ultherapy", "price": 50000, "duration": 60, "type": "Lifting"},
    {"name": "Botox", "price": 5000, "duration": 15, "type": "Injection"},
    {"name": "Consultation", "price": 500, "duration": 30, "type": "General"},
    {"name": "Facial", "price": 2000, "duration": 60, "type": "Skincare"}
]
ROOMS = ["Room 101", "Room 102", "Room 103", "VIP Room"]
SOURCES = ["LINE", "Phone", "Walk-in", "Web"]
STATUSES = ["Completed", "Completed", "Completed", "No-show", "Cancelled"] # Weighted towards Completed

def generate_customers_csv():
    with open('customers.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['customer_id', 'name', 'gender', 'age', 'visit_date', 'visit_time', 'treatment_type', 'doctor', 'nurse', 'room_id', 'is_new', 'source', 'status', 'revenue'])
        
        for i in range(NUM_RECORDS):
            visit_dt = START_DATE + timedelta(days=random.randint(0, (END_DATE - START_DATE).days))
            visit_date = visit_dt.strftime('%Y-%m-%d')
            
            # Random time between 12:00 and 21:00 (last appointment around 20:45)
            h = random.randint(12, 20)
            m = random.choice([0, 15, 30, 45])
            visit_time = f"{h:02d}:{m:02d}:00"
            
            treatment = random.choice(TREATMENTS)
            doctor = random.choice(DOCTORS)
            nurse = random.choice(NURSES)
            room = random.choice(ROOMS)
            
            # Logic: Future dates are "Booked" or "Confirmed", Past are "Completed"/"No-show"
            if visit_dt > datetime.now():
                status = "Booked"
            else:
                status = random.choice(STATUSES)
            
            # Revenue is 0 if not completed/booked
            revenue = treatment['price'] if status in ["Completed", "Booked"] else 0
            
            writer.writerow([
                f"C{i:04d}",
                f"Guest_{i}",
                random.choice(["M", "F", "F", "F"]), # More female for aesthetic clinic
                random.randint(20, 60),
                visit_date,
                visit_time,
                treatment['name'],
                doctor,
                nurse,
                room,
                random.choice(["TRUE", "FALSE"]),
                random.choice(SOURCES),
                status,
                revenue
            ])

def generate_rooms_usage_csv():
    # Simplified: deriving from customers roughly, but let's just make a separate consistent file
    # Actually, to be consistent, we should base it on the customers file, but for simplicity let's just generate independent but similar data
    # or just skip this and derive room usage from customers.csv in the JS logic?
    # The prompt mentions "Rooms & Equipment" page.
    # Let's create a separate file for specific equipment usage logs if needed, but the user prompt implies analyzing "Rooms & Equipment".
    # I will stick to customers.csv as the primary source for now to avoid inconsistencies.
    # But I'll create a small equipment_log.csv for specific machine usage tracking.
    
    with open('equipment_log.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['log_id', 'date', 'time', 'equipment_name', 'staff_name', 'duration_min', 'status'])
        
        equipments = ["PicoSure", "Thermage FLX", "Ulthera", "Centrifuge"]
        
        for i in range(200):
            dt = START_DATE + timedelta(days=random.randint(0, 60))
            writer.writerow([
                f"E{i:04d}",
                dt.strftime('%Y-%m-%d'),
                f"{random.randint(10,19)}:{random.choice([0,30]):02d}:00",
                random.choice(equipments),
                random.choice(NURSES),
                random.choice([30, 60, 90]),
                "Normal"
            ])

if __name__ == "__main__":
    generate_customers_csv()
    generate_rooms_usage_csv()
