import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const svgContent = readFileSync('./src/assets/electricGuitar.svg', 'utf-8');

const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#222;display:flex;gap:20px;padding:20px">
  <!-- Portrait original -->
  <div style="background:#333;position:relative">
    <p style="color:white;font-size:10px;margin:4px">PORTRAIT (original)</p>
    <img src="data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}"
         style="width:200px;height:620px;object-fit:contain;display:block"/>
  </div>
  <!-- Rotated 90deg CW (como en el componente) -->
  <div style="background:#333;position:relative;width:620px;height:200px;overflow:hidden">
    <p style="color:white;font-size:10px;position:absolute;top:4px;left:4px;z-index:9;margin:0">ROTADO 90° CW (landscape)</p>
    <img src="data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}"
         style="
           position:absolute;
           width:200px;height:620px;
           left:${(620-200)/2}px;
           top:${(200-620)/2}px;
           transform:rotate(90deg);
           transform-origin:center;
           object-fit:contain;
         "/>
  </div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 900, height: 700 });
await page.setContent(html);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'C:/Users/ELIASC~1/AppData/Local/Temp/svg-preview.png', fullPage: true });
console.log('Done');
await browser.close();
