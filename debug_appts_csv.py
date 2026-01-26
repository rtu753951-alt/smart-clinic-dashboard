import csv
import sys

file_path = 'public/data/appointments.csv'

try:
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        headers = next(reader)
        print(f"Headers: {headers}")
        print("-" * 20)
        for i, row in enumerate(reader):
            if i < 10:
                print(f"Row {i}: {row}")
except Exception as e:
    print(f"Error: {e}")
