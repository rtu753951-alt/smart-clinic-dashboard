
import csv

try:
    with open('public/data/staff_workload.csv', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        print("Headers:", reader.fieldnames)
        row = next(reader)
        print("First Row Dict:", row)
except Exception as e:
    print("Error:", e)
