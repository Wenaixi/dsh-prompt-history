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
        "id": "transparent-option-1-chevron-vortex",
        "title": "方案 1：极光终端时光环 (Terminal Chevron & History Vortex)",
        "prompt": (
            "App icon symbol on completely transparent background, PNG with transparent alpha channel. "
            "A modern floating terminal prompt chevron '>' made of frosted dark glass and luminous neon edges, "
            "glowing with vibrant electric cyan and deep violet gradient lighting. Curving around it is an elegant "
            "spiral orbital vortex ring representing past prompt history, with faint glowing command blocks. "
            "Clean floating 3D glassmorphic developer glyph, ultra sharp edges, raytraced reflections, "
            "completely transparent background, isolated icon, 1024x1024."
        )
    },
    {
        "id": "transparent-option-2-chrono-keycap",
        "title": "方案 2：极客方向键帽 (Tactile Up-Arrow Keycap with Chrono Loop)",
        "prompt": (
            "App icon symbol on completely transparent background, PNG with transparent alpha channel. "
            "A floating tactile mechanical keyboard keycap in sleek matte graphite, viewed at a dynamic slight angle. "
            "Embossed on the keycap top is an illuminated hairline upward arrow '↑' encircled by a refined "
            "counter-clockwise chronograph timeline ring. Glowing neon violet and cyan rim reflections, "
            "hyper-clean 3D tactile developer hardware aesthetic, Raycast and Linear style, "
            "completely transparent background, isolated icon, 1024x1024."
        )
    },
    {
        "id": "transparent-option-3-mobius-quote",
        "title": "方案 3：莫比乌斯光标与引用 (Cursor & Markdown Quote Mobius)",
        "prompt": (
            "App icon symbol on completely transparent background, PNG with transparent alpha channel. "
            "An elegant continuous Mobius loop ribbon intertwining a glowing terminal block cursor '_' and "
            "a sharp markdown quote '>' symbol. Vibrant gradient transitions from electric cyan to radiant violet, "
            "sleek glossy surface reflections, geometric minimalism, representing prompt replay and clipboard quoting, "
            "completely transparent background, isolated icon, 1024x1024."
        )
    },
    {
        "id": "transparent-option-4-data-ribbon",
        "title": "方案 4：复古未来终端时光带 (Terminal Prompt & Data Tape Ribbon)",
        "prompt": (
            "App icon symbol on completely transparent background, PNG with transparent alpha channel. "
            "A crisp floating terminal prompt caret '>_' in glowing neon violet and emerald-cyan, "
            "accompanied by a gracefully swirling translucent holographic film tape ribbon curling behind it, "
            "displaying subtle glowing dots and command lines. Modern minimalist tech aesthetic, "
            "completely transparent background, isolated icon, 1024x1024."
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

print(f"Generating transparent {item['title']} -> {out_file}...")
response = client.images.generate(
    model="gpt-image-2",
    prompt=item["prompt"],
    size="1024x1024",
    quality="medium",
    background="transparent",
    response_format="b64_json"
)

b64_data = response.data[0].b64_json
if not b64_data:
    print("Error: No b64_json returned", file=sys.stderr)
    sys.exit(1)

img_data = base64.b64decode(b64_data)
out_file.write_bytes(img_data)
print(f"SUCCESS: {out_file} ({len(img_data)} bytes)")
