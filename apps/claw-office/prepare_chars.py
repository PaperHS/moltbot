from PIL import Image
import os

SRC_DIR = "openclaw-space/assets/Modern tiles_Free/Characters_free"
DST_DIR = "wa-office/public/characters"
SCALE = 2 # 16x16 -> 32x32

CHARS = {
    "Adam_idle_anim_16x16.png": "Alvin.png",
    "Alex_idle_anim_16x16.png": "PM_OldLiu.png",
    "Amelia_idle_anim_16x16.png": "Designer_XiaoMei.png",
    "Bob_idle_anim_16x16.png": "Coder_OldYe.png"
}

def resize_chars():
    if not os.path.exists(SRC_DIR):
        print("Source not found")
        return

    for src_name, dst_name in CHARS.items():
        path = os.path.join(SRC_DIR, src_name)
        if os.path.exists(path):
            img = Image.open(path)
            # Resize
            w, h = img.size
            new_img = img.resize((w * SCALE, h * SCALE), Image.NEAREST)
            new_img.save(os.path.join(DST_DIR, dst_name))
            print(f"✅ Processed {dst_name}")
        else:
            print(f"❌ Missing {src_name}")

if __name__ == "__main__":
    resize_chars()
