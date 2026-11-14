/**
 * Antigravity Token Quota Monitor - 原生随应用自启补丁 (Asar Preload Patcher)
 * 作用：自动定位 Antigravity 核心主包 app.asar，修补 dist/preload.js 植入监控组件
 * 效果：实现 100% 随 Antigravity 启动自动秒开，无需外部常驻后台进程。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// 动态解析 @electron/asar
function loadAsarModule() {
  const possiblePaths = [
    '@electron/asar',
    path.join(__dirname, '..', 'node_modules', '@electron', 'asar'),
    path.join(__dirname, 'node_modules', '@electron', 'asar'),
    path.join(process.env.USERPROFILE || '', '.gemini', 'config', 'plugins', 'chinese-pack', 'node_modules', '@electron', 'asar', 'lib', 'asar.js')
  ];

  for (const p of possiblePaths) {
    try {
      return require(p);
    } catch (e) {}
  }
  return null;
}

// 自动定位 Antigravity 的 app.asar 路径
function detectAsarPath() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity', 'resources', 'app.asar'),
    path.join(process.env.PROGRAMFILES || '', 'Antigravity', 'resources', 'app.asar'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Antigravity', 'resources', 'app.asar'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'antigravity', 'resources', 'app.asar')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// 获取 DevToolsActivePort 端口
function getDevToolsPort() {
  const possiblePaths = [
    path.join(process.env.APPDATA || '', 'Antigravity', 'DevToolsActivePort'),
    path.join(process.env.LOCALAPPDATA || '', 'Antigravity', 'DevToolsActivePort')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8').trim();
        const port = parseInt(content.split('\n')[0].trim());
        if (port && !isNaN(port)) return port;
      } catch (e) {}
    }
  }
  return null;
}

function fetchJson(port, pathStr) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${pathStr}`, (res) => {
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

async function injectToLiveWindow(wsUrl, jsCode) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 888,
        method: 'Runtime.evaluate',
        params: { expression: jsCode, returnByValue: true }
      }));
    };

    ws.onmessage = (e) => {
      try {
        const resp = JSON.parse(e.data);
        if (resp.id === 888) {
          resolve(resp.result?.result?.value || 'OK');
          ws.close();
        }
      } catch (err) {
        resolve('ERROR');
        ws.close();
      }
    };

    ws.onerror = () => resolve('FAILED');
  });
}

async function main() {
  console.log('⚡ [Antigravity Token Monitor] 正在启动原生自启安装程序...');

  const asar = loadAsarModule();
  if (!asar) {
    console.error('❌ 未找到 @electron/asar 依赖。请在当前目录运行: npm install @electron/asar');
    process.exit(1);
  }

  const asarPath = detectAsarPath();
  if (!asarPath) {
    console.error('❌ 未能自动检测到 Antigravity 安装路径下的 resources/app.asar。');
    process.exit(1);
  }
  console.log('✔ 已找到目标主包:', asarPath);

  const asarBakPath = asarPath + '.bak';
  const tempExtractDir = path.join(__dirname, '.temp_asar_token_patch');
  const clientScriptPath = path.join(__dirname, 'token_monitor_client.js');

  // 1. 保障原版安全备份
  if (!fs.existsSync(asarBakPath)) {
    console.log('📦 正在创建原始备份: app.asar.bak ...');
    fs.copyFileSync(asarPath, asarBakPath);
  } else {
    console.log('✔ 已检测到原始备份 app.asar.bak，保留该备份。');
  }

  // 2. 读取前端客户端逻辑代码
  if (!fs.existsSync(clientScriptPath)) {
    console.error('❌ 未找到组件源码:', clientScriptPath);
    process.exit(1);
  }
  const clientJs = fs.readFileSync(clientScriptPath, 'utf8');

  // 3. 解包 asar
  console.log('📂 正在解包 app.asar ...');
  if (fs.existsSync(tempExtractDir)) {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
  asar.extractAll(asarPath, tempExtractDir);

  // 4. 修补 dist/preload.js
  const preloadPath = path.join(tempExtractDir, 'dist', 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    console.error('❌ 解包目录中未找到 dist/preload.js！');
    process.exit(1);
  }

  let preloadContent = fs.readFileSync(preloadPath, 'utf8');
  const patchTag = '// --- Antigravity Token Quota Monitor 悬浮监控组件 ---';
  if (preloadContent.includes(patchTag)) {
    console.log('🔄 检测到已有旧版补丁，正在进行热覆写升级...');
    const startIdx = preloadContent.indexOf(patchTag);
    preloadContent = preloadContent.slice(0, startIdx).trim();
  }

  const patchCode = `
\n${patchTag}
window.addEventListener('DOMContentLoaded', () => {
  try {
    if (typeof electron_1 !== 'undefined' && electron_1.webFrame) {
      electron_1.webFrame.executeJavaScript(${JSON.stringify(clientJs)});
    }
  } catch (e) {
    console.error('[Token Monitor] 启动注入失败:', e);
  }
});
`;

  preloadContent = preloadContent + patchCode;
  fs.writeFileSync(preloadPath, preloadContent, 'utf8');
  console.log('✔ dist/preload.js 注入完成！');

  // 5. 重新封包 asar
  console.log('📦 正在重新打包 app.asar ...');
  await asar.createPackage(tempExtractDir, asarPath);
  fs.rmSync(tempExtractDir, { recursive: true, force: true });
  console.log('🎉 app.asar 打包成功！原生随软件自启动已生效！');

  // 6. 热注入当前打开的窗口（如果正在运行）
  console.log('🔍 正在检测当前是否有运行中的 Antigravity 窗口...');
  const port = getDevToolsPort();
  if (port) {
    try {
      const targets = await fetchJson(port, '/json');
      const validPages = targets.filter(t => t.type === 'page' && t.url.startsWith('https://127.0.0.1'));
      for (const page of validPages) {
        const res = await injectToLiveWindow(page.webSocketDebuggerUrl, clientJs);
        console.log('🚀 当前窗口实时热更新成功，返回值:', res);
      }
    } catch (e) {
      console.warn('⚠️ 热注入当前窗口遇到轻微提示:', e.message);
    }
  } else {
    console.log('ℹ 当前未打开 Antigravity，下次启动时将自动加载生效。');
  }

  console.log('✨ 全部部署完毕！');
}

main().catch(err => {
  console.error('❌ 执行过程出错:', err);
  process.exit(1);
});
