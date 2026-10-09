import os
import sys
import base64
import argparse
from pathlib import Path
from dotenv import load_dotenv
import httpx
from openai import OpenAI

parser = argparse.ArgumentParser()
parser.add_argument("--index", type=int, default=1, help="1, 2, 3, or 4")
args = parser.parse_args()

user_env = Path("C:/Users/Administrator/.env")
if user_env.exists():
    load_dotenv(user_env)

api_key = os.getenv("OPENAI_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL")

http_client = httpx.Client(trust_env=False, timeout=120.0)
client = OpenAI(api_key=api_key, base_url=base_url, http_client=http_client)

candidates = [
    {
        "id": "option-1-terminal-time-reel",
        "title": "方案 1：时光终端 (Terminal Time Reel)",
        "prompt": (
            "Minimalist modern developer app icon for a prompt history terminal tool. "
            "A sleek dark obsidian rounded squircle tile icon, isolated on a clean neutral dark background. "
            "In the center, a crisp glowing terminal prompt chevron symbol '>' seamlessly transitioning into "
            "elegant cascading transparent layered history cards curving backwards into a time-loop ribbon. "
            "Glowing neon cyan and electric violet ambient edge lighting, subtle glassmorphism reflections, "
            "pristine matte dark tech aesthetic, vector precision, Apple human interface icon design style, "
            "high fidelity, 1024x1024."
        )
    },
    {
        "id": "option-2-chrono-keycap",
        "title": "方案 2：极客键帽 (Chrono Keycap Up)",
        "prompt": (
            "Icon design for a developer terminal tool. A tactile mechanical keyboard keycap in deep matte graphite, "
            "front and center with smooth rounded squircle icon container. On the top face of the keycap, an illuminated "
            "hairline upward arrow '↑' encircled by a refined counter-clockwise chronometer history loop ring. "
            "Deep space gray background with subtle indigo and violet rim lighting, hyper-clean vector 3D tactile finish, "
            "developer-centric, premium Raycast and Linear product icon design style, 1024x1024."
        )
    },
    {
        "id": "option-3-cursor-quote-loop",
        "title": "方案 3：光标与引用回环 (Cursor & Quote Mobius)",
        "prompt": (
            "Modern graphic app icon for prompt history and markdown quote. A refined dark charcoal squircle icon tile. "
            "In the center, a luminous terminal blinking cursor block and a stylized markdown quote '>' symbol seamlessly "
            "woven into an infinity loop ribbon representing prompt replay and clipboard quoting. "
            "Vibrant gradient accents of electric cyan, deep indigo, and soft violet against an obsidian matte surface, "
            "clean geometric minimalism, crisp silhouette, suitable for a GitHub developer tool icon, 1024x1024."
        )
    },
    {
        "id": "option-4-terminal-buffer-tape",
        "title": "方案 4：终端历史胶片 (Terminal Buffer Tape)",
        "prompt": (
            "Clean, elegant macOS style developer icon for a terminal prompt history plugin. "
            "A dark slate glassmorphic rounded square icon badge. An illuminated terminal prompt caret '> ' at the front, "
            "with a luminous translucent parchment tape or film reel gracefully unwinding behind it, "
            "displaying glowing faint prompt lines that fade into the distance. "
            "Indigo and cyan ambient neon glow, ultra sharp vector precision, modern developer aesthetic, "
            "high fidelity, 1024x1024."
        )
    }
]

idx = args.index - 1
if idx < 0 or idx >= len(candidates):
    print(f"Error: index {args.index} out of range", file=sys.stderr)
    sys.exit(1)

item = candidates[idx]
out_dir = Path("assets/candidates")
out_dir.mkdir(parents=True, exist_ok=True)
out_file = out_dir / f"{item['id']}.png"

print(f"Generating {item['title']} -> {out_file}...")
response = client.images.generate(
    model="gpt-image-2",
    prompt=item["prompt"],
    size="1024x1024",
    quality="medium",
    response_format="b64_json"
)

b64_data = response.data[0].b64_json
if not b64_data:
    print("Error: No b64_json returned", file=sys.stderr)
    sys.exit(1)

img_data = base64.b64decode(b64_data)
out_file.write_bytes(img_data)
print(f"SUCCESS: {out_file} ({len(img_data)} bytes)")
