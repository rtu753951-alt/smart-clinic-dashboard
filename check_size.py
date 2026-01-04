import os
jpg = r"d:\AI_Class\clinic_dashboard_ai\src\assets\ai_operations_center_bg.jpg"
webp = r"d:\AI_Class\clinic_dashboard_ai\src\assets\ai_operations_center_bg.webp"

if os.path.exists(jpg):
    print(f"JPG: {os.path.getsize(jpg)/1024:.2f} KB")
if os.path.exists(webp):
    print(f"WebP: {os.path.getsize(webp)/1024:.2f} KB")
