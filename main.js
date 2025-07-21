import { loadHolidays, calculateSummary } from './work_time.js';
import { FONT_BASE_64 } from './data/font-data.js';
import { auth, incrementCounter } from './data/firebase-config.js';

let lastCalculationData = null;
let flyoutNavClickCount = 0;
let isSecretThemeUnlocked = false;

function applyTemplate(templateSelect, dayInputs) {
    const template = templateSelect.value;
    if (!template) return;
    const values = template.split(",").map(v => parseFloat(v) || 0);
    dayInputs.forEach((input, i) => {
        input.value = values[i] !== undefined ? values[i] : 0;
    });
    validateAllInputs(dayInputs);
}

function make(tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
}

function formatHours(num) {
    const fixed = (+num).toFixed(1);
    return parseFloat(fixed);
}

function validateAllInputs(dayInputs) {
    const showBtn = document.getElementById("showBtn");
    const buttonWrapper = document.getElementById("button-wrapper");
    const tooltipContainer = document.querySelector('.tooltip-icon-container');
    if (!showBtn) return;

    let totalHours = 0;
    let hasInvalidInput = false;
    let validationErrorMessages = [];
    const hoursArray = Array.from(dayInputs, input => parseFloat(input.value) || 0);

    hoursArray.forEach((value, i) => {
        const input = dayInputs[i];
        totalHours += isNaN(value) ? 0 : value;
        if (isNaN(value) || value < 0 || value > 24) {
            hasInvalidInput = true;
            input.classList.add('input-error');
            input.title = 'Години мають бути в діапазоні від 0 до 24.';
        } else {
            input.classList.remove('input-error');
            input.title = '';
        }
    });

    const longDaysCount = hoursArray.filter(h => h >= 8).length;
    const preHolidaysAreCalculated = (totalHours >= 40 || longDaysCount >= 2);
    if (tooltipContainer) {
         tooltipContainer.style.display = preHolidaysAreCalculated ? 'none' : 'inline-flex';
    }

    if (hasInvalidInput) {
        validationErrorMessages.push('Неправильне введення годин (допустимо від 0 до 24).');
    }
    if (totalHours < 5) {
        validationErrorMessages.push('Загальна кількість годин на тиждень має бути не менше 5.');
    }

    if (validationErrorMessages.length > 0) {
        showBtn.disabled = true;
        buttonWrapper.title = validationErrorMessages[0];
    } else {
        showBtn.disabled = false;
        buttonWrapper.title = '';
    }
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function autoExpandColumns() {
    const table = document.getElementById('results');
    const wrapper = document.querySelector('.table-wrapper');
    const headRow = document.querySelector('#results-head tr');
    const bodyRows = document.querySelectorAll('#results-body tr');

    if (!table || !headRow || !wrapper) return;

    document.querySelectorAll('.expanded-col').forEach(el => el.classList.remove('expanded-col'));
    await delay(50);

    const columnCount = headRow.children.length - 1;

    for (let i = 1; i < columnCount; i++) {
        if (table.scrollWidth >= wrapper.clientWidth - 15) break;

        const headerCell = headRow.children[i];
        if (headerCell) headerCell.classList.add('expanded-col');
        bodyRows.forEach(row => { if (row.children[i]) row.children[i].classList.add('expanded-col'); });
        await delay(450);
    }
}

function showTableLayout() {
    const showBtn = document.getElementById("showBtn");
    if (showBtn.disabled) return;

    const year = parseInt(document.getElementById("year").value);
    const selected = document.getElementById("month").value;
    const ignoreHolidays = document.getElementById("ignoreHolidays").checked;
    const hours = Array.from(document.querySelectorAll(".day")).map(e => parseFloat(e.value) || 0);

    const totalHours = hours.reduce((a, b) => a + b, 0);
    const longDaysCount = hours.filter(h => h >= 8).length;
    const preHolidaysAreCalculated = (totalHours >= 40 || longDaysCount >= 2);

    const currentCalculationData = { year, selected, hours: JSON.stringify(hours), ignoreHolidays };
    if (JSON.stringify(currentCalculationData) !== JSON.stringify(lastCalculationData)) {
        console.log("[UI Log] Кнопка 'Розрахувати' натиснута. Викликаю incrementCounter.");
        incrementCounter('calculations');
    }

    lastCalculationData = currentCalculationData;

    const data = calculateSummary(year, selected, hours, ignoreHolidays);
    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
    const head = document.getElementById("results-head");
    const body = document.getElementById("results-body");
    head.innerHTML = "";
    body.innerHTML = "";

    const months = Object.keys(data).map(n => parseInt(n));
    const headerRow = document.createElement("tr");
    headerRow.appendChild(make("th", " "));
    months.forEach(m => headerRow.appendChild(make("th", monthNames[m - 1])));
    if (selected === "0" || selected.startsWith("Q")) {
         headerRow.appendChild(make("th", "Загалом"));
    }
    head.appendChild(headerRow);

    const rows = [
        ["calendar", "Календарні дні"], ["holiday", "Святкові дні"], ["holidayRawDates", "Дати святкових днів"],
        ["preholiday", "Передсвяткові дні"], ["preholidayDates", "Дати передсвяткових днів"], ["weekend", "Вихідні дні"],
        ["nonWorking", "Неробочі дні"], ["working", "Робочі дні"], ["hours", "К-ть годин"]
    ];
    const holidayKeys = new Set(['holiday', 'holidayRawDates', 'preholiday', 'preholidayDates']);
    const preholidayKeys = new Set(['preholiday', 'preholidayDates']);
    const nonNumericTotalKeys = new Set(['holidayRawDates', 'preholidayDates']);

    for (const [key, label] of rows) {
        if (ignoreHolidays && holidayKeys.has(key)) {
            continue;
        }

        if (preholidayKeys.has(key) && !preHolidaysAreCalculated) {
            continue;
        }

        const tr = document.createElement("tr");
        const labelCell = document.createElement('td');
        const arrow = document.createElement('span');
        arrow.className = 'row-selector-arrow';
        arrow.title = 'Виділити рядок';
        labelCell.textContent = label;
        labelCell.prepend(arrow);
        tr.appendChild(labelCell);

        let total = 0;

        for (const m of months) {
            let val = data[m][key];
            let displayVal;

            if (key === 'holiday' && data[m]['holidayRawDates']) {
                val = data[m]['holidayRawDates'].length;
            }

            if (Array.isArray(val)) {
                displayVal = val.join(", ") || "-";
            } else {
                total += val;
                if (key === 'hours') {
                    displayVal = formatHours(val);
                } else {
                    displayVal = (val === 0) ? "-" : val;
                }
            }
            tr.appendChild(make("td", displayVal));
        }

        if (selected === "0" || selected.startsWith("Q")) {
            if (nonNumericTotalKeys.has(key)) {
                tr.appendChild(make("td", "-"));
            } else {
                let displayTotal;
                 if (key === 'hours') {
                    displayTotal = formatHours(total);
                } else {
                    displayTotal = (total === 0) ? "-" : total;
                }
                tr.appendChild(make("td", String(displayTotal)));
            }
        }
        body.appendChild(tr);
    }
    document.getElementById("results-wrapper").style.display = "block";
    document.getElementById('downloadPdfBtn').style.display = 'block';
    autoExpandColumns();
}

/**
 * Зчитує CSS-змінні поточної теми для використання в PDF.
 * @returns {object} Об'єкт з кольорами для PDF.
 */
function getThemeColorsForPdf() {
    const computedStyles = getComputedStyle(document.documentElement);

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
    };

    return {
        pageColor: hexToRgb(computedStyles.getPropertyValue('--page-bg')),
        textColor: hexToRgb(computedStyles.getPropertyValue('--pdf-text-color')),
        headerFillColor: hexToRgb(computedStyles.getPropertyValue('--header-bg')),
        headerTextColor: hexToRgb(computedStyles.getPropertyValue('--header-text')),
        gridColor: hexToRgb(computedStyles.getPropertyValue('--grid-color')),
        cellFillColor: hexToRgb(computedStyles.getPropertyValue('--pdf-cell-bg')), // Нове
        linkColor: hexToRgb(computedStyles.getPropertyValue('--pdf-link-color'))   // Нове
    };
}

function formatPdfHours(decimalHours) {
    const num = parseFloat(decimalHours);
    if (isNaN(num)) return "0 год.";
    if (num === 0) return "0 год.";
    const hours = Math.floor(num);
    const minutes = Math.round((num % 1) * 60);
    let result = "";
    if (hours > 0) result += `${hours} год. `;
    if (minutes > 0) result += `${minutes} хв.`;
    return result.trim();
}

function formatWeeklyHours(decimalHours) {
    const num = parseFloat(decimalHours);
    if (isNaN(num) || num <= 0) return "0 годин";
    const hours = Math.floor(num);
    const minutes = Math.round((num % 1) * 60);
    let result = "";
    if (hours > 0) result += `${hours} годин `;
    if (minutes > 0) result += `${minutes} хвилин`;
    return result.trim();
}

async function downloadPdf() {
    console.log("[UI Log] Кнопка 'Завантажити' натиснута. Викликаю incrementCounter.");
    incrementCounter('downloads');

    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    if (!lastCalculationData) {
        alert("Спочатку розрахуйте таблицю.");
        return;
    }
    if (!FONT_BASE_64 || FONT_BASE_64.startsWith("Сюди")) {
        alert("Помилка: Дані шрифту не були вставлені у файл font-data.js.");
        return;
    }

    downloadPdfBtn.disabled = true;
    downloadPdfBtn.textContent = 'Генерація PDF...';

    try {
        const { jsPDF } = window.jspdf;
        const newHeight = 160;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, newHeight] });

        doc.addFileToVFS("CustomFont.ttf", FONT_BASE_64);
        doc.addFont("CustomFont.ttf", "CustomFont", "normal");
        doc.setFont("CustomFont");

        let logoData = null;
        try {
            const response = await fetch('./data/Tantrum-logo.png');
            if (response.ok) {
                const logoBlob = await response.blob();
                logoData = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(logoBlob);
                });
            } else {
                console.warn("Не вдалося завантажити логотип.");
            }
        } catch (e) {
            console.warn("Помилка при завантаженні логотипу:", e);
        }

        const applyThemeToPdf = document.getElementById('pdf-theme-checkbox').checked;

        let pdfColors;
        const defaultColors = {
            pageColor: [255, 255, 255],
            textColor: [0, 0, 0],
            headerFillColor: [22, 160, 133],
            headerTextColor: [255, 255, 255],
            gridColor: [200, 200, 200],
            cellFillColor: [255, 255, 255], // Нове
            linkColor: [0, 0, 255]           // Нове
        };

        if (applyThemeToPdf) {
            pdfColors = getThemeColorsForPdf();
        } else {
            pdfColors = defaultColors;
        }

        const { year, selected, ignoreHolidays } = lastCalculationData;
        const hours = JSON.parse(lastCalculationData.hours);
        const data = calculateSummary(year, selected, hours, ignoreHolidays);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        const totalWeeklyHours = hours.reduce((acc, h) => acc + (parseFloat(h) || 0), 0);
        const preHolidaysAreCalculated = totalWeeklyHours >= 40 || hours.filter(h => h >= 8).length >= 2;


        if (pdfColors.pageColor[0] !== 255 || pdfColors.pageColor[1] !== 255 || pdfColors.pageColor[2] !== 255) {
            doc.setFillColor(...pdfColors.pageColor);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
        }

        doc.setTextColor(...pdfColors.textColor);

        const workingDaysCount = hours.filter(h => h > 0).length;
        const weeklyHoursFormatted = formatWeeklyHours(totalWeeklyHours);
        const dayNames = ["Пн.", "Вт.", "Ср.", "Чт.", "Пт.", "Сб.", "Нд."];
        const title = `Норма робочого часу за ${year} рік за ${workingDaysCount}-денного робочого тижня (${weeklyHoursFormatted} на тиждень)`;
        const subtitle = `(Графік роботи: ${hours.map((h, i) => `${dayNames[i]} - ${formatPdfHours(h)}`).join(', ')})`;

        doc.setFontSize(16);
        doc.text(title, pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(subtitle, pageWidth / 2, 22, { align: 'center' });

        const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
        const months = Object.keys(data).map(n => parseInt(n));
        const tableHead = [" ", ...months.map(m => monthNames[m - 1])];
        if (selected === "0" || selected.startsWith("Q")) {
            tableHead.push("Загалом");
        }

        let rowConfigs;
        if (ignoreHolidays) {
            rowConfigs = [
                ["calendar", "Календарні дні"], ["weekend", "Вихідні дні"],
                ["nonWorking", "Неробочі дні"], ["working", "Робочі дні"], ["hours", "К-ть годин"]
            ];
        } else {
            rowConfigs = [
                ["calendar", "Календарні дні"], ["holiday", "Святкові дні"], ["holidayRawDates", "Дати святкових днів"],
                ["preholiday", "Передсвяткові дні"], ["preholidayDates", "Дати передсвяткових днів"], ["weekend", "Вихідні дні"],
                ["nonWorking", "Неробочі дні"], ["working", "Робочі дні"], ["hours", "К-ть годин"]
            ];
        }

        if (!preHolidaysAreCalculated) {
            const preholidayKeys = new Set(['preholiday', 'preholidayDates']);
            rowConfigs = rowConfigs.filter(([key]) => !preholidayKeys.has(key));
        }

        const tableBody = rowConfigs.map(([key, label]) => {
            const row = [label];
            let total = 0;
            months.forEach(m => {
                const monthData = data[m] || {};
                let val = monthData[key];
                let displayVal;

                if (key === 'holiday' && monthData['holidayRawDates']) {
                    val = monthData['holidayRawDates'].length;
                }

                if ((key === 'holidayRawDates' || key === 'preholidayDates') && Array.isArray(val)) {
                    displayVal = val.map(dateStr => dateStr.slice(0, 5)).join(", ") || "-";
                } else if (Array.isArray(val)) {
                    displayVal = val.join(", ") || "-";
                } else {
                    const numericVal = parseFloat(val);
                    if (!isNaN(numericVal)) {
                        total += numericVal;
                    }
                    if (key === 'hours' && !isNaN(numericVal)) {
                        displayVal = formatHours(numericVal);
                    } else if (key !== 'hours' && numericVal === 0) {
                        displayVal = "-";
                    } else {
                        displayVal = val;
                    }
                }
                row.push(displayVal != null ? displayVal.toString() : "-");
            });

            if (selected === "0" || selected.startsWith("Q")) {
                if (new Set(['holidayRawDates', 'preholidayDates']).has(key)) {
                    row.push("-");
                } else {
                    let displayTotal;
                     if (key === 'hours') {
                        displayTotal = formatHours(total);
                    } else {
                        displayTotal = (total === 0) ? "-" : total;
                    }
                    row.push(isNaN(displayTotal) ? "0" : displayTotal.toString());
                }
            }
            return row;
        });

        const columnStyles = {};
        const numCols = tableHead.length;
        columnStyles[0] = { cellWidth: 32, fontStyle: 'bold' };
        for (let i = 1; i < numCols; i++) {
             columnStyles[i] = { cellWidth: 'auto' };
        }
        if (selected === "0" || selected.startsWith("Q")) {
            columnStyles[numCols - 1] = { cellWidth: 'auto', fontStyle: 'bold' };
        }

        doc.autoTable({
            head: [tableHead],
            body: tableBody,
            startY: 28,
            theme: 'grid',
            margin: { left: 10, right: 10, bottom: 18 },
            headStyles: {
                fillColor: pdfColors.headerFillColor,
                textColor: pdfColors.headerTextColor,
                lineColor: pdfColors.gridColor,
                lineWidth: 0.1,
                font: "CustomFont",
                fontStyle: 'bold',
                halign: 'center'
            },
            styles: {
                font: "CustomFont",
                fontSize: 10,
                cellPadding: 2,
                valign: 'middle',
                halign: 'center',
                textColor: pdfColors.textColor,
                lineColor: pdfColors.gridColor,
                fillColor: pdfColors.cellFillColor, // Ось виправлення
                lineWidth: 0.1
            },
            columnStyles: columnStyles,
            didParseCell: function (data) {
                if (data.column.index === 0) { // Виділяємо першу колонку
                    data.cell.styles.fillColor = [ // Робимо її трохи світлішою за фон клітинок
                        Math.min(255, pdfColors.cellFillColor[0] + 15),
                        Math.min(255, pdfColors.cellFillColor[1] + 15),
                        Math.min(255, pdfColors.cellFillColor[2] + 15)
                    ];
                }
            }
        });

        const rightMargin = 15;
        const bottomMargin = 10;
        const logoSize = 10;
        const padding = 3;
        const logoX = pageWidth - rightMargin - logoSize;
        const logoY = pageHeight - bottomMargin - logoSize;

        if (logoData) {
            doc.addImage(logoData, 'PNG', logoX, logoY, logoSize, logoSize);
        } else {
            doc.setFont("CustomFont", 'normal');
            doc.setDrawColor(...pdfColors.gridColor);
            doc.rect(logoX, logoY, logoSize, logoSize);
            doc.text('Лого', logoX + logoSize / 2, logoY + logoSize / 2 + 3, { align: 'center' });
        }

        doc.setTextColor(...pdfColors.textColor);
        const textBlockX = logoX - padding;
        doc.setFontSize(9);
        doc.text("Створено калькулятором від RTantrumR", textBlockX, logoY + 3, { align: 'right' });
        doc.setFontSize(8);
        doc.text(`Дата: ${new Date().toLocaleDateString('uk-UA')}`, textBlockX, logoY + 7, { align: 'right' });

        doc.setTextColor(...pdfColors.linkColor); // Ось виправлення
        doc.textWithLink('Калькулятор норми робочого часу', 15, pageHeight - 8, { url: 'https://rtantrumr.github.io/Calc_html/' });
        doc.setTextColor(...pdfColors.textColor);

        doc.save(`Norma_robochogo_chasu_${year}.pdf`);

    } catch (error) {
        console.error("Детальна помилка при генерації PDF:", error);
        alert("Виникла несподівана помилка...");
    } finally {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = 'Завантажити у PDF';
    }
}

function unlockSecretTheme() {
    flyoutNavClickCount++;
    console.log(`Flyout nav clicks: ${flyoutNavClickCount}`);

    if (flyoutNavClickCount > 25 && !isSecretThemeUnlocked) {
        isSecretThemeUnlocked = true;
        const themeDropdown = document.getElementById('theme-dropdown');
        const secretOption = document.createElement('div');
        secretOption.className = 'theme-option';
        secretOption.dataset.value = 'psychedelic-rainbow';
        secretOption.textContent = '???';
        themeDropdown.appendChild(secretOption);
        alert('✨ Ви щось розблокували! ✨');
    }
}

async function loadDocuments() {
    const docsGrid = document.getElementById('docs-grid');
    if (!docsGrid) return;

    // Видаляємо вибір року, оскільки він більше не потрібен
    const yearSelect = document.getElementById('year-select');
    if (yearSelect) {
        yearSelect.parentElement.remove();
    }

    try {
        const response = await fetch('documents.json');
        // Перейменовуємо змінну для кращого розуміння
        window.docsByCategories = await response.json();

        docsGrid.innerHTML = '';
        const categories = Object.keys(window.docsByCategories);

        categories.forEach(category => {
            const docsInCategory = window.docsByCategories[category];

            if (docsInCategory && docsInCategory.length > 0) {
                // Створюємо заголовок для кожної категорії
                const categoryTitle = document.createElement('h2');
                categoryTitle.className = 'docs-year-title'; // Використовуємо старий клас для стилів
                categoryTitle.textContent = category;
                docsGrid.appendChild(categoryTitle);

                // Створюємо контейнер для блоків цієї категорії
                const categoryContainer = document.createElement('div');
                categoryContainer.className = 'features-grid docs-page-grid';

                docsInCategory.forEach(doc => {
                    const docLink = document.createElement('a');
                    docLink.className = 'feature-block';

                    // Встановлюємо атрибути залежно від типу документа
                    if (doc.type === 'modal') {
                        docLink.href = `#${doc.id}`;
                        docLink.setAttribute('data-doc-id', doc.id);
                        docLink.setAttribute('data-doc-type', 'modal');
                    } else if (doc.type === 'table') {
                        docLink.href = `#${doc.id}`;
                    } else {
                        docLink.href = doc.link;
                        docLink.target = '_blank';
                    }

                    // Створення прев'ю (візуальної частини)
                    const featurePreview = document.createElement('div');
                    featurePreview.className = 'feature-preview';

                    if (doc.link === '#iif-container' || (doc.type === 'table' && doc.id === 'iif-container')) {
                        featurePreview.innerHTML = `
                            <div class="inflation-preview">
                                <div class="inflation-chart-container">
                                    <div class="y-labels"><span>115</span><span>110</span><span>105</span><span>100</span></div>
                                    <div class="chart-area">
                                         <div class="grid-line" style="bottom: 75%;"></div>
                                         <div class="grid-line" style="bottom: 50%;"></div>
                                         <div class="grid-line" style="bottom: 25%;"></div>
                                         <div class="grid-line base-line" style="bottom: 1px;"></div>
                                         <svg viewBox="0 0 100 60" preserveAspectRatio="none"><polyline fill="none" stroke="var(--primary-color)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="5,50 25,40 45,45 65,25 85,15" /></svg>
                                    </div>
                                </div>
                                <div class="kpi">Річна інфляція: <span class="kpi-value">+12.4%</span></div>
                            </div>`;
                    } else if (doc.type === 'table' && doc.id === 'vs-container') {
                        featurePreview.innerHTML = `
                            <div class="martial-law-preview">
                                <div class="preview-document doc-back"><img src="https://upload.wikimedia.org/wikipedia/commons/a/a8/%D0%A2%D1%80%D0%B8%D0%B7%D1%83%D0%B1.svg" alt="Тризуб" class="tryzub-svg-small"><div class="doc-text-lines"><div class="doc-line line-short"></div><div class="doc-line line-long"></div><div class="doc-line line-long"></div><div class="doc-line line-medium"></div><div class="doc-line line-long"></div></div></div>
                                <div class="preview-document doc-front"><img src="https://upload.wikimedia.org/wikipedia/commons/a/a8/%D0%A2%D1%80%D0%B8%D0%B7%D1%83%D0%B1.svg" alt="Тризуб" class="tryzub-svg-small"><div class="doc-text-lines"><div class="doc-line line-short"></div><div class="doc-line line-long"></div><div class="doc-line line-long"></div><div class="doc-line line-medium"></div><div class="doc-line line-long"></div></div></div>
                            </div>`;
                    } else {
                        featurePreview.innerHTML = `
                            <div class="business-preview">
                                <div class="preview-docs"><div class="doc doc-2"><div class="line line-short"></div><div class="line line-long"></div><div class="line line-long"></div><div class="line line-medium"></div></div></div>
                            </div>`;
                    }

                    // Створення опису, що з'являється при наведенні
                    const featureDesc = document.createElement('div');
                    featureDesc.className = 'feature-description';
                    const docTitle = document.createElement('h3');
                    docTitle.textContent = doc.title;
                    const docP = document.createElement('p');
                    docP.textContent = doc.description;
                    featureDesc.appendChild(docTitle);
                    featureDesc.appendChild(docP);
                    docLink.appendChild(featurePreview);
                    docLink.appendChild(featureDesc);
                    categoryContainer.appendChild(docLink);
                });
                docsGrid.appendChild(categoryContainer);
            }
        });

    } catch (error) {
        console.error('Помилка завантаження документів:', error);
        docsGrid.innerHTML = '<p>Не вдалося завантажити список документів.</p>';
    }
}

function themeSwitcher() {
    const themeContainer = document.querySelector('.theme-switcher-container');
    const themeButton = document.getElementById('theme-button');
    if (!themeButton) return;

    const themeText = themeButton.querySelector('.theme-text');
    const themeDropdown = document.getElementById('theme-dropdown');
    let dummySpan;

    function setupDummySpan() {
        dummySpan = document.createElement('span');
        const btnStyles = getComputedStyle(themeButton);
        Object.assign(dummySpan.style, {
            fontFamily: btnStyles.fontFamily, fontSize: btnStyles.fontSize,
            fontWeight: btnStyles.fontWeight, letterSpacing: btnStyles.letterSpacing,
            padding: btnStyles.padding, border: btnStyles.border,
            visibility: 'hidden', position: 'absolute', left: '-9999px'
        });
        document.body.appendChild(dummySpan);
    }

    function applyTheme(themeValue, themeLabel) {
        themeButton.classList.add('animating');
        themeText.classList.remove('visible');

        dummySpan.textContent = themeLabel;
        const newWidth = dummySpan.offsetWidth;
        const widthThreshold = 110;

        themeDropdown.classList.toggle('align-right', newWidth < widthThreshold);

        setTimeout(() => {
            themeContainer.style.width = `${newWidth}px`;
            themeButton.style.width = `${newWidth}px`;

            document.documentElement.setAttribute('data-theme', themeValue);
            localStorage.setItem('theme', themeValue);
            themeText.textContent = themeLabel;

            const nyanCatContainer = document.getElementById('nyan-cat-container');
            if (nyanCatContainer) {
                nyanCatContainer.style.display = themeValue === 'psychedelic-rainbow' ? 'block' : 'none';
            }

            setTimeout(() => {
                themeText.classList.add('visible');
                themeButton.classList.remove('animating');
            }, 400);
        }, 200);
    }

    themeButton.addEventListener('click', () => {
        themeDropdown.classList.toggle('visible');
    });

    document.addEventListener('click', (e) => {
        if (!themeButton.contains(e.target) && !themeDropdown.contains(e.target)) {
            themeDropdown.classList.remove('visible');
        }
    });

    themeDropdown.addEventListener('click', (e) => {
        if (e.target.classList.contains('theme-option')) {
            const themeValue = e.target.dataset.value;
            const themeLabel = e.target.textContent;
            themeDropdown.classList.remove('visible');
            applyTheme(themeValue, themeLabel);
        }
    });

    setupDummySpan();
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedOption = document.querySelector(`.theme-option[data-value="${savedTheme}"]`);
    const initialLabel = savedOption ? savedOption.textContent : 'Світла';

    document.documentElement.setAttribute('data-theme', savedTheme);
    themeText.textContent = initialLabel;
    dummySpan.textContent = initialLabel;
    const initialWidth = dummySpan.offsetWidth;
    themeContainer.style.width = `${initialWidth}px`;
    themeButton.style.width = `${initialWidth}px`;
    themeDropdown.classList.toggle('align-right', initialWidth < 110);
    setTimeout(() => themeText.classList.add('visible'), 50);
}

function setupFlyoutMenu() {
    const system = document.getElementById('flyout-system');
    const nav = document.getElementById('flyout-nav');
    const toggleBtn = document.getElementById('flyout-toggle-btn');

    if (!system || !nav || !toggleBtn) {
        return;
    }

    const closeMenu = (e) => {
        if (!system.contains(e.target)) {
            system.classList.remove('is-open');
            // Плавно повертаємо кнопку на місце
            toggleBtn.style.transform = 'translateY(0)';
            document.removeEventListener('click', closeMenu);
        }
    };

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = system.classList.contains('is-open');

        if (isOpen) {
            system.classList.remove('is-open');
            // Плавно повертаємо кнопку на місце
            toggleBtn.style.transform = 'translateY(0)';
            document.removeEventListener('click', closeMenu);
        } else {
            system.classList.add('is-open');

            // --- Розрахунок для плавної анімації ---
            const navHeight = nav.offsetHeight; // Висота меню
            const gap = 5; // Відстань між меню та кнопкою (зменшив для краси)
            const navTopPosition = 10; // Позиція меню від верху (має збігатися з `translateY(10px)` в CSS)

            // Рахуємо, на скільки зсунути кнопку вниз
            const totalOffset = navTopPosition + navHeight + gap;

            // Застосовуємо transform для плавного руху
            toggleBtn.style.transform = `translateY(${totalOffset}px)`;

            setTimeout(() => {
                document.addEventListener('click', closeMenu);
            }, 0);
        }
    });
}

// --- ЛОГІКА ДЛЯ ТАБЛИЦІ ВОЄННОГО СТАНУ ---
const vsModalOverlay = document.getElementById('vs-modal-overlay');
const vsTableWrapper = document.getElementById('vs-table-wrapper');
const vsCloseButton = document.getElementById('vs-modal-close-button');
let vsTableElement = null;

const createVsTable = async () => {
        if (vsTableElement) return; // Створюємо лише один раз

        try {
            const response = await fetch('VS.json');
            const vsData = await response.json();

            // РЕВЕРС: Сортуємо масив, щоб найновіші дати були зверху
            vsData.reverse();

            vsTableElement = document.createElement('table');
            vsTableElement.className = 'iif-table vs-table'; // Додаємо новий клас
            const thead = document.createElement('thead');
            const tbody = document.createElement('tbody');
            const headerRow = document.createElement('tr');

            const headers = ['Дата запровадження', 'Дата закінчення', 'Нормативне підґрунтя'];
            headers.forEach(headerText => {
                const th = document.createElement('th');
                th.textContent = headerText;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            vsTableElement.appendChild(thead);

            vsData.forEach(item => {
                const row = document.createElement('tr');
                // ОНОВЛЕНО: Використовуємо класи для кращого стилю та прибираємо <br>
                row.innerHTML = `
                    <td class="vs-date-cell">${item['Дата та час запровадження ВС'].replace(' ', '<br>')}</td>
                    <td class="vs-date-cell">${item['Дата та час закінчення ВС'].replace(' ', '<br>')}</td>
                    <td class="normative-act-cell">${item['Нормативне підґрунтя'].replace(' та ', ' та<br>')}</td>
                `;
                tbody.appendChild(row);
            });

            vsTableElement.appendChild(tbody);
            vsTableWrapper.innerHTML = ''; // Очищуємо контейнер
            vsTableWrapper.appendChild(vsTableElement);

        } catch (error) {
            console.error('Не вдалося завантажити дані про воєнний стан:', error);
            vsTableWrapper.innerHTML = '<p>Помилка завантаження даних.</p>';
        }
};

const openVsModal = async () => {
    await createVsTable();
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    vsModalOverlay.classList.add('visible');
};

const closeVsModal = () => {
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    vsModalOverlay.classList.remove('visible');
};

const docsGrid = document.getElementById('docs-grid');
if (docsGrid) {
    docsGrid.addEventListener('click', (event) => {
        const featureBlock = event.target.closest('a.feature-block');
        if (featureBlock && featureBlock.getAttribute('href') === '#vs-container') {
            event.preventDefault();
            openVsModal();
        }
    });
}

if(vsCloseButton) vsCloseButton.addEventListener('click', closeVsModal);
if(vsModalOverlay) vsModalOverlay.addEventListener('click', (event) => {
    if (event.target === vsModalOverlay) {
        closeVsModal();
    }
});

// --- ЛОГІКА ДЛЯ УНІВЕРСАЛЬНОГО МОДАЛЬНОГО ВІКНА ---
const genericModalOverlay = document.getElementById('generic-modal-overlay');
const genericModalTitle = document.getElementById('generic-modal-title');
const genericModalContent = document.getElementById('generic-modal-content');
const genericModalCloseButton = document.getElementById('generic-modal-close-button');

const openGenericModal = async (config) => {
    if (!config || !config.data_url) return;

    genericModalTitle.textContent = config.title || 'Довідка';
    genericModalContent.innerHTML = '<p>Завантаження...</p>';
    genericModalOverlay.classList.add('visible');
    document.documentElement.classList.add('modal-open');

    try {
        const response = await fetch(config.data_url);
        const data = await response.json();
        genericModalContent.innerHTML = data.content;
    } catch (error) {
        console.error('Помилка завантаження даних для модального вікна:', error);
        genericModalContent.innerHTML = '<p>Не вдалося завантажити дані.</p>';
    }
};

const closeGenericModal = () => {
    genericModalOverlay.classList.remove('visible');
    document.documentElement.classList.remove('modal-open');
};

if (genericModalCloseButton) genericModalCloseButton.addEventListener('click', closeGenericModal);
if (genericModalOverlay) genericModalOverlay.addEventListener('click', (event) => {
    if (event.target === genericModalOverlay) {
        closeGenericModal();
    }
});


window.addEventListener("DOMContentLoaded", async () => {

    const featuresGrid = document.querySelector('.features-grid');
    if (featuresGrid) {
        const rulesModal = document.getElementById('rules-modal');
        const featureBlocks = document.querySelectorAll('.feature-block');
        const agreeButton = document.getElementById('agree-button');

        const runEntryAnimation = () => {
            featureBlocks.forEach(block => { block.style.opacity = '0'; });
            featuresGrid.classList.add('is-animating');

            const animationMap = {
                1: 'animate-from-left', 2: 'animate-from-top', 3: 'animate-from-right',
                4: 'animate-from-left', 5: 'animate-from-bottom', 6: 'animate-from-right'
            };

            featureBlocks.forEach((block, index) => {
                const blockNumber = index + 1;
                if (animationMap[blockNumber]) {
                    setTimeout(() => { block.classList.add(animationMap[blockNumber]); }, 100);
                }
            });

            setTimeout(() => { featuresGrid.classList.remove('is-animating'); }, 2500);
        };

        const hasAgreed = localStorage.getItem('rulesAgreed');

        if (hasAgreed === 'true') {
            if (rulesModal) rulesModal.style.display = 'none';
            runEntryAnimation();
        } else {
            if (rulesModal) rulesModal.style.display = 'flex';
        }

        if (agreeButton) {
            agreeButton.addEventListener('click', () => {
                localStorage.setItem('rulesAgreed', 'true');
                if (rulesModal) rulesModal.style.display = 'none';
                setTimeout(runEntryAnimation, 100);
            });
        }
    } else {
        const rulesModal = document.getElementById('rules-modal');
        if (rulesModal) {
            const agreeButton = document.getElementById('agree-button');
            const hasAgreed = localStorage.getItem('rulesAgreed');

            if (hasAgreed !== 'true') {
                rulesModal.style.display = 'flex';
            }

            if (agreeButton) {
                agreeButton.addEventListener('click', () => {
                    localStorage.setItem('rulesAgreed', 'true');
                    rulesModal.style.display = 'none';
                });
            }
        }
    }

    const contactEmailLink = document.getElementById('contact-email');
    if (contactEmailLink) {
        contactEmailLink.addEventListener('click', (e) => {
            e.preventDefault();
            const email = contactEmailLink.href.replace('mailto:', '');
            const notification = document.getElementById('copy-notification');

            navigator.clipboard.writeText(email).then(() => {
                if (notification) {
                    notification.textContent = 'Скопійовано!';
                    notification.classList.add('visible');

                    setTimeout(() => {
                        notification.classList.remove('visible');
                    }, 2500);
                }
            }).catch(err => {
                console.error('Не вдалося скопіювати email: ', err);
            });
        });
    }

    themeSwitcher();

    const flyoutNav = document.getElementById('flyout-nav');
    if (flyoutNav) {
        flyoutNav.addEventListener('click', unlockSecretTheme);
    }

    loadDocuments();
    setupFlyoutMenu();

    const showBtn = document.getElementById("showBtn");
    if (showBtn) {
        const dayInputs = document.querySelectorAll(".day");
        const templateSelect = document.getElementById("template");
        const downloadPdfBtn = document.getElementById('downloadPdfBtn');
        const resultsBody = document.getElementById('results-body');

        try {
            await loadHolidays();
        } catch(e) {
            console.error("Не вдалося завантажити дані про свята:", e);
            alert("Помилка завантаження критичних даних.");
        }

        if (resultsBody) {
            resultsBody.addEventListener('click', (event) => {
                if (event.target.classList.contains('row-selector-arrow')) {
                    const row = event.target.closest('tr');
                    if (row) {
                        row.classList.toggle('row-highlighted');
                    }
                }
            });
        }
        showBtn.addEventListener("click", showTableLayout);
        downloadPdfBtn.addEventListener("click", downloadPdf);
        templateSelect.addEventListener("change", () => applyTemplate(templateSelect, dayInputs));
        dayInputs.forEach(input => input.addEventListener('input', () => validateAllInputs(dayInputs)));

        validateAllInputs(dayInputs);
    }

    // --- ЛОГІКА ДЛЯ СТОРІНКИ ДОКУМЕНТІВ ---
    const docsGrid = document.getElementById('docs-grid');
    if (docsGrid) {
        const modalOverlay = document.getElementById('iif-modal-overlay');
        const tableModal = document.getElementById('iif-table-modal');
        const chartModal = document.getElementById('iif-chart-modal');
        const cumulativeChartModal = document.getElementById('iif-cumulative-chart-modal');
        const tableWrapper = document.getElementById('iif-table-wrapper');
        const chartContainer = document.getElementById('iif-chart-container');
        const cumulativeChartContainer = document.getElementById('iif-cumulative-chart-container');
        const closeButton = document.getElementById('modal-close-button');

        let iifData = null;
        let currentYear = null;
        let isTransitionLocked = false;
        let tableElement = null;

        const createIifTable = async () => {
            try {
                const response = await fetch('iif_data.json');
                iifData = await response.json();

                tableElement = document.createElement('table');
                tableElement.className = 'iif-table';
                const thead = document.createElement('thead');
                const tbody = document.createElement('tbody');
                const headerRow = document.createElement('tr');
                const yearHeader = document.createElement('th');
                yearHeader.textContent = 'Рік';
                headerRow.appendChild(yearHeader);
                ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру', 'Всього'].forEach(month => {
                    const th = document.createElement('th');
                    th.textContent = month;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                tableElement.appendChild(thead);
                const sortedYears = Object.keys(iifData).sort((a, b) => b - a);
                sortedYears.forEach(year => {
                    const row = document.createElement('tr');
                    const yearCell = document.createElement('td');
                    yearCell.textContent = year;
                    yearCell.dataset.year = year;
                    yearCell.classList.add('year-cell');
                    row.appendChild(yearCell);
                    iifData[year].forEach(value => {
                        const cell = document.createElement('td');
                        cell.textContent = value !== null ? value : '-';
                        row.appendChild(cell);
                    });
                    tbody.appendChild(row);
                });
                tableElement.appendChild(tbody);
                tableWrapper.appendChild(tableElement);
            } catch (error) {
                console.error('Не вдалося завантажити дані інфляції:', error);
                tableWrapper.innerHTML = '<p>Помилка завантаження даних.</p>';
            }
        };

        const createChart = (year) => {
            const yearData = iifData[year].slice(0, 12);
            const months = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

            chartContainer.innerHTML = '';
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'chart-wrapper';

            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute('class', 'line-chart');
            svg.setAttribute('viewBox', '0 0 550 280');
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

            // --- ЗМІНЕНО: Фіксований діапазон для осі Y ---
            const viewMax = 110;
            const viewMin = 95;
            const range = viewMax - viewMin;

            const y = (val) => 240 - ((val - viewMin) / range * 210);
            const xStep = 480 / 12;
            const x = (index) => 40 + (index * xStep) + (xStep / 2);

            const yAxis = document.createElementNS(svgNS, 'line');
            yAxis.setAttribute('class', 'axis-line');
            yAxis.setAttribute('x1', '40');
            yAxis.setAttribute('y1', 10);
            yAxis.setAttribute('x2', '40');
            yAxis.setAttribute('y2', 240);
            svg.appendChild(yAxis);

            // --- ЗМІНЕНО: Статичні мітки для осі Y з кроком 5 ---
            const yLabels = [95, 100, 105, 110];
            yLabels.forEach(labelValue => {
                const lineY = y(labelValue);

                const gridLine = document.createElementNS(svgNS, 'line');
                gridLine.setAttribute('class', labelValue === 100 ? 'baseline' : 'grid-line');
                gridLine.setAttribute('x1', 40);
                gridLine.setAttribute('y1', lineY);
                gridLine.setAttribute('x2', 520);
                gridLine.setAttribute('y2', lineY);
                svg.appendChild(gridLine);

                const label = document.createElementNS(svgNS, 'text');
                label.setAttribute('class', 'axis-label');
                label.setAttribute('x', 35);
                label.setAttribute('y', lineY + 4);
                label.textContent = labelValue; // Тепер числа будуть цілими
                svg.appendChild(label);
            });

            const points = yearData.map((val, i) => val !== null ? `${x(i)},${y(val)}` : null).filter(Boolean);

            if (points.length > 1) {
                const polyline = document.createElementNS(svgNS, 'polyline');
                polyline.setAttribute('class', 'chart-line');
                polyline.setAttribute('points', points.join(' '));
                svg.appendChild(polyline);
            }

            yearData.forEach((val, i) => {
                if (val === null) return;
                const pointY = y(val);

                const circle = document.createElementNS(svgNS, 'circle');
                circle.setAttribute('class', `chart-point ${val >= 100 ? 'positive' : 'negative'}`);
                circle.setAttribute('cx', x(i));
                circle.setAttribute('cy', pointY);
                circle.setAttribute('r', 4);

                const title = document.createElementNS(svgNS, 'title');
                title.textContent = `${months[i]}: ${val}`;
                circle.appendChild(title);
                svg.appendChild(circle);

                const pointLabel = document.createElementNS(svgNS, 'text');
                pointLabel.setAttribute('class', 'point-label');
                pointLabel.setAttribute('x', x(i));
                pointLabel.setAttribute('y', pointY - 12);
                pointLabel.textContent = val.toFixed(1);
                svg.appendChild(pointLabel);
            });

            months.forEach((month, i) => {
                const label = document.createElementNS(svgNS, 'text');
                label.setAttribute('class', 'month-label');
                label.setAttribute('x', x(i));
                label.setAttribute('y', 255);
                label.textContent = month;
                svg.appendChild(label);
            });

            const chartTitle = document.createElement('div');
            chartTitle.className = 'chart-title';
            chartTitle.textContent = `Індекс інфляції за ${year} рік`;

            chartWrapper.appendChild(svg);
            chartWrapper.appendChild(chartTitle);
            chartContainer.appendChild(chartWrapper);
        };

        const createCumulativeChart = (year) => {
            const yearData = iifData[year].slice(0, 12);
            const months = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

            const cumulativeData = [];
            let currentValue = 100.0;
            yearData.forEach(val => {
                if (val !== null) {
                    currentValue *= (val / 100);
                }
                cumulativeData.push(val !== null ? currentValue : null);
            });

            cumulativeChartContainer.innerHTML = '';
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'chart-wrapper';

            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute('class', 'line-chart');
            svg.setAttribute('viewBox', '0 0 550 280');
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

            const validData = cumulativeData.filter(v => v !== null);
            const dataMax = Math.max(...validData, 100);
            const dataMin = 100;
            const verticalPadding = Math.max(5, (dataMax - dataMin) * 0.1);
            const viewMax = dataMax + verticalPadding;
            const viewMin = 95;
            const range = viewMax - viewMin;

            const y = (val) => 240 - ((val - viewMin) / range * 210);
            const xStep = 480 / 12;
            const x = (index) => 40 + (index * xStep) + (xStep / 2);

            const yAxis = document.createElementNS(svgNS, 'line');
            yAxis.setAttribute('class', 'axis-line');
            yAxis.setAttribute('x1', '40'); yAxis.setAttribute('y1', '10');
            yAxis.setAttribute('x2', '40'); yAxis.setAttribute('y2', '240');
            svg.appendChild(yAxis);

            const tickValues = [100];
            for (let i = 110; i < viewMax; i += 10) {
                tickValues.push(Math.round(i/10)*10);
            }
            const uniqueTicks = [...new Set(tickValues)];

            uniqueTicks.forEach(labelValue => {
                if (labelValue >= viewMin && labelValue <= viewMax) {
                    const lineY = y(labelValue);
                    const gridLine = document.createElementNS(svgNS, 'line');
                    gridLine.setAttribute('class', labelValue === 100 ? 'baseline' : 'grid-line');
                    gridLine.setAttribute('x1', 40); gridLine.setAttribute('y1', lineY);
                    gridLine.setAttribute('x2', 520); gridLine.setAttribute('y2', lineY);
                    svg.appendChild(gridLine);
                    const label = document.createElementNS(svgNS, 'text');
                    label.setAttribute('class', 'axis-label');
                    label.setAttribute('x', 35); label.setAttribute('y', lineY + 4);
                    label.textContent = labelValue;
                    svg.appendChild(label);
                }
            });

            const points = cumulativeData.map((val, i) => val !== null ? `${x(i)},${y(val)}` : null).filter(Boolean);
            if (points.length > 0) {
                const polyline = document.createElementNS(svgNS, 'polyline');
                polyline.setAttribute('class', 'chart-line');
                polyline.setAttribute('points', `40,${y(100)} ` + points.join(' '));
                svg.appendChild(polyline);
            }

            cumulativeData.forEach((val, i) => {
                if (val === null) return;
                const pointY = y(val);
                const circle = document.createElementNS(svgNS, 'circle');
                circle.setAttribute('class', `chart-point ${val >= 100 ? 'positive' : 'negative'}`);
                circle.setAttribute('cx', x(i));
                circle.setAttribute('cy', pointY);
                circle.setAttribute('r', 4);
                const title = document.createElementNS(svgNS, 'title');
                title.textContent = `${months[i]}: ${val.toFixed(2)}`;
                circle.appendChild(title);
                svg.appendChild(circle);

                // --- ДОДАНО: числові значення над точками ---
                const pointLabel = document.createElementNS(svgNS, 'text');
                pointLabel.setAttribute('class', 'point-label');
                pointLabel.setAttribute('x', x(i));
                pointLabel.setAttribute('y', pointY - 12);
                pointLabel.textContent = val.toFixed(1);
                svg.appendChild(pointLabel);
            });

            months.forEach((month, i) => {
                const label = document.createElementNS(svgNS, 'text');
                label.setAttribute('class', 'month-label');
                label.setAttribute('x', x(i));
                label.setAttribute('y', 255);
                label.textContent = month;
                svg.appendChild(label);
            });

            const chartTitle = document.createElement('div');
            chartTitle.className = 'chart-title';
            chartTitle.textContent = `Зростання цін за ${year} рік у відсотках(поч. 100)`;
            chartWrapper.appendChild(svg);
            chartWrapper.appendChild(chartTitle);
            cumulativeChartContainer.appendChild(chartWrapper);
        };


        const handleYearClick = (year) => {
            if (isTransitionLocked) return;

            document.querySelectorAll('.year-cell.active').forEach(cell => cell.classList.remove('active'));

            if (currentYear === year) {
                modalOverlay.classList.remove('chart-view-active');
                currentYear = null;
            } else {
                if (currentYear !== null) {
                    isTransitionLocked = true;
                    setTimeout(() => { isTransitionLocked = false; }, 200);
                }

                document.querySelector(`.year-cell[data-year="${year}"]`).classList.add('active');
                createChart(year);
                createCumulativeChart(year);
                currentYear = year;
                modalOverlay.classList.add('chart-view-active');
            }
        };

        const openModal = async () => {
            if (!tableElement) {
                await createIifTable();
            }
            document.documentElement.classList.add('modal-open');
            document.body.classList.add('modal-open');
            modalOverlay.classList.add('visible');
        };

        const closeModal = () => {
            document.documentElement.classList.remove('modal-open');
            document.body.classList.remove('modal-open');
            modalOverlay.classList.remove('visible');
            modalOverlay.classList.remove('chart-view-active');
            currentYear = null;
            document.querySelectorAll('.year-cell.active').forEach(cell => cell.classList.remove('active'));
        };

        if (docsGrid) {
            docsGrid.addEventListener('click', (event) => {
                const featureBlock = event.target.closest('a.feature-block');
                if (featureBlock) {
                    const docId = featureBlock.getAttribute('data-doc-id');
                    const docType = featureBlock.getAttribute('data-doc-type');

                    if (docId && docType === 'modal') {
                        event.preventDefault();
                        // Пошук конфігурації документа в новій структурі
                        for (const category in window.docsByCategories) {
                            const doc = window.docsByCategories[category].find(d => d.id === docId);
                            if (doc) {
                                openGenericModal(doc);
                                break;
                            }
                        }
                    } else if (featureBlock.getAttribute('href') === '#vs-container') {
                        event.preventDefault();
                        openVsModal();
                    } else if (featureBlock.getAttribute('href') === '#iif-container') {
                        event.preventDefault();
                        openModal();
                    }
                }
            });
        }

        if (tableWrapper) {
            tableWrapper.addEventListener('click', (event) => {
                if (event.target.classList.contains('year-cell')) {
                    handleYearClick(event.target.dataset.year);
                }
            });
        }

        if(closeButton) closeButton.addEventListener('click', closeModal);
        if(modalOverlay) modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) {
                closeModal();
            }
        });
    }
});