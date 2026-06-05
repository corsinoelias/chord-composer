from playwright.sync_api import sync_playwright

def capture(url, output_path, viewport_width, viewport_height):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': viewport_width, 'height': viewport_height})
        page.goto(url, wait_until='networkidle')
        page.screenshot(path=output_path, full_page=False)
        browser.close()
        print(f"  Saved: {output_path}")

if __name__ == "__main__":
    base_url = "http://localhost:4322/bass-tab/"
    shots = [
        ("desktop-1280x800",  1280, 800),
        ("mobile-390x844",     390, 844),
    ]
    for name, w, h in shots:
        out = f"C:/Users/Eliascorsino/Documents/CodiFlash/ChordPlayer/chord-composer/screenshots/bass-tab-{name}.png"
        print(f"Capturing {name} ({w}x{h})...")
        capture(base_url, out, w, h)
