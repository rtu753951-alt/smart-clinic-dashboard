
import csv
import collections

# 1. Load Services
services = {}
try:
    with open('public/data/services.csv', mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row['service_name'].strip()
            # Handle possible empty or invalid price
            price_str = row['price'].replace(',', '').strip()
            try:
                services[name] = float(price_str)
            except ValueError:
                services[name] = 0.0
except Exception as e:
    print(f"Error loading services.csv: {e}")

# 2. Load Appointments
appts = []
try:
    with open('public/data/appointments.csv', mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            appts.append(row)
except Exception as e:
    print(f"Error loading appointments.csv: {e}")

# 3. Simulate Logic
target_year = 2025
target_month = 11 # Dec

REVENUE_STATUSES = {'completed', 'paid', 'checked_in'}
ALL_POTENTIAL_STATUSES = {'completed', 'checked_in', 'no_show', 'cancelled', 'paid'}

total_revenue = 0
daily_revenue = collections.defaultdict(float)
match_count = 0
order_count = 0

for row in appts:
    d_str = row.get('date', '').strip()
    if not d_str.startswith('2025-12'):
        continue
    
    match_count += 1
    status = row.get('status', '').strip().lower()
    
    # Simulate cutoff date 2025-12-17
    is_future = d_str > '2025-12-17'
    
    should_include = False
    if is_future:
        if status in ALL_POTENTIAL_STATUSES:
            should_include = True
    else:
        if status in REVENUE_STATUSES:
            should_include = True
            
    if should_include:
        items = [s.strip() for s in row.get('service_item', '').split(';') if s.strip()]
        if not items:
            # Check purchased_services as fallback
            items = [s.strip() for s in row.get('purchased_services', '').split(';') if s.strip()]
            
        sum_p = 0
        for item in items:
            if item in services:
                sum_p += services[item]
            else:
                # print(f"Warning: Service '{item}' not found in map")
                pass
        
        if sum_p > 0:
            total_revenue += sum_p
            order_count += 1
            daily_revenue[d_str[:10]] += sum_p

print(f"Dec Appointments Count: {match_count}")
print(f"Revenue Orders Count: {order_count}")
print(f"Total Dec Revenue: {total_revenue}")
if daily_revenue:
    print(f"Daily Revenue Sample (5 days):")
    keys = sorted(daily_revenue.keys())
    for k in keys[:5]:
        print(f"  {k}: {daily_revenue[k]}")
else:
    print("No daily revenue calculated.")
