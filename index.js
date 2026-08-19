// Multi Theme Importer
// UI Theme 패널에 "여러 테마 한 번에 임포트" 버튼을 추가한다.
//
// 핵심 기능:
// - 여러 .json 테마 파일을 한 번에 선택
// - 저장 전에 각 테마를 실시간으로 "미리보기" (새로고침 불필요)
// - 저장 전에 이름을 원하는 대로 수정 (예: 중국어 원본 이름 -> 한국어 이름)
// - 확인한 것만 골라서 서버에 저장 (/api/themes/save, 코어와 동일한 API)
// - 목록 창은 화면을 가리지 않는 "플로팅 패널" (드래그로 위치 이동 가능,
//   모달이 아니므로 뒤에 있는 채팅창을 계속 보면서 미리보기를 확인할 수 있음)
//
// 주의: SillyTavern 코어는 테마 목록을 항상 "파일명 알파벳순"으로 서버에서
// 정렬해서 내려줍니다(코어 서버 코드에 fs.readdirSync(...).sort()로 박혀있음).
// 이건 확장에서 바꿀 수 없는 부분이라, "최근 임포트순 정렬"은 코어 드롭다운이
// 아니라 이 확장의 임포트 목록 화면에서 제공합니다. 대신 저장 전에 미리보기 +
// 이름 변경까지 끝낼 수 있어서, 저장 후 알파벳순 목록에서 새 테마를 찾아
// 헤맬 일 자체가 줄어듭니다.

const MODULE_NAME = 'multi_theme_importer';
const BUTTON_ID = 'multi_theme_import_button';
const FILE_INPUT_ID = 'multi_theme_import_file';
const CUSTOM_STYLE_ID = 'custom-style';
const FLOATING_PANEL_ID = 'multi_theme_import_panel';

// 테마 미리보기에 사용하는 CSS 변수 목록 (SillyTavern 코어 applyThemeColor와 동일)
const THEME_CSS_VARS = [
    '--SmartThemeBodyColor',
    '--SmartThemeEmColor',
    '--SmartThemeUnderlineColor',
    '--SmartThemeQuoteColor',
    '--SmartThemeBlurTintColor',
    '--SmartThemeChatTintColor',
    '--SmartThemeUserMesBlurTintColor',
    '--SmartThemeBotMesBlurTintColor',
    '--SmartThemeShadowColor',
    '--SmartThemeBorderColor',
    '--blurStrength',
    '--shadowWidth',
];

/**
 * 현재 화면에 적용되어 있는 테마 관련 CSS 값을 스냅샷으로 저장한다.
 * (미리보기를 취소했을 때 원래 상태로 되돌리기 위함)
 */
function snapshotCurrentStyle() {
    const root = document.documentElement;
    const snapshot = {};
    for (const name of THEME_CSS_VARS) {
        snapshot[name] = root.style.getPropertyValue(name);
    }
    const styleEl = document.getElementById(CUSTOM_STYLE_ID);
    snapshot.customCss = styleEl ? styleEl.innerHTML : '';
    const metaThemeColor = document.querySelector('meta[name=theme-color]');
    snapshot.metaThemeColor = metaThemeColor ? metaThemeColor.getAttribute('content') : null;
    return snapshot;
}

/** 스냅샷으로 저장해둔 상태로 화면을 되돌린다. */
function restoreStyle(snapshot) {
    const root = document.documentElement;
    for (const name of THEME_CSS_VARS) {
        const value = snapshot[name];
        if (value) {
            root.style.setProperty(name, value);
        } else {
            root.style.removeProperty(name);
        }
    }
    const styleEl = document.getElementById(CUSTOM_STYLE_ID);
    if (styleEl) {
        styleEl.innerHTML = snapshot.customCss || '';
    }
    const metaThemeColor = document.querySelector('meta[name=theme-color]');
    if (metaThemeColor && snapshot.metaThemeColor) {
        metaThemeColor.setAttribute('content', snapshot.metaThemeColor);
    }
}

/**
 * 테마 객체를 실제로 화면에 즉시 적용해서 미리 보여준다.
 * SillyTavern 코어의 applyTheme()과 달리, 서버 저장이나 새로고침 없이
 * 색상/커스텀 CSS만 화면에 바로 반영한다.
 * @param {object} theme
 */
function previewTheme(theme) {
    const root = document.documentElement;
    const setVar = (name, value) => {
        if (value) root.style.setProperty(name, value);
    };

    setVar('--SmartThemeBodyColor', theme.main_text_color);
    if (theme.main_text_color && theme.main_text_color.includes('(')) {
        try {
            const color = theme.main_text_color.split('(')[1].split(')')[0].split(',');
            root.style.setProperty('--SmartThemeCheckboxBgColorR', color[0]);
            root.style.setProperty('--SmartThemeCheckboxBgColorG', color[1]);
            root.style.setProperty('--SmartThemeCheckboxBgColorB', color[2]);
            root.style.setProperty('--SmartThemeCheckboxBgColorA', color[3]);
        } catch (error) {
            // 색상 형식이 예상과 다르면 체크박스 색상 미리보기는 건너뛴다.
        }
    }

    setVar('--SmartThemeEmColor', theme.italics_text_color);
    setVar('--SmartThemeUnderlineColor', theme.underline_text_color);
    setVar('--SmartThemeQuoteColor', theme.quote_text_color);
    setVar('--SmartThemeShadowColor', theme.shadow_color);
    setVar('--SmartThemeBorderColor', theme.border_color);
    setVar('--SmartThemeChatTintColor', theme.chat_tint_color);
    setVar('--SmartThemeUserMesBlurTintColor', theme.user_mes_blur_tint_color);
    setVar('--SmartThemeBotMesBlurTintColor', theme.bot_mes_blur_tint_color);

    if (theme.blur_tint_color) {
        root.style.setProperty('--SmartThemeBlurTintColor', theme.blur_tint_color);
        const metaThemeColor = document.querySelector('meta[name=theme-color]');
        if (metaThemeColor) metaThemeColor.setAttribute('content', theme.blur_tint_color);
    }

    if (typeof theme.blur_strength !== 'undefined') {
        root.style.setProperty('--blurStrength', String(theme.blur_strength));
    }
    if (typeof theme.shadow_width !== 'undefined') {
        root.style.setProperty('--shadowWidth', String(theme.shadow_width));
    }

    let styleEl = document.getElementById(CUSTOM_STYLE_ID);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = CUSTOM_STYLE_ID;
        document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = theme.custom_css || '';

    toastr.info(`'${theme.name || '(이름 없음)'}' 미리보기를 적용했습니다.`, '테마 미리보기', { timeOut: 2500 });
}

/**
 * 파일 하나를 읽어서 JSON으로 파싱한다.
 * @param {File} file
 */
async function readThemeFile(file) {
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        return { file, parsed, error: null };
    } catch (error) {
        return { file, parsed: null, error: 'JSON 파싱 실패' };
    }
}

function hasCustomCssImport(parsed) {
    return !!(parsed && typeof parsed.custom_css === 'string' && parsed.custom_css.includes('@import'));
}

/**
 * 선택된 파일들을 파싱해서, 미리보기/이름수정/저장을 할 수 있는 패널을 띄운다.
 * @param {File[]} fileArray
 */
async function openImportPanel(fileArray) {
    const files = fileArray.filter(f => f.name.toLowerCase().endsWith('.json'));
    if (files.length === 0) {
        toastr.warning('.json 테마 파일을 선택해주세요.', '다중 테마 임포트');
        return;
    }

    const context = SillyTavern.getContext();
    const { getRequestHeaders } = context;

    // 기존에 열려있던 패널이 있으면 닫는다 (중복 방지)
    closeExistingPanel();

    const parsedItems = await Promise.all(files.map(readThemeFile));

    // 화면에 보여줄 항목 상태. importOrder는 선택한 파일 순서(=최신순)를 유지하기 위함.
    const rows = parsedItems.map((item, index) => ({
        importOrder: index,
        fileName: item.file.name,
        parsed: item.parsed,
        error: item.error,
        draftName: item.parsed && item.parsed.name ? item.parsed.name : '',
        include: true, // 기본적으로 전체 체크 (원치 않는 것만 체크 해제)
        saved: false,
        saveError: null,
    }));

    const styleSnapshot = snapshotCurrentStyle();

    // ---- DOM 구성 (모달이 아니라 화면 위에 떠 있는 패널) ----
    const container = document.createElement('div');
    container.id = FLOATING_PANEL_ID;
    container.classList.add('multi-theme-import-panel');
    Object.assign(container.style, {
        position: 'fixed',
        top: '60px',
        right: '20px',
        width: '380px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--SmartThemeBlurTintColor, #1e1e1e)',
        border: '1px solid var(--SmartThemeBorderColor, #555)',
        borderRadius: '10px',
        boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
        zIndex: '9999',
        padding: '0.6em',
        overflow: 'hidden',
    });

    // 드래그로 위치를 옮길 수 있는 헤더
    const dragHandle = document.createElement('div');
    Object.assign(dragHandle.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'move',
        userSelect: 'none',
        marginBottom: '0.4em',
    });

    const header = document.createElement('h3');
    header.style.margin = '0';
    header.style.fontSize = '1em';
    header.textContent = `테마 일괄 임포트 (${rows.length}개 파일)`;
    dragHandle.appendChild(header);

    const closeBtn = document.createElement('div');
    closeBtn.className = 'menu_button menu_button_icon';
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.title = '패널 닫기 (미리보기는 유지됩니다)';
    // 드래그 핸들러가 이 버튼의 클릭을 "드래그 시작"으로 가로채지 않도록 막는다.
    closeBtn.addEventListener('pointerdown', (event) => event.stopPropagation());
    dragHandle.appendChild(closeBtn);

    container.appendChild(dragHandle);
    makeDraggable(container, dragHandle);

    const hint = document.createElement('div');
    hint.style.opacity = '0.75';
    hint.style.fontSize = '0.9em';
    hint.style.marginBottom = '0.5em';
    hint.textContent = '기본적으로 전체 선택되어 있습니다. 미리보기로 확인하고, 이름을 바꾸고, 원치 않는 항목만 체크 해제한 뒤 저장하세요.';
    container.appendChild(hint);

    const sortRow = document.createElement('div');
    sortRow.style.display = 'flex';
    sortRow.style.flexWrap = 'wrap';
    sortRow.style.gap = '0.5em';
    sortRow.style.marginBottom = '0.5em';

    const sortLabel = document.createElement('span');
    sortLabel.textContent = '정렬:';
    sortRow.appendChild(sortLabel);

    let currentSort = 'imported'; // 'imported' | 'name'

    const sortImportedBtn = document.createElement('div');
    sortImportedBtn.className = 'menu_button menu_button_icon';
    sortImportedBtn.textContent = '가져온 순서';

    const sortNameBtn = document.createElement('div');
    sortNameBtn.className = 'menu_button menu_button_icon';
    sortNameBtn.textContent = '이름순';

    sortRow.appendChild(sortImportedBtn);
    sortRow.appendChild(sortNameBtn);

    const selectAllBtn = document.createElement('div');
    selectAllBtn.className = 'menu_button menu_button_icon';
    selectAllBtn.textContent = '전체 선택';
    selectAllBtn.addEventListener('click', () => {
        for (const row of rows) {
            if (row.parsed && row.parsed.name && !row.saved) row.include = true;
        }
        renderRows();
    });

    const selectNoneBtn = document.createElement('div');
    selectNoneBtn.className = 'menu_button menu_button_icon';
    selectNoneBtn.textContent = '전체 해제';
    selectNoneBtn.addEventListener('click', () => {
        for (const row of rows) {
            if (!row.saved) row.include = false;
        }
        renderRows();
    });

    sortRow.appendChild(selectAllBtn);
    sortRow.appendChild(selectNoneBtn);
    container.appendChild(sortRow);

    const listEl = document.createElement('div');
    listEl.style.display = 'flex';
    listEl.style.flexDirection = 'column';
    listEl.style.gap = '0.4em';
    listEl.style.flex = '1';
    listEl.style.overflowY = 'auto';
    listEl.style.minHeight = '0';
    container.appendChild(listEl);

    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.flexWrap = 'wrap';
    footer.style.gap = '0.5em';
    footer.style.marginTop = '0.75em';
    footer.style.alignItems = 'center';
    footer.style.flexShrink = '0';

    const saveAllBtn = document.createElement('div');
    saveAllBtn.className = 'menu_button menu_button_icon';
    saveAllBtn.textContent = '체크한 항목 저장';

    const restoreBtn = document.createElement('div');
    restoreBtn.className = 'menu_button menu_button_icon';
    restoreBtn.textContent = '미리보기 취소 (원래대로)';

    const statusEl = document.createElement('span');
    statusEl.style.opacity = '0.8';

    footer.appendChild(saveAllBtn);
    footer.appendChild(restoreBtn);
    footer.appendChild(statusEl);
    container.appendChild(footer);

    function renderRows() {
        listEl.innerHTML = '';

        const sorted = [...rows].sort((a, b) => {
            if (currentSort === 'name') {
                return (a.draftName || a.fileName).localeCompare(b.draftName || b.fileName, 'ko');
            }
            return a.importOrder - b.importOrder;
        });

        for (const row of sorted) {
            const rowEl = document.createElement('div');
            rowEl.style.display = 'flex';
            rowEl.style.gap = '0.5em';
            rowEl.style.alignItems = 'center';
            rowEl.style.padding = '0.3em';
            rowEl.style.border = '1px solid var(--SmartThemeBorderColor, #444)';
            rowEl.style.borderRadius = '6px';
            rowEl.style.flexWrap = 'wrap';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = row.include;
            checkbox.disabled = !row.parsed || !row.parsed.name || row.saved;
            checkbox.addEventListener('change', () => {
                row.include = checkbox.checked;
            });
            rowEl.appendChild(checkbox);

            if (!row.parsed) {
                const errEl = document.createElement('span');
                errEl.textContent = `${row.fileName} - 오류: ${row.error}`;
                errEl.style.color = 'tomato';
                rowEl.appendChild(errEl);
                listEl.appendChild(rowEl);
                continue;
            }

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = row.draftName;
            nameInput.placeholder = '테마 이름';
            nameInput.style.flex = '1';
            nameInput.style.minWidth = '100px';
            nameInput.disabled = row.saved;
            nameInput.addEventListener('input', () => {
                row.draftName = nameInput.value;
            });
            rowEl.appendChild(nameInput);

            if (hasCustomCssImport(row.parsed)) {
                const warn = document.createElement('span');
                warn.textContent = '⚠ @import 포함';
                warn.title = '이 테마의 커스텀 CSS에는 외부 리소스를 불러오는 @import 구문이 포함되어 있습니다.';
                warn.style.color = 'orange';
                warn.style.fontSize = '0.85em';
                rowEl.appendChild(warn);
            }

            const previewBtn = document.createElement('div');
            previewBtn.className = 'menu_button menu_button_icon';
            previewBtn.textContent = '미리보기';
            previewBtn.addEventListener('click', () => previewTheme(row.parsed));
            rowEl.appendChild(previewBtn);

            const rowStatus = document.createElement('span');
            rowStatus.style.minWidth = '4em';
            rowStatus.style.fontSize = '0.85em';
            if (row.saved) {
                rowStatus.textContent = '✅ 저장됨';
                rowStatus.style.color = 'lightgreen';
            } else if (row.saveError) {
                rowStatus.textContent = `❌ ${row.saveError}`;
                rowStatus.style.color = 'tomato';
            }
            rowEl.appendChild(rowStatus);

            listEl.appendChild(rowEl);
        }
    }

    sortImportedBtn.addEventListener('click', () => {
        currentSort = 'imported';
        renderRows();
    });
    sortNameBtn.addEventListener('click', () => {
        currentSort = 'name';
        renderRows();
    });

    saveAllBtn.addEventListener('click', async () => {
        const headers = getRequestHeaders();
        const targets = rows.filter(r => r.parsed && r.include && !r.saved);

        if (targets.length === 0) {
            toastr.warning('저장할 항목을 체크해주세요.', '다중 테마 임포트');
            return;
        }

        statusEl.textContent = '저장 중...';
        let successCount = 0;
        let errorCount = 0;

        for (const row of targets) {
            const name = (row.draftName || '').trim();
            if (!name) {
                row.saveError = '이름 없음';
                errorCount++;
                continue;
            }

            try {
                const payload = { ...row.parsed, name };
                const response = await fetch('/api/themes/save', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    row.saveError = `서버 오류 (${response.status})`;
                    errorCount++;
                    continue;
                }

                row.saved = true;
                successCount++;
            } catch (error) {
                row.saveError = String(error);
                errorCount++;
            }
        }

        renderRows();

        statusEl.textContent = `성공 ${successCount}개 · 실패 ${errorCount}개`;
        if (successCount > 0) {
            toastr.success(
                `${successCount}개 저장 완료. 다음에 새로고침하면 테마 목록에 나타납니다.`,
                '다중 테마 임포트',
            );
        }
        if (errorCount > 0) {
            toastr.error(`${errorCount}개 저장 실패`, '다중 테마 임포트');
        }
    });

    restoreBtn.addEventListener('click', () => {
        restoreStyle(styleSnapshot);
        toastr.info('미리보기 적용 전 상태로 되돌렸습니다.', '테마 미리보기');
    });

    // 닫기 버튼: 패널만 닫고, 화면에 적용된 미리보기는 그대로 유지한다.
    // (채팅창을 보면서 확인하는 게 목적이므로 자동으로 되돌리지 않음)
    const closePanel = () => {
        container.remove();
        document.removeEventListener('keydown', onKeyDown);
    };
    const onKeyDown = (event) => {
        if (event.key === 'Escape') closePanel();
    };
    container._cleanup = () => document.removeEventListener('keydown', onKeyDown);
    closeBtn.addEventListener('click', closePanel);
    document.addEventListener('keydown', onKeyDown);

    renderRows();

    document.body.appendChild(container);
}

/** 이미 열려있는 패널이 있으면 제거한다 (버튼을 여러 번 눌러도 패널이 중복 생성되지 않도록). */
function closeExistingPanel() {
    const existing = document.getElementById(FLOATING_PANEL_ID);
    if (existing) {
        if (typeof existing._cleanup === 'function') existing._cleanup();
        existing.remove();
    }
}

/**
 * handle을 드래그하면 panel(포지션 fixed)을 함께 이동시킨다.
 * @param {HTMLElement} panel
 * @param {HTMLElement} handle
 */
function makeDraggable(panel, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('pointerdown', (event) => {
        dragging = true;
        const rect = panel.getBoundingClientRect();
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.right = 'auto';
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const newLeft = Math.min(Math.max(0, startLeft + dx), window.innerWidth - 60);
        const newTop = Math.min(Math.max(0, startTop + dy), window.innerHeight - 40);
        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
    });

    const stopDrag = () => { dragging = false; };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
}

function createUI() {
    if (document.getElementById(BUTTON_ID)) {
        return; // 이미 생성됨
    }

    const deleteButton = document.getElementById('ui-preset-delete-button');
    if (!deleteButton) {
        console.error(`[${MODULE_NAME}] UI Theme 버튼 영역을 찾지 못했습니다.`);
        return;
    }

    const button = document.createElement('div');
    button.id = BUTTON_ID;
    button.className = 'menu_button menu_button_icon margin0';
    button.title = '여러 테마 파일을 한 번에 임포트 (미리보기/이름변경 가능)';
    button.innerHTML = '<i class="fa-solid fa-file-zipper"></i>';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = FILE_INPUT_ID;
    fileInput.accept = '.json';
    fileInput.multiple = true;
    fileInput.hidden = true;

    button.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async function () {
        // 주의: this.value를 지우기 전에 파일 목록을 배열로 복사해야 한다.
        // 그렇지 않으면 일부 브라우저에서 this.files가 함께 비워져 버린다.
        const files = Array.from(this.files || []);
        this.value = '';
        if (files.length > 0) {
            try {
                await openImportPanel(files);
            } catch (error) {
                console.error(`[${MODULE_NAME}] 임포트 중 오류 발생:`, error);
                toastr.error(`예상치 못한 오류가 발생했습니다: ${error}`, '다중 테마 임포트');
            }
        }
    });

    deleteButton.insertAdjacentElement('afterend', button);
    deleteButton.insertAdjacentElement('afterend', fileInput);
}

(function init() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.APP_READY, createUI);

    // 확장이 APP_READY 이후에 늦게 로드된 경우를 대비한 안전장치
    if (document.getElementById('ui-preset-delete-button')) {
        createUI();
    }
})();
