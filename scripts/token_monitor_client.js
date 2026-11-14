(() => {
  // 如果已存在旧实例，先清理
  if (window.__AGY_TOKEN_MONITOR__) {
    try {
      window.__AGY_TOKEN_MONITOR__.destroy();
    } catch (e) {
      console.error('[TokenMonitor] 清理旧实例失败:', e);
    }
  }

  // 本地存储键名
  const STORAGE_KEY_STYLE = 'agy_token_monitor_style';
  const STORAGE_KEY_POS = 'agy_token_monitor_pos';
  const STORAGE_KEY_COLLAPSED = 'agy_token_monitor_collapsed';

  // 样式定义（默认首项为：极简水印）
  const STYLES = [
    { id: 'watermark', name: '极简水印' },
    { id: 'classic', name: '经典卡片' },
    { id: 'radial', name: '极简双环' },
    { id: 'cyber', name: '极客 HUD' }
  ];

  // 默认直接使用极简水印 (0)
  let currentStyleIdx = 0;
  try {
    const savedStyle = localStorage.getItem(STORAGE_KEY_STYLE);
    if (savedStyle !== null) {
      const idx = parseInt(savedStyle, 10);
      if (!isNaN(idx) && idx >= 0 && idx < STYLES.length) {
        currentStyleIdx = idx;
      }
    }
  } catch (e) {}

  let isCollapsed = false;
  try {
    isCollapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED) === 'true';
  } catch (e) {}

  let customPos = null;
  try {
    const savedPos = localStorage.getItem(STORAGE_KEY_POS);
    if (savedPos) {
      customPos = JSON.parse(savedPos);
    }
  } catch (e) {}

  // 主题检测（白天浅色模式 vs 黑夜深色模式）
  function isDarkTheme() {
    return document.body.classList.contains('theme-dark') ||
           document.documentElement.classList.contains('dark') ||
           (!document.body.classList.contains('theme-light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // 主题动态色彩调色盘
  function getThemeColors() {
    const dark = isDarkTheme();
    return {
      isDark: dark,
      textMain: dark ? 'rgba(255, 255, 255, 0.90)' : 'rgba(15, 23, 42, 0.90)',
      textSub: dark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(15, 23, 42, 0.68)',
      textMuted: dark ? 'rgba(255, 255, 255, 0.40)' : 'rgba(15, 23, 42, 0.45)',
      watermarkOpacity: dark ? '0.75' : '0.88',
      geminiColor: dark ? '#38bdf8' : '#0284c7',
      claudeColor: dark ? '#c084fc' : '#7c3aed',
      circleBg: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      badgeBg: dark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.12)',
      badgeColor: dark ? '#38bdf8' : '#0284c7',
      cyberBg: dark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
      cyberBorder: dark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.30)',
      cyberTileGeminiBg: dark ? 'rgba(14, 165, 233, 0.08)' : 'rgba(2, 132, 199, 0.06)',
      cyberTileClaudeBg: dark ? 'rgba(168, 85, 247, 0.08)' : 'rgba(124, 58, 237, 0.06)'
    };
  }

  // 获取限额颜色（兼顾白天与黑夜模式清晰度）
  function getPctColor(pct, isDark) {
    if (pct <= 20) return isDark ? '#ef4444' : '#dc2626'; // 红
    if (pct <= 50) return isDark ? '#f59e0b' : '#d97706'; // 橙
    return isDark ? '#10b981' : '#059669'; // 绿
  }

  // 获取 cloudCodeService 的工具函数
  function getCloudCodeService() {
    if (window.__CLOUD_CODE_SERVICE__?.retrieveUserQuotaSummary) {
      return window.__CLOUD_CODE_SERVICE__;
    }
    const buttons = document.querySelectorAll('button');
    for (let btn of buttons) {
      const k = Object.keys(btn).find(key => key.startsWith('__reactFiber$'));
      if (!k) continue;
      let cur = btn[k];
      while (cur) {
        if (cur.memoizedProps?.services?.core?.cloudCodeService?.retrieveUserQuotaSummary) {
          window.__CLOUD_CODE_SERVICE__ = cur.memoizedProps.services.core.cloudCodeService;
          return window.__CLOUD_CODE_SERVICE__;
        }
        cur = cur.return;
      }
    }
    return null;
  }

  // 格式化重置时间（完整中文说明）
  function formatResetTime(resetTimestampSeconds) {
    if (!resetTimestampSeconds) return '';
    const sec = Number(resetTimestampSeconds);
    if (!sec || isNaN(sec)) return '';
    const diffMs = sec * 1000 - Date.now();
    if (diffMs <= 0) return '即将重置';
    const totalMins = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;
    if (days > 0) return days + '天' + (hours > 0 ? hours + '小时' : '');
    if (hours > 0) return hours + '小时' + (mins > 0 ? mins + '分钟' : '');
    return (mins > 0 ? mins : '<1') + '分钟';
  }

  // 紧凑型倒计时（如 3h30m, 6d）
  function formatResetCompact(resetTimestampSeconds, windowType) {
    if (!resetTimestampSeconds) {
      return windowType === 'weekly' ? '7d' : '5h';
    }
    const sec = Number(resetTimestampSeconds);
    if (!sec || isNaN(sec)) {
      return windowType === 'weekly' ? '7d' : '5h';
    }
    const diffMs = sec * 1000 - Date.now();
    if (diffMs <= 0) return '0m';
    const totalMins = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;

    if (windowType === 'weekly') {
      if (days > 0) return `${days}d`;
      if (hours > 0 && mins > 0) return `${hours}h${mins}m`;
      if (hours > 0) return `${hours}h`;
      return `${mins || 1}m`;
    } else {
      if (hours > 0 && mins > 0) return `${hours}h${mins}m`;
      if (hours > 0) return `${hours}h`;
      return `${mins || 1}m`;
    }
  }

  // 精确重置时间点（如 11月15日 03:30）
  function formatExactTime(resetTimestampSeconds) {
    if (!resetTimestampSeconds) return '';
    const sec = Number(resetTimestampSeconds);
    if (!sec || isNaN(sec)) return '';
    const d = new Date(sec * 1000);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${day}日 ${hh}:${mm}`;
  }

  const containerId = 'agy-token-monitor-widget';
  let cachedData = null;

  // 清理可能遗留的悬浮卡片
  const oldHoverCard = document.getElementById('agy-token-detail-card');
  if (oldHoverCard) oldHoverCard.remove();

  // 创建组件容器
  const widget = document.createElement('div');
  widget.id = containerId;
  widget.setAttribute('data-draggable', 'true');

  // 注入样式与动画（支持 header 移开慢隐、移入秒显）
  let styleTag = document.getElementById('agy-token-anim-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'agy-token-anim-style';
    document.head.appendChild(styleTag);
  }
  styleTag.innerHTML = `
    @keyframes agyFloatAbove {
      0% { opacity: 0; transform: translate(-50%, 4px) scale(0.96); }
      15% { opacity: 1; transform: translate(-50%, 0) scale(1); }
      75% { opacity: 1; transform: translate(-50%, 0) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -5px) scale(0.96); }
    }
    /* 鼠标离开组件时，最上一栏慢慢透明掉（0.5s 平滑过渡）；光标移入组件时立刻显性（0.05s 瞬显） */
    #agy-token-monitor-widget.agy-style-watermark #agy-token-header {
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    #agy-token-monitor-widget.agy-style-watermark:hover #agy-token-header {
      opacity: 1 !important;
      pointer-events: auto !important;
      transition: opacity 0.05s ease-out !important;
    }
  `;

  // 应用容器基础样式与定位
  function applyWidgetStyle() {
    const isFloating = customPos !== null;
    const styleDef = STYLES[currentStyleIdx];
    const tc = getThemeColors();

    // 根据当前样式更新 class
    widget.className = styleDef.id === 'watermark' ? 'agy-style-watermark' : '';

    let baseCss = `
      user-select: none;
      transition: opacity 0.25s ease, box-shadow 0.2s ease, background 0.2s ease;
      font-size: 11px;
    `;

    if (styleDef.id === 'watermark') {
      baseCss += `
        background: transparent;
        border: none;
        box-shadow: none;
        color: ${tc.textSub};
        border-radius: 6px;
        padding: 3px 6px;
        opacity: ${tc.watermarkOpacity};
      `;
    } else if (styleDef.id === 'cyber') {
      baseCss += `
        background: ${tc.cyberBg};
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid ${tc.cyberBorder};
        box-shadow: 0 8px 30px rgba(0, 0, 0, ${tc.isDark ? '0.5' : '0.12'}), inset 0 0 12px ${tc.isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.05)'};
        color: ${tc.textMain};
        border-radius: 10px;
        padding: 9px 11px;
      `;
    } else if (styleDef.id === 'radial') {
      baseCss += `
        background: var(--sidebar-accent, rgba(128, 128, 128, 0.06));
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid var(--sidebar-border, rgba(128, 128, 128, 0.12));
        box-shadow: 0 4px 16px rgba(0, 0, 0, ${tc.isDark ? '0.25' : '0.08'});
        color: var(--secondary-foreground, ${tc.textSub});
        border-radius: 10px;
        padding: 8px 10px;
      `;
    } else {
      // classic
      baseCss += `
        background: var(--sidebar-accent, rgba(128, 128, 128, 0.06));
        border: 1px solid var(--sidebar-border, rgba(128, 128, 128, 0.12));
        box-shadow: 0 2px 8px rgba(0, 0, 0, ${tc.isDark ? '0.18' : '0.06'});
        color: var(--secondary-foreground, ${tc.textSub});
        border-radius: 8px;
        padding: 8px 10px;
      `;
    }

    if (isFloating) {
      baseCss += `
        position: fixed;
        left: ${customPos.left}px;
        top: ${customPos.top}px;
        z-index: 9999;
        margin: 0;
        min-width: ${styleDef.id === 'watermark' ? 'auto' : '210px'};
        max-width: 320px;
      `;
      if (styleDef.id !== 'watermark') {
        baseCss += `box-shadow: 0 10px 32px rgba(0, 0, 0, ${tc.isDark ? '0.45' : '0.15'});`;
      }
    } else {
      baseCss += `
        position: relative;
        left: auto;
        top: auto;
        z-index: 10;
        margin: ${styleDef.id === 'watermark' ? '2px 8px' : '6px 8px 4px 8px'};
      `;
    }

    widget.style.cssText = baseCss;
  }

  // 悬停时水印微亮
  widget.addEventListener('mouseenter', () => {
    if (STYLES[currentStyleIdx].id === 'watermark') {
      widget.style.opacity = '1.0';
    }
  });

  widget.addEventListener('mouseleave', () => {
    if (STYLES[currentStyleIdx].id === 'watermark') {
      const tc = getThemeColors();
      widget.style.opacity = tc.watermarkOpacity;
    }
  });

  // 显示在组件正上方的小提示气泡
  function showToastAbove(text = '已刷新') {
    const oldToast = document.getElementById('agy-token-above-toast');
    if (oldToast) oldToast.remove();

    const tc = getThemeColors();
    const tip = document.createElement('div');
    tip.id = 'agy-token-above-toast';
    tip.style.cssText = `
      position: absolute;
      bottom: calc(100% + 5px);
      left: 50%;
      transform: translateX(-50%);
      background: ${tc.isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)'};
      color: ${tc.geminiColor};
      border: 1px solid ${tc.isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.3)'};
      padding: 2.5px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
      white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0, 0, 0, ${tc.isDark ? '0.35' : '0.12'});
      pointer-events: none;
      z-index: 100000;
      display: flex;
      align-items: center;
      gap: 4px;
      animation: agyFloatAbove 1.2s ease forwards;
    `;
    tip.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${text}</span>
    `;

    widget.appendChild(tip);
    setTimeout(() => {
      if (tip.parentElement) tip.remove();
    }, 1200);
  }

  // 挂载位置判断与插入
  function mountWidget() {
    if (customPos !== null) {
      if (!document.body.contains(widget)) {
        document.body.appendChild(widget);
      }
      return true;
    }

    if (document.getElementById(containerId)) {
      return true;
    }

    const all = Array.from(document.querySelectorAll('*'));
    const settingsEl = all.find(el => {
      return el.children.length === 0 && (el.textContent.trim() === '系统设置' || el.textContent.trim() === 'Settings');
    });
    if (settingsEl) {
      const settingsBtn = settingsEl.closest('button');
      if (settingsBtn && settingsBtn.parentElement) {
        settingsBtn.parentElement.insertBefore(widget, settingsBtn);
        return true;
      }
    }
    return false;
  }

  // 抽取提取模型配额数据
  function parseQuotaData(data) {
    if (!data || !data.groups) return null;
    const result = {
      gemini: {
        weekly: { pct: 100, resetStr: '', compactStr: '7d', exactTimeStr: '' },
        fiveH: { pct: 100, resetStr: '', compactStr: '5h', exactTimeStr: '' }
      },
      thirdParty: {
        weekly: { pct: 100, resetStr: '', compactStr: '7d', exactTimeStr: '' },
        fiveH: { pct: 100, resetStr: '', compactStr: '5h', exactTimeStr: '' }
      }
    };

    data.groups.forEach(group => {
      const isGemini = group.displayName?.includes('Gemini');
      const target = isGemini ? result.gemini : result.thirdParty;

      (group.buckets || []).forEach(bucket => {
        const isWeekly = bucket.window === 'weekly';
        const frac = bucket.remaining?.case === 'remainingFraction' ? bucket.remaining.value : 1;
        const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
        const resetStr = formatResetTime(bucket.resetTime?.seconds);
        const compactStr = formatResetCompact(bucket.resetTime?.seconds, bucket.window);
        const exactTimeStr = formatExactTime(bucket.resetTime?.seconds);

        if (isWeekly) {
          target.weekly = { pct, resetStr, compactStr, exactTimeStr, desc: bucket.description };
        } else {
          target.fiveH = { pct, resetStr, compactStr, exactTimeStr, desc: bucket.description };
        }
      });
    });

    return result;
  }

  // 渲染样式 1：经典卡片 (Classic)
  function renderClassicHtml(parsed, tc) {
    const g = parsed.gemini;
    const t = parsed.thirdParty;

    const g5hColor = getPctColor(g.fiveH.pct, tc.isDark);
    const gWkColor = getPctColor(g.weekly.pct, tc.isDark);
    const t5hColor = getPctColor(t.fiveH.pct, tc.isDark);
    const tWkColor = getPctColor(t.weekly.pct, tc.isDark);

    return `
      <!-- Gemini 模型 -->
      <div style="margin-bottom: 3px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span style="font-weight: 600; color: ${tc.geminiColor}; font-size: 10.5px; display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: ${tc.geminiColor}; box-shadow: 0 0 4px ${tc.geminiColor};"></span>
            Gemini 模型
          </span>
        </div>
        <div style="margin-bottom: 3px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
            <span style="color: ${tc.textSub};">5h限额</span>
            <div>
              <span style="font-family: monospace; font-weight: 600; color: ${g5hColor};">${g.fiveH.pct}%</span>
              ${g.fiveH.resetStr ? `<span style="color: ${tc.textMuted}; font-size: 9px; margin-left: 2px;">(${g.fiveH.resetStr})</span>` : ''}
            </div>
          </div>
          <div style="width: 100%; height: 4px; background: ${tc.circleBg}; border-radius: 2px; overflow: hidden;">
            <div style="width: ${g.fiveH.pct}%; height: 100%; background: ${g5hColor}; border-radius: 2px; transition: width 0.4s ease;"></div>
          </div>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
            <span style="color: ${tc.textSub};">周限额</span>
            <div>
              <span style="font-family: monospace; font-weight: 600; color: ${gWkColor};">${g.weekly.pct}%</span>
              ${g.weekly.resetStr ? `<span style="color: ${tc.textMuted}; font-size: 9px; margin-left: 2px;">(${g.weekly.resetStr})</span>` : ''}
            </div>
          </div>
          <div style="width: 100%; height: 4px; background: ${tc.circleBg}; border-radius: 2px; overflow: hidden;">
            <div style="width: ${g.weekly.pct}%; height: 100%; background: ${gWkColor}; border-radius: 2px; transition: width 0.4s ease;"></div>
          </div>
        </div>
      </div>

      <!-- Claude / GPT 模型 -->
      <div style="border-top: 1px solid var(--sidebar-border, rgba(128,128,128,0.12)); padding-top: 5px; margin-top: 3px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span style="font-weight: 600; color: ${tc.claudeColor}; font-size: 10.5px; display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: ${tc.claudeColor}; box-shadow: 0 0 4px ${tc.claudeColor};"></span>
            Claude / GPT 模型
          </span>
        </div>
        <div style="margin-bottom: 3px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
            <span style="color: ${tc.textSub};">5h限额</span>
            <div>
              <span style="font-family: monospace; font-weight: 600; color: ${t5hColor};">${t.fiveH.pct}%</span>
              ${t.fiveH.resetStr ? `<span style="color: ${tc.textMuted}; font-size: 9px; margin-left: 2px;">(${t.fiveH.resetStr})</span>` : ''}
            </div>
          </div>
          <div style="width: 100%; height: 4px; background: ${tc.circleBg}; border-radius: 2px; overflow: hidden;">
            <div style="width: ${t.fiveH.pct}%; height: 100%; background: ${t5hColor}; border-radius: 2px; transition: width 0.4s ease;"></div>
          </div>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
            <span style="color: ${tc.textSub};">周限额</span>
            <div>
              <span style="font-family: monospace; font-weight: 600; color: ${tWkColor};">${t.weekly.pct}%</span>
              ${t.weekly.resetStr ? `<span style="color: ${tc.textMuted}; font-size: 9px; margin-left: 2px;">(${t.weekly.resetStr})</span>` : ''}
            </div>
          </div>
          <div style="width: 100%; height: 4px; background: ${tc.circleBg}; border-radius: 2px; overflow: hidden;">
            <div style="width: ${t.weekly.pct}%; height: 100%; background: ${tWkColor}; border-radius: 2px; transition: width 0.4s ease;"></div>
          </div>
        </div>
      </div>
    `;
  }

  // 渲染样式 2：极简双环 (Radial Rings)
  function renderRadialHtml(parsed, tc) {
    const g = parsed.gemini;
    const t = parsed.thirdParty;

    const circumference = 113.1;
    const g5hDash = (g.fiveH.pct / 100) * circumference;
    const gWkDash = (g.weekly.pct / 100) * (2 * Math.PI * 13.5);
    const t5hDash = (t.fiveH.pct / 100) * circumference;
    const tWkDash = (t.weekly.pct / 100) * (2 * Math.PI * 13.5);

    const gColor = getPctColor(g.fiveH.pct, tc.isDark);
    const tColor = getPctColor(t.fiveH.pct, tc.isDark);

    return `
      <div style="display: flex; align-items: center; justify-content: space-around; gap: 8px; padding: 2px 0;">
        <!-- Gemini 仪表盘 -->
        <div style="display: flex; align-items: center; gap: 7px;">
          <div style="position: relative; width: 44px; height: 44px;">
            <svg width="44" height="44" viewBox="0 0 44 44" style="transform: rotate(-90deg);">
              <circle cx="22" cy="22" r="18" fill="none" stroke="${tc.circleBg}" stroke-width="3.5" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="${gColor}" stroke-width="3.5" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference - g5hDash}" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s ease;" />
              <circle cx="22" cy="22" r="13.5" fill="none" stroke="${tc.isDark ? 'rgba(56,189,248,0.15)' : 'rgba(2,132,199,0.12)'}" stroke-width="2.5" />
              <circle cx="22" cy="22" r="13.5" fill="none" stroke="${tc.geminiColor}" stroke-width="2.5" stroke-dasharray="84.8" stroke-dashoffset="${84.8 - gWkDash}" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s ease;" />
            </svg>
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 700; color: ${gColor}; font-family: monospace;">
              ${g.fiveH.pct}%
            </div>
          </div>
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 600; font-size: 10.5px; color: ${tc.geminiColor};">Gemini</span>
            <span style="font-size: 9px; color: ${tc.textMuted};">${g.fiveH.resetStr ? g.fiveH.resetStr : '5h正常'}</span>
          </div>
        </div>

        <div style="width: 1px; height: 32px; background: var(--sidebar-border, rgba(128,128,128,0.15));"></div>

        <!-- Claude / GPT 仪表盘 -->
        <div style="display: flex; align-items: center; gap: 7px;">
          <div style="position: relative; width: 44px; height: 44px;">
            <svg width="44" height="44" viewBox="0 0 44 44" style="transform: rotate(-90deg);">
              <circle cx="22" cy="22" r="18" fill="none" stroke="${tc.circleBg}" stroke-width="3.5" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="${tColor}" stroke-width="3.5" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference - t5hDash}" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s ease;" />
              <circle cx="22" cy="22" r="13.5" fill="none" stroke="${tc.isDark ? 'rgba(192,132,252,0.15)' : 'rgba(124,58,237,0.12)'}" stroke-width="2.5" />
              <circle cx="22" cy="22" r="13.5" fill="none" stroke="${tc.claudeColor}" stroke-width="2.5" stroke-dasharray="84.8" stroke-dashoffset="${84.8 - tWkDash}" stroke-linecap="round" style="transition: stroke-dashoffset 0.5s ease;" />
            </svg>
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 700; color: ${tColor}; font-family: monospace;">
              ${t.fiveH.pct}%
            </div>
          </div>
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 600; font-size: 10.5px; color: ${tc.claudeColor};">Claude</span>
            <span style="font-size: 9px; color: ${tc.textMuted};">${t.fiveH.resetStr ? t.fiveH.resetStr : '5h正常'}</span>
          </div>
        </div>
      </div>
    `;
  }

  // 渲染样式 3：极客 HUD 科技悬浮窗 (Cyber HUD)
  function renderCyberHtml(parsed, tc) {
    const g = parsed.gemini;
    const t = parsed.thirdParty;

    const g5hColor = getPctColor(g.fiveH.pct, tc.isDark);
    const gWkColor = getPctColor(g.weekly.pct, tc.isDark);
    const t5hColor = getPctColor(t.fiveH.pct, tc.isDark);
    const tWkColor = getPctColor(t.weekly.pct, tc.isDark);

    return `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <!-- Gemini 5h -->
        <div style="background: ${tc.cyberTileGeminiBg}; border: 1px solid ${tc.cyberBorder}; border-radius: 6px; padding: 5px 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span style="font-size: 9.5px; color: ${tc.geminiColor}; font-weight: 600;">GEMINI · 5H</span>
            <span style="font-size: 8.5px; color: ${tc.textMuted};">${g.fiveH.resetStr || '充足'}</span>
          </div>
          <div style="font-size: 13px; font-weight: 800; font-family: ui-monospace, monospace; color: ${g5hColor}; margin: 1px 0;">
            ${g.fiveH.pct}%
          </div>
          <div style="width: 100%; height: 3px; background: ${tc.circleBg}; border-radius: 1.5px; overflow: hidden;">
            <div style="width: ${g.fiveH.pct}%; height: 100%; background: linear-gradient(90deg, #0284c7, ${g5hColor}); border-radius: 1.5px;"></div>
          </div>
        </div>

        <!-- Gemini 周 -->
        <div style="background: ${tc.cyberTileGeminiBg}; border: 1px solid ${tc.cyberBorder}; border-radius: 6px; padding: 5px 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span style="font-size: 9.5px; color: ${tc.geminiColor}; font-weight: 600;">GEMINI · 周</span>
            <span style="font-size: 8.5px; color: ${tc.textMuted};">${g.weekly.resetStr || '充足'}</span>
          </div>
          <div style="font-size: 13px; font-weight: 800; font-family: ui-monospace, monospace; color: ${gWkColor}; margin: 1px 0;">
            ${g.weekly.pct}%
          </div>
          <div style="width: 100%; height: 3px; background: ${tc.circleBg}; border-radius: 1.5px; overflow: hidden;">
            <div style="width: ${g.weekly.pct}%; height: 100%; background: linear-gradient(90deg, #0284c7, ${gWkColor}); border-radius: 1.5px;"></div>
          </div>
        </div>

        <!-- Claude 5h -->
        <div style="background: ${tc.cyberTileClaudeBg}; border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 6px; padding: 5px 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span style="font-size: 9.5px; color: ${tc.claudeColor}; font-weight: 600;">CLAUDE · 5H</span>
            <span style="font-size: 8.5px; color: ${tc.textMuted};">${t.fiveH.resetStr || '充足'}</span>
          </div>
          <div style="font-size: 13px; font-weight: 800; font-family: ui-monospace, monospace; color: ${t5hColor}; margin: 1px 0;">
            ${t.fiveH.pct}%
          </div>
          <div style="width: 100%; height: 3px; background: ${tc.circleBg}; border-radius: 1.5px; overflow: hidden;">
            <div style="width: ${t.fiveH.pct}%; height: 100%; background: linear-gradient(90deg, #9333ea, ${t5hColor}); border-radius: 1.5px;"></div>
          </div>
        </div>

        <!-- Claude 周 -->
        <div style="background: ${tc.cyberTileClaudeBg}; border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 6px; padding: 5px 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span style="font-size: 9.5px; color: ${tc.claudeColor}; font-weight: 600;">CLAUDE · 周</span>
            <span style="font-size: 8.5px; color: ${tc.textMuted};">${t.weekly.resetStr || '充足'}</span>
          </div>
          <div style="font-size: 13px; font-weight: 800; font-family: ui-monospace, monospace; color: ${tWkColor}; margin: 1px 0;">
            ${t.weekly.pct}%
          </div>
          <div style="width: 100%; height: 3px; background: ${tc.circleBg}; border-radius: 1.5px; overflow: hidden;">
            <div style="width: ${t.weekly.pct}%; height: 100%; background: linear-gradient(90deg, #9333ea, ${tWkColor}); border-radius: 1.5px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  // 渲染样式 4：极简背景水印 (Watermark)
  // 格式：Gemini 70% 3h30m - 90% 6d
  function renderWatermarkHtml(parsed, tc) {
    const g = parsed.gemini;
    const t = parsed.thirdParty;

    const g5hColor = getPctColor(g.fiveH.pct, tc.isDark);
    const gWkColor = getPctColor(g.weekly.pct, tc.isDark);
    const t5hColor = getPctColor(t.fiveH.pct, tc.isDark);
    const tWkColor = getPctColor(t.weekly.pct, tc.isDark);

    const g5hCompact = g.fiveH.compactStr || '5h';
    const gWkCompact = g.weekly.compactStr || '7d';
    const t5hCompact = t.fiveH.compactStr || '5h';
    const tWkCompact = t.weekly.compactStr || '7d';

    return `
      <div style="display: flex; flex-direction: column; gap: 3.5px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; letter-spacing: 0.2px;">
        <!-- Gemini 水印行 -->
        <div class="agy-watermark-row" style="display: flex; align-items: center; gap: 5px; white-space: nowrap; cursor: pointer; padding: 1.5px 3px; border-radius: 4px;">
          <span style="color: ${tc.geminiColor}; font-weight: 600;">Gemini</span>
          <span style="color: ${g5hColor}; font-weight: 700;">${g.fiveH.pct}%</span>
          <span style="color: ${tc.textSub}; font-size: 10px;">${g5hCompact}</span>
          <span style="color: ${tc.textMuted}; opacity: 0.55; margin: 0 1px;">-</span>
          <span style="color: ${gWkColor}; font-weight: 600;">${g.weekly.pct}%</span>
          <span style="color: ${tc.textSub}; font-size: 10px;">${gWkCompact}</span>
        </div>

        <!-- Claude 水印行 -->
        <div class="agy-watermark-row" style="display: flex; align-items: center; gap: 5px; white-space: nowrap; cursor: pointer; padding: 1.5px 3px; border-radius: 4px;">
          <span style="color: ${tc.claudeColor}; font-weight: 600;">Claude</span>
          <span style="color: ${t5hColor}; font-weight: 700;">${t.fiveH.pct}%</span>
          <span style="color: ${tc.textSub}; font-size: 10px;">${t5hCompact}</span>
          <span style="color: ${tc.textMuted}; opacity: 0.55; margin: 0 1px;">-</span>
          <span style="color: ${tWkColor}; font-weight: 600;">${t.weekly.pct}%</span>
          <span style="color: ${tc.textSub}; font-size: 10px;">${tWkCompact}</span>
        </div>
      </div>
    `;
  }

  // 渲染主体函数
  function renderAll() {
    applyWidgetStyle();

    const isFloating = customPos !== null;
    const currentStyle = STYLES[currentStyleIdx];
    const isWatermark = currentStyle.id === 'watermark';
    const tc = getThemeColors();

    const headerHtml = `
      <div style="display: flex; align-items: center; justify-content: space-between; cursor: grab; padding-bottom: ${isCollapsed || isWatermark ? '2px' : '4px'};" id="agy-token-header">
        <div style="display: flex; align-items: center; gap: 5px; font-weight: 600; color: ${isWatermark ? tc.textSub : tc.textMain}; font-size: ${isWatermark ? '10px' : '11px'};">
          <svg width="${isWatermark ? '11' : '13'}" height="${isWatermark ? '11' : '13'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: ${isWatermark ? (tc.isDark ? 'rgba(16, 185, 129, 0.7)' : '#059669') : '#10b981'};">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span style="letter-spacing: 0.3px;">${isWatermark ? 'TOKEN QUOTA' : 'Token 配额'}</span>
          <span style="font-size: 8.5px; padding: 0.5px 4px; border-radius: 3px; background: ${tc.badgeBg}; color: ${tc.badgeColor}; font-weight: 500;">${currentStyle.name}</span>
        </div>
        
        <div id="agy-token-btn-group" style="display: flex; align-items: center; gap: 2px;">
          ${isFloating ? `
            <button id="agy-token-reset-pos-btn" title="吸附复位至侧边栏" style="background: transparent; border: none; cursor: pointer; padding: 2px 3px; border-radius: 4px; color: ${tc.geminiColor}; display: flex; align-items: center;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
              </svg>
            </button>
          ` : ''}

          <!-- 样式切换按钮 -->
          <button id="agy-token-style-btn" title="切换显示样式 (${currentStyle.name})" style="background: transparent; border: none; cursor: pointer; padding: 2px 3px; border-radius: 4px; color: ${tc.textSub}; display: flex; align-items: center;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/>
            </svg>
          </button>

          <!-- 刷新按钮 -->
          <button id="agy-token-refresh-btn" title="立即刷新配额" style="background: transparent; border: none; cursor: pointer; padding: 2px 3px; border-radius: 4px; color: ${tc.textSub}; display: flex; align-items: center;">
            <svg id="agy-token-refresh-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.5s ease;">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </button>

          <!-- 折叠按钮 -->
          <button id="agy-token-collapse-btn" title="折叠/展开" style="background: transparent; border: none; cursor: pointer; padding: 2px 3px; border-radius: 4px; color: ${tc.textSub}; display: flex; align-items: center;">
            <svg id="agy-token-collapse-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="${isCollapsed ? '9 18 15 12 9 6' : '6 9 12 15 18 9'}"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- 余量数据内容区：点击直接触发刷新 -->
      <div id="agy-token-content" title="点击立即刷新 Token 余量" style="
        display: ${isCollapsed ? 'none' : 'flex'};
        flex-direction: column;
        gap: 3px;
        margin-top: ${isWatermark ? '2px' : '4px'};
        cursor: pointer;
        transition: transform 0.12s ease, opacity 0.15s ease;
      ">
        <!-- 内容区域 -->
      </div>
    `;

    widget.innerHTML = headerHtml;

    const contentEl = document.getElementById('agy-token-content');
    if (!contentEl) return;

    if (!cachedData) {
      contentEl.innerHTML = `<div style="color: ${tc.textMuted}; font-size: 9.5px; padding: 2px 0;">正在拉取配额...</div>`;
      return;
    }

    const parsed = parseQuotaData(cachedData);
    if (!parsed) {
      contentEl.innerHTML = '<div style="color: #ef4444; font-size: 9.5px;">暂无配额</div>';
      return;
    }

    if (currentStyle.id === 'watermark') {
      contentEl.innerHTML = renderWatermarkHtml(parsed, tc);
    } else if (currentStyle.id === 'radial') {
      contentEl.innerHTML = renderRadialHtml(parsed, tc);
    } else if (currentStyle.id === 'cyber') {
      contentEl.innerHTML = renderCyberHtml(parsed, tc);
    } else {
      contentEl.innerHTML = renderClassicHtml(parsed, tc);
    }
  }

  // 拉取配额逻辑
  let isFetching = false;
  async function fetchQuota(force = false, showNotice = false) {
    if (isFetching) return;
    const service = getCloudCodeService();
    if (!service) return;

    const icon = document.getElementById('agy-token-refresh-icon');
    if (icon) icon.style.transform = 'rotate(360deg)';
    
    // 内容区域微动反馈
    const contentEl = document.getElementById('agy-token-content');
    if (contentEl) {
      contentEl.style.opacity = '0.55';
      contentEl.style.transform = 'scale(0.985)';
    }

    isFetching = true;

    try {
      const res = await service.retrieveUserQuotaSummary(force);
      if (res?.response) {
        cachedData = res.response;
        renderAll();
        if (showNotice) {
          showToastAbove('已刷新');
        }
      }
    } catch (err) {
      console.error('[TokenMonitor] 获取配额出错:', err);
      if (showNotice) showToastAbove('刷新失败');
    } finally {
      isFetching = false;
      const curContent = document.getElementById('agy-token-content');
      if (curContent) {
        curContent.style.opacity = '1';
        curContent.style.transform = 'none';
      }
      setTimeout(() => {
        if (icon) icon.style.transform = 'none';
      }, 500);
    }
  }

  // 鼠标左键拖拽交互系统 (Drag & Drop)
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let elemStartX = 0;
  let elemStartY = 0;
  let hasMoved = false;

  function onPointerDown(e) {
    if (e.button !== 0) return; // 仅限鼠标左键
    if (e.target.closest('button')) return;

    const header = document.getElementById('agy-token-header');
    if (!header || (!header.contains(e.target) && e.target !== widget)) return;

    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = widget.getBoundingClientRect();
    elemStartX = rect.left;
    elemStartY = rect.top;

    if (header) header.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (!hasMoved && Math.hypot(dx, dy) > 3) {
      hasMoved = true;
      if (customPos === null) {
        document.body.appendChild(widget);
      }
    }

    if (hasMoved) {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const wWidth = widget.offsetWidth;
      const wHeight = widget.offsetHeight;

      let newLeft = elemStartX + dx;
      let newTop = elemStartY + dy;

      newLeft = Math.max(4, Math.min(winW - wWidth - 4, newLeft));
      newTop = Math.max(4, Math.min(winH - wHeight - 4, newTop));

      customPos = { left: Math.round(newLeft), top: Math.round(newTop) };

      widget.style.position = 'fixed';
      widget.style.left = customPos.left + 'px';
      widget.style.top = customPos.top + 'px';
      widget.style.zIndex = '99999';
      widget.style.margin = '0';
    }
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const header = document.getElementById('agy-token-header');
    if (header) header.style.cursor = 'grab';
    document.body.style.userSelect = '';

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    if (hasMoved && customPos) {
      try {
        localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(customPos));
      } catch (err) {}
      renderAll();
      showToastAbove('已保存位置');
    }
  }

  widget.addEventListener('pointerdown', onPointerDown);

  // 绑定点击事件
  widget.addEventListener('click', (e) => {
    // 1. 点击刷新小图标按钮
    if (e.target.closest('#agy-token-refresh-btn')) {
      e.stopPropagation();
      fetchQuota(true, true);
      return;
    }

    // 2. 左键点击余量文字/内容区域：立即强制刷新一次，并在组件上方显示“已刷新”
    if (e.target.closest('#agy-token-content')) {
      e.stopPropagation();
      fetchQuota(true, true);
      return;
    }

    // 3. 点击样式切换按钮
    if (e.target.closest('#agy-token-style-btn')) {
      e.stopPropagation();
      currentStyleIdx = (currentStyleIdx + 1) % STYLES.length;
      try {
        localStorage.setItem(STORAGE_KEY_STYLE, String(currentStyleIdx));
      } catch (err) {}
      renderAll();
      showToastAbove(STYLES[currentStyleIdx].name);
      return;
    }

    // 4. 点击复位至侧边栏按钮
    if (e.target.closest('#agy-token-reset-pos-btn')) {
      e.stopPropagation();
      customPos = null;
      try {
        localStorage.removeItem(STORAGE_KEY_POS);
      } catch (err) {}
      widget.remove();
      mountWidget();
      renderAll();
      showToastAbove('已复位');
      return;
    }

    // 5. 点击折叠/展开按钮
    if (e.target.closest('#agy-token-collapse-btn')) {
      e.stopPropagation();
      isCollapsed = !isCollapsed;
      try {
        localStorage.setItem(STORAGE_KEY_COLLAPSED, String(isCollapsed));
      } catch (err) {}
      renderAll();
      return;
    }
  });

  // 初次加载与挂载
  mountWidget();
  renderAll();
  fetchQuota(true, false);

  // 启动高频探测自愈（在应用刚启动的 15 秒内每 500ms 检测一次挂载和首次数据拉取）
  let initTries = 0;
  const initTimer = setInterval(() => {
    initTries++;
    const mounted = mountWidget();
    if (!cachedData) {
      fetchQuota(true, false);
    }
    if ((mounted && cachedData) || initTries >= 30) {
      clearInterval(initTimer);
    }
  }, 500);

  // 30 秒自动静默轮询
  const pollTimer = setInterval(() => {
    fetchQuota(false, false);
  }, 30000);

  // 监听主题变化与 DOM 树变化
  let lastThemeDark = isDarkTheme();
  const observer = new MutationObserver(() => {
    const nowDark = isDarkTheme();
    if (nowDark !== lastThemeDark) {
      lastThemeDark = nowDark;
      renderAll();
    }
    if (customPos === null && !document.getElementById(containerId)) {
      mountWidget();
    }
    if (!cachedData) {
      fetchQuota(true, false);
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

  window.__AGY_TOKEN_MONITOR__ = {
    destroy: () => {
      clearInterval(initTimer);
      clearInterval(pollTimer);
      observer.disconnect();
      widget.removeEventListener('pointerdown', onPointerDown);
      const el = document.getElementById(containerId);
      if (el) el.remove();
      const card = document.getElementById('agy-token-detail-card');
      if (card) card.remove();
      delete window.__AGY_TOKEN_MONITOR__;
    },
    refresh: (showNotice = true) => fetchQuota(true, showNotice),
    switchStyle: (idx) => {
      currentStyleIdx = idx % STYLES.length;
      try {
        localStorage.setItem(STORAGE_KEY_STYLE, String(currentStyleIdx));
      } catch (err) {}
      renderAll();
    },
    resetPosition: () => {
      customPos = null;
      localStorage.removeItem(STORAGE_KEY_POS);
      widget.remove();
      mountWidget();
      renderAll();
    }
  };

  return 'TOKEN_MONITOR_FADE_HEADER_READY';
})();
