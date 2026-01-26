import csv
import sys

file_path = 'public/data/staff_workload.csv'

try:
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        headers = next(reader)
        print(f"Headers: {headers}")
        print("-" * 20)
        for i, row in enumerate(reader):
            if i < 5:
                print(f"Row {i}: {row}")
except Exception as e:
    print(f"Error: {e}")
