from PIL import Image
import os

def optimize_image(input_path, output_path_webp, target_size_kb=800):
    if not os.path.exists(input_path):
        print(f"Error: File not found at {input_path}")
        return

    print(f"Processing: {input_path}")
    original_size = os.path.getsize(input_path) / 1024
    print(f"Original Size: {original_size:.2f} KB")

    img = Image.open(input_path)
    
    # 1. Generate WebP
    quality = 85
    while True:
        img.save(output_path_webp, 'WEBP', quality=quality)
        webp_size = os.path.getsize(output_path_webp) / 1024
        
        if webp_size < target_size_kb or quality <= 50:
            print(f"Generated WebP: {output_path_webp}")
            print(f"WebP Size: {webp_size:.2f} KB (Quality: {quality})")
            break
        
        quality -= 5

    return

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    # Adjust path to point to assets
    # Script is in root/tools (if I create it there) or root (if I create it there).
    # I'll create this script in the root for simplicity based on Cwd.
    
    input_file = os.path.join(base_dir, "src", "assets", "ai_operations_center_bg.jpg")
    output_file = os.path.join(base_dir, "src", "assets", "ai_operations_center_bg.webp")
    
    optimize_image(input_file, output_file)
