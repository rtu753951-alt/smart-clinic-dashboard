import os
from PIL import Image

def get_size_kb(path):
    if not os.path.exists(path):
        return 0
    return os.path.getsize(path) / 1024

def optimize_image(path, target_width=1920):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return

    print(f"Processing {path}...")
    original_size = get_size_kb(path)
    print(f"  Original Size: {original_size:.2f} KB")

    try:
        with Image.open(path) as img:
            # Resize logic
            w_percent = (target_width / float(img.size[0]))
            if w_percent < 1: # Only downscale
                h_size = int((float(img.size[1]) * float(w_percent)))
                img = img.resize((target_width, h_size), Image.Resampling.LANCZOS)
                print(f"  Resized to: {target_width}x{h_size}")
            else:
                print(f"  Image width {img.size[0]} <= {target_width}, skipping resize.")

            # Construct new filename (we overwrite or create webp)
            base, ext = os.path.splitext(path)
            
            # Save as WebP
            webp_path = base + ".webp"
            img.save(webp_path, "WEBP", quality=65, method=6)
            new_webp_size = get_size_kb(webp_path)
            print(f"  Saved WebP: {new_webp_size:.2f} KB ({webp_path})")

            # Save as JPG (Fallback) if original was jpg or we want a jpg fallback
            if ext.lower() in ['.jpg', '.jpeg']:
                jpg_path = path # Overwrite original jpg
                img = img.convert("RGB") # Ensure RGB for JPG
                img.save(jpg_path, "JPEG", quality=65, optimize=True)
                new_jpg_size = get_size_kb(jpg_path)
                print(f"  Saved JPG: {new_jpg_size:.2f} KB ({jpg_path})")

    except Exception as e:
        print(f"  Error processing {path}: {e}")

# Target Files
assets_dir = r"d:\AI_Class\clinic_dashboard_ai\src\assets"
bg_jpg = os.path.join(assets_dir, "ai_operations_center_bg.jpg")
bg_webp = os.path.join(assets_dir, "ai_operations_center_bg.webp")

# We can process the JPG as the source master if it exists
if os.path.exists(bg_jpg):
    optimize_image(bg_jpg)
elif os.path.exists(bg_webp):
    # If only webp exists, optimize it
    optimize_image(bg_webp)
else:
    print("No background image found to optimize.")
