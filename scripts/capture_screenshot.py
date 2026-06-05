from playwright.sync_api import sync_playwright

def capture(url, output_path, viewport_width=1920, viewport_height=1080):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': viewport_width, 'height': viewport_height})
        page.goto(url, wait_until='networkidle')
        page.screenshot(path=output_path, full_page=False)
        browser.close()

if __name__ == "__main__":
    base_url = "http://localhost:4321/bass-tab"
    viewports = [
        ("desktop", 1920, 1080),
        ("mobile",  375,  812),
    ]
    for name, w, h in viewports:
        out = f"C:/Users/Eliascorsino/Documents/CodiFlash/ChordPlayer/chord-composer/screenshots/bass-tab-{name}.png"
        print(f"Capturing {name} ({w}x{h}) -> {out}")
        capture(base_url, out, w, h)
        print(f"  Saved.")
