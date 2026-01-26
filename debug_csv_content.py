import csv
import sys

def check_csv(path, relevant_cols):
    print(f"--- Checking {path} ---")
    try:
        with open(path, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f)
            headers = next(reader)
            print(f"Headers: {headers}")
            
            indices = {}
            for col in relevant_cols:
                if col in headers:
                    indices[col] = headers.index(col)
                else:
                    print(f"MISSING COLUMN: {col}")
            
            print(f"Indices: {indices}")
            
            for i, row in enumerate(reader):
                if i >= 10: break
                out = []
                for col, idx in indices.items():
                    val = row[idx] if idx < len(row) else "N/A"
                    out.append(f"{col}={val}")
                print(f"Row {i}: " + ", ".join(out))
    except Exception as e:
        print(f"Error: {e}")
    print("\n")

check_csv('public/data/appointments.csv', ['doctor_name', 'staff_role', 'service_item'])
check_csv('public/data/staff.csv', ['staff_name', 'staff_type'])
