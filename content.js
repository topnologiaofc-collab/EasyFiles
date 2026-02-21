(() => {
  const MAX_RECENT_FILES = 8;
  const STORAGE_KEY = 'easyFilesRecentItems';

  let currentInput = null;
  let modalRoot = null;

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
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const extFromName = (name) => {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
  };

  const ensureModalRoot = () => {
    if (modalRoot) {
      return modalRoot;
    }

    modalRoot = document.createElement('div');
    modalRoot.className = 'easy-files-root';
    modalRoot.innerHTML = `
      <style>
        .easy-files-root {
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          display: none;
          align-items: center;
          justify-content: center;
          font-family: Inter, Segoe UI, Roboto, sans-serif;
          color: #ebeffa;
        }

        .easy-files-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(8, 11, 18, 0.72);
          backdrop-filter: blur(5px);
        }

        .easy-files-panel {
          position: relative;
          width: min(900px, calc(100vw - 32px));
          max-height: min(720px, calc(100vh - 32px));
          background: linear-gradient(180deg, #252a36 0%, #181c25 100%);
          border: 1px solid rgba(151, 166, 196, 0.2);
          border-radius: 20px;
          box-shadow: 0 24px 66px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .easy-files-header {
          padding: 18px 22px;
          border-bottom: 1px solid rgba(151, 166, 196, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(8, 11, 18, 0.25);
        }

        .easy-files-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 650;
          color: #f0f4ff;
        }

        .easy-files-close {
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: #d9e2f5;
          border-radius: 999px;
          width: 34px;
          height: 34px;
          cursor: pointer;
          font-size: 18px;
        }

        .easy-files-body {
          padding: 18px 22px 24px;
          overflow: auto;
          display: grid;
          gap: 18px;
        }

        .easy-files-hero {
          width: 100%;
          border-radius: 15px;
          border: 1px solid rgba(151, 166, 196, 0.22);
        }

        .easy-files-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .easy-files-btn {
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
          font-weight: 600;
          cursor: pointer;
        }

        .easy-files-btn-primary {
          color: #141925;
          background: linear-gradient(90deg, #7af9c6 0%, #6ea0ff 100%);
        }

        .easy-files-btn-muted {
          background: rgba(255, 255, 255, 0.08);
          color: #d9e2f5;
        }

        .easy-files-section-title {
          margin: 0;
          font-size: 0.96rem;
          font-weight: 620;
          color: #c9d5f0;
        }

        .easy-files-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }

        .easy-files-card {
          border: 1px solid rgba(151, 166, 196, 0.2);
          background: rgba(7, 10, 16, 0.42);
          border-radius: 12px;
          padding: 12px;
          display: grid;
          gap: 8px;
          cursor: pointer;
          transition: transform 120ms ease, border-color 120ms ease;
        }

        .easy-files-card:hover {
          border-color: rgba(122, 249, 198, 0.6);
          transform: translateY(-1px);
        }

        .easy-files-ext {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #141925;
          background: linear-gradient(90deg, #77f8c5 0%, #759eff 100%);
          width: fit-content;
          border-radius: 999px;
          padding: 4px 8px;
        }

        .easy-files-name {
          font-size: 0.87rem;
          line-height: 1.3;
          color: #ecf2ff;
          word-break: break-word;
        }

        .easy-files-meta {
          font-size: 0.74rem;
          color: #a7b4ce;
        }

        .easy-files-empty {
          border: 1px dashed rgba(151, 166, 196, 0.32);
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          color: #a7b4ce;
          background: rgba(8, 11, 18, 0.3);
        }
      </style>
      <div class="easy-files-backdrop"></div>
      <div class="easy-files-panel" role="dialog" aria-modal="true" aria-label="Easy Files">
        <div class="easy-files-header">
          <h2 class="easy-files-title">Easy Files</h2>
          <button class="easy-files-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="easy-files-body">
          <img class="easy-files-hero" alt="Easy Files banner" />
          <div class="easy-files-actions">
            <button class="easy-files-btn easy-files-btn-primary" type="button" data-action="choose">Choose from device</button>
            <button class="easy-files-btn easy-files-btn-muted" type="button" data-action="clear">Clear recent files</button>
          </div>
          <h3 class="easy-files-section-title">Recent Files</h3>
          <div class="easy-files-grid"></div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(modalRoot);

    modalRoot.querySelector('.easy-files-hero').src = chrome.runtime.getURL('assets/easy-files-hero.svg');

    modalRoot.querySelector('.easy-files-backdrop').addEventListener('click', closeModal);
    modalRoot.querySelector('.easy-files-close').addEventListener('click', closeModal);

    modalRoot.querySelector('[data-action="choose"]').addEventListener('click', async () => {
      const target = currentInput;
      closeModal();
      if (!target) {
        return;
      }
      target.dataset.easyFilesBypass = '1';
      target.click();
      delete target.dataset.easyFilesBypass;
    });

    modalRoot.querySelector('[data-action="clear"]').addEventListener('click', async () => {
      await saveRecentFiles([]);
      await renderRecentFiles();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modalRoot && modalRoot.style.display === 'flex') {
        closeModal();
      }
    });

    return modalRoot;
  };

  const renderRecentFiles = async () => {
    const root = ensureModalRoot();
    const grid = root.querySelector('.easy-files-grid');
    const items = await loadRecentFiles();

    grid.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'easy-files-empty';
      empty.textContent = 'No recent files yet. Pick one from your device and it will show up here.';
      grid.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'easy-files-card';
      card.innerHTML = `
        <span class="easy-files-ext">${extFromName(item.name)}</span>
        <span class="easy-files-name">${item.name}</span>
        <span class="easy-files-meta">${humanFileSize(item.size)}</span>
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
        closeModal();
      });

      grid.appendChild(card);
    });
  };

  const openModalForInput = async (input) => {
    currentInput = input;
    await renderRecentFiles();
    ensureModalRoot().style.display = 'flex';
  };

  const closeModal = () => {
    if (!modalRoot) {
      return;
    }
    modalRoot.style.display = 'none';
    currentInput = null;
  };

  const rememberFileSelection = async (input) => {
    if (!input?.files?.length) {
      return;
    }

    const mapped = await Promise.all(Array.from(input.files).map(fileToRecentItem));
    const current = await loadRecentFiles();

    const merged = [...mapped, ...current].reduce((acc, item) => {
      if (!acc.some((entry) => entry.id === item.id)) {
        acc.push(item);
      }
      return acc;
    }, []);

    await saveRecentFiles(merged);
  };

  document.addEventListener('click', (event) => {
    const input = event.target.closest('input[type="file"]');
    if (!input || input.disabled || input.dataset.easyFilesBypass === '1') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openModalForInput(input);
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
