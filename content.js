(() => {
  const MAX_RECENT_FILES = 10;
  const STORAGE_KEY = 'easyFilesRecentItems';

  let currentInput = null;
  let overlayRoot = null;
  let carouselOffset = 0;

  const mergeRecentItems = async (incomingItems) => {
    if (!incomingItems.length) {
      return;
    }

    const current = await loadRecentFiles();
    const merged = [...incomingItems, ...current].reduce((acc, item) => {
      if (!acc.some((entry) => entry.id === item.id)) {
        acc.push(item);
      }
      return acc;
    }, []);

    await saveRecentFiles(merged);
  };

  const loadRecentFiles = async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  };

  const saveRecentFiles = async (items) => {
    await chrome.storage.local.set({ [STORAGE_KEY]: items.slice(0, MAX_RECENT_FILES) });
  };

  const fileToRecentItem = async (file) => {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    return {
      id: `${file.name}-${file.lastModified}-${file.size}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified,
      savedAt: Date.now(),
      dataUrl
    };
  };

  const humanFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }

    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  };

  const ensureOverlayRoot = () => {
    if (overlayRoot) {
      return overlayRoot;
    }

    overlayRoot = document.createElement('div');
    overlayRoot.className = 'easy-files-root';
    overlayRoot.innerHTML = `
      <style>
        .easy-files-root {
          position: fixed;
          z-index: 2147483646;
          display: none;
          font-family: Inter, Segoe UI, Roboto, sans-serif;
          color: #ebeffa;
          width: min(760px, calc(100vw - 20px));
        }

        .easy-files-panel {
          border: 1px solid rgba(145, 160, 207, 0.28);
          border-radius: 14px;
          background: #211f4a;
          box-shadow: 0 24px 46px rgba(0, 0, 0, 0.45);
          padding: 16px;
          display: grid;
          gap: 14px;
        }

        .easy-files-topbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          margin-bottom: -8px;
        }

        .easy-files-action {
          border: none;
          background: transparent;
          color: #ccd3ff;
          font-size: 16px;
          cursor: pointer;
          width: 24px;
          height: 24px;
          border-radius: 999px;
        }

        .easy-files-action:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .easy-files-content {
          display: grid;
          grid-template-columns: 168px 1fr;
          gap: 16px;
        }

        .easy-files-transfer-title,
        .easy-files-recent-title {
          margin: 0 0 8px;
          font-size: 0.8rem;
          font-weight: 700;
          color: #f0f2ff;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .easy-files-drop {
          width: 128px;
          height: 128px;
          border-radius: 8px;
          border: 1px solid rgba(198, 206, 242, 0.34);
          background: #d6d7de;
          background-image: url("${chrome.runtime.getURL('assets/easy-files-hero.svg')}");
          background-size: cover;
          background-position: center;
          overflow: hidden;
          display: grid;
          place-items: end center;
          position: relative;
        }

        .easy-files-drop::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(17, 20, 48, 0.1) 0%, rgba(17, 20, 48, 0.76) 100%);
        }

        .easy-files-drop-label {
          position: relative;
          z-index: 1;
          margin: 0 8px 8px;
          font-size: 0.67rem;
          color: #f2f4ff;
          background: rgba(17, 20, 48, 0.75);
          border: 1px solid rgba(198, 206, 242, 0.28);
          border-radius: 6px;
          padding: 4px 6px;
          text-align: center;
        }

        .easy-files-right {
          min-width: 0;
          display: grid;
          gap: 12px;
        }

        .easy-files-carousel-row {
          display: grid;
          grid-template-columns: 28px 1fr 28px;
          align-items: center;
          gap: 8px;
        }

        .easy-files-nav {
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #c4cbff;
          font-size: 20px;
          cursor: pointer;
          height: 34px;
        }

        .easy-files-nav:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .easy-files-track {
          overflow: hidden;
        }

        .easy-files-list {
          display: flex;
          align-items: stretch;
          gap: 12px;
          transition: transform 180ms ease;
          will-change: transform;
        }

        .easy-files-card {
          min-width: 128px;
          max-width: 128px;
          border: none;
          background: transparent;
          color: #f5f7ff;
          text-align: left;
          cursor: pointer;
          padding: 0;
        }

        .easy-files-thumb {
          width: 128px;
          height: 92px;
          border-radius: 8px;
          object-fit: cover;
          background: #14152f;
          border: 1px solid rgba(198, 206, 242, 0.2);
        }

        .easy-files-fallback {
          width: 128px;
          height: 92px;
          border-radius: 8px;
          background: linear-gradient(180deg, #3a3f7e 0%, #22265a 100%);
          display: grid;
          place-items: center;
          font-weight: 700;
          color: #e6e9ff;
          border: 1px solid rgba(198, 206, 242, 0.2);
        }

        .easy-files-name {
          margin-top: 6px;
          font-size: 0.83rem;
          line-height: 1.25;
          color: #e5eaff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .easy-files-meta {
          margin-top: 2px;
          font-size: 0.72rem;
          color: #a9b0df;
        }

        .easy-files-footer {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-top: 2px;
        }

        .easy-files-btn {
          border: 1px solid rgba(97, 114, 255, 0.65);
          border-radius: 8px;
          padding: 10px 18px;
          color: #e7ecff;
          background: linear-gradient(180deg, #313bff 0%, #2217bd 100%);
          font-weight: 600;
          cursor: pointer;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
        }

        .easy-files-empty {
          color: #b3bbe9;
          font-size: 0.9rem;
          padding: 8px;
        }
      </style>
      <div class="easy-files-panel" role="dialog" aria-label="Easy Files anchored overlay">
        <div class="easy-files-topbar">
          <button class="easy-files-action" type="button" data-action="clear" title="Clear recent files">⟳</button>
          <button class="easy-files-action" type="button" data-action="close" title="Close">×</button>
        </div>
        <div class="easy-files-content">
          <div>
            <h3 class="easy-files-transfer-title">Área de Transferência</h3>
            <div class="easy-files-drop" title="Pressione Ctrl+V para colar">
              <p class="easy-files-drop-label">Ctrl+V aqui</p>
            </div>
          </div>
          <div class="easy-files-right">
            <h3 class="easy-files-recent-title">Transferido</h3>
            <div class="easy-files-carousel-row">
              <button class="easy-files-nav" type="button" data-action="prev">‹</button>
              <div class="easy-files-track"><div class="easy-files-list"></div></div>
              <button class="easy-files-nav" type="button" data-action="next">›</button>
            </div>
          </div>
        </div>
        <div class="easy-files-footer">
          <button class="easy-files-btn" type="button" data-action="choose">Mostrar todos os arquivos</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlayRoot);

    overlayRoot.querySelector('[data-action="close"]').addEventListener('click', closeOverlay);

    overlayRoot.querySelector('[data-action="choose"]').addEventListener('click', () => {
      const target = currentInput;
      closeOverlay();
      if (!target) {
        return;
      }
      target.dataset.easyFilesBypass = '1';
      target.click();
      delete target.dataset.easyFilesBypass;
    });

    overlayRoot.querySelector('[data-action="clear"]').addEventListener('click', async () => {
      await saveRecentFiles([]);
      carouselOffset = 0;
      await renderRecentFiles();
    });

    overlayRoot.querySelector('[data-action="prev"]').addEventListener('click', () => {
      carouselOffset = Math.max(0, carouselOffset - 1);
      updateCarouselPosition();
    });

    overlayRoot.querySelector('[data-action="next"]').addEventListener('click', () => {
      carouselOffset += 1;
      updateCarouselPosition();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlayRoot.style.display === 'block') {
        closeOverlay();
      }
    });

    document.addEventListener('mousedown', (event) => {
      if (!overlayRoot || overlayRoot.style.display !== 'block') {
        return;
      }
      if (!overlayRoot.contains(event.target) && !currentInput?.contains(event.target)) {
        closeOverlay();
      }
    }, true);

    window.addEventListener('resize', positionOverlay);
    window.addEventListener('scroll', positionOverlay, true);
    document.addEventListener('paste', (event) => {
      handleClipboardPaste(event).catch(() => {
        // Ignore clipboard read issues to avoid breaking host pages.
      });
    }, true);

    return overlayRoot;
  };

  const guessExtension = (name) => {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
  };

  const updateCarouselPosition = () => {
    if (!overlayRoot) {
      return;
    }

    const list = overlayRoot.querySelector('.easy-files-list');
    const cards = Array.from(list.children);
    const prev = overlayRoot.querySelector('[data-action="prev"]');
    const next = overlayRoot.querySelector('[data-action="next"]');
    const maxVisible = 4;
    const maxOffset = Math.max(0, cards.length - maxVisible);
    carouselOffset = Math.min(carouselOffset, maxOffset);

    const shift = carouselOffset * 140;
    list.style.transform = `translateX(${-shift}px)`;

    prev.disabled = carouselOffset === 0;
    next.disabled = carouselOffset >= maxOffset;
  };

  const renderRecentFiles = async () => {
    const root = ensureOverlayRoot();
    const list = root.querySelector('.easy-files-list');
    const items = await loadRecentFiles();

    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'easy-files-empty';
      empty.textContent = 'Sem arquivos recentes ainda.';
      list.appendChild(empty);
      root.querySelector('[data-action="prev"]').disabled = true;
      root.querySelector('[data-action="next"]').disabled = true;
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'easy-files-card';

      const isImage = typeof item.type === 'string' && item.type.startsWith('image/');
      card.innerHTML = `
        ${isImage
    ? `<img class="easy-files-thumb" src="${item.dataUrl}" alt="${item.name}">`
    : `<div class="easy-files-fallback">${guessExtension(item.name)}</div>`}
        <div class="easy-files-name">${item.name}</div>
        <div class="easy-files-meta">${humanFileSize(item.size)}</div>
      `;

      card.addEventListener('click', async () => {
        if (!currentInput) {
          return;
        }

        const response = await fetch(item.dataUrl);
        const blob = await response.blob();
        const file = new File([blob], item.name, {
          type: item.type,
          lastModified: item.lastModified
        });

        const transfer = new DataTransfer();
        transfer.items.add(file);
        currentInput.files = transfer.files;
        currentInput.dispatchEvent(new Event('change', { bubbles: true }));
        closeOverlay();
      });

      list.appendChild(card);
    });

    updateCarouselPosition();
  };

  const updateTransferArea = (file) => {
    const drop = overlayRoot?.querySelector('.easy-files-drop');
    if (!drop) {
      return;
    }

    const baseUrl = chrome.runtime.getURL('assets/easy-files-hero.svg');
    if (!file) {
      drop.style.backgroundImage = `url("${baseUrl}")`;
      drop.querySelector('.easy-files-drop-label').textContent = 'Ctrl+V aqui';
      return;
    }

    if (typeof file.type === 'string' && file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file);
      drop.style.backgroundImage = `url("${objectUrl}")`;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 3500);
    } else {
      drop.style.backgroundImage = `url("${baseUrl}")`;
    }

    drop.querySelector('.easy-files-drop-label').textContent = file.name;
  };

  const handleClipboardPaste = async (event) => {
    if (!overlayRoot || overlayRoot.style.display !== 'block' || !currentInput) {
      return;
    }

    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const files = clipboardItems
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);

    if (!files.length) {
      return;
    }

    event.preventDefault();

    const mapped = await Promise.all(files.map(fileToRecentItem));
    await mergeRecentItems(mapped);
    carouselOffset = 0;
    updateTransferArea(files[0]);
    await renderRecentFiles();
  };

  const positionOverlay = () => {
    if (!currentInput || !overlayRoot || overlayRoot.style.display !== 'block') {
      return;
    }

    const rect = currentInput.getBoundingClientRect();
    const gap = 10;
    const panelWidth = Math.min(760, window.innerWidth - 20);
    let left = rect.left;
    let top = rect.bottom + gap;

    if (left + panelWidth > window.innerWidth - 10) {
      left = window.innerWidth - panelWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    const estimatedHeight = 280;
    if (top + estimatedHeight > window.innerHeight - 10) {
      top = rect.top - estimatedHeight - gap;
    }
    if (top < 10) {
      top = 10;
    }

    overlayRoot.style.left = `${left}px`;
    overlayRoot.style.top = `${top}px`;
  };

  const openOverlayForInput = async (input) => {
    currentInput = input;
    carouselOffset = 0;
    ensureOverlayRoot();
    updateTransferArea();
    await renderRecentFiles();
    overlayRoot.style.display = 'block';
    positionOverlay();
  };

  const closeOverlay = () => {
    if (!overlayRoot) {
      return;
    }
    overlayRoot.style.display = 'none';
    currentInput = null;
  };

  const rememberFileSelection = async (input) => {
    if (!input?.files?.length) {
      return;
    }

    const mapped = await Promise.all(Array.from(input.files).map(fileToRecentItem));
    await mergeRecentItems(mapped);
  };

  document.addEventListener('click', (event) => {
    const input = event.target.closest('input[type="file"]');
    if (!input || input.disabled || input.dataset.easyFilesBypass === '1') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openOverlayForInput(input);
  }, true);

  document.addEventListener('change', (event) => {
    const input = event.target.closest('input[type="file"]');
    if (!input) {
      return;
    }

    rememberFileSelection(input).catch(() => {
      // If a file can't be read we silently skip storage to avoid breaking upload flows.
    });
  }, true);
})();
