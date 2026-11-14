const fs = require('fs');
const path = require('path');
const http = require('http');

function getDevToolsPort() {
  const possiblePaths = [
    path.join(process.env.APPDATA || '', 'Antigravity', 'DevToolsActivePort'),
    path.join(process.env.LOCALAPPDATA || '', 'Antigravity', 'DevToolsActivePort')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8').trim();
        const port = parseInt(content.split('\n')[0].trim(), 10);
        if (port && !isNaN(port)) return port;
      } catch (e) {}
    }
  }
  return null;
}

function fetchJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const port = getDevToolsPort();
  if (!port) {
    console.error('❌ 未找到 DevToolsActivePort，请确认 Antigravity 是否正在运行。');
    process.exit(1);
  }

  const targets = await fetchJson(port, '/json');
  const mainPage = targets.find(t => t.type === 'page' && t.url.startsWith('https://127.0.0.1'));
  if (!mainPage) {
    console.error('❌ 未找到 Antigravity 主渲染窗口');
    process.exit(1);
  }

  const clientScript = fs.readFileSync(path.join(__dirname, 'token_monitor_client.js'), 'utf8');

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(mainPage.webSocketDebuggerUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: clientScript, returnByValue: true }
      }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log('✅ 注入成功! 状态:', data.result?.result?.value);
      ws.close();
      resolve();
    };

    ws.onerror = reject;
  });
}

main().catch(console.error);
